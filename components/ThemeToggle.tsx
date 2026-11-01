"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const subscribe = () => () => {};

export default function ThemeToggle({ className = "" }: { className?: string }) {
    const { resolvedTheme, setTheme } = useTheme();
    const mounted = useSyncExternalStore(subscribe, () => true, () => false);
    const isDark = mounted ? resolvedTheme === "dark" : true;

    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Light theme" : "Dark theme"}
            className={`grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--navy-border)] text-[var(--ink)] transition-colors hover:bg-[var(--navy-600)] ${className}`}
        >
            {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
    );
}
