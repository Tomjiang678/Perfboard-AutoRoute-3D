import assert from "node:assert/strict";
import test from "node:test";
import { createHistory, commitHistory, redoHistory, undoHistory } from "../src/features/userPackage/model/history.ts";
import { modelHeight, nextStackBase, removeShape, shapeBaseY } from "../src/features/userPackage/model/stack.ts";
import type { UserPackageDraft, UserPackageShape } from "../src/features/userPackage/model/types.ts";

const pin: UserPackageShape = { id: "p1", kind: "pin", hole: [1, 1] };
const cylinder: UserPackageShape = { id: "c1", kind: "cylinder", center: [2, 2], radius: 1, height: 2, color: "#000" };
const cuboid: UserPackageShape = { id: "b1", kind: "cuboid", center: [2, 2], length: 4, width: 3, angle: 0, height: 3, color: "#000" };

test("first solid sits on pin tops and later solids stack on the previous top", () => {
  const shapes = [pin, cylinder, cuboid];
  assert.equal(shapeBaseY(shapes, 1), 0.8);
  assert.equal(shapeBaseY(shapes, 2), 2.8);
  assert.equal(modelHeight(shapes), 5.8);
});

test("without pins the first solid starts at board level", () => {
  assert.equal(shapeBaseY([cylinder, cuboid], 0), 0);
  assert.equal(shapeBaseY([cylinder, cuboid], 1), 2);
});

test("pins added later do not lift already created solids", () => {
  const laterPins: UserPackageShape[] = [
    { id: "b1", kind: "cuboid", center: [2, 2], length: 4, width: 3, angle: 0, height: 2, color: "#000" },
    pin,
    { id: "b2", kind: "cuboid", center: [2, 2], length: 4, width: 3, angle: 0, height: 2, color: "#000" }
  ];
  assert.equal(shapeBaseY(laterPins, 0, 0), 0);
  assert.equal(shapeBaseY(laterPins, 2, 0), 2);
});

test("deleting the last solid releases a stale stack base", () => {
  const draft: UserPackageDraft = {
    id: "d",
    name: "A",
    stackBase: 0,
    shapes: [cuboid, pin],
    updatedAt: ""
  };
  const pinsOnly = removeShape(draft, cuboid.id);
  assert.equal(pinsOnly.stackBase, undefined);
  assert.equal(nextStackBase(pinsOnly), 0.8);

  const withCylinder: UserPackageDraft = {
    ...pinsOnly,
    stackBase: nextStackBase(pinsOnly),
    shapes: [...pinsOnly.shapes, cylinder]
  };
  assert.equal(shapeBaseY(withCylinder.shapes, 1, withCylinder.stackBase), 0.8);
});

test("deleting one of several solids keeps the existing stack base", () => {
  const draft: UserPackageDraft = {
    id: "d",
    name: "A",
    stackBase: 0,
    shapes: [cuboid, { ...cuboid, id: "b2" }, pin],
    updatedAt: ""
  };
  const next = removeShape(draft, cuboid.id);
  assert.equal(next.stackBase, 0);
});

test("history supports undo and redo", () => {
  const draft: UserPackageDraft = { id: "d", name: "A", shapes: [], updatedAt: "" };
  const next = { ...draft, shapes: [pin] };
  const history = commitHistory(createHistory(draft), next);
  assert.deepEqual(history.present.shapes, [pin]);
  const undone = undoHistory(history);
  assert.deepEqual(undone.present.shapes, []);
  const redone = redoHistory(undone);
  assert.deepEqual(redone.present.shapes, [pin]);
});
