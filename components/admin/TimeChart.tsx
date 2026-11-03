"use client";

import { useId, useState } from "react";

import { formatBucketLabel, type Interval } from "@/lib/admin-range";

type Point = { bucket: string; value: number | null };

type Props = {
    title: string;
    data: Point[];
    interval: Interval;
    kind?: "line" | "bar";
    unit?: string;
    format?: "number" | "cost" | "compact";
    emptyMessage?: string;
};

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };

export default function TimeChart({ title, data, interval, kind = "line", unit = "", format: formatKind = "number", emptyMessage }: Props) {
    const gradientId = useId();
    const [hover, setHover] = useState<number | null>(null);
    const format = (value: number) =>
        formatKind === "cost"
            ? `$${value.toFixed(value < 1 ? 4 : 2)}`
            : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

    const values = data.map((point) => point.value ?? 0);
    const hasData = data.some((point) => (point.value ?? 0) > 0);
    const max = Math.max(1, ...values);
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const step = data.length > 1 ? innerW / (data.length - 1) : innerW;
    const barW = Math.max(2, Math.min(28, (innerW / Math.max(1, data.length)) * 0.7));

    const x = (index: number) => PAD.left + (data.length > 1 ? index * step : innerW / 2);
    const y = (value: number) => PAD.top + innerH - (value / max) * innerH;

    // A null value breaks the line so unknown periods are not drawn as zero.
    const segments: string[] = [];
    let current = "";
    data.forEach((point, index) => {
        if (point.value === null) {
            if (current) segments.push(current);
            current = "";
            return;
        }
        current += `${current ? "L" : "M"}${x(index).toFixed(1)} ${y(point.value).toFixed(1)} `;
    });
    if (current) segments.push(current);

    const labelEvery = Math.max(1, Math.ceil(data.length / 6));
    const active = hover !== null ? data[hover] : null;

    return (
        <figure className="admin-chart glass">
            <figcaption className="admin-chart-title">{title}</figcaption>
            {!hasData && !data.some((point) => point.value === null) ? (
                <p className="admin-empty">{emptyMessage ?? "No activity in this period."}</p>
            ) : (
                <div className="admin-chart-body">
                    <svg
                        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                        role="img"
                        aria-label={`${title} over time`}
                        className="admin-chart-svg"
                        onMouseLeave={() => setHover(null)}
                    >
                        <defs>
                            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="var(--accent-gold)" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="var(--accent-gold)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {[0, 0.5, 1].map((ratio) => (
                            <line key={ratio} x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + innerH * ratio} y2={PAD.top + innerH * ratio} className="admin-grid-line" />
                        ))}
                        {kind === "bar"
                            ? data.map((point, index) =>
                                point.value === null ? null : (
                                    <rect
                                        key={point.bucket}
                                        x={x(index) - barW / 2}
                                        y={y(point.value)}
                                        width={barW}
                                        height={Math.max(0, PAD.top + innerH - y(point.value))}
                                        rx="3"
                                        className={hover === index ? "admin-bar admin-bar-active" : "admin-bar"}
                                    />
                                ),
                            )
                            : segments.map((path, index) => (
                                <g key={index}>
                                    <path d={`${path}L${WIDTH - PAD.right} ${PAD.top + innerH} L${PAD.left} ${PAD.top + innerH} Z`} fill={`url(#${gradientId})`} opacity="0.6" />
                                    <path d={path} className="admin-line" />
                                </g>
                            ))}
                        {data.map((point, index) => (
                            <rect
                                key={`hit-${point.bucket}`}
                                x={x(index) - Math.max(step, 8) / 2}
                                y={PAD.top}
                                width={Math.max(step, 8)}
                                height={innerH}
                                fill="transparent"
                                onMouseEnter={() => setHover(index)}
                                onFocus={() => setHover(index)}
                                tabIndex={0}
                                aria-label={`${formatBucketLabel(point.bucket, interval)}: ${point.value === null ? "not tracked" : format(point.value)} ${unit}`}
                            />
                        ))}
                        {hover !== null && active?.value !== null && active?.value !== undefined && kind === "line" && (
                            <circle cx={x(hover)} cy={y(active.value)} r="4" className="admin-dot" />
                        )}
                        {data.map((point, index) =>
                            index % labelEvery === 0 ? (
                                <text key={`label-${point.bucket}`} x={x(index)} y={HEIGHT - 8} textAnchor="middle" className="admin-axis-label">
                                    {formatBucketLabel(point.bucket, interval)}
                                </text>
                            ) : null,
                        )}
                    </svg>
                    <div className="admin-chart-tip" aria-live="polite">
                        {active
                            ? `${formatBucketLabel(active.bucket, interval)} — ${active.value === null ? "not tracked yet" : `${format(active.value)} ${unit}`.trim()}`
                            : "Hover a point for details"}
                    </div>
                </div>
            )}
        </figure>
    );
}
