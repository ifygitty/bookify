import assert from "node:assert/strict";
import test from "node:test";
import {
    getConversationKey,
    normalizeMaterialIds,
    resolveMaterialSelection,
} from "../lib/course-chat-selection.ts";
import { toggleMaterialSelection } from "../lib/material-selection.ts";

const materialIdA = "64b000000000000000000001";
const materialIdB = "64b000000000000000000002";

test("normalizes single and multiple valid material IDs", () => {
    assert.deepEqual(normalizeMaterialIds([materialIdA]), [materialIdA]);
    assert.deepEqual(normalizeMaterialIds([materialIdB, materialIdA]), [materialIdA, materialIdB]);
});

test("rejects empty, malformed, and duplicate material selections", () => {
    assert.equal(normalizeMaterialIds([]), null);
    assert.equal(normalizeMaterialIds([materialIdA, "not-an-object-id"]), null);
    assert.equal(normalizeMaterialIds([materialIdA, materialIdA]), null);
    assert.equal(normalizeMaterialIds([materialIdA, materialIdA.toUpperCase()]), null);
});

test("conversation keys are stable per exact selection and differ across selections", () => {
    assert.equal(
        getConversationKey([materialIdA, materialIdB]),
        getConversationKey([materialIdB, materialIdA]),
    );
    assert.notEqual(getConversationKey([materialIdA]), getConversationKey([materialIdA, materialIdB]));
});

test("selection resolves only materials belonging to the loaded course", () => {
    const courseMaterials = [
        { _id: { toString: () => materialIdA }, title: "Lecture notes" },
        { _id: { toString: () => materialIdB }, title: "Past questions" },
    ];
    assert.deepEqual(
        resolveMaterialSelection(courseMaterials, [materialIdB, materialIdA])?.map((item) => item.title),
        ["Past questions", "Lecture notes"],
    );
    assert.equal(resolveMaterialSelection(courseMaterials, ["64b000000000000000000003"]), null);
});

test("individual selection toggles add and remove one material without duplicates", () => {
    assert.deepEqual(toggleMaterialSelection([materialIdA], materialIdB), [materialIdA, materialIdB]);
    assert.deepEqual(toggleMaterialSelection([materialIdA, materialIdB], materialIdA), [materialIdB]);
    assert.deepEqual(toggleMaterialSelection([materialIdA, materialIdA], materialIdA), []);
});
