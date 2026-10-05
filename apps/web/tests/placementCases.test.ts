import assert from "node:assert/strict";
import test from "node:test";
import { componentPinHoles, pinGridPosition, rotateGridOffset, validateBasicPlacement } from "../src/features/board/placement.ts";
import { createBoardModel, normalizeBoardDefinition } from "../src/features/board/factory.ts";
import { createBreadboardDefinition } from "../src/features/board/breadboard.ts";
import type { PlacedComponent } from "../src/types/project.ts";

function component(overrides: Partial<PlacedComponent> = {}): PlacedComponent {
  return {
    id: "c1",
    kind: "resistor",
    label: "R",
    name: "R1",
    value: "",
    pinCount: 2,
    leadSpacing: 3,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [3, 0]],
    position: [5, 5],
    rotation: 0,
    mounted: true,
    ...overrides
  };
}

const perfboard = createBoardModel(normalizeBoardDefinition({ kind: "perfboard", width: 30, height: 20 }));
const breadboard = createBoardModel(createBreadboardDefinition(30, 1));

/* ── pin geometry ─────────────────────────────────────────────────────── */

for (const rotation of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
  test(`pinGridPosition rotates correctly by ${Math.round((rotation / Math.PI) * 180)}°`, () => {
    const rotated = rotateGridOffset([3, 0], rotation);
    const holes = componentPinHoles(component({ position: [0, 0], rotation }));
    // JSON normalizes -0 to 0, avoiding the -0/+0 identity trap.
    assert.equal(JSON.stringify(holes), JSON.stringify([[0, 0], rotated]));
  });
}

test("componentPinHoles lists one hole per pin", () => {
  assert.deepEqual(componentPinHoles(component({ position: [4, 6] })), [[4, 6], [7, 6]]);
});

test("pinGridPosition falls back to the anchor for unknown pins", () => {
  assert.deepEqual(pinGridPosition(component(), 99), [5, 5]);
});

/* ── perfboard placement validation ───────────────────────────────────── */

test("valid perfboard placement passes", () => {
  assert.equal(validateBasicPlacement(perfboard, component()).valid, true);
});

for (const position of [[28, 5], [-1, 5], [5, 20], [5, -1], [100, 100]] as Array<[number, number]>) {
  test(`perfboard placement at ${position} reports invalid_hole`, () => {
    const result = validateBasicPlacement(perfboard, component({ position }));
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === "invalid_hole"));
  });
}

test("two pins on the same hole report duplicate_pin_hole", () => {
  const result = validateBasicPlacement(perfboard, component({ pinOffsets: [[0, 0], [0, 0]] }));
  assert.ok(result.issues.some((issue) => issue.code === "duplicate_pin_hole"));
});

/* ── shared electrical node (breadboard) ──────────────────────────────── */

test("two pins on one breadboard node report shared_electrical_node", () => {
  const result = validateBasicPlacement(breadboard, component({ position: [3, 0], pinOffsets: [[0, 0], [2, 0]] }));
  assert.ok(result.issues.some((issue) => issue.code === "shared_electrical_node"));
});

test("same-node pins with one common net are allowed", () => {
  const result = validateBasicPlacement(
    breadboard,
    component({ position: [3, 0], pinOffsets: [[0, 0], [2, 0]] }),
    { 1: "N1", 2: "N1" }
  );
  assert.equal(result.valid, true);
});

test("same-node pins with different nets stay invalid", () => {
  const result = validateBasicPlacement(
    breadboard,
    component({ position: [3, 0], pinOffsets: [[0, 0], [2, 0]] }),
    { 1: "N1", 2: "N2" }
  );
  assert.ok(result.issues.some((issue) => issue.code === "shared_electrical_node"));
});

test("pins bridging the channel are on different nodes and pass", () => {
  const result = validateBasicPlacement(breadboard, component({ position: [7, 0], pinOffsets: [[0, 0], [3, 0]] }));
  assert.equal(result.valid, true);
});

test("breadboard rail gaps reject placements", () => {
  const result = validateBasicPlacement(breadboard, component({ position: [0, 5] }));
  assert.ok(result.issues.some((issue) => issue.code === "invalid_hole"));
});

test("power pins on the rail need a power net", () => {
  const singlePin = component({ pinCount: 1, pinOffsets: [[0, 0]], position: [0, 0] });
  const result = breadboard.validatePlacement(singlePin, { 1: "SIG" });
  assert.ok(result.issues.some((issue) => issue.code === "power_rail_requires_power_net"));
});

test("power pins on the rail with a power net pass", () => {
  const singlePin = component({ pinCount: 1, pinOffsets: [[0, 0]], position: [0, 0] });
  const result = breadboard.validatePlacement(singlePin, { 1: "VCC" });
  assert.equal(result.valid, true);
});
