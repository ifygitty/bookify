import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import Flashcard from "@/database/models/flashcard.model";
import FlashcardGeneration from "@/database/models/flashcard-generation.model";
import {
    createInitialFlashcardSchedule,
    MAX_FLASHCARDS_PER_GENERATION,
    normalizeFlashcardFront,
    validateFlashcardContent,
} from "@/lib/flashcards";
import { getOwnedDeck } from "@/lib/flashcard-api";

type RouteContext = { params: Promise<{ courseId: string; deckId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to add flashcards." }, { status: 401 });
    const { courseId, deckId } = await params;
    if (!Types.ObjectId.isValid(courseId) || !Types.ObjectId.isValid(deckId)) {
        return NextResponse.json({ error: "Invalid course deck." }, { status: 400 });
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
    }
    const data = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};

    try {
        const deck = await getOwnedDeck(courseId, deckId, userId);
        if (!deck) return NextResponse.json({ error: "Deck not found." }, { status: 404 });
        const now = new Date();
        if (typeof data.generationId === "string") {
            if (!Types.ObjectId.isValid(data.generationId) || !Array.isArray(data.cardIndexes)) {
                return NextResponse.json({ error: "Choose generated cards from a valid preview." }, { status: 400 });
            }
            const indexes = data.cardIndexes;
            if (
                indexes.length === 0 ||
                indexes.length > MAX_FLASHCARDS_PER_GENERATION ||
                !indexes.every((index) => Number.isInteger(index) && (index as number) >= 0) ||
                new Set(indexes).size !== indexes.length
            ) {
                return NextResponse.json({ error: "Select one or more valid generated cards." }, { status: 400 });
            }
            const preview = await FlashcardGeneration.findOne({
                _id: data.generationId,
                clerkId: userId,
                courseId: deck.courseId,
            }).lean();
            if (
                !preview ||
                preview.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1_000
            ) {
                return NextResponse.json({ error: "This generated preview expired. Generate the cards again." }, { status: 404 });
            }
            const selected = indexes.map((index) => preview.previewCards[index as number]);
            if (selected.some((card) => !card)) {
                return NextResponse.json({ error: "The preview did not contain one or more selected cards." }, { status: 400 });
            }
            const existing = await Flashcard.find({ clerkId: userId, courseId: deck.courseId, deckId: deck._id })
                .select("front").lean();
            const knownFronts = new Set(existing.map((card) => normalizeFlashcardFront(card.front)));
            const newCards = [];
            let duplicateCount = 0;
            for (const card of selected) {
                const key = normalizeFlashcardFront(card.front);
                if (knownFronts.has(key)) {
                    duplicateCount += 1;
                    continue;
                }
                knownFronts.add(key);
                newCards.push({
                    clerkId: userId,
                    courseId: deck.courseId,
                    deckId: deck._id,
                    front: card.front,
                    normalizedFront: normalizeFlashcardFront(card.front),
                    back: card.back,
                    topic: card.topic,
                    sourceMaterials: card.sourceMaterials,
                    provenance: "generated" as const,
                    schedule: createInitialFlashcardSchedule(now),
                });
            }
            const saved = newCards.length > 0 ? await Flashcard.insertMany(newCards) : [];
            return NextResponse.json({ savedCount: saved.length, duplicateCount }, { status: 201 });
        }

        const cards = Array.isArray(data.cards) ? data.cards : [data];
        if (cards.length === 0 || cards.length > 100) {
            return NextResponse.json({ error: "Add between 1 and 100 cards at a time." }, { status: 400 });
        }
        const validated = [];
        const seen = new Set<string>();
        for (const item of cards) {
            if (typeof item !== "object" || item === null) {
                return NextResponse.json({ error: "One or more flashcards are invalid." }, { status: 400 });
            }
            const card = item as Record<string, unknown>;
            const content = validateFlashcardContent(card.front, card.back);
            if (!content.valid) return NextResponse.json({ error: content.reason }, { status: 400 });
            const key = normalizeFlashcardFront(content.front);
            if (seen.has(key)) return NextResponse.json({ error: "The submitted cards contain duplicates." }, { status: 400 });
            seen.add(key);
            const topic = typeof card.topic === "string" ? card.topic.trim() : "";
            if (topic.length > 160) return NextResponse.json({ error: "Topics must be 160 characters or fewer." }, { status: 400 });
            validated.push({
                clerkId: userId,
                courseId: deck.courseId,
                deckId: deck._id,
                front: content.front,
                normalizedFront: normalizeFlashcardFront(content.front),
                back: content.back,
                topic,
                sourceMaterials: [],
                provenance: "manual" as const,
                schedule: createInitialFlashcardSchedule(now),
            });
        }
        const existing = await Flashcard.find({
            clerkId: userId,
            courseId: deck.courseId,
            deckId: deck._id,
        }).select("front").lean();
        const existingFronts = new Set(existing.map((card) => normalizeFlashcardFront(card.front)));
        if (validated.some((card) => existingFronts.has(normalizeFlashcardFront(card.front)))) {
            return NextResponse.json({ error: "This deck already contains a card with one of those questions." }, { status: 409 });
        }
        const saved = await Flashcard.insertMany(validated);
        return NextResponse.json({ savedCount: saved.length }, { status: 201 });
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
            return NextResponse.json({ error: "This deck already contains a card with one of those questions." }, { status: 409 });
        }
        console.error("Failed to add cards to course flashcard deck:", error);
        return NextResponse.json({ error: "Could not add these flashcards." }, { status: 500 });
    }
}
