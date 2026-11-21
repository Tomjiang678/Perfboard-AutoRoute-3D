import assert from "node:assert/strict";
import test from "node:test";
import { updateBoard } from "../src/features/project/updateBoard.ts";
import type { PerfboardProject } from "../src/types/project.ts";

function project(): PerfboardProject {
  return {
    id: "p",
    name: "test",
    board: { kind: "perfboard", width: 30, height: 20 },
    files: [],
    importState: { components: [], nets: [], warnings: [] },
    components: [],
    routing: {
      traces: [{ id: "t", net: "N", points: [[0, 0], [1, 0]] }],
      jumpers: [{ id: "j", net: "N", from: [0, 0], to: [1, 0] }],
      failedNets: ["N"],
      warnings: ["old"]
    },
    constraints: [],
    createdAt: "2026-01-01"
  };
}

test("changing board dimensions clears all copper and warnings", () => {
  const next = updateBoard(project(), { kind: "perfboard", width: 20, height: 12 });
  assert.equal(next.board.width, 20);
  assert.deepEqual(next.routing.traces, []);
  assert.deepEqual(next.routing.jumpers, []);
  assert.deepEqual(next.routing.failedNets, []);
  assert.deepEqual(next.routing.warnings, []);
});

test("same board dimensions are a no-op", () => {
  const current = project();
  assert.equal(updateBoard(current, { kind: "perfboard", width: 30, height: 20 }), current);
});
