import type { CourseMaterialRecord } from "@/database/models/course.model";
import type { CourseOutlineRecord } from "@/database/models/course-outline.model";
import { calculateOutlineCoverage } from "@/lib/course-outline";

type MaterialSnapshot = { id: string; title: string; retrieved: boolean };
type OutlineSource = { id: string; title: string; available: boolean };

function sourceView(
    id: string,
    snapshots: Map<string, MaterialSnapshot>,
    current: Map<string, CourseMaterialRecord>,
): OutlineSource {
    const material = current.get(id);
    return {
        id,
        title: material?.title ?? snapshots.get(id)?.title ?? "Unavailable course material",
        available: Boolean(material),
    };
}

export function serializeCourseOutline(
    outline: CourseOutlineRecord | null,
    materials: readonly CourseMaterialRecord[],
) {
    if (!outline) return null;
    const snapshotById = new Map(
        outline.materialSources.map((source) => [source.id, source]),
    );
    const currentById = new Map(
        materials.map((material) => [material._id.toString(), material]),
    );
    const serializeSource = (id: string) => sourceView(id, snapshotById, currentById);
    const topics = [...outline.topics]
        .sort((left, right) => left.order - right.order)
        .map((topic) => ({
            id: topic.id,
            name: topic.name,
            description: topic.description,
            status: topic.status,
            order: topic.order,
            materialIds: topic.materialIds,
            materials: topic.materialIds.map(serializeSource),
            subtopics: [...topic.subtopics]
                .sort((left, right) => left.order - right.order)
                .map((subtopic) => ({
                    id: subtopic.id,
                    name: subtopic.name,
                    description: subtopic.description,
                    order: subtopic.order,
                    materialIds: subtopic.materialIds,
                    materials: subtopic.materialIds.map(serializeSource),
                })),
        }));

    return {
        id: outline._id.toString(),
        topics,
        coverage: calculateOutlineCoverage(topics),
        generationMaterials: outline.generationMaterials.map((source) => ({
            ...source,
            available: currentById.has(source.id),
            title: currentById.get(source.id)?.title ?? source.title,
        })),
        lastGeneratedAt: outline.lastGeneratedAt?.toISOString() ?? null,
        createdAt: outline.createdAt.toISOString(),
        updatedAt: outline.updatedAt.toISOString(),
    };
}
