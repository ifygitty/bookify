import { z } from "zod";

export const MAX_FLASHCARDS_PER_GENERATION = 30;
export const MAX_FLASHCARD_FRONT_LENGTH = 5_000;
export const MAX_FLASHCARD_BACK_LENGTH = 2_000;
export const MAX_FLASHCARD_DECK_NAME_LENGTH = 80;
export const MAX_FLASHCARD_INTERVAL_DAYS = 36_500;

export const flashcardRatingSchema = z.enum(["again", "hard", "good", "easy"]);

export const generatedFlashcardsSchema = z.object({
    sufficientContent: z.boolean(),
    limitation: z.string().max(500),
    cards: z.array(z.object({
        front: z.string().trim().min(1).max(500),
        back: z.string().trim().min(1).max(MAX_FLASHCARD_BACK_LENGTH),
        topic: z.string().trim().max(160),
        sourceKeys: z.array(z.string().min(1).max(40)).min(1).max(10),
    })).max(MAX_FLASHCARDS_PER_GENERATION),
});

export type FlashcardRating = z.infer<typeof flashcardRatingSchema>;
export type FlashcardSchedule = {
    repetitions: number;
    intervalDays: number;
    easeFactor: number;
    dueAt: Date;
    lastReviewedAt?: Date;
};
export type FlashcardReviewReplay = "new" | "replay" | "conflict";

export function resolveFlashcardReviewReplay(
    existing: { cardId: string; deckId: string } | null,
    cardId: string,
    deckId: string,
): FlashcardReviewReplay {
    if (!existing) return "new";
    return existing.cardId === cardId && existing.deckId === deckId ? "replay" : "conflict";
}

export function makeQuizFlashcardConversionKey(quizId: string, questionId: string): string {
    return `${quizId}:${questionId}`;
}

export function buildQuizMistakeFlashcard(
    question: {
        prompt: string;
        type: string;
        choices: string[];
        expectedAnswer: string;
        explanation: string;
        topic: string;
    },
    submittedAnswer: string,
    missingPoints: string[],
): { front: string; back: string; topic: string } {
    const front = question.type === "multiple_choice" && question.choices.length > 0
        ? `${question.prompt}\n\n${question.choices.map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`).join("\n")}`
        : question.prompt;
    const expected = question.expectedAnswer.trim() || question.explanation;
    const back = [
        `Expected answer: ${expected}`,
        `Your submitted answer: ${submittedAnswer.trim() || "No answer submitted"}`,
        question.explanation && question.explanation !== expected ? `Explanation: ${question.explanation}` : "",
        missingPoints.length > 0 ? `Remember: ${missingPoints.join("; ")}` : "",
    ].filter(Boolean).join("\n\n").slice(0, MAX_FLASHCARD_BACK_LENGTH);
    return { front, back, topic: question.topic };
}

export function createInitialFlashcardSchedule(now = new Date()): FlashcardSchedule {
    return {
        repetitions: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        dueAt: new Date(now),
    };
}

export function calculateNextFlashcardSchedule(
    previous: FlashcardSchedule,
    rating: FlashcardRating,
    reviewedAt: Date,
): FlashcardSchedule {
    if (!Number.isFinite(reviewedAt.getTime())) {
        throw new Error("Review time must be a valid date.");
    }
    if (
        !Number.isSafeInteger(previous.repetitions) ||
        previous.repetitions < 0 ||
        !Number.isFinite(previous.intervalDays) ||
        previous.intervalDays < 0 ||
        previous.intervalDays > MAX_FLASHCARD_INTERVAL_DAYS ||
        !Number.isFinite(previous.easeFactor) ||
        previous.easeFactor < 1.3 ||
        !Number.isFinite(previous.dueAt.getTime())
    ) {
        throw new Error("The saved flashcard schedule is invalid.");
    }

    const quality = { again: 0, hard: 3, good: 4, easy: 5 }[rating];
    const easeFactor = Math.max(
        1.3,
        previous.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
    );
    const repetitions = quality < 3 ? 0 : previous.repetitions + 1;
    const intervalDays = quality < 3
        ? 1
        : previous.repetitions === 0
          ? 1
          : previous.repetitions === 1
            ? 6
            : Math.min(MAX_FLASHCARD_INTERVAL_DAYS, Math.max(1, Math.round(previous.intervalDays * easeFactor)));
    const dueAt = new Date(reviewedAt);
    dueAt.setUTCDate(dueAt.getUTCDate() + intervalDays);
    if (!Number.isFinite(dueAt.getTime())) {
        throw new Error("The next flashcard review date is outside the supported range.");
    }

    return {
        repetitions,
        intervalDays,
        easeFactor,
        dueAt,
        lastReviewedAt: new Date(reviewedAt),
    };
}

export function normalizeFlashcardFront(front: string): string {
    return front.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

export function mapGeneratedFlashcards(
    cards: Array<{
        front: string;
        back: string;
        topic: string;
        sourceKeys: string[];
    }>,
    retrievedSources: readonly { key: string; id: string; title: string }[],
):
    | {
        valid: true;
        cards: Array<{
            front: string;
            back: string;
            topic: string;
            sourceMaterials: { id: string; title: string; available: true }[];
        }>;
    }
    | { valid: false; reason: string } {
    const sourceByKey = new Map(retrievedSources.map((source) => [source.key.toUpperCase(), source]));
    const mapped = [];
    for (const [index, card] of cards.entries()) {
        const usedSources = card.sourceKeys.map((key) => sourceByKey.get(key.toUpperCase()));
        if (usedSources.length === 0 || usedSources.some((source) => !source)) {
            return {
                valid: false,
                reason: `Flashcard ${index + 1} cited a source that was not retrieved. Try generating it again.`,
            };
        }
        const resolvedSources = usedSources.filter(
            (source): source is NonNullable<typeof source> => source !== undefined,
        );
        mapped.push({
            front: card.front.trim(),
            back: card.back.trim(),
            topic: card.topic.trim(),
            sourceMaterials: resolvedSources.map((source) => ({
                id: source.id,
                title: source.title,
                available: true as const,
            })),
        });
    }
    return { valid: true, cards: mapped };
}

export function validateFlashcardContent(front: unknown, back: unknown) {
    if (typeof front !== "string" || typeof back !== "string") {
        return { valid: false as const, reason: "Enter both a question and an answer." };
    }
    const cleanFront = front.trim();
    const cleanBack = back.trim();
    if (
        !cleanFront ||
        cleanFront.length > MAX_FLASHCARD_FRONT_LENGTH ||
        !cleanBack ||
        cleanBack.length > MAX_FLASHCARD_BACK_LENGTH
    ) {
        return {
            valid: false as const,
            reason: `Questions must be 1-${MAX_FLASHCARD_FRONT_LENGTH} characters and answers 1-${MAX_FLASHCARD_BACK_LENGTH} characters.`,
        };
    }
    return { valid: true as const, front: cleanFront, back: cleanBack };
}
