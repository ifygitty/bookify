"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import {
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    LoaderCircle,
    Pencil,
    Plus,
    Trash2,
    X,
} from "lucide-react";
import {
    MAX_DAILY_MINUTES,
    MAX_PRIORITY_TOPICS,
    MIN_DAILY_MINUTES,
    parseIsoDate,
    findOutlineTopicId,
    recommendPriorityTopics,
    weekdayOf,
} from "@/lib/revision-plan";

type TaskType = "study" | "review_materials" | "practice" | "quiz" | "flashcards" | "revise";
type Shortfall = { taskCount: number; minutes: number; topicNames: string[] };
type PlanTask = {
    id: string;
    topicId: string;
    topicName: string;
    topicAvailable: boolean;
    type: TaskType;
    title: string;
    scheduledDate: string;
    minutes: number;
    status: "pending" | "completed";
    overCapacity: boolean;
    overdue: boolean;
    materials: { id: string; title: string }[];
};
type Plan = {
    id: string;
    title: string;
    dateType: "exam" | "target";
    targetDate: string;
    daysRemaining: number;
    availability: { weekday: number; minutes: number }[];
    priorityTopicIds: string[];
    shortfall: Shortfall;
    progress: {
        total: number;
        completed: number;
        pending: number;
        overdue: number;
        completionPercent: number | null;
        remainingMinutes: number;
    };
    tasks: PlanTask[];
};
type PlannerData = {
    today: string;
    hasOutline: boolean;
    topics: { id: string; name: string; status: string }[];
    topicInsights: {
        topicId: string;
        name: string;
        weak: boolean;
        flashcardsDue: number;
        quizEvidence: { questions: number; accuracyPercent: number | null } | null;
    }[];
    plans: Plan[];
};
type Preview = {
    tasks?: { scheduledDate: string; minutes: number }[];
    shortfall: Shortfall;
    requiredMinutes: number;
    availableMinutes: number;
    studyDays: number;
    topics?: { topicId: string; name: string; score: number; reasons: string[] }[];
    keptCompleted?: number;
    pendingReplaced?: number;
    newTasks?: number;
};
type FormState = {
    title: string;
    dateType: "exam" | "target";
    targetDate: string;
    minutes: Record<number, number>;
    priorityTopicIds: string[];
};
type RescheduleError = { message: string; suggestions: string[]; canForce: boolean };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPE_LABELS: Record<TaskType, string> = {
    study: "Study",
    review_materials: "Review",
    practice: "Practice",
    quiz: "Quiz",
    flashcards: "Flashcards",
    revise: "Revise",
};

function localToday(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
}

function formatDate(value: string, withWeekday = true): string {
    const date = parseIsoDate(value);
    if (!date) return value;
    return date.toLocaleDateString(undefined, {
        timeZone: "UTC",
        weekday: withWeekday ? "short" : undefined,
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function errorText(result: unknown, fallback: string): string {
    return typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
        ? result.error
        : fallback;
}

function emptyForm(): FormState {
    return {
        title: "",
        dateType: "exam",
        targetDate: "",
        minutes: { 1: 60, 2: 60, 3: 60, 4: 60, 5: 60 },
        priorityTopicIds: [],
    };
}

function formFromPlan(plan: Plan): FormState {
    return {
        title: plan.title,
        dateType: plan.dateType,
        targetDate: plan.targetDate,
        minutes: Object.fromEntries(plan.availability.map((item) => [item.weekday, item.minutes])),
        priorityTopicIds: plan.priorityTopicIds,
    };
}

export default function CourseRevisionPlanner({
    courseId,
    onOpenQuiz,
    onOpenFlashcards,
    addTopicRequest,
}: {
    courseId: string;
    onOpenQuiz: (materialIds: string[]) => void;
    onOpenFlashcards: () => void;
    addTopicRequest?: { topic: string; nonce: number } | null;
}) {
    const { confirmDialog } = useDialogs();
    const [data, setData] = useState<PlannerData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [actionError, setActionError] = useState("");
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [view, setView] = useState<"all" | "day">("all");
    const [dayDate, setDayDate] = useState<string | null>(null);
    const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
    const [reschedulingId, setReschedulingId] = useState<string | null>(null);
    const [rescheduleDate, setRescheduleDate] = useState("");
    const [rescheduleError, setRescheduleError] = useState<RescheduleError | null>(null);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [acceptPartial, setAcceptPartial] = useState(false);
    const [formError, setFormError] = useState("");
    const [isWorking, setIsWorking] = useState(false);
    const [handledRequestNonce, setHandledRequestNonce] = useState(0);
    const [pendingAdd, setPendingAdd] = useState<{ topicName: string; topicId: string; target: string } | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setLoadError("");
        try {
            const response = await fetch(`/api/courses/${courseId}/revision-plans?today=${localToday()}`);
            const result: unknown = await response.json();
            if (!response.ok) throw new Error(errorText(result, "Could not load your revision plans."));
            const loaded = result as PlannerData;
            setData(loaded);
            setSelectedPlanId((current) =>
                loaded.plans.some((plan) => plan.id === current) ? current : loaded.plans[0]?.id ?? null,
            );
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : "Could not load your revision plans.");
        } finally {
            setIsLoading(false);
        }
    }, [courseId]);

    useEffect(() => {
        void load();
    }, [load]);

    const plan = data?.plans.find((item) => item.id === selectedPlanId) ?? null;
    const today = data?.today ?? localToday();

    // A new "add to revision plan" request from the quiz is turned into a pending choice once the planner data is loaded.
    if (addTopicRequest && data && addTopicRequest.nonce !== handledRequestNonce) {
        setHandledRequestNonce(addTopicRequest.nonce);
        setPendingAdd({
            topicName: addTopicRequest.topic,
            topicId: findOutlineTopicId(data.topics, addTopicRequest.topic) ?? "",
            target: selectedPlanId ?? "new",
        });
    }

    const pendingPlan = pendingAdd && pendingAdd.target !== "new"
        ? data?.plans.find((item) => item.id === pendingAdd.target) ?? null
        : null;
    const pendingCoversAll = pendingPlan !== null && pendingPlan.priorityTopicIds.length === 0;
    const pendingAlreadyIncluded = pendingPlan !== null && pendingAdd !== null && pendingPlan.priorityTopicIds.includes(pendingAdd.topicId);

    const continuePendingAdd = () => {
        if (!pendingAdd?.topicId) return;
        if (pendingPlan) {
            setSelectedPlanId(pendingPlan.id);
            openEdit(pendingPlan, [pendingAdd.topicId]);
        } else {
            openCreate([pendingAdd.topicId]);
        }
        setPendingAdd(null);
    };
    const dates = useMemo(
        () => [...new Set(plan?.tasks.map((task) => task.scheduledDate) ?? [])].sort(),
        [plan],
    );
    const activeDay = useMemo(() => {
        if (dayDate && dates.includes(dayDate)) return dayDate;
        return dates.find((date) => date >= today) ?? dates[dates.length - 1] ?? null;
    }, [dayDate, dates, today]);

    const weakTopics = useMemo(() => {
        if (!plan || !data) return [];
        return data.topicInsights.filter((topic) => topic.weak && !plan.priorityTopicIds.includes(topic.topicId));
    }, [plan, data]);

    const replacePlan = (updated: Plan) =>
        setData((current) =>
            current ? { ...current, plans: current.plans.map((item) => (item.id === updated.id ? updated : item)) } : current,
        );

    const recommendations = useMemo(
        () => new Map(recommendPriorityTopics(data?.topicInsights ?? []).map((item) => [item.topicId, item.reason])),
        [data],
    );

    const openCreate = (presetTopicIds?: string[]) => {
        setEditingPlanId(null);
        setForm({ ...emptyForm(), priorityTopicIds: presetTopicIds ?? [...recommendations.keys()] });
        setPreview(null);
        setAcceptPartial(false);
        setFormError("");
        setIsFormOpen(true);
    };

    const openEdit = (target: Plan, extraPriorityIds: string[] = []) => {
        const base = formFromPlan(target);
        setEditingPlanId(target.id);
        setForm({ ...base, priorityTopicIds: [...new Set([...base.priorityTopicIds, ...extraPriorityIds])] });
        setPreview(null);
        setAcceptPartial(false);
        setFormError("");
        setIsFormOpen(true);
    };

    const closeForm = () => {
        if (!isWorking) setIsFormOpen(false);
    };

    const updateForm = (changes: Partial<FormState>) => {
        setForm((current) => ({ ...current, ...changes }));
        setPreview(null);
        setAcceptPartial(false);
        setFormError("");
    };

    const validateForm = (): string | null => {
        if (!form.targetDate) return "Choose your exam or target date.";
        if (form.targetDate < today) return "The date cannot be in the past.";
        const days = Object.entries(form.minutes);
        if (days.length === 0) return "Choose at least one study day.";
        for (const [, minutes] of days) {
            if (!Number.isInteger(minutes) || minutes < MIN_DAILY_MINUTES || minutes > MAX_DAILY_MINUTES || minutes % 5 !== 0) {
                return `Study time must be ${MIN_DAILY_MINUTES}–${MAX_DAILY_MINUTES} minutes, in 5-minute steps.`;
            }
        }
        return null;
    };

    const submitForm = async (confirm: boolean) => {
        const problem = validateForm();
        if (problem) {
            setFormError(problem);
            return;
        }
        setIsWorking(true);
        setFormError("");
        try {
            const settings = {
                title: form.title.trim(),
                dateType: form.dateType,
                targetDate: form.targetDate,
                availability: Object.entries(form.minutes)
                    .map(([weekday, minutes]) => ({ weekday: Number(weekday), minutes }))
                    .sort((left, right) => left.weekday - right.weekday),
                priorityTopicIds: form.priorityTopicIds,
            };
            const url = editingPlanId
                ? `/api/courses/${courseId}/revision-plans/${editingPlanId}`
                : `/api/courses/${courseId}/revision-plans`;
            const response = await fetch(url, {
                method: editingPlanId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings, confirm, acceptPartial, today: localToday() }),
            });
            const result: unknown = await response.json();
            if (!response.ok) throw new Error(errorText(result, "Could not save the revision plan."));
            const body = result as { preview?: Preview; plan?: Plan };
            if (!confirm && body.preview) {
                setPreview(body.preview);
                return;
            }
            if (body.plan) {
                await load();
                setSelectedPlanId(body.plan.id);
                setIsFormOpen(false);
            }
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "Could not save the revision plan.");
        } finally {
            setIsWorking(false);
        }
    };

    const taskAction = async (task: PlanTask, body: Record<string, unknown>) => {
        if (!plan) return false;
        setBusyTaskId(task.id);
        setActionError("");
        try {
            const response = await fetch(`/api/courses/${courseId}/revision-plans/${plan.id}/tasks/${task.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...body, today: localToday() }),
            });
            const result: unknown = await response.json();
            if (!response.ok) {
                const details = result as { suggestions?: string[]; code?: string };
                if (body.action === "reschedule") {
                    setRescheduleError({
                        message: errorText(result, "Could not move this task."),
                        suggestions: details.suggestions ?? [],
                        canForce: details.code === "over_capacity",
                    });
                    return false;
                }
                throw new Error(errorText(result, "Could not update this task."));
            }
            replacePlan((result as { plan: Plan }).plan);
            return true;
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Could not update this task.");
            return false;
        } finally {
            setBusyTaskId(null);
        }
    };

    const startReschedule = (task: PlanTask) => {
        setReschedulingId(task.id);
        setRescheduleDate(task.scheduledDate < today ? today : task.scheduledDate);
        setRescheduleError(null);
    };

    const submitReschedule = async (task: PlanTask, date: string, allowOverCapacity = false) => {
        if (!date) {
            setRescheduleError({ message: "Choose a date.", suggestions: [], canForce: false });
            return;
        }
        const moved = await taskAction(task, { action: "reschedule", date, allowOverCapacity });
        if (moved) {
            setReschedulingId(null);
            setRescheduleError(null);
        }
    };

    const deletePlan = async () => {
        if (!plan) return;
        const confirmed = await confirmDialog({
            title: "Delete this revision plan?",
            description: `Are you sure you want to delete "${plan.title || "this revision plan"}"? This action cannot be undone.`,
            confirmText: "Delete plan",
            variant: "danger",
        });
        if (!confirmed) return;
        setActionError("");
        const response = await fetch(`/api/courses/${courseId}/revision-plans/${plan.id}`, { method: "DELETE" });
        if (!response.ok) {
            const result: unknown = await response.json().catch(() => null);
            setActionError(errorText(result, "Could not delete the revision plan."));
            return;
        }
        await load();
    };

    const openTask = (task: PlanTask) => {
        const materialIds = task.materials.map((material) => material.id);
        if (task.type === "flashcards") onOpenFlashcards();
        else onOpenQuiz(materialIds);
    };

    const renderTask = (task: PlanTask) => {
        const isBusy = busyTaskId === task.id;
        const isCompleted = task.status === "completed";
        return (
            <li key={task.id} className={`rounded-xl border px-3 py-3 ${task.overdue ? "border-red-200 bg-red-50/60" : "border-[#212a3b]/10 bg-white"}`}>
                <div className="flex items-start gap-3">
                    <input
                        type="checkbox"
                        checked={isCompleted}
                        disabled={isBusy}
                        onChange={() => void taskAction(task, { action: isCompleted ? "reopen" : "complete" })}
                        aria-label={`${isCompleted ? "Reopen" : "Complete"} ${task.title}`}
                        className="mt-1 size-4 shrink-0 accent-[#663820]"
                    />
                    <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${isCompleted ? "text-[#3d485e] line-through" : "text-[#212a3b]"}`}>{task.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#3d485e]">
                            <span className="rounded-full bg-[#f8f4e9] px-2 py-0.5 font-medium text-[#663820]">{TYPE_LABELS[task.type]}</span>
                            <span>{task.minutes} min</span>
                            <span>{formatDate(task.scheduledDate)}</span>
                            {task.overdue && <span className="font-semibold text-red-700">Overdue</span>}
                            {task.overCapacity && <span className="font-semibold text-amber-800">Over daily limit</span>}
                            {!task.topicAvailable && <span className="font-semibold text-amber-800">Topic removed from outline</span>}
                        </p>
                        {!isCompleted && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {task.topicAvailable && (task.type === "practice" || task.type === "quiz") && (
                                    <button type="button" onClick={() => openTask(task)} className="rounded-lg border border-[#663820] px-2.5 py-1 text-xs font-semibold text-[#663820] hover:bg-[#fff6e5]">
                                        Open practice questions
                                    </button>
                                )}
                                {task.type === "flashcards" && (
                                    <button type="button" onClick={onOpenFlashcards} className="rounded-lg border border-[#663820] px-2.5 py-1 text-xs font-semibold text-[#663820] hover:bg-[#fff6e5]">
                                        Open flashcards
                                    </button>
                                )}
                                {task.materials.slice(0, 3).map((material) => (
                                    <a
                                        key={material.id}
                                        href={`/api/courses/${courseId}/materials/${material.id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="max-w-[14rem] truncate rounded-lg bg-[#f8f4e9] px-2.5 py-1 text-xs font-medium text-[#663820] hover:underline"
                                    >
                                        {material.title}
                                    </a>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => (reschedulingId === task.id ? setReschedulingId(null) : startReschedule(task))}
                                    className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[#3d485e] hover:bg-[#f8f4e9]"
                                >
                                    Reschedule
                                </button>
                            </div>
                        )}
                        {reschedulingId === task.id && (
                            <div className="mt-3 rounded-lg bg-[#f8f4e9] p-3">
                                <div className="flex flex-wrap items-end gap-2">
                                    <label className="text-xs font-medium text-[#3d485e]">
                                        New date
                                        <input
                                            type="date"
                                            value={rescheduleDate}
                                            min={today}
                                            onChange={(event) => {
                                                setRescheduleDate(event.target.value);
                                                setRescheduleError(null);
                                            }}
                                            className="mt-1 block rounded-lg border border-[#212a3b]/15 bg-white px-2 py-1.5 text-sm"
                                        />
                                    </label>
                                    <button type="button" disabled={isBusy} onClick={() => void submitReschedule(task, rescheduleDate)} className="rounded-lg bg-[#663820] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                                        {isBusy ? "Moving..." : "Move task"}
                                    </button>
                                    <button type="button" onClick={() => setReschedulingId(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-[#3d485e] hover:bg-white">
                                        Cancel
                                    </button>
                                </div>
                                {rescheduleError && (
                                    <div role="alert" className="mt-2 text-xs text-red-700">
                                        <p>{rescheduleError.message}</p>
                                        {rescheduleError.suggestions.length > 0 && (
                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[#3d485e]">
                                                <span>Days with free time:</span>
                                                {rescheduleError.suggestions.map((date) => (
                                                    <button key={date} type="button" onClick={() => void submitReschedule(task, date)} className="rounded-full border border-[#663820] px-2.5 py-1 font-semibold text-[#663820] hover:bg-white">
                                                        {formatDate(date)}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {rescheduleError.canForce && (
                                            <button type="button" onClick={() => void submitReschedule(task, rescheduleDate, true)} className="mt-2 rounded-lg border border-amber-700 px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-50">
                                                Add anyway and go over my daily limit
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </li>
        );
    };

    const groups = useMemo(() => {
        if (!plan) return [];
        const pending = plan.tasks.filter((task) => task.status === "pending");
        return [
            { key: "overdue", label: "Overdue", tasks: pending.filter((task) => task.scheduledDate < today) },
            { key: "today", label: "Today", tasks: pending.filter((task) => task.scheduledDate === today) },
            { key: "upcoming", label: "Upcoming", tasks: pending.filter((task) => task.scheduledDate > today) },
            { key: "completed", label: "Completed", tasks: plan.tasks.filter((task) => task.status === "completed") },
        ];
    }, [plan, today]);

    const dayTasks = plan && activeDay ? plan.tasks.filter((task) => task.scheduledDate === activeDay) : [];
    const dayCapacity = plan && activeDay ? plan.availability.find((item) => item.weekday === weekdayOf(activeDay))?.minutes ?? 0 : 0;
    const dayIndex = activeDay ? dates.indexOf(activeDay) : -1;
    const editingPlan = editingPlanId ? data?.plans.find((item) => item.id === editingPlanId) : null;

    return (
        <section aria-labelledby="revision-planner-title" className="rounded-2xl border border-[#212a3b]/10 bg-white p-5 shadow-soft-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 id="revision-planner-title" className="flex items-center gap-2 text-xl font-semibold text-[#212a3b]">
                        <CalendarDays className="size-5 text-[#663820]" />Revision plan
                    </h2>
                    <p className="mt-1 text-sm text-[#3d485e]">
                        Turn your outline, quiz results and flashcards into a day-by-day schedule before your exam.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => openCreate()}
                    disabled={!data?.hasOutline || (data?.plans.length ?? 0) >= 5}
                    className="btn-primary shrink-0 justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Plus className="size-5" />Create Revision Plan
                </button>
            </div>
            {data && !data.hasOutline && (
                <p role="status" className="mt-3 text-xs text-[#3d485e]">
                    Create Revision Plan is unavailable because your course outline has no topics. Add or generate outline topics to enable it.
                </p>
            )}

            {pendingAdd && data && (
                <div role="region" aria-label="Add topic to revision plan" className="mt-5 rounded-xl border border-[#663820]/30 bg-[#fff6e5] p-4 text-sm text-[#212a3b]">
                    <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold">Add a topic from your quiz to a revision plan</p>
                        <button type="button" onClick={() => setPendingAdd(null)} aria-label="Dismiss" className="rounded-lg p-1 hover:bg-white">
                            <X className="size-4" />
                        </button>
                    </div>
                    {!data.hasOutline ? (
                        <p className="mt-2 text-[#3d485e]">Create a course outline first. The planner schedules the topics in your outline.</p>
                    ) : (
                        <div className="mt-3 space-y-3">
                            <label className="block text-xs font-medium text-[#3d485e]">
                                Topic{pendingAdd.topicId ? "" : ` (“${pendingAdd.topicName}” was not found in your outline; choose the closest topic)`}
                                <select
                                    value={pendingAdd.topicId}
                                    onChange={(event) => setPendingAdd({ ...pendingAdd, topicId: event.target.value })}
                                    className="mt-1 block w-full rounded-lg border border-[#212a3b]/15 bg-white px-3 py-2 text-sm"
                                >
                                    <option value="">Choose a topic</option>
                                    {data.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                                </select>
                            </label>
                            <label className="block text-xs font-medium text-[#3d485e]">
                                Revision plan
                                <select
                                    value={pendingAdd.target}
                                    onChange={(event) => setPendingAdd({ ...pendingAdd, target: event.target.value })}
                                    className="mt-1 block w-full rounded-lg border border-[#212a3b]/15 bg-white px-3 py-2 text-sm"
                                >
                                    {data.plans.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            Add to {item.title || `${item.dateType === "exam" ? "exam" : "target"} plan ${formatDate(item.targetDate, false)}`}
                                        </option>
                                    ))}
                                    <option value="new" disabled={data.plans.length >= 5}>
                                        Create a new plan for this topic{data.plans.length >= 5 ? " (limit of 5 plans reached)" : ""}
                                    </option>
                                </select>
                            </label>
                            {pendingCoversAll && (
                                <p className="text-xs text-[#3d485e]">This plan already covers every topic in your outline, so this topic is already included.</p>
                            )}
                            {pendingAlreadyIncluded && (
                                <p className="text-xs text-[#3d485e]">This topic is already in the selected plan.</p>
                            )}
                            <button
                                type="button"
                                onClick={continuePendingAdd}
                                disabled={!pendingAdd.topicId || pendingCoversAll || pendingAlreadyIncluded}
                                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {pendingPlan ? "Review plan update" : "Set up new plan"}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {isLoading ? (
                <p className="mt-6 flex items-center gap-2 text-sm text-[#3d485e]"><LoaderCircle className="size-4 animate-spin" />Loading your revision plans...</p>
            ) : loadError ? (
                <div role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {loadError}{" "}
                    <button type="button" onClick={() => void load()} className="font-semibold underline">Try again</button>
                </div>
            ) : !data?.hasOutline && !plan ? (
                <p className="mt-5 rounded-xl border border-dashed border-[#212a3b]/20 px-4 py-6 text-center text-sm text-[#3d485e]">
                    Create a course outline first. The planner schedules the topics in your outline.
                </p>
            ) : !plan ? (
                <p className="mt-5 rounded-xl border border-dashed border-[#212a3b]/20 px-4 py-6 text-center text-sm text-[#3d485e]">
                    You have no revision plan yet. Select “Create Revision Plan” and choose your exam date and the days you can study.
                </p>
            ) : (
                <div className="mt-5 space-y-5">
                    {actionError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {data.plans.length > 1 ? (
                            <label className="text-sm font-medium text-[#3d485e]">
                                Plan
                                <select
                                    value={plan.id}
                                    onChange={(event) => {
                                        setSelectedPlanId(event.target.value);
                                        setDayDate(null);
                                        setReschedulingId(null);
                                    }}
                                    className="ml-2 rounded-lg border border-[#212a3b]/15 bg-white px-3 py-2 text-sm"
                                >
                                    {data.plans.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.title || `${item.dateType === "exam" ? "Exam" : "Target"} ${formatDate(item.targetDate, false)}`}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <h3 className="font-semibold text-[#212a3b]">{plan.title || "Revision plan"}</h3>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => openEdit(plan)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#663820] px-3 py-2 text-sm font-semibold text-[#663820] hover:bg-[#fff6e5]">
                                <Pencil className="size-4" />Update plan
                            </button>
                            <button type="button" onClick={() => void deletePlan()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                                <Trash2 className="size-4" />Delete
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl bg-[#f8f4e9] p-4">
                            <p className="text-xs font-medium text-[#3d485e]">{plan.dateType === "exam" ? "Exam" : "Target date"}</p>
                            <p className="mt-1 font-semibold text-[#212a3b]">{formatDate(plan.targetDate)}</p>
                            <p className="text-xs text-[#3d485e]">
                                {plan.daysRemaining === 0 ? "Today" : `${plan.daysRemaining} day${plan.daysRemaining === 1 ? "" : "s"} remaining`}
                            </p>
                        </div>
                        <div className="rounded-xl bg-[#f8f4e9] p-4">
                            <p className="text-xs font-medium text-[#3d485e]">Progress</p>
                            <p className="mt-1 font-semibold text-[#212a3b]">
                                {plan.progress.completionPercent === null ? "No tasks" : `${plan.progress.completionPercent}%`}
                            </p>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={plan.progress.completionPercent ?? 0} aria-label="Revision plan progress">
                                <div className="h-full bg-[#663820]" style={{ width: `${plan.progress.completionPercent ?? 0}%` }} />
                            </div>
                        </div>
                        <div className="rounded-xl bg-[#f8f4e9] p-4">
                            <p className="text-xs font-medium text-[#3d485e]">Tasks</p>
                            <p className="mt-1 text-sm text-[#212a3b]">
                                {plan.progress.completed} of {plan.progress.total} completed
                            </p>
                            <p className="text-xs text-[#3d485e]">{plan.progress.pending} pending · {plan.progress.overdue} overdue</p>
                        </div>
                        <div className="rounded-xl bg-[#f8f4e9] p-4">
                            <p className="text-xs font-medium text-[#3d485e]">Time left to study</p>
                            <p className="mt-1 font-semibold text-[#212a3b]">{plan.progress.remainingMinutes} min</p>
                        </div>
                    </div>

                    {plan.shortfall.taskCount > 0 && (
                        <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                            <span>
                                This plan is partial: {plan.shortfall.taskCount} task{plan.shortfall.taskCount === 1 ? "" : "s"} ({plan.shortfall.minutes} min) did not fit
                                {plan.shortfall.topicNames.length > 0 ? `, including ${plan.shortfall.topicNames.slice(0, 4).join(", ")}` : ""}. Add study days or time and update the plan.
                            </span>
                        </p>
                    )}
                    {plan.progress.overdue > 0 && (
                        <p role="status" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                            You have {plan.progress.overdue} overdue task{plan.progress.overdue === 1 ? "" : "s"}. Reschedule them one by one, or use “Update plan” to rebuild the remaining schedule from today.
                        </p>
                    )}
                    {weakTopics.length > 0 && (
                        <p className="rounded-xl bg-[#fff6e5] px-4 py-3 text-sm text-[#663820]">
                            Quiz results suggest extra practice for {weakTopics.slice(0, 4).map((topic) => topic.name).join(", ")}.{" "}
                            <button type="button" onClick={() => openEdit(plan, weakTopics.map((topic) => topic.topicId).slice(0, MAX_PRIORITY_TOPICS))} className="font-semibold underline">
                                Prioritise them
                            </button>
                        </p>
                    )}

                    <div className="flex gap-2" role="tablist" aria-label="Plan view">
                        {(["all", "day"] as const).map((item) => (
                            <button
                                key={item}
                                type="button"
                                role="tab"
                                aria-selected={view === item}
                                onClick={() => setView(item)}
                                className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === item ? "bg-[#663820] text-white" : "border border-[#212a3b]/15 text-[#3d485e] hover:bg-[#f8f4e9]"}`}
                            >
                                {item === "all" ? "All tasks" : "By day"}
                            </button>
                        ))}
                    </div>

                    {plan.tasks.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-[#212a3b]/20 px-4 py-6 text-center text-sm text-[#3d485e]">This plan has no scheduled tasks.</p>
                    ) : view === "day" && activeDay ? (
                        <div>
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <button type="button" disabled={dayIndex <= 0} onClick={() => setDayDate(dates[dayIndex - 1])} aria-label="Previous day" className="rounded-lg border border-[#212a3b]/15 p-2 disabled:opacity-40">
                                    <ChevronLeft className="size-4" />
                                </button>
                                <div className="text-center">
                                    <p className="font-semibold text-[#212a3b]">{formatDate(activeDay)}{activeDay === today ? " (today)" : ""}</p>
                                    <p className="text-xs text-[#3d485e]">
                                        {dayTasks.reduce((sum, task) => sum + task.minutes, 0)} of {dayCapacity} min planned
                                    </p>
                                </div>
                                <button type="button" disabled={dayIndex >= dates.length - 1} onClick={() => setDayDate(dates[dayIndex + 1])} aria-label="Next day" className="rounded-lg border border-[#212a3b]/15 p-2 disabled:opacity-40">
                                    <ChevronRight className="size-4" />
                                </button>
                            </div>
                            <ul className="space-y-2">{dayTasks.map(renderTask)}</ul>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {groups.map((group) =>
                                group.tasks.length === 0 ? null : (
                                    <div key={group.key}>
                                        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#212a3b]">
                                            {group.key === "completed" && <CheckCircle2 className="size-4 text-green-700" />}
                                            {group.label} ({group.tasks.length})
                                        </h3>
                                        <ul className="space-y-2">{group.tasks.map(renderTask)}</ul>
                                    </div>
                                ),
                            )}
                        </div>
                    )}
                </div>
            )}

            {isFormOpen && data && typeof document !== "undefined" && createPortal(
                <div
                    className="fixed inset-0 z-[100] flex items-end justify-center overflow-x-hidden bg-[#030a14]/80 p-0 sm:items-center sm:p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="revision-form-title"
                    onKeyDown={(event) => {
                        if (event.key === "Escape") closeForm();
                    }}
                >
                    <div className="max-h-[92dvh] w-full min-w-0 max-w-2xl overflow-x-hidden overflow-y-auto rounded-t-2xl bg-white p-4 text-[#212a3b] shadow-xl sm:rounded-2xl sm:p-6">
                        <div className="flex items-start justify-between gap-3">
                            <h3 id="revision-form-title" className="text-lg font-semibold text-[#212a3b]">
                                {editingPlan ? "Update revision plan" : "Create revision plan"}
                            </h3>
                            <button type="button" onClick={closeForm} aria-label="Close" className="rounded-lg p-1.5 hover:bg-[#f8f4e9]"><X className="size-5" /></button>
                        </div>

                        {preview ? (
                            <div className="mt-4 space-y-4">
                                {editingPlan && (
                                    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                        Updating replaces your {preview.pendingReplaced} pending task{preview.pendingReplaced === 1 ? "" : "s"} with {preview.newTasks} newly scheduled
                                        task{preview.newTasks === 1 ? "" : "s"}. Your {preview.keptCompleted} completed task{preview.keptCompleted === 1 ? " is" : "s are"} kept.
                                    </p>
                                )}
                                <p className="text-sm text-[#3d485e]">
                                    {preview.studyDays} study day{preview.studyDays === 1 ? "" : "s"} · {preview.requiredMinutes} min of work · {preview.availableMinutes} min available.
                                </p>
                                {preview.shortfall.taskCount > 0 ? (
                                    <div role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                        <p className="font-semibold">Not everything fits.</p>
                                        <p className="mt-1">
                                            {preview.shortfall.taskCount} task{preview.shortfall.taskCount === 1 ? "" : "s"} ({preview.shortfall.minutes} min) cannot be scheduled
                                            {preview.shortfall.topicNames.length > 0 ? `, including ${preview.shortfall.topicNames.slice(0, 5).join(", ")}` : ""}. Go back to add days, more time or a later date.
                                        </p>
                                        <label className="mt-3 flex items-start gap-2 font-medium">
                                            <input type="checkbox" checked={acceptPartial} onChange={(event) => setAcceptPartial(event.target.checked)} className="mt-0.5 size-4 accent-[#663820]" />
                                            Save a partial plan without the tasks that do not fit
                                        </label>
                                    </div>
                                ) : (
                                    <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">Every task fits within your daily study time.</p>
                                )}
                                {preview.topics && form.priorityTopicIds.length > 0 && (
                                    <div>
                                        <h4 className="mb-2 text-sm font-semibold text-[#212a3b]">Topics in this plan</h4>
                                        <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                                            {preview.topics
                                                .filter((topic) => form.priorityTopicIds.includes(topic.topicId))
                                                .map((topic) => (
                                                <li key={topic.topicId} className="rounded-lg bg-[#f8f4e9] px-3 py-2">
                                                    <p className="font-medium text-[#212a3b]">{topic.name}</p>
                                                    <p className="text-xs text-[#3d485e]">{topic.reasons.join(" · ")}</p>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {formError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <button type="button" onClick={() => setPreview(null)} disabled={isWorking} className="rounded-xl border border-[#212a3b]/15 px-4 py-3 font-semibold text-[#3d485e] hover:bg-[#f8f4e9]">Back</button>
                                    <button
                                        type="button"
                                        onClick={() => void submitForm(true)}
                                        disabled={isWorking || (preview.shortfall.taskCount > 0 && !acceptPartial)}
                                        className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isWorking && <LoaderCircle className="size-4 animate-spin" />}
                                        {editingPlan ? "Replace pending tasks" : "Save plan"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form
                                className="mt-4 space-y-5"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void submitForm(false);
                                }}
                            >
                                <label className="block text-sm font-medium text-[#212a3b]">
                                    Plan name (optional)
                                    <input
                                        value={form.title}
                                        maxLength={100}
                                        onChange={(event) => updateForm({ title: event.target.value })}
                                        placeholder="e.g. Final exam"
                                        className="mt-1 w-full rounded-xl border border-[#212a3b]/15 bg-white px-3 py-2.5 text-sm text-[#212a3b]"
                                    />
                                </label>

                                <fieldset>
                                    <legend className="text-sm font-medium text-[#212a3b]">What is the date?</legend>
                                    <div className="mt-2 flex flex-wrap gap-4 text-sm">
                                        {(["exam", "target"] as const).map((type) => (
                                            <label key={type} className="flex items-center gap-2">
                                                <input type="radio" name="date-type" checked={form.dateType === type} onChange={() => updateForm({ dateType: type })} className="accent-[#663820]" />
                                                {type === "exam" ? "Exam date (kept free of study)" : "Target completion date"}
                                            </label>
                                        ))}
                                    </div>
                                    <input
                                        type="date"
                                        value={form.targetDate}
                                        min={today}
                                        onChange={(event) => updateForm({ targetDate: event.target.value })}
                                        aria-label="Exam or target date"
                                        className="mt-3 w-full max-w-full rounded-xl border border-[#212a3b]/15 bg-white px-3 py-2.5 text-sm text-[#212a3b] sm:w-auto"
                                    />
                                </fieldset>

                                <fieldset>
                                    <legend className="text-sm font-medium text-[#212a3b]">Days you can study and minutes per day</legend>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        {WEEKDAYS.map((label, weekday) => {
                                            const minutes = form.minutes[weekday];
                                            const selected = minutes !== undefined;
                                            return (
                                                <div key={label} className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2 ${selected ? "border-[#663820] bg-[#fff6e5]" : "border-[#212a3b]/10"}`}>
                                                    <label className="flex flex-1 items-center gap-2 text-sm font-medium">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={(event) => {
                                                                const next = { ...form.minutes };
                                                                if (event.target.checked) next[weekday] = Object.values(form.minutes)[0] ?? 60;
                                                                else delete next[weekday];
                                                                updateForm({ minutes: next });
                                                            }}
                                                            className="size-4 accent-[#663820]"
                                                        />
                                                        {label}
                                                    </label>
                                                    {selected && (
                                                        <label className="flex items-center gap-1 text-xs text-[#3d485e]">
                                                            <input
                                                                type="number"
                                                                min={MIN_DAILY_MINUTES}
                                                                max={MAX_DAILY_MINUTES}
                                                                step={5}
                                                                value={Number.isNaN(minutes) ? "" : minutes}
                                                                onChange={(event) => updateForm({ minutes: { ...form.minutes, [weekday]: event.target.valueAsNumber } })}
                                                                aria-label={`Minutes on ${label}`}
                                                                className="w-20 rounded-lg border border-[#212a3b]/15 bg-white px-2 py-1.5 text-sm"
                                                            />
                                                            min
                                                        </label>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {Object.keys(form.minutes).length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const first = Object.values(form.minutes)[0];
                                                updateForm({ minutes: Object.fromEntries(Object.keys(form.minutes).map((day) => [day, first])) });
                                            }}
                                            className="mt-2 text-xs font-semibold text-[#663820] underline"
                                        >
                                            Use the first day’s minutes for every selected day
                                        </button>
                                    )}
                                </fieldset>

                                {data.topics.length > 0 && (
                                    <fieldset>
                                        <legend className="text-sm font-medium text-[#212a3b]">Topics to include (optional)</legend>
                                        <p className="mt-1 text-xs text-[#3d485e]">
                                            Tick the topics you want in this plan. If you tick none, every topic in your outline is included.
                                        </p>
                                        {recommendations.size > 0 && (
                                            <p className="mt-1 text-xs text-[#3d485e]">
                                                Topics where your quiz results are low are suggested below. You can untick them or choose any others.
                                            </p>
                                        )}
                                        <div className="mt-2 grid max-h-52 gap-1 overflow-y-auto sm:grid-cols-2">
                                            {data.topics.map((topic) => {
                                                const checked = form.priorityTopicIds.includes(topic.id);
                                                const reason = recommendations.get(topic.id);
                                                return (
                                                    <label key={topic.id} className="flex items-start gap-2 text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            disabled={!checked && form.priorityTopicIds.length >= MAX_PRIORITY_TOPICS}
                                                            onChange={() =>
                                                                updateForm({
                                                                    priorityTopicIds: checked
                                                                        ? form.priorityTopicIds.filter((id) => id !== topic.id)
                                                                        : [...form.priorityTopicIds, topic.id],
                                                                })
                                                            }
                                                            className="mt-0.5 size-4 shrink-0 accent-[#663820]"
                                                        />
                                                        <span className="min-w-0">
                                                            <span className="block truncate">{topic.name}</span>
                                                            {reason && <span className="block text-xs text-[#663820]">{reason}</span>}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </fieldset>
                                )}

                                {formError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>}
                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <button type="button" onClick={closeForm} className="rounded-xl border border-[#212a3b]/15 px-4 py-3 font-semibold text-[#3d485e] hover:bg-[#f8f4e9]">Cancel</button>
                                    <button type="submit" disabled={isWorking} className="btn-primary justify-center disabled:opacity-60">
                                        {isWorking && <LoaderCircle className="size-4 animate-spin" />}
                                        Preview schedule
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </section>
    );
}
