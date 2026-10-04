import assert from "node:assert/strict";
import test from "node:test";
import { createBreadboardDefinition } from "../src/features/board/breadboard.ts";
import { createBoardModel } from "../src/features/board/factory.ts";
import { analyzeBoardConnectivity } from "../src/features/board/connectivity.ts";

test("perfboard holes are electrically independent by default", () => {
  const board = createBoardModel({ kind: "perfboard", width: 4, height: 4 });
  assert.equal(board.areInternallyConnected([0, 0], [1, 0]), false);
  assert.equal(board.areInternallyConnected([0, 0], [0, 0]), true);
});

test("breadboard terminal strip connects A-E but not F or the next row", () => {
  const board = createBoardModel(createBreadboardDefinition(30, 1));
  assert.equal(board.areInternallyConnected([3, 0], [4, 0]), true);
  assert.equal(board.areInternallyConnected([3, 0], [7, 0]), true);
  assert.equal(board.areInternallyConnected([3, 0], [9, 0]), false);
  assert.equal(board.areInternallyConnected([3, 0], [3, 1]), false);
});

test("standalone breadboard has independent red and blue rails on both sides", () => {
  const board = createBoardModel(createBreadboardDefinition(30, 1));
  assert.equal(board.areInternallyConnected([0, 0], [0, 29]), true);
  assert.equal(board.areInternallyConnected([0, 0], [1, 0]), false);
  assert.equal(board.areInternallyConnected([16, 0], [16, 29]), true);
  assert.equal(board.areInternallyConnected([16, 0], [17, 0]), false);
});

test("combined breadboard exposes one outer rail and a red-blue pair between modules", () => {
  const definition = createBreadboardDefinition(20, 2);
  const board = createBoardModel(definition);
  assert.equal(definition.width, 32);
  assert.equal(board.isValidHole([0, 0]), true);
  assert.equal(board.isValidHole([15, 0]), true);
  assert.equal(board.isValidHole([16, 0]), true);
  assert.equal(board.isValidHole([31, 0]), true);
  assert.equal(board.areInternallyConnected([15, 0], [15, 19]), true);
  assert.equal(board.areInternallyConnected([15, 0], [16, 0]), false);
});

test("breadboard exposes jumper-only front-side capabilities", () => {
  const board = createBoardModel(createBreadboardDefinition(20, 2));
  assert.deepEqual([...board.capabilities.routePrimitives], ["jumper"]);
  assert.equal(board.capabilities.jumperSide, "top");
  assert.equal(board.capabilities.canRenderBottomView, false);
});

test("same-net pins on one electrical node are already connected without a wire", () => {
  const board = createBoardModel(createBreadboardDefinition(20, 1));
  const analysis = analyzeBoardConnectivity(board, [
    { pinId: "R1.1", net: "SIGNAL", hole: [3, 0] },
    { pinId: "LED1.1", net: "SIGNAL", hole: [5, 0] }
  ]);
  assert.equal(analysis.alreadyConnectedNets.has("SIGNAL"), true);
  assert.equal(analysis.nodesByNet.get("SIGNAL")?.size, 1);
  assert.equal(analysis.conflicts.length, 0);
});

test("different nets on one electrical node are reported as a short", () => {
  const board = createBoardModel(createBreadboardDefinition(20, 1));
  const analysis = analyzeBoardConnectivity(board, [
    { pinId: "R1.1", net: "NET_A", hole: [3, 0] },
    { pinId: "LED1.1", net: "NET_B", hole: [5, 0] }
  ]);
  assert.equal(analysis.conflicts.length, 1);
  assert.deepEqual(new Set(analysis.conflicts[0].nets), new Set(["NET_A", "NET_B"]));
});

test("breadboard accepts vertical and diagonal two-pin placements", () => {
  const board = createBoardModel(createBreadboardDefinition(20, 1));
  const base = {
    id: "r1",
    kind: "resistor" as const,
    label: "R",
    name: "R1",
    value: "1k",
    leadSpacing: 2,
    rowSpacing: 0,
    sameSidePitch: 1,
    rotation: 0,
    mounted: false
  };
  const vertical = board.validatePlacement({ ...base, pinOffsets: [[0, 0], [0, 2]], position: [3, 0] });
  const diagonal = board.validatePlacement({ ...base, pinOffsets: [[0, 0], [1, 2]], position: [3, 0] });
  assert.equal(vertical.valid, true);
  assert.equal(diagonal.valid, true);
});

test("horizontal two-pin components must bridge the center channel", () => {
  const board = createBoardModel(createBreadboardDefinition(20, 1));
  const component = {
    id: "r1",
    kind: "resistor" as const,
    label: "R",
    name: "R1",
    value: "1k",
    leadSpacing: 3,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [3, 0]] as Array<[number, number]>,
    rotation: 0,
    mounted: false
  };
  const withinFiveHoleGroup = board.validatePlacement({ ...component, position: [3, 0] });
  const acrossCenter = board.validatePlacement({ ...component, position: [7, 0] });
  assert.equal(withinFiveHoleGroup.valid, false);
  assert.equal(withinFiveHoleGroup.issues.some((issue) => issue.code === "two_pin_horizontal_must_bridge_center"), true);
  assert.equal(acrossCenter.valid, true);
});

test("DIP-like components must bridge one module center channel", () => {
  const board = createBoardModel(createBreadboardDefinition(20, 1));
  const chip = {
    id: "u1",
    kind: "dip" as const,
    label: "DIP4",
    name: "U1",
    value: "",
    pinCount: 4,
    leadSpacing: 3,
    rowSpacing: 3,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [0, 1], [3, 1], [3, 0]] as Array<[number, number]>,
    rotation: 0,
    mounted: false
  };
  assert.equal(board.validatePlacement({ ...chip, position: [7, 0] }).valid, true);
  assert.equal(board.validatePlacement({ ...chip, position: [3, 0] }).issues.some((issue) => issue.code === "chip_must_bridge_center"), true);
});

test("component pins use power rails only when assigned to a power net", () => {
  const board = createBoardModel(createBreadboardDefinition(20, 1));
  const component = {
    id: "r1",
    kind: "resistor" as const,
    label: "R",
    name: "R1",
    value: "1k",
    leadSpacing: 3,
    rowSpacing: 1,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [3, 1]] as Array<[number, number]>,
    position: [0, 0] as [number, number],
    rotation: 0,
    mounted: false
  };
  assert.equal(board.validatePlacement(component, { 1: "SIGNAL", 2: "OUT" }).valid, false);
  assert.equal(board.validatePlacement(component, { 1: "VCC", 2: "OUT" }).valid, true);
});
