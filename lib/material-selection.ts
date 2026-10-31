export function toggleMaterialSelection(materialIds: string[], materialId: string): string[] {
    return materialIds.includes(materialId)
        ? materialIds.filter((id) => id !== materialId)
        : [...materialIds, materialId];
}
