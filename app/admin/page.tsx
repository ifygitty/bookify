import { PageHeader, RangeFilter, StatCard } from "@/components/admin/widgets";
import TimeChart from "@/components/admin/TimeChart";
import { formatCompact, formatCost, formatDate, formatNumber } from "@/lib/admin-format";
import { getEarliestDate, getOverview } from "@/lib/admin-analytics.server";
import { parseRangePreset, resolveRange } from "@/lib/admin-range";
import { requireAdminPage } from "@/lib/admin.server";

type Props = { searchParams: Promise<{ range?: string }> };

export default async function AdminOverviewPage({ searchParams }: Props) {
    await requireAdminPage();
    const preset = parseRangePreset((await searchParams).range);
    const range = resolveRange(preset, new Date(), await getEarliestDate());
    const data = await getOverview(range);
    const { current, previous, totals, series, trackedSince } = data;
    const unpriced = current.ai.unpricedCalls;

    return (
        <>
            <PageHeader eyebrow="Admin" title="Overview" subtitle={`Platform activity for: ${range.label}.`} />
            <RangeFilter basePath="/admin" preset={preset} />

            <div className="admin-banner mt-4">
                {trackedSince
                    ? `AI token and cost tracking started on ${formatDate(trackedSince.toISOString())}. Earlier usage was not recorded and is shown as unavailable, not zero.`
                    : "AI usage tracking has not recorded any calls yet. Token and cost figures will appear after the first AI request."}
            </div>

            <div className="admin-grid mt-4">
                <StatCard label="Total users" value={formatNumber(totals.users)} note={`${formatNumber(current.newUsers)} new in period`} current={current.newUsers} previous={previous?.newUsers} />
                <StatCard label="Total courses" value={formatNumber(totals.courses)} note={`${formatNumber(current.newCourses)} new in period`} current={current.newCourses} previous={previous?.newCourses} />
                <StatCard label="Materials uploaded" value={formatNumber(totals.materials)} note={`${formatNumber(current.newMaterials)} in period`} current={current.newMaterials} previous={previous?.newMaterials} />
                <StatCard label="Active learners" value={formatNumber(current.activeUsers)} note="Users with a study session" current={current.activeUsers} previous={previous?.activeUsers} />
                <StatCard label="Study sessions" value={formatNumber(current.sessions)} current={current.sessions} previous={previous?.sessions} />
                <StatCard label="Quizzes completed" value={formatNumber(current.quizzes)} current={current.quizzes} previous={previous?.quizzes} />
                <StatCard label="Flashcards reviewed" value={formatNumber(current.reviews)} current={current.reviews} previous={previous?.reviews} />
                <StatCard label="AI calls" value={formatNumber(current.ai.calls)} current={current.ai.calls} previous={previous?.ai.calls} />
                <StatCard label="Input tokens" value={formatCompact(current.ai.inputTokens)} note="Tracked usage only" current={current.ai.inputTokens} previous={previous?.ai.inputTokens} />
                <StatCard label="Output tokens" value={formatCompact(current.ai.outputTokens)} note="Tracked usage only" current={current.ai.outputTokens} previous={previous?.ai.outputTokens} />
                <StatCard
                    label="Estimated AI cost"
                    value={formatCost(current.ai.cost, unpriced)}
                    note={unpriced > 0 ? `* excludes ${formatNumber(unpriced)} call(s) from models with no configured price` : "Token cost only (USD)"}
                    current={current.ai.cost}
                    previous={previous?.ai.cost}
                />
            </div>

            <h2 className="admin-section-title">Growth and engagement</h2>
            <div className="admin-grid-2">
                <TimeChart title="New users" data={series.userGrowth} interval={range.interval} kind="bar" unit="users" />
                <TimeChart title="Active learners" data={series.activeUsers} interval={range.interval} unit="users" />
                <TimeChart title="Study sessions" data={series.sessions} interval={range.interval} kind="bar" unit="sessions" />
                <TimeChart title="Quizzes completed" data={series.quizzes} interval={range.interval} kind="bar" unit="quizzes" />
                <TimeChart title="Flashcards reviewed" data={series.reviews} interval={range.interval} kind="bar" unit="reviews" />
                <TimeChart title="Courses created" data={series.courses} interval={range.interval} kind="bar" unit="courses" />
                <TimeChart title="Materials uploaded" data={series.materials} interval={range.interval} kind="bar" unit="files" />
            </div>

            <h2 className="admin-section-title">AI usage (tracked since launch of tracking)</h2>
            <div className="admin-grid-2">
                <TimeChart title="Tokens" data={series.aiTokens} interval={range.interval} unit="tokens" />
                <TimeChart title="Estimated cost" data={series.aiCost} interval={range.interval} unit="USD" format="cost" />
            </div>
        </>
    );
}
