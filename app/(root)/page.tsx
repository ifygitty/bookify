import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowRight, BarChart3, BookOpenCheck, BrainCircuit, CalendarDays, FileText, Layers3, ListChecks, MessageSquareQuote, UploadCloud } from "lucide-react";
import "@/components/landing.css";
import HeroCarousel from "@/components/HeroCarousel";
import LandingReveal from "@/components/LandingReveal";
import ProductPreview from "@/components/ProductPreview";
import { CagePattern, ConcentricCircles, FlowingCurves, GlowOrb, OrbitalRings } from "@/components/LandingDecor";
import { connectToDatabase } from "@/database/mongoose";
import Course from "@/database/models/course.model";

const features = [
    { icon: Layers3, title: "Organised course library", text: "Keep every course and its materials in one tidy place." },
    { icon: FileText, title: "Multi-material learning", text: "Choose which materials Mentor uses to answer you." },
    { icon: BrainCircuit, title: "Mentor AI tutor", text: "Ask questions and get explanations grounded in your materials." },
    { icon: ListChecks, title: "Quizzes and practice", text: "Generate practice questions to test your understanding." },
    { icon: BookOpenCheck, title: "Flashcards", text: "Turn key ideas into cards and review them regularly." },
    { icon: CalendarDays, title: "Revision planner", text: "Build a schedule around your topics and exam date." },
    { icon: BarChart3, title: "Study progress", text: "See strengths and weak topics so you know where to focus." },
];

const steps = [
    { icon: UploadCloud, title: "Upload your materials", text: "Add your study texts and notes to a course." },
    { icon: BrainCircuit, title: "Learn with Mentor", text: "Chat, practise with quizzes and review flashcards." },
    { icon: CalendarDays, title: "Revise with a plan", text: "Follow a revision plan built from your topics." },
];

export default async function Page() {
    const { userId } = await auth();
    let hasUsedMentor = false;
    if (userId) {
        await connectToDatabase();
        hasUsedMentor = Boolean(await Course.exists({ clerkId: userId }));
    }
    const ctaLabel = userId && hasUsedMentor ? "Continue Learning" : "Start Learning";
    const ctaHref = userId ? "/courses" : "/sign-up";
    const year = new Date().getFullYear();

    return (
        <main id="top" className="landing-root relative overflow-x-clip text-[var(--ink)]">
            <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 sm:pt-28 lg:px-8">
                <HeroCarousel ctaLabel={ctaLabel} ctaHref={ctaHref} />
            </section>

            <section className="relative px-4 py-16 sm:px-6 lg:px-8">
                <LandingReveal className="landing-reveal">
                    <div className="mx-auto mb-10 max-w-2xl text-center">
                        <h2 className="text-3xl font-extrabold sm:text-4xl">Everything in one study workspace</h2>
                        <p className="mt-3 text-[var(--ink-soft)]">A look at how Mentor brings your courses, AI tutor and practice together.</p>
                    </div>
                    <ProductPreview />
                </LandingReveal>
            </section>

            <section id="features" className="relative scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8">
                <CagePattern className="inset-0 h-full w-full opacity-40" />
                <div className="relative mx-auto max-w-7xl">
                    <LandingReveal className="landing-reveal mb-10 max-w-2xl">
                        <h2 className="text-3xl font-extrabold sm:text-4xl">Features built for serious study</h2>
                        <p className="mt-3 text-[var(--ink-soft)]">Everything you need to understand, practise and revise.</p>
                    </LandingReveal>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {features.map(({ icon: Icon, title, text }, i) => (
                            <LandingReveal key={title} className="landing-reveal">
                                <article className={`glass landing-card h-full rounded-2xl p-6 ${i === 2 || i === 5 ? "border-light" : ""}`}>
                                    <span className="grid size-11 place-items-center rounded-xl bg-[var(--gold)]/15 text-[var(--gold)]"><Icon className="size-5" /></span>
                                    <h3 className="mt-4 text-lg font-bold">{title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{text}</p>
                                </article>
                            </LandingReveal>
                        ))}
                    </div>
                </div>
            </section>

            <section id="how-it-works" className="relative scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8">
                <FlowingCurves className="inset-x-0 top-0 h-48 w-full opacity-60" />
                <div className="relative mx-auto max-w-6xl">
                    <LandingReveal className="landing-reveal mb-10 text-center">
                        <h2 className="text-3xl font-extrabold sm:text-4xl">How Mentor Works</h2>
                    </LandingReveal>
                    <ol className="grid gap-4 md:grid-cols-3">
                        {steps.map(({ icon: Icon, title, text }, i) => (
                            <li key={title}>
                                <LandingReveal className="landing-reveal h-full">
                                    <div className="glass landing-card h-full rounded-2xl p-6">
                                        <div className="flex items-center gap-3">
                                            <span className="grid size-9 place-items-center rounded-full bg-[var(--gold)] text-sm font-bold text-[var(--navy-900)]">{i + 1}</span>
                                            <Icon className="size-5 text-[var(--gold)]" />
                                        </div>
                                        <h3 className="mt-4 text-lg font-bold">{title}</h3>
                                        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{text}</p>
                                    </div>
                                </LandingReveal>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section className="relative px-4 py-16 sm:px-6 lg:px-8">
                <OrbitalRings className="-left-32 top-0 size-[28rem] opacity-60" />
                <LandingReveal className="landing-reveal relative mx-auto max-w-6xl">
                    <div className="glass glass-green border-light grid items-center gap-8 rounded-3xl p-6 sm:p-10 lg:grid-cols-2">
                        <div>
                            <h2 className="text-3xl font-extrabold sm:text-4xl">Study with sources you trust</h2>
                            <p className="mt-3 leading-7 text-[var(--ink-soft)]">
                                Mentor answers from the materials you select, so explanations, quizzes and revision plans stay relevant to your syllabus.
                            </p>
                        </div>
                        <ProductPreview />
                    </div>
                </LandingReveal>
            </section>

            <section id="testimonials" className="relative scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8">
                <ConcentricCircles className="-right-40 top-0 size-[30rem] opacity-50" />
                <div className="relative mx-auto max-w-6xl">
                    <LandingReveal className="landing-reveal mb-10 text-center">
                        <h2 className="text-3xl font-extrabold sm:text-4xl">What students will say</h2>
                        <p className="mt-3 text-[var(--ink-soft)]">Placeholder cards. Real student feedback will appear here.</p>
                    </LandingReveal>
                    <div className="grid gap-4 md:grid-cols-3">
                        {[1, 2, 3].map((n) => (
                            <LandingReveal key={n} className="landing-reveal">
                                <figure className="glass h-full rounded-2xl border-dashed p-6">
                                    <MessageSquareQuote className="size-6 text-[var(--gold)]" />
                                    <blockquote className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">Testimonial placeholder. No real review has been added yet.</blockquote>
                                    <figcaption className="mt-4 text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]">Placeholder {n}</figcaption>
                                </figure>
                            </LandingReveal>
                        ))}
                    </div>
                </div>
            </section>

            <section className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
                <ConcentricCircles className="-bottom-40 left-1/2 size-[40rem] -translate-x-1/2" />
                <GlowOrb gold className="-right-10 top-0 size-72" />
                <LandingReveal className="landing-reveal relative mx-auto max-w-3xl">
                    <div className="glass border-light rounded-3xl p-8 text-center sm:p-12">
                        <h2 className="text-balance text-3xl font-extrabold sm:text-4xl">Your Next Academic Breakthrough Starts Here.</h2>
                        <Link href={ctaHref} className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--gold)] px-7 py-3 font-bold text-[var(--navy-900)] transition-colors hover:bg-[var(--gold-hover)]">
                            {ctaLabel}
                            <ArrowRight className="size-4" />
                        </Link>
                    </div>
                </LandingReveal>
            </section>

            <footer className="border-t border-[var(--glass-border)] px-4 py-10 sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        <Image src="/assets/Mainlogo.png" alt="Mentor" width={120} height={68} className="h-10 w-auto" />
                        <p className="max-w-xs text-sm text-[var(--ink-soft)]">Your personal AI study companion.</p>
                    </div>
                    <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ink-soft)]">
                        <Link href="/#features" className="hover:text-[var(--ink)]">Features</Link>
                        <Link href="/#how-it-works" className="hover:text-[var(--ink)]">How It Works</Link>
                        <Link href="/#testimonials" className="hover:text-[var(--ink)]">Testimonials</Link>
                        <Link href={userId ? "/courses" : "/sign-in"} className="hover:text-[var(--ink)]">{userId ? "My courses" : "Sign In"}</Link>
                    </nav>
                </div>
                <p className="mx-auto mt-6 max-w-7xl text-xs text-[var(--ink-soft)]">© {year} Mentor. All rights reserved.</p>
            </footer>
        </main>
    );
}
