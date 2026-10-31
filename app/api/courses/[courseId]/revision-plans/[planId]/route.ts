import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import RevisionPlan from "@/database/models/revision-plan.model";
import {
    normalizeSettings,
    resolveToday,
    revisionSettingsSchema,
    type CompletedWork,
} from "@/lib/revision-plan";
import {
    isValidId,
    loadPlanningContext,
    proposeSchedule,
    serializePlan,
    settingsFromPlan,
} from "@/lib/revision-plan-server";

type RouteContext = { params: Promise<{ courseId: string; planId: string }> };

const patchSchema = z.object({
    settings: revisionSettingsSchema,
    confirm: z.boolean().default(false),
    acceptPartial: z.boolean().default(false),
    today: z.string().optional(),
});

async function authorize(context: RouteContext) {
    const { userId } = await auth();
    if (!userId) {
        return { error: NextResponse.json({ error: "Sign in to use revision plans." }, { status: 401 }) };
    }
    const { courseId, planId } = await context.params;
    if (!isValidId(courseId) || !isValidId(planId)) {
        return { error: NextResponse.json({ error: "Invalid revision plan." }, { status: 400 }) };
    }
    return { userId, courseId, planId };
}

export async function GET(request: Request, context: RouteContext) {
    const access = await authorize(context);
    if ("error" in access) return access.error;
    const { userId, courseId, planId } = access;

    try {
        await connectToDatabase();
        const [planContext, plan] = await Promise.all([
            loadPlanningContext(userId, courseId),
            RevisionPlan.findOne({ _id: planId, clerkId: userId, courseId }).lean(),
        ]);
        if (!planContext || !plan) return NextResponse.json({ error: "Revision plan not found." }, { status: 404 });
        const today = resolveToday(new URL(request.url).searchParams.get("today"));
        return NextResponse.json({ plan: serializePlan(plan, planContext, today) });
    } catch (error) {
        console.error("Failed to load revision plan:", error);
        return NextResponse.json({ error: "Could not load the revision plan." }, { status: 500 });
    }
}

export async function PATCH(request: Request, context: RouteContext) {
    const access = await authorize(context);
    if ("error" in access) return access.error;
    const { userId, courseId, planId } = access;

    const body: unknown = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Check the plan details and try again." },
            { status: 400 },
        );
    }

    try {
        await connectToDatabase();
        const [planContext, plan] = await Promise.all([
            loadPlanningContext(userId, courseId),
            RevisionPlan.findOne({ _id: planId, clerkId: userId, courseId }).lean(),
        ]);
        if (!planContext || !plan) return NextResponse.json({ error: "Revision plan not found." }, { status: 404 });

        const settings = normalizeSettings(parsed.data.settings);
        const today = resolveToday(parsed.data.today);
        const current = normalizeSettings(settingsFromPlan(plan));
        const scheduleUnchanged =
            current.dateType === settings.dateType &&
            current.targetDate === settings.targetDate &&
            JSON.stringify(current.availability) === JSON.stringify(settings.availability) &&
            JSON.stringify(current.priorityTopicIds) === JSON.stringify(settings.priorityTopicIds);

        const guard = { _id: plan._id, clerkId: userId, updatedAt: plan.updatedAt };
        if (scheduleUnchanged) {
            const result = await RevisionPlan.updateOne(guard, { $set: { title: settings.title } });
            if (result.matchedCount === 0) {
                return NextResponse.json({ error: "This plan changed in another tab. Reload and try again." }, { status: 409 });
            }
            const updated = await RevisionPlan.findById(plan._id).lean();
            return NextResponse.json({ plan: serializePlan(updated ?? plan, planContext, today) });
        }

        const completed = plan.tasks.filter((task) => task.status === "completed");
        const completedWork: CompletedWork[] = completed.map((task) => ({
            topicId: task.topicId,
            stageKey: task.stageKey,
            scheduledDate: task.scheduledDate,
            minutes: task.minutes,
        }));
        const proposal = proposeSchedule({ context: planContext, settings, today, completedWork });
        if (!proposal.ok) return NextResponse.json({ error: proposal.error }, { status: 400 });
        const { schedule } = proposal;
        const pendingReplaced = plan.tasks.length - completed.length;

        if (!parsed.data.confirm) {
            return NextResponse.json({
                preview: {
                    keptCompleted: completed.length,
                    pendingReplaced,
                    newTasks: schedule.tasks.length,
                    shortfall: schedule.shortfall,
                    requiredMinutes: schedule.requiredMinutes,
                    availableMinutes: schedule.availableMinutes,
                    studyDays: schedule.studyDays,
                },
            });
        }
        if (schedule.shortfall.taskCount > 0 && !parsed.data.acceptPartial) {
            return NextResponse.json(
                {
                    error: "There is not enough study time to schedule every remaining task. Add days or time, or accept a partial plan.",
                    shortfall: schedule.shortfall,
                },
                { status: 409 },
            );
        }

        const tasks = [
            ...completed.map((task) => ({ ...task })),
            ...schedule.tasks.map((task) => ({
                id: new Types.ObjectId().toString(),
                topicId: task.topicId,
                topicName: task.topicName,
                type: task.type,
                stageKey: task.stageKey,
                title: task.title,
                scheduledDate: task.scheduledDate,
                minutes: task.minutes,
                status: "pending" as const,
                overCapacity: false,
                order: 0,
            })),
        ].map((task, order) => ({ ...task, order }));

        const result = await RevisionPlan.updateOne(guard, {
            $set: {
                title: settings.title,
                dateType: settings.dateType,
                targetDate: settings.targetDate,
                availability: settings.availability,
                priorityTopicIds: settings.priorityTopicIds,
                shortfall: schedule.shortfall,
                lastScheduledAt: new Date(),
                tasks,
            },
        });
        if (result.matchedCount === 0) {
            return NextResponse.json({ error: "This plan changed in another tab. Reload and try again." }, { status: 409 });
        }
        const updated = await RevisionPlan.findById(plan._id).lean();
        return NextResponse.json({ plan: serializePlan(updated ?? plan, planContext, today) });
    } catch (error) {
        console.error("Failed to update revision plan:", error);
        return NextResponse.json({ error: "Could not update the revision plan." }, { status: 500 });
    }
}

export async function DELETE(_request: Request, context: RouteContext) {
    const access = await authorize(context);
    if ("error" in access) return access.error;
    const { userId, courseId, planId } = access;

    try {
        await connectToDatabase();
        const result = await RevisionPlan.deleteOne({ _id: planId, clerkId: userId, courseId });
        if (result.deletedCount === 0) return NextResponse.json({ error: "Revision plan not found." }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete revision plan:", error);
        return NextResponse.json({ error: "Could not delete the revision plan." }, { status: 500 });
    }
}
