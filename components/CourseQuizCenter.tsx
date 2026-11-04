"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BookOpenCheck, CalendarPlus, Check, ChevronLeft, ChevronRight, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useDialogs } from "@/components/dialogs/DialogProvider";
import {
    MAX_TABLE_CELL_LENGTH,
    MAX_TEXT_ANSWER_LENGTH,
    isStructuredAnswerBlank,
    parseStructuredAnswer,
} from "@/lib/course-quiz";

type Material = { id: string; title: string; fileSize: number };
type FlashcardDeckOption = { id: string; name: string };
type QuizPart = {
    label: string;
    prompt: string;
    marks: number;
    format: "text" | "table";
    tableColumns: string[];
    tableRows: number;
};
type QuizQuestion = {
    id: string;
    prompt: string;
    type: "multiple_choice" | "true_false" | "short_answer" | "calculation" | "structured";
    difficulty: "easy" | "medium" | "hard";
    scenario?: string;
    marks?: number;
    parts?: QuizPart[];
    diagramSvg?: string;
    choices: string[];
    topic: string;
    sourceMaterialIds: string[];
    expectedAnswer?: string;
    explanation?: string;
    rubricItems?: { criterion: string; marks: number }[];
    correctChoiceIndex?: number;
    correctBoolean?: boolean;
};
type QuizAnswer = {
    questionId: string;
    value: string;
    correctness?: "correct" | "partially_correct" | "incorrect" | "uncertain";
    scoreFraction?: number;
    marksAwarded?: number;
    marksAvailable?: number;
    criteria?: { criterion: string; awarded: number; max: number; comment: string }[];
    feedback?: string;
    correctApproach?: string;
    incorrectPoints?: string[];
    missingPoints?: string[];
};
type Quiz = {
    id: string;
    status: "generated" | "in_progress" | "grading" | "completed";
    questions: QuizQuestion[];
    answers: QuizAnswer[];
    materialSources: { id: string; title: string }[];
    referenceType: "none" | "pasted" | "material" | "upload";
    referenceMaterial?: { id: string; title: string };
    settings: {
        questionCount: number;
        difficulty: string;
        questionType: string;
        coverage: string;
        topic: string;
    };
    scorePercent?: number;
    gradedQuestionCount?: number;
    createdAt: string;
    submittedAt?: string;
};
type QuizSummary = Omit<Quiz, "questions" | "answers"> & { questionCount: number };
type Props = {
    courseId: string;
    materials: Material[];
    initialMaterialIds: string[];
    onClose: () => void;
    onAddToRevisionPlan?: (topic: string) => void;
};

const MAX_REFERENCE_LENGTH = 12_000;

function errorMessage(value: unknown, fallback: string): string {
    return value instanceof Error ? value.message : fallback;
}

export default function CourseQuizCenter({
    courseId,
    materials,
    initialMaterialIds,
    onClose,
    onAddToRevisionPlan,
}: Props) {
    const { confirmDialog, promptDialog } = useDialogs();
    const [materialIds, setMaterialIds] = useState(initialMaterialIds);
    const [questionCountChoice, setQuestionCountChoice] = useState("5");
    const [customQuestionCount, setCustomQuestionCount] = useState("5");
    const questionCount = questionCountChoice === "custom"
        ? Number(customQuestionCount)
        : Number(questionCountChoice);
    const [difficulty, setDifficulty] = useState("medium");
    const [questionType, setQuestionType] = useState("multiple_choice");
    const [topic, setTopic] = useState("");
    const [referenceType, setReferenceType] = useState<"none" | "pasted" | "material" | "upload">("none");
    const [referenceMaterialId, setReferenceMaterialId] = useState("");
    const [referenceText, setReferenceText] = useState("");
    const [referenceFile, setReferenceFile] = useState<File | null>(null);
    const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
    const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [questionIndex, setQuestionIndex] = useState(0);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [flashcardDecks, setFlashcardDecks] = useState<FlashcardDeckOption[]>([]);
    const [flashcardDeckId, setFlashcardDeckId] = useState("");
    const [flashcardQuestionId, setFlashcardQuestionId] = useState("");
    const [flashcardNotice, setFlashcardNotice] = useState("");
    const [view, setView] = useState<"create" | "history">("create");
    const savingRef = useRef(false);
    const answerVersionRef = useRef(0);

    const selectedMaterials = useMemo(
        () => materials.filter((material) => materialIds.includes(material.id)),
        [materials, materialIds],
    );
    const currentQuestion = activeQuiz?.questions[questionIndex];
    const currentAnswer = activeQuiz?.answers.find((answer) => answer.questionId === currentQuestion?.id);
    const canAnswer = activeQuiz?.status === "generated" || activeQuiz?.status === "in_progress";
    const isWrittenQuiz =
        activeQuiz?.questions.some((question) => question.type === "short_answer" || question.type === "calculation" || question.type === "structured") ?? false;
    const isQuestionAnswered = (question: QuizQuestion) => {
        const value = answers[question.id] ?? "";
        return question.type === "structured" ? !isStructuredAnswerBlank(value) : Boolean(value.trim());
    };

    const loadHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const response = await fetch(`/api/courses/${courseId}/quizzes`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not load saved quizzes.");
            setQuizzes(result.quizzes);
        } catch (historyError) {
            console.error("Failed to load saved practice quizzes:", historyError);
            setError(errorMessage(historyError, "Could not load saved quizzes."));
        } finally {
            setIsLoadingHistory(false);
        }
    }, [courseId]);

    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);

    useEffect(() => {
        if (activeQuiz?.status !== "completed") return;
        let cancelled = false;
        fetch(`/api/courses/${courseId}/flashcards`)
            .then(async (response) => {
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Could not load flashcard decks.");
                if (!cancelled) {
                    setFlashcardDecks(result.decks.map((deck: FlashcardDeckOption) => ({ id: deck.id, name: deck.name })));
                }
            })
            .catch((deckError: unknown) => {
                if (cancelled) return;
                console.error("Failed to load decks for quiz flashcard conversion:", deckError);
                setFlashcardNotice(errorMessage(deckError, "Could not load flashcard decks."));
            });
        return () => {
            cancelled = true;
        };
    }, [activeQuiz?.status, courseId]);

    const createQuizFlashcardDeck = async () => {
        const name = await promptDialog({
            title: "Create a flashcard deck",
            description: "Give the new deck a name for this course.",
            label: "Deck name",
            placeholder: "e.g. Key formulas",
            confirmText: "Create deck",
            maxLength: 100,
        });
        if (!name?.trim()) return;
        setFlashcardNotice("");
        try {
            const response = await fetch(`/api/courses/${courseId}/flashcards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not create a flashcard deck.");
            const deck: FlashcardDeckOption = result.deck;
            setFlashcardDecks((previous) => [deck, ...previous]);
            setFlashcardDeckId(deck.id);
            setFlashcardNotice(`Created "${deck.name}".`);
        } catch (deckError) {
            console.error("Failed to create flashcard deck from quiz results:", deckError);
            setFlashcardNotice(errorMessage(deckError, "Could not create a flashcard deck."));
        }
    };

    const addQuizQuestionToFlashcards = async (questionId: string) => {
        if (!activeQuiz || !flashcardDeckId || flashcardQuestionId) return;
        setFlashcardNotice("");
        setFlashcardQuestionId(questionId);
        try {
            const response = await fetch(`/api/courses/${courseId}/quizzes/${activeQuiz.id}/flashcards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deckId: flashcardDeckId, questionId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not add this question to flashcards.");
            setFlashcardNotice(result.alreadyExists ? "This quiz question has already been added as a flashcard." : "Added to flashcards.");
        } catch (conversionError) {
            console.error("Failed to convert quiz question to flashcard:", conversionError);
            setFlashcardNotice(errorMessage(conversionError, "Could not add this question to flashcards."));
        } finally {
            setFlashcardQuestionId("");
        }
    };

    const saveAnswers = useCallback(async (quiz: Quiz, values: Record<string, string>): Promise<boolean> => {
        if (savingRef.current) return false;
        savingRef.current = true;
        const version = answerVersionRef.current;
        setIsSaving(true);
        try {
            const response = await fetch(`/api/courses/${courseId}/quizzes/${quiz.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    answers: quiz.questions.map((question) => ({
                        questionId: question.id,
                        value: values[question.id] ?? "",
                    })),
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not save your answers.");
            if (answerVersionRef.current === version) setIsDirty(false);
            return true;
        } catch (saveError) {
            console.error("Failed to save quiz answers:", saveError);
            setError(errorMessage(saveError, "Could not save your answers. Your answer is still here; please try again."));
            return false;
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    }, [courseId]);

    // Saves only when the student has unsaved changes; resolves false when the save failed.
    const saveIfDirty = async () => {
        if (!activeQuiz || !canAnswer || !isDirty) return true;
        return saveAnswers(activeQuiz, answers);
    };

    const goToQuestion = async (target: number) => {
        if (isSaving || isSubmitting) return;
        if (!(await saveIfDirty())) return;
        setNotice("");
        setQuestionIndex(target);
    };

    const selectQuiz = async (quizId: string) => {
        setError("");
        setNotice("");
        setIsLoadingQuiz(true);
        try {
            const response = await fetch(`/api/courses/${courseId}/quizzes/${quizId}`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not open this quiz.");
            const quiz: Quiz = result.quiz;
            setActiveQuiz(quiz);
            setAnswers(Object.fromEntries(quiz.answers.map((answer) => [answer.questionId, answer.value])));
            setQuestionIndex(0);
            setIsDirty(false);
            setView("create");
        } catch (loadError) {
            console.error("Failed to open saved quiz:", loadError);
            setError(errorMessage(loadError, "Could not open this quiz."));
        } finally {
            setIsLoadingQuiz(false);
        }
    };

    const generateQuiz = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (materialIds.length === 0) {
            setError("Select at least one study material to generate questions.");
            return;
        }
        if (
            !Number.isInteger(questionCount) ||
            questionCount < 1 ||
            questionCount > 20 ||
            (topic.trim().length > 200)
        ) {
            setError("Choose a valid question count (1-20) and keep the topic under 200 characters.");
            return;
        }
        if (referenceType === "pasted" && (!referenceText.trim() || referenceText.length > MAX_REFERENCE_LENGTH)) {
            setError(`Paste examples up to ${MAX_REFERENCE_LENGTH} characters long.`);
            return;
        }
        if (referenceType === "material" && !referenceMaterialId) {
            setError("Choose a material to use as the lecturer-style reference.");
            return;
        }
        if (referenceType === "upload" && !referenceFile) {
            setError("Choose a Word or Excel document containing past questions.");
            return;
        }

        setError("");
        setNotice("");
        setIsGenerating(true);
        try {
            const values = {
                materialIds: JSON.stringify(materialIds),
                questionCount: String(questionCount),
                difficulty,
                questionType,
                coverage: topic.trim() ? "topic" : "all",
                topic: topic.trim(),
                referenceType,
                referenceMaterialId,
                referenceText: referenceType === "pasted" ? referenceText : "",
            };
            let response: Response;
            if (referenceType === "upload" && referenceFile) {
                const form = new FormData();
                for (const [key, value] of Object.entries(values)) form.append(key, value);
                form.append("referenceFile", referenceFile);
                response = await fetch(`/api/courses/${courseId}/quizzes`, {
                    method: "POST",
                    body: form,
                });
            } else {
                response = await fetch(`/api/courses/${courseId}/quizzes`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...values,
                        materialIds,
                        questionCount,
                        referenceText: values.referenceText,
                    }),
                });
            }
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not generate a quiz.");
            const quiz = result.quiz as Quiz;
            setActiveQuiz(quiz);
            setAnswers({});
            setQuestionIndex(0);
            setIsDirty(false);
            setReferenceFile(null);
            setView("create");
            await loadHistory();
        } catch (generationError) {
            console.error("Quiz generation failed:", generationError);
            setError(errorMessage(generationError, "Could not generate a quiz."));
        } finally {
            setIsGenerating(false);
        }
    };

    const updateAnswer = (value: string) => {
        if (!currentQuestion || isSubmitting || !canAnswer) return;
        answerVersionRef.current += 1;
        setAnswers((previous) => ({ ...previous, [currentQuestion.id]: value }));
        setIsDirty(true);
        setNotice("");
        setError("");
    };

    const updateStructuredPart = (label: string, entry: string | string[][]) => {
        if (!currentQuestion) return;
        const current = parseStructuredAnswer(answers[currentQuestion.id] ?? "");
        updateAnswer(JSON.stringify({ ...current, [label]: entry }));
    };

    const submitQuiz = async () => {
        if (!activeQuiz || isSubmitting || activeQuiz.status === "completed") return;
        const confirmed = await confirmDialog({
            title: "Submit this quiz?",
            description: "You cannot change your answers after submission.",
            confirmText: "Submit quiz",
            variant: "info",
        });
        if (!confirmed) return;

        setError("");
        setNotice("");
        setIsSubmitting(true);
        try {
            if (isDirty && !(await saveAnswers(activeQuiz, answers))) return;
            const response = await fetch(`/api/courses/${courseId}/quizzes/${activeQuiz.id}`, {
                method: "POST",
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not submit your quiz.");
            const quiz: Quiz = result.quiz;
            setActiveQuiz(quiz);
            setAnswers(Object.fromEntries(quiz.answers.map((answer) => [answer.questionId, answer.value])));
            setIsDirty(false);
            setQuestionIndex(0);
            setNotice("");
            await loadHistory();
        } catch (submitError) {
            console.error("Quiz submission failed:", submitError);
            setError(errorMessage(submitError, "Could not submit your quiz."));
        } finally {
            setIsSubmitting(false);
        }
    };

    const returnToSetup = async () => {
        if (isSaving) return;
        if (activeQuiz && isDirty && !(await saveAnswers(activeQuiz, answers))) return;
        setActiveQuiz(null);
        setAnswers({});
        setQuestionIndex(0);
        setError("");
        setNotice("");
    };

    const openHistory = async () => {
        if (isSaving) return;
        if (activeQuiz && isDirty && !(await saveAnswers(activeQuiz, answers))) return;
        setView("history");
        setActiveQuiz(null);
        setError("");
    };

    const closeQuizCenter = async () => {
        if (isSaving) return;
        if (activeQuiz && isDirty && !(await saveAnswers(activeQuiz, answers))) return;
        onClose();
    };

    return (
        <section className="rounded-2xl border border-[#663820]/20 bg-[#fffdf8] p-5 shadow-soft-sm sm:p-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#f3e4c7] p-3 text-[#663820]">
                        <BookOpenCheck className="size-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold">Practice questions</h2>
                        <p className="text-sm text-[#3d485e]">Study, answer, and review a quiz grounded in your course materials.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => { void closeQuizCenter(); }}
                    aria-label="Close practice questions"
                    className="rounded-lg p-2 text-[#3d485e] hover:bg-[#f3e4c7]"
                >
                    <X className="size-5" />
                </button>
            </div>

            <div className="mb-5 flex gap-2 border-b border-[#212a3b]/10">
                <button
                    type="button"
                    onClick={() => {
                        setView("create");
                        void returnToSetup();
                    }}
                    className={`border-b-2 px-3 py-2 text-sm font-semibold ${view === "create" ? "border-[#663820] text-[#663820]" : "border-transparent text-[#3d485e]"}`}
                >
                    Generate quiz
                </button>
                <button
                    type="button"
                    onClick={() => { void openHistory(); }}
                    className={`border-b-2 px-3 py-2 text-sm font-semibold ${view === "history" ? "border-[#663820] text-[#663820]" : "border-transparent text-[#3d485e]"}`}
                >
                    Saved quizzes ({quizzes.length})
                </button>
            </div>

            {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
            {notice && <p role="status" className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

            {view === "history" ? (
                <div className="space-y-3">
                    {isLoadingHistory ? (
                        <p className="flex items-center gap-2 text-sm text-[#3d485e]"><LoaderCircle className="size-4 animate-spin" />Loading saved quizzes...</p>
                    ) : quizzes.length === 0 ? (
                        <p className="rounded-xl bg-white p-5 text-sm text-[#3d485e]">Your completed and in-progress quizzes will appear here.</p>
                    ) : quizzes.map((quiz) => (
                        <button
                            key={quiz.id}
                            type="button"
                            onClick={() => void selectQuiz(quiz.id)}
                            disabled={isLoadingQuiz}
                            className="flex w-full flex-col gap-2 rounded-xl border border-[#212a3b]/10 bg-white p-4 text-left hover:border-[#663820]/40 sm:flex-row sm:items-center sm:justify-between"
                        >
                            <span>
                                <span className="block font-semibold">{quiz.settings.questionCount} {quiz.settings.questionType.replaceAll("_", " ")} questions</span>
                                <span className="text-xs text-[#3d485e]">
                                    {new Date(quiz.createdAt).toLocaleString()} · {quiz.materialSources.map((item) => item.title).join(", ")}
                                </span>
                            </span>
                            <span className="text-sm font-semibold text-[#663820]">
                                {quiz.status === "completed"
                                    ? `${quiz.scorePercent ?? "Ungraded"}% · Review`
                                    : quiz.status === "grading" ? "Grading..." : "Continue quiz"}
                            </span>
                        </button>
                    ))}
                </div>
            ) : activeQuiz ? (
                <div>
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-[#663820]">
                                {activeQuiz.status === "completed"
                                    ? "Quiz results"
                                    : activeQuiz.status === "grading"
                                      ? "Your quiz is being graded"
                                      : "Assessment mode · answers hidden until submission"}
                            </p>
                            <h3 className="mt-1 text-lg font-semibold">
                                Question {questionIndex + 1} of {activeQuiz.questions.length}
                            </h3>
                            <p className="mt-1 text-xs text-[#3d485e]">
                                Sources: {activeQuiz.materialSources.map((source) => source.title).join(", ")}
                            </p>
                        </div>
                        {activeQuiz.status === "completed" && (
                            <div className="rounded-xl bg-[#f3e4c7] px-4 py-2 text-right">
                                <p className="text-xs text-[#3d485e]">Score</p>
                                <p className="text-xl font-bold text-[#663820]">
                                    {activeQuiz.scorePercent === undefined ? "Ungraded" : `${activeQuiz.scorePercent}%`}
                                </p>
                                {activeQuiz.gradedQuestionCount !== activeQuiz.questions.length && (
                                    <p className="text-xs text-[#3d485e]">
                                        Based on {activeQuiz.gradedQuestionCount ?? 0} of {activeQuiz.questions.length} graded questions
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Question progress">
                        {activeQuiz.questions.map((question, index) => {
                            const answered = isQuestionAnswered(question);
                            const feedback = activeQuiz.answers.find((answer) => answer.questionId === question.id);
                            return (
                                <button
                                    key={question.id}
                                    type="button"
                                    onClick={() => { void goToQuestion(index); }}
                                    disabled={isSaving || isSubmitting}
                                    aria-label={`Go to question ${index + 1}${answered ? ", answered" : ", unanswered"}`}
                                    className={`grid size-9 place-items-center rounded-lg border text-sm font-semibold ${
                                        feedback?.correctness === "correct"
                                            ? "border-green-300 bg-green-50 text-green-800"
                                            : feedback?.correctness === "incorrect"
                                              ? "border-red-300 bg-red-50 text-red-800"
                                              : feedback?.correctness === "partially_correct"
                                                ? "border-amber-300 bg-amber-50 text-amber-900"
                                                : answered
                                                  ? "border-[#663820] bg-[#663820] text-white"
                                                  : "border-[#212a3b]/15 bg-white text-[#3d485e]"
                                    }`}
                                >
                                    {index + 1}
                                </button>
                            );
                        })}
                    </div>

                    {currentQuestion && (
                        <article className="rounded-xl border border-[#212a3b]/10 bg-white p-4 sm:p-6">
                            <div className="mb-3 flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full bg-[#f8f4e9] px-3 py-1 font-semibold capitalize">{currentQuestion.difficulty}</span>
                                {currentQuestion.topic && <span className="rounded-full bg-[#f8f4e9] px-3 py-1">{currentQuestion.topic}</span>}
                                {(currentQuestion.marks ?? 1) > 1 && (
                                    <span className="rounded-full bg-[#f3e4c7] px-3 py-1 font-semibold">{currentQuestion.marks} marks</span>
                                )}
                            </div>
                            {currentQuestion.scenario?.trim() && (
                                <div className="mb-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[#212a3b]/10 bg-[#f8f4e9] p-4 text-sm leading-6">
                                    {currentQuestion.scenario}
                                </div>
                            )}
                            {currentQuestion.diagramSvg?.trim() && (
                                <figure className="mb-3">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={`data:image/svg+xml;utf8,${encodeURIComponent(currentQuestion.diagramSvg)}`}
                                        alt="Schematic illustration for this question"
                                        className="mx-auto max-h-72 w-full max-w-md rounded-xl border border-[#212a3b]/10 bg-white"
                                    />
                                    <figcaption className="mt-1 text-center text-xs text-[#3d485e]">Schematic illustration</figcaption>
                                </figure>
                            )}
                            <h4 className="whitespace-pre-wrap text-base font-semibold leading-7">{currentQuestion.prompt}</h4>
                            {currentQuestion.sourceMaterialIds.length > 0 && (
                                <p className="mt-2 text-xs text-[#3d485e]">
                                    Based on: {currentQuestion.sourceMaterialIds
                                        .map((id) => activeQuiz.materialSources.find((source) => source.id === id)?.title)
                                        .filter(Boolean)
                                        .join(", ")}
                                </p>
                            )}

                            {currentQuestion.type === "multiple_choice" ? (
                                <fieldset className="mt-5 space-y-2" disabled={!canAnswer || isSubmitting}>
                                    <legend className="sr-only">Choose an answer</legend>
                                    {currentQuestion.choices.map((choice, index) => (
                                        <label key={`${index}-${choice}`} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${answers[currentQuestion.id] === String(index) ? "border-[#663820] bg-[#fff6e5]" : "border-[#212a3b]/10 hover:bg-[#f8f4e9]"}`}>
                                            <input
                                                type="radio"
                                                name={`quiz-answer-${currentQuestion.id}`}
                                                checked={answers[currentQuestion.id] === String(index)}
                                                onChange={() => updateAnswer(String(index))}
                                                className="mt-0.5 accent-[#663820]"
                                            />
                                            <span><strong className="mr-2">{String.fromCharCode(65 + index)}.</strong>{choice}</span>
                                        </label>
                                    ))}
                                </fieldset>
                            ) : currentQuestion.type === "true_false" ? (
                                <div className="mt-5 flex gap-3">
                                    {["true", "false"].map((choice) => (
                                        <label key={choice} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm capitalize ${answers[currentQuestion.id] === choice ? "border-[#663820] bg-[#fff6e5]" : "border-[#212a3b]/10 hover:bg-[#f8f4e9]"}`}>
                                            <input
                                                type="radio"
                                                name={`quiz-answer-${currentQuestion.id}`}
                                                value={choice}
                                                checked={answers[currentQuestion.id] === choice}
                                                onChange={() => updateAnswer(choice)}
                                                disabled={!canAnswer || isSubmitting}
                                                className="accent-[#663820]"
                                            />
                                            {choice}
                                        </label>
                                    ))}
                                </div>
                            ) : currentQuestion.type === "structured" ? (
                                <div className="mt-5 space-y-5">
                                    {(currentQuestion.parts ?? []).map((part) => {
                                        const stored = parseStructuredAnswer(answers[currentQuestion.id] ?? "")[part.label];
                                        return (
                                            <div key={part.label} className="rounded-xl border border-[#212a3b]/10 p-3">
                                                <p className="mb-2 text-sm font-semibold">
                                                    ({part.label}) <span className="font-normal whitespace-pre-wrap">{part.prompt}</span>
                                                    <span className="ml-2 text-xs font-semibold text-[#663820]">[{part.marks} mark{part.marks === 1 ? "" : "s"}]</span>
                                                </p>
                                                {part.format === "table" ? (
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full min-w-[480px] border-collapse text-sm">
                                                            <thead>
                                                                <tr>
                                                                    {part.tableColumns.map((column, columnIndex) => (
                                                                        <th key={columnIndex} className="border border-[#212a3b]/15 bg-[#f8f4e9] px-2 py-1.5 text-left font-semibold">{column}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {Array.from({ length: part.tableRows }, (_, rowIndex) => (
                                                                    <tr key={rowIndex}>
                                                                        {part.tableColumns.map((column, columnIndex) => {
                                                                            const grid = Array.isArray(stored) ? stored : [];
                                                                            return (
                                                                                <td key={columnIndex} className="border border-[#212a3b]/15 p-0">
                                                                                    <input
                                                                                        value={grid[rowIndex]?.[columnIndex] ?? ""}
                                                                                        onChange={(event) => {
                                                                                            const next = Array.from({ length: part.tableRows }, (_, r) =>
                                                                                                Array.from({ length: part.tableColumns.length }, (_, c) => grid[r]?.[c] ?? ""),
                                                                                            );
                                                                                            next[rowIndex][columnIndex] = event.target.value;
                                                                                            updateStructuredPart(part.label, next);
                                                                                        }}
                                                                                        maxLength={MAX_TABLE_CELL_LENGTH}
                                                                                        disabled={!canAnswer || isSubmitting}
                                                                                        aria-label={`Part ${part.label}, row ${rowIndex + 1}, ${column}`}
                                                                                        className="w-full bg-transparent px-2 py-2 text-sm outline-none focus:bg-[#fff6e5]"
                                                                                    />
                                                                                </td>
                                                                            );
                                                                        })}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <textarea
                                                        value={typeof stored === "string" ? stored : ""}
                                                        onChange={(event) => updateStructuredPart(part.label, event.target.value)}
                                                        maxLength={MAX_TEXT_ANSWER_LENGTH}
                                                        rows={4}
                                                        disabled={!canAnswer || isSubmitting}
                                                        aria-label={`Answer for part ${part.label}`}
                                                        placeholder="Show your workings and answer..."
                                                        className="w-full rounded-xl border border-[#212a3b]/15 p-3 text-sm outline-none focus:border-[#663820]"
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <label className="mt-5 block">
                                    <span className="mb-2 block text-sm font-medium">Your answer</span>
                                    <textarea
                                        value={answers[currentQuestion.id] ?? ""}
                                        onChange={(event) => updateAnswer(event.target.value)}
                                        maxLength={MAX_TEXT_ANSWER_LENGTH}
                                        rows={5}
                                        disabled={!canAnswer || isSubmitting}
                                        placeholder="Show your answer and workings where relevant..."
                                        className="w-full rounded-xl border border-[#212a3b]/15 p-3 text-sm outline-none focus:border-[#663820]"
                                    />
                                </label>
                            )}

                            {activeQuiz.status === "completed" && (
                                <div className="mt-5 space-y-3 border-t border-[#212a3b]/10 pt-4">
                                    <div className={`rounded-xl p-3 text-sm ${
                                        currentAnswer?.correctness === "correct"
                                            ? "bg-green-50 text-green-900"
                                            : currentAnswer?.correctness === "uncertain"
                                              ? "bg-slate-50 text-slate-800"
                                              : "bg-amber-50 text-amber-950"
                                    }`}>
                                        <p className="font-semibold capitalize">
                                            {currentAnswer?.correctness?.replaceAll("_", " ") ?? "Result"}
                                            {currentAnswer?.marksAvailable !== undefined && currentAnswer.marksAwarded !== undefined && (
                                                <span className="ml-2 normal-case">· {currentAnswer.marksAwarded} / {currentAnswer.marksAvailable} marks</span>
                                            )}
                                        </p>
                                        <p className="mt-1 whitespace-pre-wrap">
                                            {currentAnswer?.feedback}
                                        </p>
                                        {currentAnswer?.correctness === "uncertain" && (
                                            <p className="mt-1 text-xs">Elio AI was not fully confident marking this answer. Compare it with the model answer below.</p>
                                        )}
                                    </div>
                                    {currentAnswer?.criteria && currentAnswer.criteria.length > 0 && (
                                        <div className="overflow-x-auto">
                                            <p className="mb-1 text-sm font-semibold">Marking breakdown</p>
                                            <table className="w-full min-w-[320px] border-collapse text-sm">
                                                <tbody>
                                                    {currentAnswer.criteria.map((item, itemIndex) => (
                                                        <tr key={itemIndex} className="border-b border-[#212a3b]/10 align-top">
                                                            <td className="py-1.5 pr-3">
                                                                {item.criterion}
                                                                {item.comment && <span className="block text-xs text-[#3d485e]">{item.comment}</span>}
                                                            </td>
                                                            <td className="whitespace-nowrap py-1.5 text-right font-semibold">{item.awarded} / {item.max}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    {currentAnswer?.correctApproach && (
                                        <div>
                                            <p className="text-sm font-semibold">Correct approach</p>
                                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{currentAnswer.correctApproach}</p>
                                        </div>
                                    )}
                                    {currentAnswer?.incorrectPoints?.length ? (
                                        <p className="text-sm text-[#3d485e]">
                                            Mistakes: {currentAnswer.incorrectPoints.join("; ")}
                                        </p>
                                    ) : null}
                                    {currentQuestion.expectedAnswer && (
                                        <div>
                                            <p className="text-sm font-semibold">Expected answer</p>
                                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{currentQuestion.expectedAnswer}</p>
                                        </div>
                                    )}
                                    {currentQuestion.explanation && (
                                        <div>
                                            <p className="text-sm font-semibold">Explanation</p>
                                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{currentQuestion.explanation}</p>
                                        </div>
                                    )}
                                    {currentAnswer?.missingPoints?.length ? (
                                        <p className="text-sm text-[#3d485e]">
                                            Areas to improve: {currentAnswer.missingPoints.join("; ")}
                                        </p>
                                    ) : null}
                                    {currentAnswer?.correctness !== "correct" && (
                                        <div className="rounded-xl bg-[#f8f4e9] p-3">
                                            <p className="text-sm font-semibold">Turn this missed question into a flashcard</p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {flashcardDecks.length > 0 && (
                                                    <select
                                                        aria-label="Flashcard deck"
                                                        value={flashcardDeckId}
                                                        onChange={(event) => setFlashcardDeckId(event.target.value)}
                                                        className="min-w-48 rounded-lg border bg-white px-3 py-2 text-sm"
                                                    >
                                                        <option value="">Choose a deck</option>
                                                        {flashcardDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
                                                    </select>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => void createQuizFlashcardDeck()}
                                                    className="rounded-lg border border-[#663820] px-3 py-2 text-sm font-semibold text-[#663820]"
                                                >
                                                    Create deck
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void addQuizQuestionToFlashcards(currentQuestion.id)}
                                                    disabled={!flashcardDeckId || Boolean(flashcardQuestionId)}
                                                    className="btn-primary disabled:opacity-50"
                                                >
                                                    {flashcardQuestionId === currentQuestion.id
                                                        ? <LoaderCircle className="size-4 animate-spin" />
                                                        : <Check className="size-4" />}
                                                    Add to deck
                                                </button>
                                            </div>
                                            {flashcardNotice && <p role="status" className="mt-2 text-xs text-[#3d485e]">{flashcardNotice}</p>}
                                            {onAddToRevisionPlan && currentQuestion.topic && (
                                                <div className="mt-3 border-t border-[#212a3b]/10 pt-3">
                                                    <p className="text-sm font-semibold">Revise this topic</p>
                                                    <p className="mt-1 text-xs text-[#3d485e]">Topic: {currentQuestion.topic}</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => onAddToRevisionPlan(currentQuestion.topic)}
                                                        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#663820] px-3 py-2 text-sm font-semibold text-[#663820] hover:bg-white"
                                                    >
                                                        <CalendarPlus className="size-4" />Add to revision plan
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </article>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-[#3d485e]">
                            {activeQuiz.status === "completed"
                                ? "Submitted answers and feedback are saved."
                                : isSaving ? "Saving answers..." : isDirty ? "Unsaved changes · saved when you move on or submit" : "All changes saved"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => { void goToQuestion(Math.max(0, questionIndex - 1)); }}
                                disabled={questionIndex === 0 || isSaving || isSubmitting}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#212a3b]/15 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                            >
                                {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <ChevronLeft className="size-4" />}Previous
                            </button>
                            {questionIndex < activeQuiz.questions.length - 1 ? (
                                <button
                                    type="button"
                                    onClick={() => { void goToQuestion(Math.min(activeQuiz.questions.length - 1, questionIndex + 1)); }}
                                    disabled={isSaving || isSubmitting}
                                    className="inline-flex items-center gap-1 rounded-lg border border-[#212a3b]/15 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                                >
                                    Next{isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
                                </button>
                            ) : activeQuiz.status !== "completed" ? (
                                <button
                                    type="button"
                                    onClick={() => void submitQuiz()}
                                    disabled={isSaving || isSubmitting || activeQuiz.status === "grading"}
                                    className="btn-primary disabled:opacity-50"
                                >
                                    {isSubmitting || activeQuiz.status === "grading"
                                        ? <><LoaderCircle className="size-4 animate-spin" />Grading...</>
                                        : <><Check className="size-4" />Submit quiz</>}
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => { void returnToSetup(); }}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#212a3b]/15 px-3 py-2 text-sm font-semibold"
                            >
                                <RotateCcw className="size-4" />New quiz
                            </button>
                        </div>
                    </div>
                    {isWrittenQuiz && activeQuiz.status !== "completed" && (
                        <p className="mt-3 text-xs text-[#3d485e]">Written answers are assessed after you submit. Feedback is AI-assisted and may not reflect an official marking scheme.</p>
                    )}
                </div>
            ) : (
                <form onSubmit={generateQuiz} className="space-y-6">
                    <fieldset>
                        <legend className="mb-2 text-sm font-semibold">1. Choose study materials</legend>
                        <p className="mb-3 text-xs text-[#3d485e]">Questions and correct answers will be grounded only in these selected materials.</p>
                        {materials.length === 0 ? (
                            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Add a course material before generating a quiz.</p>
                        ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {materials.map((material) => (
                                    <label key={material.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#212a3b]/10 bg-white p-3 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={materialIds.includes(material.id)}
                                            onChange={() => setMaterialIds((previous) =>
                                                previous.includes(material.id)
                                                    ? previous.filter((id) => id !== material.id)
                                                    : [...previous, material.id],
                                            )}
                                            className="size-4 accent-[#663820]"
                                        />
                                        <span className="truncate font-medium">{material.title}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </fieldset>

                    <fieldset>
                        <legend className="mb-2 text-sm font-semibold">2. Lecturer-style examples (optional)</legend>
                        <p className="mb-3 text-xs text-[#3d485e]">Examples guide style only; they do not replace the selected materials as factual sources.</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {([
                                ["none", "No past questions? Continue without examples."],
                                ["material", "Choose an existing course material"],
                                ["pasted", "Paste questions and answers"],
                                ["upload", "Upload a temporary Word or Excel document"],
                            ] as const).map(([value, label]) => (
                                <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${referenceType === value ? "border-[#663820] bg-[#fff6e5]" : "border-[#212a3b]/10 bg-white"}`}>
                                    <input
                                        type="radio"
                                        name="reference-type"
                                        checked={referenceType === value}
                                        onChange={() => setReferenceType(value)}
                                        className="mt-0.5 accent-[#663820]"
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                        {referenceType === "material" && (
                            <div className="mt-3">
                                <label htmlFor="quiz-reference-material" className="mb-1 block text-sm font-medium">Reference material</label>
                                <select
                                    id="quiz-reference-material"
                                    value={referenceMaterialId}
                                    onChange={(event) => setReferenceMaterialId(event.target.value)}
                                    className="w-full rounded-xl border border-[#212a3b]/15 bg-white p-3 text-sm"
                                    required
                                >
                                    <option value="">Select a material for lecturer style</option>
                                    {materials.map((material) => (
                                        <option key={material.id} value={material.id}>
                                            {material.title}{materialIds.includes(material.id) ? " (also selected as a knowledge source)" : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {referenceType === "pasted" && (
                            <label className="mt-3 block">
                                <span className="mb-1 block text-sm font-medium">Past questions and answers</span>
                                <textarea
                                    value={referenceText}
                                    onChange={(event) => setReferenceText(event.target.value)}
                                    maxLength={MAX_REFERENCE_LENGTH}
                                    rows={5}
                                    required
                                    placeholder="Paste examples, including answers when available..."
                                    className="w-full rounded-xl border border-[#212a3b]/15 bg-white p-3 text-sm"
                                />
                                <span className="mt-1 block text-right text-xs text-[#3d485e]">{referenceText.length}/{MAX_REFERENCE_LENGTH}</span>
                            </label>
                        )}
                        {referenceType === "upload" && (
                            <label className="mt-3 block">
                                <span className="mb-1 block text-sm font-medium">Temporary reference document</span>
                                <input
                                    type="file"
                                    accept=".doc,.docx,.xls,.xlsx"
                                    onChange={(event) => setReferenceFile(event.target.files?.[0] ?? null)}
                                    className="block w-full rounded-xl border border-[#212a3b]/15 bg-white p-3 text-sm"
                                    required
                                />
                                <span className="mt-1 block text-xs text-[#3d485e]">Accepted: DOC, DOCX, XLS, XLSX; up to 10 MB. Processed for this request only and not added to your course library.</span>
                            </label>
                        )}
                    </fieldset>

                    <fieldset>
                        <legend className="mb-2 text-sm font-semibold">3. Quiz settings</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-sm">
                                <span className="mb-1 block font-medium">Number of questions</span>
                                <select
                                    value={questionCountChoice}
                                    onChange={(event) => setQuestionCountChoice(event.target.value)}
                                    className="w-full rounded-xl border border-[#212a3b]/15 bg-white p-3"
                                >
                                    <option value="5">5</option>
                                    <option value="10">10</option>
                                    <option value="20">20</option>
                                    <option value="custom">Custom (1–20)</option>
                                </select>
                                {questionCountChoice === "custom" && (
                                    <input
                                        type="number"
                                        min={1}
                                        max={20}
                                        value={customQuestionCount}
                                        onChange={(event) => setCustomQuestionCount(event.target.value)}
                                        className="mt-2 w-full rounded-xl border border-[#212a3b]/15 bg-white p-3"
                                        aria-label="Custom number of questions"
                                    />
                                )}
                            </label>
                            <label className="text-sm">
                                <span className="mb-1 block font-medium">Difficulty</span>
                                <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="w-full rounded-xl border border-[#212a3b]/15 bg-white p-3">
                                    <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                                </select>
                            </label>
                            <label className="text-sm">
                                <span className="mb-1 block font-medium">Question type</span>
                                <select value={questionType} onChange={(event) => setQuestionType(event.target.value)} className="w-full rounded-xl border border-[#212a3b]/15 bg-white p-3">
                                    <option value="multiple_choice">Multiple choice</option>
                                    <option value="true_false">True/false</option>
                                    <option value="short_answer">Short answer</option>
                                    <option value="calculation">Calculation (workings and final answer)</option>
                                    <option value="structured">Structured exam question (multi-part, tables, workings)</option>
                                </select>
                            </label>
                            <label className="text-sm sm:col-span-2">
                                <span className="mb-1 block font-medium">Topic or chapter (optional)</span>
                                <input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={200} placeholder="e.g. Depreciation, Partnership Accounts, Chapter 4..." className="w-full rounded-xl border border-[#212a3b]/15 bg-white p-3" />
                                <span className="mt-1 block text-xs text-[#3d485e]">Focus your practice on a specific topic within your selected materials.</span>
                            </label>
                        </div>
                    </fieldset>

                    <div className="flex flex-col gap-3 border-t border-[#212a3b]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-[#3d485e]">
                            {selectedMaterials.length} material{selectedMaterials.length === 1 ? "" : "s"} selected · Assessment mode hides answers until submission
                        </p>
                        <button type="submit" disabled={isGenerating || materialIds.length === 0} className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50">
                            {isGenerating ? <><LoaderCircle className="size-5 animate-spin" />Generating...</> : <><BookOpenCheck className="size-5" />Generate quiz</>}
                        </button>
                    </div>
                    <p className="text-xs text-[#3d485e]">To control API costs, quiz generation is limited to 5 quizzes per course per hour; each quiz can contain up to 20 questions. A smaller quiz may be offered when your materials have limited coverage.</p>
                </form>
            )}
        </section>
    );
}
