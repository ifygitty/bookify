import "server-only";

import { Types } from "mongoose";

import { connectToDatabase } from "@/database/mongoose";
import AiUsage from "@/database/models/ai-usage.model";
import User from "@/database/models/user.model";
import { estimateCost, PRICE_VERSION } from "@/lib/ai-pricing";

export type AiUsageContext = {
    userClerkId: string;
    courseId?: string;
    operation: string;
    /** Used when the response does not echo the model name. */
    model?: string;
};

type ResponseWithUsage = {
    id?: string;
    model?: string;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
    } | null;
};

async function recordUsage(ctx: AiUsageContext, response: ResponseWithUsage | null, failed: boolean) {
    try {
        const usage = response?.usage;
        const modelName = response?.model ?? ctx.model ?? "unknown";
        const inputTokens = usage?.input_tokens ?? 0;
        const outputTokens = usage?.output_tokens ?? 0;
        const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens;
        const cachedInputTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
        const cost = failed && !usage ? 0 : estimateCost(modelName, inputTokens, outputTokens, cachedInputTokens);

        await connectToDatabase();
        const created = await AiUsage.create({
            userClerkId: ctx.userClerkId,
            courseId: ctx.courseId && Types.ObjectId.isValid(ctx.courseId) ? new Types.ObjectId(ctx.courseId) : undefined,
            operation: ctx.operation,
            model: modelName,
            inputTokens,
            outputTokens,
            totalTokens,
            cachedInputTokens,
            estimatedCost: cost,
            status: failed ? "failed" : "success",
            responseId: response?.id,
            priceVersion: PRICE_VERSION,
        });

        // The ledger insert is the source of truth; the user totals are only a denormalized cache for sorting.
        await User.updateOne(
            { userClerkId: ctx.userClerkId },
            {
                $inc: {
                    "aiUsage.calls": 1,
                    "aiUsage.inputTokens": inputTokens,
                    "aiUsage.outputTokens": outputTokens,
                    "aiUsage.totalTokens": totalTokens,
                    "aiUsage.estimatedCost": cost ?? 0,
                    "aiUsage.unpricedCalls": cost === null ? 1 : 0,
                },
            },
        );
        return created;
    } catch (error) {
        if ((error as { code?: number }).code === 11000) return null;
        console.error("Could not record AI usage", { operation: ctx.operation, error });
        return null;
    }
}

/** Runs an OpenAI call and records its token usage. Recording problems never break the request itself. */
export async function trackAiUsage<T extends ResponseWithUsage>(ctx: AiUsageContext, call: () => Promise<T>): Promise<T> {
    let response: T;
    try {
        response = await call();
    } catch (error) {
        await recordUsage(ctx, null, true);
        throw error;
    }
    await recordUsage(ctx, response, false);
    return response;
}
