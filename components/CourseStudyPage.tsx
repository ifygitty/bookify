"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, BookOpenCheck, FileText, FolderOpen, LoaderCircle, Menu, RefreshCw, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import CourseQuizCenter from "@/components/CourseQuizCenter";
import CourseFlashcardCenter from "@/components/CourseFlashcardCenter";
import CourseOutlineCenter from "@/components/CourseOutlineCenter";
import CourseRevisionPlanner from "@/components/CourseRevisionPlanner";
import CourseWorkspaceNav, { SECTION_TITLES, type CourseSection } from "@/components/CourseWorkspaceNav";
import MarkdownMessage from "@/components/MarkdownMessage";
import { COURSE_MATERIAL_MIME_TYPES, getCourseMaterialExtension } from "@/lib/course-material-types";
import { toggleMaterialSelection } from "@/lib/material-selection";

type CourseMaterial = {
    id: string;
    title: string;
    fileSize: number;
    fileType?: string;
    visualProcessingStatus?: "not-needed" | "processing" | "complete" | "partial" | "failed";
    visualProcessingMessage?: string;
};
type Course = { id: string; name: string; materials: CourseMaterial[] };
type Citation = { fileId: string; filename: string; materialId?: string };
type Message = {
    id?: string;
    role: "user" | "assistant";
    content: string;
    citations: Citation[];
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export default function CourseStudyPage({ course }: { course: Course }) {
    const router = useRouter();
    const { confirmDialog } = useDialogs();
    const initialMaterialIds = course.materials[0]?.id ? [course.materials[0].id] : [];
    const [selectedMaterialIds, setSelectedMaterialIds] = useState(initialMaterialIds);
    const [chatMaterialIds, setChatMaterialIds] = useState(initialMaterialIds);
    const [selectionReady, setSelectionReady] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [memorySummary, setMemorySummary] = useState("");
    const [question, setQuestion] = useState("");
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [activeSection, setActiveSection] = useState<CourseSection>("chat");
    const [visitedSections, setVisitedSections] = useState<CourseSection[]>(["chat"]);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [quizCenterKey, setQuizCenterKey] = useState(0);
    const [addTopicRequest, setAddTopicRequest] = useState<{ topic: string; nonce: number } | null>(null);
    const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(null);
    const [reanalyzingMaterialId, setReanalyzingMaterialId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [uploadError, setUploadError] = useState("");
    const [materialActionError, setMaterialActionError] = useState("");
    const listRef = useRef<HTMLDivElement>(null);
    const mainRef = useRef<HTMLElement>(null);
    const chatMaterials = course.materials.filter((item) => chatMaterialIds.includes(item.id));
    const isSelectionChanged =
        [...selectedMaterialIds].sort().join(",") !== [...chatMaterialIds].sort().join(",");

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const requestedIds = params.get("materialIds")?.split(",").filter(Boolean) ?? [];
        const validIds =
            requestedIds.length > 0 &&
            new Set(requestedIds).size === requestedIds.length &&
            requestedIds.every((id) => course.materials.some((material) => material.id === id));
        const initialIds = validIds
            ? requestedIds
            : course.materials[0]?.id
              ? [course.materials[0].id]
              : [];
        setSelectedMaterialIds(initialIds);
        setChatMaterialIds(initialIds);
        setSelectionReady(true);
    }, [course.id, course.materials]);

    useEffect(() => {
        if (!selectionReady) return;
        if (chatMaterialIds.length === 0) {
            setMessages([]);
            setMemorySummary("");
            setIsLoadingHistory(false);
            return;
        }

        const controller = new AbortController();
        setIsLoadingHistory(true);
        setError("");
        setMessages([]);
        setMemorySummary("");
        const searchParams = new URLSearchParams();
        for (const materialId of chatMaterialIds) {
            searchParams.append("materialId", materialId);
        }
        fetch(`/api/courses/${course.id}/chat?${searchParams.toString()}`, {
            signal: controller.signal,
        })
            .then(async (response) => {
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Could not load this conversation.");
                setMessages(result.messages);
                setMemorySummary(result.memorySummary || "");
            })
            .catch((historyError: unknown) => {
                if (historyError instanceof DOMException && historyError.name === "AbortError") return;
                console.error("Failed to load saved tutor conversation:", historyError);
                setError(historyError instanceof Error ? historyError.message : "Could not load this conversation.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoadingHistory(false);
            });

        return () => controller.abort();
    }, [chatMaterialIds, course.id, selectionReady]);

    
    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    const goToSection = (section: CourseSection) => {
        setActiveSection(section);
        setVisitedSections((current) => (current.includes(section) ? current : [...current, section]));
        mainRef.current?.scrollTo({ top: 0 });
    };

    const openQuizFromPlan = (materialIds: string[]) => {
        const available = materialIds.filter((id) => course.materials.some((material) => material.id === id));
        if (available.length > 0) setSelectedMaterialIds(available);
        setQuizCenterKey((key) => key + 1);
        goToSection("practice");
    };

    const addTopicToRevisionPlan = (topic: string) => {
        setAddTopicRequest((current) => ({ topic, nonce: (current?.nonce ?? 0) + 1 }));
        goToSection("revision");
    };

    const openFlashcardsFromPlan = () => goToSection("flashcards");

    const uploadMaterial = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        const extension = getCourseMaterialExtension(file.name);
        if (!extension) {
            setUploadError("Choose a PDF, Word document, or Excel spreadsheet.");
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setUploadError("Files must be smaller than 50 MB.");
            return;
        }

        setUploadError("");
        setIsUploading(true);
        try {
            const uploadedBlob = await upload(`${course.id}/${file.name}`, file, {
                access: "private",
                handleUploadUrl: "/api/courses/upload",
                contentType: COURSE_MATERIAL_MIME_TYPES[extension],
            });
            const response = await fetch(`/api/courses/${course.id}/materials`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    blobPathname: uploadedBlob.pathname,
                    filename: file.name,
                    title: file.name.replace(/\.[^.]+$/, ""),
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not upload this material.");

            setSelectedMaterialIds([result.material.id]);
            setChatMaterialIds([result.material.id]);
            const params = new URLSearchParams(window.location.search);
            params.set("materialIds", result.material.id);
            window.history.replaceState(
                window.history.state,
                "",
                `${window.location.pathname}?${params.toString()}`,
            );
            router.refresh();
        } catch (requestError) {
            console.error("Course material upload failed:", requestError);
            setUploadError(
                requestError instanceof Error ? requestError.message : "Could not upload this material.",
            );
        } finally {
            setIsUploading(false);
        }
    };

    const retryVisualAnalysis = async (material: CourseMaterial) => {
        if (isUploading || deletingMaterialId || reanalyzingMaterialId) return;
        setMaterialActionError("");
        setReanalyzingMaterialId(material.id);
        try {
            const response = await fetch(
                `/api/courses/${course.id}/materials/${material.id}/visual-analysis`,
                { method: "POST" },
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not analyze this PDF.");
            router.refresh();
        } catch (requestError) {
            console.error("PDF visual-analysis retry failed:", requestError);
            setMaterialActionError(
                requestError instanceof Error ? requestError.message : "Could not analyze this PDF.",
            );
        } finally {
            setReanalyzingMaterialId(null);
        }
    };

    const deleteMaterial = async (material: CourseMaterial) => {
        if (isSending || isUploading || deletingMaterialId || reanalyzingMaterialId) return;
        const confirmed = await confirmDialog({
            title: "Delete this material?",
            description: `Are you sure you want to delete "${material.title}" and its related chat history? This action cannot be undone.`,
            confirmText: "Delete material",
            variant: "danger",
        });
        if (!confirmed) return;

        setMaterialActionError("");
        setDeletingMaterialId(material.id);
        try {
            const response = await fetch(
                `/api/courses/${course.id}/materials/${material.id}`,
                { method: "DELETE" },
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not delete this material.");

            const remainingChatIds = chatMaterialIds.filter((id) => id !== material.id);
            setSelectedMaterialIds((previous) => previous.filter((id) => id !== material.id));
            setChatMaterialIds(remainingChatIds);
            const params = new URLSearchParams(window.location.search);
            if (remainingChatIds.length > 0) {
                params.set("materialIds", remainingChatIds.join(","));
            } else {
                params.delete("materialIds");
            }
            window.history.replaceState(
                window.history.state,
                "",
                `${window.location.pathname}${params.size > 0 ? `?${params.toString()}` : ""}`,
            );
            router.refresh();
        } catch (requestError) {
            console.error("Course material deletion request failed:", requestError);
            setMaterialActionError(
                requestError instanceof Error ? requestError.message : "Could not delete this material.",
            );
        } finally {
            setDeletingMaterialId(null);
        }
    };


    const sendQuestion = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const cleanQuestion = question.trim();
        if (
            !cleanQuestion ||
            chatMaterialIds.length === 0 ||
            isSelectionChanged ||
            isLoadingHistory ||
            isSending
        ) return;

        setError("");
        setIsSending(true);
        try {
            const response = await fetch(`/api/courses/${course.id}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ materialIds: chatMaterialIds, message: cleanQuestion }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Mentor could not answer.");

            setMessages((previous) => [
                ...previous,
                { role: "user", content: cleanQuestion, citations: [] },
                { role: "assistant", content: result.answer, citations: result.citations ?? [] },
            ]);
            setQuestion("");
        } catch (requestError) {
            console.error("Tutor request failed:", requestError);
            setError(requestError instanceof Error ? requestError.message : "Mentor could not answer.");
        } finally {
            setIsSending(false);
        }
    };

    const toggleMaterial = (materialId: string) => {
        setSelectedMaterialIds((previous) => toggleMaterialSelection(previous, materialId));
    };

    const selectAllMaterials = () => {
        setSelectedMaterialIds(course.materials.map((material) => material.id));
    };

    const clearMaterialSelection = () => {
        setSelectedMaterialIds([]);
    };

    const startChatWithSelection = () => {
        if (selectedMaterialIds.length === 0 || isSending) return;
        const nextIds = course.materials
            .filter((material) => selectedMaterialIds.includes(material.id))
            .map((material) => material.id);
        setSelectedMaterialIds(nextIds);
        setChatMaterialIds(nextIds);
        setError("");
        const params = new URLSearchParams(window.location.search);
        params.set("materialIds", nextIds.join(","));
        window.history.replaceState(
            window.history.state,
            "",
            `${window.location.pathname}?${params.toString()}`,
        );
        goToSection("chat");
    };

    return (
        <div className="flex h-[calc(100dvh-var(--navbar-height))] min-h-0 overflow-hidden bg-[var(--navy-900)]">
            <CourseWorkspaceNav
                courseName={course.name}
                active={activeSection}
                onSelect={goToSection}
                drawerOpen={isDrawerOpen}
                onDrawerClose={() => setIsDrawerOpen(false)}
            />
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-[var(--navy-border)] bg-[var(--navy-800)] px-2 py-1.5 lg:hidden">
                    <button type="button" onClick={() => setIsDrawerOpen(true)} aria-label="Open navigation" className="icon-btn">
                        <Menu />
                    </button>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">{course.name}</p>
                        <p className="truncate text-xs text-[var(--ink-soft)]">{SECTION_TITLES[activeSection]}</p>
                    </div>
                </div>
                <main
                    ref={mainRef}
                    className={`min-h-0 min-w-0 flex-1 ${activeSection === "chat" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
                >
            <div className={activeSection === "materials" ? "anim-rise mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6" : "hidden"}>
                <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="bk-wrap text-2xl font-semibold tracking-tight">Materials</h1>
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">Choose which study materials Mentor AI, quizzes and flashcards use.</p>
                    </div>
                    <label className="btn-primary cursor-pointer justify-center">
                        {isUploading ? <LoaderCircle className="size-5 animate-spin" /> : <Upload className="size-5" />}
                        {isUploading ? "Analyzing document..." : "Add study material"}
                        <input
                            type="file"
                            accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="sr-only"
                            disabled={isUploading}
                            onChange={uploadMaterial}
                        />
                    </label>
                </header>

            {uploadError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{uploadError}</p>}
            {materialActionError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{materialActionError}</p>}

            {course.materials.length === 0 ? (
                <section className="rounded-2xl border border-dashed border-[#212a3b]/20 bg-white/80 px-6 py-14 text-center">
                    <FileText className="mx-auto mb-4 size-10 text-[#663820]" />
                    <h2 className="text-xl font-semibold">Add your first study material</h2>
                    <p className="mx-auto mt-2 max-w-lg text-[#3d485e]">
                        Upload a PDF, Word document, or Excel spreadsheet.                         Mentor will use the selected material when answering.
                    </p>
                </section>
            ) : (
                    <section className="rounded-2xl border border-[#212a3b]/10 bg-white p-5 shadow-soft-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="font-semibold">Course materials</h2>
                            <span className="text-xs text-[#3d485e]">
                                {selectedMaterialIds.length} of {course.materials.length} selected
                            </span>
                        </div>
                        <div className="mb-4 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={selectAllMaterials}
                                disabled={isSending || selectedMaterialIds.length === course.materials.length}
                                className="rounded-lg border border-[#212a3b]/15 px-3 py-2 text-sm font-medium text-[#3d485e] hover:bg-[#f8f4e9] disabled:opacity-50"
                            >
                                Select All
                            </button>
                            <button
                                type="button"
                                onClick={clearMaterialSelection}
                                disabled={isSending || selectedMaterialIds.length === 0}
                                className="rounded-lg border border-[#212a3b]/15 px-3 py-2 text-sm font-medium text-[#3d485e] hover:bg-[#f8f4e9] disabled:opacity-50"
                            >
                                Clear Selection
                            </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {course.materials.map((material) => (
                                <div
                                    key={material.id}
                                    className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                                        selectedMaterialIds.includes(material.id)
                                            ? "border-[#663820] bg-[#fff6e5] text-[#663820]"
                                            : "border-[#212a3b]/10 bg-white text-[#3d485e] hover:bg-[#f8f4e9]"
                                    }`}
                                >
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1">
                                        <input
                                            type="checkbox"
                                            checked={selectedMaterialIds.includes(material.id)}
                                            onChange={() => toggleMaterial(material.id)}
                                            disabled={isSending || deletingMaterialId !== null}
                                            className="size-4 shrink-0 accent-[#663820]"
                                        />
                                        <FileText className="size-4 shrink-0" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">{material.title}</span>
                                            {material.visualProcessingStatus === "complete" && (
                                                <span className="mt-0.5 block text-xs text-emerald-700">Visual content analyzed</span>
                                            )}
                                            {(material.visualProcessingStatus === "partial" || material.visualProcessingStatus === "failed") && (
                                                <span
                                                    className="mt-0.5 block text-xs leading-5 text-amber-700"
                                                    title={material.visualProcessingMessage}
                                                >
                                                    {material.visualProcessingMessage || "Some visual content may not be available."}
                                                </span>
                                            )}
                                            {material.visualProcessingStatus === "processing" && (
                                                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                                                    Visual content analysis is in progress.
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                    {(material.visualProcessingStatus === "failed" ||
                                        material.visualProcessingStatus === "processing") && (
                                        <button
                                            type="button"
                                            onClick={() => retryVisualAnalysis(material)}
                                            disabled={isUploading || deletingMaterialId !== null || reanalyzingMaterialId !== null}
                                            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--navy-border)] px-2 text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--gold)] disabled:opacity-50"
                                        >
                                            {reanalyzingMaterialId === material.id
                                                ? <LoaderCircle className="size-3 animate-spin" />
                                                : <RefreshCw className="size-3" />}
                                            {material.visualProcessingStatus === "processing" ? "Resume" : "Retry"}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => deleteMaterial(material)}
                                        disabled={isSending || isUploading || deletingMaterialId !== null || reanalyzingMaterialId !== null}
                                        aria-label={`Delete ${material.title}`}
                                        title={`Delete ${material.title}`}
                                        className="icon-btn icon-btn-danger shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {deletingMaterialId === material.id
                                            ? <LoaderCircle className="size-4 animate-spin" />
                                            : <Trash2 className="size-4" />}
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-col gap-2 border-t border-[#212a3b]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-[#3d485e]">
                                {selectedMaterialIds.length} material{selectedMaterialIds.length === 1 ? "" : "s"} selected
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => goToSection("practice")}
                                    disabled={selectedMaterialIds.length === 0}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#663820] px-4 py-3 font-semibold text-[#663820] hover:bg-[#fff6e5] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <BookOpenCheck className="size-5" />
                                    Practice Questions
                                </button>
                                <button
                                    type="button"
                                    onClick={startChatWithSelection}
                                    disabled={selectedMaterialIds.length === 0 || isSending}
                                    className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Chat with Selected Materials
                                </button>
                            </div>
                        </div>
                    </section>
            )}
            </div>

            <div className={activeSection === "outline" ? "anim-rise mx-auto w-full max-w-4xl p-4 sm:p-6" : "hidden"}>
                {visitedSections.includes("outline") && (
                    <CourseOutlineCenter courseId={course.id} courseName={course.name} materials={course.materials} />
                )}
            </div>

            <div id="revision-planner" className={activeSection === "revision" ? "anim-rise mx-auto w-full max-w-4xl p-4 sm:p-6" : "hidden"}>
                {visitedSections.includes("revision") && (
                    <CourseRevisionPlanner
                        courseId={course.id}
                        onOpenQuiz={openQuizFromPlan}
                        onOpenFlashcards={openFlashcardsFromPlan}
                        addTopicRequest={addTopicRequest}
                    />
                )}
            </div>

            <div id="quiz-center" className={activeSection === "practice" ? "anim-rise mx-auto w-full max-w-4xl p-4 sm:p-6" : "hidden"}>
                {visitedSections.includes("practice") && (
                    selectedMaterialIds.length === 0 ? (
                        <section className="rounded-2xl border border-dashed border-[#212a3b]/20 bg-white/80 px-6 py-14 text-center">
                            <BookOpenCheck className="mx-auto mb-4 size-10 text-[#663820]" />
                            <h2 className="text-xl font-semibold">Select materials to practise</h2>
                            <p className="mx-auto mt-2 max-w-lg text-[#3d485e]">Choose at least one study material to generate practice questions.</p>
                            <button type="button" onClick={() => goToSection("materials")} className="btn-primary mx-auto mt-5">
                                <FolderOpen className="size-5" />Go to Materials
                            </button>
                        </section>
                    ) : (
                        <CourseQuizCenter
                            key={quizCenterKey}
                            courseId={course.id}
                            materials={course.materials}
                            initialMaterialIds={selectedMaterialIds}
                            onClose={() => goToSection("chat")}
                            onAddToRevisionPlan={addTopicToRevisionPlan}
                        />
                    )
                )}
            </div>

            <div id="flashcard-center" className={activeSection === "flashcards" ? "anim-rise mx-auto w-full max-w-4xl p-4 sm:p-6" : "hidden"}>
                {visitedSections.includes("flashcards") && (
                    <CourseFlashcardCenter
                        courseId={course.id}
                        courseName={course.name}
                        materials={course.materials}
                        initialMaterialIds={selectedMaterialIds}
                        onClose={() => goToSection("chat")}
                    />
                )}
            </div>

            <div className={activeSection === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            {course.materials.length === 0 ? (
                <section className="m-auto max-w-md px-6 py-14 text-center">
                    <FolderOpen className="mx-auto mb-4 size-10 text-[var(--gold)]" />
                    <h2 className="text-xl font-semibold">Add study material to start chatting</h2>
                    <p className="mt-2 text-sm text-[var(--ink-soft)]">Mentor answers using the study materials you upload.</p>
                    <button type="button" onClick={() => goToSection("materials")} className="btn-primary mx-auto mt-5">
                        <Upload className="size-5" />Go to Materials
                    </button>
                </section>
            ) : (
                    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="shrink-0 border-b border-[var(--navy-border)] px-3 py-2 sm:px-5">
                            <div className="flex items-center gap-2">
                                <span className="shrink-0 text-sm font-semibold text-[var(--ink)]">Mentor AI</span>
                                <span className="hidden shrink-0 rounded-full border border-[var(--navy-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-soft)] sm:inline">
                                    Mentor 0.1
                                </span>
                                <p className="shrink-0 text-xs font-semibold text-[var(--ink-soft)]">
                                    Using {chatMaterials.length} source{chatMaterials.length === 1 ? "" : "s"}
                                </p>
                                <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
                                    {chatMaterials.map((material) => (
                                        <a
                                            key={material.id}
                                            href={`/api/courses/${course.id}/materials/${material.id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="chip max-w-[12rem] shrink-0 truncate hover:underline"
                                        >
                                            {material.title}
                                        </a>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => goToSection("materials")}
                                    aria-label="Change sources"
                                    title="Change sources"
                                    className="icon-btn shrink-0"
                                >
                                    <SlidersHorizontal />
                                </button>
                            </div>
                            {isSelectionChanged && (
                                <p role="status" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                    Your material selection has changed. This conversation still uses its listed sources. Select “Chat with Selected Materials” to switch; the new selection has its own saved conversation.
                                </p>
                            )}
                        </div>

                        <div ref={listRef} className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
                            {isLoadingHistory ? (
                                <div className="m-auto flex items-center gap-2 text-sm text-[#3d485e]">
                                    <LoaderCircle className="size-4 animate-spin" />
                                    Loading your saved Mentor conversation...
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="m-auto max-w-md text-center">
                                    <h2 className="text-lg font-semibold">Ask Mentor what you would like to understand.</h2>
                                    <p className="mt-2 text-sm leading-6 text-[#3d485e]">
                                        Mentor can explain a topic, work through an example, summarize your materials, or help you practise.
                                    </p>
                                </div>
                            ) : (
                                messages.map((message, index) => (
                                    <article key={message.id ?? `${index}-${message.role}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                        <div className={`min-w-0 rounded-2xl px-4 py-3 ${message.role === "user" ? "max-w-[90%] rounded-br-sm bg-[var(--gold)] text-[#071426] sm:max-w-[80%]" : "max-w-full rounded-bl-sm border border-[var(--navy-border)] bg-[var(--navy-700)] text-[var(--ink)] sm:max-w-[92%]"}`}>
                                            {message.role === "assistant" ? (
                                                <MarkdownMessage content={message.content} />
                                            ) : (
                                                <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                                            )}
                                            {message.role === "assistant" && message.citations.length > 0 && (
                                                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--navy-border)] pt-2 text-xs">
                                                    <span className="font-semibold text-[var(--ink-soft)]">Sources:</span>
                                                    {message.citations
                                                        .filter((citation, sourceIndex, citations) =>
                                                            citations.findIndex(
                                                                (item) =>
                                                                    (item.materialId ?? item.fileId) ===
                                                                    (citation.materialId ?? citation.fileId),
                                                            ) === sourceIndex,
                                                        )
                                                        .map((citation) => {
                                                            const source = course.materials.find(
                                                                (material) => material.id === citation.materialId,
                                                            );
                                                            return (
                                                                <a
                                                                    key={citation.fileId}
                                                                    href={
                                                                        citation.materialId
                                                                            ? `/api/courses/${course.id}/materials/${citation.materialId}`
                                                                            : undefined
                                                                    }
                                                                    target={citation.materialId ? "_blank" : undefined}
                                                                    rel={citation.materialId ? "noreferrer" : undefined}
                                                                    title={source?.title ?? citation.filename}
                                                                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--navy-border)] bg-[var(--navy-inset)] px-2 py-1 font-medium text-[var(--gold)] hover:text-[var(--gold-hover)]"
                                                                >
                                                                    <FileText className="size-3 shrink-0" />
                                                                    <span className="truncate">{(source?.title ?? citation.filename).replace(/\.(pdf|docx?|txt|pptx?|md)$/i, "").replace(/_/g, " ")}</span>
                                                                </a>
                                                            );
                                                        })}
                                                </div>
                                            )}
                                        </div>
                                    </article>
                                ))
                            )}
                            {isSending && (
                                <div className="flex justify-start">
                                    <div className="flex items-center gap-2 rounded-2xl border border-[var(--navy-border)] bg-[var(--navy-700)] px-4 py-3 text-sm text-[var(--ink-soft)]">
                                        <LoaderCircle className="size-4 animate-spin" />
                                        Mentor is searching the selected materials and preparing an explanation...
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && <p role="alert" className="mx-auto mb-2 w-full max-w-3xl shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

                        <form onSubmit={sendQuestion} className="mx-auto flex w-full max-w-3xl shrink-0 gap-2 border-t border-[var(--navy-border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
                            <label htmlFor="tutor-question" className="sr-only">Ask Mentor about selected materials</label>
                            <textarea
                                id="tutor-question"
                                value={question}
                                onChange={(event) => setQuestion(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        event.currentTarget.form?.requestSubmit();
                                    }
                                }}
                                maxLength={4_000}
                                rows={2}
                                placeholder={`Ask Mentor about ${chatMaterials.length ? "the selected materials" : "select materials to start chatting"}...`}
                                disabled={isLoadingHistory || isSending || chatMaterials.length === 0 || isSelectionChanged}
                                className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-[#212a3b]/15 bg-[#fffdf8] px-4 py-3 text-sm leading-6 outline-none focus:border-[#663820] focus:ring-2 focus:ring-[#663820]/15 disabled:opacity-60"
                            />
                            <button
                                type="submit"
                                disabled={!question.trim() || isLoadingHistory || isSending || chatMaterials.length === 0 || isSelectionChanged}
                                className="flex size-12 shrink-0 items-center justify-center self-end rounded-xl bg-[#663820] text-white transition hover:bg-[#4f2a18] disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Send question"
                            >
                                {isSending ? <LoaderCircle className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
                            </button>
                        </form>
                        {memorySummary && (
                            <p className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-2 text-xs text-[var(--ink-soft)]">
                                Mentor remembers learning context for this material to personalize future explanations.
                            </p>
                        )}
                    </section>
            )}
            </div>
                </main>
            </div>
        </div>
    );
}
