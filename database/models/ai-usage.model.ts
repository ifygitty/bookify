import { model, models, Schema, type Model, type Types } from "mongoose";

const AiUsageSchema = new Schema(
    {
        userClerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course" },
        operation: { type: String, required: true },
        model: { type: String, required: true },
        inputTokens: { type: Number, default: 0 },
        outputTokens: { type: Number, default: 0 },
        totalTokens: { type: Number, default: 0 },
        cachedInputTokens: { type: Number, default: 0 },
        estimatedCost: { type: Number, default: null },
        currency: { type: String, default: "USD" },
        status: { type: String, enum: ["success", "failed"], default: "success" },
        responseId: { type: String },
        priceVersion: { type: String },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

AiUsageSchema.index({ userClerkId: 1, createdAt: -1 });
AiUsageSchema.index({ createdAt: -1 });
AiUsageSchema.index({ operation: 1, createdAt: -1 });
AiUsageSchema.index({ model: 1, createdAt: -1 });
AiUsageSchema.index({ courseId: 1, createdAt: -1 });
AiUsageSchema.index({ responseId: 1 }, { unique: true, sparse: true });

export type AiUsageRecord = {
    _id: Types.ObjectId;
    userClerkId: string;
    courseId?: Types.ObjectId;
    operation: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    estimatedCost: number | null;
    currency: string;
    status: "success" | "failed";
    responseId?: string;
    priceVersion?: string;
    createdAt: Date;
};

const AiUsage = (models.AiUsage as Model<AiUsageRecord> | undefined) ?? model<AiUsageRecord>("AiUsage", AiUsageSchema);

export default AiUsage;
