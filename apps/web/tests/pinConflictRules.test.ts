import assert from "node:assert/strict";
import test from "node:test";
import {
  conflictsWithPlacedComponents,
  layoutFromComponent,
  placementHasPinConflicts,
  pinsConflict
} from "../src/features/board/placement.ts";
import { createBoardModel, normalizeBoardDefinition } from "../src/features/board/factory.ts";
import { createBreadboardDefinition } from "../src/features/board/breadboard.ts";
import type { PlacedComponent } from "../src/types/project.ts";

const perfboard = createBoardModel(normalizeBoardDefinition({ kind: "perfboard", width: 30, height: 20 }));
const breadboard = createBoardModel(createBreadboardDefinition(40, 1));

function singlePin(ref: string, position: [number, number], kind: PlacedComponent["kind"] = "pin_header"): PlacedComponent {
  return {
    id: `id-${ref}`,
    kind,
    label: ref,
    name: ref,
    value: "",
    pinCount: 1,
    leadSpacing: 1,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0]],
    position,
    rotation: 0,
    mounted: true
  };
}

/* ── the rule itself ──────────────────────────────────────────────────── */

test("one hole takes at most one pin, even on the same net (perfboard)", () => {
  assert.equal(pinsConflict(perfboard, [5, 5], "N1", [5, 5], "N1"), true);
});

test("one hole takes at most one pin on a breadboard too", () => {
  assert.equal(pinsConflict(breadboard, [3, 5], "N1", [3, 5], "N1"), true);
});

test("different perfboard holes never conflict, even with different nets", () => {
  assert.equal(pinsConflict(perfboard, [5, 5], "N1", [6, 5], "N2"), false);
});

test("a shared breadboard row is fine for one net and a conflict across nets", () => {
  assert.equal(pinsConflict(breadboard, [3, 5], "N1", [6, 5], "N1"), false);
  assert.equal(pinsConflict(breadboard, [3, 5], "N1", [6, 5], "N2"), true);
});

test("a shared node with an unknown net is a conflict", () => {
  assert.equal(pinsConflict(breadboard, [3, 5], undefined, [6, 5], "N1"), true);
  assert.equal(pinsConflict(breadboard, [3, 5], "N1", [6, 5], undefined), true);
});

test("different breadboard rows never share a node", () => {
  assert.equal(pinsConflict(breadboard, [3, 5], undefined, [3, 6], undefined), false);
});

/* ── component level helpers ──────────────────────────────────────────── */

test("two components may not land on the same perfboard hole", () => {
  const first = singlePin("A", [5, 5]);
  const second = singlePin("B", [5, 5]);
  const layouts = [layoutFromComponent(first, { 1: "N1" }), layoutFromComponent(second, { 1: "N1" })];
  assert.equal(conflictsWithPlacedComponents(perfboard, layouts[0], [layouts[1]]), true);
  assert.equal(placementHasPinConflicts(perfboard, layouts), true);
});

test("two components sharing a breadboard row on one net are accepted", () => {
  const first = singlePin("A", [3, 5]);
  const second = singlePin("B", [6, 5]);
  const layouts = [layoutFromComponent(first, { 1: "N1" }), layoutFromComponent(second, { 1: "N1" })];
  assert.equal(placementHasPinConflicts(breadboard, layouts), false);
});

test("two components sharing a breadboard row on different nets are rejected", () => {
  const first = singlePin("A", [3, 5]);
  const second = singlePin("B", [6, 5]);
  const layouts = [layoutFromComponent(first, { 1: "N1" }), layoutFromComponent(second, { 1: "N2" })];
  assert.equal(placementHasPinConflicts(breadboard, layouts), true);
});
