import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import Course from "@/database/models/course.model";
import CourseQuiz from "@/database/models/course-quiz.model";
import Flashcard from "@/database/models/flashcard.model";
import FlashcardReview from "@/database/models/flashcard-review.model";
import { buildStudyProgress, type StudyProgressReviewSummary } from "@/lib/study-progress";

export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Sign in to view your study progress." }, { status: 401 });
    }

    try {
        await connectToDatabase();
        const ownedCourses = await Course.find({ clerkId: userId })
            .select("_id name")
            .sort({ name: 1 })
            .lean();
        if (ownedCourses.length === 0) {
            return NextResponse.json(buildStudyProgress([], [], [], new Map()));
        }

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const courseIds = ownedCourses.map((course) => course._id);
        const [quizzes, reviewSummaries, recentReviews, dueCardCounts] = await Promise.all([
            CourseQuiz.find({
                clerkId: userId,
                courseId: { $in: courseIds },
                status: "completed",
            })
                .select("courseId status scorePercent gradedQuestionCount questions.id questions.topic answers.questionId answers.correctness answers.scoreFraction submittedAt createdAt")
                .sort({ submittedAt: 1, createdAt: 1 })
                .lean(),
            FlashcardReview.aggregate([
                { $match: { clerkId: userId, courseId: { $in: courseIds } } },
                {
                    $group: {
                        _id: "$courseId",
                        total: { $sum: 1 },
                        recent7Days: {
                            $sum: { $cond: [{ $gte: ["$reviewedAt", sevenDaysAgo] }, 1, 0] },
                        },
                        again30Days: {
                            $sum: {
                                $cond: [{
                                    $and: [
                                        { $eq: ["$rating", "again"] },
                                        { $gte: ["$reviewedAt", thirtyDaysAgo] },
                                    ],
                                }, 1, 0],
                            },
                        },
                        hard30Days: {
                            $sum: {
                                $cond: [{
                                    $and: [
                                        { $eq: ["$rating", "hard"] },
                                        { $gte: ["$reviewedAt", thirtyDaysAgo] },
                                    ],
                                }, 1, 0],
                            },
                        },
                        good30Days: {
                            $sum: {
                                $cond: [{
                                    $and: [
                                        { $eq: ["$rating", "good"] },
                                        { $gte: ["$reviewedAt", thirtyDaysAgo] },
                                    ],
                                }, 1, 0],
                            },
                        },
                        easy30Days: {
                            $sum: {
                                $cond: [{
                                    $and: [
                                        { $eq: ["$rating", "easy"] },
                                        { $gte: ["$reviewedAt", thirtyDaysAgo] },
                                    ],
                                }, 1, 0],
                            },
                        },
                    },
                },
            ]),
            FlashcardReview.find({
                clerkId: userId,
                courseId: { $in: courseIds },
            })
                .select("courseId rating reviewedAt")
                .sort({ reviewedAt: -1 })
                .limit(40)
                .lean(),
            Flashcard.aggregate([
                {
                    $match: {
                        clerkId: userId,
                        courseId: { $in: courseIds },
                        "schedule.dueAt": { $lte: now },
                    },
                },
                { $group: { _id: "$courseId", count: { $sum: 1 } } },
            ]),
        ]);

        const courses = ownedCourses.map((course) => ({
            id: course._id.toString(),
            name: course.name,
        }));
        const mappedQuizzes = quizzes.map((quiz) => ({
            courseId: quiz.courseId.toString(),
            status: quiz.status,
            scorePercent: quiz.scorePercent,
            gradedQuestionCount: quiz.gradedQuestionCount,
            submittedAt: quiz.submittedAt,
            createdAt: quiz.createdAt,
            questions: quiz.questions.map((question) => ({
                id: question.id,
                topic: question.topic,
            })),
            answers: quiz.answers.map((answer) => ({
                questionId: answer.questionId,
                correctness: answer.correctness,
                scoreFraction: answer.scoreFraction,
            })),
        }));
        const summaries = new Map<string, StudyProgressReviewSummary>(
            reviewSummaries.map((summary) => [
                summary._id.toString(),
                {
                    total: summary.total,
                    recent7Days: summary.recent7Days,
                    ratingsLast30Days: {
                        again: summary.again30Days,
                        hard: summary.hard30Days,
                        good: summary.good30Days,
                        easy: summary.easy30Days,
                    },
                },
            ]),
        );
        const reviews = recentReviews.map((review) => ({
            courseId: review.courseId.toString(),
            rating: review.rating,
            reviewedAt: review.reviewedAt,
        }));
        const dueCardsByCourse = new Map<string, number>(
            dueCardCounts.map((item) => [item._id.toString(), item.count]),
        );

        return NextResponse.json(
            buildStudyProgress(courses, mappedQuizzes, reviews, dueCardsByCourse, now, summaries),
        );
    } catch (error) {
        console.error("Failed to load student study progress:", error);
        return NextResponse.json({ error: "Could not load your study progress." }, { status: 500 });
    }
}
