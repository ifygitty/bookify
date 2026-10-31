import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import Course, { type CourseMaterialRecord } from "@/database/models/course.model";
import CourseOutline, {
    type CourseOutlineRecord,
    type CourseOutlineTopicRecord,
} from "@/database/models/course-outline.model";
import CourseOutlineDraft from "@/database/models/course-outline-draft.model";
import { serializeCourseOutline } from "@/lib/course-outline-api";
import { editableOutlineSchema, MAX_OUTLINE_MATERIALS } from "@/lib/course-outline";

type RouteContext = { params: Promise<{ courseId: string }> };

function isDuplicateKeyError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function uniqueTopicIds(topics: CourseOutlineTopicRecord[]) {
    const ids = new Set<string>();
    for (const topic of topics) {
        if (ids.has(topic.id)) return false;
        ids.add(topic.id);
        for (const subtopic of topic.subtopics) {
            if (ids.has(subtopic.id)) return false;
            ids.add(subtopic.id);
        }
    }
    return true;
}

function cleanTopics(
    topics: z.infer<typeof editableOutlineSchema>["topics"],
): CourseOutlineTopicRecord[] {
    return topics.map((topic, order) => ({
        ...topic,
        order,
        materialIds: [...new Set(topic.materialIds)],
        subtopics: topic.subtopics.map((subtopic, subtopicOrder) => ({
            ...subtopic,
            order: subtopicOrder,
            materialIds: [...new Set(subtopic.materialIds)],
        })),
    }));
}

export async function GET(_request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Sign in to view this course outline." }, { status: 401 });
    }
    const { courseId } = await params;
    if (!Types.ObjectId.isValid(courseId)) {
        return NextResponse.json({ error: "Invalid course." }, { status: 400 });
    }

    try {
        await connectToDatabase();
        const course = await Course.findOne({ _id: courseId, clerkId: userId })
            .select("_id materials._id materials.title")
            .lean();
        if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

        const outline = await CourseOutline.findOne({
            clerkId: userId,
            courseId: course._id,
        }).lean();
        return NextResponse.json({
            outline: serializeCourseOutline(
                outline as CourseOutlineRecord | null,
                course.materials as CourseMaterialRecord[],
            ),
        });
    } catch (error) {
        console.error("Failed to load course outline:", error);
        return NextResponse.json({ error: "Could not load this course outline." }, { status: 500 });
    }
}

export async function POST(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Sign in to create a course outline." }, { status: 401 });
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
    const topicsResult = editableOutlineSchema.safeParse(body);
    if (!topicsResult.success) {
        return NextResponse.json({ error: "One or more outline topics are invalid." }, { status: 400 });
    }
    const topics = cleanTopics(topicsResult.data.topics);
    if (!uniqueTopicIds(topics)) {
        return NextResponse.json({ error: "Outline topic identifiers must be unique." }, { status: 400 });
    }
    if (topics.some((topic) => topic.materialIds.length > MAX_OUTLINE_MATERIALS ||
        topic.subtopics.some((subtopic) => subtopic.materialIds.length > MAX_OUTLINE_MATERIALS))) {
        return NextResponse.json({ error: "A topic cannot reference more than 30 materials." }, { status: 400 });
    }

    try {
        await connectToDatabase();
        const course = await Course.findOne({ _id: courseId, clerkId: userId });
        if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
        const existing = await CourseOutline.exists({ clerkId: userId, courseId: course._id });
        if (existing) {
            return NextResponse.json({ error: "An outline already exists for this course." }, { status: 409 });
        }

        const materialMap = new Map(
            (course.materials as CourseMaterialRecord[]).map((material) => [
                material._id.toString(),
                material,
            ]),
        );
        const referencedIds = new Set(topics.flatMap((topic) => [
            ...topic.materialIds,
            ...topic.subtopics.flatMap((subtopic) => subtopic.materialIds),
        ]));
        if ([...referencedIds].some((id) => !materialMap.has(id))) {
            return NextResponse.json(
                { error: "One or more source materials are not part of this course." },
                { status: 404 },
            );
        }
        const materialSources = [...referencedIds].map((id) => {
            const material = materialMap.get(id)!;
            return { id, title: material.title, retrieved: false };
        });
        const outline = await CourseOutline.create({
            clerkId: userId,
            courseId: course._id,
            topics,
            materialSources,
            generationMaterials: [],
        });
        return NextResponse.json(
            {
                outline: serializeCourseOutline(
                    outline.toObject() as CourseOutlineRecord,
                    course.materials as CourseMaterialRecord[],
                ),
            },
            { status: 201 },
        );
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            return NextResponse.json({ error: "An outline already exists for this course." }, { status: 409 });
        }
        console.error("Failed to create a manual course outline:", error);
        return NextResponse.json({ error: "Could not create this course outline." }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Sign in to save this course outline." }, { status: 401 });
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
    const inputSchema = z.object({
        previewId: z.string().uuid(),
    });
    const input = inputSchema.safeParse(body);
    if (!input.success) {
        return NextResponse.json({ error: "The generated outline preview is invalid. Generate it again." }, { status: 400 });
    }

    try {
        await connectToDatabase();
        const course = await Course.findOne({ _id: courseId, clerkId: userId });
        if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
        const now = new Date();
        const draft = await CourseOutlineDraft.findOne({
            clerkId: userId,
            courseId: course._id,
            previewId: input.data.previewId,
            expiresAt: { $gt: now },
        });
        if (!draft) {
            return NextResponse.json({ error: "This outline preview has expired or was already saved. Generate it again." }, { status: 410 });
        }

        const existing = await CourseOutline.findOne({
            clerkId: userId,
            courseId: course._id,
        });
        if (draft.replaceExisting) {
            if (!existing || !draft.expectedUpdatedAt || existing.updatedAt.getTime() !== draft.expectedUpdatedAt.getTime()) {
                return NextResponse.json(
                    { error: "The saved outline changed while this replacement was being prepared. Reload it and try again." },
                    { status: 409 },
                );
            }
        } else if (existing) {
            return NextResponse.json({ error: "An outline already exists. Confirm replacement before saving a new one." }, { status: 409 });
        }

        const liveMaterials = new Map(
            (course.materials as CourseMaterialRecord[]).map((material) => [
                material._id.toString(),
                material,
            ]),
        );
        const generationMaterials = draft.selectedMaterials.map((snapshot) => ({
            id: snapshot.id,
            title: liveMaterials.get(snapshot.id)?.title ?? snapshot.title,
            retrieved: snapshot.retrieved,
        }));
        const generationMaterialIds = new Set(generationMaterials.map((material) => material.id));
        if (draft.topics.some((topic) =>
            [...topic.materialIds, ...topic.subtopics.flatMap((subtopic) => subtopic.materialIds)]
                .some((id) => !generationMaterialIds.has(id)),
        )) {
            return NextResponse.json({ error: "The generated outline included a source that was not selected." }, { status: 502 });
        }

        const previousTopicsByName = new Map(
            (existing?.topics ?? []).map((topic) => [
                topic.name.toLocaleLowerCase().replace(/\s+/g, " ").trim(),
                topic,
            ]),
        );
        const topics: CourseOutlineTopicRecord[] = draft.topics.map((topic, index) => {
            const previousTopic = previousTopicsByName.get(
                topic.name.toLocaleLowerCase().replace(/\s+/g, " ").trim(),
            );
            const previousSubtopics = new Map(
                (previousTopic?.subtopics ?? []).map((subtopic) => [
                    subtopic.name.toLocaleLowerCase().replace(/\s+/g, " ").trim(),
                    subtopic,
                ]),
            );
            return {
                id: previousTopic?.id ?? new Types.ObjectId().toString(),
                name: topic.name,
                description: topic.description,
                status: previousTopic?.status ?? "not_started",
                order: index,
                materialIds: topic.materialIds,
                subtopics: topic.subtopics.map((subtopic, subtopicIndex) => {
                    const previousSubtopic = previousSubtopics.get(
                        subtopic.name.toLocaleLowerCase().replace(/\s+/g, " ").trim(),
                    );
                    return {
                        id: previousSubtopic?.id ?? new Types.ObjectId().toString(),
                        name: subtopic.name,
                        description: subtopic.description,
                        order: subtopicIndex,
                        materialIds: subtopic.materialIds,
                    };
                }),
            };
        });
        const materialSources = new Map(
            generationMaterials.map((source) => [source.id, source]),
        );
        const outlineData = {
            clerkId: userId,
            courseId: course._id,
            topics,
            materialSources: [...materialSources.values()],
            generationMaterials,
            lastGeneratedAt: now,
        };
        let saved;
        if (existing) {
            saved = await CourseOutline.findOneAndUpdate(
                {
                    _id: existing._id,
                    clerkId: userId,
                    courseId: course._id,
                    updatedAt: draft.expectedUpdatedAt,
                },
                { $set: outlineData },
                { new: true, runValidators: true },
            );
            if (!saved) {
                return NextResponse.json({ error: "The outline changed before it could be saved. Reload and try again." }, { status: 409 });
            }
        } else {
            saved = await CourseOutline.create(outlineData);
        }
        try {
            await CourseOutlineDraft.deleteOne({ _id: draft._id, clerkId: userId });
        } catch (cleanupError) {
            console.error("Saved course outline, but failed to remove its temporary preview:", cleanupError);
        }
        return NextResponse.json({
            outline: serializeCourseOutline(
                saved.toObject() as CourseOutlineRecord,
                course.materials as CourseMaterialRecord[],
            ),
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            return NextResponse.json({ error: "An outline already exists for this course. Reload and try again." }, { status: 409 });
        }
        console.error("Failed to save generated course outline:", error);
        return NextResponse.json({ error: "Could not save this course outline." }, { status: 500 });
    }
}
