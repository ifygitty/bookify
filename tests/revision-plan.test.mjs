import assert from "node:assert/strict";
import test from "node:test";
import {
    addDays,
    buildStudySlots,
    calculatePlanProgress,
    checkReschedule,
    findOpenDays,
    findOutlineTopicId,
    generateSchedule,
    getStudyWindow,
    matchSignals,
    normalizeSettings,
    recommendPriorityTopics,
    resolveToday,
    revisionSettingsSchema,
    scoreTopics,
    validateScheduleWindow,
    weekdayOf,
} from "../lib/revision-plan.ts";

const TODAY = "2030-01-01";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const ids = ["64b000000000000000000001", "64b000000000000000000002", "64b000000000000000000003", "64b000000000000000000004"];

function settings(overrides = {}) {
    return normalizeSettings(revisionSettingsSchema.parse({
        title: "",
        dateType: "exam",
        targetDate: addDays(TODAY, 15),
        availability: ALL_DAYS.map((weekday) => ({ weekday, minutes: 60 })),
        priorityTopicIds: [],
        ...overrides,
    }));
}

function topics(count = 4, status = "not_started") {
    return ids.slice(0, count).map((id, order) => ({ id, name: `Topic ${order + 1} basics`, status, order }));
}

function plan(planSettings, planTopics = topics(), quiz = [], cards = [], completedWork = []) {
    const insights = scoreTopics(planTopics, quiz, cards, planSettings.priorityTopicIds);
    return generateSchedule({ settings: planSettings, today: TODAY, insights, completedWork });
}

function minutesByDate(tasks) {
    const totals = new Map();
    for (const task of tasks) totals.set(task.scheduledDate, (totals.get(task.scheduledDate) ?? 0) + task.minutes);
    return totals;
}

test("creates a valid schedule that never exceeds daily limits or the exam date", () => {
    const planSettings = settings({ availability: ALL_DAYS.map((weekday) => ({ weekday, minutes: 45 })) });
    const result = plan(planSettings);
    assert.equal(result.ok, true);
    assert.equal(result.shortfall.taskCount, 0);
    assert.ok(result.tasks.length > 0);
    for (const task of result.tasks) {
        assert.ok(task.scheduledDate >= TODAY);
        assert.ok(task.scheduledDate < planSettings.targetDate, "exam day must stay free");
    }
    for (const total of minutesByDate(result.tasks).values()) assert.ok(total <= 45);
});

test("only schedules on selected weekdays", () => {
    const planSettings = settings({ availability: [{ weekday: 1, minutes: 120 }, { weekday: 4, minutes: 120 }] });
    const result = plan(planSettings);
    assert.equal(result.ok, true);
    for (const task of result.tasks) assert.ok([1, 4].includes(weekdayOf(task.scheduledDate)));
});

test("an examination date is excluded from the study window but a target date is included", () => {
    const target = addDays(TODAY, 5);
    assert.equal(getStudyWindow(settings({ dateType: "exam", targetDate: target }), TODAY).lastDate, addDays(TODAY, 4));
    assert.equal(getStudyWindow(settings({ dateType: "target", targetDate: target }), TODAY).lastDate, target);
    const slots = buildStudySlots(settings({ dateType: "target", targetDate: TODAY }), TODAY);
    assert.deepEqual(slots.map((slot) => slot.date), [TODAY]);
});

test("rejects past dates, far-future dates and invalid availability", () => {
    assert.match(validateScheduleWindow(settings({ targetDate: addDays(TODAY, 15) }), addDays(TODAY, 30)), /past/);
    assert.match(validateScheduleWindow(settings({ targetDate: addDays(TODAY, 400) }), TODAY), /within/);
    assert.equal(validateScheduleWindow(settings({ dateType: "target", targetDate: TODAY }), TODAY), null);
    const base = { dateType: "exam", targetDate: addDays(TODAY, 5), title: "" };
    assert.equal(revisionSettingsSchema.safeParse({ ...base, availability: [] }).success, false);
    assert.equal(revisionSettingsSchema.safeParse({ ...base, availability: [{ weekday: 1, minutes: 10 }] }).success, false);
    assert.equal(revisionSettingsSchema.safeParse({ ...base, availability: [{ weekday: 1, minutes: 33 }] }).success, false);
    assert.equal(revisionSettingsSchema.safeParse({ ...base, availability: [{ weekday: 1, minutes: 30 }, { weekday: 1, minutes: 60 }] }).success, false);
    assert.equal(revisionSettingsSchema.safeParse({ ...base, availability: [{ weekday: 9, minutes: 60 }] }).success, false);
});

test("reports a shortfall instead of exceeding limits when time is insufficient", () => {
    const planSettings = settings({ dateType: "target", targetDate: TODAY, availability: ALL_DAYS.map((weekday) => ({ weekday, minutes: 30 })) });
    const result = plan(planSettings);
    assert.equal(result.ok, true);
    assert.ok(result.shortfall.taskCount > 0);
    assert.ok(result.shortfall.minutes > 0);
    assert.ok(result.shortfall.topicNames.length > 0);
    for (const total of minutesByDate(result.tasks).values()) assert.ok(total <= 30);
});

test("fails clearly when no study day exists before the exam", () => {
    const result = plan(settings({ targetDate: TODAY }));
    assert.equal(result.ok, false);
    assert.match(result.error, /no study days/i);
});

test("prioritises weak and not-started topics ahead of strong completed ones", () => {
    const planTopics = [
        { id: ids[0], name: "Strong topic", status: "completed", order: 0 },
        { id: ids[1], name: "Weak topic", status: "in_progress", order: 1 },
        { id: ids[2], name: "Fresh topic", status: "not_started", order: 2 },
    ];
    const quiz = [
        { name: "Strong topic", questionsAttempted: 10, accuracyPercent: 95, hasSufficientEvidence: true },
        { name: "Weak topic", questionsAttempted: 6, accuracyPercent: 30, hasSufficientEvidence: true },
    ];
    const insights = scoreTopics(planTopics, quiz, [], []);
    const find = (id) => insights.find((insight) => insight.topicId === id);
    assert.ok(find(ids[1]).score > find(ids[2]).score);
    assert.ok(find(ids[2]).score > find(ids[0]).score);
    assert.ok(find(ids[1]).weak);
    assert.ok(find(ids[0]).strong);
    assert.ok(find(ids[1]).reasons.length >= 2);

    const result = plan(settings(), planTopics, quiz);
    const firstDate = (topicId) => result.tasks.find((task) => task.topicId === topicId).scheduledDate;
    assert.ok(firstDate(ids[1]) <= firstDate(ids[0]));
    assert.ok(result.tasks.some((task) => task.topicId === ids[1] && task.type === "quiz"));
    assert.ok(!result.tasks.some((task) => task.topicId === ids[0] && task.type === "practice"));
});

test("a student-prioritised topic scores higher than the same topic without priority", () => {
    const planTopics = topics(2);
    const base = scoreTopics(planTopics, [], [], []);
    const boosted = scoreTopics(planTopics, [], [], [ids[1]]);
    assert.ok(boosted[1].score > base[1].score);
    assert.ok(boosted[1].reasons.includes("Prioritized by you"));
});

test("recalculation keeps completed work and does not schedule it again", () => {
    const planSettings = settings();
    const first = plan(planSettings);
    const done = first.tasks.slice(0, 3).map((task) => ({
        topicId: task.topicId,
        stageKey: task.stageKey,
        scheduledDate: task.scheduledDate,
        minutes: task.minutes,
    }));
    const second = plan(planSettings, topics(), [], [], done);
    assert.equal(second.ok, true);
    const doneKeys = new Set(done.map((work) => `${work.topicId}|${work.stageKey}`));
    for (const task of second.tasks) assert.ok(!doneKeys.has(`${task.topicId}|${task.stageKey}`));
    assert.equal(second.tasks.length, first.tasks.length - done.length);

    const used = minutesByDate(done);
    for (const [date, minutes] of minutesByDate(second.tasks)) assert.ok(minutes + (used.get(date) ?? 0) <= 60);
});

test("calculates progress counts and percentages", () => {
    const empty = calculatePlanProgress([], TODAY);
    assert.equal(empty.total, 0);
    assert.equal(empty.completionPercent, null);

    const progress = calculatePlanProgress(
        [
            { status: "completed", scheduledDate: "2029-12-30", minutes: 30 },
            { status: "pending", scheduledDate: "2029-12-31", minutes: 20 },
            { status: "pending", scheduledDate: TODAY, minutes: 25 },
            { status: "pending", scheduledDate: "2030-01-05", minutes: 25 },
            { status: "bogus", scheduledDate: TODAY, minutes: 25 },
        ],
        TODAY,
    );
    assert.equal(progress.total, 4);
    assert.equal(progress.completed, 1);
    assert.equal(progress.overdue, 1);
    assert.equal(progress.pending, 2);
    assert.equal(progress.completionPercent, 25);
    assert.equal(progress.remainingMinutes, 70);
});

test("reschedule checks reject invalid, past, out-of-window, unavailable and full days", () => {
    const day = addDays(TODAY, 1);
    const planSettings = settings({
        availability: [
            { weekday: weekdayOf(day), minutes: 60 },
            { weekday: weekdayOf(addDays(TODAY, 2)), minutes: 60 },
        ],
    });
    const check = (date, otherTasks = []) => checkReschedule({ date, minutes: 25, settings: planSettings, today: TODAY, otherTasks });

    assert.equal(check("not-a-date").code, "invalid_date");
    assert.equal(check(addDays(TODAY, -1)).code, "past");
    assert.equal(check(planSettings.targetDate).code, "outside_window");
    assert.equal(check(addDays(TODAY, 3)).code, "unavailable_day");
    assert.equal(check(day, [{ scheduledDate: day, minutes: 40 }]).code, "over_capacity");
    assert.equal(check(day, [{ scheduledDate: day, minutes: 35 }]).ok, true);

    const open = findOpenDays({
        minutes: 25,
        settings: planSettings,
        today: TODAY,
        otherTasks: [{ scheduledDate: day, minutes: 60 }],
    });
    assert.ok(!open.includes(day));
    assert.ok(open.includes(addDays(TODAY, 2)));
});

test("matches quiz and flashcard topics by exact or unambiguous phrase", () => {
    const outline = [
        { id: "a", name: "Double Entry Bookkeeping" },
        { id: "b", name: "Trial Balance" },
        { id: "c", name: "Balance Sheet" },
    ];
    const signals = [
        { name: "double entry bookkeeping" },
        { name: "Double entry bookkeeping basics" },
        { name: "Balance" },
        { name: "Unrelated Subject" },
    ];
    const matched = matchSignals(outline, signals, (signal) => signal.name);
    assert.equal(matched.get("a").length, 2);
    assert.equal(matched.has("b"), false);
    assert.equal(matched.has("c"), false);
});

test("recommends only topics with weak quiz performance and explains why", () => {
    const planTopics = [
        { id: ids[0], name: "Weak topic", status: "in_progress", order: 0 },
        { id: ids[1], name: "Strong topic", status: "in_progress", order: 1 },
        { id: ids[2], name: "No data topic", status: "not_started", order: 2 },
        { id: ids[3], name: "Thin data topic", status: "in_progress", order: 3 },
    ];
    const quiz = [
        { name: "Weak topic", questionsAttempted: 6, accuracyPercent: 30, hasSufficientEvidence: true },
        { name: "Strong topic", questionsAttempted: 8, accuracyPercent: 90, hasSufficientEvidence: true },
        { name: "Thin data topic", questionsAttempted: 2, accuracyPercent: 0, hasSufficientEvidence: false },
    ];
    const recommended = recommendPriorityTopics(scoreTopics(planTopics, quiz, [], []));
    assert.deepEqual(recommended.map((item) => item.topicId), [ids[0]]);
    assert.match(recommended[0].reason, /Recommended because your quiz performance on this topic is low/);
    assert.deepEqual(recommendPriorityTopics(scoreTopics(planTopics, [], [], [])), []);
});

test("recommendations are editable and scheduling uses the final selection only", () => {
    const planTopics = topics(2, "in_progress");
    const quiz = [{ name: "Topic 1 basics", questionsAttempted: 5, accuracyPercent: 20, hasSufficientEvidence: true }];
    const [recommendation] = recommendPriorityTopics(scoreTopics(planTopics, quiz, [], []));
    assert.equal(recommendation.topicId, ids[0]);

    const countFor = (priorityTopicIds, topicId) =>
        plan(settings({ priorityTopicIds }), planTopics, quiz).tasks.filter((task) => task.topicId === topicId && task.type === "practice").length;
    // Deselecting a weak topic does not remove its weakness-driven practice; selecting another topic adds priority practice.
    assert.equal(countFor([ids[0]], ids[0]), countFor([], ids[0]));
    assert.ok(countFor([ids[1]], ids[1]) > countFor([], ids[1]));
});

test("matches differently worded quiz topics to the outline when the match is clear", () => {
    const outline = [
        { id: "a", name: "The Accounting Equation and Financial Statements" },
        { id: "b", name: "Depreciation Methods" },
        { id: "c", name: "Inventory Valuation" },
    ];
    const matched = matchSignals(
        outline,
        [{ n: "Financial statements & accounting equations" }, { n: "Methods of depreciation" }, { n: "Valuation" }, { n: "Cash" }],
        (signal) => signal.n,
    );
    assert.equal(matched.get("a")?.length, 1);
    assert.equal(matched.get("b")?.length, 1);
    assert.equal(matched.has("c"), true);
    assert.equal(matched.size, 3);
});

test("resolves a quiz topic to one outline topic or none", () => {
    const topics = [
        { id: "a", name: "Revenue Recognition (IFRS 15)" },
        { id: "b", name: "Leases (IFRS 16)" },
    ];
    assert.equal(findOutlineTopicId(topics, "revenue recognition ifrs 15"), "a");
    assert.equal(findOutlineTopicId(topics, "Leases"), "b");
    assert.equal(findOutlineTopicId(topics, "Group accounts"), null);
});

test("accepts the client's date only within one day of the server date", () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    assert.equal(resolveToday("2030-01-02", now), "2030-01-02");
    assert.equal(resolveToday("2029-12-31", now), "2029-12-31");
    assert.equal(resolveToday("2030-03-01", now), "2030-01-01");
    assert.equal(resolveToday("nonsense", now), "2030-01-01");
    assert.equal(resolveToday(undefined, now), "2030-01-01");
});
