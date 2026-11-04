import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { connectToDatabase } from "@/database/mongoose";
import User, { type UserRecord } from "@/database/models/user.model";

const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

type ClerkUserLike = {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    primaryEmailAddressId?: string | null;
    emailAddresses?: { id: string; emailAddress: string }[];
    email_addresses?: { id: string; email_address: string }[];
    first_name?: string | null;
    last_name?: string | null;
    primary_email_address_id?: string | null;
};

export function extractClerkProfile(user: ClerkUserLike) {
    const firstName = user.firstName ?? user.first_name ?? "";
    const lastName = user.lastName ?? user.last_name ?? "";
    const primaryId = user.primaryEmailAddressId ?? user.primary_email_address_id;
    const emails = user.emailAddresses
        ? user.emailAddresses.map((e) => ({ id: e.id, address: e.emailAddress }))
        : (user.email_addresses ?? []).map((e) => ({ id: e.id, address: e.email_address }));
    const email = (emails.find((e) => e.id === primaryId) ?? emails[0])?.address ?? "";
    const named = `${firstName ?? ""} ${lastName ?? ""}`.trim();
    const fullName = named || user.username || (email ? email.split("@")[0] : "") || "Elio student";

    return {
        email: email || `${user.id}@unknown.invalid`,
        fullName: fullName.slice(0, 120),
    };
}

export async function upsertUserFromClerk(
    clerkUser: ClerkUserLike,
    options: { eventAt?: Date; loginAt?: Date } = {},
) {
    await connectToDatabase();
    const profile = extractClerkProfile(clerkUser);
    const eventAt = options.eventAt;

    // Out-of-order webhook deliveries must not overwrite newer data.
    const filter: Record<string, unknown> = { userClerkId: clerkUser.id };
    if (eventAt) {
        filter.$or = [
            { lastClerkEventAt: { $exists: false } },
            { lastClerkEventAt: null },
            { lastClerkEventAt: { $lte: eventAt } },
        ];
    }

    const set: Record<string, unknown> = { ...profile };
    if (eventAt) set.lastClerkEventAt = eventAt;
    if (options.loginAt) set.lastLoginAt = options.loginAt;

    try {
        return await User.findOneAndUpdate(
            filter,
            { $set: set, $unset: { deletedAt: "" }, $setOnInsert: { userClerkId: clerkUser.id, isAdmin: false } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean<UserRecord>();
    } catch (error) {
        // A duplicate key means the filter skipped a stale event for an existing user.
        if ((error as { code?: number }).code === 11000) {
            return User.findOne({ userClerkId: clerkUser.id }).lean<UserRecord>();
        }
        throw error;
    }
}

export async function markUserDeleted(userClerkId: string, eventAt?: Date) {
    await connectToDatabase();
    await User.updateOne(
        { userClerkId },
        { $set: { deletedAt: new Date(), isAdmin: false, ...(eventAt ? { lastClerkEventAt: eventAt } : {}) } },
    );
}

export async function recordUserLogin(userClerkId: string, at = new Date()) {
    await connectToDatabase();
    await User.updateOne({ userClerkId }, { $set: { lastLoginAt: at, lastActiveAt: at } });
}

/**
 * Ensures a Mongo user exists for the signed-in Clerk user, detects a new login via the
 * Clerk session id, and refreshes last-active at most every few minutes.
 */
export async function ensureCurrentUser() {
    const { userId, sessionId } = await auth();
    if (!userId) return null;

    await connectToDatabase();
    const now = new Date();
    let user = await User.findOne({ userClerkId: userId }).lean<UserRecord>();

    if (!user) {
        const client = await clerkClient();
        const clerkUser = await client.users.getUser(userId);
        user = await upsertUserFromClerk(clerkUser, { loginAt: now });
        if (!user) return null;
        await User.updateOne({ userClerkId: userId }, { $set: { lastActiveAt: now, lastSessionId: sessionId ?? undefined } });
        return { ...user, lastActiveAt: now };
    }

    const set: Record<string, unknown> = {};
    if (sessionId && user.lastSessionId !== sessionId) {
        set.lastSessionId = sessionId;
        set.lastLoginAt = now;
    }
    if (!user.lastActiveAt || now.getTime() - user.lastActiveAt.getTime() > ACTIVITY_THROTTLE_MS) {
        set.lastActiveAt = now;
    }
    if (user.deletedAt) set.deletedAt = null;

    if (Object.keys(set).length) {
        await User.updateOne({ userClerkId: userId }, { $set: set });
        user = { ...user, ...(set as Partial<UserRecord>) };
    }
    return user;
}
