import { model, models, Schema, Types, type Model } from "mongoose";

const FlashcardReviewSchema = new Schema(
    {
        clerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        deckId: { type: Schema.Types.ObjectId, ref: "FlashcardDeck", required: true },
        cardId: { type: Schema.Types.ObjectId, ref: "Flashcard", required: true },
        requestId: { type: String, required: true },
        rating: { type: String, enum: ["again", "hard", "good", "easy"], required: true },
        reviewedAt: { type: Date, required: true },
        previousDueAt: { type: Date, required: true },
        nextDueAt: { type: Date, required: true },
        previousSchedule: {
            repetitions: { type: Number, required: true },
            intervalDays: { type: Number, required: true },
            easeFactor: { type: Number, required: true },
        },
        nextSchedule: {
            repetitions: { type: Number, required: true },
            intervalDays: { type: Number, required: true },
            easeFactor: { type: Number, required: true },
        },
    },
    { timestamps: true },
);

FlashcardReviewSchema.index({ clerkId: 1, requestId: 1 }, { unique: true });
FlashcardReviewSchema.index({ clerkId: 1, cardId: 1, reviewedAt: -1 });
FlashcardReviewSchema.index({ clerkId: 1, deckId: 1, reviewedAt: -1 });

export type FlashcardReviewRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    courseId: Types.ObjectId;
    deckId: Types.ObjectId;
    cardId: Types.ObjectId;
    requestId: string;
    rating: "again" | "hard" | "good" | "easy";
    reviewedAt: Date;
    previousDueAt: Date;
    nextDueAt: Date;
    previousSchedule: { repetitions: number; intervalDays: number; easeFactor: number };
    nextSchedule: { repetitions: number; intervalDays: number; easeFactor: number };
};

const FlashcardReview =
    (models.FlashcardReview as Model<FlashcardReviewRecord> | undefined) ??
    model<FlashcardReviewRecord>("FlashcardReview", FlashcardReviewSchema);

export default FlashcardReview;
