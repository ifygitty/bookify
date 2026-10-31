import { model, models, Schema, Types, type Model } from "mongoose";

const FlashcardSourceSchema = new Schema(
    {
        id: { type: String, required: true },
        title: { type: String, required: true },
        available: { type: Boolean, default: true },
    },
    { _id: false },
);

const FlashcardSchema = new Schema(
    {
        clerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        deckId: { type: Schema.Types.ObjectId, ref: "FlashcardDeck", required: true },
        front: { type: String, required: true, trim: true, maxlength: 5_000 },
        normalizedFront: { type: String, required: true },
        back: { type: String, required: true, trim: true, maxlength: 2_000 },
        topic: { type: String, trim: true, maxlength: 160, default: "" },
        sourceMaterials: { type: [FlashcardSourceSchema], default: [] },
        provenance: {
            type: String,
            enum: ["manual", "generated", "quiz"],
            required: true,
        },
        quizId: { type: String },
        quizQuestionId: { type: String },
        conversionKey: { type: String },
        schedule: {
            repetitions: { type: Number, min: 0, default: 0 },
            intervalDays: { type: Number, min: 0, default: 0 },
            easeFactor: { type: Number, min: 1.3, default: 2.5 },
            dueAt: { type: Date, required: true, default: Date.now },
            lastReviewedAt: { type: Date },
        },
    },
    { timestamps: true },
);

FlashcardSchema.index({ clerkId: 1, courseId: 1, deckId: 1, "schedule.dueAt": 1 });
FlashcardSchema.index({ clerkId: 1, deckId: 1, createdAt: -1 });
FlashcardSchema.index({ clerkId: 1, deckId: 1, normalizedFront: 1 }, { unique: true });
FlashcardSchema.index(
    { clerkId: 1, conversionKey: 1 },
    { unique: true, partialFilterExpression: { conversionKey: { $type: "string" } } },
);

export type FlashcardSourceRecord = { id: string; title: string; available: boolean };
export type FlashcardRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    courseId: Types.ObjectId;
    deckId: Types.ObjectId;
    front: string;
    back: string;
    topic: string;
    sourceMaterials: FlashcardSourceRecord[];
    provenance: "manual" | "generated" | "quiz";
    quizId?: string;
    quizQuestionId?: string;
    conversionKey?: string;
    schedule: {
        repetitions: number;
        intervalDays: number;
        easeFactor: number;
        dueAt: Date;
        lastReviewedAt?: Date;
    };
    createdAt: Date;
    updatedAt: Date;
};

const Flashcard =
    (models.Flashcard as Model<FlashcardRecord> | undefined) ??
    model<FlashcardRecord>("Flashcard", FlashcardSchema);

export default Flashcard;
