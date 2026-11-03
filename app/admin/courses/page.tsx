import Link from "next/link";

import { BarList, PageHeader, RangeFilter, StatCard } from "@/components/admin/widgets";
import TimeChart from "@/components/admin/TimeChart";
import { formatBytes, formatDate, formatNumber } from "@/lib/admin-format";
import { getCourseAnalytics, getEarliestDate } from "@/lib/admin-analytics.server";
import { parseRangePreset, resolveRange } from "@/lib/admin-range";
import { requireAdminPage } from "@/lib/admin.server";

type Props = { searchParams: Promise<{ range?: string }> };

function Owner({ owner }: { owner: { userId: string | null; name: string } }) {
    return owner.userId ? (
        <Link href={`/admin/users/${owner.userId}`} className="underline-offset-2 hover:underline">{owner.name}</Link>
    ) : (
        <span>{owner.name}</span>
    );
}

export default async function AdminCoursesPage({ searchParams }: Props) {
    await requireAdminPage();
    const preset = parseRangePreset((await searchParams).range);
    const range = resolveRange(preset, new Date(), await getEarliestDate());
    const data = await getCourseAnalytics(range);

    return (
        <>
            <PageHeader eyebrow="Admin" title="Courses" subtitle="Course and material counts only. Material content and file links are never shown here." />
            <RangeFilter basePath="/admin/courses" preset={preset} />

            <div className="admin-grid mt-4">
                <StatCard label="Total courses" value={formatNumber(data.totalCourses)} />
                <StatCard label="Total materials" value={formatNumber(data.totalMaterials)} note={formatBytes(data.totalBytes)} />
                <StatCard label="Avg courses per user" value={data.averageCoursesPerUser.toFixed(2)} />
            </div>

            <div className="mt-4">
                <TimeChart title="Courses created" data={data.series} interval={range.interval} kind="bar" unit="courses" />
            </div>

            <div className="admin-grid-2 mt-6">
                <section className="admin-card glass">
                    <h2 className="admin-section-title !mt-0">Most active courses ({range.label})</h2>
                    {data.mostActive.length === 0 ? (
                        <p className="admin-empty">No course activity in this period.</p>
                    ) : (
                        <BarList
                            rows={data.mostActive.map((course) => ({
                                label: `${course.name} — ${course.owner.name}`,
                                value: course.score,
                                display: `${course.breakdown.chats} chats · ${course.breakdown.quizzes} quizzes · ${course.breakdown.reviews} reviews · ${course.breakdown.sessions} sessions`,
                            }))}
                        />
                    )}
                </section>
                <section className="admin-card glass">
                    <h2 className="admin-section-title !mt-0">Students with most courses</h2>
                    <BarList
                        rows={data.topOwners.map((owner) => ({
                            label: owner.name,
                            value: owner.courses,
                            display: `${owner.courses} courses · ${owner.materials} materials`,
                        }))}
                    />
                </section>
            </div>

            <h2 className="admin-section-title">Recently created</h2>
            <div className="admin-table-wrap glass">
                <table className="admin-table">
                    <thead>
                        <tr><th>Course</th><th>Owner</th><th className="num">Materials</th><th>Created</th></tr>
                    </thead>
                    <tbody>
                        {data.recent.map((course) => (
                            <tr key={course.id}>
                                <td>{course.name}</td>
                                <td><Owner owner={course.owner} /></td>
                                <td className="num">{course.materials}</td>
                                <td>{formatDate(course.createdAt)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
