import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import RevisionPlan from "@/database/models/revision-plan.model";
import {
    MAX_PLANS_PER_COURSE,
    normalizeSettings,
    resolveToday,
    revisionSettingsSchema,
} from "@/lib/revision-plan";
import {
    buildInsights,
    isValidId,
    loadPlanningContext,
    proposeSchedule,
    serializePlan,
} from "@/lib/revision-plan-server";

type RouteContext = { params: Promise<{ courseId: string }> };

const createSchema = z.object({
    settings: revisionSettingsSchema,
    confirm: z.boolean().default(false),
    acceptPartial: z.boolean().default(false),
    today: z.string().optional(),
});

export async function GET(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to view revision plans." }, { status: 401 });
    const { courseId } = await params;
    if (!isValidId(courseId)) return NextResponse.json({ error: "Invalid course." }, { status: 400 });

    try {
        await connectToDatabase();
        const context = await loadPlanningContext(userId, courseId);
        if (!context) return NextResponse.json({ error: "Course not found." }, { status: 404 });
        const today = resolveToday(new URL(request.url).searchParams.get("today"));
        const plans = await RevisionPlan.find({ clerkId: userId, courseId: new Types.ObjectId(courseId) })
            .sort({ createdAt: -1 })
            .lean();
        return NextResponse.json({
            today,
            hasOutline: context.hasOutline,
            topics: context.topics.map(({ id, name, status }) => ({ id, name, status })),
            topicInsights: buildInsights(context, []).map(({ topicId, name, status, weak, flashcardsDue, quizEvidence }) => ({
                topicId,
                name,
                status,
                weak,
                flashcardsDue,
                quizEvidence,
            })),
            plans: plans.map((plan) => serializePlan(plan, context, today)),
        });
    } catch (error) {
        console.error("Failed to load revision plans:", error);
        return NextResponse.json({ error: "Could not load your revision plans." }, { status: 500 });
    }
}

export async function POST(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to create a revision plan." }, { status: 401 });
    const { courseId } = await params;
    if (!isValidId(courseId)) return NextResponse.json({ error: "Invalid course." }, { status: 400 });

    const body: unknown = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Check the plan details and try again." },
            { status: 400 },
        );
    }

    try {
        await connectToDatabase();
        const context = await loadPlanningContext(userId, courseId);
        if (!context) return NextResponse.json({ error: "Course not found." }, { status: 404 });

        const settings = normalizeSettings(parsed.data.settings);
        const today = resolveToday(parsed.data.today);
        const proposal = proposeSchedule({ context, settings, today });
        if (!proposal.ok) return NextResponse.json({ error: proposal.error }, { status: 400 });
        const { schedule, insights } = proposal;

        if (!parsed.data.confirm) {
            return NextResponse.json({
                preview: {
                    tasks: schedule.tasks.map((task) => ({
                        topicName: task.topicName,
                        type: task.type,
                        title: task.title,
                        scheduledDate: task.scheduledDate,
                        minutes: task.minutes,
                    })),
                    shortfall: schedule.shortfall,
                    requiredMinutes: schedule.requiredMinutes,
                    availableMinutes: schedule.availableMinutes,
                    studyDays: schedule.studyDays,
                    topics: insights
                        .map(({ topicId, name, score, reasons }) => ({ topicId, name, score, reasons }))
                        .sort((left, right) => right.score - left.score),
                },
            });
        }

        if (schedule.shortfall.taskCount > 0 && !parsed.data.acceptPartial) {
            return NextResponse.json(
                {
                    error: "There is not enough study time to schedule every task. Add days or time, or accept a partial plan.",
                    shortfall: schedule.shortfall,
                },
                { status: 409 },
            );
        }

        const courseObjectId = new Types.ObjectId(courseId);
        const existing = await RevisionPlan.countDocuments({ clerkId: userId, courseId: courseObjectId });
        if (existing >= MAX_PLANS_PER_COURSE) {
            return NextResponse.json(
                { error: `You can keep up to ${MAX_PLANS_PER_COURSE} revision plans per course. Delete one first.` },
                { status: 409 },
            );
        }

        const created = await RevisionPlan.create({
            clerkId: userId,
            courseId: courseObjectId,
            title: settings.title,
            dateType: settings.dateType,
            targetDate: settings.targetDate,
            startDate: today,
            availability: settings.availability,
            priorityTopicIds: settings.priorityTopicIds,
            shortfall: schedule.shortfall,
            lastScheduledAt: new Date(),
            tasks: schedule.tasks.map((task, order) => ({
                id: new Types.ObjectId().toString(),
                topicId: task.topicId,
                topicName: task.topicName,
                type: task.type,
                stageKey: task.stageKey,
                title: task.title,
                scheduledDate: task.scheduledDate,
                minutes: task.minutes,
                status: "pending",
                order,
            })),
        });
        return NextResponse.json({ plan: serializePlan(created.toObject(), context, today) }, { status: 201 });
    } catch (error) {
        console.error("Failed to create revision plan:", error);
        return NextResponse.json({ error: "Could not create the revision plan." }, { status: 500 });
    }
}
