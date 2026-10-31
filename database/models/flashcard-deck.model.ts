import { model, models, Schema, Types, type Model } from "mongoose";

const FlashcardDeckSchema = new Schema(
    {
        clerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
    },
    { timestamps: true },
);

FlashcardDeckSchema.index({ clerkId: 1, courseId: 1, createdAt: -1 });

export type FlashcardDeckRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    courseId: Types.ObjectId;
    name: string;
    createdAt: Date;
    updatedAt: Date;
};

const FlashcardDeck =
    (models.FlashcardDeck as Model<FlashcardDeckRecord> | undefined) ??
    model<FlashcardDeckRecord>("FlashcardDeck", FlashcardDeckSchema);

export default FlashcardDeck;
