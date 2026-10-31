import { model, models, Schema, Types, type Model } from "mongoose";

const FlashcardGenerationCardSchema = new Schema(
    {
        front: { type: String, required: true },
        back: { type: String, required: true },
        topic: { type: String, default: "" },
        sourceMaterials: {
            type: [
                new Schema({
                    id: { type: String, required: true },
                    title: { type: String, required: true },
                    available: { type: Boolean, default: true },
                }, { _id: false }),
            ],
            default: [],
        },
    },
    { _id: false },
);

const FlashcardGenerationSchema = new Schema(
    {
        clerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        previewCards: { type: [FlashcardGenerationCardSchema], default: [] },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

FlashcardGenerationSchema.index({ clerkId: 1, courseId: 1, createdAt: -1 });
FlashcardGenerationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86_400 });

export type FlashcardGenerationRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    courseId: Types.ObjectId;
    previewCards: {
        front: string;
        back: string;
        topic: string;
        sourceMaterials: { id: string; title: string; available: boolean }[];
    }[];
    createdAt: Date;
};

const FlashcardGeneration =
    (models.FlashcardGeneration as Model<FlashcardGenerationRecord> | undefined) ??
    model<FlashcardGenerationRecord>("FlashcardGeneration", FlashcardGenerationSchema);

export default FlashcardGeneration;
