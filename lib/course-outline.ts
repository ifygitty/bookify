import { z } from "zod";

export const MAX_OUTLINE_TOPICS = 80;
export const MAX_OUTLINE_SUBTOPICS = 20;
export const MAX_OUTLINE_MATERIALS = 30;
export const MAX_OUTLINE_TOPIC_NAME_LENGTH = 160;
export const MAX_OUTLINE_DESCRIPTION_LENGTH = 800;

export const outlineStudyStatusSchema = z.enum(["not_started", "in_progress", "completed"]);
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i).transform((id) => id.toLowerCase());

export const generatedCourseOutlineSchema = z.object({
    sufficientContent: z.boolean(),
    limitation: z.string().max(1_000),
    topics: z.array(z.object({
        name: z.string().trim().min(1).max(MAX_OUTLINE_TOPIC_NAME_LENGTH),
        description: z.string().trim().max(MAX_OUTLINE_DESCRIPTION_LENGTH),
        sourceKeys: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
        subtopics: z.array(z.object({
            name: z.string().trim().min(1).max(MAX_OUTLINE_TOPIC_NAME_LENGTH),
            description: z.string().trim().max(MAX_OUTLINE_DESCRIPTION_LENGTH),
            sourceKeys: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
        })).max(MAX_OUTLINE_SUBTOPICS),
    })).max(MAX_OUTLINE_TOPICS),
});

export const editableOutlineSchema = z.object({
    topics: z.array(z.object({
        id: objectIdSchema,
        name: z.string().trim().min(1).max(MAX_OUTLINE_TOPIC_NAME_LENGTH),
        description: z.string().trim().max(MAX_OUTLINE_DESCRIPTION_LENGTH),
        status: outlineStudyStatusSchema,
        materialIds: z.array(objectIdSchema).max(MAX_OUTLINE_MATERIALS),
        subtopics: z.array(z.object({
            id: objectIdSchema,
            name: z.string().trim().min(1).max(MAX_OUTLINE_TOPIC_NAME_LENGTH),
            description: z.string().trim().max(MAX_OUTLINE_DESCRIPTION_LENGTH),
            materialIds: z.array(objectIdSchema).max(MAX_OUTLINE_MATERIALS),
        })).max(MAX_OUTLINE_SUBTOPICS),
    })).max(MAX_OUTLINE_TOPICS),
});

export type EditableOutlineTopic = z.infer<typeof editableOutlineSchema>["topics"][number];
export type OutlineMaterialSnapshot = { id: string; title: string; retrieved: boolean };
export type MappedOutlineTopic = {
    name: string;
    description: string;
    materialIds: string[];
    subtopics: { name: string; description: string; materialIds: string[] }[];
};

function normalizeName(value: string) {
    return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
    return [...new Set(values)];
}

export function mapGeneratedOutline(
    topics: z.infer<typeof generatedCourseOutlineSchema>["topics"],
    retrievedSources: readonly { key: string; id: string }[],
):
    | { valid: true; topics: MappedOutlineTopic[] }
    | { valid: false; reason: string } {
    const sourceByKey = new Map(retrievedSources.map((source) => [source.key.toUpperCase(), source.id]));
    const resolved = topics.map((topic, topicIndex) => {
        const materialIds = topic.sourceKeys.map((key) => sourceByKey.get(key.toUpperCase()));
        if (materialIds.length === 0 || materialIds.some((id) => !id)) {
            return { valid: false as const, reason: `Topic ${topicIndex + 1} cited a source that was not retrieved.` };
        }
        const subtopics: MappedOutlineTopic["subtopics"] = [];
        for (const [subtopicIndex, subtopic] of topic.subtopics.entries()) {
            const subtopicMaterialIds = subtopic.sourceKeys.map((key) => sourceByKey.get(key.toUpperCase()));
            if (subtopicMaterialIds.length === 0 || subtopicMaterialIds.some((id) => !id)) {
                return {
                    valid: false as const,
                    reason: `Subtopic ${subtopicIndex + 1} in topic ${topicIndex + 1} cited a source that was not retrieved.`,
                };
            }
            subtopics.push({
                name: subtopic.name.trim(),
                description: subtopic.description.trim(),
                materialIds: unique(subtopicMaterialIds.filter((id): id is string => Boolean(id))),
            });
        }
        return {
            valid: true as const,
            topic: {
                name: topic.name.trim(),
                description: topic.description.trim(),
                materialIds: unique(materialIds.filter((id): id is string => Boolean(id))),
                subtopics,
            },
        };
    });
    const invalid = resolved.find((item) => !item.valid);
    if (invalid && !invalid.valid) return invalid;

    const merged = new Map<string, MappedOutlineTopic>();
    for (const item of resolved) {
        if (!item.valid) continue;
        const key = normalizeName(item.topic.name);
        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, item.topic);
            continue;
        }
        existing.materialIds = unique([...existing.materialIds, ...item.topic.materialIds]);
        if (!existing.description && item.topic.description) existing.description = item.topic.description;
        for (const subtopic of item.topic.subtopics) {
            const subtopicKey = normalizeName(subtopic.name);
            const existingSubtopic = existing.subtopics.find(
                (candidate) => normalizeName(candidate.name) === subtopicKey,
            );
            if (!existingSubtopic) {
                existing.subtopics.push(subtopic);
            } else {
                existingSubtopic.materialIds = unique([
                    ...existingSubtopic.materialIds,
                    ...subtopic.materialIds,
                ]);
                if (!existingSubtopic.description && subtopic.description) {
                    existingSubtopic.description = subtopic.description;
                }
            }
        }
    }

    if (merged.size === 0) {
        return { valid: false, reason: "The generated outline did not contain any supported topics." };
    }
    const mappedTopics = [...merged.values()];
    if (mappedTopics.length > MAX_OUTLINE_TOPICS || mappedTopics.some((topic) => topic.subtopics.length > MAX_OUTLINE_SUBTOPICS)) {
        return { valid: false, reason: "The generated outline exceeded the supported topic structure. Try generating it again." };
    }
    return { valid: true, topics: mappedTopics };
}

export function calculateOutlineCoverage(topics: readonly { status: string }[]) {
    const completed = topics.filter((topic) => topic.status === "completed").length;
    const inProgress = topics.filter((topic) => topic.status === "in_progress").length;
    const notStarted = topics.length - completed - inProgress;
    return {
        totalTopics: topics.length,
        completed,
        inProgress,
        notStarted,
        coveragePercent: topics.length === 0 ? null : Math.round((completed / topics.length) * 100),
    };
}
