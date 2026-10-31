import assert from "node:assert/strict";
import test from "node:test";
import {
    calculateNextFlashcardSchedule,
    buildQuizMistakeFlashcard,
    createInitialFlashcardSchedule,
    MAX_FLASHCARD_INTERVAL_DAYS,
    makeQuizFlashcardConversionKey,
    mapGeneratedFlashcards,
    normalizeFlashcardFront,
    resolveFlashcardReviewReplay,
    validateFlashcardContent,
} from "../lib/flashcards.ts";

const fixedDate = new Date("2026-01-01T23:30:00.000Z");

test("new cards are due immediately and begin with standard SM-2 state", () => {
    const state = createInitialFlashcardSchedule(fixedDate);
    assert.deepEqual(state, {
        repetitions: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        dueAt: fixedDate,
    });
});

test("Again resets repetition and schedules one UTC day later", () => {
    const next = calculateNextFlashcardSchedule({
        repetitions: 4,
        intervalDays: 20,
        easeFactor: 2.5,
        dueAt: fixedDate,
    }, "again", fixedDate);
    assert.equal(next.repetitions, 0);
    assert.equal(next.intervalDays, 1);
    assert.equal(next.dueAt.toISOString(), "2026-01-02T23:30:00.000Z");
    assert.equal(next.lastReviewedAt?.toISOString(), fixedDate.toISOString());
});

test("Hard, Good, and Easy apply standard SM-2 grades and intervals", () => {
    for (const rating of ["hard", "good", "easy"]) {
        const first = calculateNextFlashcardSchedule(createInitialFlashcardSchedule(fixedDate), rating, fixedDate);
        assert.equal(first.repetitions, 1);
        assert.equal(first.intervalDays, 1);
        const second = calculateNextFlashcardSchedule(first, rating, fixedDate);
        assert.equal(second.repetitions, 2);
        assert.equal(second.intervalDays, 6);
    }
});

test("subsequent interval uses the updated ease factor and rounds to whole days", () => {
    const second = {
        repetitions: 2,
        intervalDays: 6,
        easeFactor: 2.5,
        dueAt: fixedDate,
    };
    const next = calculateNextFlashcardSchedule(second, "good", fixedDate);
    assert.equal(next.intervalDays, 15);
    assert.equal(next.easeFactor, 2.5);
    assert.equal(next.dueAt.toISOString(), "2026-01-16T23:30:00.000Z");
});

test("long intervals are capped at the documented safe maximum", () => {
    const next = calculateNextFlashcardSchedule({
        repetitions: 4,
        intervalDays: 30_000,
        easeFactor: 2.5,
        dueAt: fixedDate,
    }, "easy", fixedDate);
    assert.equal(next.intervalDays, MAX_FLASHCARD_INTERVAL_DAYS);
    assert.equal(Number.isFinite(next.dueAt.getTime()), true);
});

test("schedule rejects corrupt or invalid date state", () => {
    assert.throws(() => calculateNextFlashcardSchedule({
        repetitions: -1,
        intervalDays: 2,
        easeFactor: 2.5,
        dueAt: fixedDate,
    }, "good", fixedDate), /schedule is invalid/);
    assert.throws(() => calculateNextFlashcardSchedule(
        createInitialFlashcardSchedule(fixedDate),
        "good",
        new Date("invalid"),
    ), /valid date/);
});

test("manual card validation trims content and rejects missing or excessive fields", () => {
    assert.deepEqual(validateFlashcardContent("  Front? ", "  Answer. "), {
        valid: true,
        front: "Front?",
        back: "Answer.",
    });
    assert.equal(validateFlashcardContent("", "Answer").valid, false);
    assert.equal(validateFlashcardContent("Question", " ").valid, false);
    assert.equal(validateFlashcardContent("x".repeat(5_001), "Answer").valid, false);
});

test("duplicate comparison ignores case and repeated whitespace", () => {
    assert.equal(normalizeFlashcardFront("  What   is Cash? "), "what is cash?");
});

test("generated flashcards map source keys only to retrieved materials", () => {
    const result = mapGeneratedFlashcards([{
        front: "What is working capital?",
        back: "Current assets less current liabilities.",
        topic: "Liquidity",
        sourceKeys: ["source_1"],
    }], [{ key: "SOURCE_1", id: "material-id", title: "Lecture notes" }]);
    assert.deepEqual(result, {
        valid: true,
        cards: [{
            front: "What is working capital?",
            back: "Current assets less current liabilities.",
            topic: "Liquidity",
            sourceMaterials: [{ id: "material-id", title: "Lecture notes", available: true }],
        }],
    });
    assert.equal(mapGeneratedFlashcards([{
        front: "Question",
        back: "Answer",
        topic: "",
        sourceKeys: ["SOURCE_2"],
    }], [{ key: "SOURCE_1", id: "material-id", title: "Lecture notes" }]).valid, false);
});

test("one generated card can cite multiple retrieved materials", () => {
    const result = mapGeneratedFlashcards([{
        front: "How does method A differ from method B?",
        back: "Method A ...; method B ...",
        topic: "Methods",
        sourceKeys: ["SOURCE_1", "SOURCE_2"],
    }], [
        { key: "SOURCE_1", id: "material-a", title: "Lecture notes" },
        { key: "SOURCE_2", id: "material-b", title: "Solved examples" },
    ]);
    assert.equal(result.valid, true);
    if (result.valid) {
        assert.deepEqual(result.cards[0].sourceMaterials.map((source) => source.id), ["material-a", "material-b"]);
    }
});

test("quiz-mistake cards preserve multiple-choice options and answer context", () => {
    const card = buildQuizMistakeFlashcard({
        prompt: "Which method allocates an equal amount each year?",
        type: "multiple_choice",
        choices: ["Straight-line", "Reducing balance"],
        expectedAnswer: "Straight-line depreciation.",
        explanation: "It spreads depreciable cost evenly over useful life.",
        topic: "Depreciation",
    }, "Reducing balance", ["Recognize equal annual expense"]);
    assert.match(card.front, /A\. Straight-line/);
    assert.match(card.back, /Your submitted answer: Reducing balance/);
    assert.match(card.back, /Remember: Recognize equal annual expense/);
    assert.equal(makeQuizFlashcardConversionKey("quiz-1", "question-2"), "quiz-1:question-2");
});

test("duplicate review IDs replay only for the same card and deck", () => {
    const existing = { cardId: "card-1", deckId: "deck-1" };
    assert.equal(resolveFlashcardReviewReplay(null, "card-1", "deck-1"), "new");
    assert.equal(resolveFlashcardReviewReplay(existing, "card-1", "deck-1"), "replay");
    assert.equal(resolveFlashcardReviewReplay(existing, "card-2", "deck-1"), "conflict");
});
