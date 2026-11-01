"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    BookOpenCheck,
    CalendarDays,
    ChartColumn,
    ChevronDown,
    FolderOpen,
    Layers,
    ListTree,
    MessageSquare,
    PanelLeftClose,
    PanelLeftOpen,
    X,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type CourseSection = "chat" | "materials" | "outline" | "revision" | "practice" | "flashcards";

type NavItem = { label: string; icon: LucideIcon; section?: CourseSection; href?: string };
type NavGroup = { id: string; label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
    {
        id: "study",
        label: "Study",
        items: [
            { label: "Mentor AI chat", icon: MessageSquare, section: "chat" },
            { label: "Materials", icon: FolderOpen, section: "materials" },
        ],
    },
    {
        id: "plan",
        label: "Plan & coverage",
        items: [
            { label: "Course outline", icon: ListTree, section: "outline" },
            { label: "Revision plan", icon: CalendarDays, section: "revision" },
        ],
    },
    {
        id: "practice",
        label: "Practice",
        items: [
            { label: "Practice questions", icon: BookOpenCheck, section: "practice" },
            { label: "Flashcards", icon: Layers, section: "flashcards" },
        ],
    },
    {
        id: "progress",
        label: "Progress",
        items: [{ label: "Study progress", icon: ChartColumn, href: "/progress" }],
    },
];

export const SECTION_TITLES: Record<CourseSection, string> = {
    chat: "Mentor AI chat",
    materials: "Materials",
    outline: "Course outline",
    revision: "Revision plan",
    practice: "Practice questions",
    flashcards: "Flashcards",
};

const COLLAPSE_KEY = "bookified:course-sidebar-collapsed";

const itemClass = (active: boolean, collapsed: boolean) =>
    cn(
        "relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
            ? "bg-[rgba(212,175,55,0.12)] text-[var(--gold)]"
            : "text-[var(--ink-soft)] hover:bg-[var(--navy-700)] hover:text-[var(--ink)]",
    );

function NavList({
    active,
    collapsed,
    onSelect,
    onNavigate,
}: {
    active: CourseSection;
    collapsed: boolean;
    onSelect: (section: CourseSection) => void;
    onNavigate?: () => void;
}) {
    const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

    return (
        <div className="space-y-4">
            {NAV_GROUPS.map((group) => {
                const isOpen = collapsed || !closedGroups[group.id];
                return (
                    <div key={group.id}>
                        {collapsed ? (
                            <div className="mx-3 mb-2 border-t border-[var(--navy-border)] first:hidden" />
                        ) : (
                            <button
                                type="button"
                                onClick={() => setClosedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
                                aria-expanded={isOpen}
                                className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)] hover:text-[var(--ink)]"
                            >
                                {group.label}
                                <ChevronDown className={cn("size-4 transition-transform duration-200", !isOpen && "-rotate-90")} />
                            </button>
                        )}
                        <div className="bk-collapsible" data-open={isOpen}>
                            <div>
                                <ul className="space-y-1">
                                    {group.items.map((item) => {
                                        const Icon = item.icon;
                                        const isActive = item.section === active;
                                        const content = (
                                            <>
                                                {isActive && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--gold)]" />}
                                                <Icon className="size-5 shrink-0" strokeWidth={1.75} />
                                                {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                                            </>
                                        );
                                        return (
                                            <li key={item.label}>
                                                {item.href ? (
                                                    <Link
                                                        href={item.href}
                                                        onClick={onNavigate}
                                                        aria-label={collapsed ? item.label : undefined}
                                                        title={collapsed ? item.label : undefined}
                                                        className={itemClass(false, collapsed)}
                                                    >
                                                        {content}
                                                    </Link>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => item.section && onSelect(item.section)}
                                                        aria-current={isActive ? "page" : undefined}
                                                        aria-label={collapsed ? item.label : undefined}
                                                        title={collapsed ? item.label : undefined}
                                                        className={itemClass(isActive, collapsed)}
                                                    >
                                                        {content}
                                                    </button>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function CourseWorkspaceNav({
    courseName,
    active,
    onSelect,
    drawerOpen,
    onDrawerClose,
}: {
    courseName: string;
    active: CourseSection;
    onSelect: (section: CourseSection) => void;
    drawerOpen: boolean;
    onDrawerClose: () => void;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const [closing, setClosing] = useState(false);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const closeTimerRef = useRef<number | null>(null);
    const closingRef = useRef(false);

    useEffect(() => {
        setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    }, []);

    const toggleCollapsed = () => {
        const next = !collapsed;
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
        setCollapsed(next);
    };

    const requestClose = () => {
        if (closingRef.current) return;
        closingRef.current = true;
        setClosing(true);
        closeTimerRef.current = window.setTimeout(() => {
            closingRef.current = false;
            setClosing(false);
            onDrawerClose();
        }, 180);
    };

    useEffect(() => {
        if (!drawerOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButtonRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") requestClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
        // requestClose only touches refs and the stable onDrawerClose callback
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawerOpen]);

    useEffect(() => () => {
        if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    }, []);

    const selectFromDrawer = (section: CourseSection) => {
        onSelect(section);
        requestClose();
    };

    return (
        <>
            <aside
                aria-label="Course navigation"
                className={cn(
                    "hidden shrink-0 flex-col border-r border-[var(--navy-border)] bg-[var(--navy-800)] transition-[width] duration-200 lg:flex",
                    collapsed ? "w-[4.5rem]" : "w-64",
                )}
            >
                <div className="border-b border-[var(--navy-border)] p-3">
                    <div className={cn("mb-3 flex items-center gap-2", collapsed && "justify-center")}>
                        <span aria-hidden="true" className="relative h-12 w-8 shrink-0 overflow-hidden">
                            <Image
                                src="/assets/Mainlogo.png"
                                alt=""
                                width={1920}
                                height={1080}
                                className="absolute left-0 top-0 h-12 w-auto max-w-none"
                            />
                        </span>
                    </div>
                    <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
                    <Link href="/courses" aria-label="All courses" title="All courses" className="icon-btn">
                        <ArrowLeft />
                    </Link>
                    {!collapsed && (
                        <p className="bk-wrap line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-[var(--ink)]">{courseName}</p>
                    )}
                    </div>
                </div>
                <nav aria-label="Course tools" className="min-h-0 flex-1 overflow-y-auto p-3">
                    <NavList active={active} collapsed={collapsed} onSelect={onSelect} />
                </nav>
                <div className={cn("flex border-t border-[var(--navy-border)] p-3", collapsed ? "justify-center" : "justify-end")}>
                    <button
                        type="button"
                        onClick={toggleCollapsed}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        aria-expanded={!collapsed}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className="icon-btn"
                    >
                        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                    </button>
                </div>
            </aside>

            {drawerOpen && (
                <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Course navigation">
                    <div
                        className={cn("absolute inset-0 bg-black/60", closing ? "anim-fade-out" : "anim-fade")}
                        onClick={requestClose}
                    />
                    <div
                        className={cn(
                            "absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-[var(--navy-border)] bg-[var(--navy-800)] shadow-[var(--shadow-soft-lg)]",
                            closing ? "anim-drawer-out" : "anim-drawer",
                        )}
                    >
                        <div className="border-b border-[var(--navy-border)] p-3">
                            <div className="mb-3 flex items-center gap-2">
                                <span aria-hidden="true" className="relative h-12 w-8 shrink-0 overflow-hidden">
                                    <Image
                                        src="/assets/Mainlogo.png"
                                        alt=""
                                        width={1920}
                                        height={1080}
                                        className="absolute left-0 top-0 h-12 w-auto max-w-none"
                                    />
                                </span>
                                <span className="text-sm font-bold tracking-wide text-[var(--ink)]">Mentor</span>
                            </div>
                            <div className="flex items-start gap-2">
                            <p className="bk-wrap line-clamp-3 min-w-0 flex-1 py-2 text-sm font-semibold leading-snug text-[var(--ink)]">{courseName}</p>
                            <button ref={closeButtonRef} type="button" onClick={requestClose} aria-label="Close navigation" className="icon-btn">
                                <X />
                            </button>
                            </div>
                        </div>
                        <nav aria-label="Course tools" className="min-h-0 flex-1 overflow-y-auto p-3">
                            <NavList active={active} collapsed={false} onSelect={selectFromDrawer} onNavigate={requestClose} />
                        </nav>
                        <div className="border-t border-[var(--navy-border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                            <Link
                                href="/courses"
                                onClick={requestClose}
                                className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--navy-700)] hover:text-[var(--ink)]"
                            >
                                <ArrowLeft className="size-5" strokeWidth={1.75} />All courses
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
