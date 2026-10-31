import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import mongoose, { Types } from "mongoose";
import Flashcard from "@/database/models/flashcard.model";
import FlashcardReview from "@/database/models/flashcard-review.model";
import {
    calculateNextFlashcardSchedule,
    flashcardRatingSchema,
    resolveFlashcardReviewReplay,
} from "@/lib/flashcards";
import { getOwnedDeck, isDuplicateKeyError } from "@/lib/flashcard-api";

type RouteContext = { params: Promise<{ courseId: string; deckId: string; cardId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to save your review." }, { status: 401 });
    const { courseId, deckId, cardId } = await params;
    if (![courseId, deckId, cardId].every(Types.ObjectId.isValid)) {
        return NextResponse.json({ error: "Invalid flashcard review." }, { status: 400 });
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
    }
    const data = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    const rating = flashcardRatingSchema.safeParse(data.rating);
    if (!rating.success || typeof data.requestId !== "string" || !/^[\w-]{16,80}$/.test(data.requestId)) {
        return NextResponse.json({ error: "Provide a valid recall rating and unique review request ID." }, { status: 400 });
    }

    const deck = await getOwnedDeck(courseId, deckId, userId);
    if (!deck) return NextResponse.json({ error: "Deck not found." }, { status: 404 });

    const priorEvent = await FlashcardReview.findOne({ clerkId: userId, requestId: data.requestId }).lean();
    if (priorEvent) {
        const replay = resolveFlashcardReviewReplay(
            { cardId: priorEvent.cardId.toString(), deckId: priorEvent.deckId.toString() },
            cardId,
            deckId,
        );
        if (replay === "conflict") {
            return NextResponse.json({ error: "This review request ID was already used for a different card." }, { status: 409 });
        }
        return NextResponse.json({ success: true, alreadyProcessed: true, nextDueAt: priorEvent.nextDueAt });
    }

    const session = await mongoose.startSession();
    try {
        let completedReview: { nextDueAt: Date } | undefined;
        await session.withTransaction(async () => {
            const card = await Flashcard.findOne({
                _id: cardId,
                courseId,
                deckId,
                clerkId: userId,
            }).session(session);
            if (!card) throw new Error("FLASHCARD_NOT_FOUND");
            const reviewedAt = new Date();
            const previous = {
                repetitions: card.schedule.repetitions,
                intervalDays: card.schedule.intervalDays,
                easeFactor: card.schedule.easeFactor,
                dueAt: card.schedule.dueAt,
                lastReviewedAt: card.schedule.lastReviewedAt,
            };
            const next = calculateNextFlashcardSchedule(previous, rating.data, reviewedAt);
            const updated = await Flashcard.updateOne(
                { _id: card._id, clerkId: userId, courseId: deck.courseId, deckId: deck._id },
                { $set: { schedule: next } },
                { session },
            );
            if (updated.modifiedCount !== 1) throw new Error("FLASHCARD_UPDATE_FAILED");
            await FlashcardReview.create([{
                clerkId: userId,
                courseId: deck.courseId,
                deckId: deck._id,
                cardId: card._id,
                requestId: data.requestId,
                rating: rating.data,
                reviewedAt,
                previousDueAt: previous.dueAt,
                nextDueAt: next.dueAt,
                previousSchedule: {
                    repetitions: previous.repetitions,
                    intervalDays: previous.intervalDays,
                    easeFactor: previous.easeFactor,
                },
                nextSchedule: {
                    repetitions: next.repetitions,
                    intervalDays: next.intervalDays,
                    easeFactor: next.easeFactor,
                },
            }], { session });
            completedReview = { nextDueAt: next.dueAt };
        });
        if (!completedReview) throw new Error("The review was not saved.");
        return NextResponse.json({ success: true, nextDueAt: completedReview.nextDueAt });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            const existing = await FlashcardReview.findOne({ clerkId: userId, requestId: data.requestId }).lean();
            const replay = existing
                ? resolveFlashcardReviewReplay(
                    { cardId: existing.cardId.toString(), deckId: existing.deckId.toString() },
                    cardId,
                    deckId,
                )
                : "new";
            if (replay === "replay" && existing) {
                return NextResponse.json({ success: true, alreadyProcessed: true, nextDueAt: existing.nextDueAt });
            }
            return NextResponse.json({ error: "This review request was already processed." }, { status: 409 });
        }
        if (error instanceof Error && error.message === "FLASHCARD_NOT_FOUND") {
            return NextResponse.json({ error: "Flashcard not found." }, { status: 404 });
        }
        console.error("Failed to save flashcard review:", error);
        return NextResponse.json({ error: "Could not save this review. Your card was not marked complete; please retry." }, { status: 500 });
    } finally {
        await session.endSession();
    }
}
