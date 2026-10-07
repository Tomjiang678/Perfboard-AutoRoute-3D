import assert from "node:assert/strict";
import test from "node:test";
import { edgeKey, parseKey, traceEdges } from "../src/features/routing/routingGeometry.ts";
import { parseKicadNetlist } from "../src/features/import/kicadNetlistParser.ts";
import { buildNetlistText, generateCircuit, mulberry32 } from "./helpers/netlistFactory.ts";
import { evaluatePlacementConstraints, prepareComponentsForConstraints } from "../src/features/constraints/execution.ts";
import { activeConstraints } from "../src/features/constraints/model.ts";
import { resolveImportPins } from "../src/features/import/pinResolver.ts";
import type { DesignConstraint, ImportState, PlacedComponent } from "../src/types/project.ts";

/* ── routing geometry edge cases ──────────────────────────────────────── */

for (const [keyStr, x, y] of [["0,0", 0, 0], ["17,59", 17, 59], ["-3,4", -3, 4]] as Array<[string, number, number]>) {
  test(`parseKey("${keyStr}") = [${x}, ${y}]`, () => {
    assert.deepEqual(parseKey(keyStr), [x, y]);
  });
}

test("edgeKey of identical points is stable", () => {
  assert.equal(edgeKey([2, 2], [2, 2]), "2,2|2,2");
});

test("traceEdges of two points yields one edge", () => {
  assert.deepEqual(traceEdges([[1, 1], [2, 2]]), ["1,1|2,2"]);
});

/* ── parser edge cases ────────────────────────────────────────────────── */

test("parser tolerates CRLF line endings", () => {
  const text = '(export\r\n\t(version "E")\r\n\t(components (comp (ref "R1") (value "R") (libsource (lib "Device") (part "R"))))\r\n)';
  const bundle = parseKicadNetlist(text, "crlf.net");
  assert.equal(bundle.components[0].ref, "R1");
});

test("parser tolerates a UTF-8 BOM", () => {
  const text = '\uFEFF(export\n\t(version "E")\n\t(components (comp (ref "R1") (value "R") (libsource (lib "Device") (part "R"))))\n)';
  const bundle = parseKicadNetlist(text, "bom.net");
  assert.equal(bundle.components[0].ref, "R1");
});

test("LED pin names K/A survive parsing", () => {
  const text = '(export\n\t(version "E")\n\t(libparts (libpart (lib "Device") (part "LED") (pins (pin (num "1") (name "K") (type "passive")) (pin (num "2") (name "A") (type "passive")))))\n\t(components (comp (ref "D1") (value "LED") (libsource (lib "Device") (part "LED"))))\n)';
  const bundle = parseKicadNetlist(text, "led.net");
  assert.equal(bundle.pinInfo.D1["1"].name, "K");
  assert.equal(bundle.pinInfo.D1["2"].name, "A");
});

test("net code attributes are ignored gracefully", () => {
  const text = '(export\n\t(version "E")\n\t(nets (net (code "42") (name "SIG") (node (ref "R1") (pin "1") (pintype "passive"))))\n)';
  const bundle = parseKicadNetlist(text, "code.net");
  assert.equal(bundle.nets.length, 1);
  assert.equal(bundle.nets[0].name, "SIG");
});

test("netlistFactory escaping round-trips quotes and backslashes", () => {
  const spec = {
    components: [{ ref: 'R"1', lib: "Device", part: "R", value: 'v\\x', pins: [] }],
    nets: [{ name: 'n"et\\', nodes: [{ ref: 'R"1', pin: 1 }] }]
  };
  const bundle = parseKicadNetlist(buildNetlistText(spec), "esc.net");
  assert.equal(bundle.components[0].ref, 'R"1');
  assert.equal(bundle.components[0].value, 'v\\x');
  assert.equal(bundle.nets[0].name, 'n"et\\');
});

test("generator is deterministic for a given seed", () => {
  const first = generateCircuit(42).text;
  const second = generateCircuit(42).text;
  assert.equal(first, second);
});

test("mulberry32 produces different sequences for different seeds", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const sequenceA = Array.from({ length: 5 }, () => a());
  const sequenceB = Array.from({ length: 5 }, () => b());
  assert.notDeepEqual(sequenceA, sequenceB);
});

/* ── constraint execution helpers ─────────────────────────────────────── */

function componentFixture(id: string, name: string, position: [number, number], rotation = 0): PlacedComponent {
  return {
    id, kind: "resistor", label: name, name, value: "",
    pinCount: 2, leadSpacing: 3, rowSpacing: 0, sameSidePitch: 1,
    pinOffsets: [[0, 0], [3, 0]], position, rotation, mounted: true
  };
}

function hard(kind: DesignConstraint["kind"], extra: Partial<DesignConstraint> = {}): DesignConstraint {
  return {
    id: crypto.randomUUID(), kind, strength: "hard", status: "active", enabled: true,
    sourceText: "", explanation: "x", createdAt: "",
    ...extra
  } as DesignConstraint;
}

test("evaluatePlacementConstraints warns when a component leaves its region", () => {
  const component = componentFixture("c1", "R1", [15, 15]);
  const constraint = hard("component_in_region", {
    componentIds: ["c1"], componentRefs: ["R1"], region: { x: 0, y: 0, width: 10, height: 10 }
  });
  const warnings = evaluatePlacementConstraints([component], [constraint]);
  assert.equal(warnings.length, 1);
});

test("evaluatePlacementConstraints is silent inside the region", () => {
  const component = componentFixture("c1", "R1", [4, 4]);
  const constraint = hard("component_in_region", {
    componentIds: ["c1"], componentRefs: ["R1"], region: { x: 0, y: 0, width: 10, height: 10 }
  });
  assert.equal(evaluatePlacementConstraints([component], [constraint]).length, 0);
});

test("evaluatePlacementConstraints checks near-component distance", () => {
  const near = componentFixture("c1", "R1", [4, 4]);
  const far = componentFixture("c2", "U1", [20, 20]);
  const constraint = hard("component_near_component", {
    componentId: "c1", componentRef: "R1", anchorComponentId: "c2", anchorComponentRef: "U1", maxDistance: 5
  });
  assert.equal(evaluatePlacementConstraints([near, far], [constraint]).length, 1);
});

test("prepareComponentsForConstraints applies orientation rotations", () => {
  const component = componentFixture("c1", "R1", [4, 4], 0);
  const constraint = hard("component_orientation", { componentId: "c1", componentRef: "R1", rotationDegrees: 180 });
  const prepared = prepareComponentsForConstraints([component], [constraint]);
  assert.equal(prepared[0].rotation, Math.PI);
});

test("prepareComponentsForConstraints locks mounted components", () => {
  const component = componentFixture("c1", "R1", [4, 4], 0);
  const constraint = hard("component_lock", { componentId: "c1", componentRef: "R1", lockPosition: true, lockRotation: false });
  const prepared = prepareComponentsForConstraints([component], [constraint]);
  assert.equal(prepared[0].mounted, true);
});

test("activeConstraints filters disabled and inactive entries", () => {
  const constraint = hard("component_lock", { componentId: "c1", componentRef: "R1", lockPosition: true, lockRotation: false });
  const disabled = { ...constraint, enabled: false };
  const inactive = { ...constraint, status: "disabled" as const };
  assert.equal(activeConstraints([constraint, disabled, inactive]).length, 1);
});

/* ── spacing limits ───────────────────────────────────────────────────── */

import { clampSpacing, maximumLeadSpan, preferredLeadSpan, spacingLimits } from "../src/features/project/componentTraits.ts";

for (const [kind, min, max] of [
  ["resistor", 2, 7],
  ["inductor", 2, 7],
  ["diode", 2, 6],
  ["led", 1, 5],
  ["radial_capacitor", 1, 4],
  ["electrolytic_capacitor", 1, 4],
  ["crystal", 2, 4],
  ["fuse", 4, 8],
  ["buzzer", 2, 4],
  ["terminal_block", 1, 3],
  ["to220", 1, 2],
  ["to247", 2, 3],
  ["bridge_rectifier", 1, 2]
] as Array<[PlacedComponent["kind"], number, number]>) {
  test(`lead spacing limits for ${kind} are ${min}..${max}`, () => {
    const limits = spacingLimits(kind).leadSpacing;
    assert.equal(limits.min, min);
    assert.equal(limits.max, max);
  });
}

test("DIP row spacing limits are 3..4 with fixed pitch", () => {
  assert.deepEqual(spacingLimits("dip").rowSpacing, { min: 3, max: 4 });
  assert.deepEqual(spacingLimits("dip").sameSidePitch, { min: 1, max: 1 });
});

test("fixed-pitch packages lock spacing to 1..1", () => {
  for (const kind of ["to92", "potentiometer", "slide_switch"] as PlacedComponent["kind"][]) {
    assert.deepEqual(spacingLimits(kind).leadSpacing, { min: 1, max: 1 });
    assert.deepEqual(spacingLimits(kind).rowSpacing, { min: 1, max: 1 });
    assert.deepEqual(spacingLimits(kind).sameSidePitch, { min: 1, max: 1 });
  }
});

test("clampSpacing clamps out-of-range values per kind", () => {
  assert.equal(clampSpacing("resistor", 20, "leadSpacing"), 7);
  assert.equal(clampSpacing("resistor", 0, "leadSpacing"), 2);
  assert.equal(clampSpacing("fuse", 3, "leadSpacing"), 4);
  assert.equal(clampSpacing("to92", 9, "leadSpacing"), 1);
  assert.equal(clampSpacing("dip", 1, "rowSpacing"), 3);
  assert.equal(clampSpacing("dip", 9, "rowSpacing"), 4);
  assert.equal(clampSpacing("dip", 9, "sameSidePitch"), 1);
});

test("maximumLeadSpan follows the per-kind limits", () => {
  assert.equal(maximumLeadSpan({ kind: "resistor" }), 7);
  assert.equal(maximumLeadSpan({ kind: "fuse" }), 8);
  assert.equal(maximumLeadSpan({ kind: "diode" }), 6);
  assert.equal(maximumLeadSpan({ kind: "to92" }), 1);
});

test("preferredLeadSpan stays inside the per-kind limits", () => {
  assert.equal(preferredLeadSpan({ kind: "resistor" }), 3);
  assert.equal(preferredLeadSpan({ kind: "led" }), 1);
  assert.equal(preferredLeadSpan({ kind: "fuse" }), 4);
  assert.equal(preferredLeadSpan({ kind: "to92" }), 1);
});

test("pinInfo power type is preserved for enrichment consumers", () => {
  const state: ImportState = {
    components: [],
    nets: [{ name: "N", nodes: [{ ref: "U1", pin: "8" }] }],
    warnings: [],
    pinInfo: { U1: { "8": { name: "V+", type: "power" } } }
  };
  const result = resolveImportPins(state);
  assert.equal(result.nets[0].nodes[0].pinRole, "V+");
});
