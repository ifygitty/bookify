import assert from "node:assert/strict";
import test from "node:test";
import {
    calculateOutlineCoverage,
    editableOutlineSchema,
    generatedCourseOutlineSchema,
    mapGeneratedOutline,
} from "../lib/course-outline.ts";

const materialA = "64b000000000000000000001";
const materialB = "64b000000000000000000002";

function generatedTopic(name, sources = ["SOURCE_1"], subtopics = []) {
    return {
        name,
        description: "",
        sourceKeys: sources,
        subtopics,
    };
}

test("maps only citations from retrieved materials and combines duplicate topics", () => {
    const result = mapGeneratedOutline(
        [
            generatedTopic("Double Entry", ["SOURCE_1"], [{
                name: "Debit and credit",
                description: "",
                sourceKeys: ["SOURCE_1"],
            }]),
            generatedTopic("double   entry", ["SOURCE_2"], [{
                name: "Debit and Credit",
                description: "Recording transactions in accounts.",
                sourceKeys: ["SOURCE_2"],
            }]),
        ],
        [
            { key: "SOURCE_1", id: materialA },
            { key: "SOURCE_2", id: materialB },
        ],
    );

    assert.equal(result.valid, true);
    assert.equal(result.topics.length, 1);
    assert.deepEqual(result.topics[0].materialIds, [materialA, materialB]);
    assert.equal(result.topics[0].subtopics.length, 1);
    assert.deepEqual(result.topics[0].subtopics[0].materialIds, [materialA, materialB]);
    assert.equal(result.topics[0].subtopics[0].description, "Recording transactions in accounts.");
});

test("rejects citations to selected materials whose passages were not retrieved", () => {
    const result = mapGeneratedOutline(
        [generatedTopic("Unverified topic", ["SOURCE_2"])],
        [{ key: "SOURCE_1", id: materialA }],
    );
    assert.equal(result.valid, false);
    assert.match(result.reason, /not retrieved/);
});

test("calculates main-topic coverage without counting subtopics and handles empty outlines", () => {
    assert.deepEqual(
        calculateOutlineCoverage([
            { status: "completed" },
            { status: "in_progress" },
            { status: "not_started" },
            { status: "completed" },
        ]),
        {
            totalTopics: 4,
            completed: 2,
            inProgress: 1,
            notStarted: 1,
            coveragePercent: 50,
        },
    );
    assert.deepEqual(calculateOutlineCoverage([]), {
        totalTopics: 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0,
        coveragePercent: null,
    });
});

test("validates editable outline status, IDs, title lengths, and nested limits", () => {
    const topic = {
        id: materialA,
        name: "Accounting equation",
        description: "The relationship between assets, liabilities, and equity.",
        status: "in_progress",
        materialIds: [materialA],
        subtopics: [{
            id: materialB,
            name: "Assets",
            description: "",
            materialIds: [materialA],
        }],
    };
    assert.equal(editableOutlineSchema.safeParse({ topics: [topic] }).success, true);
    assert.equal(editableOutlineSchema.safeParse({
        topics: [{ ...topic, status: "mastered" }],
    }).success, false);
    assert.equal(editableOutlineSchema.safeParse({
        topics: [{ ...topic, id: "bad-id" }],
    }).success, false);
});

test("requires generated topics to cite at least one source", () => {
    assert.equal(generatedCourseOutlineSchema.safeParse({
        sufficientContent: true,
        limitation: "",
        topics: [generatedTopic("Unsupported", [])],
    }).success, false);
});
