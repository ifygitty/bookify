import { model, models, Schema, Types } from "mongoose";

const CourseMaterialSchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        fileSize: { type: Number, required: true },
        openAIFileId: { type: String, required: true },
        memorySummary: { type: String, default: "" },
        originalBlobPathname: { type: String },
        originalFileName: { type: String },
        contentType: { type: String },
    },
    { timestamps: true },
);

const CourseSchema = new Schema(
    {
        clerkId: { type: String, required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        slug: { type: String, required: true, lowercase: true, trim: true },
        vectorStoreId: { type: String, required: true },
        materials: { type: [CourseMaterialSchema], default: [] },
    },
    { timestamps: true },
);

CourseSchema.index({ clerkId: 1, slug: 1 }, { unique: true });

export type CourseMaterialRecord = {
    _id: Types.ObjectId;
    title: string;
    fileSize: number;
    openAIFileId: string;
    memorySummary: string;
    originalBlobPathname?: string;
    originalFileName?: string;
    contentType?: string;
    createdAt: Date;
};

export type CourseRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    name: string;
    slug: string;
    vectorStoreId: string;
    materials: CourseMaterialRecord[];
};

const Course = models.Course || model("Course", CourseSchema);

export default Course;
