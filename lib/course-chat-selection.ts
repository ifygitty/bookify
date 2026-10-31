import { createHash } from "node:crypto";

const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export function normalizeMaterialIds(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.length === 0 || !value.every((id) => typeof id === "string")) {
        return null;
    }

    const ids = (value as string[]).map((id) => id.toLowerCase());
    if (ids.some((id) => !MONGO_OBJECT_ID_PATTERN.test(id)) || new Set(ids).size !== ids.length) {
        return null;
    }

    return ids.sort();
}

export function getConversationKey(materialIds: string[]): string {
    return createHash("sha256").update([...materialIds].sort().join(":")).digest("hex");
}

export type MaterialWithId = {
    _id: { toString(): string };
};

export function resolveMaterialSelection<T extends MaterialWithId>(
    materials: readonly T[],
    materialIds: string[],
): T[] | null {
    const materialById = new Map(materials.map((material) => [material._id.toString().toLowerCase(), material]));
    const selected = materialIds.map((id) => materialById.get(id));
    return selected.every((material) => material !== undefined)
        ? selected.filter((material): material is T => material !== undefined)
        : null;
}
