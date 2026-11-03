"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

type AccountState = { isAdmin: boolean };

const AccountContext = createContext<AccountState>({ isAdmin: false });

export function useAccount() {
    return useContext(AccountContext);
}

/** Syncs the Clerk user into MongoDB and keeps last-active fresh. The isAdmin flag is for UI only. */
export default function AccountProvider({ children }: { children: ReactNode }) {
    const { isLoaded, isSignedIn, userId } = useAuth();
    const [adminFor, setAdminFor] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoaded || !isSignedIn || !userId) return;
        let cancelled = false;

        const sync = async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const response = await fetch("/api/me/sync", { method: "POST" });
                if (!response.ok) return;
                const data = (await response.json()) as { isAdmin?: boolean };
                if (!cancelled) setAdminFor(data.isAdmin ? userId : null);
            } catch {
                // Sync is best-effort; the next tick retries.
            }
        };

        void sync();
        const interval = window.setInterval(sync, SYNC_INTERVAL_MS);
        document.addEventListener("visibilitychange", sync);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", sync);
        };
    }, [isLoaded, isSignedIn, userId]);

    return (
        <AccountContext.Provider value={{ isAdmin: Boolean(userId && adminFor === userId) }}>
            {children}
        </AccountContext.Provider>
    );
}
