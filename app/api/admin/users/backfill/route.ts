import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import { requireAdminApi } from "@/lib/admin.server";
import { upsertUserFromClerk } from "@/lib/users.server";

const PAGE_LIMIT = 100;
const MAX_PAGES_PER_CALL = 3;

// Imports existing Clerk users into MongoDB in resumable chunks. Never changes isAdmin of existing users.
export async function POST(request: Request) {
    const guard = await requireAdminApi();
    if ("response" in guard) return guard.response;

    const body = await request.json().catch(() => ({}));
    let offset = Number.isInteger(body?.offset) && body.offset >= 0 ? (body.offset as number) : 0;

    try {
        const client = await clerkClient();
        let processed = 0;
        let total = 0;
        let done = false;

        for (let page = 0; page < MAX_PAGES_PER_CALL; page++) {
            const result = await client.users.getUserList({ limit: PAGE_LIMIT, offset, orderBy: "+created_at" });
            total = result.totalCount;
            for (const user of result.data) {
                await upsertUserFromClerk(user);
                processed += 1;
            }
            offset += result.data.length;
            if (result.data.length < PAGE_LIMIT || offset >= total) {
                done = true;
                break;
            }
        }

        return NextResponse.json({ processed, nextOffset: offset, total, done });
    } catch (error) {
        console.error("User backfill failed.", error);
        return NextResponse.json({ error: "Could not import users right now." }, { status: 500 });
    }
}
