import assert from "node:assert/strict";
import test from "node:test";
import { applyPinProfile } from "../src/features/project/applyPinProfile.ts";
import type { PerfboardProject, PinProfile, PlacedComponent } from "../src/types/project.ts";

function project(): PerfboardProject {
  const u2: PlacedComponent = {
    id: "u2",
    kind: "dip",
    label: "DIP16",
    name: "U2",
    value: "ULN2003A",
    pinCount: 16,
    leadSpacing: 1,
    rowSpacing: 3,
    sameSidePitch: 1,
    pinOffsets: [],
    position: [3, 3],
    rotation: 0,
    mounted: false,
    origin: "import",
    importRef: "U2",
    placeholder: true,
    fallbackReason: "old"
  };
  return {
    id: "p",
    name: "test",
    board: { kind: "perfboard", width: 30, height: 20 },
    files: [],
    importState: {
      components: [
        { ref: "U1", value: "MCP23017", category: "IO_EXPANDER", packageName: "DIP-28", sourceFile: "x" },
        { ref: "U2", value: "ULN2003A", category: "DARLINGTON", packageName: "DIP-16", sourceFile: "x" }
      ],
      nets: [{ name: "N", nodes: [{ ref: "U1", pin: "VDD", logicalPin: "VDD" }] }],
      warnings: []
    },
    components: [u2],
    routing: { traces: [], jumpers: [], failedNets: [], warnings: [] },
    constraints: [],
    createdAt: "2026-01-01"
  };
}

const profile: PinProfile = {
  id: "mcp",
  identity: { value: "MCP23017", package: "DIP-28", category: "IO_EXPANDER" },
  pinCount: 28,
  pins: [{ physical: 1, logical: "VDD", shared: true, connection: "netlist" }],
  createdAt: "2026-01-01"
};

const ulnProfile: PinProfile = {
  id: "uln",
  identity: { value: "ULN2003A", package: "DIP-16", category: "DARLINGTON" },
  pinCount: 16,
  pins: [{ physical: 1, logical: "GND", shared: true, connection: "netlist" }],
  createdAt: "2026-01-01"
};

test("saving a profile clears an existing placeholder even when pin count is unchanged", () => {
  const next = applyPinProfile(project(), ulnProfile);
  const u2 = next.components.find((component) => component.name === "U2");
  assert.equal(u2?.placeholder, false);
  assert.equal(u2?.fallbackReason, undefined);
});

test("saving a profile appends the component that was previously pending", () => {
  const next = applyPinProfile(project(), profile);
  const u1 = next.components.find((component) => component.name === "U1");
  assert.ok(u1);
  assert.equal(u1?.importRef, "U1");
  assert.equal(u1?.placeholder, false);
  assert.equal(next.components.length, 2);
});
