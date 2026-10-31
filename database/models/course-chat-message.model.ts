import { model, models, Schema, Types } from "mongoose";

const CourseChatMessageSchema = new Schema(
    {
        clerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        materialId: { type: Schema.Types.ObjectId, required: true },
        materialIds: { type: [Schema.Types.ObjectId], default: undefined },
        conversationKey: { type: String },
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        citations: {
            type: [
                new Schema(
                    {
                        fileId: { type: String, required: true },
                        filename: { type: String, required: true },
                        materialId: { type: String },
                    },
                    { _id: false },
                ),
            ],
            default: [],
        },
    },
    { timestamps: true },
);

CourseChatMessageSchema.index({ clerkId: 1, courseId: 1, materialId: 1, createdAt: -1, _id: -1 });
CourseChatMessageSchema.index({ clerkId: 1, courseId: 1, conversationKey: 1, createdAt: -1, _id: -1 });

export type CourseCitation = {
    fileId: string;
    filename: string;
    materialId?: string;
};

export type CourseChatMessageRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    courseId: Types.ObjectId;
    materialId: Types.ObjectId;
    materialIds?: Types.ObjectId[];
    conversationKey?: string;
    role: "user" | "assistant";
    content: string;
    citations: CourseCitation[];
    createdAt: Date;
};

const CourseChatMessage =
    models.CourseChatMessage || model("CourseChatMessage", CourseChatMessageSchema);

export default CourseChatMessage;
