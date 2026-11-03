export type RangePreset = "today" | "7d" | "30d" | "month" | "all";
export type Interval = "day" | "week" | "month";

export const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "month", label: "This month" },
    { value: "all", label: "All time" },
];

export type DateRange = {
    preset: RangePreset;
    label: string;
    from: Date | null;
    to: Date;
    previous: { from: Date; to: Date } | null;
    interval: Interval;
};

const DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function parseRangePreset(value: string | string[] | undefined): RangePreset {
    const raw = Array.isArray(value) ? value[0] : value;
    return RANGE_OPTIONS.some((option) => option.value === raw) ? (raw as RangePreset) : "30d";
}

/** `earliest` bounds the "all time" range so charts do not start decades back. */
export function resolveRange(preset: RangePreset, now: Date, earliest?: Date | null): DateRange {
    const today = startOfUtcDay(now);
    const label = RANGE_OPTIONS.find((option) => option.value === preset)?.label ?? "Last 30 days";
    let from: Date | null;

    switch (preset) {
        case "today":
            from = today;
            break;
        case "7d":
            from = new Date(today.getTime() - 6 * DAY);
            break;
        case "30d":
            from = new Date(today.getTime() - 29 * DAY);
            break;
        case "month":
            from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            break;
        default:
            from = null;
    }

    const chartFrom = from ?? (earliest ? startOfUtcDay(earliest) : new Date(today.getTime() - 89 * DAY));
    const spanDays = Math.max(1, Math.ceil((now.getTime() - chartFrom.getTime()) / DAY));
    const interval: Interval = spanDays > 180 ? "month" : spanDays > 60 ? "week" : "day";
    const previous = from
        ? { from: new Date(from.getTime() - (now.getTime() - from.getTime())), to: from }
        : null;

    return { preset, label, from, to: now, previous, interval };
}

export function chartStart(range: DateRange, earliest?: Date | null) {
    if (range.from) return range.from;
    return earliest ? startOfUtcDay(earliest) : new Date(startOfUtcDay(range.to).getTime() - 89 * DAY);
}

function bucketStart(date: Date, interval: Interval) {
    const day = startOfUtcDay(date);
    if (interval === "day") return day;
    if (interval === "month") return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    const offset = (day.getUTCDay() + 6) % 7; // weeks start on Monday, matching $dateTrunc startOfWeek
    return new Date(day.getTime() - offset * DAY);
}

function nextBucket(date: Date, interval: Interval) {
    if (interval === "day") return new Date(date.getTime() + DAY);
    if (interval === "week") return new Date(date.getTime() + 7 * DAY);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

/** Returns every bucket start in the range so charts show gaps as zero or null rather than skipping them. */
export function listBuckets(from: Date, to: Date, interval: Interval) {
    const buckets: Date[] = [];
    for (let cursor = bucketStart(from, interval); cursor <= to && buckets.length < 400; cursor = nextBucket(cursor, interval)) {
        buckets.push(cursor);
    }
    return buckets;
}

export function formatBucketLabel(iso: string, interval: Interval) {
    const date = new Date(iso);
    return interval === "month"
        ? date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
        : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
