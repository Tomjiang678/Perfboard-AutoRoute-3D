import assert from "node:assert/strict";
import test from "node:test";
import { prepareProject } from "../src/features/project/prepareProject.ts";
import type { PerfboardProject, PlacedComponent } from "../src/types/project.ts";

function project(component: PlacedComponent, refs: string[]): PerfboardProject {
  return {
    id: "p",
    name: "test",
    board: { kind: "perfboard", width: 30, height: 20 },
    files: [],
    importState: {
      components: refs.map((ref) => ({ ref, value: "X", category: "Custom:X", packageName: "", sourceFile: "x" })),
      nets: [],
      warnings: []
    },
    components: [component],
    routing: { traces: [], jumpers: [], failedNets: [], warnings: [] },
    constraints: [],
    createdAt: "2026-01-01"
  };
}

test("legacy fallback flags are migrated once to origin/placeholder", () => {
  const legacy: PlacedComponent = {
    id: "c1",
    kind: "pin_header",
    label: "UNK",
    name: "W1",
    value: "X",
    pinCount: 2,
    leadSpacing: 1,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [1, 0]],
    position: [0, 0],
    rotation: 0,
    mounted: false,
    isFallback: true,
    fromImport: true
  };
  const next = prepareProject(project(legacy, ["W1"]));
  assert.equal(next.schemaVersion, 3);
  assert.equal(next.components[0].origin, "import");
  assert.equal(next.components[0].placeholder, true);
  assert.equal("isFallback" in next.components[0], false);
  assert.equal("fromImport" in next.components[0], false);
});

test("schema 2 inferred headers are repaired to placeholders", () => {
  const inferred: PlacedComponent = {
    id: "c1",
    kind: "pin_header",
    label: "HDR",
    name: "J2",
    value: "MYSTERY_04",
    pinCount: 4,
    leadSpacing: 1,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [1, 0], [2, 0], [3, 0]],
    position: [0, 0],
    rotation: 0,
    mounted: false,
    origin: "import",
    placeholder: false
  };
  const legacy = { ...project(inferred, ["J2"]), schemaVersion: 2 };
  legacy.importState.components[0].category = "Custom:X";
  const next = prepareProject(legacy);
  assert.equal(next.components[0].placeholder, true);
  assert.match(next.components[0].fallbackReason ?? "", /没有明确封装规则/);
});

test("unflagged manual components stay manual and are not placeholders", () => {
  const manual: PlacedComponent = {
    id: "c1",
    kind: "pin_header",
    label: "HDR",
    name: "J1",
    value: "",
    pinCount: 2,
    leadSpacing: 1,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [1, 0]],
    position: [0, 0],
    rotation: 0,
    mounted: false
  };
  const next = prepareProject(project(manual, []));
  assert.equal(next.components[0].origin, "manual");
  assert.equal(next.components[0].placeholder, false);
});
