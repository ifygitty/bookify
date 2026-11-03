import { redirect } from "next/navigation";

import "@/components/landing.css";
import "@/components/mentor-ui.css";
import "@/components/admin/admin.css";
import { ConcentricCircles, FlowingCurves, GlowOrb, OrbitalRings } from "@/components/LandingDecor";
import ProfileNameForm from "@/components/ProfileNameForm";
import { StatCard } from "@/components/admin/widgets";
import { formatCompact, formatCost, formatDate, formatDuration, formatNumber } from "@/lib/admin-format";
import { getUserDetail } from "@/lib/admin-analytics.server";
import { ensureCurrentUser } from "@/lib/users.server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
    const user = await ensureCurrentUser();
    if (!user) redirect("/sign-in");
    const detail = await getUserDetail(String(user._id));
    if (!detail) redirect("/courses");

    return (
        <main className="mentor-page wrapper !max-w-none !px-0 !pb-16 !pt-28 sm:!pt-32">
            <ConcentricCircles className="-right-40 -top-32 size-[30rem] opacity-60" />
            <FlowingCurves className="inset-x-0 top-24 h-56 w-full opacity-50" />
            <OrbitalRings className="-left-48 bottom-10 size-[28rem] opacity-40" />
            <GlowOrb className="left-1/3 top-40 size-72" />

            <div className="mentor-page-content mx-auto max-w-5xl px-4 sm:px-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-gold) sm:text-sm">Your account</p>
                <h1 className="mentor-title text-4xl font-extrabold sm:text-5xl">{detail.user.fullName}</h1>
                <p className="mt-3 text-base text-(--ink-soft)">
                    {detail.user.email} · member since {formatDate(detail.user.createdAt)}
                </p>

                <section className="glass mt-8 rounded-2xl p-6">
                    <h2 className="mb-4 text-xl font-bold">Profile</h2>
                    <ProfileNameForm initialName={detail.user.fullName} />
                    <p className="mt-3 text-xs text-(--ink-soft)">Your email is managed through your sign-in account.</p>
                </section>

                <h2 className="mb-4 mt-10 text-xl font-bold">Your activity</h2>
                <div className="admin-grid">
                    <StatCard label="Courses" value={formatNumber(detail.courses.length)} note={`${detail.courses.reduce((n, c) => n + c.materials.length, 0)} materials`} />
                    <StatCard label="Study sessions" value={formatNumber(detail.sessions.total)} note={`${formatDuration(detail.sessions.seconds)} studied`} />
                    <StatCard label="Quizzes taken" value={formatNumber(detail.quizzes.length)} note={detail.averageScore === null ? undefined : `Average ${Math.round(detail.averageScore)}%`} />
                    <StatCard label="Flashcards reviewed" value={formatNumber(detail.flashcards.reviews)} />
                    <StatCard label="AI usage" value={`${formatCompact(detail.usage.totals.totalTokens)} tokens`} note={formatCost(detail.usage.totals.cost, detail.usage.totals.unpricedCalls)} />
                </div>
            </div>
        </main>
    );
}
