import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import Flashcard from "@/database/models/flashcard.model";
import FlashcardReview from "@/database/models/flashcard-review.model";
import { normalizeFlashcardFront, validateFlashcardContent } from "@/lib/flashcards";
import { getOwnedDeck } from "@/lib/flashcard-api";

type RouteContext = { params: Promise<{ courseId: string; deckId: string; cardId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to edit this flashcard." }, { status: 401 });
    const { courseId, deckId, cardId } = await params;
    if (![courseId, deckId, cardId].every(Types.ObjectId.isValid)) {
        return NextResponse.json({ error: "Invalid flashcard." }, { status: 400 });
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
    }
    if (typeof body !== "object" || body === null) {
        return NextResponse.json({ error: "Provide flashcard fields to update." }, { status: 400 });
    }
    const fields = body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    try {
        const deck = await getOwnedDeck(courseId, deckId, userId);
        if (!deck) return NextResponse.json({ error: "Deck not found." }, { status: 404 });
        if ("front" in fields || "back" in fields) {
            const existing = await Flashcard.findOne({ _id: cardId, courseId, deckId, clerkId: userId }).select("front back");
            if (!existing) return NextResponse.json({ error: "Flashcard not found." }, { status: 404 });
            const content = validateFlashcardContent(fields.front ?? existing.front, fields.back ?? existing.back);
            if (!content.valid) return NextResponse.json({ error: content.reason }, { status: 400 });
            update.front = content.front;
            update.normalizedFront = normalizeFlashcardFront(content.front);
            update.back = content.back;
        }
        if ("topic" in fields) {
            if (typeof fields.topic !== "string" || fields.topic.trim().length > 160) {
                return NextResponse.json({ error: "Topics must be 160 characters or fewer." }, { status: 400 });
            }
            update.topic = fields.topic.trim();
        }
        if (Object.keys(update).length === 0) {
            return NextResponse.json({ error: "Provide a question, answer, or topic to update." }, { status: 400 });
        }
        if (typeof update.front === "string") {
            const duplicates = await Flashcard.find({
                clerkId: userId,
                courseId,
                deckId,
                _id: { $ne: cardId },
            }).select("front").lean();
            if (duplicates.some((item) => normalizeFlashcardFront(item.front) === normalizeFlashcardFront(update.front as string))) {
                return NextResponse.json({ error: "This deck already contains a card with that question." }, { status: 409 });
            }
        }
        const card = await Flashcard.findOneAndUpdate(
            { _id: cardId, courseId, deckId, clerkId: userId },
            { $set: update },
            { new: true, runValidators: true },
        );
        if (!card) return NextResponse.json({ error: "Flashcard not found." }, { status: 404 });
        return NextResponse.json({ card: { id: card._id.toString(), front: card.front, back: card.back, topic: card.topic } });
    } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
            return NextResponse.json({ error: "This deck already contains a card with that question." }, { status: 409 });
        }
        console.error("Failed to update course flashcard:", error);
        return NextResponse.json({ error: "Could not update this flashcard." }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to delete this flashcard." }, { status: 401 });
    const { courseId, deckId, cardId } = await params;
    if (![courseId, deckId, cardId].every(Types.ObjectId.isValid)) {
        return NextResponse.json({ error: "Invalid flashcard." }, { status: 400 });
    }
    try {
        const deck = await getOwnedDeck(courseId, deckId, userId);
        if (!deck) return NextResponse.json({ error: "Deck not found." }, { status: 404 });
        const card = await Flashcard.findOneAndDelete({ _id: cardId, courseId, deckId, clerkId: userId });
        if (!card) return NextResponse.json({ error: "Flashcard not found." }, { status: 404 });
        await FlashcardReview.deleteMany({
            clerkId: userId,
            courseId: deck.courseId,
            deckId: deck._id,
            cardId: card._id,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete course flashcard:", error);
        return NextResponse.json({ error: "Could not fully delete this flashcard." }, { status: 500 });
    }
}
