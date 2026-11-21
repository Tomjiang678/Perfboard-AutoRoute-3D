import assert from "node:assert/strict";
import test from "node:test";
import { updateComponentGeometry } from "../src/features/project/updateComponentGeometry.ts";
import { getLibraryComponentByKind } from "../src/features/project/componentLibrary.ts";
import type { PerfboardProject, PlacedComponent } from "../src/types/project.ts";

const relay = getLibraryComponentByKind("relay", 5)!;

function project(): PerfboardProject {
  const component: PlacedComponent = {
    id: "k1",
    kind: "relay",
    label: "RLY",
    name: "K1",
    value: "G5V-1",
    pinCount: 5,
    leadSpacing: 1,
    rowSpacing: 1,
    sameSidePitch: 1,
    pinOffsets: relay.pinOffsets,
    position: [4, 4],
    rotation: 0,
    mounted: false,
    origin: "import"
  };
  return {
    id: "p",
    name: "test",
    board: { kind: "perfboard", width: 30, height: 20 },
    files: [],
    importState: {
      components: [{ ref: "K1", value: "G5V-1", category: "Relay:", packageName: "", sourceFile: "x" }],
      nets: [{ name: "COIL", nodes: [{ ref: "K1", pin: "1" }] }],
      warnings: []
    },
    components: [component],
    routing: {
      traces: [{ id: "t1", net: "COIL", points: [[0, 0], [1, 0]] }],
      jumpers: [{ id: "j1", net: "COIL", from: [0, 0], to: [1, 0] }],
      failedNets: ["COIL"],
      warnings: []
    },
    constraints: [],
    createdAt: "2026-01-01"
  };
}

test("rotating a placed component invalidates the nets it touches", () => {
  const next = updateComponentGeometry(project(), "k1", (component) => ({ ...component, rotation: Math.PI / 2 }));
  assert.equal(next.components[0].rotation, Math.PI / 2);
  assert.equal(next.routing.traces.length, 0);
  assert.equal(next.routing.jumpers.length, 0);
  assert.deepEqual(next.routing.failedNets, []);
});

test("changing placement invalidates the same nets", () => {
  const next = updateComponentGeometry(project(), "k1", (component) => ({ ...component, position: [10, 10] }));
  assert.deepEqual(next.components[0].position, [10, 10]);
  assert.equal(next.routing.traces.length, 0);
});

test("mounting does not move pins and keeps routing", () => {
  const next = updateComponentGeometry(project(), "k1", (component) => ({ ...component, mounted: true }));
  assert.equal(next.routing.traces.length, 1);
  assert.equal(next.routing.jumpers.length, 1);
});

test("renaming the display name still invalidates by stable import ref", () => {
  const renamed = project();
  renamed.components[0].name = "Relay Main";
  renamed.components[0].importRef = "K1";
  const next = updateComponentGeometry(renamed, "k1", (component) => ({
    ...component,
    position: [12, 12]
  }));
  assert.equal(next.routing.traces.length, 0);
});

