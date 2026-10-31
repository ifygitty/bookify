import { model, models, Schema, Types, type Model } from "mongoose";

const OutlineMaterialSnapshotSchema = new Schema(
    {
        id: { type: String, required: true },
        title: { type: String, required: true, maxlength: 150 },
        retrieved: { type: Boolean, required: true, default: true },
    },
    { _id: false },
);

const CourseOutlineSubtopicSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true, trim: true, maxlength: 160 },
        description: { type: String, trim: true, maxlength: 800, default: "" },
        order: { type: Number, required: true, min: 0 },
        materialIds: { type: [String], default: [] },
    },
    { _id: false, timestamps: true },
);

const CourseOutlineTopicSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true, trim: true, maxlength: 160 },
        description: { type: String, trim: true, maxlength: 800, default: "" },
        status: {
            type: String,
            enum: ["not_started", "in_progress", "completed"],
            default: "not_started",
            required: true,
        },
        order: { type: Number, required: true, min: 0 },
        materialIds: { type: [String], default: [] },
        subtopics: { type: [CourseOutlineSubtopicSchema], default: [] },
    },
    { _id: false, timestamps: true },
);

const CourseOutlineSchema = new Schema(
    {
        clerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        materialSources: { type: [OutlineMaterialSnapshotSchema], default: [] },
        generationMaterials: { type: [OutlineMaterialSnapshotSchema], default: [] },
        topics: { type: [CourseOutlineTopicSchema], default: [] },
        lastGeneratedAt: { type: Date },
    },
    { timestamps: true },
);

CourseOutlineSchema.index({ clerkId: 1, courseId: 1 }, { unique: true });

export type CourseOutlineTopicRecord = {
    id: string;
    name: string;
    description: string;
    status: "not_started" | "in_progress" | "completed";
    order: number;
    materialIds: string[];
    subtopics: {
        id: string;
        name: string;
        description: string;
        order: number;
        materialIds: string[];
    }[];
};

export type CourseOutlineRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    courseId: Types.ObjectId;
    materialSources: { id: string; title: string; retrieved: boolean }[];
    generationMaterials: { id: string; title: string; retrieved: boolean }[];
    topics: CourseOutlineTopicRecord[];
    lastGeneratedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
};

const CourseOutline =
    (models.CourseOutline as Model<CourseOutlineRecord> | undefined) ??
    model<CourseOutlineRecord>("CourseOutline", CourseOutlineSchema);

export default CourseOutline;
