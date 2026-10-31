import assert from "node:assert/strict";
import test from "node:test";
import { prepareComponentsForConstraints } from "../src/features/constraints/execution.ts";
import { autoPlaceComponents } from "../src/features/layout/autoPlacement.ts";
import type { DesignConstraint, PlacedComponent } from "../src/types/project.ts";

function dip(id: string, name: string, rotation: number): PlacedComponent {
  const pinOffsets: Array<[number, number]> = [];
  for (let i = 0; i < 7; i += 1) pinOffsets.push([0, i]);
  for (let i = 6; i >= 0; i -= 1) pinOffsets.push([3, i]);
  return {
    id,
    kind: "dip",
    label: name,
    name,
    value: "",
    pinCount: 14,
    leadSpacing: 1,
    rowSpacing: 3,
    sameSidePitch: 1,
    pinOffsets,
    position: [2, 2],
    rotation,
    mounted: false
  };
}

const base = {
  id: "lock-1",
  strength: "hard" as const,
  status: "active" as const,
  enabled: true,
  sourceText: "锁定方向",
  explanation: "锁定 U1 方向",
  createdAt: "2026-01-01T00:00:00.000Z"
};

test("只锁方向时，放置过程会打上 rotationLocked 标记", () => {
  const lock: DesignConstraint = {
    ...base,
    kind: "component_lock",
    componentId: "u1",
    componentRef: "U1",
    lockPosition: false,
    lockRotation: true
  };
  const prepared = prepareComponentsForConstraints([dip("u1", "U1", Math.PI / 2)], [lock]);
  assert.equal(prepared[0].rotationLocked, true);
  assert.equal(prepared[0].mounted, false);
});

test("没有方向锁时不打标记", () => {
  const prepared = prepareComponentsForConstraints([dip("u1", "U1", 0)], []);
  assert.equal(prepared[0].rotationLocked, false);
});

test("锁方向后自动放置保持原朝向，不会自己转 90°", () => {
  const lock: DesignConstraint = {
    ...base,
    kind: "component_lock",
    componentId: "u1",
    componentRef: "U1",
    lockPosition: false,
    lockRotation: true
  };
  const board = { width: 40, height: 30, kind: "perfboard" as const };
  const prepared = prepareComponentsForConstraints([dip("u1", "U1", Math.PI / 2)], [lock]);
  const result = autoPlaceComponents(
    prepared,
    { x: 0, y: 0, width: board.width, height: board.height },
    board.width,
    board.height,
    [],
    [lock],
    () => {},
    board
  );
  const placed = result.components.find((component) => component.id === "u1");
  assert.ok(placed);
  assert.equal(placed.rotation, Math.PI / 2);
});
