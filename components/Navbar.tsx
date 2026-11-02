'use client';

import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";
import { useState } from "react";
import { SignedIn, SignedOut, UserButton, useClerk, useUser } from "@clerk/nextjs";
import { LogOut, Menu, X } from "lucide-react";
import {cn} from "@/lib/utils";
import ThemeToggle from "@/components/ThemeToggle";
import "@/components/landing.css";
import "@/components/mentor-ui.css";

const publicNavItems = [
    { label: "Home", href: "/#top" },
    { label: "Features", href: "/#features" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Testimonials", href: "/#testimonials" },
    { label: "Pricing", href: "/subscriptions" },
]

const appNavItems = [
    { label: "Courses", href: "/courses" },
    { label: "Study progress", href: "/progress" },
    { label: "Pricing", href: "/subscriptions" },
]

const Navbar = () => {
    const pathName = usePathname();
    const { user, isSignedIn } = useUser();
    const { signOut } = useClerk();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navItems = pathName === "/" || !isSignedIn ? publicNavItems : appNavItems;

    const isActive = (href: string) => {
        if (href.startsWith("/#")) return false;
        return pathName === href || pathName.startsWith(`${href}/`);
    };

    const handleSignOut = async () => {
        setIsMobileMenuOpen(false);
        await signOut({ redirectUrl: "/" });
    };

    return (
        <header className="mentor-nav border-light fixed z-50 w-full">
            <div className="wrapper navbar-height py-4 flex justify-between items-center">
                <Link
                    href="/"
                    aria-label="Mentor home"
                    className="relative flex h-12 w-44 min-w-0 items-center overflow-hidden sm:w-48"
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                    <Image
                        src="/assets/Mainlogo.png"
                        alt="Mentor"
                        width={1920}
                        height={1080}
                        priority
                        className="mentor-nav-logo h-auto w-full object-contain"
                    />
                </Link>

                <nav aria-label="Main navigation" className="hidden w-fit items-center gap-5 lg:flex">
                    {navItems.map(({ label, href }) => {
                        return (
                            <Link
                                href={href}
                                key={label}
                                aria-current={isActive(href) ? "page" : undefined}
                                className={cn('nav-link-base', isActive(href) ? 'nav-link-active' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]')}
                            >
                                {label}
                            </Link>
                        )
                    })}

                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                        <SignedOut>
                            <Link href="/sign-in" className="nav-link-base text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
                                Sign in
                            </Link>
                            <Link
                                href="/sign-up"
                                className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-[var(--navy-900)] transition-colors hover:bg-[var(--gold-hover)]"
                            >
                                Start Learning
                            </Link>
                        </SignedOut>
                        <SignedIn>
                            <div className="flex items-center gap-3">
                                <Link
                                    href="/courses"
                                    className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-[var(--navy-900)] transition-colors hover:bg-[var(--gold-hover)]"
                                >
                                    My courses
                                </Link>
                                <UserButton />
                                {user?.firstName && (
                                    <span className="nav-user-name text-[var(--ink-soft)]">
                                        {user.firstName}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                    className="nav-link-base text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
                                >
                                    Sign out
                                </button>
                            </div>
                        </SignedIn>
                    </div>
                </nav>
                <div className="flex items-center gap-2 lg:hidden">
                <ThemeToggle />
                <button
                    type="button"
                    aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                    aria-expanded={isMobileMenuOpen}
                    aria-controls="mobile-main-navigation"
                    onClick={() => setIsMobileMenuOpen((open) => !open)}
                    className="icon-btn size-11 shrink-0 border border-[var(--navy-border)]"
                >
                    {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                </button>
                </div>
            </div>
            {isMobileMenuOpen && (
                <div id="mobile-main-navigation" className="anim-rise max-h-[calc(100dvh-var(--navbar-height))] overflow-y-auto border-t border-[var(--navy-border)] bg-[var(--navy-800)] px-4 pb-4 pt-2 shadow-lg lg:hidden">
                    <nav aria-label="Mobile main navigation" className="mx-auto flex max-w-7xl flex-col gap-1">
                        {navItems.map(({ label, href }) => (
                            <Link
                                href={href}
                                key={label}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                    "rounded-xl px-3 py-3 text-sm font-medium",
                                    isActive(href) ? "bg-[rgba(212,175,55,0.12)] text-[var(--gold)]" : "text-[var(--ink)] hover:bg-[var(--navy-700)]",
                                )}
                            >
                                {label}
                            </Link>
                        ))}
                        <div className="mt-2 border-t border-[var(--navy-border)] pt-3">
                            <SignedOut>
                                <div className="flex gap-3 px-3">
                                    <Link
                                        href="/sign-in"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[var(--navy-border)] px-4 text-sm font-medium text-[var(--ink)]"
                                    >
                                        Sign in
                                    </Link>
                                    <Link
                                        href="/sign-up"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-[var(--gold)] px-4 text-sm font-semibold text-[var(--navy-900)]"
                                    >
                                        Start Learning
                                    </Link>
                                </div>
                            </SignedOut>
                            <SignedIn>
                                <div className="flex flex-col gap-2 px-3">
                                    <div className="flex items-center gap-3 py-2">
                                        <UserButton />
                                        <span className="text-sm font-medium text-[var(--ink)]">
                                            {user?.firstName ?? "Your account"}
                                        </span>
                                    </div>
                                    <Link
                                        href="/courses"
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex min-h-11 items-center justify-center rounded-lg bg-[var(--gold)] px-4 text-sm font-semibold text-[var(--navy-900)]"
                                    >
                                        My courses
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={handleSignOut}
                                        className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--navy-border)] px-4 text-sm font-medium text-[var(--ink)]"
                                    >
                                        <LogOut className="size-4" />
                                        Sign out
                                    </button>
                                </div>
                            </SignedIn>
                        </div>
                    </nav>
                </div>
            )}
        </header>
    )
}

export default Navbar
