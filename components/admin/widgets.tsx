import Link from "next/link";

import { formatNumber, percentChange } from "@/lib/admin-format";
import { RANGE_OPTIONS, type RangePreset } from "@/lib/admin-range";

export function StatCard({
    label,
    value,
    note,
    current,
    previous,
}: {
    label: string;
    value: string;
    note?: string;
    current?: number;
    previous?: number | null;
}) {
    const change = current !== undefined ? percentChange(current, previous) : null;
    return (
        <div className="admin-card glass">
            <div className="admin-card-label">{label}</div>
            <div className="admin-card-value">{value}</div>
            {change !== null && (
                <div className={`admin-card-note ${change >= 0 ? "admin-delta-up" : "admin-delta-down"}`}>
                    {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(0)}% vs previous period
                </div>
            )}
            {note && <div className="admin-card-note">{note}</div>}
        </div>
    );
}

export function RangeFilter({ basePath, preset }: { basePath: string; preset: RangePreset }) {
    return (
        <div className="admin-toolbar" role="group" aria-label="Date range">
            {RANGE_OPTIONS.map((option) => (
                <Link
                    key={option.value}
                    href={`${basePath}?range=${option.value}`}
                    className="admin-chip"
                    aria-current={option.value === preset ? "true" : undefined}
                    scroll={false}
                >
                    {option.label}
                </Link>
            ))}
        </div>
    );
}

export function BarList({
    rows,
    valueLabel,
}: {
    rows: { label: string; value: number; display?: string }[];
    valueLabel?: string;
}) {
    const max = Math.max(1, ...rows.map((row) => row.value));
    if (rows.length === 0) return <p className="admin-empty">No data in this period.</p>;
    return (
        <div className="admin-bars">
            {rows.map((row) => (
                <div key={row.label} className="admin-bars-row">
                    <div className="admin-bars-head">
                        <span>{row.label}</span>
                        <span className="admin-muted">{row.display ?? `${formatNumber(row.value)} ${valueLabel ?? ""}`}</span>
                    </div>
                    <div className="admin-bars-track">
                        <div className="admin-bars-fill" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
    return (
        <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-gold)]">{eyebrow}</p>
            <h1 className="mentor-title text-3xl font-extrabold sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">{subtitle}</p>}
        </div>
    );
}
