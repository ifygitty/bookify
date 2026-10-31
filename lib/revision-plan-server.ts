import { Types } from "mongoose";
import Course, { type CourseMaterialRecord } from "@/database/models/course.model";
import CourseOutline from "@/database/models/course-outline.model";
import CourseQuiz from "@/database/models/course-quiz.model";
import Flashcard from "@/database/models/flashcard.model";
import FlashcardReview from "@/database/models/flashcard-review.model";
import type { RevisionPlanRecord } from "@/database/models/revision-plan.model";
import { buildStudyProgress } from "@/lib/study-progress";
import {
    calculatePlanProgress,
    daysBetween,
    generateSchedule,
    getStudyWindow,
    scoreTopics,
    validateScheduleWindow,
    type CompletedWork,
    type FlashcardTopicSignal,
    type PlanTopic,
    type QuizTopicSignal,
    type RevisionSettings,
    type TopicInsight,
} from "@/lib/revision-plan";

export type PlanningContext = {
    course: { id: string; name: string; materials: { id: string; title: string }[] };
    hasOutline: boolean;
    topics: (PlanTopic & { materialIds: string[] })[];
    quizSignals: QuizTopicSignal[];
    flashcardSignals: FlashcardTopicSignal[];
};

// Returns null when the course does not exist or is not owned by the user.
export async function loadPlanningContext(userId: string, courseId: string): Promise<PlanningContext | null> {
    const course = await Course.findOne({ _id: courseId, clerkId: userId }).lean();
    if (!course) return null;
    const courseObjectId = new Types.ObjectId(courseId);

    const [outline, quizzes, cards] = await Promise.all([
        CourseOutline.findOne({ clerkId: userId, courseId: courseObjectId }).lean(),
        CourseQuiz.find({ clerkId: userId, courseId: courseObjectId, status: "completed" })
            .select("courseId status scorePercent gradedQuestionCount questions.id questions.topic answers.questionId answers.correctness answers.scoreFraction submittedAt createdAt")
            .lean(),
        Flashcard.find({ clerkId: userId, courseId: courseObjectId }).select("_id topic schedule.dueAt").lean(),
    ]);

    const materials = ((course.materials ?? []) as CourseMaterialRecord[]).map((material) => ({
        id: material._id.toString(),
        title: material.title,
    }));
    const topics = [...(outline?.topics ?? [])]
        .sort((left, right) => left.order - right.order)
        .map((topic) => ({
            id: topic.id,
            name: topic.name,
            status: topic.status,
            order: topic.order,
            materialIds: topic.materialIds,
        }));

    const progress = buildStudyProgress(
        [{ id: courseId, name: course.name }],
        quizzes.map((quiz) => ({
            courseId,
            status: quiz.status,
            scorePercent: quiz.scorePercent,
            gradedQuestionCount: quiz.gradedQuestionCount,
            submittedAt: quiz.submittedAt,
            createdAt: quiz.createdAt,
            questions: quiz.questions.map((question) => ({ id: question.id, topic: question.topic })),
            answers: quiz.answers.map((answer) => ({
                questionId: answer.questionId,
                correctness: answer.correctness,
                scoreFraction: answer.scoreFraction,
            })),
        })),
        [],
        new Map(),
    );
    const quizSignals: QuizTopicSignal[] = (progress.courses[0]?.topics ?? []).map((topic) => ({
        name: topic.name,
        questionsAttempted: topic.questionsAttempted,
        accuracyPercent: topic.accuracyPercent,
        hasSufficientEvidence: topic.hasSufficientEvidence,
    }));

    const now = new Date();
    const cardsById = new Map<string, { topic: string; due: boolean }>();
    const byTopic = new Map<string, FlashcardTopicSignal>();
    for (const card of cards) {
        const topic = (card.topic ?? "").trim();
        if (!topic) continue;
        const due = Boolean(card.schedule?.dueAt && new Date(card.schedule.dueAt) <= now);
        cardsById.set(card._id.toString(), { topic, due });
        const entry = byTopic.get(topic) ?? {
            topic,
            cardCount: 0,
            dueCount: 0,
            reviewCount: 0,
            difficultReviewCount: 0,
        };
        entry.cardCount += 1;
        if (due) entry.dueCount += 1;
        byTopic.set(topic, entry);
    }
    if (cardsById.size > 0) {
        const reviews = await FlashcardReview.find({
            clerkId: userId,
            courseId: courseObjectId,
            cardId: { $in: [...cardsById.keys()].map((id) => new Types.ObjectId(id)) },
        })
            .select("cardId rating")
            .lean();
        for (const review of reviews) {
            const info = cardsById.get(review.cardId.toString());
            const entry = info ? byTopic.get(info.topic) : undefined;
            if (!entry) continue;
            entry.reviewCount += 1;
            if (review.rating === "again" || review.rating === "hard") entry.difficultReviewCount += 1;
        }
    }

    return {
        course: { id: courseId, name: course.name, materials },
        hasOutline: topics.length > 0,
        topics,
        quizSignals,
        flashcardSignals: [...byTopic.values()],
    };
}

export function buildInsights(context: PlanningContext, priorityTopicIds: string[]): TopicInsight[] {
    return scoreTopics(
        context.topics.map(({ id, name, status, order }) => ({ id, name, status, order })),
        context.quizSignals,
        context.flashcardSignals,
        priorityTopicIds,
    );
}

export function proposeSchedule(params: {
    context: PlanningContext;
    settings: RevisionSettings;
    today: string;
    completedWork?: CompletedWork[];
}) {
    const windowError = validateScheduleWindow(params.settings, params.today);
    if (windowError) return { ok: false as const, error: windowError };
    if (!params.context.hasOutline) {
        return { ok: false as const, error: "Create a course outline first. The planner schedules the topics in your outline." };
    }
    const unknown = params.settings.priorityTopicIds.filter(
        (id) => !params.context.topics.some((topic) => topic.id.toLowerCase() === id),
    );
    if (unknown.length > 0) {
        return { ok: false as const, error: "A prioritized topic is no longer in your course outline." };
    }
    const allInsights = buildInsights(params.context, params.settings.priorityTopicIds);
    // When the student selects topics, the plan covers only those topics; with no selection it covers the whole outline.
    const selected = new Set(params.settings.priorityTopicIds);
    const insights = selected.size > 0
        ? allInsights.filter((insight) => selected.has(insight.topicId.toLowerCase()))
        : allInsights;
    const schedule = generateSchedule({
        settings: params.settings,
        today: params.today,
        insights,
        completedWork: params.completedWork,
    });
    if (!schedule.ok) return { ok: false as const, error: schedule.error };
    return { ok: true as const, schedule, insights };
}

export function settingsFromPlan(plan: RevisionPlanRecord): RevisionSettings {
    return {
        title: plan.title,
        dateType: plan.dateType,
        targetDate: plan.targetDate,
        availability: plan.availability.map(({ weekday, minutes }) => ({ weekday, minutes })),
        priorityTopicIds: plan.priorityTopicIds,
    };
}

export function serializePlan(plan: RevisionPlanRecord, context: PlanningContext, today: string) {
    const topicById = new Map(context.topics.map((topic) => [topic.id, topic]));
    const materialById = new Map(context.course.materials.map((material) => [material.id, material]));
    const tasks = [...plan.tasks]
        .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate) || left.order - right.order)
        .map((task) => {
            const topic = topicById.get(task.topicId);
            return {
                id: task.id,
                topicId: task.topicId,
                topicName: topic?.name ?? task.topicName,
                topicAvailable: Boolean(topic),
                type: task.type,
                title: task.title,
                scheduledDate: task.scheduledDate,
                minutes: task.minutes,
                status: task.status,
                completedAt: task.completedAt?.toISOString() ?? null,
                overCapacity: Boolean(task.overCapacity),
                overdue: task.status === "pending" && task.scheduledDate < today,
                materials: (topic?.materialIds ?? []).flatMap((id) => {
                    const material = materialById.get(id);
                    return material ? [{ id: material.id, title: material.title }] : [];
                }),
            };
        });
    const window = getStudyWindow(settingsFromPlan(plan), plan.startDate);
    return {
        id: plan._id.toString(),
        title: plan.title,
        dateType: plan.dateType,
        targetDate: plan.targetDate,
        startDate: plan.startDate,
        lastStudyDate: window.lastDate,
        daysRemaining: Math.max(0, daysBetween(today, plan.targetDate)),
        availability: plan.availability.map(({ weekday, minutes }) => ({ weekday, minutes })),
        priorityTopicIds: plan.priorityTopicIds,
        shortfall: plan.shortfall,
        progress: calculatePlanProgress(tasks, today),
        tasks,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
    };
}

export function isValidId(value: string): boolean {
    return Types.ObjectId.isValid(value);
}
