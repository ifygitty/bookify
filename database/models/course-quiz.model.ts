import { model, models, Schema, Types, type Model } from "mongoose";

const CourseQuizQuestionSchema = new Schema(
    {
        id: { type: String, required: true },
        prompt: { type: String, required: true },
        type: {
            type: String,
            enum: ["multiple_choice", "true_false", "short_answer", "calculation", "structured"],
            required: true,
        },
        difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
        scenario: { type: String, default: "" },
        marks: { type: Number, default: 1 },
        choices: { type: [String], default: [] },
        correctChoiceIndex: { type: Number },
        correctBoolean: { type: Boolean },
        expectedAnswer: { type: String, required: true },
        explanation: { type: String, required: true },
        rubric: { type: [String], default: [] },
        rubricItems: {
            type: [new Schema({ criterion: { type: String, required: true }, marks: { type: Number, required: true } }, { _id: false })],
            default: [],
        },
        parts: {
            type: [
                new Schema(
                    {
                        label: { type: String, required: true },
                        prompt: { type: String, required: true },
                        marks: { type: Number, required: true },
                        format: { type: String, enum: ["text", "table"], required: true },
                        tableColumns: { type: [String], default: [] },
                        tableRows: { type: Number, default: 0 },
                    },
                    { _id: false },
                ),
            ],
            default: [],
        },
        calculationChecks: {
            type: [
                new Schema(
                    {
                        description: { type: String, default: "" },
                        expression: { type: String, required: true },
                        result: { type: Number, required: true },
                    },
                    { _id: false },
                ),
            ],
            default: [],
        },
        diagramSvg: { type: String, default: "" },
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
        marksAwarded: { type: Number, min: 0 },
        marksAvailable: { type: Number, min: 0 },
        criteria: {
            type: [
                new Schema(
                    {
                        criterion: { type: String, default: "" },
                        awarded: { type: Number, default: 0 },
                        max: { type: Number, default: 0 },
                        comment: { type: String, default: "" },
                    },
                    { _id: false },
                ),
            ],
            default: undefined,
        },
        feedback: { type: String },
        correctApproach: { type: String },
        incorrectPoints: { type: [String], default: undefined },
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
                enum: ["multiple_choice", "true_false", "short_answer", "calculation", "structured"],
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
    type: "multiple_choice" | "true_false" | "short_answer" | "calculation" | "structured";
    difficulty: "easy" | "medium" | "hard";
    scenario?: string;
    marks?: number;
    choices: string[];
    correctChoiceIndex?: number;
    correctBoolean?: boolean;
    expectedAnswer: string;
    explanation: string;
    rubric: string[];
    rubricItems?: { criterion: string; marks: number }[];
    parts?: {
        label: string;
        prompt: string;
        marks: number;
        format: "text" | "table";
        tableColumns: string[];
        tableRows: number;
    }[];
    calculationChecks?: { description: string; expression: string; result: number }[];
    diagramSvg?: string;
    topic: string;
    sourceMaterialIds: string[];
};

export type CourseQuizAnswerRecord = {
    questionId: string;
    value: string;
    correctness?: "correct" | "partially_correct" | "incorrect" | "uncertain";
    scoreFraction?: number;
    marksAwarded?: number;
    marksAvailable?: number;
    criteria?: { criterion: string; awarded: number; max: number; comment: string }[];
    feedback?: string;
    correctApproach?: string;
    incorrectPoints?: string[];
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

// Recreate the model if a hot-reloaded cache holds an older schema without "structured".
const cachedQuizModel = models.CourseQuiz as Model<CourseQuizRecord> | undefined;
const cachedAllowsStructured = cachedQuizModel
    ?.schema.path("settings.questionType")
    ?.options?.enum?.includes("structured");
if (cachedQuizModel && !cachedAllowsStructured) {
    delete models.CourseQuiz;
}

const CourseQuiz =
    (models.CourseQuiz as Model<CourseQuizRecord> | undefined) ??
    model<CourseQuizRecord>("CourseQuiz", CourseQuizSchema);

export default CourseQuiz;
