"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useDialogs } from "@/components/dialogs/DialogProvider";

export default function BackfillButton() {
    const { confirmDialog, showAlert } = useDialogs();
    const router = useRouter();
    const [running, setRunning] = useState(false);

    const run = async () => {
        const ok = await confirmDialog({
            title: "Import existing users?",
            description: "This copies every Clerk account into the database. Existing admin flags are not changed.",
            confirmText: "Import",
        });
        if (!ok) return;

        setRunning(true);
        try {
            let offset = 0;
            let imported = 0;
            for (;;) {
                const response = await fetch("/api/admin/users/backfill", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ offset }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Import failed.");
                imported += result.processed;
                offset = result.nextOffset;
                if (result.done) break;
            }
            await showAlert({ title: "Import complete", description: `${imported} user(s) synced.`, variant: "success" });
            router.refresh();
        } catch (error) {
            await showAlert({ title: "Import failed", description: error instanceof Error ? error.message : "Import failed.", variant: "error" });
        } finally {
            setRunning(false);
        }
    };

    return (
        <button type="button" className="admin-chip" onClick={run} disabled={running}>
            {running ? "Importing…" : "Import existing users"}
        </button>
    );
}
