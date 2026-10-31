import { model, models, Schema, Types, type Model } from "mongoose";

const CourseQuizQuestionSchema = new Schema(
    {
        id: { type: String, required: true },
        prompt: { type: String, required: true },
        type: {
            type: String,
            enum: ["multiple_choice", "true_false", "short_answer", "calculation"],
            required: true,
        },
        difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
        choices: { type: [String], default: [] },
        correctChoiceIndex: { type: Number },
        correctBoolean: { type: Boolean },
        expectedAnswer: { type: String, required: true },
        explanation: { type: String, required: true },
        rubric: { type: [String], default: [] },
        topic: { type: String, default: "" },
        sourceMaterialIds: { type: [String], default: [] },
    },
    { _id: false },
);

const CourseQuizAnswerSchema = new Schema(
    {
        questionId: { type: String, required: true },
        value: { type: String, default: "" },
        correctness: {
            type: String,
            enum: ["correct", "partially_correct", "incorrect", "uncertain"],
        },
        scoreFraction: { type: Number, min: 0, max: 1 },
        feedback: { type: String },
        missingPoints: { type: [String] },
    },
    { _id: false },
);

const CourseQuizSchema = new Schema(
    {
        clerkId: { type: String, required: true },
        courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
        materialIds: { type: [Schema.Types.ObjectId], required: true },
        materialSources: {
            type: [
                new Schema(
                    {
                        id: { type: String, required: true },
                        title: { type: String, required: true },
                    },
                    { _id: false },
                ),
            ],
            required: true,
        },
        referenceType: {
            type: String,
            enum: ["none", "pasted", "material", "upload"],
            required: true,
        },
        referenceMaterial: {
            type: new Schema(
                {
                    id: { type: String, required: true },
                    title: { type: String, required: true },
                },
                { _id: false },
            ),
        },
        settings: {
            questionCount: { type: Number, min: 1, max: 20, required: true },
            difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
            questionType: {
                type: String,
                enum: ["multiple_choice", "true_false", "short_answer", "calculation"],
                required: true,
            },
            coverage: { type: String, enum: ["all", "topic"], required: true },
            topic: { type: String, default: "" },
            mode: { type: String, enum: ["assessment"], default: "assessment" },
        },
        questions: { type: [CourseQuizQuestionSchema], required: true },
        answers: { type: [CourseQuizAnswerSchema], default: [] },
        status: {
            type: String,
            enum: ["generated", "in_progress", "grading", "completed"],
            default: "generated",
            required: true,
        },
        scorePercent: { type: Number, min: 0, max: 100 },
        gradedQuestionCount: { type: Number, min: 0 },
        submittedAt: { type: Date },
    },
    { timestamps: true },
);

CourseQuizSchema.index({ clerkId: 1, courseId: 1, createdAt: -1 });
CourseQuizSchema.index({ clerkId: 1, courseId: 1, status: 1 });

export type CourseQuizQuestionRecord = {
    id: string;
    prompt: string;
    type: "multiple_choice" | "true_false" | "short_answer" | "calculation";
    difficulty: "easy" | "medium" | "hard";
    choices: string[];
    correctChoiceIndex?: number;
    correctBoolean?: boolean;
    expectedAnswer: string;
    explanation: string;
    rubric: string[];
    topic: string;
    sourceMaterialIds: string[];
};

export type CourseQuizAnswerRecord = {
    questionId: string;
    value: string;
    correctness?: "correct" | "partially_correct" | "incorrect" | "uncertain";
    scoreFraction?: number;
    feedback?: string;
    missingPoints?: string[];
};

export type CourseQuizRecord = {
    _id: Types.ObjectId;
    clerkId: string;
    courseId: Types.ObjectId;
    materialIds: Types.ObjectId[];
    materialSources: { id: string; title: string }[];
    referenceType: "none" | "pasted" | "material" | "upload";
    referenceMaterial?: { id: string; title: string };
    settings: {
        questionCount: number;
        difficulty: "easy" | "medium" | "hard";
        questionType: CourseQuizQuestionRecord["type"];
        coverage: "all" | "topic";
        topic: string;
        mode: "assessment";
    };
    questions: CourseQuizQuestionRecord[];
    answers: CourseQuizAnswerRecord[];
    status: "generated" | "in_progress" | "grading" | "completed";
    scorePercent?: number;
    gradedQuestionCount?: number;
    submittedAt?: Date;
    createdAt: Date;
};

const CourseQuiz =
    (models.CourseQuiz as Model<CourseQuizRecord> | undefined) ??
    model<CourseQuizRecord>("CourseQuiz", CourseQuizSchema);

export default CourseQuiz;
