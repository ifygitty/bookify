import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { toFile } from "openai/uploads";
import { connectToDatabase } from "@/database/mongoose";
import Course, { type CourseMaterialRecord } from "@/database/models/course.model";
import { getOpenAIClient } from "@/lib/openai";
import { extractPdfVisualContent } from "@/lib/pdf-visual-content";

export const maxDuration = 180;

function isNotFoundError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

async function removeOpenAIFile(fileId: string, vectorStoreId: string) {
    const openai = getOpenAIClient();
    try {
        await openai.vectorStores.files.delete(fileId, { vector_store_id: vectorStoreId });
    } catch (error) {
        if (!isNotFoundError(error)) throw error;
    }
    try {
        await openai.files.delete(fileId);
    } catch (error) {
        if (!isNotFoundError(error)) throw error;
    }
}

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ courseId: string; materialId: string }> },
) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Sign in to analyze this material." }, { status: 401 });
    }

    const { courseId, materialId } = await params;
    if (!Types.ObjectId.isValid(courseId) || !Types.ObjectId.isValid(materialId)) {
        return NextResponse.json({ error: "Invalid course material." }, { status: 400 });
    }

    let newVisualFileId: string | undefined;
    let vectorStoreId: string | undefined;
    let course: Awaited<ReturnType<typeof Course.findOne>> | null = null;
    let material: CourseMaterialRecord | undefined;

    try {
        await connectToDatabase();
        course = await Course.findOne({ _id: courseId, clerkId: userId });
        material = course?.materials.find(
            (item: CourseMaterialRecord) => item._id.toString() === materialId,
        );
        if (!course || !material) {
            return NextResponse.json({ error: "Course material not found." }, { status: 404 });
        }
        if (material.contentType !== "application/pdf") {
            return NextResponse.json({ error: "Visual analysis is available for PDF materials only." }, { status: 400 });
        }

        const status = material.visualProcessingStatus ?? "not-needed";
        const startedAt = material.visualProcessingStartedAt;
        if (!["failed", "processing"].includes(status)) {
            return NextResponse.json({ error: "This PDF does not need visual analysis." }, { status: 409 });
        }
        if (
            status === "processing" &&
            startedAt &&
            Date.now() - startedAt.getTime() < 3 * 60 * 1000
        ) {
            return NextResponse.json(
                { status: "processing", message: "Visual analysis is still in progress." },
                { status: 202 },
            );
        }

        const openai = getOpenAIClient();
        const lockTime = new Date();
        const materialLockFilter: Record<string, unknown> = {
            _id: material._id,
            visualProcessingStatus: status,
        };
        if (startedAt) materialLockFilter.visualProcessingStartedAt = startedAt;
        const lockFilter = {
            _id: course._id,
            clerkId: userId,
            materials: { $elemMatch: materialLockFilter },
        };
        const locked = await Course.updateOne(
            lockFilter,
            {
                $set: {
                    "materials.$.visualProcessingStatus": "processing",
                    "materials.$.visualProcessingStartedAt": lockTime,
                    "materials.$.visualProcessingMessage": "",
                },
            },
        );
        if (locked.modifiedCount !== 1) {
            return NextResponse.json(
                { status: "processing", message: "Visual analysis has already started." },
                { status: 202 },
            );
        }

        vectorStoreId = course.vectorStoreId;
        const pdf = await openai.files.content(material.openAIFileId);
        if (!pdf.ok || !pdf.body) {
            throw new Error("The stored PDF could not be opened.");
        }
        const pdfBuffer = Buffer.from(await new Response(pdf.body).arrayBuffer());
        const extraction = await extractPdfVisualContent(pdfBuffer, openai);
        const processingStatus =
            extraction.skippedPageCount > 0
                ? "partial"
                : extraction.analyzedPageCount > 0
                  ? "complete"
                  : "not-needed";
        const processingMessage = extraction.skippedPageCount > 0
            ? `Visual analysis covered ${extraction.analyzedPageCount} pages. ${extraction.skippedPageCount} pages were not analyzed because this document reached the processing limit.`
            : "";

        if (extraction.text) {
            const visualFile = await openai.files.create({
                file: await toFile(
                    Buffer.from(extraction.text, "utf8"),
                    `${material.title}-visual-notes.txt`,
                    { type: "text/plain" },
                ),
                purpose: "assistants",
            });
            newVisualFileId = visualFile.id;

            const indexed = await openai.vectorStores.files.createAndPoll(course.vectorStoreId, {
                file_id: visualFile.id,
                attributes: { material_id: material._id.toString() },
            });
            if (indexed.status !== "completed") {
                throw new Error(indexed.last_error?.message || "Visual notes could not be indexed.");
            }
        }

        const previousVisualFileId = material.visualOpenAIFileId;
        const finalUpdate = newVisualFileId
            ? {
                  $set: {
                      "materials.$.visualOpenAIFileId": newVisualFileId,
                      "materials.$.visualProcessingStatus": processingStatus,
                      "materials.$.visualProcessingMessage": processingMessage,
                  },
              }
            : {
                  $set: {
                      "materials.$.visualProcessingStatus": processingStatus,
                      "materials.$.visualProcessingMessage": processingMessage,
                  },
                  $unset: { "materials.$.visualOpenAIFileId": "" },
              };
        const saved = await Course.updateOne(
            { _id: course._id, clerkId: userId, "materials._id": material._id },
            finalUpdate,
        );
        if (saved.matchedCount !== 1) {
            throw new Error("The course material changed during visual analysis.");
        }

        if (previousVisualFileId && previousVisualFileId !== newVisualFileId) {
            try {
                await removeOpenAIFile(previousVisualFileId, course.vectorStoreId);
            } catch (cleanupError) {
                console.error("Could not remove the previous visual-analysis index:", cleanupError);
            }
        }

        return NextResponse.json({
            status: processingStatus,
            message: processingMessage,
        });
    } catch (error) {
        console.error("PDF visual-analysis retry failed:", error);
        if (newVisualFileId && vectorStoreId) {
            try {
                await removeOpenAIFile(newVisualFileId, vectorStoreId);
            } catch (cleanupError) {
                console.error("Could not clean up the failed visual-analysis file:", cleanupError);
            }
        }
        if (course && material) {
            await Course.updateOne(
                { _id: course._id, clerkId: userId, "materials._id": material._id },
                {
                    $set: {
                        "materials.$.visualProcessingStatus": "failed",
                        "materials.$.visualProcessingMessage":
                            "The PDF text is available, but visual analysis could not be completed. Retry the analysis or check that the PDF is readable.",
                    },
                },
            );
        }
        return NextResponse.json(
            { error: "Mentor could not finish analyzing the visual content. You can retry from the material list." },
            { status: 502 },
        );
    }
}
