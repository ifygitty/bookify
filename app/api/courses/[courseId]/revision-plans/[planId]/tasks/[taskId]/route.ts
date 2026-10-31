import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { connectToDatabase } from "@/database/mongoose";
import RevisionPlan from "@/database/models/revision-plan.model";
import { checkReschedule, findOpenDays, resolveToday } from "@/lib/revision-plan";
import { isValidId, loadPlanningContext, serializePlan, settingsFromPlan } from "@/lib/revision-plan-server";

type RouteContext = { params: Promise<{ courseId: string; planId: string; taskId: string }> };

const bodySchema = z.object({
    action: z.enum(["complete", "reopen", "reschedule"]),
    date: z.string().optional(),
    allowOverCapacity: z.boolean().default(false),
    today: z.string().optional(),
});

export async function PATCH(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to update revision tasks." }, { status: 401 });
    const { courseId, planId, taskId } = await params;
    if (!isValidId(courseId) || !isValidId(planId) || !isValidId(taskId)) {
        return NextResponse.json({ error: "Invalid revision task." }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid task action." }, { status: 400 });
    const { action, date, allowOverCapacity } = parsed.data;

    try {
        await connectToDatabase();
        const [planContext, plan] = await Promise.all([
            loadPlanningContext(userId, courseId),
            RevisionPlan.findOne({ _id: planId, clerkId: userId, courseId }).lean(),
        ]);
        if (!planContext || !plan) return NextResponse.json({ error: "Revision plan not found." }, { status: 404 });
        const task = plan.tasks.find((item) => item.id === taskId);
        if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
        const today = resolveToday(parsed.data.today);

        const filter = { _id: plan._id, clerkId: userId, tasks: { $elemMatch: { id: taskId, status: task.status, scheduledDate: task.scheduledDate } } };
        const options = { arrayFilters: [{ "t.id": taskId }] };
        let update: Record<string, unknown>;

        if (action === "complete") {
            if (task.status === "completed") return NextResponse.json({ plan: serializePlan(plan, planContext, today) });
            update = { $set: { "tasks.$[t].status": "completed", "tasks.$[t].completedAt": new Date() } };
        } else if (action === "reopen") {
            if (task.status === "pending") return NextResponse.json({ plan: serializePlan(plan, planContext, today) });
            update = { $set: { "tasks.$[t].status": "pending" }, $unset: { "tasks.$[t].completedAt": "" } };
        } else {
            if (task.status === "completed") {
                return NextResponse.json({ error: "Reopen a completed task before moving it." }, { status: 400 });
            }
            if (!date) return NextResponse.json({ error: "Choose a new date." }, { status: 400 });
            const settings = settingsFromPlan(plan);
            const otherTasks = plan.tasks
                .filter((item) => item.id !== taskId)
                .map((item) => ({ scheduledDate: item.scheduledDate, minutes: item.minutes }));
            const check = checkReschedule({ date, minutes: task.minutes, settings, today, otherTasks });
            if (!check.ok && !(check.code === "over_capacity" && allowOverCapacity)) {
                const suggestions = check.code === "over_capacity" || check.code === "unavailable_day"
                    ? findOpenDays({ minutes: task.minutes, settings, today, otherTasks })
                    : [];
                return NextResponse.json(
                    { error: check.error, code: check.code, suggestions },
                    { status: check.code === "over_capacity" ? 409 : 400 },
                );
            }
            update = {
                $set: {
                    "tasks.$[t].scheduledDate": date,
                    "tasks.$[t].overCapacity": !check.ok,
                },
            };
        }

        const result = await RevisionPlan.updateOne(filter, update, options);
        if (result.matchedCount === 0) {
            return NextResponse.json({ error: "This task changed in another tab. Reload and try again." }, { status: 409 });
        }
        const updated = await RevisionPlan.findById(plan._id).lean();
        return NextResponse.json({ plan: serializePlan(updated ?? plan, planContext, today) });
    } catch (error) {
        console.error("Failed to update revision task:", error);
        return NextResponse.json({ error: "Could not update the task." }, { status: 500 });
    }
}
