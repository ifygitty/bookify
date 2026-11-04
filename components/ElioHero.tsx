import Link from "next/link";
import { ArrowRight, BrainCircuit } from "lucide-react";
import "./elio-hero.css";

type Props = {
    ctaLabel: string;
    ctaHref: string;
};

export default function ElioHero({ ctaLabel, ctaHref }: Props) {
    return (
        <section className="ehero" aria-labelledby="elio-hero-title">
            <div className="ehero-stage" aria-hidden="true">
                <span className="ehero-orbit ehero-orbit-one" />
                <span className="ehero-orbit ehero-orbit-two" />
                <span className="ehero-orbit ehero-orbit-three" />
            </div>

            <div className="ehero-copy">
                <p className="ehero-eyebrow">
                    <BrainCircuit aria-hidden="true" className="size-3.5" />
                    A brighter way to study
                </p>
                <h1 id="elio-hero-title">
                    Everything you need to <em>master</em> your studies.
                </h1>
                <p className="ehero-description">
                    Bring your course materials together, learn with AI, practise with personalised questions and prepare for your exams with confidence.
                </p>
                <div className="ehero-actions">
                    <Link href={ctaHref} className="ehero-button ehero-button-primary">
                        {ctaLabel}
                        <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                    <Link href="/#features" className="ehero-button ehero-button-secondary">
                        Explore features
                    </Link>
                </div>
            </div>
        </section>
    );
}
