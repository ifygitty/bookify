import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { Types } from "mongoose";
import { connectToDatabase } from "@/database/mongoose";
import Course, { type CourseMaterialRecord } from "@/database/models/course.model";
import CourseChatMessage from "@/database/models/course-chat-message.model";
import CourseQuiz from "@/database/models/course-quiz.model";
import Flashcard from "@/database/models/flashcard.model";
import FlashcardDeck from "@/database/models/flashcard-deck.model";
import FlashcardGeneration from "@/database/models/flashcard-generation.model";
import FlashcardReview from "@/database/models/flashcard-review.model";
import CourseOutline from "@/database/models/course-outline.model";
import CourseOutlineDraft from "@/database/models/course-outline-draft.model";
import CourseOutlineGeneration from "@/database/models/course-outline-generation.model";
import RevisionPlan from "@/database/models/revision-plan.model";
import { getBlobReadWriteToken } from "@/lib/blob";
import { getOpenAIClient } from "@/lib/openai";
import { generateSlug } from "@/lib/utils";

type RouteContext = { params: Promise<{ courseId: string }> };

function isNotFoundError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

export async function PATCH(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Sign in to edit this course." }, { status: 401 });
    }

    const { courseId } = await params;
    if (!Types.ObjectId.isValid(courseId)) {
        return NextResponse.json({ error: "Invalid course." }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
    }
    const name =
        typeof body === "object" && body !== null && "name" in body && typeof body.name === "string"
            ? body.name.trim()
            : "";
    if (!name || name.length > 100) {
        return NextResponse.json(
            { error: "Enter a course name up to 100 characters long." },
            { status: 400 },
        );
    }

    const slug = generateSlug(name);
    if (!slug) {
        return NextResponse.json({ error: "Enter a valid course name." }, { status: 400 });
    }

    try {
        await connectToDatabase();
        const course = await Course.findOneAndUpdate(
            { _id: courseId, clerkId: userId },
            { $set: { name, slug } },
            { new: true, runValidators: true },
        ).select("_id name slug");

        if (!course) {
            return NextResponse.json({ error: "Course not found." }, { status: 404 });
        }
        return NextResponse.json({
            course: { id: course._id.toString(), name: course.name, slug: course.slug },
        });
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
            return NextResponse.json(
                { error: "You already have a course with that name." },
                { status: 409 },
            );
        }
        console.error("Failed to update course:", error);
        return NextResponse.json({ error: "Could not update the course. Please try again." }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Sign in to delete this course." }, { status: 401 });
    }

    const { courseId } = await params;
    if (!Types.ObjectId.isValid(courseId)) {
        return NextResponse.json({ error: "Invalid course." }, { status: 400 });
    }

    try {
        await connectToDatabase();
        const course = await Course.findOne({ _id: courseId, clerkId: userId });
        if (!course) {
            return NextResponse.json({ error: "Course not found." }, { status: 404 });
        }

        const hasPrivateOriginals = course.materials.some(
            (material: CourseMaterialRecord) => material.originalBlobPathname,
        );
        const blobToken = getBlobReadWriteToken();
        if (hasPrivateOriginals && !blobToken) {
            return NextResponse.json(
                { error: "Private file storage is not configured, so this course cannot be fully deleted yet." },
                { status: 503 },
            );
        }

        const openai = getOpenAIClient();
        for (const material of course.materials as CourseMaterialRecord[]) {
            try {
                await openai.vectorStores.files.delete(material.openAIFileId, {
                    vector_store_id: course.vectorStoreId,
                });
            } catch (error) {
                if (!isNotFoundError(error)) throw error;
            }
            try {
                await openai.files.delete(material.openAIFileId);
            } catch (error) {
                if (!isNotFoundError(error)) throw error;
            }
        }

        try {
            await openai.vectorStores.delete(course.vectorStoreId);
        } catch (error) {
            if (!isNotFoundError(error)) throw error;
        }

        const blobPathnames = (course.materials as CourseMaterialRecord[])
            .flatMap((material) => material.originalBlobPathname ? [material.originalBlobPathname] : []);
        if (blobPathnames.length > 0 && blobToken) {
            await del(blobPathnames, { token: blobToken });
        }

        await Promise.all([
            CourseChatMessage.deleteMany({ clerkId: userId, courseId: course._id }),
            CourseQuiz.deleteMany({ clerkId: userId, courseId: course._id }),
            FlashcardReview.deleteMany({ clerkId: userId, courseId: course._id }),
            Flashcard.deleteMany({ clerkId: userId, courseId: course._id }),
            FlashcardDeck.deleteMany({ clerkId: userId, courseId: course._id }),
            FlashcardGeneration.deleteMany({ clerkId: userId, courseId: course._id }),
            CourseOutline.deleteMany({ clerkId: userId, courseId: course._id }),
            CourseOutlineDraft.deleteMany({ clerkId: userId, courseId: course._id }),
            CourseOutlineGeneration.deleteMany({ clerkId: userId, courseId: course._id }),
            RevisionPlan.deleteMany({ clerkId: userId, courseId: course._id }),
        ]);
        const deletion = await Course.deleteOne({ _id: course._id, clerkId: userId });
        if (deletion.deletedCount !== 1) {
            return NextResponse.json({ error: "Course not found." }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete course and its materials:", error);
        const isConfigurationError =
            error instanceof Error &&
            (error.message.includes("OPENAI_API_KEY") || error.message.includes("Blob storage is not configured"));
        return NextResponse.json(
            {
                error: isConfigurationError
                    ? error.message
                    : "Could not fully delete this course and its materials. No course records were removed; retry the delete or contact support if it continues.",
            },
            { status: isConfigurationError ? 503 : 502 },
        );
    }
}
