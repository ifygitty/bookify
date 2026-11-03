import { model, models, Schema, type Model, type Types } from "mongoose";

const UserSchema = new Schema(
    {
        userClerkId: { type: String, required: true, unique: true, index: true },
        email: { type: String, required: true, trim: true, lowercase: true, index: true },
        fullName: { type: String, required: true, trim: true, maxlength: 120 },
        isAdmin: { type: Boolean, default: false, index: true },
        lastLoginAt: { type: Date },
        lastActiveAt: { type: Date },
        lastSessionId: { type: String },
        lastClerkEventAt: { type: Date },
        deletedAt: { type: Date },
        aiUsage: {
            calls: { type: Number, default: 0 },
            inputTokens: { type: Number, default: 0 },
            outputTokens: { type: Number, default: 0 },
            totalTokens: { type: Number, default: 0 },
            estimatedCost: { type: Number, default: 0 },
            unpricedCalls: { type: Number, default: 0 },
        },
    },
    { timestamps: true },
);

UserSchema.index({ createdAt: -1 });
UserSchema.index({ lastActiveAt: -1 });
UserSchema.index({ "aiUsage.totalTokens": -1 });
UserSchema.index({ "aiUsage.estimatedCost": -1 });

export type UserRecord = {
    _id: Types.ObjectId;
    userClerkId: string;
    email: string;
    fullName: string;
    isAdmin: boolean;
    lastLoginAt?: Date;
    lastActiveAt?: Date;
    lastSessionId?: string;
    lastClerkEventAt?: Date;
    deletedAt?: Date;
    aiUsage: {
        calls: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCost: number;
        unpricedCalls: number;
    };
    createdAt: Date;
    updatedAt: Date;
};

const User = (models.User as Model<UserRecord> | undefined) ?? model<UserRecord>("User", UserSchema);

export default User;
