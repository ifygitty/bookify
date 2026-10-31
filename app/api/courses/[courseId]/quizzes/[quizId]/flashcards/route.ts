import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/database/mongoose";
import Course from "@/database/models/course.model";
import CourseQuiz from "@/database/models/course-quiz.model";
import Flashcard from "@/database/models/flashcard.model";
import FlashcardDeck from "@/database/models/flashcard-deck.model";
import {
    buildQuizMistakeFlashcard,
    createInitialFlashcardSchedule,
    makeQuizFlashcardConversionKey,
    normalizeFlashcardFront,
} from "@/lib/flashcards";
import { isDuplicateKeyError } from "@/lib/flashcard-api";

type RouteContext = { params: Promise<{ courseId: string; quizId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to save a quiz flashcard." }, { status: 401 });
    const { courseId, quizId } = await params;
    if (![courseId, quizId].every(Types.ObjectId.isValid)) {
        return NextResponse.json({ error: "Invalid course quiz." }, { status: 400 });
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "The request must contain valid JSON." }, { status: 400 });
    }
    const data = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
    if (typeof data.deckId !== "string" || !Types.ObjectId.isValid(data.deckId) || typeof data.questionId !== "string") {
        return NextResponse.json({ error: "Choose a deck and a valid quiz question." }, { status: 400 });
    }
    try {
        await connectToDatabase();
        const [course, deck, quiz] = await Promise.all([
            Course.findOne({ _id: courseId, clerkId: userId }).select("_id materials._id"),
            FlashcardDeck.findOne({ _id: data.deckId, courseId, clerkId: userId }),
            CourseQuiz.findOne({ _id: quizId, courseId, clerkId: userId }),
        ]);
        if (!course || !deck || !quiz) return NextResponse.json({ error: "Course, deck, or quiz not found." }, { status: 404 });
        if (quiz.status !== "completed") return NextResponse.json({ error: "Submit the quiz before converting its answers." }, { status: 409 });
        const question = quiz.questions.find((item) => item.id === data.questionId);
        if (!question) return NextResponse.json({ error: "Quiz question not found." }, { status: 404 });
        const previous = await Flashcard.findOne({
            clerkId: userId,
            conversionKey: makeQuizFlashcardConversionKey(quiz._id.toString(), question.id),
        }).select("_id").lean();
        if (previous) return NextResponse.json({ alreadyExists: true, cardId: previous._id.toString() });

        const answer = quiz.answers.find((item) => item.questionId === question.id);
        const submittedAnswer = answer?.value.trim()
            ? question.type === "multiple_choice" && /^\d+$/.test(answer.value)
                ? question.choices[Number(answer.value)] ?? answer.value
                : answer.value
            : "No answer submitted";
        const content = buildQuizMistakeFlashcard(question, submittedAnswer, answer?.missingPoints ?? []);
        const sourceMaterials = quiz.materialSources
            .filter((source) => question.sourceMaterialIds.includes(source.id))
            .map((source) => ({
                id: source.id,
                title: source.title,
                available: course.materials.some((material) => material._id.toString() === source.id),
            }));
        const conversionKey = makeQuizFlashcardConversionKey(quiz._id.toString(), question.id);
        const normalizedFront = normalizeFlashcardFront(content.front);
        const existingContent = await Flashcard.findOne({
            clerkId: userId,
            deckId: deck._id,
            normalizedFront,
        }).select("_id").lean();
        if (existingContent) {
            return NextResponse.json({ error: "That question is already in this deck." }, { status: 409 });
        }
        const card = await Flashcard.create({
            clerkId: userId,
            courseId: course._id,
            deckId: deck._id,
            front: content.front,
            normalizedFront,
            back: content.back,
            topic: content.topic,
            sourceMaterials,
            provenance: "quiz",
            quizId: quiz._id.toString(),
            quizQuestionId: question.id,
            conversionKey,
            schedule: createInitialFlashcardSchedule(),
        });
        return NextResponse.json({ cardId: card._id.toString(), alreadyExists: false }, { status: 201 });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            const previous = await Flashcard.findOne({
                clerkId: userId,
                conversionKey: makeQuizFlashcardConversionKey(quizId, String(data.questionId)),
            }).select("_id").lean();
            if (previous) return NextResponse.json({ alreadyExists: true, cardId: previous._id.toString() });
        }
        console.error("Failed to convert quiz answer to flashcard:", error);
        return NextResponse.json({ error: "Could not add this quiz question to flashcards." }, { status: 500 });
    }
}
