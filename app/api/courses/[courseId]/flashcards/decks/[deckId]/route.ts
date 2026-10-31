import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/database/mongoose";
import Course from "@/database/models/course.model";
import Flashcard from "@/database/models/flashcard.model";
import FlashcardDeck from "@/database/models/flashcard-deck.model";
import FlashcardReview from "@/database/models/flashcard-review.model";
import { MAX_FLASHCARD_DECK_NAME_LENGTH } from "@/lib/flashcards";
import { getOwnedDeck } from "@/lib/flashcard-api";

type RouteContext = { params: Promise<{ courseId: string; deckId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to open this deck." }, { status: 401 });
    const { courseId, deckId } = await params;
    if (!Types.ObjectId.isValid(courseId) || !Types.ObjectId.isValid(deckId)) {
        return NextResponse.json({ error: "Invalid course deck." }, { status: 400 });
    }
    try {
        await connectToDatabase();
        const [course, deck] = await Promise.all([
            Course.findOne({ _id: courseId, clerkId: userId }).select("_id"),
            FlashcardDeck.findOne({ _id: deckId, courseId, clerkId: userId }).lean(),
        ]);
        if (!course || !deck) return NextResponse.json({ error: "Deck not found." }, { status: 404 });

        const mode = new URL(request.url).searchParams.get("mode") === "due" ? "due" : "all";
        const now = new Date();
        const cardFilter = {
            clerkId: userId,
            courseId: course._id,
            deckId: deck._id,
            ...(mode === "due" ? { "schedule.dueAt": { $lte: now } } : {}),
        };
        const [cards, totalCount, dueCount, reviewedCount] = await Promise.all([
            Flashcard.find(cardFilter).sort(mode === "due" ? { "schedule.dueAt": 1, _id: 1 } : { createdAt: 1 })
                .lean(),
            Flashcard.countDocuments({ clerkId: userId, courseId: course._id, deckId: deck._id }),
            Flashcard.countDocuments({
                clerkId: userId,
                courseId: course._id,
                deckId: deck._id,
                "schedule.dueAt": { $lte: now },
            }),
            Flashcard.countDocuments({
                clerkId: userId,
                courseId: course._id,
                deckId: deck._id,
                "schedule.lastReviewedAt": { $exists: true },
            }),
        ]);
        return NextResponse.json({
            deck: { id: deck._id.toString(), name: deck.name },
            mode,
            cards: cards.map((card) => ({
                id: card._id.toString(),
                front: card.front,
                back: card.back,
                topic: card.topic,
                sourceMaterials: card.sourceMaterials,
                provenance: card.provenance,
                schedule: card.schedule,
            })),
            totalCount,
            dueCount,
            reviewedCount,
        });
    } catch (error) {
        console.error("Failed to load course flashcard deck:", error);
        return NextResponse.json({ error: "Could not load this flashcard deck." }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to rename this deck." }, { status: 401 });
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
    const name = typeof body === "object" && body !== null && "name" in body && typeof body.name === "string"
        ? body.name.trim()
        : "";
    if (!name || name.length > MAX_FLASHCARD_DECK_NAME_LENGTH) {
        return NextResponse.json({ error: `Enter a deck name up to ${MAX_FLASHCARD_DECK_NAME_LENGTH} characters long.` }, { status: 400 });
    }
    try {
        const ownedDeck = await getOwnedDeck(courseId, deckId, userId);
        if (!ownedDeck) return NextResponse.json({ error: "Deck not found." }, { status: 404 });
        const deck = await FlashcardDeck.findOneAndUpdate(
            { _id: ownedDeck._id, courseId: ownedDeck.courseId, clerkId: userId },
            { $set: { name } },
            { new: true, runValidators: true },
        );
        if (!deck) return NextResponse.json({ error: "Deck not found." }, { status: 404 });
        return NextResponse.json({ deck: { id: deck._id.toString(), name: deck.name } });
    } catch (error) {
        console.error("Failed to rename course flashcard deck:", error);
        return NextResponse.json({ error: "Could not rename this deck." }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to delete this deck." }, { status: 401 });
    const { courseId, deckId } = await params;
    if (!Types.ObjectId.isValid(courseId) || !Types.ObjectId.isValid(deckId)) {
        return NextResponse.json({ error: "Invalid course deck." }, { status: 400 });
    }
    try {
        const deck = await getOwnedDeck(courseId, deckId, userId);
        if (!deck) return NextResponse.json({ error: "Deck not found." }, { status: 404 });
        await Promise.all([
            Flashcard.deleteMany({ clerkId: userId, courseId: deck.courseId, deckId: deck._id }),
            FlashcardReview.deleteMany({ clerkId: userId, courseId: deck.courseId, deckId: deck._id }),
        ]);
        await FlashcardDeck.deleteOne({ _id: deck._id, courseId: deck.courseId, clerkId: userId });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete course flashcard deck:", error);
        return NextResponse.json({ error: "Could not fully delete this deck." }, { status: 500 });
    }
}
