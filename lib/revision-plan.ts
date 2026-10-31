import { z } from "zod";

export const MIN_DAILY_MINUTES = 30;
export const MAX_DAILY_MINUTES = 480;
export const MAX_PLAN_DAYS = 366;
export const MAX_PLANS_PER_COURSE = 5;
export const MAX_PRIORITY_TOPICS = 20;

export type TaskType =
    | "study"
    | "review_materials"
    | "practice"
    | "quiz"
    | "flashcards"
    | "revise";

export const TASK_TYPES: readonly TaskType[] = [
    "study",
    "review_materials",
    "practice",
    "quiz",
    "flashcards",
    "revise",
];

// Fixed estimates keep scheduling deterministic. Every estimate is below MIN_DAILY_MINUTES so a task always fits on any selected day.
export const TASK_MINUTES: Record<TaskType, number> = {
    study: 30,
    review_materials: 25,
    practice: 25,
    quiz: 25,
    flashcards: 15,
    revise: 20,
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoDate(value: string): Date | null {
    if (!DATE_PATTERN.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
    const date = parseIsoDate(value);
    if (!date) throw new Error("Invalid date.");
    date.setUTCDate(date.getUTCDate() + days);
    return toIsoDate(date);
}

export function weekdayOf(value: string): number {
    const date = parseIsoDate(value);
    if (!date) throw new Error("Invalid date.");
    return date.getUTCDay();
}

export function daysBetween(from: string, to: string): number {
    const start = parseIsoDate(from);
    const end = parseIsoDate(to);
    if (!start || !end) throw new Error("Invalid date.");
    return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

// The student's local date is accepted only when it is within one day of the server's UTC date.
export function resolveToday(clientToday: unknown, now = new Date()): string {
    const serverToday = toIsoDate(now);
    if (typeof clientToday !== "string" || !parseIsoDate(clientToday)) return serverToday;
    return Math.abs(daysBetween(serverToday, clientToday)) <= 1 ? clientToday : serverToday;
}

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export const availabilitySchema = z
    .array(
        z.object({
            weekday: z.number().int().min(0).max(6),
            minutes: z
                .number()
                .int()
                .min(MIN_DAILY_MINUTES, `Study at least ${MIN_DAILY_MINUTES} minutes on each selected day.`)
                .max(MAX_DAILY_MINUTES, `Study at most ${MAX_DAILY_MINUTES} minutes on a day.`)
                .refine((minutes) => minutes % 5 === 0, "Use study times in 5-minute steps."),
        }),
    )
    .min(1, "Choose at least one study day.")
    .max(7)
    .refine(
        (items) => new Set(items.map((item) => item.weekday)).size === items.length,
        "Each weekday can only be listed once.",
    );

export const revisionSettingsSchema = z.object({
    title: z.string().trim().max(100).default(""),
    dateType: z.enum(["exam", "target"]),
    targetDate: z.string().refine((value) => parseIsoDate(value) !== null, "Enter a valid date."),
    availability: availabilitySchema,
    priorityTopicIds: z.array(objectIdSchema).max(MAX_PRIORITY_TOPICS).default([]),
});

export type RevisionSettings = z.infer<typeof revisionSettingsSchema>;

export function normalizeSettings(settings: RevisionSettings): RevisionSettings {
    return {
        title: settings.title.trim(),
        dateType: settings.dateType,
        targetDate: settings.targetDate,
        availability: [...settings.availability].sort((left, right) => left.weekday - right.weekday),
        priorityTopicIds: [...new Set(settings.priorityTopicIds.map((id) => id.toLowerCase()))],
    };
}

export function validateScheduleWindow(settings: RevisionSettings, today: string): string | null {
    if (settings.targetDate < today) {
        return settings.dateType === "exam"
            ? "The examination date cannot be in the past."
            : "The target date cannot be in the past.";
    }
    if (daysBetween(today, settings.targetDate) > MAX_PLAN_DAYS) {
        return `Choose a date within ${MAX_PLAN_DAYS} days from today.`;
    }
    return null;
}

// An examination date is never a study day; a target completion date is.
export function getStudyWindow(settings: RevisionSettings, today: string) {
    return {
        firstDate: today,
        lastDate: settings.dateType === "exam" ? addDays(settings.targetDate, -1) : settings.targetDate,
    };
}

export type StudySlot = { date: string; capacity: number; remaining: number };

export function buildStudySlots(
    settings: RevisionSettings,
    today: string,
    usedMinutesByDate: Map<string, number> = new Map(),
): StudySlot[] {
    const { firstDate, lastDate } = getStudyWindow(settings, today);
    const capacityByWeekday = new Map(settings.availability.map((item) => [item.weekday, item.minutes]));
    const slots: StudySlot[] = [];
    for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
        const capacity = capacityByWeekday.get(weekdayOf(date));
        if (capacity === undefined) continue;
        slots.push({
            date,
            capacity,
            remaining: Math.max(0, capacity - (usedMinutesByDate.get(date) ?? 0)),
        });
    }
    return slots;
}

export type PlanTopic = {
    id: string;
    name: string;
    status: "not_started" | "in_progress" | "completed";
    order: number;
};

export type QuizTopicSignal = {
    name: string;
    questionsAttempted: number;
    accuracyPercent: number | null;
    hasSufficientEvidence: boolean;
};

export type FlashcardTopicSignal = {
    topic: string;
    cardCount: number;
    dueCount: number;
    reviewCount: number;
    difficultReviewCount: number;
};

export type TopicInsight = {
    topicId: string;
    name: string;
    status: PlanTopic["status"];
    order: number;
    score: number;
    weak: boolean;
    strong: boolean;
    priority: boolean;
    hasFlashcards: boolean;
    flashcardsDue: number;
    flashcardsDifficult: boolean;
    quizEvidence: { questions: number; accuracyPercent: number | null } | null;
    reasons: string[];
};

export function normalizeTopicName(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

const STOP_WORDS = new Set(["the", "and", "of", "in", "to", "for", "a", "an", "on", "with", "or", "its", "their", "basics", "introduction", "overview"]);

function significantWords(normalized: string): Set<string> {
    return new Set(
        normalized
            .split(" ")
            .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
            .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word)),
    );
}

// Share of the smaller word set that appears in the other; requires at least two shared words unless the smaller set is a single word.
function wordOverlap(left: Set<string>, right: Set<string>): number {
    const smaller = Math.min(left.size, right.size);
    if (smaller === 0) return 0;
    const shared = [...left].filter((word) => right.has(word)).length;
    return shared >= Math.min(2, smaller) ? shared / smaller : 0;
}

// Quiz and flashcard topics are free text. Exact names always match; a phrase match is used only when it identifies one topic unambiguously.
export function matchSignals<T>(
    topics: { id: string; name: string }[],
    signals: T[],
    getName: (signal: T) => string,
): Map<string, T[]> {
    const normalizedTopics = topics.map((topic) => ({ id: topic.id, name: normalizeTopicName(topic.name) }));
    const result = new Map<string, T[]>();
    for (const signal of signals) {
        const name = normalizeTopicName(getName(signal));
        if (!name) continue;
        let matches = normalizedTopics.filter((topic) => topic.name === name);
        if (matches.length === 0) {
            const phraseMatches = normalizedTopics.filter((topic) => {
                if (!topic.name) return false;
                const [short, long] = topic.name.length <= name.length ? [topic.name, name] : [name, topic.name];
                return short.length >= 5 && ` ${long} `.includes(` ${short} `);
            });
            matches = phraseMatches.length === 1 ? phraseMatches : [];
        }
        if (matches.length === 0) {
            const signalWords = significantWords(name);
            const ranked = normalizedTopics
                .map((topic) => ({ topic, overlap: wordOverlap(signalWords, significantWords(topic.name)) }))
                .filter((item) => item.overlap >= 0.6)
                .sort((left, right) => right.overlap - left.overlap);
            if (ranked.length > 0 && (ranked.length === 1 || ranked[0].overlap > ranked[1].overlap)) {
                matches = [ranked[0].topic];
            }
        }
        for (const match of matches) {
            result.set(match.id, [...(result.get(match.id) ?? []), signal]);
        }
    }
    return result;
}

// Resolves one free-text topic (for example a quiz question's topic) to a single outline topic, or null when none matches unambiguously.
export function findOutlineTopicId(topics: { id: string; name: string }[], name: string): string | null {
    const matched = [...matchSignals(topics, [name], (value) => value).keys()];
    return matched.length === 1 ? matched[0] : null;
}

const STATUS_SCORE: Record<PlanTopic["status"], number> = {
    not_started: 30,
    in_progress: 20,
    completed: 5,
};
const STATUS_REASON: Record<PlanTopic["status"], string> = {
    not_started: "Not started yet",
    in_progress: "Marked in progress",
    completed: "Marked completed; scheduled for revision, not treated as mastered",
};

export function scoreTopics(
    topics: PlanTopic[],
    quizSignals: QuizTopicSignal[],
    flashcardSignals: FlashcardTopicSignal[],
    priorityTopicIds: string[],
): TopicInsight[] {
    const quizByTopic = matchSignals(topics, quizSignals, (signal) => signal.name);
    const flashcardsByTopic = matchSignals(topics, flashcardSignals, (signal) => signal.topic);
    const priorityIds = new Set(priorityTopicIds.map((id) => id.toLowerCase()));

    return topics.map((topic) => {
        const reasons = [STATUS_REASON[topic.status]];
        let score = STATUS_SCORE[topic.status];

        const scored = (quizByTopic.get(topic.id) ?? []).filter(
            (signal) => signal.accuracyPercent !== null && signal.questionsAttempted > 0,
        );
        const questions = scored.reduce((sum, signal) => sum + signal.questionsAttempted, 0);
        const accuracy = questions > 0
            ? Math.round(
                (scored.reduce((sum, signal) => sum + (signal.accuracyPercent ?? 0) * signal.questionsAttempted, 0) / questions) * 10,
            ) / 10
            : null;
        let weak = false;
        let strong = false;
        if (accuracy !== null) {
            if (questions >= 3) {
                if (accuracy < 60) {
                    weak = true;
                    score += 30;
                    reasons.push(`Quiz accuracy ${accuracy}% over ${questions} questions`);
                } else if (accuracy < 80) {
                    score += 10;
                    reasons.push(`Developing quiz accuracy (${accuracy}% over ${questions} questions)`);
                } else {
                    strong = true;
                    reasons.push(`Strong quiz accuracy (${accuracy}% over ${questions} questions)`);
                }
            } else if (topic.status !== "completed") {
                score += 5;
                reasons.push(`Only ${questions} quiz question${questions === 1 ? "" : "s"} answered, so there is not enough evidence yet`);
            }
        }

        const cards = flashcardsByTopic.get(topic.id) ?? [];
        const cardCount = cards.reduce((sum, signal) => sum + signal.cardCount, 0);
        const flashcardsDue = cards.reduce((sum, signal) => sum + signal.dueCount, 0);
        const reviewCount = cards.reduce((sum, signal) => sum + signal.reviewCount, 0);
        const difficultReviews = cards.reduce((sum, signal) => sum + signal.difficultReviewCount, 0);
        const flashcardsDifficult = reviewCount >= 5 && difficultReviews / reviewCount >= 0.5;
        if (flashcardsDifficult) {
            score += 10;
            reasons.push(`${difficultReviews} of ${reviewCount} flashcard reviews were rated Again or Hard`);
        }
        if (flashcardsDue > 0) {
            score += 5;
            reasons.push(`${flashcardsDue} flashcard${flashcardsDue === 1 ? " is" : "s are"} due`);
        }

        const priority = priorityIds.has(topic.id.toLowerCase());
        if (priority) {
            score += 25;
            reasons.push("Prioritized by you");
        }

        return {
            topicId: topic.id,
            name: topic.name,
            status: topic.status,
            order: topic.order,
            score,
            weak,
            strong,
            priority,
            hasFlashcards: cardCount > 0,
            flashcardsDue,
            flashcardsDifficult,
            quizEvidence: accuracy === null ? null : { questions, accuracyPercent: accuracy },
            reasons,
        };
    });
}

export type PlannedTask = {
    topicId: string;
    topicName: string;
    type: TaskType;
    // Identifies a unit of work so completed work is not scheduled again when a plan is recalculated.
    stageKey: string;
    title: string;
    minutes: number;
    phase: 0 | 1 | 2;
};

export function buildTaskTemplates(insight: TopicInsight): PlannedTask[] {
    const tasks: PlannedTask[] = [];
    const add = (type: TaskType, stageKey: string, phase: 0 | 1 | 2, label: string) => {
        tasks.push({
            topicId: insight.topicId,
            topicName: insight.name,
            type,
            stageKey,
            phase,
            minutes: TASK_MINUTES[type],
            title: `${label}: ${insight.name}`,
        });
    };

    if (insight.status === "not_started") add("study", "learn:1", 0, "Study");
    else if (insight.status === "in_progress") add("review_materials", "learn:1", 0, "Review materials");

    if (!(insight.status === "completed" && insight.strong)) {
        add("practice", "practice:1", 1, "Practise questions");
    }
    if (insight.weak || insight.priority) add("practice", "practice:2", 1, "Practise questions (set 2)");

    add("revise", "revise:1", 2, "Revise");
    if (insight.hasFlashcards && (insight.flashcardsDue > 0 || insight.flashcardsDifficult || insight.weak)) {
        add("flashcards", "flashcards:1", 2, "Review flashcards");
    }
    if (insight.weak) add("quiz", "quiz:1", 2, "Complete a quiz");
    return tasks;
}

export type ScheduledTask = PlannedTask & { scheduledDate: string };

export type Shortfall = { taskCount: number; minutes: number; topicNames: string[] };

function placeTasks(templates: PlannedTask[], slots: StudySlot[], softCap: number | null) {
    const remaining = slots.map((slot) => ({
        date: slot.date,
        minutes: softCap === null ? slot.remaining : Math.min(slot.remaining, softCap),
    }));
    const latestByTopic = new Map<string, { date: string; phase: number }>();
    const blockedTopics = new Set<string>();
    const scheduled: ScheduledTask[] = [];
    const unscheduled: PlannedTask[] = [];

    for (const template of templates) {
        if (blockedTopics.has(template.topicId)) {
            unscheduled.push(template);
            continue;
        }
        const previous = latestByTopic.get(template.topicId);
        // A later study phase starts on a later day than the previous phase, which spaces learning, practice and revision.
        const earliest = previous
            ? template.phase > previous.phase ? addDays(previous.date, 1) : previous.date
            : "";
        const slot = remaining.find((item) => item.date >= earliest && item.minutes >= template.minutes);
        if (!slot) {
            blockedTopics.add(template.topicId);
            unscheduled.push(template);
            continue;
        }
        slot.minutes -= template.minutes;
        latestByTopic.set(template.topicId, { date: slot.date, phase: template.phase });
        scheduled.push({ ...template, scheduledDate: slot.date });
    }
    return { scheduled, unscheduled };
}

export type ScheduleResult =
    | {
        ok: true;
        tasks: ScheduledTask[];
        shortfall: Shortfall;
        requiredMinutes: number;
        availableMinutes: number;
        studyDays: number;
    }
    | { ok: false; error: string };

export type CompletedWork = { topicId: string; stageKey: string; scheduledDate: string; minutes: number };

export function generateSchedule(params: {
    settings: RevisionSettings;
    today: string;
    insights: TopicInsight[];
    completedWork?: CompletedWork[];
}): ScheduleResult {
    const completedWork = params.completedWork ?? [];
    const usedMinutes = new Map<string, number>();
    for (const work of completedWork) {
        usedMinutes.set(work.scheduledDate, (usedMinutes.get(work.scheduledDate) ?? 0) + work.minutes);
    }
    const slots = buildStudySlots(params.settings, params.today, usedMinutes);
    if (slots.length === 0 || slots.every((slot) => slot.remaining < Math.min(...Object.values(TASK_MINUTES)))) {
        return {
            ok: false,
            error: params.settings.dateType === "exam"
                ? "There are no study days with free time before the examination. Choose different study days or a later date."
                : "There are no study days with free time before the target date. Choose different study days or a later date.",
        };
    }

    const completedKeys = new Set(completedWork.map((work) => `${work.topicId}|${work.stageKey}`));
    const ordered = [...params.insights].sort((left, right) => right.score - left.score || left.order - right.order);
    const perTopic = ordered.map((insight) =>
        buildTaskTemplates(insight).filter((task) => !completedKeys.has(`${task.topicId}|${task.stageKey}`)),
    );
    const templates = ([0, 1, 2] as const).flatMap((phase) =>
        perTopic.flatMap((tasks) => tasks.filter((task) => task.phase === phase)),
    );

    const requiredMinutes = templates.reduce((sum, task) => sum + task.minutes, 0);
    const availableMinutes = slots.reduce((sum, slot) => sum + slot.remaining, 0);
    const longestTask = Math.max(...Object.values(TASK_MINUTES));

    // Spread the work evenly across the window; fall back to filling days to capacity only when the even spread cannot fit everything.
    const evenCap = Math.max(longestTask, Math.ceil((requiredMinutes * 1.15) / slots.length / 5) * 5);
    let placed = placeTasks(templates, slots, evenCap);
    if (placed.unscheduled.length > 0) placed = placeTasks(templates, slots, null);

    const priorityRank = new Map(ordered.map((insight, index) => [insight.topicId, index]));
    const tasks = placed.scheduled.sort(
        (left, right) =>
            left.scheduledDate.localeCompare(right.scheduledDate) ||
            left.phase - right.phase ||
            (priorityRank.get(left.topicId) ?? 0) - (priorityRank.get(right.topicId) ?? 0),
    );

    return {
        ok: true,
        tasks,
        shortfall: {
            taskCount: placed.unscheduled.length,
            minutes: placed.unscheduled.reduce((sum, task) => sum + task.minutes, 0),
            topicNames: [...new Set(placed.unscheduled.map((task) => task.topicName))].slice(0, 15),
        },
        requiredMinutes,
        availableMinutes,
        studyDays: slots.length,
    };
}

export type ProgressTask = { status: string; scheduledDate: string; minutes: number };

export function calculatePlanProgress(tasks: ProgressTask[], today: string) {
    let completed = 0;
    let pending = 0;
    let overdue = 0;
    let totalMinutes = 0;
    let completedMinutes = 0;
    for (const task of tasks) {
        if (
            (task.status !== "pending" && task.status !== "completed") ||
            !parseIsoDate(task.scheduledDate) ||
            !Number.isFinite(task.minutes) ||
            task.minutes < 0
        ) {
            continue;
        }
        totalMinutes += task.minutes;
        if (task.status === "completed") {
            completed += 1;
            completedMinutes += task.minutes;
        } else if (task.scheduledDate < today) {
            overdue += 1;
        } else {
            pending += 1;
        }
    }
    const total = completed + pending + overdue;
    return {
        total,
        completed,
        pending,
        overdue,
        completionPercent: total === 0 ? null : Math.round((completed / total) * 100),
        totalMinutes,
        completedMinutes,
        remainingMinutes: totalMinutes - completedMinutes,
    };
}

export type RescheduleCheck =
    | { ok: true; scheduledMinutes: number; capacity: number }
    | {
        ok: false;
        code: "invalid_date" | "past" | "outside_window" | "unavailable_day" | "over_capacity";
        error: string;
        capacity?: number;
        scheduledMinutes?: number;
    };

export function checkReschedule(params: {
    date: string;
    minutes: number;
    settings: RevisionSettings;
    today: string;
    otherTasks: { scheduledDate: string; minutes: number }[];
}): RescheduleCheck {
    if (!parseIsoDate(params.date)) {
        return { ok: false, code: "invalid_date", error: "Choose a valid date." };
    }
    if (params.date < params.today) {
        return { ok: false, code: "past", error: "Tasks cannot be scheduled in the past." };
    }
    const { lastDate } = getStudyWindow(params.settings, params.today);
    if (params.date > lastDate) {
        return {
            ok: false,
            code: "outside_window",
            error: params.settings.dateType === "exam"
                ? "Choose a day before the examination date."
                : "Choose a day on or before the target date.",
        };
    }
    const capacity = params.settings.availability.find((item) => item.weekday === weekdayOf(params.date))?.minutes;
    if (capacity === undefined) {
        return {
            ok: false,
            code: "unavailable_day",
            error: "That day is not one of your selected study days.",
        };
    }
    const scheduledMinutes = params.otherTasks
        .filter((task) => task.scheduledDate === params.date)
        .reduce((sum, task) => sum + task.minutes, 0);
    if (scheduledMinutes + params.minutes > capacity) {
        return {
            ok: false,
            code: "over_capacity",
            error: `That day already has ${scheduledMinutes} of ${capacity} minutes scheduled, so this ${params.minutes}-minute task would exceed your daily limit.`,
            capacity,
            scheduledMinutes,
        };
    }
    return { ok: true, scheduledMinutes, capacity };
}

export function findOpenDays(params: {
    minutes: number;
    settings: RevisionSettings;
    today: string;
    otherTasks: { scheduledDate: string; minutes: number }[];
    limit?: number;
}): string[] {
    const used = new Map<string, number>();
    for (const task of params.otherTasks) {
        used.set(task.scheduledDate, (used.get(task.scheduledDate) ?? 0) + task.minutes);
    }
    return buildStudySlots(params.settings, params.today, used)
        .filter((slot) => slot.remaining >= params.minutes)
        .slice(0, params.limit ?? 6)
        .map((slot) => slot.date);
}

export type PriorityRecommendation = { topicId: string; reason: string };

// Only topics with enough graded quiz evidence are recommended; topics without performance data are never flagged.
export function recommendPriorityTopics(
    insights: { topicId: string; weak: boolean; quizEvidence: { questions: number; accuracyPercent: number | null } | null }[],
): PriorityRecommendation[] {
    return insights
        .filter((insight) => insight.weak && insight.quizEvidence?.accuracyPercent != null)
        .slice(0, MAX_PRIORITY_TOPICS)
        .map((insight) => ({
            topicId: insight.topicId,
            reason: `Recommended because your quiz performance on this topic is low (${insight.quizEvidence!.accuracyPercent}% over ${insight.quizEvidence!.questions} questions).`,
        }));
}
