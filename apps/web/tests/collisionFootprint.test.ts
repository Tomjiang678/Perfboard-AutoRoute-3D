import assert from "node:assert/strict";
import test from "node:test";
import {
  bodiesOverlap,
  bodyPinOverlap,
  componentFootprint,
  componentOccupiedCells
} from "../src/features/collision/footprint.ts";
import type { PlacedComponent } from "../src/types/project.ts";

function dip(overrides: Partial<PlacedComponent> = {}): PlacedComponent {
  return {
    id: "u1",
    kind: "dip",
    label: "DIP-4",
    name: "U1",
    value: "X",
    pinCount: 4,
    leadSpacing: 1,
    rowSpacing: 3,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [0, 1], [3, 1], [3, 0]],
    position: [10, 10],
    rotation: 0,
    mounted: false,
    origin: "import",
    ...overrides
  };
}

test("built-in body footprint is larger than bare pin holes", () => {
  const footprint = componentFootprint(dip());
  assert.ok(footprint.bodyCells.size > 0);
  assert.ok(footprint.cells.size > footprint.pinCells.size);
});

test("a user package body contributes its real projected cells", () => {
  const footprint = componentFootprint(dip({
    userPackage: {
      id: "pkg",
      name: "wide block",
      stackBase: 0,
      shapes: [{
        id: "b",
        kind: "cuboid",
        center: [0, 0],
        length: 6,
        width: 4,
        angle: 0,
        height: 2,
        color: "#000"
      }],
      updatedAt: "2026-01-01"
    }
  }));
  assert.equal(footprint.bodyCells.has("10,10"), true);
  assert.equal(footprint.bodyCells.has("7,8"), true);
});

test("body covering another pin counts as a collision", () => {
  const first = dip();
  const second = dip({ id: "u2", name: "U2", position: [10, 10], pinOffsets: [[0, 0]] });
  assert.equal(bodiesOverlap(first, second), true);
  assert.equal(bodyPinOverlap(first, second), true);
  assert.equal(componentOccupiedCells(first).has("10,10"), true);
});
