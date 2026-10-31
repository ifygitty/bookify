import assert from "node:assert/strict";
import test from "node:test";
import { buildStudyProgress } from "../lib/study-progress.ts";

const now = new Date("2026-10-28T12:00:00.000Z");
const courses = [{ id: "course-1", name: "Accounting" }];

function quiz(id, date, scores, topic = "Depreciation", overrides = {}) {
    return {
        courseId: "course-1",
        status: "completed",
        scorePercent: scores.reduce((sum, score) => sum + score * 100, 0) / scores.length,
        gradedQuestionCount: scores.length,
        submittedAt: new Date(date),
        questions: scores.map((_, index) => ({ id: `${id}-${index}`, topic })),
        answers: scores.map((score, index) => ({
            questionId: `${id}-${index}`,
            value: score === 0 ? "" : "answer",
            scoreFraction: score,
        })),
        ...overrides,
    };
}

test("calculates quiz averages, question outcomes, and trend from completed attempts", () => {
    const quizzes = [
        quiz("q1", "2026-10-01", [0, 1]),
        quiz("q2", "2026-10-05", [0.5, 0.5]),
        quiz("q3", "2026-10-10", [1, 1]),
        quiz("q4", "2026-10-20", [1, 1]),
    ];
    quizzes.push(quiz("draft", "2026-10-25", [0], "Other", { status: "in_progress" }));
    const result = buildStudyProgress(courses, quizzes, [], new Map(), now).courses[0];

    assert.equal(result.quizzesCompleted, 4);
    assert.equal(result.averageQuizScorePercent, 75);
    assert.equal(result.questionsGraded, 8);
    assert.equal(result.correctAnswerCount, 5);
    assert.equal(result.incorrectAnswerCount, 1);
    assert.equal(result.partiallyCorrectAnswerCount, 2);
    assert.equal(result.performanceTrend.direction, "improving");
    assert.equal(result.performanceTrend.differencePercentagePoints, 50);
});

test("does not classify a topic until three scored answers and deduplicates answer IDs", () => {
    const result = buildStudyProgress(
        courses,
        [quiz("q1", "2026-10-01", [0], "Uncertain topic", {
            answers: [
                { questionId: "q1-0", scoreFraction: 0 },
                { questionId: "q1-0", scoreFraction: 1 },
            ],
        })],
        [],
        new Map(),
        now,
    ).courses[0];

    assert.equal(result.topics[0].questionsAttempted, 1);
    assert.equal(result.topics[0].classification, "more_practice");
    assert.equal(result.weakTopicCount, 0);
});

test("classifies a topic as needing improvement only after enough weak results", () => {
    const quizzes = [
        quiz("q1", "2026-10-01", [0]),
        quiz("q2", "2026-10-02", [0.5]),
        quiz("q3", "2026-10-03", [0]),
    ];
    const topic = buildStudyProgress(courses, quizzes, [], new Map(), now).courses[0].topics[0];

    assert.equal(topic.questionsAttempted, 3);
    assert.equal(topic.accuracyPercent, 16.7);
    assert.equal(topic.recentAccuracyPercent, 16.7);
    assert.equal(topic.recentQuestionsAttempted, 3);
    assert.equal(topic.correctAnswers, 0);
    assert.equal(topic.incorrectAnswers, 2);
    assert.equal(topic.partiallyCorrectAnswers, 1);
    assert.equal(topic.classification, "needs_improvement");
    assert.equal(topic.hasSufficientEvidence, true);
});

test("tracks real flashcard ratings and due counts separately from quiz scores", () => {
    const reviews = [
        { courseId: "course-1", rating: "again", reviewedAt: new Date("2026-10-27T12:00:00.000Z") },
        { courseId: "course-1", rating: "good", reviewedAt: new Date("2026-10-20T12:00:00.000Z") },
        { courseId: "other", rating: "easy", reviewedAt: now },
    ];
    const result = buildStudyProgress(courses, [], reviews, new Map([["course-1", 3]]), now).courses[0];

    assert.equal(result.flashcardsReviewed, 2);
    assert.equal(result.flashcardsReviewedLast7Days, 1);
    assert.equal(result.flashcardsDue, 3);
    assert.equal(result.reviewRatingsLast30Days.again, 1);
    assert.equal(result.reviewRatingsLast30Days.good, 1);
    assert.equal(result.averageQuizScorePercent, null);
});

test("returns safe empty stats when activity is missing or incomplete", () => {
    const result = buildStudyProgress(
        courses,
        [{
            courseId: "course-1",
            status: "completed",
            questions: [{ id: "q", topic: "" }],
            answers: [{ questionId: "q", value: "" }],
        }],
        [],
        new Map(),
        now,
    );

    assert.equal(result.summary.averageQuizScorePercent, null);
    assert.equal(result.summary.quizzesCompleted, 1);
    assert.equal(result.courses[0].performanceTrend.direction, "insufficient_data");
    assert.equal(result.courses[0].topics.length, 0);
});

test("derives legacy quiz scores from distinct persisted graded answers when saved totals are absent", () => {
    const result = buildStudyProgress(
        courses,
        [{
            courseId: "course-1",
            status: "completed",
            submittedAt: new Date("2026-10-25T12:00:00.000Z"),
            questions: [{ id: "legacy-question", topic: "Legacy topic" }],
            answers: [{ questionId: "legacy-question", scoreFraction: 0.5 }],
        }],
        [],
        new Map(),
        now,
    );

    assert.equal(result.summary.averageQuizScorePercent, 50);
    assert.equal(result.courses[0].questionsGraded, 1);
});
