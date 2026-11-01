"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function LandingReveal({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        if (
            window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
            !("IntersectionObserver" in window)
        ) {
            element.dataset.landingVisible = "true";
            element.dataset.landingEnhanced = "true";
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                element.dataset.landingVisible = "true";
                observer.unobserve(entry.target);
            },
            { threshold: 0.12 },
        );
        observer.observe(element);
        element.dataset.landingEnhanced = "true";

        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className={className}
            data-landing-enhanced="false"
            data-landing-visible="false"
        >
            {children}
        </div>
    );
}
