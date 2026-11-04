import { BarChart3, BookOpen, BrainCircuit, CalendarDays, FileText, Layers3, ListChecks } from "lucide-react";
import { CagePattern, GlowOrb, OrbitalRings } from "@/components/LandingDecor";

const courseItems = [
    { icon: Layers3, label: "Course library" },
    { icon: FileText, label: "Materials" },
    { icon: BrainCircuit, label: "Elio AI" },
    { icon: ListChecks, label: "Practice quiz" },
    { icon: BookOpen, label: "Flashcards" },
    { icon: BarChart3, label: "Study progress" },
];

// Static, illustrative preview. It intentionally contains no real or fabricated statistics.
export default function ProductPreview({ large = false }: { large?: boolean }) {
    return (
        <div className="relative mx-auto w-full max-w-5xl">
            <CagePattern className="-inset-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)] opacity-60" />
            <GlowOrb className="-left-10 top-10 size-72" />
            {large && <OrbitalRings className="-right-24 -top-24 hidden size-[26rem] md:block" />}

            <div className="glass border-light relative z-10 overflow-hidden rounded-3xl">
                <div className="flex items-center gap-2 border-b border-[var(--glass-border)] px-4 py-3">
                    <span className="size-2.5 rounded-full bg-[var(--ink-soft)]/50" />
                    <span className="size-2.5 rounded-full bg-[var(--ink-soft)]/50" />
                    <span className="size-2.5 rounded-full bg-[var(--gold)]" />
                    <p className="ml-2 truncate text-xs text-[var(--ink-soft)]">Elio · Sample course workspace</p>
                </div>
                <div className="grid md:grid-cols-[11rem_1fr] lg:grid-cols-[11rem_1fr_15rem]">
                    <nav aria-label="Sample workspace navigation" className="hidden border-r border-[var(--glass-border)] p-3 md:block">
                        {courseItems.map(({ icon: Icon, label }, i) => (
                            <p key={label} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium ${i === 2 ? "bg-[var(--gold)]/15 text-[var(--gold)]" : "text-[var(--ink-soft)]"}`}>
                                <Icon className="size-3.5" />
                                {label}
                            </p>
                        ))}
                    </nav>

                    <div className="space-y-3 p-4 sm:p-5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--gold)]">Elio AI conversation</p>
                        <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[var(--navy-600)] px-4 py-2.5 text-sm text-[var(--ink)]">
                            Explain the straight-line method using my selected materials.
                        </p>
                        <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-[var(--glass-border)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">
                            <p className="font-semibold text-[var(--ink)]">Straight-line depreciation</p>
                            <p className="mt-1">Elio AI explains the idea step by step, with worked examples and a source reference from the materials you chose.</p>
                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--gold)]/10 px-2 py-1 text-xs text-[var(--gold)]">
                                <FileText className="size-3" /> Source: your course material
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
                            <QuizCard />
                            <FlashcardCard />
                        </div>
                    </div>

                    <aside className="hidden space-y-3 border-l border-[var(--glass-border)] p-4 lg:block">
                        <QuizCard />
                        <FlashcardCard />
                        <div className="rounded-xl border border-[var(--glass-border)] p-3">
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)]"><CalendarDays className="size-3.5 text-[var(--gold)]" />Study progress</p>
                            <div className="mt-2 h-1.5 rounded-full bg-[var(--navy-600)]"><div className="h-full w-1/2 rounded-full bg-[var(--gold)]" /></div>
                            <p className="mt-1.5 text-[11px] text-[var(--ink-soft)]">Illustrative only</p>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}

function QuizCard() {
    return (
        <div className="rounded-xl border border-[var(--glass-border)] p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)]"><ListChecks className="size-3.5 text-[var(--gold)]" />Practice quiz</p>
            <p className="mt-1.5 text-xs leading-5 text-[var(--ink-soft)]">Questions generated from your materials.</p>
        </div>
    );
}

function FlashcardCard() {
    return (
        <div className="rounded-xl border border-[var(--accent-gold)]/40 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink)]"><BookOpen className="size-3.5 text-[var(--accent-gold)]" />Flashcard</p>
            <p className="mt-1.5 text-xs leading-5 text-[var(--ink-soft)]">Review key ideas at your own pace.</p>
        </div>
    );
}
