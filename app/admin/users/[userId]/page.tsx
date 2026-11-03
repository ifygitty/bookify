import Link from "next/link";
import { notFound } from "next/navigation";

import { BarList, PageHeader, StatCard } from "@/components/admin/widgets";
import { formatBytes, formatCompact, formatCost, formatDate, formatDateTime, formatDuration, formatNumber, operationLabel } from "@/lib/admin-format";
import { getUserDetail } from "@/lib/admin-analytics.server";
import { requireAdminPage } from "@/lib/admin.server";

type Props = { params: Promise<{ userId: string }> };

export default async function AdminUserDetailPage({ params }: Props) {
    await requireAdminPage();
    const detail = await getUserDetail((await params).userId);
    if (!detail) notFound();
    const { user, usage } = detail;

    return (
        <>
            <Link href="/admin/users" className="admin-muted text-sm hover:underline">← All users</Link>
            <PageHeader
                eyebrow={user.isAdmin ? "Admin user" : "Student"}
                title={user.fullName}
                subtitle={`${user.email} · registered ${formatDate(user.createdAt)} · last active ${user.lastActiveAt ? formatDateTime(user.lastActiveAt) : "never"}${user.deleted ? " · deleted in Clerk" : ""}`}
            />

            <div className="admin-grid mt-4">
                <StatCard label="Courses" value={formatNumber(detail.courses.length)} note={`${detail.courses.reduce((n, c) => n + c.materials.length, 0)} materials`} />
                <StatCard label="Study sessions" value={formatNumber(detail.sessions.total)} note={`${formatDuration(detail.sessions.seconds)} total`} />
                <StatCard label="Avg quiz score" value={detail.averageScore === null ? "—" : `${Math.round(detail.averageScore)}%`} note={`${detail.quizzes.length} recent quizzes`} />
                <StatCard label="Flashcards reviewed" value={formatNumber(detail.flashcards.reviews)} />
                <StatCard label="Chat messages" value={formatNumber(detail.chatMessages)} />
                <StatCard label="AI tokens" value={formatCompact(usage.totals.totalTokens)} note={formatCost(usage.totals.cost, usage.totals.unpricedCalls)} />
            </div>

            <div className="admin-grid-2 mt-6">
                <section className="admin-card glass">
                    <h2 className="admin-section-title !mt-0">AI usage by model</h2>
                    <BarList rows={usage.byModel.map((row) => ({ label: row.key, value: row.totalTokens, display: `${formatCompact(row.totalTokens)} · ${formatCost(row.cost, row.unpricedCalls)}` }))} />
                </section>
                <section className="admin-card glass">
                    <h2 className="admin-section-title !mt-0">AI usage by feature</h2>
                    <BarList rows={usage.byOperation.map((row) => ({ label: operationLabel(row.key), value: row.totalTokens, display: `${formatCompact(row.totalTokens)} · ${formatCost(row.cost, row.unpricedCalls)}` }))} />
                </section>
            </div>

            <h2 className="admin-section-title">Courses</h2>
            <div className="admin-card glass">
                {detail.courses.length === 0 && <p className="admin-empty">No courses.</p>}
                <ul className="grid gap-4">
                    {detail.courses.map((course) => (
                        <li key={course.id}>
                            <p className="font-semibold">{course.name} <span className="admin-muted text-xs">created {course.createdAt ? formatDate(course.createdAt) : "—"}</span></p>
                            <ul className="admin-muted mt-1 text-sm">
                                {course.materials.map((material, index) => (
                                    <li key={index}>{material.title} · {formatBytes(material.fileSize ?? 0)}</li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            </div>

            <h2 className="admin-section-title">Recent quizzes</h2>
            <div className="admin-table-wrap glass">
                <table className="admin-table">
                    <thead><tr><th>Course</th><th>Type</th><th>Submitted</th><th className="num">Score</th></tr></thead>
                    <tbody>
                        {detail.quizzes.length === 0 && <tr><td colSpan={4} className="admin-muted">No completed quizzes.</td></tr>}
                        {detail.quizzes.map((quiz) => (
                            <tr key={quiz.id}>
                                <td>{quiz.course}</td>
                                <td>{quiz.type || "—"}</td>
                                <td>{quiz.submittedAt ? formatDateTime(quiz.submittedAt) : "—"}</td>
                                <td className="num">{quiz.scorePercent === null ? "—" : `${Math.round(quiz.scorePercent)}%`}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h2 className="admin-section-title">Recent study sessions</h2>
            <div className="admin-table-wrap glass">
                <table className="admin-table">
                    <thead><tr><th>Started</th><th>Course</th><th className="num">Duration</th><th className="num">Actions</th></tr></thead>
                    <tbody>
                        {detail.sessions.recent.length === 0 && <tr><td colSpan={4} className="admin-muted">No sessions recorded.</td></tr>}
                        {detail.sessions.recent.map((session) => (
                            <tr key={session.id}>
                                <td>{formatDateTime(session.startedAt)}</td>
                                <td>{session.course ?? "—"}</td>
                                <td className="num">{formatDuration(session.durationSeconds)}</td>
                                <td className="num">{session.activityCount}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
