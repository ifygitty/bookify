"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
    ArrowDown,
    ArrowUp,
    BookOpenText,
    Check,
    ChevronDown,
    ChevronUp,
    FileText,
    LoaderCircle,
    Plus,
    RefreshCw,
    Save,
    Trash2,
    X,
} from "lucide-react";
import { calculateOutlineCoverage, MAX_OUTLINE_MATERIALS } from "@/lib/course-outline";

type Material = { id: string; title: string; fileSize: number; fileType?: string };
type Source = { id: string; title: string; available: boolean };
type Subtopic = {
    id: string;
    name: string;
    description: string;
    order: number;
    materialIds: string[];
    materials: Source[];
};
type Topic = {
    id: string;
    name: string;
    description: string;
    status: "not_started" | "in_progress" | "completed";
    order: number;
    materialIds: string[];
    materials: Source[];
    subtopics: Subtopic[];
};
type Outline = {
    id: string;
    topics: Topic[];
    coverage: { totalTopics: number; completed: number; inProgress: number; notStarted: number; coveragePercent: number | null };
    generationMaterials: (Source & { retrieved: boolean })[];
    lastGeneratedAt: string | null;
    createdAt: string;
    updatedAt: string;
};
type DraftTopic = {
    name: string;
    description: string;
    materialIds: string[];
    subtopics: { name: string; description: string; materialIds: string[] }[];
};
type DraftResponse = {
    previewId: string;
    draft: DraftTopic[];
    selectedMaterials: { id: string; title: string; retrieved: boolean }[];
    missingMaterials: { id: string; title: string; retrieved: boolean }[];
    replaceExisting: boolean;
    expectedUpdatedAt: string | null;
};
type Props = { courseId: string; courseName: string; materials: Material[] };
type ModalStep = "choose" | "select" | "preview" | null;

const statusNames: Record<Topic["status"], string> = {
    not_started: "Not started",
    in_progress: "In progress",
    completed: "Completed",
};

function errorText(value: unknown, fallback: string) {
    return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string"
        ? value.error
        : fallback;
}

function newId() {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function freshTopic(): Topic {
    return {
        id: newId(),
        name: "",
        description: "",
        status: "not_started",
        order: 0,
        materialIds: [],
        materials: [],
        subtopics: [],
    };
}

export default function CourseOutlineCenter({ courseId, courseName, materials }: Props) {
    const [outline, setOutline] = useState<Outline | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [draftResponse, setDraftResponse] = useState<DraftResponse | null>(null);
    const [step, setStep] = useState<ModalStep>(null);
    const [allowPartial, setAllowPartial] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [isOutlineOpen, setIsOutlineOpen] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const materialIdsKey = materials.map((material) => material.id).join("|");

    const loadOutline = useCallback(async () => {
        const response = await fetch(`/api/courses/${courseId}/outline`);
        const result: unknown = await response.json();
        if (!response.ok) throw new Error(errorText(result, "Could not load this course outline."));
        const nextOutline =
            typeof result === "object" && result !== null && "outline" in result
                ? (result.outline as Outline | null)
                : null;
        setOutline(nextOutline);
        setIsDirty(false);
    }, [courseId]);

    useEffect(() => {
        loadOutline()
            .catch((loadError: unknown) => {
                console.error("Failed to load course outline:", loadError);
                setError(loadError instanceof Error ? loadError.message : "Could not load this course outline.");
            })
            .finally(() => setIsLoading(false));
    }, [loadOutline, materialIdsKey]);

    const coverage = useMemo(
        () => calculateOutlineCoverage(outline?.topics ?? []),
        [outline?.topics],
    );

    useEffect(() => {
        if (!step) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isGenerating && !isSaving) setStep(null);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [step, isGenerating, isSaving]);

    const startOutlineFlow = async () => {
        if (isDirty) {
            if (!window.confirm("You have unsaved outline edits. Reload the saved outline and discard those edits?")) return;
            try {
                await loadOutline();
            } catch (loadError) {
                console.error("Could not reload the outline before starting generation:", loadError);
                setError(loadError instanceof Error ? loadError.message : "Could not reload the saved outline.");
                return;
            }
        }
        setError("");
        setNotice("");
        setDraftResponse(null);
        setAllowPartial(false);
        setSelectedIds([]);
        setStep("select");
    };

    const createManualOutline = async () => {
        setError("");
        setIsSaving(true);
        try {
            const response = await fetch(`/api/courses/${courseId}/outline`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topics: [] }),
            });
            const result: unknown = await response.json();
            if (!response.ok) throw new Error(errorText(result, "Could not create a manual outline."));
            const saved = (result as { outline: Outline }).outline;
            setOutline(saved);
            setIsDirty(false);
            setNotice("Manual outline created. Add your first topic below.");
        } catch (createError) {
            console.error("Failed to create a manual course outline:", createError);
            setError(createError instanceof Error ? createError.message : "Could not create a manual outline.");
        } finally {
            setIsSaving(false);
        }
    };

    const toggleMaterial = (id: string) => {
        setSelectedIds((previous) =>
            previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
        );
    };

    const generateOutline = async () => {
        if (selectedIds.length === 0 || selectedIds.length > MAX_OUTLINE_MATERIALS || isGenerating) return;
        setError("");
        setNotice("");
        setIsGenerating(true);
        try {
            const response = await fetch(`/api/courses/${courseId}/outline/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    materialIds: selectedIds,
                    replaceExisting: Boolean(outline),
                }),
            });
            const result: unknown = await response.json();
            if (!response.ok) throw new Error(errorText(result, "Could not generate the course outline."));
            setDraftResponse(result as DraftResponse);
            setStep("preview");
            setAllowPartial(false);
        } catch (generationError) {
            console.error("Course outline generation failed:", generationError);
            setError(generationError instanceof Error ? generationError.message : "Could not generate the course outline.");
        } finally {
            setIsGenerating(false);
        }
    };

    const saveGeneratedOutline = async () => {
        if (!draftResponse || isSaving) return;
        if (draftResponse.missingMaterials.length > 0 && !allowPartial) {
            setError("Confirm that you want to continue with the selected materials that were retrieved.");
            return;
        }
        if (
            draftResponse.replaceExisting &&
            !window.confirm(
                "Save this replacement outline? Topics that do not match an existing topic name will be replaced, along with their edits and study statuses. Statuses for exact-name matches will be kept.",
            )
        ) return;

        setError("");
        setIsSaving(true);
        try {
            const response = await fetch(`/api/courses/${courseId}/outline`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ previewId: draftResponse.previewId }),
            });
            const result: unknown = await response.json();
            if (!response.ok) throw new Error(errorText(result, "Could not save this outline."));
            setOutline((result as { outline: Outline }).outline);
            setIsDirty(false);
            setDraftResponse(null);
            setStep(null);
            setNotice("Course outline saved.");
        } catch (saveError) {
            console.error("Failed to save generated course outline:", saveError);
            setError(saveError instanceof Error ? saveError.message : "Could not save this outline.");
        } finally {
            setIsSaving(false);
        }
    };

    const saveTopicChanges = async () => {
        if (!outline || !isDirty || isSaving) return;
        setError("");
        setNotice("");
        setIsSaving(true);
        try {
            const response = await fetch(`/api/courses/${courseId}/outline/topics`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    expectedUpdatedAt: outline.updatedAt,
                    topics: outline.topics.map((topic) => ({
                        id: topic.id,
                        name: topic.name,
                        description: topic.description,
                        status: topic.status,
                        materialIds: topic.materialIds,
                        subtopics: topic.subtopics.map((subtopic) => ({
                            id: subtopic.id,
                            name: subtopic.name,
                            description: subtopic.description,
                            materialIds: subtopic.materialIds,
                        })),
                    })),
                }),
            });
            const result: unknown = await response.json();
            if (!response.ok) throw new Error(errorText(result, "Could not save your outline edits."));
            setOutline((result as { outline: Outline }).outline);
            setIsDirty(false);
            setNotice("Your outline changes are saved.");
        } catch (saveError) {
            console.error("Failed to save outline topic changes:", saveError);
            setError(saveError instanceof Error ? saveError.message : "Could not save your outline edits.");
        } finally {
            setIsSaving(false);
        }
    };

    const changeTopic = (topicId: string, update: (topic: Topic) => Topic) => {
        setOutline((previous) => previous
            ? { ...previous, topics: previous.topics.map((topic) => topic.id === topicId ? update(topic) : topic) }
            : previous);
        setIsDirty(true);
        setError("");
    };

    const mutateSubtopic = (
        topicId: string,
        subtopicId: string,
        update: (subtopic: Subtopic) => Subtopic,
    ) => changeTopic(topicId, (topic) => ({
        ...topic,
        subtopics: topic.subtopics.map((subtopic) =>
            subtopic.id === subtopicId ? update(subtopic) : subtopic,
        ),
    }));

    const reorderTopic = (index: number, direction: -1 | 1) => {
        if (!outline) return;
        const target = index + direction;
        if (target < 0 || target >= outline.topics.length) return;
        const topics = [...outline.topics];
        [topics[index], topics[target]] = [topics[target], topics[index]];
        setOutline({ ...outline, topics: topics.map((topic, order) => ({ ...topic, order })) });
        setIsDirty(true);
    };

    const addTopic = () => {
        if (!outline) return;
        const newTopic = freshTopic();
        setOutline({ ...outline, topics: [...outline.topics, { ...newTopic, order: outline.topics.length }] });
        setIsDirty(true);
    };

    const deleteTopic = (topic: Topic) => {
        if (!outline || !window.confirm(`Delete "${topic.name || "this topic"}" and its subtopics? This cannot be undone.`)) return;
        setOutline({
            ...outline,
            topics: outline.topics
                .filter((item) => item.id !== topic.id)
                .map((item, order) => ({ ...item, order })),
        });
        setIsDirty(true);
    };

    const addSubtopic = (topicId: string) => changeTopic(topicId, (topic) => ({
        ...topic,
        subtopics: [
            ...topic.subtopics,
            {
                id: newId(),
                name: "",
                description: "",
                order: topic.subtopics.length,
                materialIds: [],
                materials: [],
            },
        ],
    }));

    const deleteSubtopic = (topicId: string, subtopic: Subtopic) => {
        if (!window.confirm(`Delete "${subtopic.name || "this subtopic"}"?`)) return;
        changeTopic(topicId, (topic) => ({
            ...topic,
            subtopics: topic.subtopics
                .filter((item) => item.id !== subtopic.id)
                .map((item, order) => ({ ...item, order })),
        }));
    };

    const reorderSubtopic = (topicId: string, index: number, direction: -1 | 1) => {
        changeTopic(topicId, (topic) => {
            const target = index + direction;
            if (target < 0 || target >= topic.subtopics.length) return topic;
            const subtopics = [...topic.subtopics];
            [subtopics[index], subtopics[target]] = [subtopics[target], subtopics[index]];
            return { ...topic, subtopics: subtopics.map((subtopic, order) => ({ ...subtopic, order })) };
        });
    };

    return (
        <section className="space-y-4 rounded-2xl border border-[#212a3b]/10 bg-white p-4 shadow-soft-sm sm:p-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#fff6e5] text-[#663820]">
                        <BookOpenText className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#663820]">Course outline</p>
                        <h2 className="mt-1 text-lg font-bold text-[#212a3b] sm:text-xl">{courseName} · topics and coverage</h2>
                        <p className="mt-1 text-sm leading-5 text-[#3d485e]">
                            A list of what this course covers. Mark each topic as you study it to track your progress.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void startOutlineFlow()}
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#663820] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7a4528] sm:w-auto"
                >
                    {outline ? <RefreshCw className="size-4" /> : <BookOpenText className="size-4" />}
                    {outline ? "Replace with AI outline" : "Generate Course Outline"}
                </button>
            </header>

            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
            {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}

            {isLoading ? (
                <div className="h-28 animate-pulse rounded-xl bg-[#f8f4e9]" />
            ) : outline ? (
                <div className="space-y-5">
                    <section aria-label="Course coverage summary" className="rounded-xl bg-[#f8f4e9] p-4 sm:p-5">
                        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                            <div>
                                <p className="text-sm font-semibold text-[#212a3b]">Course coverage</p>
                                <p className="mt-1 text-xs text-[#3d485e]">The share of main topics you marked Completed. It is self-reported, not a test score.</p>
                            </div>
                            <p className="text-2xl font-bold tabular-nums text-[#663820]">
                                {coverage.coveragePercent === null ? "—" : `${coverage.coveragePercent}%`}
                            </p>
                        </div>
                        <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={coverage.coveragePercent ?? 0} aria-label="Main topics completed">
                            <div className="h-full rounded-full bg-[#663820] transition-[width]" style={{ width: `${coverage.coveragePercent ?? 0}%` }} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <CoverageItem label="Total main topics" value={coverage.totalTopics} />
                            <CoverageItem label="Completed" value={coverage.completed} />
                            <CoverageItem label="In progress" value={coverage.inProgress} />
                            <CoverageItem label="Not started" value={coverage.notStarted} />
                        </div>
                    </section>

                    {outline.generationMaterials.length > 0 && (
                        <details className="rounded-xl border border-[#212a3b]/10 px-4 py-3">
                            <summary className="cursor-pointer text-sm font-semibold text-[#212a3b]">
                                Materials used to generate this outline ({outline.generationMaterials.length})
                            </summary>
                            <ul className="mt-3 space-y-2">
                                {outline.generationMaterials.map((material) => (
                                    <li key={material.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                        <span className="min-w-0 truncate text-[#3d485e]">{material.title}</span>
                                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${material.available ? material.retrieved ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-600"}`}>
                                            {!material.available ? "No longer available" : material.retrieved ? "Source retrieved" : "Not retrieved"}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                            type="button"
                            onClick={() => setIsOutlineOpen((open) => !open)}
                            aria-expanded={isOutlineOpen}
                            aria-controls="course-outline-topics"
                            className="flex min-h-11 items-center gap-2 rounded-lg text-left hover:bg-[#f8f4e9] sm:pr-3"
                        >
                            {isOutlineOpen ? <ChevronUp className="size-5 shrink-0 text-[#663820]" /> : <ChevronDown className="size-5 shrink-0 text-[#663820]" />}
                            <span>
                                <span className="block font-semibold text-[#212a3b]">Topics ({outline.topics.length})</span>
                                <span className="block text-xs text-[#3d485e]">{isOutlineOpen ? "Hide outline" : "Show outline"}</span>
                            </span>
                        </button>
                        {isOutlineOpen && (
                        <div className="flex gap-2">
                            <button type="button" onClick={addTopic} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#663820]/30 px-3 py-2 text-sm font-semibold text-[#663820] hover:bg-[#fff6e5]">
                                <Plus className="size-4" /> Add topic
                            </button>
                            <button
                                type="button"
                                onClick={() => void saveTopicChanges()}
                                disabled={!isDirty || isSaving}
                                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[#663820] px-3 py-2 text-sm font-semibold text-white hover:bg-[#7a4528] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                                Save changes
                            </button>
                        </div>
                        )}
                    </div>
                    {isDirty && <p role="status" className="text-xs font-medium text-amber-800">You have unsaved outline changes.{!isOutlineOpen && " Open the outline to save them."}</p>}
                    {isOutlineOpen && <p className="text-xs text-[#3d485e]">Edit anything below, then press Save changes. Nothing is saved until you do.</p>}

                    {isOutlineOpen && (<div id="course-outline-topics" className="space-y-5">

                    {outline.topics.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#212a3b]/20 px-4 py-8 text-center">
                            <p className="font-semibold text-[#212a3b]">No topics yet</p>
                            <p className="mt-1 text-sm text-[#3d485e]">Add a topic manually or generate an outline from course materials.</p>
                            <button type="button" onClick={addTopic} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#663820]/30 px-4 py-2 text-sm font-semibold text-[#663820]">
                                <Plus className="size-4" /> Add first topic
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {outline.topics.map((topic, topicIndex) => (
                                <article key={topic.id} className="min-w-0 rounded-xl border border-[#212a3b]/10 p-3 sm:p-4">
                                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
                                        <div className="flex items-start gap-2">
                                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f8f4e9] text-sm font-bold text-[#663820]">{topicIndex + 1}</span>
                                            <div className="flex gap-1">
                                                <button type="button" onClick={() => reorderTopic(topicIndex, -1)} disabled={topicIndex === 0} aria-label={`Move ${topic.name || "topic"} up`} className="grid size-8 place-items-center rounded-lg text-[#3d485e] hover:bg-[#f8f4e9] disabled:opacity-30"><ArrowUp className="size-4" /></button>
                                                <button type="button" onClick={() => reorderTopic(topicIndex, 1)} disabled={topicIndex === outline.topics.length - 1} aria-label={`Move ${topic.name || "topic"} down`} className="grid size-8 place-items-center rounded-lg text-[#3d485e] hover:bg-[#f8f4e9] disabled:opacity-30"><ArrowDown className="size-4" /></button>
                                            </div>
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-3">
                                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                                                <label className="min-w-0 space-y-1">
                                                    <span className="text-xs font-semibold text-[#3d485e]">Topic name</span>
                                                    <input value={topic.name} maxLength={160} onChange={(event) => changeTopic(topic.id, (item) => ({ ...item, name: event.target.value }))} className="min-h-11 w-full min-w-0 rounded-lg border border-[#212a3b]/15 px-3 text-sm text-[#212a3b] outline-none focus:border-[#663820] focus:ring-2 focus:ring-[#663820]/15" />
                                                </label>
                                                <label className="min-w-0 space-y-1">
                                                    <span className="text-xs font-semibold text-[#3d485e]">Study status</span>
                                                    <select value={topic.status} onChange={(event) => changeTopic(topic.id, (item) => ({ ...item, status: event.target.value as Topic["status"] }))} className="min-h-11 w-full rounded-lg border border-[#212a3b]/15 bg-white px-3 text-sm text-[#212a3b] outline-none focus:border-[#663820]">
                                                        {Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                                    </select>
                                                </label>
                                            </div>
                                            <label className="block space-y-1">
                                                <span className="text-xs font-semibold text-[#3d485e]">Description</span>
                                                <textarea value={topic.description} maxLength={800} rows={2} onChange={(event) => changeTopic(topic.id, (item) => ({ ...item, description: event.target.value }))} className="w-full resize-y rounded-lg border border-[#212a3b]/15 px-3 py-2 text-sm text-[#212a3b] outline-none focus:border-[#663820]" />
                                            </label>
                                            <SourceEditor
                                                courseId={courseId}
                                                availableMaterials={materials}
                                                selectedIds={topic.materialIds}
                                                savedSources={topic.materials}
                                                label="Topic sources"
                                                onChange={(ids) => changeTopic(topic.id, (item) => ({ ...item, materialIds: ids }))}
                                            />

                                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#212a3b]/10 pt-3">
                                                <h4 className="text-sm font-semibold text-[#212a3b]">Subtopics ({topic.subtopics.length})</h4>
                                                <button type="button" onClick={() => addSubtopic(topic.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-[#663820] hover:bg-[#fff6e5]"><Plus className="size-4" /> Add subtopic</button>
                                            </div>
                                            {topic.subtopics.map((subtopic, subtopicIndex) => (
                                                <div key={subtopic.id} className="min-w-0 rounded-lg bg-[#f8f4e9] p-3">
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        <span className="text-xs font-semibold text-[#3d485e]">Subtopic {topicIndex + 1}.{subtopicIndex + 1}</span>
                                                        <div className="flex gap-1">
                                                            <button type="button" onClick={() => reorderSubtopic(topic.id, subtopicIndex, -1)} disabled={subtopicIndex === 0} aria-label="Move subtopic up" className="grid size-8 place-items-center rounded-lg hover:bg-white disabled:opacity-30"><ChevronUp className="size-4" /></button>
                                                            <button type="button" onClick={() => reorderSubtopic(topic.id, subtopicIndex, 1)} disabled={subtopicIndex === topic.subtopics.length - 1} aria-label="Move subtopic down" className="grid size-8 place-items-center rounded-lg hover:bg-white disabled:opacity-30"><ChevronDown className="size-4" /></button>
                                                            <button type="button" onClick={() => deleteSubtopic(topic.id, subtopic)} aria-label="Delete subtopic" className="grid size-8 place-items-center rounded-lg text-red-700 hover:bg-red-50"><Trash2 className="size-4" /></button>
                                                        </div>
                                                    </div>
                                                    <label className="mb-2 block space-y-1">
                                                        <span className="sr-only">Subtopic name</span>
                                                        <input value={subtopic.name} maxLength={160} onChange={(event) => mutateSubtopic(topic.id, subtopic.id, (item) => ({ ...item, name: event.target.value }))} placeholder="Subtopic name" className="min-h-10 w-full rounded-lg border border-[#212a3b]/15 bg-white px-3 text-sm outline-none focus:border-[#663820]" />
                                                    </label>
                                                    <label className="mb-2 block space-y-1">
                                                        <span className="sr-only">Subtopic description</span>
                                                        <textarea value={subtopic.description} maxLength={800} rows={2} onChange={(event) => mutateSubtopic(topic.id, subtopic.id, (item) => ({ ...item, description: event.target.value }))} placeholder="Optional description" className="w-full resize-y rounded-lg border border-[#212a3b]/15 bg-white px-3 py-2 text-sm outline-none focus:border-[#663820]" />
                                                    </label>
                                                    <SourceEditor
                                                        courseId={courseId}
                                                        availableMaterials={materials}
                                                        selectedIds={subtopic.materialIds}
                                                        savedSources={subtopic.materials}
                                                        label="Subtopic sources"
                                                        onChange={(ids) => mutateSubtopic(topic.id, subtopic.id, (item) => ({ ...item, materialIds: ids }))}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <button type="button" onClick={() => deleteTopic(topic)} aria-label={`Delete ${topic.name || "topic"}`} title="Delete topic and subtopics" className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50">
                                            <Trash2 className="size-4" /><span className="sm:hidden">Delete topic</span>
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                    </div>)}
                </div>
            ) : (
                <div className="rounded-xl border border-dashed border-[#212a3b]/20 px-4 py-6 sm:px-6">
                    <div className="flex flex-col items-center text-center">
                        <FileText className="mb-3 size-8 text-[#663820]" />
                        <h3 className="font-semibold text-[#212a3b]">No course outline yet</h3>
                        <p className="mt-1 max-w-lg text-sm leading-6 text-[#3d485e]">
                            Get started in three steps:
                        </p>
                        <ol className="mt-2 max-w-md space-y-1 text-left text-sm leading-6 text-[#3d485e]">
                            <li>1. Press <strong>Generate Course Outline</strong> and tick the materials to use.</li>
                            <li>2. Review the suggested topics, then press <strong>Save this outline</strong>.</li>
                            <li>3. Mark topics as In progress or Completed as you study.</li>
                        </ol>
                        <p className="mt-3 text-xs text-[#3d485e]">Nothing is generated until you press the button. Prefer your own list? Start a manual outline.</p>
                        <button type="button" onClick={() => void startOutlineFlow()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#663820] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7a4528]">
                            <BookOpenText className="size-4" /> Generate Course Outline
                        </button>
                        {materials.length === 0 ? (
                            <>
                                <p className="mt-3 text-sm text-[#3d485e]">Upload course materials before generating an AI outline. You can also start a manual outline.</p>
                                <button type="button" onClick={() => void createManualOutline()} disabled={isSaving} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#663820]/30 px-4 py-2 text-sm font-semibold text-[#663820] disabled:opacity-50">
                                    {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Create a manual outline
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={() => void createManualOutline()} disabled={isSaving} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#663820]/30 px-4 py-2 text-sm font-semibold text-[#663820] disabled:opacity-50">
                                {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Create a manual outline
                            </button>
                        )}
                    </div>
                </div>
            )}

            {step && typeof document !== "undefined" && createPortal(
                <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#030a14]/80 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget && !isGenerating && !isSaving) setStep(null);
                }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="outline-modal-title" className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
                        <header className="flex items-start justify-between gap-3 border-b border-[#212a3b]/10 px-4 py-4 sm:px-6">
                            <div>
                                <h2 id="outline-modal-title" className="text-lg font-bold text-[#212a3b] sm:text-xl">
                                    {step === "choose" ? "Course outline already exists" : step === "preview" ? "Review your course outline" : "Generate Your Course Outline"}
                                </h2>
                                <p className="mt-1 text-sm leading-5 text-[#3d485e]">
                                    {step === "choose"
                                        ? "Open the saved outline to view or edit it, or create a replacement."
                                        : step === "preview"
                                          ? "Check the generated topics and their source materials before saving."
                                          : "Select the course materials Bookified should analyze. Only selected materials will be used."}
                                </p>
                            </div>
                            <button type="button" onClick={() => setStep(null)} disabled={isGenerating || isSaving} aria-label="Close dialog" className="grid size-10 shrink-0 place-items-center rounded-lg text-[#3d485e] hover:bg-[#f8f4e9] disabled:opacity-50"><X className="size-5" /></button>
                        </header>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                            {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
                            {step === "choose" ? (
                                <div className="space-y-3">
                                    <button type="button" onClick={() => setStep(null)} className="flex min-h-12 w-full items-center justify-between rounded-xl border border-[#212a3b]/10 px-4 py-3 text-left hover:bg-[#f8f4e9]">
                                        <span><span className="block font-semibold text-[#212a3b]">View or edit the saved outline</span><span className="mt-1 block text-sm text-[#3d485e]">{outline?.coverage.totalTopics ?? 0} main topics currently saved</span></span>
                                        <Check className="size-5 text-[#663820]" />
                                    </button>
                                    <button type="button" onClick={() => { setSelectedIds([]); setStep("select"); }} className="flex min-h-12 w-full items-center justify-between rounded-xl border border-[#212a3b]/10 px-4 py-3 text-left hover:bg-[#f8f4e9]">
                                        <span><span className="block font-semibold text-[#212a3b]">Generate a replacement</span><span className="mt-1 block text-sm text-[#3d485e]">The current outline remains unchanged until you confirm saving the replacement.</span></span>
                                        <RefreshCw className="size-5 text-[#663820]" />
                                    </button>
                                </div>
                            ) : step === "select" ? (
                                materials.length === 0 ? (
                                    <div className="rounded-xl bg-[#f8f4e9] p-4 text-sm leading-6 text-[#3d485e]">
                                        This course has no uploaded materials. Add a PDF, Word document, or Excel spreadsheet before generating an AI outline.
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {outline && (
                                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                                                Replacement is not automatic. Your current outline and statuses remain saved unless you review and confirm the generated replacement.
                                            </p>
                                        )}
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-medium text-[#3d485e]">{selectedIds.length} material{selectedIds.length === 1 ? "" : "s"} selected · up to {MAX_OUTLINE_MATERIALS}</p>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => setSelectedIds(materials.map((material) => material.id))} className="rounded-lg border border-[#212a3b]/15 px-3 py-2 text-sm font-medium text-[#3d485e] hover:bg-[#f8f4e9]">Select All</button>
                                                <button type="button" onClick={() => setSelectedIds([])} disabled={selectedIds.length === 0} className="rounded-lg border border-[#212a3b]/15 px-3 py-2 text-sm font-medium text-[#3d485e] hover:bg-[#f8f4e9] disabled:opacity-40">Clear</button>
                                            </div>
                                        </div>
                                        <ul className="space-y-2">
                                            {materials.map((material) => (
                                                <li key={material.id}>
                                                    <label className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selectedIds.includes(material.id) ? "border-[#663820] bg-[#fff6e5]" : "border-[#212a3b]/10 hover:bg-[#f8f4e9]"}`}>
                                                        <input type="checkbox" checked={selectedIds.includes(material.id)} onChange={() => toggleMaterial(material.id)} className="mt-1 size-4 shrink-0 accent-[#663820]" />
                                                        <FileText className="mt-0.5 size-4 shrink-0 text-[#663820]" />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block break-words text-sm font-semibold text-[#212a3b]">{material.title}</span>
                                                            <span className="mt-1 block text-xs text-[#3d485e]">{material.fileType || "Study material"} · {formatSize(material.fileSize)}</span>
                                                        </span>
                                                    </label>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )
                            ) : draftResponse ? (
                                <div className="space-y-4">
                                    {draftResponse.missingMaterials.length > 0 && (
                                        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                                            <div>
                                                <p className="font-semibold text-amber-950">Some selected materials had no passages retrieved</p>
                                                <p className="mt-1 text-sm leading-5 text-amber-900">The outline uses only the selected materials listed as retrieved below. Confirm if you want to continue with this partial result.</p>
                                            </div>
                                            <ul className="list-inside list-disc text-sm text-amber-900">
                                                {draftResponse.missingMaterials.map((material) => <li key={material.id}>{material.title}</li>)}
                                            </ul>
                                            <label className="flex items-start gap-2 text-sm font-medium text-amber-950">
                                                <input type="checkbox" checked={allowPartial} onChange={(event) => setAllowPartial(event.target.checked)} className="mt-1 size-4 accent-[#663820]" />
                                                Continue with the passages retrieved from the selected materials
                                            </label>
                                        </div>
                                    )}
                                    <div className="rounded-xl bg-[#f8f4e9] px-4 py-3 text-sm text-[#3d485e]">
                                        {draftResponse.draft.length} main topics · {draftResponse.draft.reduce((sum, topic) => sum + topic.subtopics.length, 0)} subtopics
                                    </div>
                                    <ul className="space-y-3">
                                        {draftResponse.draft.map((topic, index) => (
                                            <li key={`${topic.name}-${index}`} className="rounded-xl border border-[#212a3b]/10 p-3">
                                                <p className="font-semibold text-[#212a3b]">{index + 1}. {topic.name}</p>
                                                {topic.description && <p className="mt-1 text-sm leading-5 text-[#3d485e]">{topic.description}</p>}
                                                <p className="mt-2 text-xs text-[#663820]">Sources: {sourceTitles(topic.materialIds, draftResponse.selectedMaterials)}</p>
                                                {topic.subtopics.length > 0 && (
                                                    <ul className="mt-2 space-y-1 border-l-2 border-[#f3e4c7] pl-3">
                                                        {topic.subtopics.map((subtopic, subtopicIndex) => (
                                                            <li key={`${subtopic.name}-${subtopicIndex}`} className="text-sm text-[#3d485e]">
                                                                <span className="font-medium">{subtopic.name}</span>
                                                                {subtopic.description && <span> — {subtopic.description}</span>}
                                                                <span className="block text-xs text-[#663820]">Sources: {sourceTitles(subtopic.materialIds, draftResponse.selectedMaterials)}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                        </div>
                        <footer className="flex flex-col-reverse gap-2 border-t border-[#212a3b]/10 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                            <button type="button" onClick={() => {
                                setError("");
                                if (step === "preview") setStep("select");
                                else setStep(null);
                            }} disabled={isGenerating || isSaving} className="min-h-11 rounded-xl border border-[#212a3b]/15 px-4 py-2 text-sm font-semibold text-[#3d485e] hover:bg-[#f8f4e9] disabled:opacity-50">
                                {step === "preview" ? "Back to materials" : "Cancel"}
                            </button>
                            {step === "select" ? (
                                <button type="button" onClick={() => void generateOutline()} disabled={selectedIds.length === 0 || selectedIds.length > MAX_OUTLINE_MATERIALS || isGenerating} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#663820] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7a4528] disabled:cursor-not-allowed disabled:opacity-50">
                                    {isGenerating ? <><LoaderCircle className="size-4 animate-spin" /> Analyzing selected materials...</> : <><BookOpenText className="size-4" /> Generate Course Outline</>}
                                </button>
                            ) : step === "preview" ? (
                                <button type="button" onClick={() => void saveGeneratedOutline()} disabled={isSaving || (draftResponse?.missingMaterials.length ?? 0) > 0 && !allowPartial} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#663820] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7a4528] disabled:cursor-not-allowed disabled:opacity-50">
                                    {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                                    {draftResponse?.replaceExisting ? "Replace my outline" : "Save this outline"}
                                </button>
                            ) : null}
                        </footer>
                        {isGenerating && (
                            <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/95 p-6 text-center">
                                <LoaderCircle className="size-10 animate-spin text-[#663820]" />
                                <p className="text-base font-bold text-[#212a3b]">Creating your course outline…</p>
                                <p className="max-w-xs text-sm text-[#3d485e]">Analyzing the selected materials. This can take a minute — please keep this window open.</p>
                            </div>
                        )}
                    </section>
                </div>,
                document.body,
            )}
        </section>
    );
}

function sourceTitles(ids: string[], materials: { id: string; title: string }[]) {
    return ids.map((id) => materials.find((material) => material.id === id)?.title ?? "Unavailable source").join(", ");
}

function CoverageItem({ label, value }: { label: string; value: number }) {
    return <div className="min-w-0 rounded-lg bg-white px-3 py-2">
        <p className="text-xs text-[#3d485e]">{label}</p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-[#212a3b]">{value}</p>
    </div>;
}

function SourceEditor({
    courseId,
    availableMaterials,
    selectedIds,
    savedSources,
    label,
    onChange,
}: {
    courseId: string;
    availableMaterials: Material[];
    selectedIds: string[];
    savedSources: Source[];
    label: string;
    onChange: (ids: string[]) => void;
}) {
    const staleSources = savedSources.filter(
        (source) => !source.available && selectedIds.includes(source.id),
    );

    return (
        <details className="rounded-lg border border-[#212a3b]/10 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-[#3d485e]">{label} ({selectedIds.length})</summary>
            <div className="mt-2 space-y-2">
                {staleSources.map((source) => (
                    <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-2.5 py-2 text-xs text-slate-600">
                        <span className="min-w-0 truncate">{source.title} · no longer available</span>
                        <button type="button" onClick={() => onChange(selectedIds.filter((id) => id !== source.id))} className="shrink-0 font-semibold text-[#663820]">Remove</button>
                    </div>
                ))}
                {availableMaterials.length === 0 ? (
                    <p className="text-xs text-[#3d485e]">No current materials are available.</p>
                ) : availableMaterials.map((material) => (
                    <label key={material.id} className="flex min-w-0 items-start gap-2 rounded-lg px-1 py-1 text-xs text-[#3d485e]">
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(material.id)}
                            onChange={() => onChange(
                                selectedIds.includes(material.id)
                                    ? selectedIds.filter((id) => id !== material.id)
                                    : [...selectedIds, material.id],
                            )}
                            className="mt-0.5 size-3.5 shrink-0 accent-[#663820]"
                        />
                        <span className="min-w-0 flex-1 break-words">{material.title}</span>
                        <a href={`/api/courses/${courseId}/materials/${material.id}`} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-[#663820] underline underline-offset-2">Open</a>
                    </label>
                ))}
            </div>
        </details>
    );
}
