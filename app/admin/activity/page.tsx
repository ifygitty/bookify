import Link from "next/link";

import { PageHeader } from "@/components/admin/widgets";
import { formatDateTime, formatDuration } from "@/lib/admin-format";
import { getActivityFeed, listStudySessions } from "@/lib/admin-analytics.server";
import { requireAdminPage } from "@/lib/admin.server";

type Props = { searchParams: Promise<{ page?: string }> };

const PAGE_SIZE = 15;

export default async function AdminActivityPage({ searchParams }: Props) {
    await requireAdminPage();
    const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);
    const [feed, sessions] = await Promise.all([getActivityFeed(30), listStudySessions(page, PAGE_SIZE)]);
    const pages = Math.max(1, Math.ceil(sessions.total / PAGE_SIZE));

    return (
        <>
            <PageHeader
                eyebrow="Admin"
                title="Activity"
                subtitle="Recent events and study sessions. A study session is a run of study actions with gaps under 30 minutes; page loads and logins do not count."
            />

            <h2 className="admin-section-title">Recent activity</h2>
            <div className="admin-card glass">
                {feed.length === 0 && <p className="admin-empty">No activity yet.</p>}
                <ul className="grid gap-3">
                    {feed.map((event, index) => (
                        <li key={`${event.type}-${event.at}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                            <span>
                                {event.userId ? (
                                    <Link href={`/admin/users/${event.userId}`} className="font-semibold underline-offset-2 hover:underline">{event.userName}</Link>
                                ) : (
                                    <span className="font-semibold">{event.userName}</span>
                                )}{" "}
                                <span className="admin-muted">{event.detail}</span>
                            </span>
                            <span className="admin-muted text-xs">{formatDateTime(event.at)}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <h2 className="admin-section-title">Study sessions</h2>
            <div className="admin-table-wrap glass">
                <table className="admin-table">
                    <thead>
                        <tr><th>User</th><th>Course</th><th>Started</th><th className="num">Duration</th><th className="num">Actions</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        {sessions.rows.length === 0 && <tr><td colSpan={6} className="admin-muted">No study sessions recorded yet.</td></tr>}
                        {sessions.rows.map((session) => (
                            <tr key={session.id}>
                                <td>{session.userId ? <Link href={`/admin/users/${session.userId}`} className="hover:underline">{session.userName}</Link> : session.userName}</td>
                                <td>{session.course ?? "—"}</td>
                                <td>{formatDateTime(session.startedAt)}</td>
                                <td className="num">{formatDuration(session.durationSeconds)}</td>
                                <td className="num">{session.activityCount}</td>
                                <td><span className="admin-badge">{session.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="admin-pager">
                {page > 1 ? <Link href={`/admin/activity?page=${page - 1}`} className="admin-chip">Previous</Link> : <span />}
                <span>Page {page} of {pages}</span>
                {page < pages ? <Link href={`/admin/activity?page=${page + 1}`} className="admin-chip">Next</Link> : <span />}
            </div>
        </>
    );
}
