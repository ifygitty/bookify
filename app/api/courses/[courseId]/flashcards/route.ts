import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/database/mongoose";
import Course from "@/database/models/course.model";
import Flashcard from "@/database/models/flashcard.model";
import FlashcardDeck from "@/database/models/flashcard-deck.model";
import { MAX_FLASHCARD_DECK_NAME_LENGTH } from "@/lib/flashcards";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to view flashcard decks." }, { status: 401 });
    const { courseId } = await params;
    if (!Types.ObjectId.isValid(courseId)) return NextResponse.json({ error: "Invalid course." }, { status: 400 });

    try {
        await connectToDatabase();
        const course = await Course.findOne({ _id: courseId, clerkId: userId }).select("_id");
        if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
        const [decks, counts] = await Promise.all([
            FlashcardDeck.find({ clerkId: userId, courseId: course._id }).sort({ createdAt: -1 }).lean(),
            Flashcard.aggregate([
                { $match: { clerkId: userId, courseId: course._id } },
                {
                    $group: {
                        _id: "$deckId",
                        cardCount: { $sum: 1 },
                        dueCount: { $sum: { $cond: [{ $lte: ["$schedule.dueAt", new Date()] }, 1, 0] } },
                        reviewedCount: {
                            $sum: { $cond: [{ $ne: [{ $ifNull: ["$schedule.lastReviewedAt", null] }, null] }, 1, 0] },
                        },
                    },
                },
            ]),
        ]);
        const countByDeck = new Map(counts.map((item) => [item._id.toString(), item]));
        return NextResponse.json({
            decks: decks.map((deck) => {
                const count = countByDeck.get(deck._id.toString());
                return {
                    id: deck._id.toString(),
                    name: deck.name,
                    createdAt: deck.createdAt,
                    cardCount: count?.cardCount ?? 0,
                    dueCount: count?.dueCount ?? 0,
                    reviewedCount: count?.reviewedCount ?? 0,
                };
            }),
        });
    } catch (error) {
        console.error("Failed to load course flashcard decks:", error);
        return NextResponse.json({ error: "Could not load flashcard decks." }, { status: 500 });
    }
}

export async function POST(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to create a flashcard deck." }, { status: 401 });
    const { courseId } = await params;
    if (!Types.ObjectId.isValid(courseId)) return NextResponse.json({ error: "Invalid course." }, { status: 400 });
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
        return NextResponse.json(
            { error: `Enter a deck name up to ${MAX_FLASHCARD_DECK_NAME_LENGTH} characters long.` },
            { status: 400 },
        );
    }
    try {
        await connectToDatabase();
        const course = await Course.findOne({ _id: courseId, clerkId: userId }).select("_id");
        if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
        const deck = await FlashcardDeck.create({ clerkId: userId, courseId: course._id, name });
        return NextResponse.json({
            deck: { id: deck._id.toString(), name: deck.name, cardCount: 0, dueCount: 0, reviewedCount: 0 },
        }, { status: 201 });
    } catch (error) {
        console.error("Failed to create course flashcard deck:", error);
        return NextResponse.json({ error: "Could not create this deck." }, { status: 500 });
    }
}
