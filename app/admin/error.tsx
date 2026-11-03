"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <div className="admin-card glass text-center" role="alert">
            <h2 className="mentor-title text-xl font-bold">Could not load this admin view</h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
                Something went wrong while loading the data. Try again; if it keeps happening, check the server logs.
            </p>
            <button type="button" onClick={reset} className="mentor-cta mx-auto mt-4 w-fit">
                Try again
            </button>
        </div>
    );
}
