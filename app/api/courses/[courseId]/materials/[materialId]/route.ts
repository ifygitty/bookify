import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { del, get } from "@vercel/blob";
import { connectToDatabase } from "@/database/mongoose";
import Course, { type CourseMaterialRecord } from "@/database/models/course.model";
import CourseChatMessage from "@/database/models/course-chat-message.model";
import Flashcard from "@/database/models/flashcard.model";
import FlashcardGeneration from "@/database/models/flashcard-generation.model";
import { getOpenAIClient } from "@/lib/openai";
import { getBlobReadWriteToken } from "@/lib/blob";

function isNotFoundError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ courseId: string; materialId: string }> },
) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Sign in to view this material." }, { status: 401 });
    }

    const { courseId, materialId } = await params;
    if (!Types.ObjectId.isValid(courseId) || !Types.ObjectId.isValid(materialId)) {
        return NextResponse.json({ error: "Invalid course material." }, { status: 400 });
    }

    try {
        await connectToDatabase();
        const course = await Course.findOne({ _id: courseId, clerkId: userId });
        const material = course?.materials.find((item: CourseMaterialRecord) => item._id.toString() === materialId);

        if (!course || !material) {
            return NextResponse.json({ error: "Course material not found." }, { status: 404 });
        }

        if (material.originalBlobPathname) {
            const token = getBlobReadWriteToken();
            if (!token) {
                throw new Error("Vercel Blob storage is not configured.");
            }

            const original = await get(material.originalBlobPathname, {
                access: "private",
                token,
                useCache: false,
            });
            if (!original || original.statusCode !== 200) {
                return NextResponse.json({ error: "Could not download this material right now." }, { status: 502 });
            }

            const filename = material.originalFileName ?? `${material.title}.docx`;
            return new NextResponse(original.stream, {
                headers: {
                    "Content-Type": material.contentType ?? "application/octet-stream",
                    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
                    "Cache-Control": "private, no-store",
                    "X-Content-Type-Options": "nosniff",
                },
            });
        }

        const pdf = await getOpenAIClient().files.content(material.openAIFileId);
        if (!pdf.ok || !pdf.body) {
            console.error("OpenAI did not return the requested course PDF.", {
                courseId,
                materialId,
                status: pdf.status,
            });
            return NextResponse.json({ error: "Could not open this PDF right now." }, { status: 502 });
        }

        return new NextResponse(pdf.body, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(material.originalFileName ?? `${material.title}.pdf`)}`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        console.error("Failed to open course material:", error);
        const isConfigurationError =
            error instanceof Error &&
            (error.message.includes("OPENAI_API_KEY") ||
                error.message.includes("Vercel Blob storage is not configured"));
        const status = isConfigurationError ? 503 : 502;
        return NextResponse.json(
            {
                error:
                    error instanceof Error && error.message.includes("OPENAI_API_KEY")
                        ? "Add OPENAI_API_KEY to .env.local and restart the app."
                        : isConfigurationError
                          ? "Configure the private Vercel Blob token and restart the app."
                          : "Could not open this material right now.",
            },
            { status },
        );
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ courseId: string; materialId: string }> },
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Sign in to delete this material." }, { status: 401 });
    }

    const { courseId, materialId } = await params;
    if (!Types.ObjectId.isValid(courseId) || !Types.ObjectId.isValid(materialId)) {
        return NextResponse.json({ error: "Invalid course material." }, { status: 400 });
    }

    try {
        await connectToDatabase();
        const course = await Course.findOne({ _id: courseId, clerkId: userId });
        const material = course?.materials.find(
            (item: CourseMaterialRecord) => item._id.toString() === materialId,
        );
        if (!course || !material) {
            return NextResponse.json({ error: "Course material not found." }, { status: 404 });
        }

        const blobToken = getBlobReadWriteToken();
        if (material.originalBlobPathname && !blobToken) {
            return NextResponse.json(
                { error: "Private file storage is not configured, so this material cannot be fully deleted yet." },
                { status: 503 },
            );
        }

        const openai = getOpenAIClient();
        const openAIFileIds = [material.openAIFileId, material.visualOpenAIFileId].filter(
            (fileId): fileId is string => Boolean(fileId),
        );
        for (const fileId of openAIFileIds) {
            try {
                await openai.vectorStores.files.delete(fileId, {
                    vector_store_id: course.vectorStoreId,
                });
            } catch (error) {
                if (!isNotFoundError(error)) throw error;
            }
            try {
                await openai.files.delete(fileId);
            } catch (error) {
                if (!isNotFoundError(error)) throw error;
            }
        }
        if (material.originalBlobPathname && blobToken) {
            await del(material.originalBlobPathname, { token: blobToken });
        }

        await CourseChatMessage.deleteMany({
            clerkId: userId,
            courseId: course._id,
            $or: [
                { materialId: material._id },
                { materialIds: material._id },
            ],
        });

        const update = await Course.updateOne(
            { _id: course._id, clerkId: userId },
            { $pull: { materials: { _id: material._id } } },
        );
        if (update.modifiedCount !== 1) {
            return NextResponse.json({ error: "Course material not found." }, { status: 404 });
        }

        await Promise.all([
            Flashcard.updateMany(
                {
                    clerkId: userId,
                    courseId: course._id,
                    "sourceMaterials.id": material._id.toString(),
                },
                { $set: { "sourceMaterials.$[source].available": false } },
                { arrayFilters: [{ "source.id": material._id.toString() }] },
            ),
            FlashcardGeneration.updateMany(
                {
                    clerkId: userId,
                    courseId: course._id,
                    "previewCards.sourceMaterials.id": material._id.toString(),
                },
                { $set: { "previewCards.$[].sourceMaterials.$[source].available": false } },
                { arrayFilters: [{ "source.id": material._id.toString() }] },
            ),
        ]);

        return NextResponse.json({ success: true, materialId });
    } catch (error) {
        console.error("Failed to delete course material:", error);
        const isConfigurationError =
            error instanceof Error &&
            (error.message.includes("OPENAI_API_KEY") || error.message.includes("Blob storage is not configured"));
        return NextResponse.json(
            {
                error: isConfigurationError
                    ? error.message
                    : "Could not fully delete this material. It remains in the course; retry the delete or contact support if it continues.",
            },
            { status: isConfigurationError ? 503 : 502 },
        );
    }
}
