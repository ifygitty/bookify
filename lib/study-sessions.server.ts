import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/database/mongoose";
import StudySession from "@/database/models/study-session.model";

export const SESSION_IDLE_MS = 30 * 60 * 1000;

export type StudyActivity =
    | "chat"
    | "quiz_generated"
    | "quiz_submitted"
    | "flashcards_generated"
    | "flashcard_review"
    | "outline"
    | "revision_plan"
    | "material_upload";

/**
 * A study session is a run of meaningful study actions with gaps under 30 minutes.
 * Page loads and logins never create sessions. Never throws.
 */
export async function recordStudyActivity(input: { userClerkId: string; courseId?: string; activity: StudyActivity }) {
    try {
        await connectToDatabase();
        const now = new Date();
        const cutoff = new Date(now.getTime() - SESSION_IDLE_MS);
        const courseObjectId =
            input.courseId && Types.ObjectId.isValid(input.courseId) ? new Types.ObjectId(input.courseId) : undefined;

        // Atomically extend a still-active session.
        const extended = await StudySession.findOneAndUpdate(
            { userClerkId: input.userClerkId, status: "active", lastActivityAt: { $gte: cutoff } },
            [
                {
                    $set: {
                        lastActivityAt: now,
                        activityCount: { $add: ["$activityCount", 1] },
                        activityTypes: { $setUnion: ["$activityTypes", [input.activity]] },
                        durationSeconds: {
                            $max: [0, { $round: [{ $divide: [{ $subtract: [now, "$startedAt"] }, 1000] }, 0] }],
                        },
                        courseId: { $ifNull: ["$courseId", courseObjectId ?? null] },
                    },
                },
            ],
            { new: true },
        );
        if (extended) return;

        // Close stale sessions at their last activity so they never overlap or inflate duration.
        await StudySession.updateMany(
            { userClerkId: input.userClerkId, status: "active", lastActivityAt: { $lt: cutoff } },
            [{ $set: { status: "completed", endedAt: "$lastActivityAt" } }],
        );

        await StudySession.create({
            userClerkId: input.userClerkId,
            courseId: courseObjectId,
            startedAt: now,
            lastActivityAt: now,
            durationSeconds: 0,
            activityTypes: [input.activity],
            activityCount: 1,
            status: "active",
        });
    } catch (error) {
        console.error("Could not record study activity", { activity: input.activity, error });
    }
}
