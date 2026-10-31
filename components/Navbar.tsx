'use client';

import Link from "next/link";
import Image from "next/image";
import {usePathname} from "next/navigation";
import { useState } from "react";
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { Menu, X } from "lucide-react";
import {cn} from "@/lib/utils";

const navItems = [
    { label: "Courses", href: "/courses" },
    { label: "Study progress", href: "/progress" },
    { label: "Pricing", href: "/subscriptions" },
]

const Navbar = () => {
    const pathName = usePathname();
    const { user } = useUser();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const isActive = (href: string) =>
        pathName === href || (href !== '/' && pathName.startsWith(href));

    return (
        <header className="fixed z-50 w-full border-b border-[var(--navy-border)] bg-[var(--navy-900)]">
            <div className="wrapper navbar-height py-4 flex justify-between items-center">
                <Link
                    href="/courses"
                    aria-label="Mentor home"
                    className="flex min-w-0 items-center"
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                    <span className="flex h-12 w-36 items-center justify-center overflow-hidden rounded-lg bg-white px-2">
                        <Image
                            src="/assets/mentor.png"
                            alt="Mentor"
                            width={1920}
                            height={1280}
                            priority
                            className="h-full w-full object-contain"
                        />
                    </span>
                </Link>

                <nav aria-label="Main navigation" className="hidden w-fit items-center gap-5 lg:flex">
                    {navItems.map(({ label, href }) => {
                        return (
                            <Link href={href} key={label} className={cn('nav-link-base', isActive(href) ? 'nav-link-active' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]')}>
                                {label}
                            </Link>
                        )
                    })}

                    <div className="flex gap-7.5 items-center">
                        <SignedOut>
                            <SignInButton mode="modal" />
                        </SignedOut>
                        <SignedIn>
                            <div className="nav-user-link">
                                <UserButton />
                                {user?.firstName && (
                                    <Link href="/subscriptions" className="nav-user-name">
                                        {user.firstName}
                                    </Link>
                                )}
                            </div>
                        </SignedIn>
                    </div>
                </nav>
                <button
                    type="button"
                    aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                    aria-expanded={isMobileMenuOpen}
                    aria-controls="mobile-main-navigation"
                    onClick={() => setIsMobileMenuOpen((open) => !open)}
                    className="icon-btn size-11 shrink-0 border border-[var(--navy-border)] lg:hidden"
                >
                    {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                </button>
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
                                <SignInButton mode="modal" />
                            </SignedOut>
                            <SignedIn>
                                <div className="flex items-center gap-3 px-3">
                                    <UserButton />
                                    {user?.firstName && (
                                        <Link href="/subscriptions" onClick={() => setIsMobileMenuOpen(false)} className="text-sm font-medium text-[var(--ink)]">
                                            {user.firstName}
                                        </Link>
                                    )}
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
