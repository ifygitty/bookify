"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, BookOpen, LayoutDashboard, UserCircle, Users } from "lucide-react";

const items = [
    { label: "Overview", href: "/admin", icon: LayoutDashboard, exact: true },
    { label: "Users", href: "/admin/users", icon: Users },
    { label: "AI usage", href: "/admin/usage", icon: BarChart3 },
    { label: "Courses", href: "/admin/courses", icon: BookOpen },
    { label: "Activity", href: "/admin/activity", icon: Activity },
    { label: "My profile", href: "/profile", icon: UserCircle },
];

export default function AdminNav() {
    const pathname = usePathname();
    return (
        <nav aria-label="Admin navigation" className="admin-nav glass">
            {items.map(({ label, href, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                return (
                    <Link key={href} href={href} aria-current={active ? "page" : undefined}>
                        <Icon className="size-4" />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
}
