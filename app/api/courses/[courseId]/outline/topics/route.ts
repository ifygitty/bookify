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
import { serializeCourseOutline } from "@/lib/course-outline-api";
import { editableOutlineSchema, MAX_OUTLINE_MATERIALS } from "@/lib/course-outline";

type RouteContext = { params: Promise<{ courseId: string }> };

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

export async function PATCH(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Sign in to edit this course outline." }, { status: 401 });
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
    const requestSchema = z.object({
        expectedUpdatedAt: z.string().datetime(),
        topics: editableOutlineSchema.shape.topics,
    });
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "One or more outline changes are invalid." }, { status: 400 });
    }
    const topics: CourseOutlineTopicRecord[] = parsed.data.topics.map((topic, order) => ({
        ...topic,
        order,
        materialIds: [...new Set(topic.materialIds)],
        subtopics: topic.subtopics.map((subtopic, subtopicOrder) => ({
            ...subtopic,
            order: subtopicOrder,
            materialIds: [...new Set(subtopic.materialIds)],
        })),
    }));
    if (!uniqueTopicIds(topics)) {
        return NextResponse.json({ error: "Outline topic identifiers must be unique." }, { status: 400 });
    }
    if (topics.some((topic) =>
        topic.materialIds.length > MAX_OUTLINE_MATERIALS ||
        topic.subtopics.some((subtopic) => subtopic.materialIds.length > MAX_OUTLINE_MATERIALS),
    )) {
        return NextResponse.json({ error: "A topic cannot reference more than 30 materials." }, { status: 400 });
    }

    try {
        await connectToDatabase();
        const course = await Course.findOne({ _id: courseId, clerkId: userId });
        if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
        const outline = await CourseOutline.findOne({
            clerkId: userId,
            courseId: course._id,
        });
        if (!outline) return NextResponse.json({ error: "Create an outline before editing topics." }, { status: 404 });
        const expectedUpdatedAt = new Date(parsed.data.expectedUpdatedAt);
        if (outline.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
            return NextResponse.json({ error: "This outline changed elsewhere. Reload it before saving your edits." }, { status: 409 });
        }

        const currentMaterials = new Map(
            (course.materials as CourseMaterialRecord[]).map((material) => [
                material._id.toString(),
                material,
            ]),
        );
        const previousSources = new Map(
            (outline.materialSources as CourseOutlineRecord["materialSources"]).map((source) => [
                source.id,
                source,
            ]),
        );
        const referencedIds = new Set(topics.flatMap((topic) => [
            ...topic.materialIds,
            ...topic.subtopics.flatMap((subtopic) => subtopic.materialIds),
        ]));
        for (const id of referencedIds) {
            if (!currentMaterials.has(id) && !previousSources.has(id)) {
                return NextResponse.json({ error: "One or more source materials are not part of this course." }, { status: 404 });
            }
        }
        const sourceIds = new Set([...previousSources.keys(), ...referencedIds]);
        const materialSources = [...sourceIds].map((id) => {
            const current = currentMaterials.get(id);
            const previous = previousSources.get(id);
            return {
                id,
                title: current?.title ?? previous?.title ?? "Unavailable course material",
                retrieved: previous?.retrieved ?? false,
            };
        });

        const saved = await CourseOutline.findOneAndUpdate(
            {
                _id: outline._id,
                clerkId: userId,
                courseId: course._id,
                updatedAt: expectedUpdatedAt,
            },
            { $set: { topics, materialSources } },
            { new: true, runValidators: true },
        );
        if (!saved) {
            return NextResponse.json({ error: "This outline changed before your edits could be saved. Reload and try again." }, { status: 409 });
        }
        return NextResponse.json({
            outline: serializeCourseOutline(
                saved.toObject() as CourseOutlineRecord,
                course.materials as CourseMaterialRecord[],
            ),
        });
    } catch (error) {
        console.error("Failed to save course outline topic edits:", error);
        return NextResponse.json({ error: "Could not save your outline changes." }, { status: 500 });
    }
}
