"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpen, Check, LoaderCircle, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toggleMaterialSelection } from "@/lib/material-selection";
import { useDialogs } from "@/components/dialogs/DialogProvider";

type Material = { id: string; title: string };
type Deck = { id: string; name: string; cardCount: number; dueCount: number; reviewedCount: number };
type Source = { id: string; title: string; available: boolean };
type Card = {
    id: string;
    front: string;
    back: string;
    topic: string;
    sourceMaterials: Source[];
    schedule: { dueAt: string; intervalDays: number; repetitions: number; easeFactor: number };
};
type PreviewCard = {
    front: string;
    back: string;
    topic: string;
    sourceMaterials: Source[];
    duplicateInDeck: boolean;
};
type Props = {
    courseId: string;
    courseName: string;
    materials: Material[];
    initialMaterialIds: string[];
    onClose: () => void;
};

const RATING_LABELS = [
    { value: "again", label: "Again", help: "Could not recall" },
    { value: "hard", label: "Hard", help: "Significant effort" },
    { value: "good", label: "Good", help: "Normal effort" },
    { value: "easy", label: "Easy", help: "Confident recall" },
] as const;

function readError(data: unknown, fallback: string): string {
    return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : fallback;
}

export default function CourseFlashcardCenter({
    courseId,
    courseName,
    materials,
    initialMaterialIds,
    onClose,
}: Props) {
    const { confirmDialog } = useDialogs();
    const [decks, setDecks] = useState<Deck[]>([]);
    const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
    const [cards, setCards] = useState<Card[]>([]);
    const [materialIds, setMaterialIds] = useState(initialMaterialIds);
    const [deckName, setDeckName] = useState("");
    const [newDeckName, setNewDeckName] = useState("");
    const [questionCount, setQuestionCount] = useState(10);
    const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
    const [topic, setTopic] = useState("");
    const [generationId, setGenerationId] = useState("");
    const [preview, setPreview] = useState<PreviewCard[]>([]);
    const [selectedPreviewIndexes, setSelectedPreviewIndexes] = useState<number[]>([]);
    const [manualFront, setManualFront] = useState("");
    const [manualBack, setManualBack] = useState("");
    const [editingCardId, setEditingCardId] = useState("");
    const [revealed, setRevealed] = useState(false);
    const [reviewIndex, setReviewIndex] = useState(0);
    const [reviewMode, setReviewMode] = useState<"due" | "all" | null>(null);
    const [pendingRating, setPendingRating] = useState<{
        cardId: string;
        rating: typeof RATING_LABELS[number]["value"];
        requestId: string;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isWorking, setIsWorking] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const activeCard = cards[reviewIndex];
    const selectedMaterials = useMemo(
        () => materials.filter((material) => materialIds.includes(material.id)),
        [materials, materialIds],
    );

    const loadDecks = useCallback(async () => {
        const response = await fetch(`/api/courses/${courseId}/flashcards`);
        const result: unknown = await response.json();
        if (!response.ok) throw new Error(readError(result, "Could not load flashcard decks."));
        if (typeof result === "object" && result !== null && "decks" in result && Array.isArray(result.decks)) {
            const nextDecks = result.decks as Deck[];
            setDecks(nextDecks);
            setActiveDeck((previous) =>
                previous
                    ? nextDecks.find((deck) => deck.id === previous.id) ?? previous
                    : previous,
            );
        }
    }, [courseId]);

    useEffect(() => {
        loadDecks()
            .catch((loadError: unknown) => {
                console.error("Failed to load flashcard decks:", loadError);
                setError(loadError instanceof Error ? loadError.message : "Could not load flashcard decks.");
            })
            .finally(() => setIsLoading(false));
    }, [loadDecks]);

    const openDeck = async (deck: Deck, mode: "all" | "due" = "all") => {
        setIsWorking(true);
        setError("");
        try {
            const response = await fetch(`/api/courses/${courseId}/flashcards/decks/${deck.id}?mode=${mode}`);
            const result = await response.json();
            if (!response.ok) throw new Error(readError(result, "Could not open this deck."));
            setActiveDeck(deck);
            setDeckName(deck.name);
            setCards(result.cards);
            setReviewMode(null);
            setGenerationId("");
            setPreview([]);
            setNotice("");
        } catch (openError) {
            console.error("Failed to open flashcard deck:", openError);
            setError(openError instanceof Error ? openError.message : "Could not open this deck.");
        } finally {
            setIsWorking(false);
        }
    };

    const createDeck = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const name = newDeckName.trim();
        if (!name) return;
        setIsWorking(true);
        setError("");
        try {
            const response = await fetch(`/api/courses/${courseId}/flashcards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(readError(result, "Could not create this deck."));
            setDecks((current) => [result.deck, ...current]);
            setNewDeckName("");
            setNotice(`Created "${result.deck.name}".`);
        } catch (createError) {
            console.error("Failed to create flashcard deck:", createError);
            setError(createError instanceof Error ? createError.message : "Could not create this deck.");
        } finally {
            setIsWorking(false);
        }
    };

    const renameDeck = async () => {
        if (!activeDeck) return;
        const name = deckName.trim();
        if (!name) {
            setError("Enter a deck name.");
            return;
        }
        setIsWorking(true);
        setError("");
        try {
            const response = await fetch(`/api/courses/${courseId}/flashcards/decks/${activeDeck.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(readError(result, "Could not rename this deck."));
            setActiveDeck((previous) => previous ? { ...previous, name } : previous);
            setDecks((previous) => previous.map((deck) => deck.id === activeDeck.id ? { ...deck, name } : deck));
            setNotice("Deck renamed.");
        } catch (renameError) {
            console.error("Failed to rename flashcard deck:", renameError);
            setError(renameError instanceof Error ? renameError.message : "Could not rename this deck.");
        } finally {
            setIsWorking(false);
        }
    };

    const deleteDeck = async () => {
        if (!activeDeck) return;
        const confirmed = await confirmDialog({
            title: "Delete this deck?",
            description: `Are you sure you want to delete "${activeDeck.name}" and all of its flashcards and review history? This action cannot be undone.`,
            confirmText: "Delete deck",
            variant: "danger",
        });
        if (!confirmed) return;
        setIsWorking(true);
        setError("");
        try {
            const response = await fetch(`/api/courses/${courseId}/flashcards/decks/${activeDeck.id}`, { method: "DELETE" });
            const result = await response.json();
            if (!response.ok) throw new Error(readError(result, "Could not delete this deck."));
            setDecks((previous) => previous.filter((deck) => deck.id !== activeDeck.id));
            setActiveDeck(null);
            setCards([]);
            setNotice("Deck deleted.");
        } catch (deleteError) {
            console.error("Failed to delete flashcard deck:", deleteError);
            setError(deleteError instanceof Error ? deleteError.message : "Could not delete this deck.");
        } finally {
            setIsWorking(false);
        }
    };

    const generateCards = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (materialIds.length === 0) {
            setError("Select at least one course material.");
            return;
        }
        if (!activeDeck) {
            setError("Open a deck before generating cards.");
            return;
        }
        setIsWorking(true);
        setError("");
        setNotice("");
        setPreview([]);
        try {
            const response = await fetch(`/api/courses/${courseId}/flashcards/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ materialIds, count: questionCount, difficulty, topic, deckId: activeDeck.id }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(readError(result, "Could not generate flashcards."));
            setGenerationId(result.generationId);
            setPreview(result.cards);
            setSelectedPreviewIndexes(
                result.cards.flatMap((card: PreviewCard, index: number) => card.duplicateInDeck ? [] : [index]),
            );
            if (result.limitation) setNotice(result.limitation);
        } catch (generationError) {
            console.error("Flashcard generation failed:", generationError);
            setError(generationError instanceof Error ? generationError.message : "Could not generate flashcards.");
        } finally {
            setIsWorking(false);
        }
    };

    const saveGeneratedCards = async () => {
        if (!activeDeck || !generationId || selectedPreviewIndexes.length === 0) return;
        setIsWorking(true);
        setError("");
        try {
            const response = await fetch(`/api/courses/${courseId}/flashcards/decks/${activeDeck.id}/cards`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ generationId, cardIndexes: selectedPreviewIndexes }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(readError(result, "Could not save the selected cards."));
            setNotice(`Saved ${result.savedCount} card${result.savedCount === 1 ? "" : "s"}${result.duplicateCount ? `; skipped ${result.duplicateCount} duplicate${result.duplicateCount === 1 ? "" : "s"}` : ""}.`);
            setPreview([]);
            setGenerationId("");
            await loadDecks();
            await openDeck(activeDeck);
        } catch (saveError) {
            console.error("Failed to save generated flashcards:", saveError);
            setError(saveError instanceof Error ? saveError.message : "Could not save the selected cards.");
        } finally {
            setIsWorking(false);
        }
    };

    const saveManualCard = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!activeDeck) return;
        setIsWorking(true);
        setError("");
        try {
            const isEditing = Boolean(editingCardId);
            const response = await fetch(isEditing
                ? `/api/courses/${courseId}/flashcards/decks/${activeDeck.id}/cards/${editingCardId}`
                : `/api/courses/${courseId}/flashcards/decks/${activeDeck.id}/cards`, {
                method: isEditing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ front: manualFront, back: manualBack }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(readError(result, "Could not save this flashcard."));
            setManualFront("");
            setManualBack("");
            setEditingCardId("");
            setNotice(isEditing ? "Flashcard updated." : "Flashcard added.");
            await openDeck(activeDeck);
            await loadDecks();
        } catch (saveError) {
            console.error("Failed to save manual flashcard:", saveError);
            setError(saveError instanceof Error ? saveError.message : "Could not save this flashcard.");
        } finally {
            setIsWorking(false);
        }
    };

    const editCard = (card: Card) => {
        setEditingCardId(card.id);
        setManualFront(card.front);
        setManualBack(card.back);
    };

    const deleteCard = async (card: Card) => {
        if (!activeDeck) return;
        const confirmed = await confirmDialog({
            title: "Delete this flashcard?",
            description: "This flashcard and its review history will be permanently deleted. This action cannot be undone.",
            confirmText: "Delete flashcard",
            variant: "danger",
        });
        if (!confirmed) return;
        setIsWorking(true);
        setError("");
        try {
            const response = await fetch(`/api/courses/${courseId}/flashcards/decks/${activeDeck.id}/cards/${card.id}`, {
                method: "DELETE",
            });
            const result = await response.json();
            if (!response.ok) throw new Error(readError(result, "Could not delete this flashcard."));
            setCards((previous) => previous.filter((item) => item.id !== card.id));
            await loadDecks();
        } catch (deleteError) {
            console.error("Failed to delete flashcard:", deleteError);
            setError(deleteError instanceof Error ? deleteError.message : "Could not delete this flashcard.");
        } finally {
            setIsWorking(false);
        }
    };

    const startReview = async (mode: "due" | "all") => {
        if (!activeDeck) return;
        setIsWorking(true);
        setError("");
        try {
            const response = await fetch(`/api/courses/${courseId}/flashcards/decks/${activeDeck.id}?mode=${mode}`);
            const result = await response.json();
            if (!response.ok) throw new Error(readError(result, "Could not start this review."));
            setCards(result.cards);
            setReviewIndex(0);
            setRevealed(false);
            setReviewMode(mode);
            setPendingRating(null);
        } catch (reviewError) {
            console.error("Failed to start flashcard review:", reviewError);
            setError(reviewError instanceof Error ? reviewError.message : "Could not start this review.");
        } finally {
            setIsWorking(false);
        }
    };

    const rateCard = async (rating: typeof RATING_LABELS[number]["value"]) => {
        if (!activeDeck || !activeCard || !revealed || isWorking) return;
        const pending = pendingRating?.cardId === activeCard.id && pendingRating.rating === rating
            ? pendingRating
            : { cardId: activeCard.id, rating, requestId: crypto.randomUUID() };
        setPendingRating(pending);
        setIsWorking(true);
        setError("");
        try {
            const response = await fetch(`/api/courses/${courseId}/flashcards/decks/${activeDeck.id}/cards/${activeCard.id}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rating, requestId: pending.requestId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(readError(result, "Could not save this review."));
            const updatedCards = cards.map((card) => card.id === activeCard.id
                ? { ...card, schedule: { ...card.schedule, dueAt: result.nextDueAt } }
                : card);
            setCards(updatedCards);
            setPendingRating(null);
            setRevealed(false);
            if (reviewIndex + 1 < cards.length) {
                setReviewIndex((index) => index + 1);
            } else {
                setReviewMode(null);
                const soonLimit = Date.now() + 48 * 60 * 60 * 1_000;
                const dueSoonCount = updatedCards.filter(
                    (card) => new Date(card.id === activeCard.id ? result.nextDueAt : card.schedule.dueAt).getTime() <= soonLimit,
                ).length;
                setNotice(`Review complete: ${cards.length} card${cards.length === 1 ? "" : "s"} reviewed; ${dueSoonCount} scheduled within the next 48 hours.`);
            }
            await loadDecks();
        } catch (reviewError) {
            console.error("Failed to save flashcard review:", reviewError);
            setError(reviewError instanceof Error ? reviewError.message : "Could not save this review. Retry to continue.");
        } finally {
            setIsWorking(false);
        }
    };

    const cancelReview = () => {
        if (pendingRating) {
            setError("Save or retry the current rating before leaving the review session.");
            return;
        }
        setReviewMode(null);
        setRevealed(false);
        setError("");
    };

    return (
        <section className="rounded-2xl border border-[#663820]/20 bg-[#fffdf8] p-5 shadow-soft-sm sm:p-7">
            <header className="mb-5 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-[#f3e4c7] p-3 text-[#663820]"><BookOpen className="size-5" /></span>
                    <div>
                        <h2 className="text-xl font-semibold">Flashcards</h2>
                        <p className="text-sm text-[#3d485e]">Active recall and spaced repetition · {courseName}</p>
                    </div>
                </div>
                <button type="button" onClick={onClose} aria-label="Close flashcards" className="rounded-lg p-2 text-[#3d485e] hover:bg-[#f3e4c7]">
                    <X className="size-5" />
                </button>
            </header>
            {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
            {notice && <p role="status" className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
            {isLoading ? (
                <p className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" />Loading decks...</p>
            ) : reviewMode && activeDeck ? (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="font-semibold">{activeDeck.name}</h3>
                            <p className="text-sm text-[#3d485e]">Card {cards.length ? reviewIndex + 1 : 0} of {cards.length}</p>
                            <p className="text-xs text-[#3d485e]">
                                {reviewMode === "due"
                                    ? "Due or overdue cards only."
                                    : "Review all cards; only cards you rate are rescheduled."}
                            </p>
                        </div>
                        <button type="button" onClick={cancelReview} disabled={isWorking} className="rounded-lg border px-3 py-2 text-sm">Exit review</button>
                    </div>
                    {activeCard ? (
                        <>
                            <article className="rounded-2xl border bg-white p-6 sm:p-10">
                                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#663820]">Question</p>
                                <p className="whitespace-pre-wrap text-lg font-medium leading-8">{activeCard.front}</p>
                                {revealed && (
                                    <div className="mt-6 border-t pt-5">
                                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#663820]">Answer</p>
                                        <p className="whitespace-pre-wrap text-sm leading-7">{activeCard.back}</p>
                                    </div>
                                )}
                            </article>
                            {!revealed ? (
                                <button type="button" onClick={() => setRevealed(true)} className="btn-primary w-full justify-center">Reveal answer</button>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {RATING_LABELS.map((rating) => (
                                        <button
                                            key={rating.value}
                                            type="button"
                                            onClick={() => void rateCard(rating.value)}
                                            disabled={isWorking || Boolean(pendingRating)}
                                            className="rounded-xl border border-[#212a3b]/15 bg-white px-3 py-3 text-left hover:border-[#663820] disabled:opacity-50"
                                        >
                                            <span className="block font-semibold">{rating.label}</span>
                                            <span className="mt-1 block text-xs text-[#3d485e]">{rating.help}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {pendingRating && !isWorking && (
                                <button
                                    type="button"
                                    onClick={() => void rateCard(pendingRating.rating)}
                                    className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800"
                                >
                                    Retry saving {pendingRating.rating} rating
                                </button>
                            )}
                            {isWorking && <p className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" />Saving your review...</p>}
                        </>
                    ) : (
                        <div className="rounded-xl bg-white p-6 text-center">
                            <p className="font-semibold">{reviewMode === "due" ? "No cards are due right now." : "This deck has no cards yet."}</p>
                            <button type="button" onClick={cancelReview} className="mt-3 text-sm font-semibold text-[#663820]">Back to deck</button>
                        </div>
                    )}
                </div>
            ) : activeDeck ? (
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <button type="button" onClick={() => { setActiveDeck(null); setPreview([]); setError(""); }} className="inline-flex items-center gap-2 text-sm font-semibold text-[#663820]">
                            <ArrowLeft className="size-4" />All decks
                        </button>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => void startReview("due")} disabled={isWorking || activeDeck.dueCount === 0} className="btn-primary disabled:opacity-50">Review due ({activeDeck.dueCount})</button>
                            <button type="button" onClick={() => void startReview("all")} disabled={isWorking || activeDeck.cardCount === 0} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Review all</button>
                        </div>
                    </div>
                    <div className="flex flex-col gap-3 rounded-xl bg-white p-4 sm:flex-row sm:items-end">
                        <label className="flex-1 text-sm font-medium">Deck name
                            <input value={deckName} maxLength={80} onChange={(event) => setDeckName(event.target.value)} className="mt-1 w-full rounded-lg border p-2" />
                        </label>
                        <button type="button" onClick={() => void renameDeck()} disabled={isWorking || deckName.trim() === activeDeck.name} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Rename</button>
                        <button type="button" onClick={() => void deleteDeck()} disabled={isWorking} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"><Trash2 className="size-4" />Delete deck</button>
                    </div>

                    <form onSubmit={generateCards} className="space-y-4 rounded-xl border border-[#663820]/20 bg-white p-4">
                        <div className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-[#663820]" />Generate from course materials</div>
                        {materials.length === 0 ? (
                            <p className="text-sm text-[#3d485e]">Upload course materials to generate source-grounded cards. You can still create cards manually.</p>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-2">
                                    {materials.map((material) => (
                                        <label key={material.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                                            <input type="checkbox" checked={materialIds.includes(material.id)} onChange={() => setMaterialIds((previous) => toggleMaterialSelection(previous, material.id))} />
                                            <span>{material.title}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="grid gap-3 sm:grid-cols-[120px_140px_1fr]">
                                    <label className="text-sm font-medium">Card count
                                        <input type="number" min={1} max={30} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} className="mt-1 w-full rounded-lg border p-2" />
                                    </label>
                                    <label className="text-sm font-medium">Difficulty
                                        <select
                                            value={difficulty}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                if (value === "easy" || value === "medium" || value === "hard") setDifficulty(value);
                                            }}
                                            className="mt-1 w-full rounded-lg border p-2"
                                        >
                                            <option value="easy">Easy</option>
                                            <option value="medium">Medium</option>
                                            <option value="hard">Hard</option>
                                        </select>
                                    </label>
                                    <label className="text-sm font-medium">Optional topic
                                        <input value={topic} maxLength={160} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. depreciation methods" className="mt-1 w-full rounded-lg border p-2" />
                                    </label>
                                </div>
                                <p className="text-xs text-[#3d485e]">{selectedMaterials.length} source{selectedMaterials.length === 1 ? "" : "s"} selected. Generation is limited to 5 requests per course per hour.</p>
                                <button type="submit" disabled={isWorking || materialIds.length === 0} className="btn-primary disabled:opacity-50">
                                    {isWorking ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Generate preview
                                </button>
                            </>
                        )}
                        {preview.length > 0 && (
                            <div className="space-y-3 border-t pt-4">
                                <h4 className="font-semibold">Preview {preview.length} card{preview.length === 1 ? "" : "s"}</h4>
                                {preview.map((card, index) => (
                                    <label key={`${index}-${card.front}`} className={`block rounded-xl border p-3 ${card.duplicateInDeck ? "border-amber-300 bg-amber-50" : "bg-[#fffdf8]"}`}>
                                        <span className="flex items-start gap-3">
                                            <input type="checkbox" checked={selectedPreviewIndexes.includes(index)} onChange={(event) => setSelectedPreviewIndexes((current) => event.target.checked ? [...current, index] : current.filter((item) => item !== index))} className="mt-1" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-semibold">{card.front}</span>
                                                <span className="mt-1 block whitespace-pre-wrap text-sm text-[#3d485e]">{card.back}</span>
                                                <span className="mt-2 block text-xs text-[#3d485e]">Sources: {card.sourceMaterials.map((source) => source.title).join(", ")}</span>
                                                {card.duplicateInDeck && <span className="mt-1 block text-xs font-semibold text-amber-800">Possible duplicate; deselected by default</span>}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                                <button type="button" onClick={() => void saveGeneratedCards()} disabled={isWorking || selectedPreviewIndexes.length === 0} className="btn-primary disabled:opacity-50">
                                    {isWorking ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}Save selected ({selectedPreviewIndexes.length})
                                </button>
                            </div>
                        )}
                    </form>

                    <form onSubmit={saveManualCard} className="space-y-3 rounded-xl bg-white p-4">
                        <h4 className="flex items-center gap-2 font-semibold"><Plus className="size-4" />{editingCardId ? "Edit flashcard" : "Create a card manually"}</h4>
                        <label className="block text-sm font-medium">Question / front
                            <textarea value={manualFront} onChange={(event) => setManualFront(event.target.value)} maxLength={5_000} required rows={2} className="mt-1 w-full rounded-lg border p-2" />
                        </label>
                        <label className="block text-sm font-medium">Answer / back
                            <textarea value={manualBack} onChange={(event) => setManualBack(event.target.value)} maxLength={2_000} required rows={3} className="mt-1 w-full rounded-lg border p-2" />
                        </label>
                        <div className="flex gap-2">
                            <button type="submit" disabled={isWorking} className="btn-primary disabled:opacity-50">{isWorking ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}{editingCardId ? "Save changes" : "Add card"}</button>
                            {editingCardId && <button type="button" onClick={() => { setEditingCardId(""); setManualFront(""); setManualBack(""); }} className="rounded-lg border px-3 py-2 text-sm">Cancel</button>}
                        </div>
                    </form>

                    <div className="space-y-3">
                        <h4 className="font-semibold">{cards.length} card{cards.length === 1 ? "" : "s"} in this deck</h4>
                        {cards.map((card) => (
                            <article key={card.id} className="rounded-xl border bg-white p-4">
                                <div className="flex flex-wrap justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="whitespace-pre-wrap font-semibold">{card.front}</p>
                                        <p className="mt-2 whitespace-pre-wrap text-sm text-[#3d485e]">{card.back}</p>
                                        {card.topic && <p className="mt-2 text-xs text-[#663820]">{card.topic}</p>}
                                        <p className="mt-2 text-xs text-[#3d485e]">
                                            {card.sourceMaterials.length > 0 ? `Sources: ${card.sourceMaterials.map((source) => `${source.title}${source.available ? "" : " (source removed)"}`).join(", ")}` : "Manually created"}
                                            {" · "}Due {new Date(card.schedule.dueAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-start gap-2">
                                        <button type="button" onClick={() => editCard(card)} className="rounded-lg border px-3 py-2 text-sm">Edit</button>
                                        <button type="button" onClick={() => void deleteCard(card)} disabled={isWorking} aria-label="Delete flashcard" className="rounded-lg border border-red-200 p-2 text-red-700"><Trash2 className="size-4" /></button>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-5">
                    <form onSubmit={createDeck} className="flex flex-col gap-2 sm:flex-row">
                        <input value={newDeckName} onChange={(event) => setNewDeckName(event.target.value)} maxLength={80} required placeholder="New deck name" aria-label="New deck name" className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2" />
                        <button type="submit" disabled={isWorking} className="btn-primary justify-center disabled:opacity-50"><Plus className="size-4" />Create deck</button>
                    </form>
                    {decks.length === 0 ? (
                        <p className="rounded-xl bg-white p-5 text-sm text-[#3d485e]">Create a deck to add generated or manual cards.</p>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {decks.map((deck) => (
                                <button key={deck.id} type="button" onClick={() => void openDeck(deck)} disabled={isWorking} className="rounded-xl border bg-white p-4 text-left hover:border-[#663820]/40 disabled:opacity-50">
                                    <span className="block font-semibold">{deck.name}</span>
                                    <span className="mt-2 block text-sm text-[#3d485e]">{deck.cardCount} cards · {deck.dueCount} due · {deck.reviewedCount} reviewed</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {isWorking && !reviewMode && <p className="mt-4 flex items-center gap-2 text-sm text-[#3d485e]"><LoaderCircle className="size-4 animate-spin" />Working...</p>}
        </section>
    );
}
