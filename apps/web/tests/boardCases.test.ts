import assert from "node:assert/strict";
import test from "node:test";
import { createBreadboardDefinition, getBreadboardColumnRole } from "../src/features/board/breadboard.ts";
import { createBoardModel, normalizeBoardDefinition } from "../src/features/board/factory.ts";
import type { BoardSize } from "../src/types/project.ts";

function perfboardDefinition(width: number, height: number): BoardSize {
  return normalizeBoardDefinition({ kind: "perfboard", width, height });
}

const SINGLE_ROLES = [
  "rail", "rail", "spacer",
  "terminal", "terminal", "terminal", "terminal", "terminal",
  "channel", "channel",
  "terminal", "terminal", "terminal", "terminal", "terminal",
  "spacer", "rail", "rail"
];

for (let x = 0; x < SINGLE_ROLES.length; x += 1) {
  test(`single-module column ${x} role is ${SINGLE_ROLES[x]}`, () => {
    const board = createBreadboardDefinition(30, 1);
    assert.equal(getBreadboardColumnRole(board, x).kind, SINGLE_ROLES[x]);
  });
}

test("single-module breadboard width is 18", () => {
  assert.equal(createBreadboardDefinition(60, 1).width, 18);
});

for (const [modules, width] of [[1, 18], [2, 32], [3, 48], [4, 64]] as Array<[number, number]>) {
  test(`breadboard with ${modules} modules is ${width} wide`, () => {
    assert.equal(createBreadboardDefinition(20, modules).width, width);
  });
}

test("channel columns are exactly between the two inner terminal columns", () => {
  const board = createBreadboardDefinition(30, 1);
  assert.equal(getBreadboardColumnRole(board, 7).kind, "terminal");
  assert.equal(getBreadboardColumnRole(board, 8).kind, "channel");
  assert.equal(getBreadboardColumnRole(board, 9).kind, "channel");
  assert.equal(getBreadboardColumnRole(board, 10).kind, "terminal");
});

for (const [modules, left, channel, right] of [
  [2, [2, 6], [7, 8], [9, 13]],
  [2, [18, 22], [23, 24], [25, 29]],
  [3, [34, 38], [39, 40], [41, 45]]
] as Array<[number, Array<number>, Array<number>, Array<number>]>) {
  test(`module geometry (${modules} modules): ${left} / ${channel} / ${right}`, () => {
    const board = createBreadboardDefinition(20, modules);
    assert.equal(getBreadboardColumnRole(board, left[0]).kind, "terminal");
    assert.equal(getBreadboardColumnRole(board, left[1]).kind, "terminal");
    assert.equal(getBreadboardColumnRole(board, channel[0]).kind, "channel");
    assert.equal(getBreadboardColumnRole(board, channel[1]).kind, "channel");
    assert.equal(getBreadboardColumnRole(board, right[0]).kind, "terminal");
    assert.equal(getBreadboardColumnRole(board, right[1]).kind, "terminal");
  });
}

/* ── rail gaps (5 usable + 1 gap) ─────────────────────────────────────── */

{
  const board = createBoardModel(createBreadboardDefinition(30, 1));
  for (let row = 0; row < 24; row += 1) {
    const expected = row % 6 !== 5;
    test(`rail hole (0,${row}) validity = ${expected}`, () => {
      assert.equal(board.isValidHole([0, row]), expected);
    });
  }
}

test("terminal holes have no gaps", () => {
  const board = createBoardModel(createBreadboardDefinition(30, 1));
  for (const row of [4, 5, 6, 11, 17]) {
    assert.equal(board.isValidHole([3, row]), true, `terminal (3,${row})`);
  }
});

test("rail is electrically continuous across gap rows", () => {
  const board = createBoardModel(createBreadboardDefinition(30, 1));
  assert.equal(board.areInternallyConnected([0, 4], [0, 6]), true);
  assert.equal(board.areInternallyConnected([16, 10], [16, 12]), true);
});

test("rail gap row itself still reports the rail node", () => {
  const board = createBoardModel(createBreadboardDefinition(30, 1));
  assert.equal(board.getElectricalNode([0, 5]), "breadboard:rail:left-red");
});

/* ── terminal connectivity ────────────────────────────────────────────── */

test("same row and bank holes share one node", () => {
  const board = createBoardModel(createBreadboardDefinition(30, 1));
  assert.equal(board.areInternallyConnected([3, 7], [7, 7]), true);
});

test("left and right banks are separate nodes", () => {
  const board = createBoardModel(createBreadboardDefinition(30, 1));
  assert.equal(board.areInternallyConnected([7, 7], [10, 7]), false);
});

test("adjacent rows are separate nodes", () => {
  const board = createBoardModel(createBreadboardDefinition(30, 1));
  assert.equal(board.areInternallyConnected([3, 7], [3, 8]), false);
});

test("channel and spacer cells have no node", () => {
  const board = createBoardModel(createBreadboardDefinition(30, 1));
  assert.equal(board.getElectricalNode([8, 7]), undefined);
  assert.equal(board.getElectricalNode([2, 7]), undefined);
  assert.equal(board.getElectricalNode([15, 7]), undefined);
});

/* ── hole counts ──────────────────────────────────────────────────────── */

test("single-module 60-row board has 800 holes", () => {
  const board = createBoardModel(createBreadboardDefinition(60, 1));
  assert.equal(board.getAllHoles().length, 800);
});

test("two-module 20-row board has 468 holes", () => {
  const board = createBoardModel(createBreadboardDefinition(20, 2));
  assert.equal(board.getAllHoles().length, 468);
});

test("perfboard hole count matches width*height minus invalid cells", () => {
  const board = createBoardModel(perfboardDefinition(30, 20));
  assert.equal(board.getAllHoles().length, 600);
});

/* ── display name / snap ──────────────────────────────────────────────── */

test("breadboard display name mentions rows and kind", () => {
  const board = createBoardModel(createBreadboardDefinition(60, 1));
  assert.ok(board.getDisplayName().includes("60"));
  assert.ok(board.getDisplayName().includes("breadboard"));
});

test("snapToHole keeps valid holes and repairs near misses", () => {
  const board = createBoardModel(perfboardDefinition(30, 20));
  assert.deepEqual(board.snapToHole([5.2, 3.3]), [5, 3]);
  assert.deepEqual(board.snapToHole([0, 0]), [0, 0]);
});
