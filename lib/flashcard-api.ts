import { Types } from "mongoose";
import { connectToDatabase } from "@/database/mongoose";
import Course from "@/database/models/course.model";
import FlashcardDeck from "@/database/models/flashcard-deck.model";

export async function getOwnedCourse(courseId: string, clerkId: string) {
    await connectToDatabase();
    return Course.findOne({ _id: courseId, clerkId });
}

export async function getOwnedDeck(courseId: string, deckId: string, clerkId: string) {
    if (!Types.ObjectId.isValid(courseId) || !Types.ObjectId.isValid(deckId)) return null;
    await connectToDatabase();
    const [course, deck] = await Promise.all([
        Course.findOne({ _id: courseId, clerkId }).select("_id"),
        FlashcardDeck.findOne({ _id: deckId, courseId, clerkId }),
    ]);
    return course && deck ? deck : null;
}

export function isDuplicateKeyError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
