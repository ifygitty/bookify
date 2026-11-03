import "server-only";

import { Types, type PipelineStage } from "mongoose";

import { connectToDatabase } from "@/database/mongoose";
import AiUsage from "@/database/models/ai-usage.model";
import Course from "@/database/models/course.model";
import CourseChatMessage from "@/database/models/course-chat-message.model";
import CourseQuiz from "@/database/models/course-quiz.model";
import FlashcardReview from "@/database/models/flashcard-review.model";
import StudySession from "@/database/models/study-session.model";
import User from "@/database/models/user.model";
import { chartStart, listBuckets, type DateRange } from "@/lib/admin-range";

export type SeriesPoint = { bucket: string; value: number | null };
export type BreakdownRow = { key: string; calls: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number; unpricedCalls: number };

const ACTIVE_USER = { deletedAt: { $exists: false } };

function dateMatch(field: string, from: Date | null, to: Date) {
    return from ? { [field]: { $gte: from, $lte: to } } : { [field]: { $lte: to } };
}

async function bucketCounts(
    model: { aggregate: (pipeline: PipelineStage[]) => Promise<{ _id: Date; value: number }[]> },
    dateField: string,
    range: DateRange,
    from: Date,
    extraMatch: Record<string, unknown> = {},
    valueExpr: Record<string, unknown> = { $sum: 1 },
): Promise<Map<number, number>> {
    const rows = await model.aggregate([
        { $match: { ...extraMatch, [dateField]: { $gte: from, $lte: range.to } } },
        {
            $group: {
                _id: { $dateTrunc: { date: `$${dateField}`, unit: range.interval, timezone: "UTC", startOfWeek: "monday" } },
                value: valueExpr,
            },
        },
    ]);
    return new Map(rows.map((row) => [new Date(row._id).getTime(), row.value]));
}

function toSeries(range: DateRange, from: Date, counts: Map<number, number>, nullBefore?: Date | null): SeriesPoint[] {
    return listBuckets(from, range.to, range.interval).map((bucket) => ({
        bucket: bucket.toISOString(),
        // Buckets before tracking began are unknown, not zero.
        value: nullBefore && bucket.getTime() < nullBefore.getTime() ? null : (counts.get(bucket.getTime()) ?? 0),
    }));
}

async function trackingStartedAt() {
    const first = await AiUsage.findOne().sort({ createdAt: 1 }).select("createdAt").lean<{ createdAt: Date }>();
    return first?.createdAt ?? null;
}

async function earliestUser() {
    const first = await User.findOne().sort({ createdAt: 1 }).select("createdAt").lean<{ createdAt: Date }>();
    return first?.createdAt ?? null;
}

export async function getEarliestDate() {
    await connectToDatabase();
    return earliestUser();
}

async function aiTotals(from: Date | null, to: Date, userClerkId?: string) {
    const [row] = await AiUsage.aggregate<{
        calls: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number; unpricedCalls: number;
    }>([
        { $match: { ...dateMatch("createdAt", from, to), ...(userClerkId ? { userClerkId } : {}) } },
        {
            $group: {
                _id: null,
                calls: { $sum: 1 },
                inputTokens: { $sum: "$inputTokens" },
                outputTokens: { $sum: "$outputTokens" },
                totalTokens: { $sum: "$totalTokens" },
                cost: { $sum: { $ifNull: ["$estimatedCost", 0] } },
                unpricedCalls: { $sum: { $cond: [{ $eq: ["$estimatedCost", null] }, 1, 0] } },
            },
        },
    ]);
    return row ?? { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, unpricedCalls: 0 };
}

async function periodStats(from: Date | null, to: Date) {
    const [newUsers, newCourses, materialsRow, ai, sessions, quizzes, reviews, activeRows] = await Promise.all([
        User.countDocuments({ ...ACTIVE_USER, ...dateMatch("createdAt", from, to) }),
        Course.countDocuments(dateMatch("createdAt", from, to)),
        Course.aggregate<{ count: number }>([
            { $unwind: "$materials" },
            { $match: dateMatch("materials.createdAt", from, to) },
            { $count: "count" },
        ]),
        aiTotals(from, to),
        StudySession.countDocuments(dateMatch("startedAt", from, to)),
        CourseQuiz.countDocuments({ status: "completed", ...dateMatch("submittedAt", from, to) }),
        FlashcardReview.countDocuments(dateMatch("reviewedAt", from, to)),
        StudySession.aggregate<{ n: number }>([
            { $match: dateMatch("startedAt", from, to) },
            { $group: { _id: "$userClerkId" } },
            { $count: "n" },
        ]),
    ]);
    return {
        newUsers,
        newCourses,
        newMaterials: materialsRow[0]?.count ?? 0,
        ai,
        sessions,
        quizzes,
        reviews,
        activeUsers: activeRows[0]?.n ?? 0,
    };
}

export type OverviewData = Awaited<ReturnType<typeof getOverview>>;

export async function getOverview(range: DateRange) {
    await connectToDatabase();
    const [totalUsers, totalCourses, totalMaterialsRow, current, previous, trackedSince, earliest] = await Promise.all([
        User.countDocuments(ACTIVE_USER),
        Course.countDocuments({}),
        Course.aggregate<{ n: number }>([{ $group: { _id: null, n: { $sum: { $size: { $ifNull: ["$materials", []] } } } } }]),
        periodStats(range.from, range.to),
        range.previous ? periodStats(range.previous.from, range.previous.to) : Promise.resolve(null),
        trackingStartedAt(),
        earliestUser(),
    ]);

    const from = chartStart(range, earliest);
    const [userGrowth, courses, materials, sessions, activeUsers, quizzes, reviews, aiTokens, aiCost, aiCalls] = await Promise.all([
        bucketCounts(User, "createdAt", range, from, ACTIVE_USER),
        bucketCounts(Course, "createdAt", range, from),
        (async () => {
            const rows = await Course.aggregate<{ _id: Date; value: number }>([
                { $unwind: "$materials" },
                { $match: { "materials.createdAt": { $gte: from, $lte: range.to } } },
                { $group: { _id: { $dateTrunc: { date: "$materials.createdAt", unit: range.interval, timezone: "UTC", startOfWeek: "monday" } }, value: { $sum: 1 } } },
            ]);
            return new Map(rows.map((row) => [new Date(row._id).getTime(), row.value]));
        })(),
        bucketCounts(StudySession, "startedAt", range, from),
        (async () => {
            const rows = await StudySession.aggregate<{ _id: Date; users: string[] }>([
                { $match: { startedAt: { $gte: from, $lte: range.to } } },
                { $group: { _id: { $dateTrunc: { date: "$startedAt", unit: range.interval, timezone: "UTC", startOfWeek: "monday" } }, users: { $addToSet: "$userClerkId" } } },
            ]);
            return new Map(rows.map((row) => [new Date(row._id).getTime(), row.users.length]));
        })(),
        bucketCounts(CourseQuiz, "submittedAt", range, from, { status: "completed" }),
        bucketCounts(FlashcardReview, "reviewedAt", range, from),
        bucketCounts(AiUsage, "createdAt", range, from, {}, { $sum: "$totalTokens" }),
        bucketCounts(AiUsage, "createdAt", range, from, {}, { $sum: { $ifNull: ["$estimatedCost", 0] } }),
        bucketCounts(AiUsage, "createdAt", range, from),
    ]);

    return {
        totals: { users: totalUsers, courses: totalCourses, materials: totalMaterialsRow[0]?.n ?? 0 },
        current,
        previous,
        trackedSince,
        series: {
            userGrowth: toSeries(range, from, userGrowth),
            courses: toSeries(range, from, courses),
            materials: toSeries(range, from, materials),
            sessions: toSeries(range, from, sessions),
            activeUsers: toSeries(range, from, activeUsers),
            quizzes: toSeries(range, from, quizzes),
            reviews: toSeries(range, from, reviews),
            aiTokens: toSeries(range, from, aiTokens, trackedSince),
            aiCost: toSeries(range, from, aiCost, trackedSince),
            aiCalls: toSeries(range, from, aiCalls, trackedSince),
        },
    };
}

async function aiBreakdown(field: "model" | "operation", from: Date | null, to: Date, userClerkId?: string): Promise<BreakdownRow[]> {
    const rows = await AiUsage.aggregate<{ _id: string } & Omit<BreakdownRow, "key">>([
        { $match: { ...dateMatch("createdAt", from, to), ...(userClerkId ? { userClerkId } : {}) } },
        {
            $group: {
                _id: `$${field}`,
                calls: { $sum: 1 },
                inputTokens: { $sum: "$inputTokens" },
                outputTokens: { $sum: "$outputTokens" },
                totalTokens: { $sum: "$totalTokens" },
                cost: { $sum: { $ifNull: ["$estimatedCost", 0] } },
                unpricedCalls: { $sum: { $cond: [{ $eq: ["$estimatedCost", null] }, 1, 0] } },
            },
        },
        { $sort: { totalTokens: -1 } },
    ]);
    return rows.map(({ _id, ...rest }) => ({ key: _id, ...rest }));
}

export async function getUsageAnalytics(range: DateRange) {
    await connectToDatabase();
    const [totals, byModel, byOperation, trackedSince, earliest, failed, topUsersRaw] = await Promise.all([
        aiTotals(range.from, range.to),
        aiBreakdown("model", range.from, range.to),
        aiBreakdown("operation", range.from, range.to),
        trackingStartedAt(),
        earliestUser(),
        AiUsage.countDocuments({ ...dateMatch("createdAt", range.from, range.to), status: "failed" }),
        AiUsage.aggregate<{ _id: string; totalTokens: number; cost: number; calls: number }>([
            { $match: dateMatch("createdAt", range.from, range.to) },
            { $group: { _id: "$userClerkId", totalTokens: { $sum: "$totalTokens" }, cost: { $sum: { $ifNull: ["$estimatedCost", 0] } }, calls: { $sum: 1 } } },
            { $sort: { totalTokens: -1 } },
            { $limit: 10 },
        ]),
    ]);

    const from = chartStart(range, earliest);
    const [tokens, input, output, cost, calls] = await Promise.all([
        bucketCounts(AiUsage, "createdAt", range, from, {}, { $sum: "$totalTokens" }),
        bucketCounts(AiUsage, "createdAt", range, from, {}, { $sum: "$inputTokens" }),
        bucketCounts(AiUsage, "createdAt", range, from, {}, { $sum: "$outputTokens" }),
        bucketCounts(AiUsage, "createdAt", range, from, {}, { $sum: { $ifNull: ["$estimatedCost", 0] } }),
        bucketCounts(AiUsage, "createdAt", range, from),
    ]);

    const users = await User.find({ userClerkId: { $in: topUsersRaw.map((row) => row._id) } })
        .select("userClerkId fullName email")
        .lean<{ _id: Types.ObjectId; userClerkId: string; fullName: string; email: string }[]>();
    const byClerk = new Map(users.map((user) => [user.userClerkId, user]));
    const topUsers = topUsersRaw.map((row) => ({
        userId: byClerk.get(row._id)?._id.toString() ?? null,
        name: byClerk.get(row._id)?.fullName ?? "Unknown user",
        email: byClerk.get(row._id)?.email ?? "",
        totalTokens: row.totalTokens,
        cost: row.cost,
        calls: row.calls,
    }));

    return {
        totals,
        failed,
        byModel,
        byOperation,
        topUsers,
        trackedSince,
        series: {
            tokens: toSeries(range, from, tokens, trackedSince),
            input: toSeries(range, from, input, trackedSince),
            output: toSeries(range, from, output, trackedSince),
            cost: toSeries(range, from, cost, trackedSince),
            calls: toSeries(range, from, calls, trackedSince),
        },
    };
}

export type UserSort = "name" | "email" | "createdAt" | "lastActiveAt" | "tokens" | "cost";
const SORT_FIELDS: Record<UserSort, string> = {
    name: "fullName",
    email: "email",
    createdAt: "createdAt",
    lastActiveAt: "lastActiveAt",
    tokens: "aiUsage.totalTokens",
    cost: "aiUsage.estimatedCost",
};

export function parseUserSort(value: string | undefined): UserSort {
    return value && value in SORT_FIELDS ? (value as UserSort) : "createdAt";
}

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listUsers(options: {
    page: number;
    pageSize: number;
    sort: UserSort;
    dir: 1 | -1;
    search?: string;
    registeredFrom?: Date;
    registeredTo?: Date;
    activity?: "active7" | "inactive30" | "never";
}) {
    await connectToDatabase();
    const filter: Record<string, unknown> = { ...ACTIVE_USER };
    const search = options.search?.trim().slice(0, 80);
    if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");
        filter.$or = [{ fullName: pattern }, { email: pattern }];
    }
    if (options.registeredFrom || options.registeredTo) {
        filter.createdAt = {
            ...(options.registeredFrom ? { $gte: options.registeredFrom } : {}),
            ...(options.registeredTo ? { $lte: options.registeredTo } : {}),
        };
    }
    const dayMs = 24 * 60 * 60 * 1000;
    if (options.activity === "active7") filter.lastActiveAt = { $gte: new Date(Date.now() - 7 * dayMs) };
    if (options.activity === "inactive30") {
        filter.$and = [{ $or: [{ lastActiveAt: { $lt: new Date(Date.now() - 30 * dayMs) } }, { lastActiveAt: { $exists: false } }] }];
    }
    if (options.activity === "never") filter.lastActiveAt = { $exists: false };

    const [total, users] = await Promise.all([
        User.countDocuments(filter),
        User.find(filter)
            .sort({ [SORT_FIELDS[options.sort]]: options.dir, _id: 1 })
            .skip((options.page - 1) * options.pageSize)
            .limit(options.pageSize)
            .lean(),
    ]);

    const clerkIds = users.map((user) => user.userClerkId);
    const [courseRows, sessionRows] = await Promise.all([
        Course.aggregate<{ _id: string; courses: number; materials: number }>([
            { $match: { clerkId: { $in: clerkIds } } },
            { $group: { _id: "$clerkId", courses: { $sum: 1 }, materials: { $sum: { $size: { $ifNull: ["$materials", []] } } } } },
        ]),
        StudySession.aggregate<{ _id: string; sessions: number; seconds: number }>([
            { $match: { userClerkId: { $in: clerkIds } } },
            { $group: { _id: "$userClerkId", sessions: { $sum: 1 }, seconds: { $sum: "$durationSeconds" } } },
        ]),
    ]);
    const courseMap = new Map(courseRows.map((row) => [row._id, row]));
    const sessionMap = new Map(sessionRows.map((row) => [row._id, row]));

    return {
        total,
        rows: users.map((user) => ({
            id: user._id.toString(),
            fullName: user.fullName,
            email: user.email,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt.toISOString(),
            lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
            courses: courseMap.get(user.userClerkId)?.courses ?? 0,
            materials: courseMap.get(user.userClerkId)?.materials ?? 0,
            sessions: sessionMap.get(user.userClerkId)?.sessions ?? 0,
            totalTokens: user.aiUsage?.totalTokens ?? 0,
            cost: user.aiUsage?.estimatedCost ?? 0,
            unpricedCalls: user.aiUsage?.unpricedCalls ?? 0,
        })),
    };
}

export async function getUserDetail(userObjectId: string) {
    await connectToDatabase();
    if (!Types.ObjectId.isValid(userObjectId)) return null;
    const user = await User.findById(userObjectId).lean();
    if (!user) return null;
    const clerkId = user.userClerkId;
    const now = new Date();

    const [courses, quizzes, reviewStats, sessionStats, recentSessions, usageTotals, byModel, byOperation, trackedSince, chatCount] = await Promise.all([
        Course.find({ clerkId }).sort({ createdAt: -1 }).select("name createdAt materials.title materials.fileSize materials.createdAt").lean<
            { _id: Types.ObjectId; name: string; createdAt: Date; materials: { title: string; fileSize: number; createdAt: Date }[] }[]
        >(),
        CourseQuiz.find({ clerkId, status: "completed" }).sort({ submittedAt: -1 }).limit(15)
            .select("courseId scorePercent submittedAt settings.questionType settings.questionCount").lean(),
        FlashcardReview.aggregate<{ _id: null; n: number; last: Date }>([
            { $match: { clerkId } },
            { $group: { _id: null, n: { $sum: 1 }, last: { $max: "$reviewedAt" } } },
        ]),
        StudySession.aggregate<{ _id: null; sessions: number; seconds: number; avg: number }>([
            { $match: { userClerkId: clerkId } },
            { $group: { _id: null, sessions: { $sum: 1 }, seconds: { $sum: "$durationSeconds" }, avg: { $avg: "$durationSeconds" } } },
        ]),
        StudySession.find({ userClerkId: clerkId }).sort({ startedAt: -1 }).limit(10).lean(),
        aiTotals(null, now, clerkId),
        aiBreakdown("model", null, now, clerkId),
        aiBreakdown("operation", null, now, clerkId),
        trackingStartedAt(),
        CourseChatMessage.countDocuments({ clerkId, role: "user" }),
    ]);

    const courseNames = new Map(courses.map((course) => [course._id.toString(), course.name]));
    const scored = quizzes.filter((quiz) => typeof quiz.scorePercent === "number");
    const averageScore = scored.length
        ? scored.reduce((sum, quiz) => sum + (quiz.scorePercent ?? 0), 0) / scored.length
        : null;

    return {
        user: {
            id: user._id.toString(),
            fullName: user.fullName,
            email: user.email,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt.toISOString(),
            lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
            deleted: Boolean(user.deletedAt),
        },
        courses: courses.map((course) => ({
            id: course._id.toString(),
            name: course.name,
            createdAt: course.createdAt?.toISOString() ?? null,
            materials: (course.materials ?? []).map((material) => ({
                title: material.title,
                fileSize: material.fileSize,
                createdAt: material.createdAt?.toISOString() ?? null,
            })),
        })),
        quizzes: quizzes.map((quiz) => ({
            id: quiz._id.toString(),
            course: courseNames.get(quiz.courseId.toString()) ?? "Deleted course",
            scorePercent: quiz.scorePercent ?? null,
            submittedAt: quiz.submittedAt?.toISOString() ?? null,
            type: quiz.settings?.questionType ?? "",
        })),
        averageScore,
        chatMessages: chatCount,
        flashcards: { reviews: reviewStats[0]?.n ?? 0, lastReviewedAt: reviewStats[0]?.last?.toISOString() ?? null },
        sessions: {
            total: sessionStats[0]?.sessions ?? 0,
            seconds: sessionStats[0]?.seconds ?? 0,
            averageSeconds: sessionStats[0]?.avg ?? 0,
            recent: recentSessions.map((session) => ({
                id: session._id.toString(),
                startedAt: session.startedAt.toISOString(),
                durationSeconds: session.durationSeconds,
                activityCount: session.activityCount,
                activityTypes: session.activityTypes,
                course: session.courseId ? courseNames.get(session.courseId.toString()) ?? null : null,
            })),
        },
        usage: { totals: usageTotals, byModel, byOperation, trackedSince },
    };
}

export async function getCourseAnalytics(range: DateRange) {
    await connectToDatabase();
    const earliest = await earliestUser();
    const [totalCourses, materialsRow, recent, perOwner, activity] = await Promise.all([
        Course.countDocuments({}),
        Course.aggregate<{ n: number; bytes: number }>([
            { $group: { _id: null, n: { $sum: { $size: { $ifNull: ["$materials", []] } } }, bytes: { $sum: { $sum: "$materials.fileSize" } } } },
        ]),
        Course.aggregate<{ _id: Types.ObjectId; name: string; clerkId: string; createdAt: Date; materials: number }>([
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            { $project: { name: 1, clerkId: 1, createdAt: 1, materials: { $size: { $ifNull: ["$materials", []] } } } },
        ]),
        Course.aggregate<{ _id: string; courses: number; materials: number }>([
            { $group: { _id: "$clerkId", courses: { $sum: 1 }, materials: { $sum: { $size: { $ifNull: ["$materials", []] } } } } },
            { $sort: { courses: -1 } },
            { $limit: 10 },
        ]),
        courseActivity(range),
    ]);

    const owners = await User.find({ userClerkId: { $in: [...recent.map((c) => c.clerkId), ...perOwner.map((o) => o._id)] } })
        .select("userClerkId fullName email")
        .lean<{ _id: Types.ObjectId; userClerkId: string; fullName: string; email: string }[]>();
    const ownerMap = new Map(owners.map((owner) => [owner.userClerkId, owner]));
    const ownerOf = (clerkId: string) => ({
        userId: ownerMap.get(clerkId)?._id.toString() ?? null,
        name: ownerMap.get(clerkId)?.fullName ?? "Unknown user",
    });

    const from = chartStart(range, earliest);
    const [coursesSeries] = await Promise.all([bucketCounts(Course, "createdAt", range, from)]);
    const userCount = await User.countDocuments(ACTIVE_USER);

    return {
        totalCourses,
        totalMaterials: materialsRow[0]?.n ?? 0,
        totalBytes: materialsRow[0]?.bytes ?? 0,
        averageCoursesPerUser: userCount ? totalCourses / userCount : 0,
        recent: recent.map((course) => ({
            id: course._id.toString(),
            name: course.name,
            createdAt: course.createdAt?.toISOString() ?? null,
            materials: course.materials,
            owner: ownerOf(course.clerkId),
        })),
        topOwners: perOwner.map((row) => ({ ...ownerOf(row._id), courses: row.courses, materials: row.materials })),
        mostActive: await Promise.all(
            activity.map(async (row) => {
                const course = await Course.findById(row.courseId).select("name clerkId").lean<{ name: string; clerkId: string }>();
                return {
                    id: row.courseId,
                    name: course?.name ?? "Deleted course",
                    owner: course ? ownerOf(course.clerkId) : { userId: null, name: "Unknown user" },
                    score: row.score,
                    breakdown: row.breakdown,
                };
            }),
        ),
        series: toSeries(range, from, coursesSeries),
    };
}

async function courseActivity(range: DateRange) {
    const [chats, quizzes, reviews, sessions] = await Promise.all([
        CourseChatMessage.aggregate<{ _id: Types.ObjectId; n: number }>([
            { $match: { role: "user", ...dateMatch("createdAt", range.from, range.to) } },
            { $group: { _id: "$courseId", n: { $sum: 1 } } },
        ]),
        CourseQuiz.aggregate<{ _id: Types.ObjectId; n: number }>([
            { $match: { status: "completed", ...dateMatch("submittedAt", range.from, range.to) } },
            { $group: { _id: "$courseId", n: { $sum: 1 } } },
        ]),
        FlashcardReview.aggregate<{ _id: Types.ObjectId; n: number }>([
            { $match: dateMatch("reviewedAt", range.from, range.to) },
            { $group: { _id: "$courseId", n: { $sum: 1 } } },
        ]),
        StudySession.aggregate<{ _id: Types.ObjectId; n: number }>([
            { $match: { courseId: { $exists: true, $ne: null }, ...dateMatch("startedAt", range.from, range.to) } },
            { $group: { _id: "$courseId", n: { $sum: 1 } } },
        ]),
    ]);

    const totals = new Map<string, { chats: number; quizzes: number; reviews: number; sessions: number }>();
    const add = (rows: { _id: Types.ObjectId; n: number }[], key: "chats" | "quizzes" | "reviews" | "sessions") => {
        for (const row of rows) {
            const id = row._id.toString();
            const entry = totals.get(id) ?? { chats: 0, quizzes: 0, reviews: 0, sessions: 0 };
            entry[key] += row.n;
            totals.set(id, entry);
        }
    };
    add(chats, "chats");
    add(quizzes, "quizzes");
    add(reviews, "reviews");
    add(sessions, "sessions");

    return [...totals.entries()]
        .map(([courseId, breakdown]) => ({
            courseId,
            breakdown,
            score: breakdown.chats + breakdown.quizzes + breakdown.reviews + breakdown.sessions,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
}

export type ActivityEvent = { type: string; at: string; userName: string; userId: string | null; detail: string };

export async function getActivityFeed(limit = 40) {
    await connectToDatabase();
    const [users, courses, materials, quizzes, reviews, sessions] = await Promise.all([
        User.find(ACTIVE_USER).sort({ createdAt: -1 }).limit(limit).select("fullName email createdAt").lean(),
        Course.find({}).sort({ createdAt: -1 }).limit(limit).select("name clerkId createdAt").lean<{ name: string; clerkId: string; createdAt: Date }[]>(),
        Course.aggregate<{ clerkId: string; course: string; title: string; at: Date }>([
            { $unwind: "$materials" },
            { $sort: { "materials.createdAt": -1 } },
            { $limit: limit },
            { $project: { clerkId: 1, course: "$name", title: "$materials.title", at: "$materials.createdAt" } },
        ]),
        CourseQuiz.find({ status: "completed" }).sort({ submittedAt: -1 }).limit(limit).select("clerkId courseId scorePercent submittedAt").lean(),
        FlashcardReview.aggregate<{ _id: { clerkId: string; courseId: Types.ObjectId; day: string }; n: number; at: Date }>([
            { $sort: { reviewedAt: -1 } },
            { $limit: limit * 5 },
            { $group: { _id: { clerkId: "$clerkId", courseId: "$courseId", day: { $dateToString: { format: "%Y-%m-%d", date: "$reviewedAt" } } }, n: { $sum: 1 }, at: { $max: "$reviewedAt" } } },
            { $sort: { at: -1 } },
            { $limit: limit },
        ]),
        StudySession.find({}).sort({ startedAt: -1 }).limit(limit).lean(),
    ]);

    const clerkIds = new Set<string>();
    courses.forEach((c) => clerkIds.add(c.clerkId));
    materials.forEach((m) => clerkIds.add(m.clerkId));
    quizzes.forEach((q) => clerkIds.add(q.clerkId));
    reviews.forEach((r) => clerkIds.add(r._id.clerkId));
    sessions.forEach((s) => clerkIds.add(s.userClerkId));
    const courseIds = new Set<string>();
    quizzes.forEach((q) => courseIds.add(q.courseId.toString()));
    reviews.forEach((r) => courseIds.add(r._id.courseId.toString()));
    sessions.forEach((s) => s.courseId && courseIds.add(s.courseId.toString()));

    const [people, courseDocs] = await Promise.all([
        User.find({ userClerkId: { $in: [...clerkIds] } }).select("userClerkId fullName").lean<{ _id: Types.ObjectId; userClerkId: string; fullName: string }[]>(),
        Course.find({ _id: { $in: [...courseIds] } }).select("name").lean<{ _id: Types.ObjectId; name: string }[]>(),
    ]);
    const personMap = new Map(people.map((person) => [person.userClerkId, person]));
    const courseMap = new Map(courseDocs.map((course) => [course._id.toString(), course.name]));
    const who = (clerkId: string) => ({
        userName: personMap.get(clerkId)?.fullName ?? "Unknown user",
        userId: personMap.get(clerkId)?._id.toString() ?? null,
    });

    const events: ActivityEvent[] = [
        ...users.map((user) => ({ type: "signup", at: user.createdAt.toISOString(), userName: user.fullName, userId: user._id.toString(), detail: "Joined Mentor" })),
        ...courses.map((course) => ({ type: "course", at: course.createdAt.toISOString(), ...who(course.clerkId), detail: `Created course “${course.name}”` })),
        ...materials.map((material) => ({ type: "material", at: new Date(material.at).toISOString(), ...who(material.clerkId), detail: `Uploaded “${material.title}” to ${material.course}` })),
        ...quizzes.filter((quiz) => quiz.submittedAt).map((quiz) => ({
            type: "quiz",
            at: quiz.submittedAt!.toISOString(),
            ...who(quiz.clerkId),
            detail: `Completed a quiz in ${courseMap.get(quiz.courseId.toString()) ?? "a course"}${typeof quiz.scorePercent === "number" ? ` (${Math.round(quiz.scorePercent)}%)` : ""}`,
        })),
        ...reviews.map((review) => ({
            type: "flashcards",
            at: review.at.toISOString(),
            ...who(review._id.clerkId),
            detail: `Reviewed ${review.n} flashcard${review.n === 1 ? "" : "s"} in ${courseMap.get(review._id.courseId.toString()) ?? "a course"}`,
        })),
        ...sessions.map((session) => ({
            type: "session",
            at: session.startedAt.toISOString(),
            ...who(session.userClerkId),
            detail: `Study session${session.courseId ? ` in ${courseMap.get(session.courseId.toString()) ?? "a course"}` : ""} · ${Math.max(1, Math.round(session.durationSeconds / 60))} min`,
        })),
    ];

    return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export async function listStudySessions(page: number, pageSize: number) {
    await connectToDatabase();
    const [total, sessions] = await Promise.all([
        StudySession.countDocuments({}),
        StudySession.find({}).sort({ startedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    ]);
    const people = await User.find({ userClerkId: { $in: sessions.map((s) => s.userClerkId) } })
        .select("userClerkId fullName")
        .lean<{ _id: Types.ObjectId; userClerkId: string; fullName: string }[]>();
    const courseDocs = await Course.find({ _id: { $in: sessions.flatMap((s) => (s.courseId ? [s.courseId] : [])) } })
        .select("name")
        .lean<{ _id: Types.ObjectId; name: string }[]>();
    const personMap = new Map(people.map((person) => [person.userClerkId, person]));
    const courseMap = new Map(courseDocs.map((course) => [course._id.toString(), course.name]));
    return {
        total,
        rows: sessions.map((session) => ({
            id: session._id.toString(),
            userName: personMap.get(session.userClerkId)?.fullName ?? "Unknown user",
            userId: personMap.get(session.userClerkId)?._id.toString() ?? null,
            course: session.courseId ? courseMap.get(session.courseId.toString()) ?? null : null,
            startedAt: session.startedAt.toISOString(),
            durationSeconds: session.durationSeconds,
            activityCount: session.activityCount,
            activityTypes: session.activityTypes,
            status: session.status,
        })),
    };
}
