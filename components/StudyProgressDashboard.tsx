"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    BookOpen,
    BookOpenCheck,
    CheckCircle2,
    ChevronRight,
    Clock3,
    Flame,
    GraduationCap,
    Menu,
    X,
} from "lucide-react";

type TopicProgress = {
    name: string;
    questionsAttempted: number;
    correctAnswers: number;
    incorrectAnswers: number;
    partiallyCorrectAnswers: number;
    accuracyPercent: number | null;
    recentAccuracyPercent: number | null;
    recentQuestionsAttempted: number;
    classification: "strong" | "developing" | "needs_improvement" | "more_practice";
    hasSufficientEvidence: boolean;
};
type CourseProgress = {
    id: string;
    name: string;
    quizzesCompleted: number;
    averageQuizScorePercent: number | null;
    questionsGraded: number;
    correctAnswerCount: number;
    incorrectAnswerCount: number;
    partiallyCorrectAnswerCount: number;
    topics: TopicProgress[];
    weakTopicCount: number;
    performanceTrend: {
        earlierAveragePercent: number | null;
        recentAveragePercent: number | null;
        differencePercentagePoints: number | null;
        direction: "improving" | "declining" | "stable" | "insufficient_data";
    };
    flashcardsReviewed: number;
    flashcardsReviewedLast7Days: number;
    flashcardsDue: number;
    reviewRatingsLast30Days: { again: number; hard: number; good: number; easy: number };
    recentActivity: {
        type: "quiz" | "flashcard_review";
        label: string;
        date: string;
        scorePercent: number | null;
    }[];
};
type ProgressData = {
    summary: {
        coursesCount: number;
        quizzesCompleted: number;
        averageQuizScorePercent: number | null;
        flashcardsReviewed: number;
        flashcardsDue: number;
        weakTopicCount: number;
    };
    courses: CourseProgress[];
    recentActivity: (CourseProgress["recentActivity"][number] & {
        courseId: string;
        courseName: string;
    })[];
};

const classificationLabels: Record<TopicProgress["classification"], string> = {
    strong: "Strong",
    developing: "Developing",
    needs_improvement: "Needs improvement",
    more_practice: "More practice needed",
};

function formatPercent(value: number | null) {
    return value === null ? "—" : `${Math.round(value)}%`;
}

function formatDate(value: string) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)
        : "Recently";
}

function readError(value: unknown) {
    return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string"
        ? value.error
        : "Could not load your study progress.";
}

export default function StudyProgressDashboard() {
    const [data, setData] = useState<ProgressData | null>(null);
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/progress", { signal: controller.signal })
            .then(async (response) => {
                const result: unknown = await response.json();
                if (!response.ok) throw new Error(readError(result));
                setData(result as ProgressData);
            })
            .catch((loadError: unknown) => {
                if (loadError instanceof DOMException && loadError.name === "AbortError") return;
                console.error("Failed to load study progress:", loadError);
                setError(loadError instanceof Error ? loadError.message : "Could not load your study progress.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoading(false);
            });
        return () => controller.abort();
    }, []);

    const sidebar = (
        <nav aria-label="Study progress navigation" className="space-y-1">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b7063]">Workspace</p>
            <Link
                href="/progress"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl bg-[#fff6e5] px-3 py-2.5 font-semibold text-[#663820]"
                aria-current="page"
            >
                <Activity className="size-4" />
                Study progress
            </Link>
            <Link
                href="/courses"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#3d485e] transition hover:bg-[#f8f4e9]"
            >
                <BookOpen className="size-4" />
                My courses
            </Link>
            <Link
                href="/library"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#3d485e] transition hover:bg-[#f8f4e9]"
            >
                <GraduationCap className="size-4" />
                Book library
            </Link>
            {data && data.courses.length > 0 && (
                <div className="pt-6">
                    <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b7063]">Your courses</p>
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                        {data.courses.map((course) => (
                            <a
                                key={course.id}
                                href={`#course-${course.id}`}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block truncate rounded-xl px-3 py-2 text-sm text-[#3d485e] hover:bg-[#f8f4e9]"
                            >
                                {course.name}
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </nav>
    );

    return (
        <main className="container wrapper">
            <div className="mx-auto max-w-7xl">
                <div className="mb-5 flex items-center justify-between lg:hidden">
                    <div>
                        <p className="text-sm font-medium text-[#663820]">Your learning overview</p>
                    </div>
                    <button
                        type="button"
                        aria-expanded={isMobileMenuOpen}
                        aria-controls="progress-mobile-sidebar"
                        onClick={() => setIsMobileMenuOpen((open) => !open)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#212a3b]/15 bg-white px-3 text-sm font-semibold text-[#212a3b]"
                    >
                        {isMobileMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
                        {isMobileMenuOpen ? "Close" : "Menu"}
                    </button>
                </div>
                <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
                    <aside className="hidden self-start rounded-2xl border border-[#212a3b]/10 bg-white p-3 shadow-soft-sm lg:sticky lg:top-24 lg:block">
                        {sidebar}
                    </aside>
                    {isMobileMenuOpen && (
                        <>
                            <button
                                type="button"
                                aria-label="Close navigation menu"
                                className="fixed inset-0 z-40 bg-[#212a3b]/35 lg:hidden"
                                onClick={() => setIsMobileMenuOpen(false)}
                            />
                            <aside
                                id="progress-mobile-sidebar"
                                className="fixed inset-y-0 left-0 z-50 w-[min(84vw,320px)] overflow-y-auto border-r border-[#212a3b]/10 bg-white p-4 pt-20 shadow-xl lg:hidden"
                            >
                                {sidebar}
                            </aside>
                        </>
                    )}
                    <div className="min-w-0 space-y-6">
                        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#663820]">Your study space</p>
                                <h1 className="text-3xl font-bold tracking-tight text-[#212a3b] sm:text-4xl">Study progress</h1>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#3d485e] sm:text-base">
                                    A snapshot of your completed quiz attempts, topic performance, and flashcard reviews.
                                </p>
                            </div>
                            <Link href="/courses" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#663820] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7a4528]">
                                Go to courses <ChevronRight className="size-4" />
                            </Link>
                        </header>

                        {error && (
                            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                {error}
                            </div>
                        )}

                        {isLoading ? (
                            <div aria-label="Loading progress" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                {[1, 2, 3, 4].map((item) => (
                                    <div key={item} className="h-28 animate-pulse rounded-2xl bg-white/80" />
                                ))}
                            </div>
                        ) : data ? (
                            <>
                                <section aria-label="Overall study summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <SummaryCard icon={<BookOpen className="size-5" />} label="Courses" value={String(data.summary.coursesCount)} detail="Courses in your study space" />
                                    <SummaryCard icon={<BookOpenCheck className="size-5" />} label="Quizzes completed" value={String(data.summary.quizzesCompleted)} detail={`${formatPercent(data.summary.averageQuizScorePercent)} average score`} />
                                    <SummaryCard icon={<CheckCircle2 className="size-5" />} label="Flashcard reviews" value={String(data.summary.flashcardsReviewed)} detail={`${data.summary.flashcardsDue} cards due now`} />
                                    <SummaryCard icon={<Flame className="size-5" />} label="Topics to revisit" value={String(data.summary.weakTopicCount)} detail="Based on at least 3 graded answers" />
                                </section>

                                {data.courses.length === 0 ? (
                                    <section className="rounded-2xl border border-dashed border-[#212a3b]/20 bg-white px-5 py-12 text-center sm:px-8">
                                        <BookOpen className="mx-auto mb-4 size-10 text-[#663820]" />
                                        <h2 className="text-xl font-semibold text-[#212a3b]">Create a course to start tracking progress</h2>
                                        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#3d485e]">
                                            Your quiz and flashcard activity will appear here after you add a course and begin practising.
                                        </p>
                                        <Link href="/courses" className="btn-primary mt-5 inline-flex">Browse my courses</Link>
                                    </section>
                                ) : (
                                    <>
                                        <section aria-labelledby="course-progress-heading" className="space-y-4">
                                            <div>
                                                <h2 id="course-progress-heading" className="text-xl font-bold text-[#212a3b] sm:text-2xl">Course progress</h2>
                                                <p className="mt-1 text-sm text-[#3d485e]">Quiz scores and recall reviews are shown separately.</p>
                                            </div>
                                            {data.courses.map((course) => (
                                                <article key={course.id} id={`course-${course.id}`} className="scroll-mt-24 rounded-2xl border border-[#212a3b]/10 bg-white p-4 shadow-soft-sm sm:p-6">
                                                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                        <div className="min-w-0">
                                                            <h3 className="truncate text-lg font-bold text-[#212a3b] sm:text-xl">{course.name}</h3>
                                                            <p className="mt-1 text-sm text-[#3d485e]">
                                                                {course.quizzesCompleted === 0 && course.flashcardsReviewed === 0
                                                                    ? "Progress will appear here when you complete a quiz or review flashcards."
                                                                    : `${course.quizzesCompleted} completed quiz${course.quizzesCompleted === 1 ? "" : "zes"} · ${course.questionsGraded} questions graded`}
                                                            </p>
                                                        </div>
                                                        <Link href={`/courses/${course.id}`} className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-lg border border-[#663820]/30 px-3 py-2 text-sm font-semibold text-[#663820] hover:bg-[#fff6e5]">
                                                            Open course <ChevronRight className="size-4" />
                                                        </Link>
                                                    </div>
                                                    {course.quizzesCompleted === 0 && course.flashcardsReviewed === 0 ? (
                                                        <div className="rounded-xl bg-[#f8f4e9] px-4 py-4 text-sm text-[#3d485e]">
                                                            Start with Practice Questions or create a flashcard deck in this course. We’ll show your real activity here.
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-6">
                                                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                                                <MiniStat label="Quiz average" value={formatPercent(course.averageQuizScorePercent)} />
                                                                <MiniStat label="Questions graded" value={String(course.questionsGraded)} detail={`${course.correctAnswerCount} correct · ${course.incorrectAnswerCount} incorrect${course.partiallyCorrectAnswerCount ? ` · ${course.partiallyCorrectAnswerCount} partial` : ""}`} />
                                                                <MiniStat label="Cards reviewed" value={String(course.flashcardsReviewed)} detail={`${course.flashcardsReviewedLast7Days} in the last 7 days`} />
                                                                <MiniStat label="Cards due" value={String(course.flashcardsDue)} detail="Based on saved review schedules" />
                                                            </div>

                                                            <StudyFeedback course={course} />

                                                            <div className="grid gap-5 lg:grid-cols-2">
                                                                <section className="min-w-0">
                                                                    <h4 className="mb-3 font-semibold text-[#212a3b]">Topic performance</h4>
                                                                    {course.topics.length === 0 ? (
                                                                        <p className="rounded-xl bg-[#f8f4e9] p-4 text-sm leading-6 text-[#3d485e]">
                                                                            Topic-level feedback will appear when completed quiz questions have a recorded topic and grade.
                                                                        </p>
                                                                    ) : (
                                                                        <ul className="space-y-2">
                                                                            {course.topics.slice(0, 5).map((topic) => (
                                                                                <li key={topic.name} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#212a3b]/10 px-3 py-3">
                                                                                    <div className="min-w-0">
                                                                                        <p className="truncate text-sm font-semibold text-[#212a3b]">{topic.name}</p>
                                                                                        <p className="mt-1 text-xs text-[#3d485e]">
                                                                                            {topic.questionsAttempted} graded · {formatPercent(topic.accuracyPercent)} accuracy
                                                                                        </p>
                                                                                        <p className="mt-1 text-xs text-[#3d485e]">
                                                                                            {topic.correctAnswers} correct · {topic.incorrectAnswers} incorrect
                                                                                            {topic.partiallyCorrectAnswers > 0 ? ` · ${topic.partiallyCorrectAnswers} partial` : ""}
                                                                                            {topic.recentQuestionsAttempted > 0 ? ` · recent ${formatPercent(topic.recentAccuracyPercent)}` : ""}
                                                                                        </p>
                                                                                    </div>
                                                                                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${topicTone(topic.classification)}`}>
                                                                                        {classificationLabels[topic.classification]}
                                                                                    </span>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    )}
                                                                </section>

                                                                <section className="min-w-0 space-y-5">
                                                                    <div>
                                                                        <h4 className="mb-3 font-semibold text-[#212a3b]">Quiz performance over time</h4>
                                                                        {course.performanceTrend.direction === "insufficient_data" ? (
                                                                            <div className="rounded-xl bg-[#f8f4e9] p-4 text-sm leading-6 text-[#3d485e]">
                                                                                Complete at least four scored quizzes to compare earlier and recent results.
                                                                            </div>
                                                                        ) : (
                                                                            <div className="rounded-xl border border-[#212a3b]/10 p-4">
                                                                                <div className="flex items-center gap-2 text-sm font-semibold text-[#212a3b]">
                                                                                    {course.performanceTrend.direction === "improving"
                                                                                        ? <ArrowUpRight className="size-5 text-emerald-700" />
                                                                                        : course.performanceTrend.direction === "declining"
                                                                                          ? <ArrowDownRight className="size-5 text-amber-700" />
                                                                                          : <Activity className="size-5 text-[#663820]" />}
                                                                                    {trendLabel(course.performanceTrend.direction)}
                                                                                </div>
                                                                                <p className="mt-2 text-sm text-[#3d485e]">
                                                                                    Earlier {formatPercent(course.performanceTrend.earlierAveragePercent)} <span aria-hidden="true">→</span> Recent {formatPercent(course.performanceTrend.recentAveragePercent)}
                                                                                    {course.performanceTrend.differencePercentagePoints !== null
                                                                                        ? ` (${course.performanceTrend.differencePercentagePoints > 0 ? "+" : ""}${course.performanceTrend.differencePercentagePoints} percentage points)`
                                                                                        : ""}
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="mb-3 font-semibold text-[#212a3b]">Flashcard recall · last 30 days</h4>
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            {(["again", "hard", "good", "easy"] as const).map((rating) => (
                                                                                <div key={rating} className="rounded-xl bg-[#f8f4e9] px-3 py-2.5">
                                                                                    <p className="text-xs capitalize text-[#3d485e]">{rating}</p>
                                                                                    <p className="mt-0.5 text-lg font-bold text-[#212a3b]">{course.reviewRatingsLast30Days[rating]}</p>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        <p className="mt-2 text-xs leading-5 text-[#3d485e]">
                                                                            Review ratings describe recall, not quiz accuracy.
                                                                        </p>
                                                                    </div>
                                                                </section>
                                                            </div>
                                                        </div>
                                                    )}
                                                </article>
                                            ))}
                                        </section>

                                        <section aria-labelledby="recent-activity-heading" className="rounded-2xl border border-[#212a3b]/10 bg-white p-4 shadow-soft-sm sm:p-6">
                                            <div className="mb-4 flex items-center gap-2">
                                                <Clock3 className="size-5 text-[#663820]" />
                                                <h2 id="recent-activity-heading" className="text-lg font-bold text-[#212a3b]">Recent study activity</h2>
                                            </div>
                                            {data.recentActivity.length === 0 ? (
                                                <p className="rounded-xl bg-[#f8f4e9] p-4 text-sm text-[#3d485e]">
                                                    Your completed quizzes and flashcard reviews will show here.
                                                </p>
                                            ) : (
                                                <ul className="divide-y divide-[#212a3b]/10">
                                                    {data.recentActivity.map((activity, index) => (
                                                        <li key={`${activity.courseId}-${activity.type}-${activity.date}-${index}`} className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                                            <div className="flex min-w-0 items-center gap-3">
                                                                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff6e5] text-[#663820]">
                                                                    {activity.type === "quiz" ? <BookOpenCheck className="size-4" /> : <CheckCircle2 className="size-4" />}
                                                                </span>
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-semibold text-[#212a3b]">{activity.label}</p>
                                                                    <p className="truncate text-xs text-[#3d485e]">{activity.courseName}</p>
                                                                </div>
                                                            </div>
                                                            <div className="shrink-0 text-right">
                                                                {activity.scorePercent !== null && <p className="text-sm font-semibold text-[#212a3b]">{formatPercent(activity.scorePercent)}</p>}
                                                                <p className="text-xs text-[#3d485e]">{formatDate(activity.date)}</p>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </section>
                                    </>
                                )}
                            </>
                        ) : null}
                    </div>
                </div>
            </div>
        </main>
    );
}

function SummaryCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
    return (
        <article className="min-w-0 rounded-2xl border border-[#212a3b]/10 bg-white p-4 shadow-soft-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[#3d485e]">{label}</p>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff6e5] text-[#663820]">{icon}</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-[#212a3b] sm:text-3xl">{value}</p>
            <p className="mt-1 break-words text-xs leading-5 text-[#3d485e]">{detail}</p>
        </article>
    );
}

function MiniStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
    return (
        <div className="min-w-0 rounded-xl bg-[#f8f4e9] p-3">
            <p className="text-xs font-medium text-[#3d485e]">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[#212a3b]">{value}</p>
            {detail && <p className="mt-1 break-words text-xs leading-5 text-[#3d485e]">{detail}</p>}
        </div>
    );
}

function topicTone(classification: TopicProgress["classification"]) {
    if (classification === "strong") return "bg-emerald-50 text-emerald-800";
    if (classification === "needs_improvement") return "bg-amber-50 text-amber-900";
    if (classification === "developing") return "bg-blue-50 text-blue-800";
    return "bg-slate-100 text-slate-700";
}

function trendLabel(direction: CourseProgress["performanceTrend"]["direction"]) {
    if (direction === "improving") return "Your average is improving";
    if (direction === "declining") return "Recent average is lower";
    return "Performance is relatively stable";
}

function StudyFeedback({ course }: { course: CourseProgress }) {
    const feedback: string[] = [];
    const weakTopic = course.topics.find((topic) => topic.classification === "needs_improvement");
    const strongTopic = course.topics.find((topic) => topic.classification === "strong");
    if (weakTopic) {
        feedback.push(
            `Your results suggest ${weakTopic.name} could use more practice (${formatPercent(weakTopic.accuracyPercent)} across ${weakTopic.questionsAttempted} graded answers).`,
        );
    } else if (strongTopic) {
        feedback.push(
            `You are performing well in ${strongTopic.name} (${formatPercent(strongTopic.accuracyPercent)} across ${strongTopic.questionsAttempted} graded answers).`,
        );
    }
    if (course.performanceTrend.direction === "improving") {
        feedback.push(
            `Your recent quiz average is up ${course.performanceTrend.differencePercentagePoints} percentage points compared with earlier attempts.`,
        );
    }
    const difficultReviews = course.reviewRatingsLast30Days.again + course.reviewRatingsLast30Days.hard;
    if (difficultReviews >= 3) {
        feedback.push(
            `${difficultReviews} flashcard reviews were rated Again or Hard in the last 30 days. Consider revisiting those cards.`,
        );
    }
    if (feedback.length === 0) return null;

    return (
        <aside aria-label={`Study feedback for ${course.name}`} className="rounded-xl border border-[#d4a853]/40 bg-[#fff9eb] p-4">
            <p className="mb-2 text-sm font-semibold text-[#663820]">Study notes</p>
            <ul className="space-y-1.5 text-sm leading-6 text-[#3d485e]">
                {feedback.map((message) => <li key={message}>{message}</li>)}
            </ul>
        </aside>
    );
}
