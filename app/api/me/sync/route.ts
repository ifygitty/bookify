import { NextResponse } from "next/server";

import { ensureCurrentUser } from "@/lib/users.server";

export const runtime = "nodejs";

export async function POST() {
    try {
        const user = await ensureCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        return NextResponse.json({ isAdmin: user.isAdmin === true });
    } catch (error) {
        console.error("Account sync failed", error);
        return NextResponse.json({ error: "Could not sync account" }, { status: 500 });
    }
}
