import assert from "node:assert/strict";
import test from "node:test";
import {
    calculateQuizScore,
    gradeObjectiveAnswer,
    mapGeneratedQuizSourceKeys,
    validateGeneratedQuiz,
} from "../lib/course-quiz.ts";

const sourceId = "64b000000000000000000001";
const settings = {
    questionCount: 1,
    difficulty: "medium",
    questionType: "multiple_choice",
    coverage: "all",
    topic: "",
};

function generatedQuiz(overrides = {}) {
    return {
        sufficientContent: true,
        limitation: "",
        questions: [{
            prompt: "Which statement describes the accounting equation?",
            choices: [
                "Assets equal liabilities plus equity",
                "Assets equal income less expenses",
                "Liabilities equal assets plus equity",
                "Equity equals liabilities less assets",
            ],
            correctChoiceIndex: 0,
            correctBoolean: null,
            expectedAnswer: "Assets = liabilities + equity.",
            explanation: "The accounting equation expresses the relationship between assets, liabilities, and equity.",
            rubric: ["State assets = liabilities + equity"],
            topic: "Accounting equation",
            sourceMaterialIds: [sourceId],
        }],
        ...overrides,
    };
}

test("accepts a valid source-grounded quiz without lecturer examples", () => {
    assert.deepEqual(
        validateGeneratedQuiz(generatedQuiz(), settings, [sourceId]),
        { valid: true, questions: generatedQuiz().questions },
    );
});

test("maps concise generated source keys to material IDs before citation validation", () => {
    const questions = generatedQuiz().questions;
    const mapped = mapGeneratedQuizSourceKeys(
        [{ ...questions[0], sourceMaterialIds: ["source_1"] }],
        [{ key: "SOURCE_1", id: sourceId }],
    );

    assert.deepEqual(mapped[0].sourceMaterialIds, [sourceId]);
    assert.deepEqual(questions[0].sourceMaterialIds, [sourceId]);
});

test("validates generated questions and rejects outside citations or malformed answers", () => {
    assert.equal(
        validateGeneratedQuiz(
            generatedQuiz({
                questions: [{
                    ...generatedQuiz().questions[0],
                    sourceMaterialIds: ["64b000000000000000000099"],
                }],
            }),
            settings,
            [sourceId],
        ).valid,
        false,
    );
    const invalidAnswerIndex = validateGeneratedQuiz(
        generatedQuiz({
            questions: [{
                ...generatedQuiz().questions[0],
                correctChoiceIndex: 8,
            }],
        }),
        settings,
        [sourceId],
    );
    assert.equal(invalidAnswerIndex.valid, false);
    assert.match(invalidAnswerIndex.reason, /four choices, one valid answer index/);
    assert.equal(
        validateGeneratedQuiz(
            generatedQuiz({ questions: [] }),
            settings,
            [sourceId],
        ).valid,
        false,
    );
});

test("explains when generation returns fewer questions than requested", () => {
    const result = validateGeneratedQuiz(
        generatedQuiz({ questions: [] }),
        { ...settings, questionCount: 5 },
        [sourceId],
    );
    assert.deepEqual(result, {
        valid: false,
        reason: "The generated quiz contained 0 of 5 requested questions. Try a smaller quiz or broader material selection.",
    });
});

test("requires the irrelevant objective answer field to be null", () => {
    const result = validateGeneratedQuiz(
        generatedQuiz({
            questions: [{
                ...generatedQuiz().questions[0],
                correctBoolean: false,
            }],
        }),
        settings,
        [sourceId],
    );
    assert.equal(result.valid, false);
    assert.match(result.reason, /no true\/false answer/);
});

test("reports insufficient source content without creating question data", () => {
    const result = validateGeneratedQuiz(
        generatedQuiz({
            sufficientContent: false,
            limitation: "The selected sources do not explain this topic.",
            questions: [],
        }),
        settings,
        [sourceId],
    );
    assert.deepEqual(result, {
        valid: false,
        reason: "The selected sources do not explain this topic.",
    });
});

test("grades objective answers deterministically", () => {
    const multipleChoice = { type: "multiple_choice", correctChoiceIndex: 2 };
    assert.deepEqual(gradeObjectiveAnswer(multipleChoice, "2"), {
        correctness: "correct",
        scoreFraction: 1,
    });
    assert.deepEqual(gradeObjectiveAnswer(multipleChoice, "0"), {
        correctness: "incorrect",
        scoreFraction: 0,
    });
    assert.deepEqual(gradeObjectiveAnswer({ type: "true_false", correctBoolean: false }, "false"), {
        correctness: "correct",
        scoreFraction: 1,
    });
});

test("calculates scores while excluding answers that could not be graded confidently", () => {
    assert.deepEqual(
        calculateQuizScore([
            { scoreFraction: 1 },
            { scoreFraction: 0.5 },
            { scoreFraction: 0 },
            { scoreFraction: null },
        ]),
        { scorePercent: 50, gradedQuestionCount: 3 },
    );
    assert.deepEqual(calculateQuizScore([{ scoreFraction: null }]), {
        scorePercent: null,
        gradedQuestionCount: 0,
    });
});
