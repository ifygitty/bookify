import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";

import { connectToDatabase } from "@/database/mongoose";
import User from "@/database/models/user.model";

// Only fullName is accepted; identity and admin fields can never be set from the client.
const schema = z
    .object({
        fullName: z
            .string()
            .transform((value) => value.replace(/\s+/g, " ").trim())
            .pipe(z.string().min(2, "Name must be at least 2 characters.").max(80, "Name must be 80 characters or fewer.").regex(/^[^\u0000-\u001f\u007f<>]+$/, "Name contains invalid characters.")),
    })
    .strict();

export async function PATCH(request: Request) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid name." }, { status: 400 });
    }
    const { fullName } = parsed.data;
    const [firstName, ...rest] = fullName.split(" ");

    try {
        const client = await clerkClient();
        await client.users.updateUser(userId, { firstName, lastName: rest.join(" ") });
    } catch (error) {
        console.error("Clerk name update failed.", error);
        return NextResponse.json({ error: "Could not update your name right now. Please try again." }, { status: 502 });
    }

    try {
        await connectToDatabase();
        const update = () => User.updateOne({ userClerkId: userId }, { $set: { fullName } });
        try {
            await update();
        } catch {
            await update();
        }
    } catch (error) {
        // Clerk already changed; the user.updated webhook will reconcile Mongo.
        console.error("Mongo name update failed after Clerk update.", error);
    }

    return NextResponse.json({ fullName });
}
