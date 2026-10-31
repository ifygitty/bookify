import { model, models, Schema, Types, type Model } from "mongoose";

const CourseOutlineGenerationSchema = new Schema(
    {
        clerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        token: { type: String, required: true },
        expiresAt: { type: Date, required: true },
    },
    { timestamps: true },
);

CourseOutlineGenerationSchema.index({ courseId: 1 }, { unique: true });
CourseOutlineGenerationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type CourseOutlineGenerationRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    courseId: Types.ObjectId;
    token: string;
    expiresAt: Date;
};

const CourseOutlineGeneration =
    (models.CourseOutlineGeneration as Model<CourseOutlineGenerationRecord> | undefined) ??
    model<CourseOutlineGenerationRecord>("CourseOutlineGeneration", CourseOutlineGenerationSchema);

export default CourseOutlineGeneration;
