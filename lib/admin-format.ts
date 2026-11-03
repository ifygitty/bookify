export function formatNumber(value: number) {
    return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatCompact(value: number) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatCost(value: number, unpricedCalls = 0) {
    const text = value < 0.01 && value > 0 ? "<$0.01" : `$${value.toFixed(value < 1 ? 4 : 2)}`;
    return unpricedCalls > 0 ? `${text}*` : text;
}

export function formatDuration(seconds: number) {
    if (!seconds || seconds < 60) return `${Math.round(seconds || 0)}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatDateTime(iso: string | null | undefined) {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

export function formatDate(iso: string | null | undefined) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}

export function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function percentChange(current: number, previous: number | null | undefined) {
    if (previous === null || previous === undefined) return null;
    if (previous === 0) return current === 0 ? 0 : null;
    return ((current - previous) / previous) * 100;
}

export function operationLabel(key: string) {
    return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
