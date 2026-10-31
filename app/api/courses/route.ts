import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOpenAIClient } from "@/lib/openai";
import { connectToDatabase } from "@/database/mongoose";
import Course, { type CourseMaterialRecord } from "@/database/models/course.model";
import { generateSlug } from "@/lib/utils";

function getCourseName(body: unknown): string {
    return typeof body === "object" && body !== null && "name" in body && typeof body.name === "string"
        ? body.name.trim()
        : "";
}

export async function GET() {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Sign in to view your courses." }, { status: 401 });
    }

    try {
        await connectToDatabase();
        const courses = await Course.find({ clerkId: userId })
            .select("name slug materials._id materials.title materials.fileSize materials.createdAt createdAt")
            .sort({ createdAt: -1 })
            .lean();

        return NextResponse.json({
            courses: courses.map((course) => ({
                id: course._id.toString(),
                name: course.name,
                slug: course.slug,
                createdAt: course.createdAt,
                materials: course.materials.map((material: CourseMaterialRecord) => ({
                    id: material._id.toString(),
                    title: material.title,
                    fileSize: material.fileSize,
                    createdAt: material.createdAt,
                })),
            })),
        });
    } catch (error) {
        console.error("Failed to load courses:", error);
        return NextResponse.json({ error: "Could not load your courses." }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Sign in to create a course." }, { status: 401 });
    }

    let vectorStoreId: string | undefined;

    try {
        const body: unknown = await request.json();
        const name = getCourseName(body);

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

        await connectToDatabase();
        const existing = await Course.exists({ clerkId: userId, slug });
        if (existing) {
            return NextResponse.json(
                { error: "You already have a course with that name." },
                { status: 409 },
            );
        }

        const openai = getOpenAIClient();
        const vectorStore = await openai.vectorStores.create({ name: `Bookified course: ${name}` });
        vectorStoreId = vectorStore.id;

        const course = await Course.create({
            clerkId: userId,
            name,
            slug,
            vectorStoreId,
            materials: [],
        });

        return NextResponse.json(
            {
                course: {
                    id: course._id.toString(),
                    name: course.name,
                    slug: course.slug,
                    materials: [],
                },
            },
            { status: 201 },
        );
    } catch (error) {
        console.error("Failed to create course:", error);
        if (vectorStoreId) {
            try {
                await getOpenAIClient().vectorStores.delete(vectorStoreId);
            } catch (cleanupError) {
                console.error("Failed to clean up the unused OpenAI vector store:", cleanupError);
            }
        }

        const status = error instanceof Error && error.message.includes("OPENAI_API_KEY") ? 503 : 500;
        const message =
            status === 503
                ? "Add OPENAI_API_KEY to .env.local and restart the app to create a course."
                : "Could not create the course. Please try again.";
        return NextResponse.json({ error: message }, { status });
    }
}



