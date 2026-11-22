import assert from "node:assert/strict";
import test from "node:test";
import { createUserPackageComponent } from "../src/features/userPackage/model/placement.ts";
import { componentFootprint } from "../src/features/collision/footprint.ts";
import { buildPinOffsetsForComponent } from "../src/features/project/componentLibrary.ts";
import { pinGridPosition } from "../src/features/board/placement.ts";
import { resolveNetEndpoints } from "../src/features/import/netEndpointResolver.ts";
import { bendUserPackagePin, userPackagePinOffset } from "../src/features/userPackage/model/pinBend.ts";
import type { UserPackageDraft } from "../src/features/userPackage/model/types.ts";

function draft(): UserPackageDraft {
  return {
    id: "pkg",
    name: "custom",
    stackBase: 0,
    shapes: [
      { id: "p1", kind: "pin", hole: [4, 4] },
      { id: "p2", kind: "pin", hole: [7, 4] },
      {
        id: "b1",
        kind: "cuboid",
        center: [5.5, 4],
        length: 4,
        width: 2,
        angle: 0,
        height: 2,
        color: "#000"
      }
    ],
    updatedAt: "2026-01-01"
  };
}

test("placing a user package rebases pins and body to the first pin", () => {
  const component = createUserPackageComponent(draft(), [10, 10]);
  assert.ok(component);
  assert.deepEqual(component?.pinOffsets, [[0, 0], [3, 0]]);
  assert.deepEqual(component?.userPackage?.shapes[0], { id: "p1", kind: "pin", hole: [0, 0] });
  assert.deepEqual(component?.userPackage?.shapes[2], {
    id: "b1",
    kind: "cuboid",
    center: [1.5, 0],
    length: 4,
    width: 2,
    angle: 0,
    height: 2,
    color: "#000"
  });
  assert.equal(componentFootprint(component!).bodyCells.has("11,10"), true);
});

test("a user package without pins cannot be placed", () => {
  const noPins: UserPackageDraft = { ...draft(), shapes: draft().shapes.filter((shape) => shape.kind !== "pin") };
  assert.equal(createUserPackageComponent(noPins, [10, 10]), undefined);
});

test("editing a placed user package never regenerates its pin holes", () => {
  const component = createUserPackageComponent(draft(), [10, 10]);
  assert.ok(component);
  const rebuilt = buildPinOffsetsForComponent(component!);
  assert.deepEqual(rebuilt, component!.pinOffsets);
});

test("a user package pin bends only on its configured axis and inside its range", () => {
  const source = draft();
  const pin = source.shapes[0];
  assert.equal(pin.kind, "pin");
  if (pin.kind !== "pin") return;
  pin.bendRange = 2;
  pin.bendDirection = "+x";
  const component = createUserPackageComponent(source, [10, 10]);
  assert.ok(component);

  const bent = bendUserPackagePin(component!, 1, 5);
  assert.ok(bent);
  assert.deepEqual(bent!.pinOffsets[0], [2, 0]);
  assert.equal(userPackagePinOffset(bent!, 1), 2);
  assert.equal(bendUserPackagePin(component!, 2, 5), undefined);
});

test("negative pin direction moves the opposite way", () => {
  const source = draft();
  const pin = source.shapes[0];
  assert.equal(pin.kind, "pin");
  if (pin.kind !== "pin") return;
  pin.bendRange = 2;
  pin.bendDirection = "-x";
  const component = createUserPackageComponent(source, [10, 10]);
  assert.ok(component);
  const bent = bendUserPackagePin(component!, 1, 1);
  assert.deepEqual(bent?.pinOffsets[0], [-1, 0]);
});

test("pin direction +Z moves along the board depth axis", () => {
  const source = draft();
  const pin = source.shapes[0];
  assert.equal(pin.kind, "pin");
  if (pin.kind !== "pin") return;
  pin.bendRange = 2;
  pin.bendDirection = "+z";
  const component = createUserPackageComponent(source, [10, 10]);
  assert.ok(component);
  const bent = bendUserPackagePin(component!, 1, 1);
  assert.deepEqual(bent?.pinOffsets[0], [0, 1]);
  assert.deepEqual(pinGridPosition(bent!, 1), [10, 11]);

  const endpoints = resolveNetEndpoints({
    components: [],
    nets: [{ name: "N", nodes: [{ ref: "custom", pin: "1" }] }],
    warnings: [],
    pinInfo: {}
  }, [bent!]);
  assert.deepEqual(endpoints[0]?.grid, [10, 11]);
});

test("bending the first pin does not move the package body", () => {
  const source = draft();
  const pin = source.shapes[0];
  assert.equal(pin.kind, "pin");
  if (pin.kind !== "pin") return;
  pin.bendRange = 2;
  pin.bendDirection = "+x";
  const component = createUserPackageComponent(source, [10, 10]);
  assert.ok(component);
  const before = [...componentFootprint(component!).bodyCells].sort();
  const bent = bendUserPackagePin(component!, 1, 2);
  assert.ok(bent);
  const after = [...componentFootprint(bent!).bodyCells].sort();
  assert.deepEqual(after, before);
});
