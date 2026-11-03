import "server-only";

import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/database/mongoose";
import User from "@/database/models/user.model";

async function loadAdmin(userId: string) {
    await connectToDatabase();
    const user = await User.findOne({ userClerkId: userId, isAdmin: true, deletedAt: { $exists: false } })
        .select("userClerkId fullName email")
        .lean<{ userClerkId: string; fullName: string; email: string }>();
    return user;
}

/** Admin status lives only in MongoDB and is re-checked on every admin request. */
export async function requireAdminPage() {
    const { userId } = await auth();
    if (!userId) redirect("/sign-in");
    const admin = await loadAdmin(userId);
    if (!admin) notFound();
    return admin;
}

export async function requireAdminApi(): Promise<
    { admin: { userClerkId: string; fullName: string; email: string } } | { response: NextResponse }
> {
    const { userId } = await auth();
    if (!userId) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    const admin = await loadAdmin(userId);
    if (!admin) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    return { admin };
}
