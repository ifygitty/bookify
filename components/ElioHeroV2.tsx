import Link from "next/link";
import { ArrowRight, BookOpenCheck, BrainCircuit, CalendarDays, ListChecks } from "lucide-react";
import "./elio-hero-v2.css";

type Props = {
    ctaLabel: string;
    ctaHref: string;
};

const leftBlocks = [
    { icon: BookOpenCheck, title: "Your course space", text: "Everything in one place" },
    { icon: BrainCircuit, title: "Elio AI tutor", text: "Answers from your materials" },
];

const rightBlocks = [
    { icon: ListChecks, title: "Personalised practice", text: "Quizzes and flashcards" },
    { icon: CalendarDays, title: "Ready for exam day", text: "A revision plan that fits" },
];

function Blocks({ items, side }: { items: typeof leftBlocks; side: "left" | "right" }) {
    return (
        <div className={`ehv2-side ehv2-side-${side}`}>
            {items.map(({ icon: Icon, title, text }, index) => (
                <div key={title} className={`ehv2-block ehv2-block-${side}-${index + 1}`}>
                    <span className="ehv2-block-icon"><Icon aria-hidden="true" className="size-4" /></span>
                    <span><strong>{title}</strong><small>{text}</small></span>
                </div>
            ))}
        </div>
    );
}

export default function ElioHeroV2({ ctaLabel, ctaHref }: Props) {
    return (
        <section className="ehv2" aria-labelledby="elio-hero-title">
            <div className="ehv2-stage" aria-hidden="true">
                <span className="ehv2-orbit ehv2-orbit-one" />
                <span className="ehv2-orbit ehv2-orbit-two" />
                <span className="ehv2-orbit ehv2-orbit-three" />
            </div>

            <Blocks items={leftBlocks} side="left" />

            <div className="ehv2-copy">
                <h1 id="elio-hero-title">
                    Everything you need to <em>master</em> your studies.
                </h1>
                <p className="ehv2-description">
                    Bring your course materials together, learn with AI, practise with personalised questions and prepare for your exams with confidence.
                </p>
                <div className="ehv2-actions">
                    <Link href={ctaHref} className="ehv2-button ehv2-button-primary">
                        {ctaLabel}
                        <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                    <Link href="/#features" className="ehv2-button ehv2-button-secondary">
                        Explore features
                    </Link>
                </div>
            </div>

            <Blocks items={rightBlocks} side="right" />
        </section>
    );
}
