import Link from "next/link";

import { BarList, PageHeader, RangeFilter, StatCard } from "@/components/admin/widgets";
import TimeChart from "@/components/admin/TimeChart";
import { formatCompact, formatCost, formatDate, formatNumber, operationLabel } from "@/lib/admin-format";
import { getEarliestDate, getUsageAnalytics } from "@/lib/admin-analytics.server";
import { parseRangePreset, resolveRange } from "@/lib/admin-range";
import { requireAdminPage } from "@/lib/admin.server";

type Props = { searchParams: Promise<{ range?: string }> };

export default async function AdminUsagePage({ searchParams }: Props) {
    await requireAdminPage();
    const preset = parseRangePreset((await searchParams).range);
    const range = resolveRange(preset, new Date(), await getEarliestDate());
    const data = await getUsageAnalytics(range);
    const { totals } = data;

    return (
        <>
            <PageHeader
                eyebrow="Admin"
                title="AI usage"
                subtitle="Token usage and estimated cost recorded from OpenAI responses. File-search tool fees and vector storage are not included."
            />
            <RangeFilter basePath="/admin/usage" preset={preset} />

            <div className="admin-banner mt-4">
                {data.trackedSince
                    ? `Tracking started on ${formatDate(data.trackedSince.toISOString())}. Earlier usage is unavailable. Costs use the price table in lib/ai-pricing.ts and are estimates.`
                    : "No AI usage has been recorded yet."}
            </div>

            <div className="admin-grid mt-4">
                <StatCard label="AI calls" value={formatNumber(totals.calls)} note={`${formatNumber(data.failed)} failed`} />
                <StatCard label="Input tokens" value={formatCompact(totals.inputTokens)} />
                <StatCard label="Output tokens" value={formatCompact(totals.outputTokens)} />
                <StatCard label="Total tokens" value={formatCompact(totals.totalTokens)} />
                <StatCard
                    label="Estimated cost"
                    value={formatCost(totals.cost, totals.unpricedCalls)}
                    note={totals.unpricedCalls > 0 ? `* ${formatNumber(totals.unpricedCalls)} call(s) have no configured price` : "USD, tokens only"}
                />
            </div>

            <h2 className="admin-section-title">Over time</h2>
            <div className="admin-grid-2">
                <TimeChart title="Total tokens" data={data.series.tokens} interval={range.interval} unit="tokens" />
                <TimeChart title="Estimated cost" data={data.series.cost} interval={range.interval} unit="USD" format="cost" />
                <TimeChart title="Input tokens" data={data.series.input} interval={range.interval} kind="bar" unit="tokens" />
                <TimeChart title="Output tokens" data={data.series.output} interval={range.interval} kind="bar" unit="tokens" />
            </div>

            <div className="admin-grid-2 mt-6">
                <section className="admin-card glass">
                    <h2 className="admin-section-title !mt-0">By model</h2>
                    <BarList
                        rows={data.byModel.map((row) => ({
                            label: row.key,
                            value: row.totalTokens,
                            display: `${formatCompact(row.totalTokens)} tokens · ${formatCost(row.cost, row.unpricedCalls)}`,
                        }))}
                    />
                </section>
                <section className="admin-card glass">
                    <h2 className="admin-section-title !mt-0">By feature</h2>
                    <BarList
                        rows={data.byOperation.map((row) => ({
                            label: operationLabel(row.key),
                            value: row.totalTokens,
                            display: `${formatCompact(row.totalTokens)} tokens · ${formatCost(row.cost, row.unpricedCalls)}`,
                        }))}
                    />
                </section>
            </div>

            <h2 className="admin-section-title">Top users by tokens</h2>
            <div className="admin-table-wrap glass">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th className="num">Calls</th>
                            <th className="num">Tokens</th>
                            <th className="num">Est. cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.topUsers.length === 0 && (
                            <tr><td colSpan={4} className="admin-muted">No usage recorded in this period.</td></tr>
                        )}
                        {data.topUsers.map((user) => (
                            <tr key={`${user.userId}-${user.email}-${user.totalTokens}`}>
                                <td>
                                    {user.userId ? <Link href={`/admin/users/${user.userId}`} className="underline-offset-2 hover:underline">{user.name}</Link> : user.name}
                                    <div className="admin-muted text-xs">{user.email}</div>
                                </td>
                                <td className="num">{formatNumber(user.calls)}</td>
                                <td className="num">{formatNumber(user.totalTokens)}</td>
                                <td className="num">{formatCost(user.cost)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
