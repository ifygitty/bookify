// USD per 1,000,000 tokens. VERIFY these against https://platform.openai.com/docs/pricing
// and bump PRICE_VERSION whenever they change; historical rows keep the version they were priced with.
export const PRICE_VERSION = "2025-01-unverified";

type ModelPrice = { input: number; cachedInput: number; output: number };

const MODEL_PRICES: Record<string, ModelPrice> = {
    "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
    "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
    "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
    "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
    "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
};

// Longest prefix first so "gpt-4.1-mini-2025-04-14" matches "gpt-4.1-mini", not "gpt-4.1".
const PRICE_KEYS = Object.keys(MODEL_PRICES).sort((a, b) => b.length - a.length);

export function getModelPrice(modelName: string): ModelPrice | null {
    const key = PRICE_KEYS.find((candidate) => modelName.startsWith(candidate));
    return key ? MODEL_PRICES[key] : null;
}

/** Returns null when the model has no configured price, so cost is shown as unavailable rather than $0. */
export function estimateCost(modelName: string, inputTokens: number, outputTokens: number, cachedInputTokens = 0) {
    const price = getModelPrice(modelName);
    if (!price) return null;
    const cached = Math.min(cachedInputTokens, inputTokens);
    const uncached = inputTokens - cached;
    return (uncached * price.input + cached * price.cachedInput + outputTokens * price.output) / 1_000_000;
}
