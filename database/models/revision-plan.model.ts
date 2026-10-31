import { model, models, Schema, Types, type Model } from "mongoose";
import { TASK_TYPES, type TaskType } from "@/lib/revision-plan";

const RevisionTaskSchema = new Schema(
    {
        id: { type: String, required: true },
        topicId: { type: String, required: true },
        topicName: { type: String, required: true, trim: true, maxlength: 160 },
        type: { type: String, enum: TASK_TYPES, required: true },
        stageKey: { type: String, required: true, maxlength: 40 },
        title: { type: String, required: true, trim: true, maxlength: 240 },
        scheduledDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        minutes: { type: Number, required: true, min: 5, max: 240 },
        status: { type: String, enum: ["pending", "completed"], default: "pending", required: true },
        completedAt: { type: Date },
        overCapacity: { type: Boolean, default: false },
        order: { type: Number, required: true, min: 0 },
    },
    { _id: false },
);

const RevisionPlanSchema = new Schema(
    {
        clerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        title: { type: String, trim: true, maxlength: 100, default: "" },
        dateType: { type: String, enum: ["exam", "target"], required: true },
        targetDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        availability: {
            type: [
                new Schema(
                    {
                        weekday: { type: Number, required: true, min: 0, max: 6 },
                        minutes: { type: Number, required: true, min: 30, max: 480 },
                    },
                    { _id: false },
                ),
            ],
            default: [],
        },
        priorityTopicIds: { type: [String], default: [] },
        tasks: { type: [RevisionTaskSchema], default: [] },
        shortfall: {
            taskCount: { type: Number, default: 0, min: 0 },
            minutes: { type: Number, default: 0, min: 0 },
            topicNames: { type: [String], default: [] },
        },
        lastScheduledAt: { type: Date },
    },
    { timestamps: true },
);

RevisionPlanSchema.index({ clerkId: 1, courseId: 1, createdAt: -1 });

export type RevisionTaskRecord = {
    id: string;
    topicId: string;
    topicName: string;
    type: TaskType;
    stageKey: string;
    title: string;
    scheduledDate: string;
    minutes: number;
    status: "pending" | "completed";
    completedAt?: Date;
    overCapacity?: boolean;
    order: number;
};

export type RevisionPlanRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    courseId: Types.ObjectId;
    title: string;
    dateType: "exam" | "target";
    targetDate: string;
    startDate: string;
    availability: { weekday: number; minutes: number }[];
    priorityTopicIds: string[];
    tasks: RevisionTaskRecord[];
    shortfall: { taskCount: number; minutes: number; topicNames: string[] };
    lastScheduledAt?: Date;
    createdAt: Date;
    updatedAt: Date;
};

const RevisionPlan =
    (models.RevisionPlan as Model<RevisionPlanRecord> | undefined) ??
    model<RevisionPlanRecord>("RevisionPlan", RevisionPlanSchema);

export default RevisionPlan;
