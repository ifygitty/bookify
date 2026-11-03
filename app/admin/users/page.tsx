import Link from "next/link";

import BackfillButton from "@/components/admin/BackfillButton";
import { PageHeader } from "@/components/admin/widgets";
import { formatCost, formatDate, formatNumber } from "@/lib/admin-format";
import { listUsers, parseUserSort, type UserSort } from "@/lib/admin-analytics.server";
import { requireAdminPage } from "@/lib/admin.server";

type Params = { q?: string; sort?: string; dir?: string; page?: string; from?: string; to?: string; activity?: string };
type Props = { searchParams: Promise<Params> };

const PAGE_SIZE = 20;
const ACTIVITY = ["active7", "inactive30", "never"] as const;

function parseDate(value: string | undefined, endOfDay = false) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

const COLUMNS: { key: UserSort | null; label: string; num?: boolean }[] = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "createdAt", label: "Registered" },
    { key: "lastActiveAt", label: "Last active" },
    { key: null, label: "Courses", num: true },
    { key: null, label: "Sessions", num: true },
    { key: "tokens", label: "Tokens", num: true },
    { key: "cost", label: "Est. cost", num: true },
];

export default async function AdminUsersPage({ searchParams }: Props) {
    await requireAdminPage();
    const params = await searchParams;
    const sort = parseUserSort(params.sort);
    const dir: 1 | -1 = params.dir === "asc" ? 1 : -1;
    const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
    const activity = ACTIVITY.find((value) => value === params.activity);
    const search = params.q?.trim().slice(0, 80) ?? "";

    const { rows, total } = await listUsers({
        page,
        pageSize: PAGE_SIZE,
        sort,
        dir,
        search,
        registeredFrom: parseDate(params.from),
        registeredTo: parseDate(params.to, true),
        activity,
    });
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const link = (overrides: Partial<Params>) => {
        const next = new URLSearchParams();
        const merged: Params = { ...params, ...overrides };
        for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
        return `/admin/users?${next.toString()}`;
    };

    return (
        <>
            <PageHeader eyebrow="Admin" title="Users" subtitle={`${formatNumber(total)} registered student${total === 1 ? "" : "s"}.`} />

            <form className="admin-toolbar" method="get">
                <input className="mentor-input" name="q" defaultValue={search} placeholder="Search name or email" maxLength={80} />
                <label className="admin-muted text-xs">From <input className="mentor-input" type="date" name="from" defaultValue={params.from ?? ""} /></label>
                <label className="admin-muted text-xs">To <input className="mentor-input" type="date" name="to" defaultValue={params.to ?? ""} /></label>
                <select className="mentor-input" name="activity" defaultValue={activity ?? ""}>
                    <option value="">Any activity</option>
                    <option value="active7">Active in last 7 days</option>
                    <option value="inactive30">Inactive 30+ days</option>
                    <option value="never">Never active</option>
                </select>
                <input type="hidden" name="sort" value={sort} />
                <input type="hidden" name="dir" value={dir === 1 ? "asc" : "desc"} />
                <button type="submit" className="admin-chip">Apply</button>
                <Link href="/admin/users" className="admin-chip">Reset</Link>
                <BackfillButton />
            </form>

            <div className="admin-table-wrap glass mt-4">
                <table className="admin-table">
                    <thead>
                        <tr>
                            {COLUMNS.map((column) => (
                                <th key={column.label} className={column.num ? "num" : undefined}>
                                    {column.key ? (
                                        <Link href={link({ sort: column.key, dir: sort === column.key && dir === -1 ? "asc" : "desc", page: undefined })}>
                                            {column.label}{sort === column.key ? (dir === 1 ? " ↑" : " ↓") : ""}
                                        </Link>
                                    ) : (
                                        column.label
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && <tr><td colSpan={COLUMNS.length} className="admin-muted">No users match these filters.</td></tr>}
                        {rows.map((user) => (
                            <tr key={user.id}>
                                <td>
                                    <Link href={`/admin/users/${user.id}`} className="font-semibold underline-offset-2 hover:underline">{user.fullName}</Link>
                                    {user.isAdmin && <span className="admin-badge ml-2">Admin</span>}
                                </td>
                                <td>{user.email}</td>
                                <td>{formatDate(user.createdAt)}</td>
                                <td>{user.lastActiveAt ? formatDate(user.lastActiveAt) : "Never"}</td>
                                <td className="num">{user.courses}</td>
                                <td className="num">{user.sessions}</td>
                                <td className="num">{formatNumber(user.totalTokens)}</td>
                                <td className="num">{formatCost(user.cost, user.unpricedCalls)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="admin-pager">
                {page > 1 ? <Link href={link({ page: String(page - 1) })} className="admin-chip">Previous</Link> : <span />}
                <span>Page {page} of {pages}</span>
                {page < pages ? <Link href={link({ page: String(page + 1) })} className="admin-chip">Next</Link> : <span />}
            </div>
        </>
    );
}
