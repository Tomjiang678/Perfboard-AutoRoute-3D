import assert from "node:assert/strict";
import test from "node:test";
import { prepareProject } from "../src/features/project/prepareProject.ts";
import type { PerfboardProject, PinProfile, PlacedComponent } from "../src/types/project.ts";

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

test("a completed profile clears an existing placeholder on load", () => {
  const chip: PlacedComponent = {
    id: "c1",
    kind: "dip",
    label: "DIP16",
    name: "U2",
    value: "ULN2003A",
    pinCount: 16,
    leadSpacing: 1,
    rowSpacing: 3,
    sameSidePitch: 1,
    pinOffsets: [],
    position: [0, 0],
    rotation: 0,
    mounted: false,
    origin: "import",
    importRef: "U2",
    placeholder: true,
    fallbackReason: "old"
  };
  const base = project(chip, ["U2"]);
  base.schemaVersion = 3;
  base.importState.components[0] = {
    ref: "U2",
    value: "ULN2003A",
    category: "DARLINGTON",
    packageName: "DIP-16",
    sourceFile: "x"
  };
  base.importState.nets = [{
    name: "0",
    nodes: [
      { ref: "U2", pin: "GND", logicalPin: "GND" },
      { ref: "U2", pin: "COM", logicalPin: "COM" },
      { ref: "U2", pin: "OUT1", logicalPin: "OUT1" },
      { ref: "U2", pin: "IN1", logicalPin: "IN1" }
    ]
  }];
  const profile: PinProfile = {
    id: "uln",
    identity: { value: "ULN2003A", package: "DIP-16", category: "DARLINGTON" },
    pinCount: 16,
    pins: [
      { physical: 1, logical: "GND", shared: true, connection: "netlist" },
      { physical: 2, logical: "COM", connection: "netlist" },
      { physical: 3, logical: "OUT1", connection: "netlist" },
      { physical: 4, logical: "IN1", connection: "netlist" }
    ],
    createdAt: "2026-01-01"
  };
  base.importState.pinProfiles = [profile];
  const next = prepareProject(base);
  assert.equal(next.components[0].placeholder, false);
  assert.equal(next.components[0].fallbackReason, undefined);
});
