import { z } from "zod";

export const QUIZ_QUESTION_TYPES = [
    "multiple_choice",
    "true_false",
    "short_answer",
    "calculation",
] as const;
export const QUIZ_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const MAX_QUIZ_QUESTIONS = 20;
export const MAX_REFERENCE_TEXT_LENGTH = 12_000;

export const generatedQuizSchema = z.object({
    sufficientContent: z.boolean(),
    limitation: z.string(),
    questions: z.array(
        z.object({
            prompt: z.string().min(1).max(1_200),
            choices: z.array(z.string().max(500)).max(6),
            correctChoiceIndex: z.number().int().nullable(),
            correctBoolean: z.boolean().nullable(),
            expectedAnswer: z.string().min(1).max(2_000),
            explanation: z.string().min(1).max(2_000),
            rubric: z.array(z.string().max(500)).max(10),
            topic: z.string().max(200),
            sourceMaterialIds: z.array(z.string()),
        }),
    ),
});

export const writtenEvaluationSchema = z.object({
    evaluations: z.array(
        z.object({
            questionId: z.string(),
            scoreFraction: z.number().min(0).max(1).nullable(),
            feedback: z.string().min(1).max(2_000),
            missingPoints: z.array(z.string().max(500)).max(10),
        }),
    ),
});

export type QuizSettings = {
    questionCount: number;
    difficulty: (typeof QUIZ_DIFFICULTIES)[number];
    questionType: (typeof QUIZ_QUESTION_TYPES)[number];
    coverage: "all" | "topic";
    topic: string;
};

export type ValidatedGeneratedQuestion = z.infer<typeof generatedQuizSchema>["questions"][number];

export function mapGeneratedQuizSourceKeys<T extends { sourceMaterialIds: string[] }>(
    questions: T[],
    sources: readonly { key: string; id: string }[],
): T[] {
    const materialIdByKey = new Map(
        sources.map(({ key, id }) => [key.toUpperCase(), id]),
    );
    return questions.map((question) => ({
        ...question,
        sourceMaterialIds: question.sourceMaterialIds.map(
            (sourceKey) => materialIdByKey.get(sourceKey.toUpperCase()) ?? sourceKey,
        ),
    }));
}

export function validateGeneratedQuiz(
    result: z.infer<typeof generatedQuizSchema>,
    settings: QuizSettings,
    allowedMaterialIds: string[],
): { valid: true; questions: ValidatedGeneratedQuestion[] } | { valid: false; reason: string } {
    if (!result.sufficientContent) {
        return { valid: false, reason: result.limitation || "The selected sources did not contain enough information." };
    }
    if (result.questions.length !== settings.questionCount) {
        return {
            valid: false,
            reason: `The generated quiz contained ${result.questions.length} of ${settings.questionCount} requested questions. Try a smaller quiz or broader material selection.`,
        };
    }

    const normalizedQuestionTexts = result.questions.map((question) =>
        question.prompt.toLowerCase().replace(/\s+/g, " ").trim(),
    );
    if (new Set(normalizedQuestionTexts).size !== normalizedQuestionTexts.length) {
        return { valid: false, reason: "The generated quiz contained duplicate questions. Please try again." };
    }

    const allowedIds = new Set(allowedMaterialIds.map((id) => id.toLowerCase()));
    for (const [index, question] of result.questions.entries()) {
        if (
            question.sourceMaterialIds.length === 0 ||
            question.sourceMaterialIds.some((id) => !allowedIds.has(id.toLowerCase()))
        ) {
            return {
                valid: false,
                reason: `Question ${index + 1} did not cite a retrieved selected study source. Try generating the quiz again.`,
            };
        }

        if (settings.questionType === "multiple_choice") {
            if (
                question.choices.length !== 4 ||
                question.correctChoiceIndex === null ||
                question.correctChoiceIndex < 0 ||
                question.correctChoiceIndex >= question.choices.length ||
                question.correctBoolean !== null
            ) {
                return {
                    valid: false,
                    reason: `Question ${index + 1} was not a valid multiple-choice question. Each one must have four choices, one valid answer index, and no true/false answer.`,
                };
            }
            const normalizedChoices = question.choices.map((choice) =>
                choice.toLowerCase().replace(/\s+/g, " ").trim(),
            );
            if (new Set(normalizedChoices).size !== normalizedChoices.length) {
                return {
                    valid: false,
                    reason: `Question ${index + 1} contained repeated multiple-choice options. Please try again.`,
                };
            }
        } else if (settings.questionType === "true_false") {
            if (question.choices.length !== 0 || question.correctBoolean === null || question.correctChoiceIndex !== null) {
                return {
                    valid: false,
                    reason: `Question ${index + 1} was not a valid true/false question. It must include a true/false answer and no multiple-choice options.`,
                };
            }
        } else if (
            question.choices.length !== 0 ||
            question.correctBoolean !== null ||
            question.correctChoiceIndex !== null ||
            question.rubric.length === 0
        ) {
            return {
                valid: false,
                reason: `Question ${index + 1} was not a valid written-response question. It must include a scoring rubric and no objective answer fields.`,
            };
        }
    }

    return { valid: true, questions: result.questions };
}

export function gradeObjectiveAnswer(
    question: {
        type: string;
        correctChoiceIndex?: number;
        correctBoolean?: boolean;
    },
    answer: string,
): { correctness: "correct" | "incorrect"; scoreFraction: number } {
    const isCorrect = question.type === "multiple_choice"
        ? answer === String(question.correctChoiceIndex)
        : question.type === "true_false"
          ? answer === String(question.correctBoolean)
          : false;
    return { correctness: isCorrect ? "correct" : "incorrect", scoreFraction: isCorrect ? 1 : 0 };
}

export function calculateQuizScore(
    answers: Array<{ scoreFraction?: number | null }>,
): { scorePercent: number | null; gradedQuestionCount: number } {
    const graded = answers.filter(
        (answer): answer is { scoreFraction: number } =>
            typeof answer.scoreFraction === "number" && Number.isFinite(answer.scoreFraction),
    );
    if (graded.length === 0) return { scorePercent: null, gradedQuestionCount: 0 };

    const earned = graded.reduce((total, answer) => total + Math.min(1, Math.max(0, answer.scoreFraction)), 0);
    return {
        scorePercent: Math.round((earned / graded.length) * 100),
        gradedQuestionCount: graded.length,
    };
}
