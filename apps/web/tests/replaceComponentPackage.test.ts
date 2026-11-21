import assert from "node:assert/strict";
import test from "node:test";
import { replaceComponentPackage } from "../src/features/project/replaceComponentPackage.ts";
import type { LibraryComponentDefinition } from "../src/features/project/componentLibrary.ts";
import type { PerfboardProject } from "../src/types/project.ts";

const offsets: Array<[number, number]> = [[0, 0], [1, 0], [0, 2], [1, 2], [2, 2]];

function project(): PerfboardProject {
  return {
    id: "p",
    name: "test",
    board: { kind: "perfboard", width: 30, height: 20 },
    files: [],
    importState: {
      components: [{ ref: "K1", value: "G5V-1", category: "Relay:", packageName: "", sourceFile: "x" }],
      nets: [{ name: "COIL", nodes: [{ ref: "K1", pin: "1" }] }, { name: "OTHER", nodes: [] }],
      warnings: []
    },
    components: [{
      id: "c1",
      kind: "relay",
      label: "RLY",
      name: "K1",
      value: "G5V-1",
      pinCount: 5,
      leadSpacing: 1,
      rowSpacing: 1,
      sameSidePitch: 1,
      pinOffsets: offsets,
      position: [0, 0],
      rotation: 0,
      mounted: true,
      origin: "import"
    }],
    routing: {
      traces: [
        { id: "t1", net: "COIL", points: [[0, 0], [1, 0]] },
        { id: "t2", net: "OTHER", points: [[2, 0], [3, 0]] }
      ],
      jumpers: [{ id: "j1", net: "COIL", from: [0, 0], to: [1, 0] }],
      failedNets: ["COIL", "OTHER"],
      warnings: []
    },
    constraints: [],
    createdAt: "2026-01-01"
  };
}

test("renumbered pin offsets replace the old order", () => {
  const reversed = [...offsets].reverse();
  const definition: LibraryComponentDefinition = {
    kind: "relay",
    label: "RLY",
    title: "relay",
    pinCount: 5,
    leadSpacing: 1,
    rowSpacing: 1,
    sameSidePitch: 1,
    pinOffsets: reversed
  };
  const next = replaceComponentPackage(project(), "c1", definition);
  assert.deepEqual(next.components[0].pinOffsets, reversed);
});

test("changing the package drops only the affected net routing", () => {
  const definition: LibraryComponentDefinition = {
    kind: "relay",
    label: "RLY",
    title: "relay",
    pinCount: 5,
    leadSpacing: 1,
    rowSpacing: 1,
    sameSidePitch: 1,
    pinOffsets: offsets
  };
  const next = replaceComponentPackage(project(), "c1", definition);
  assert.deepEqual(next.routing.traces.map((trace) => trace.net), ["OTHER"]);
  assert.equal(next.routing.jumpers.length, 0);
  assert.deepEqual(next.routing.failedNets, ["OTHER"]);
  assert.equal(next.routing.drc, undefined);
});

