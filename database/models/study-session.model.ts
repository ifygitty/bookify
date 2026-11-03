import { model, models, Schema, type Model, type Types } from "mongoose";

const StudySessionSchema = new Schema(
    {
        userClerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course" },
        startedAt: { type: Date, required: true },
        lastActivityAt: { type: Date, required: true },
        endedAt: { type: Date },
        durationSeconds: { type: Number, default: 0, min: 0 },
        activityTypes: { type: [String], default: [] },
        activityCount: { type: Number, default: 0 },
        status: { type: String, enum: ["active", "completed"], default: "active" },
    },
    { timestamps: true },
);

StudySessionSchema.index({ userClerkId: 1, startedAt: -1 });
StudySessionSchema.index({ userClerkId: 1, status: 1, lastActivityAt: -1 });
StudySessionSchema.index({ startedAt: -1 });
StudySessionSchema.index({ courseId: 1, startedAt: -1 });

export type StudySessionRecord = {
    _id: Types.ObjectId;
    userClerkId: string;
    courseId?: Types.ObjectId;
    startedAt: Date;
    lastActivityAt: Date;
    endedAt?: Date;
    durationSeconds: number;
    activityTypes: string[];
    activityCount: number;
    status: "active" | "completed";
    createdAt: Date;
    updatedAt: Date;
};

const StudySession =
    (models.StudySession as Model<StudySessionRecord> | undefined) ??
    model<StudySessionRecord>("StudySession", StudySessionSchema);

export default StudySession;
