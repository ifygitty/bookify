import { z } from "zod";

export const QUIZ_QUESTION_TYPES = [
    "multiple_choice",
    "true_false",
    "short_answer",
    "calculation",
    "structured",
] as const;
export const QUIZ_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const MAX_QUIZ_QUESTIONS = 20;
export const MAX_REFERENCE_TEXT_LENGTH = 12_000;
export const MAX_ANSWER_LENGTH = 20_000;
export const MAX_TEXT_ANSWER_LENGTH = 6_000;
export const MAX_TABLE_CELL_LENGTH = 200;

export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

const answerPartSchema = z.object({
    label: z.string().max(20),
    prompt: z.string().max(1_500),
    marks: z.number().int().min(1).max(50),
    format: z.enum(["text", "table"]),
    tableColumns: z.array(z.string().max(60)).max(8),
    tableRows: z.number().int().min(0).max(25),
});

const rubricItemSchema = z.object({
    criterion: z.string().min(1).max(600),
    marks: z.number().int().min(1).max(50),
});

const calculationCheckSchema = z.object({
    description: z.string().max(200),
    expression: z.string().max(200),
    result: z.number(),
});

export type QuizAnswerPart = z.infer<typeof answerPartSchema>;
export type QuizRubricItem = z.infer<typeof rubricItemSchema>;
export type QuizCalculationCheck = z.infer<typeof calculationCheckSchema>;

export const generatedQuizSchema = z.object({
    sufficientContent: z.boolean(),
    limitation: z.string(),
    questions: z.array(
        z.object({
            prompt: z.string().min(1).max(2_000),
            scenario: z.string().max(5_000),
            marks: z.number().int().min(1).max(100),
            choices: z.array(z.string().max(500)).max(6),
            correctChoiceIndex: z.number().int().nullable(),
            correctBoolean: z.boolean().nullable(),
            expectedAnswer: z.string().min(1).max(6_000),
            explanation: z.string().min(1).max(3_000),
            rubric: z.array(z.string().max(600)).max(12),
            rubricItems: z.array(rubricItemSchema).max(12),
            parts: z.array(answerPartSchema).max(6),
            calculationChecks: z.array(calculationCheckSchema).max(15),
            diagramSvg: z.string().max(8_000),
            topic: z.string().max(200),
            sourceMaterialIds: z.array(z.string()),
        }),
    ),
});

export const writtenEvaluationSchema = z.object({
    evaluations: z.array(
        z.object({
            questionId: z.string(),
            criteria: z.array(
                z.object({
                    criterionIndex: z.number().int().min(0),
                    marksAwarded: z.number().min(0),
                    comment: z.string().max(600),
                }),
            ).max(15),
            confidence: z.enum(["high", "medium", "low"]),
            feedback: z.string().min(1).max(2_500),
            correctApproach: z.string().max(3_000),
            incorrectPoints: z.array(z.string().max(500)).max(10),
            missingPoints: z.array(z.string().max(500)).max(10),
        }),
    ),
});

export type QuizSettings = {
    questionCount: number;
    difficulty: (typeof QUIZ_DIFFICULTIES)[number];
    questionType: QuizQuestionType;
    coverage: "all" | "topic";
    topic: string;
};

export type ValidatedGeneratedQuestion = z.infer<typeof generatedQuizSchema>["questions"][number];

export function isWrittenQuestionType(type: string): boolean {
    return type === "short_answer" || type === "calculation" || type === "structured";
}

/** Evaluates +, -, *, /, ^ and parentheses only. Returns null for anything else. */
export function evaluateArithmetic(expression: string): number | null {
    const source = expression
        .replace(/[,\s£$€₦]/g, "")
        .replace(/[×x]/g, "*")
        .replace(/÷/g, "/")
        .replace(/[[{]/g, "(")
        .replace(/[\]}]/g, ")");
    if (!source || source.length > 200) return null;
    let position = 0;

    const parseExpression = (): number => {
        let value = parseTerm();
        while (source[position] === "+" || source[position] === "-") {
            const operator = source[position++];
            const right = parseTerm();
            value = operator === "+" ? value + right : value - right;
        }
        return value;
    };
    const parseTerm = (): number => {
        let value = parseUnary();
        while (source[position] === "*" || source[position] === "/") {
            const operator = source[position++];
            const right = parseUnary();
            value = operator === "*" ? value * right : value / right;
        }
        return value;
    };
    const parseUnary = (): number => {
        if (source[position] === "-") {
            position++;
            return -parseUnary();
        }
        if (source[position] === "+") {
            position++;
            return parseUnary();
        }
        let base = parsePrimary();
        while (source[position] === "%") {
            position++;
            base /= 100;
        }
        if (source[position] === "^") {
            position++;
            return Math.pow(base, parseUnary());
        }
        return base;
    };
    const parsePrimary = (): number => {
        if (source[position] === "(") {
            position++;
            const value = parseExpression();
            if (source[position] !== ")") throw new Error("Unbalanced parentheses");
            position++;
            return value;
        }
        const match = /^\d+(\.\d+)?/.exec(source.slice(position));
        if (!match) throw new Error("Unexpected token");
        position += match[0].length;
        return Number(match[0]);
    };

    try {
        const value = parseExpression();
        return position === source.length && Number.isFinite(value) ? value : null;
    } catch {
        return null;
    }
}

/**
 * Recomputes every check. Unevaluable checks are dropped; checks whose stated result is wrong
 * are corrected to the computed value and reported so the answer key can be annotated.
 */
export function reconcileCalculationChecks(
    checks: readonly QuizCalculationCheck[],
): { checks: QuizCalculationCheck[]; corrections: string[] } {
    const reconciled: QuizCalculationCheck[] = [];
    const corrections: string[] = [];
    for (const check of checks) {
        const computed = evaluateArithmetic(check.expression);
        if (computed === null) continue;
        const rounded = Math.round(computed * 100) / 100;
        const tolerance = Math.max(0.01, Math.abs(computed) * 0.005);
        if (Math.abs(computed - check.result) > tolerance) {
            corrections.push(`${check.description || check.expression} = ${rounded.toLocaleString("en-US")}`);
        }
        reconciled.push({ ...check, result: rounded });
    }
    return { checks: reconciled, corrections };
}

export function verifyCalculationChecks(
    checks: readonly QuizCalculationCheck[],
): { ok: true } | { ok: false; description: string } {
    for (const check of checks) {
        const computed = evaluateArithmetic(check.expression);
        const tolerance = Math.max(0.01, Math.abs(check.result) * 0.005);
        if (computed === null || Math.abs(computed - check.result) > tolerance) {
            return { ok: false, description: check.description || check.expression };
        }
    }
    return { ok: true };
}

const UNSAFE_SVG = /<script|<foreignobject|<iframe|<image|<use|\son\w+\s*=|javascript:|href\s*=/i;

export function isSafeDiagramSvg(svg: string): boolean {
    const trimmed = svg.trim();
    return trimmed === "" || (/^<svg[\s>]/i.test(trimmed) && /<\/svg>\s*$/i.test(trimmed) && !UNSAFE_SVG.test(trimmed));
}

export function getRubricItems(question: { rubric: string[]; rubricItems?: QuizRubricItem[] }): QuizRubricItem[] {
    if (question.rubricItems && question.rubricItems.length > 0) return question.rubricItems;
    return question.rubric.map((criterion) => ({ criterion, marks: 1 }));
}

export type StructuredAnswerValue = Record<string, string | string[][]>;

export function parseStructuredAnswer(value: string): StructuredAnswerValue {
    if (!value) return {};
    try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? parsed as StructuredAnswerValue
            : {};
    } catch {
        return {};
    }
}

export function isStructuredAnswerBlank(value: string): boolean {
    return Object.values(parseStructuredAnswer(value)).every((entry) =>
        typeof entry === "string"
            ? entry.trim() === ""
            : entry.every((row) => row.every((cell) => cell.trim() === "")),
    );
}

/** Readable text of a structured answer, used for marking and flashcards. */
export function structuredAnswerToText(
    parts: readonly Pick<QuizAnswerPart, "label" | "format" | "tableColumns">[],
    value: string,
): string {
    const answer = parseStructuredAnswer(value);
    return parts.map((part) => {
        const entry = answer[part.label];
        if (typeof entry === "string") return `(${part.label})\n${entry.trim() || "No answer"}`;
        if (Array.isArray(entry)) {
            const rows = entry.filter((row) => row.some((cell) => cell.trim() !== ""));
            const table = rows.length === 0
                ? "No answer"
                : [part.tableColumns.join(" | "), ...rows.map((row) => row.join(" | "))].join("\n");
            return `(${part.label})\n${table}`;
        }
        return `(${part.label})\nNo answer`;
    }).join("\n\n");
}

export function answerToText(
    question: { type: string; parts?: QuizAnswerPart[] },
    value: string,
): string {
    return question.type === "structured" && question.parts
        ? structuredAnswerToText(question.parts, value)
        : value;
}

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

/**
 * Models often get mark totals and part labels slightly wrong. Repair them deterministically:
 * the question total follows the part marks, the rubric is rescaled to the total, and
 * duplicate or empty part labels are replaced with a, b, c...
 */
function normalizeWrittenQuestion(question: ValidatedGeneratedQuestion, structured: boolean): void {
    question.choices = [];
    question.correctBoolean = null;
    question.correctChoiceIndex = null;
    question.marks = Math.min(100, Math.max(1, Math.round(question.marks) || 1));
    if (!isSafeDiagramSvg(question.diagramSvg)) question.diagramSvg = "";

    if (question.rubricItems.length === 0) {
        question.rubricItems = question.rubric.length > 0
            ? question.rubric.map((criterion) => ({ criterion, marks: 1 }))
            : [{ criterion: "Correct and complete answer", marks: question.marks }];
    }

    if (structured) {
        question.parts = question.parts.map((part) =>
            part.format === "table" && (part.tableColumns.length < 2 || part.tableRows < 1)
                ? { ...part, format: "text" as const, tableColumns: [], tableRows: 0 }
                : part,
        );
        if (question.parts.length === 0) {
            question.parts = [{
                label: "a",
                prompt: "Answer the question above, showing your workings.",
                marks: question.marks,
                format: "text",
                tableColumns: [],
                tableRows: 0,
            }];
        }
    }

    if (structured && question.parts.length > 0) {
        const labels = question.parts.map((part) => part.label.trim().toLowerCase());
        if (new Set(labels).size !== labels.length || labels.includes("")) {
            question.parts.forEach((part, partIndex) => {
                part.label = String.fromCharCode(97 + (partIndex % 26));
            });
        }
        question.parts.forEach((part) => {
            part.marks = Math.max(1, Math.round(part.marks));
        });
        question.marks = Math.min(100, question.parts.reduce((total, part) => total + part.marks, 0));
    }

    const total = question.rubricItems.reduce((sum, item) => sum + item.marks, 0);
    if (total === question.marks || total <= 0) return;
    const factor = question.marks / total;
    question.rubricItems.forEach((item) => {
        item.marks = Math.max(0, Math.round(item.marks * factor));
    });
    const difference = question.marks - question.rubricItems.reduce((sum, item) => sum + item.marks, 0);
    const largest = question.rubricItems.reduce((best, item) => (item.marks > best.marks ? item : best));
    largest.marks = Math.max(0, largest.marks + difference);
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
        `${question.scenario} ${question.prompt}`.toLowerCase().replace(/\s+/g, " ").trim(),
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
        } else {
            normalizeWrittenQuestion(question, settings.questionType === "structured");
            // The model's arithmetic is unreliable; the server's own evaluation is authoritative.
            const reconciled = reconcileCalculationChecks(question.calculationChecks);
            question.calculationChecks = reconciled.checks;
            if (reconciled.corrections.length > 0) {
                question.explanation = `${question.explanation}\n\nVerified figures: ${reconciled.corrections.join("; ")}. If your working differs from the model answer above, rely on these verified figures.`;
            }
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

/**
 * Converts evaluator output into marks using the stored rubric, so the AI can never change
 * the available marks. Each criterion is capped at its rubric maximum.
 */
export function scoreAgainstRubric(
    rubricItems: readonly QuizRubricItem[],
    criteria: readonly { criterionIndex: number; marksAwarded: number; comment: string }[],
): {
    marksAwarded: number;
    marksAvailable: number;
    allCriteriaMarked: boolean;
    breakdown: { criterion: string; awarded: number; max: number; comment: string }[];
} {
    const byIndex = new Map<number, { marksAwarded: number; comment: string }>();
    for (const item of criteria) {
        if (!byIndex.has(item.criterionIndex)) byIndex.set(item.criterionIndex, item);
    }
    let allCriteriaMarked = true;
    const breakdown = rubricItems.map((item, index) => {
        const entry = byIndex.get(index);
        if (!entry) allCriteriaMarked = false;
        const awarded = entry
            ? Math.round(Math.min(item.marks, Math.max(0, entry.marksAwarded)) * 2) / 2
            : 0;
        return { criterion: item.criterion, awarded, max: item.marks, comment: entry?.comment ?? "" };
    });
    return {
        marksAwarded: breakdown.reduce((total, item) => total + item.awarded, 0),
        marksAvailable: rubricItems.reduce((total, item) => total + item.marks, 0),
        allCriteriaMarked,
        breakdown,
    };
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
