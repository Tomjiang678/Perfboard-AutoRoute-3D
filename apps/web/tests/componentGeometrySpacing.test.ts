import assert from "node:assert/strict";
import test from "node:test";
import { buildPinOffsetsForComponent, getLibraryComponentByKind } from "../src/features/project/componentLibrary.ts";

function offsets(kind: Parameters<typeof getLibraryComponentByKind>[0], patch: Record<string, number>) {
  const definition = getLibraryComponentByKind(kind);
  assert.ok(definition, `missing library definition for ${kind}`);
  return buildPinOffsetsForComponent({ ...definition, ...patch });
}

test("editable lead spacing changes TO-220, TO-247 and bridge rectifier pin positions", () => {
  assert.notDeepEqual(offsets("to220", { leadSpacing: 1 }), offsets("to220", { leadSpacing: 2 }));
  assert.notDeepEqual(offsets("to247", { leadSpacing: 2 }), offsets("to247", { leadSpacing: 3 }));
  assert.notDeepEqual(offsets("bridge_rectifier", { leadSpacing: 1 }), offsets("bridge_rectifier", { leadSpacing: 2 }));
});

test("editable TO-3 lead spacing changes the outer pin separation", () => {
  assert.notDeepEqual(offsets("to3", { leadSpacing: 2 }), offsets("to3", { leadSpacing: 3 }));
});

test("editable relay row spacing changes the switch pin rows", () => {
  assert.notDeepEqual(offsets("relay", { rowSpacing: 1 }), offsets("relay", { rowSpacing: 2 }));
  assert.deepEqual(offsets("relay", { pinCount: 5, rowSpacing: 1 }), [[0, 0], [1, 0], [0, 2], [1, 2], [2, 2]]);
});

test("TO-39 library default starts at its minimum supported lead spacing", () => {
  const definition = getLibraryComponentByKind("to39");
  assert.ok(definition);
  assert.equal(definition.leadSpacing, 2);
  assert.deepEqual(offsets("to39", { leadSpacing: definition.leadSpacing }), [[-2, 0], [2, 0], [0, 1]]);
});
