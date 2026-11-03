import { NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";

import { markUserDeleted, recordUserLogin, upsertUserFromClerk } from "@/lib/users.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
    let event;
    try {
        event = await verifyWebhook(request as never);
    } catch (error) {
        console.error("Clerk webhook verification failed", error);
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    const rawTimestamp = (event as { timestamp?: number }).timestamp;
    const eventAt = typeof rawTimestamp === "number" ? new Date(rawTimestamp) : undefined;

    try {
        switch (event.type) {
            case "user.created":
            case "user.updated":
                await upsertUserFromClerk(event.data as never, { eventAt });
                break;
            case "user.deleted":
                if (event.data.id) await markUserDeleted(event.data.id, eventAt);
                break;
            case "session.created": {
                const userId = (event.data as { user_id?: string }).user_id;
                if (userId) await recordUserLogin(userId, eventAt ?? new Date());
                break;
            }
            default:
                break;
        }
    } catch (error) {
        console.error("Clerk webhook handling failed", { type: event.type, error });
        // A non-2xx response makes Clerk retry delivery.
        return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
