"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useDialogs } from "@/components/dialogs/DialogProvider";

export default function ProfileNameForm({ initialName }: { initialName: string }) {
    const { showAlert } = useDialogs();
    const router = useRouter();
    const [name, setName] = useState(initialName);
    const [saving, setSaving] = useState(false);
    const unchanged = name.trim() === initialName;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const response = await fetch("/api/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fullName: name }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Could not update your name.");
            setName(result.fullName);
            await showAlert({ title: "Name updated", description: "Your profile has been saved.", variant: "success" });
            router.refresh();
        } catch (error) {
            await showAlert({ title: "Could not save", description: error instanceof Error ? error.message : "Please try again.", variant: "error" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="grid gap-3">
            <label className="text-sm font-semibold" htmlFor="fullName">Full name</label>
            <input id="fullName" className="mentor-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            <button type="submit" className="mentor-cta w-fit" disabled={saving || unchanged}>
                {saving ? "Saving…" : "Save name"}
            </button>
        </form>
    );
}
