export type StudyProgressQuiz = {
    courseId: string;
    status: string;
    scorePercent?: number;
    gradedQuestionCount?: number;
    submittedAt?: Date | string;
    createdAt?: Date | string;
    questions: { id: string; topic?: string }[];
    answers: {
        questionId: string;
        value?: string;
        correctness?: string;
        scoreFraction?: number | null;
    }[];
};

export type StudyProgressReview = {
    courseId: string;
    rating: "again" | "hard" | "good" | "easy";
    reviewedAt: Date | string;
};

export type StudyProgressCourse = { id: string; name: string };
export type StudyProgressReviewSummary = {
    total: number;
    recent7Days: number;
    ratingsLast30Days: { again: number; hard: number; good: number; easy: number };
};

function validDate(value: Date | string | undefined, fallback?: Date | string): Date | null {
    const date = value ? new Date(value) : fallback ? new Date(fallback) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
}

function getAnswerScore(answer: StudyProgressQuiz["answers"][number]): number | null {
    if (typeof answer.scoreFraction === "number" && Number.isFinite(answer.scoreFraction)) {
        return Math.max(0, Math.min(1, answer.scoreFraction));
    }
    if (answer.correctness === "correct") return 1;
    if (answer.correctness === "incorrect") return 0;
    return null;
}

function average(values: number[]): number | null {
    return values.length > 0
        ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
        : null;
}

function getQuizScorePercent(quiz: StudyProgressQuiz): number | null {
    if (
        typeof quiz.scorePercent === "number" &&
        Number.isFinite(quiz.scorePercent) &&
        ((quiz.gradedQuestionCount ?? 0) > 0 || quiz.answers.some((answer) => getAnswerScore(answer) !== null))
    ) {
        return Math.max(0, Math.min(100, quiz.scorePercent));
    }

    const seen = new Set<string>();
    const scores = quiz.answers.flatMap((answer) => {
        if (seen.has(answer.questionId)) return [];
        seen.add(answer.questionId);
        const score = getAnswerScore(answer);
        return score === null ? [] : [score * 100];
    });
    return average(scores);
}

function classifyTopic(accuracy: number): "strong" | "developing" | "needs_improvement" {
    if (accuracy >= 80) return "strong";
    if (accuracy < 60) return "needs_improvement";
    return "developing";
}

export function buildStudyProgress(
    courses: StudyProgressCourse[],
    quizzes: StudyProgressQuiz[],
    reviews: StudyProgressReview[],
    dueCardsByCourse: Map<string, number>,
    now = new Date(),
    reviewSummaries = new Map<string, StudyProgressReviewSummary>(),
) {
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    const courseStats = courses.map((course) => {
        const courseQuizzes = quizzes
            .filter((quiz) => quiz.courseId === course.id && quiz.status === "completed")
            .map((quiz) => ({
                quiz,
                date: validDate(quiz.submittedAt, quiz.createdAt),
            }))
            .sort((left, right) => (left.date?.getTime() ?? 0) - (right.date?.getTime() ?? 0));
        const courseReviews = reviews.filter((review) => review.courseId === course.id);
        const scoredQuizzes = courseQuizzes
            .map(({ quiz, date }) => ({ quiz, date, score: getQuizScorePercent(quiz) }))
            .filter((item): item is typeof item & { score: number } => item.score !== null);
        const datedScoredQuizzes = scoredQuizzes.filter(({ date }) => date !== null);
        const topicAnswers = new Map<string, { scores: number[]; recent: { date: Date; score: number }[] }>();
        let attemptedQuestionCount = 0;
        let correctAnswerCount = 0;
        let incorrectAnswerCount = 0;
        let partiallyCorrectAnswerCount = 0;

        for (const { quiz, date } of courseQuizzes) {
            const questionsById = new Map(
                quiz.questions.map((question) => [question.id, question]),
            );
            const answerIds = new Set<string>();
            for (const answer of quiz.answers) {
                if (answerIds.has(answer.questionId)) continue;
                answerIds.add(answer.questionId);
                const question = questionsById.get(answer.questionId);
                const score = getAnswerScore(answer);
                if (!question || score === null) continue;

                attemptedQuestionCount += 1;
                if (score === 1) correctAnswerCount += 1;
                else if (score === 0) incorrectAnswerCount += 1;
                else partiallyCorrectAnswerCount += 1;

                const topic = question.topic?.trim();
                if (!topic) continue;
                const current = topicAnswers.get(topic) ?? { scores: [], recent: [] };
                current.scores.push(score);
                if (date) current.recent.push({ date, score });
                topicAnswers.set(topic, current);
            }
        }

        const topics = [...topicAnswers.entries()]
            .map(([name, data]) => {
                const accuracy = average(data.scores.map((score) => score * 100));
                const recent = data.recent
                    .sort((left, right) => left.date.getTime() - right.date.getTime())
                    .slice(-5);
                const evidence = data.scores.length >= 3;
                return {
                    name,
                    questionsAttempted: data.scores.length,
                    correctAnswers: data.scores.filter((score) => score === 1).length,
                    incorrectAnswers: data.scores.filter((score) => score === 0).length,
                    partiallyCorrectAnswers: data.scores.filter((score) => score > 0 && score < 1).length,
                    accuracyPercent: accuracy,
                    recentAccuracyPercent: average(recent.map(({ score }) => score * 100)),
                    recentQuestionsAttempted: recent.length,
                    classification: evidence && accuracy !== null ? classifyTopic(accuracy) : "more_practice",
                    hasSufficientEvidence: evidence,
                };
            })
            .sort((left, right) => {
                const leftRank = left.classification === "needs_improvement" ? 0 : left.classification === "developing" ? 1 : 2;
                const rightRank = right.classification === "needs_improvement" ? 0 : right.classification === "developing" ? 1 : 2;
                return leftRank - rightRank || left.name.localeCompare(right.name);
            });

        const trend = datedScoredQuizzes.length >= 4
            ? (() => {
                const midpoint = Math.floor(datedScoredQuizzes.length / 2);
                const earlier = average(datedScoredQuizzes.slice(0, midpoint).map(({ score }) => score));
                const recent = average(datedScoredQuizzes.slice(midpoint).map(({ score }) => score));
                const difference = earlier !== null && recent !== null
                    ? Math.round((recent - earlier) * 10) / 10
                    : null;
                return {
                    earlierAveragePercent: earlier,
                    recentAveragePercent: recent,
                    differencePercentagePoints: difference,
                    direction: difference === null ? "insufficient_data" : difference > 5 ? "improving" : difference < -5 ? "declining" : "stable",
                };
            })()
            : {
                earlierAveragePercent: null,
                recentAveragePercent: null,
                differencePercentagePoints: null,
                direction: "insufficient_data",
            };

        const computedReviewSummary = {
            total: courseReviews.length,
            recent7Days: 0,
            ratingsLast30Days: { again: 0, hard: 0, good: 0, easy: 0 },
        };
        for (const review of courseReviews) {
            const reviewedAt = validDate(review.reviewedAt);
            if (!reviewedAt) continue;
            if (reviewedAt.getTime() >= sevenDaysAgo) computedReviewSummary.recent7Days += 1;
            if (reviewedAt.getTime() >= thirtyDaysAgo) computedReviewSummary.ratingsLast30Days[review.rating] += 1;
        }
        const reviewSummary = reviewSummaries.get(course.id) ?? computedReviewSummary;

        const recentActivity = [
            ...courseQuizzes.filter(({ date }) => date !== null).map(({ quiz, date }) => ({
                type: "quiz" as const,
                label: "Completed a practice quiz",
                date: date!.toISOString(),
                scorePercent: getQuizScorePercent(quiz),
            })),
            ...courseReviews
                .map((review) => ({
                    type: "flashcard_review" as const,
                    label: `Flashcard rated ${review.rating}`,
                    date: validDate(review.reviewedAt)?.toISOString() ?? "",
                    scorePercent: null,
                }))
                .filter((activity) => activity.date),
        ]
            .sort((left, right) => right.date.localeCompare(left.date))
            .slice(0, 5);

        return {
            id: course.id,
            name: course.name,
            quizzesCompleted: courseQuizzes.length,
            averageQuizScorePercent: average(scoredQuizzes.map(({ score }) => score)),
            questionsGraded: attemptedQuestionCount,
            correctAnswerCount,
            incorrectAnswerCount,
            partiallyCorrectAnswerCount,
            topics,
            weakTopicCount: topics.filter((topic) => topic.classification === "needs_improvement").length,
            performanceTrend: trend,
            flashcardsReviewed: reviewSummary.total,
            flashcardsReviewedLast7Days: reviewSummary.recent7Days,
            flashcardsDue: dueCardsByCourse.get(course.id) ?? 0,
            reviewRatingsLast30Days: reviewSummary.ratingsLast30Days,
            recentActivity,
        };
    });

    const scores = courseStats.flatMap((course) =>
        quizzes
            .filter((quiz) => quiz.courseId === course.id && quiz.status === "completed")
            .map((quiz) => getQuizScorePercent(quiz))
            .filter((score): score is number => score !== null),
    );
    const totalReviews = courseStats.reduce((sum, course) => sum + course.flashcardsReviewed, 0);
    const totalDueCards = courseStats.reduce((sum, course) => sum + course.flashcardsDue, 0);
    const allActivity = courseStats
        .flatMap((course) =>
            course.recentActivity.map((activity) => ({
                ...activity,
                courseId: course.id,
                courseName: course.name,
            })),
        )
        .sort((left, right) => right.date.localeCompare(left.date))
        .slice(0, 8);

    return {
        summary: {
            coursesCount: courses.length,
            quizzesCompleted: courseStats.reduce((sum, course) => sum + course.quizzesCompleted, 0),
            averageQuizScorePercent: average(scores),
            flashcardsReviewed: totalReviews,
            flashcardsDue: totalDueCards,
            weakTopicCount: courseStats.reduce((sum, course) => sum + course.weakTopicCount, 0),
        },
        courses: courseStats,
        recentActivity: allActivity,
    };
}
