import { model, models, Schema, Types, type Model } from "mongoose";

const DraftSubtopicSchema = new Schema(
    {
        name: { type: String, required: true, maxlength: 160 },
        description: { type: String, maxlength: 800, default: "" },
        materialIds: { type: [String], default: [] },
    },
    { _id: false },
);

const DraftTopicSchema = new Schema(
    {
        name: { type: String, required: true, maxlength: 160 },
        description: { type: String, maxlength: 800, default: "" },
        materialIds: { type: [String], default: [] },
        subtopics: { type: [DraftSubtopicSchema], default: [] },
    },
    { _id: false },
);

const DraftMaterialSchema = new Schema(
    {
        id: { type: String, required: true },
        title: { type: String, required: true, maxlength: 150 },
        retrieved: { type: Boolean, required: true },
    },
    { _id: false },
);

const CourseOutlineDraftSchema = new Schema(
    {
        clerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        previewId: { type: String, required: true, unique: true },
        topics: { type: [DraftTopicSchema], required: true },
        selectedMaterials: { type: [DraftMaterialSchema], required: true },
        replaceExisting: { type: Boolean, required: true },
        expectedUpdatedAt: { type: Date },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true },
);

CourseOutlineDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
CourseOutlineDraftSchema.index({ clerkId: 1, courseId: 1, createdAt: -1 });

export type CourseOutlineDraftRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    courseId: Types.ObjectId;
    previewId: string;
    topics: {
        name: string;
        description: string;
        materialIds: string[];
        subtopics: { name: string; description: string; materialIds: string[] }[];
    }[];
    selectedMaterials: { id: string; title: string; retrieved: boolean }[];
    replaceExisting: boolean;
    expectedUpdatedAt?: Date;
    expiresAt: Date;
    createdAt: Date;
};

const CourseOutlineDraft =
    (models.CourseOutlineDraft as Model<CourseOutlineDraftRecord> | undefined) ??
    model<CourseOutlineDraftRecord>("CourseOutlineDraft", CourseOutlineDraftSchema);

export default CourseOutlineDraft;
