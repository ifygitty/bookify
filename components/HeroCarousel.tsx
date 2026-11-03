"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, ChevronLeft, ChevronRight, Sparkles, Target } from "lucide-react";
import { CagePattern, ConcentricCircles, FlowingCurves, GlowOrb, OrbitalRings } from "@/components/LandingDecor";

const SLIDES = [
    {
        src: "/assets/Slide-1.jpg",
        alt: "A university student writing notes at a library desk surrounded by books",
        position: "62% 30%",
        eyebrow: "All your materials",
        title: "Your Learning, Organised.",
        description: "Bring all your course materials into one intelligent learning space.",
    },
    {
        src: "/assets/Slide-2.jpg",
        alt: "A study workspace with notes, a tablet, flashcards and a laptop",
        position: "50% 40%",
        eyebrow: "Mentor AI",
        title: "Understand More. Learn Better.",
        description: "Ask questions, explore difficult topics and practise with your personal AI study companion.",
    },
    {
        src: "/assets/Slide-3.jpg",
        alt: "A student planning revision with notebooks, a calendar and a laptop",
        position: "50% 35%",
        eyebrow: "Revision planner",
        title: "Prepare With Confidence.",
        description: "Track your progress, strengthen weak topics and stay ahead of your exams.",
    },
] as const;

const AUTOPLAY_MS = 5500;
const RESUME_AFTER_MS = 10000;

export default function HeroCarousel({ ctaLabel, ctaHref }: { ctaLabel: string; ctaHref: string }) {
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartX = useRef<number | null>(null);

    useEffect(() => {
        if (paused) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const timer = setInterval(() => setIndex((current) => (current + 1) % SLIDES.length), AUTOPLAY_MS);
        return () => clearInterval(timer);
    }, [paused]);

    useEffect(() => () => {
        if (resumeTimer.current) clearTimeout(resumeTimer.current);
    }, []);

    // Manual navigation pauses autoplay, then hands control back after a while.
    const interact = useCallback((next: number) => {
        setIndex((next + SLIDES.length) % SLIDES.length);
        setPaused(true);
        if (resumeTimer.current) clearTimeout(resumeTimer.current);
        resumeTimer.current = setTimeout(() => setPaused(false), RESUME_AFTER_MS);
    }, []);

    return (
        <div
            role="region"
            aria-roledescription="carousel"
            aria-label="Mentor highlights"
            className="border-light relative rounded-3xl"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
            onTouchEnd={(event) => {
                const start = touchStartX.current;
                touchStartX.current = null;
                const end = event.changedTouches[0]?.clientX;
                if (start === null || end === undefined || Math.abs(end - start) < 50) return;
                interact(index + (end < start ? 1 : -1));
            }}
        >
            <div className="relative h-[34rem] overflow-hidden rounded-3xl bg-[var(--navy-800)] sm:h-[36rem] lg:h-[40rem]">
                {SLIDES.map((slide, i) => {
                    const Heading = i === 0 ? "h1" : "h2";
                    return (
                        <div
                            key={slide.src}
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`${i + 1} of ${SLIDES.length}`}
                            aria-hidden={i !== index}
                            data-active={i === index}
                            data-before={i < index}
                            className="slide"
                        >
                            <Image
                                src={slide.src}
                                alt={slide.alt}
                                fill
                                priority={i === 0}
                                sizes="(min-width: 1280px) 1216px, 100vw"
                                style={{ objectPosition: slide.position }}
                                className="object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[var(--navy-900)]/70 via-[var(--navy-900)]/20 to-transparent lg:bg-gradient-to-r lg:via-[var(--navy-900)]/15 lg:to-transparent" />
                            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(23,107,67,0.25),transparent_55%)]" />

                            {i === 0 && (
                                <>
                                    <ConcentricCircles className="-right-24 -top-24 size-[22rem] sm:-right-32 sm:-top-32 sm:size-[30rem]" />
                                    <CagePattern className="inset-y-0 right-0 hidden h-full w-1/2 opacity-70 lg:block" />
                                </>
                            )}
                            {i === 1 && <OrbitalRings className="-right-20 -top-16 size-[22rem] sm:size-[28rem]" />}
                            {i === 2 && (
                                <>
                                    <FlowingCurves className="inset-x-0 bottom-0 h-40 w-full opacity-80" />
                                    <GlowOrb gold className="-right-10 top-10 size-64" />
                                </>
                            )}

                            <div className="relative z-10 flex h-full items-end p-4 sm:p-8 lg:items-center lg:p-14">
                                <div className={`glass glass-green w-full max-w-xl rounded-2xl p-5 sm:p-7 ${i === index ? "hero-enter" : ""}`}>
                                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
                                        <Sparkles className="size-3.5" />
                                        {slide.eyebrow}
                                    </p>
                                    {/* <Heading className="mt-3 text-balance text-3xl font-extrabold leading-tight text-[var(--ink)] sm:text-4xl lg:text-5xl">
                                        {slide.title}
                                    </Heading> */}
                                    <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)] sm:text-base sm:leading-7">{slide.description}</p>
                                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                        <Link
                                            href={ctaHref}
                                            tabIndex={i === index ? 0 : -1}
                                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--gold)] px-6 py-3 text-sm font-bold text-[var(--navy-900)] shadow-lg transition-colors hover:bg-[var(--gold-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
                                        >
                                            {ctaLabel}
                                            <ArrowRight className="size-4" />
                                        </Link>
                                        <Link
                                            href="/#features"
                                            tabIndex={i === index ? 0 : -1}
                                            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--glass-border)] px-6 py-3 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--navy-600)]"
                                        >
                                            Explore features
                                        </Link>
                                    </div>
                                </div>
                            </div>

                            {i === 1 && (
                                <div aria-hidden="true" className="glass absolute bottom-10 right-10 z-10 hidden w-72 rounded-2xl p-4 lg:block">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--gold)]">Mentor AI · sample</p>
                                    <p className="mt-3 rounded-xl bg-[var(--navy-600)] px-3 py-2 text-xs text-[var(--ink)]">Explain the straight-line method.</p>
                                    <p className="mt-2 rounded-xl border border-[var(--glass-border)] px-3 py-2 text-xs leading-5 text-[var(--ink-soft)]">
                                        An explanation grounded in the course materials you select.
                                    </p>
                                </div>
                            )}
                            {i === 2 && (
                                <div aria-hidden="true" className="glass glass-gold absolute right-10 top-24 z-10 hidden w-64 rounded-2xl p-4 lg:block">
                                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-gold)]">
                                        <Target className="size-3.5" /> Progress · sample
                                    </p>
                                    <div className="mt-3 space-y-2.5">
                                        {[["Strong topics", "w-4/5"], ["Needs practice", "w-2/5"], ["Revision plan", "w-3/5"]].map(([label, width]) => (
                                            <div key={label}>
                                                <p className="mb-1 flex items-center gap-1.5 text-xs text-[var(--ink)]"><BookOpenCheck className="size-3" />{label}</p>
                                                <div className="h-1.5 rounded-full bg-[var(--navy-600)]"><div className={`h-full rounded-full bg-[var(--gold)] ${width}`} /></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                <div className="absolute right-4 top-4 z-20 flex gap-2 sm:right-6 sm:top-6">
                    <button type="button" onClick={() => interact(index - 1)} aria-label="Previous slide" className="glass grid size-11 place-items-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--navy-600)]">
                        <ChevronLeft className="size-5" />
                    </button>
                    <button type="button" onClick={() => interact(index + 1)} aria-label="Next slide" className="glass grid size-11 place-items-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--navy-600)]">
                        <ChevronRight className="size-5" />
                    </button>
                </div>
                <div className="absolute left-4 top-4 z-20 flex gap-1 sm:left-6 sm:top-6" role="tablist" aria-label="Choose slide">
                    {SLIDES.map((slide, i) => (
                        <button
                            key={slide.title}
                            type="button"
                            role="tab"
                            aria-selected={i === index}
                            aria-label={`Go to slide ${i + 1}: ${slide.title}`}
                            onClick={() => interact(i)}
                            className="grid h-11 w-9 place-items-center"
                        >
                            <span className={`h-1.5 rounded-full transition-all ${i === index ? "w-7 bg-[var(--gold)]" : "w-3 bg-[var(--ink-soft)]/60"}`} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
