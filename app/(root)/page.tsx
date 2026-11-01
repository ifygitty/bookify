import Link from "next/link";
import {
    ArrowRight,
    BarChart3,
    BookOpen,
    BookOpenCheck,
    BrainCircuit,
    CalendarDays,
    Layers3,
    ListChecks,
} from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/database/mongoose";
import Course from "@/database/models/course.model";
import Image from "next/image";
import LandingReveal from "@/components/LandingReveal";
import "@/components/landing-page-effects.css";

const features = [
    {
        icon: Layers3,
        title: "Organised course library",
        description:
            "Keep PDFs, Word documents and spreadsheets together by course.",
    },
    {
        icon: BrainCircuit,
        title: "AI study companion",
        description:
            "Ask questions about your materials and get explanations grounded in your course content.",
    },
    {
        icon: BookOpenCheck,
        title: "AI practice questions",
        description:
            "Generate questions and interactive quizzes from your learning materials.",
    },
    {
        icon: BookOpen,
        title: "Smart flashcards",
        description:
            "Review key ideas with flashcards and spaced repetition.",
    },
    {
        icon: ListChecks,
        title: "Course topic breakdown",
        description:
            "Organise course materials into topics and monitor your coverage.",
    },
    {
        icon: BarChart3,
        title: "Study progress",
        description:
            "Monitor performance, identify weak topics and see where to practise.",
    },
    {
        icon: CalendarDays,
        title: "Personalised revision planner",
        description:
            "Plan study sessions around your exam date, available time and priorities.",
    },
];

const steps = [
    {
        number: "01",
        title: "Create a course",
        description: "Start with a subject such as ACC 101 or another course you are taking.",
    },
    {
        number: "02",
        title: "Add your materials",
        description: "Bring your course documents together and choose what you are studying.",
    },
    {
        number: "03",
        title: "Study actively",
        description: "Ask questions, practise, review flashcards, and track your progress.",
    },
];

export default async function HomePage() {
    const { userId } = await auth();
    let hasUsedMentor = false;
    if (userId) {
        await connectToDatabase();
        hasUsedMentor = Boolean(await Course.exists({ clerkId: userId }));
    }

    const primaryCtaLabel = userId
        ? hasUsedMentor
            ? "Continue Learning"
            : "Start Learning"
        : "Start Learning";
    const primaryCtaHref = userId ? "/courses" : "/sign-up";

    return (
        <main className="min-h-screen overflow-hidden">
            <section
                id="top"
                className="wrapper relative flex min-h-[calc(100svh-var(--navbar-height))] flex-col justify-center pb-20 pt-[calc(var(--navbar-height)+3rem)]"
            >
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-36 top-36 size-96 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.12),transparent_68%)]"
                />
                <LandingReveal className="landing-reveal relative grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
                    <div className="max-w-3xl">
                        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--navy-border)] bg-[var(--navy-800)] px-4 py-2 text-sm font-medium text-[var(--gold)]">
                            A study space built around your courses
                        </p>
                        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[var(--ink)] sm:text-5xl lg:text-6xl">
                            Study smarter. Understand better. Achieve more.
                        </h1>
                        <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--ink-soft)]">
                            Your personal AI study companion. Bring your course materials
                            together, understand difficult topics, practise with intelligent
                            quizzes, master flashcards and stay on track with a personalised
                            study plan.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Link
                                href={primaryCtaHref}
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--gold)] px-6 py-3 font-semibold text-[var(--navy-900)] transition-colors hover:bg-[var(--gold-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
                            >
                                {primaryCtaLabel}
                                <ArrowRight className="size-4" />
                            </Link>
                            <Link
                                href="#features"
                                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--navy-border)] px-6 py-3 font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--navy-800)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
                            >
                                Explore features
                            </Link>
                        </div>
                        <p className="mt-5 text-sm text-[var(--ink-soft)]">
                            Your materials, conversations, and revision tools in one place.
                        </p>
                    </div>

                    <div
                        role="group"
                        aria-label="Mentor study tools"
                        className="relative mx-auto w-full max-w-lg rounded-3xl border border-[var(--navy-border)] bg-[linear-gradient(145deg,var(--navy-700),var(--navy-800))] p-5 shadow-[var(--shadow-soft-lg)] sm:p-7"
                    >
                        <div className="mb-6 flex items-center justify-between border-b border-[var(--navy-border)] pb-5">
                            <div>
                                <p className="text-sm font-medium text-[var(--ink-soft)]">
                                    Your study space
                                </p>
                                <p className="mt-1 text-xl font-semibold text-[var(--ink)]">
                                    Learn with purpose
                                </p>
                            </div>
                            <div className="grid size-12 place-items-center rounded-2xl bg-[rgba(212,175,55,0.12)] text-[var(--gold)]">
                                <BookOpenCheck className="size-6" />
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[var(--navy-border)] bg-[var(--navy-900)]/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gold)]">Course materials</p>
                                <p className="mt-3 text-sm font-medium text-[var(--ink)]">Financial Reporting</p>
                                <p className="mt-1 text-xs text-[var(--ink-soft)]">Lecture notes.pdf · IAS 16 guide.pdf</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--navy-border)] bg-[var(--navy-900)]/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gold)]">Mentor AI</p>
                                <p className="mt-3 text-sm text-[var(--ink-soft)]">“Explain the straight-line method.”</p>
                                <p className="mt-1 text-xs leading-5 text-[var(--ink)]">An explanation grounded in the selected course materials.</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--navy-border)] bg-[var(--navy-900)]/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gold)]">Practice</p>
                                <p className="mt-3 text-sm text-[var(--ink)]">Questions and flashcards</p>
                                <p className="mt-1 text-xs text-[var(--ink-soft)]">Review key ideas at your pace.</p>
                            </div>
                            <div className="rounded-2xl border border-[var(--navy-border)] bg-[var(--navy-900)]/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gold)]">Study plan</p>
                                <p className="mt-3 text-sm text-[var(--ink)]">Topics and revision sessions</p>
                                <p className="mt-1 text-xs text-[var(--ink-soft)]">Track your progress and priorities.</p>
                            </div>
                        </div>
                        <p className="mt-5 text-center text-xs text-[var(--ink-soft)]">
                            Sample course workspace preview
                        </p>
                    </div>
                </LandingReveal>
            </section>

            <section id="features" className="scroll-mt-[var(--navbar-height)] border-y border-[var(--navy-border)] bg-[var(--navy-800)]/70">
                <LandingReveal className="landing-reveal wrapper py-20 sm:py-24">
                    <div className="mx-auto max-w-2xl text-center">
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
                            Study tools that work together
                        </p>
                        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
                            One place for your study routine
                        </h2>
                        <p className="mt-4 leading-7 text-[var(--ink-soft)]">
                            Move from understanding your materials to practising and
                            revising, with your courses as the starting point.
                        </p>
                    </div>
                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {features.map(({ icon: Icon, title, description }) => (
                            <article
                                key={title}
                                className="landing-feature-card rounded-2xl border border-[var(--navy-border)] bg-[var(--navy-900)] p-6"
                            >
                                <div className="mb-5 grid size-11 place-items-center rounded-xl bg-[rgba(212,175,55,0.12)] text-[var(--gold)]">
                                    <Icon className="size-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-[var(--ink)]">{title}</h3>
                                <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                                    {description}
                                </p>
                            </article>
                        ))}
                    </div>
                </LandingReveal>
            </section>

            <section id="how-it-works" className="scroll-mt-[var(--navbar-height)]">
                <LandingReveal className="landing-reveal wrapper grid gap-10 py-20 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
                    <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
                            Getting started
                        </p>
                        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
                            A simple way to begin
                        </h2>
                        <p className="mt-4 leading-7 text-[var(--ink-soft)]">
                            Build a study routine around the subjects and materials you
                            already use.
                        </p>
                    </div>
                    <ol className="space-y-4">
                        {steps.map(({ number, title, description }) => (
                            <li
                                key={number}
                                className="flex gap-5 rounded-2xl border border-[var(--navy-border)] bg-[var(--navy-800)]/60 p-5 sm:p-6"
                            >
                                <span className="pt-1 text-sm font-semibold text-[var(--gold)]">
                                    {number}
                                </span>
                                <div>
                                    <h3 className="text-lg font-semibold text-[var(--ink)]">
                                        {title}
                                    </h3>
                                    <p className="mt-1 leading-6 text-[var(--ink-soft)]">
                                        {description}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </LandingReveal>
            </section>

            <section id="testimonials" className="scroll-mt-[var(--navbar-height)] border-y border-[var(--navy-border)] bg-[var(--navy-800)]/50">
                <LandingReveal className="landing-reveal wrapper py-16 text-center sm:py-20">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
                        Student feedback
                    </p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
                        Built to support your study routine
                    </h2>
                    <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-[var(--navy-border)] bg-[var(--navy-900)] p-6 sm:p-8">
                        <p className="text-lg leading-8 text-[var(--ink-soft)]">
                            Student testimonials will appear here once verified feedback is available.
                        </p>
                        <p className="mt-4 text-sm font-semibold text-[var(--gold)]">
                            Student testimonial
                        </p>
                    </div>
                </LandingReveal>
            </section>

            <section className="wrapper pb-20 sm:pb-24">
                <LandingReveal className="landing-reveal">
                <div className="rounded-3xl border border-[var(--navy-border)] bg-[linear-gradient(120deg,var(--navy-700),var(--navy-800))] px-6 py-10 text-center sm:px-10 sm:py-14">
                    <h2 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">
                        Your next academic breakthrough starts here.
                    </h2>
                    <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--ink-soft)]">
                        Set up your study space and bring your learning materials together.
                    </p>
                    <div className="mt-7 flex justify-center">
                        <Link
                            href={primaryCtaHref}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--gold)] px-6 py-3 font-semibold text-[var(--navy-900)] transition-colors hover:bg-[var(--gold-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
                        >
                            {primaryCtaLabel}
                            <ArrowRight className="size-4" />
                        </Link>
                    </div>
                </div>
                </LandingReveal>
            </section>

            <footer className="border-t border-[var(--navy-border)] bg-[var(--navy-800)]">
                <div className="wrapper flex flex-col gap-8 py-10 sm:flex-row sm:items-center sm:justify-between">
                    <div className="max-w-md">
                        <Link href="/" aria-label="Mentor home" className="relative mb-3 block h-12 w-44 overflow-hidden">
                            <Image
                                src="/assets/Mainlogo.png"
                                alt="Mentor"
                                width={1920}
                                height={1080}
                                className="h-full w-full object-contain"
                            />
                        </Link>
                        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                            Your personal AI study companion for understanding course materials, practising and staying on track.
                        </p>
                    </div>
                    <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-[var(--ink-soft)]">
                        <Link href="/" className="hover:text-[var(--gold)]">Home</Link>
                        <Link href="/#features" className="hover:text-[var(--gold)]">Features</Link>
                        <Link href="/#how-it-works" className="hover:text-[var(--gold)]">How it works</Link>
                        <Link href="/#testimonials" className="hover:text-[var(--gold)]">Testimonials</Link>
                        {userId ? (
                            <Link href="/courses" className="hover:text-[var(--gold)]">My courses</Link>
                        ) : (
                            <Link href="/sign-in" className="hover:text-[var(--gold)]">Sign in</Link>
                        )}
                    </nav>
                </div>
                <div className="border-t border-[var(--navy-border)]">
                    <p className="wrapper py-4 text-xs text-[var(--ink-soft)]">
                        © {new Date().getFullYear()} Mentor
                    </p>
                </div>
            </footer>
        </main>
    );
}
