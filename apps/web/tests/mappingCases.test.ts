import assert from "node:assert/strict";
import test from "node:test";
import {
  componentMappingRules,
  fallbackComponentMapping,
  ignoredComponentRules,
  normalizeComponentFields
} from "../src/features/import/importConfig.ts";
import { parseKicadNetlist } from "../src/features/import/kicadNetlistParser.ts";
import { createPlacedComponentsFromParsed } from "../src/features/import/componentMapping.ts";
import type { ImportState, ParsedComponent } from "../src/types/project.ts";

function matchKind(category: string, value = "X", ref = "U1") {
  const fields = normalizeComponentFields({ ref, value, category, packageName: "", sourceFile: "x.net" });
  return componentMappingRules.find((rule) => rule.match(fields))?.kind;
}

const RULE_CASES: Array<[string, string]> = [
  ["Device:R", "resistor"],
  ["Device:R_Small", "resistor"],
  ["Device:C", "radial_capacitor"],
  ["Device:CP", "electrolytic_capacitor"],
  ["Device:L", "inductor"],
  ["Device:D", "diode"],
  ["Device:D_Schottky", "diode"],
  ["Diode:1N4148", "diode"],
  ["Device:LED", "led"],
  ["LED:LED_RGB", "led"],
  ["Device:R_Potentiometer", "potentiometer"],
  ["Transistor_BJT:2N3904", "to92"],
  ["Device:Q_NPN", "to92"],
  ["Transistor_FET:IRF540", "to220"],
  ["Regulator_Linear:LM317", "to220"],
  ["Amplifier_Operational:LM358", "dip"],
  ["Comparator:LM393", "dip"],
  ["Timer:NE555", "dip"],
  ["74xx:74LS138", "dip"],
  ["4xxx_IEEE:4017", "dip"],
  ["Switch:SW_DIP_x04", "dip_switch"],
  ["Display_Character:7Segment", "seven_segment_display"],
  ["Connector:Conn_01x02", "pin_header"],
  ["Pin_Header:Pin_Header_1x04", "pin_header"],
  ["Connector_PinHeader:PinHeader_1x02", "pin_header"],
  ["TerminalBlock:TerminalBlock_1x02", "terminal_block"],
  ["Device:Buzzer", "buzzer"],
  ["Device:SW_SPDT", "slide_switch"],
  ["Device:SW_Push", "tactile_switch"],
  ["Switch:SW_SPST", "slide_switch"]
];

for (const [category, kind] of RULE_CASES) {
  test(`category "${category}" maps to ${kind}`, () => {
    assert.equal(matchKind(category), kind);
  });
}

test("unknown categories map to nothing (fallback applies)", () => {
  assert.equal(matchKind("Mystery_Lib:Widget"), undefined);
  assert.equal(matchKind("Graphic_Symbol:Triangle"), undefined);
});

for (const [category, value, ref] of [
  ["power:PWR_FLAG", "#PWR01", "#FLG01"],
  ["Mechanical:MountingHole", "MountingHole", "H1"],
  ["Graphic_Symbols:Line", "Line", "L1"],
  ["Device:R", "#PWR", "R1"]
] as Array<[string, string, string]>) {
  test(`component ${ref} (${category} / ${value}) is ignored`, () => {
    const fields = normalizeComponentFields({ ref, value, category, packageName: "", sourceFile: "x.net" });
    assert.ok(ignoredComponentRules.some((rule) => rule.match(fields)));
  });
}

function importStateWith(components: ParsedComponent[], pinInfo: ImportState["pinInfo"] = {}): ImportState {
  return { components, nets: [], warnings: [], pinInfo };
}

test("LM358 with 8 pins from pinInfo becomes a DIP-8", () => {
  const state = importStateWith(
    [{ ref: "U1", value: "LM358", category: "Amplifier_Operational:LM358", packageName: "", sourceFile: "x.net" }],
    { U1: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), { name: "", type: "signal" }])) }
  );
  const placed = createPlacedComponentsFromParsed(state, [], 30);
  assert.equal(placed.length, 1);
  assert.equal(placed[0].kind, "dip");
  assert.equal(placed[0].label, "DIP8");
  assert.equal(placed[0].pinOffsets.length, 8);
  assert.equal(placed[0].rowSpacing, 3);
});

test("connector pin count comes from the netlist pin info", () => {
  const state = importStateWith(
    [{ ref: "J1", value: "Conn_01x03", category: "Connector:Conn_01x03", packageName: "", sourceFile: "x.net" }],
    { J1: Object.fromEntries(Array.from({ length: 3 }, (_, i) => [String(i + 1), { name: "", type: "passive" }])) }
  );
  const placed = createPlacedComponentsFromParsed(state, [], 30);
  assert.equal(placed[0].kind, "pin_header");
  assert.equal(placed[0].pinOffsets.length, 3);
});

test("74HC595 without pinInfo still resolves 16 pins from the device library", () => {
  const state = importStateWith([
    { ref: "U1", value: "74HC595", category: "74xx:74HC595", packageName: "", sourceFile: "x.net" }
  ]);
  const placed = createPlacedComponentsFromParsed(state, [], 30);
  assert.equal(placed[0].pinOffsets.length, 16);
});

test("3-pin and 5-pin TO-92 transistors are distinguished by netlist pin count", () => {
  const threePin = importStateWith(
    [{ ref: "Q1", value: "2N3904", category: "Transistor_BJT:2N3904", packageName: "", sourceFile: "x.net" }],
    { Q1: Object.fromEntries(Array.from({ length: 3 }, (_, i) => [String(i + 1), { name: "", type: "" }])) }
  );
  const fivePin = importStateWith(
    [{ ref: "Q2", value: "BC548B", category: "Transistor_BJT:BC548B", packageName: "", sourceFile: "x.net" }],
    { Q2: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [String(i + 1), { name: "", type: "" }])) }
  );

  const q1 = createPlacedComponentsFromParsed(threePin, [], 30)[0];
  assert.equal(q1.kind, "to92");
  assert.equal(q1.pinOffsets.length, 3);
  assert.deepEqual(q1.pinOffsets, [[-1, 0], [0, 0], [1, 0]]);

  const q2 = createPlacedComponentsFromParsed(fivePin, [], 30)[0];
  assert.equal(q2.kind, "to92");
  assert.equal(q2.pinOffsets.length, 5);
  assert.deepEqual(q2.pinOffsets, [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]]);
});

test("4-pin TO-220 regulators keep all four pins", () => {
  const state = importStateWith(
    [{ ref: "U1", value: "LM2576", category: "Regulator_Switching:LM2576", packageName: "", sourceFile: "x.net" }],
    { U1: Object.fromEntries(Array.from({ length: 4 }, (_, i) => [String(i + 1), { name: "", type: "" }])) }
  );
  const placed = createPlacedComponentsFromParsed(state, [], 30)[0];
  assert.equal(placed.kind, "to220");
  assert.equal(placed.pinOffsets.length, 4);
  assert.deepEqual(placed.pinOffsets, [[-2, 0], [-1, 0], [0, 0], [1, 0]]);
});

test("unknown component falls back to a pin header with the netlist pin count", () => {
  const state = importStateWith(
    [{ ref: "X1", value: "Widget", category: "Mystery_Lib:Widget", packageName: "", sourceFile: "x.net" }],
    { X1: Object.fromEntries(Array.from({ length: 4 }, (_, i) => [String(i + 1), { name: "", type: "" }])) }
  );
  const placed = createPlacedComponentsFromParsed(state, [], 30);
  assert.equal(placed.length, 1);
  assert.equal(placed[0].kind, "pin_header");
  assert.equal(placed[0].isFallback, true);
  assert.equal(placed[0].pinOffsets.length, 4);
  assert.ok(placed[0].fallbackReason?.includes("占位排针"));
});

test("ignored components never become physical parts", () => {
  const state = importStateWith([
    { ref: "#FLG01", value: "#PWR01", category: "power:PWR_FLAG", packageName: "", sourceFile: "x.net" },
    { ref: "H1", value: "MountingHole", category: "Mechanical:MountingHole", packageName: "", sourceFile: "x.net" }
  ]);
  assert.equal(createPlacedComponentsFromParsed(state, [], 30).length, 0);
});

test("existing components are not duplicated", () => {
  const state = importStateWith([
    { ref: "R1", value: "R", category: "Device:R", packageName: "", sourceFile: "x.net" }
  ]);
  const existing = createPlacedComponentsFromParsed(state, [], 30);
  const again = createPlacedComponentsFromParsed(state, existing, 30);
  assert.equal(again.length, 0);
});

test("fallback mapping defaults to 2 pins with no pin info", () => {
  const state = importStateWith([
    { ref: "X1", value: "Widget", category: "Mystery_Lib:Widget", packageName: "", sourceFile: "x.net" }
  ]);
  const placed = createPlacedComponentsFromParsed(state, [], 30);
  assert.equal(placed[0].pinOffsets.length, fallbackComponentMapping.pinCount);
});

test("resistor lead spacing is 3 grid units", () => {
  const state = importStateWith([
    { ref: "R1", value: "R", category: "Device:R", packageName: "", sourceFile: "x.net" }
  ], { R1: { "1": {}, "2": {} } });
  const placed = createPlacedComponentsFromParsed(state, [], 30);
  assert.equal(placed[0].leadSpacing, 3);
  assert.deepEqual(placed[0].pinOffsets, [[0, 0], [3, 0]]);
});

test("dip_switch pin count drives its label", () => {
  const state = importStateWith(
    [{ ref: "S1", value: "SW_DIP_x04", category: "Switch:SW_DIP_x04", packageName: "", sourceFile: "x.net" }],
    { S1: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), { name: "", type: "" }])) }
  );
  const placed = createPlacedComponentsFromParsed(state, [], 30);
  assert.equal(placed[0].kind, "dip_switch");
  assert.equal(placed[0].label, "DIPSW4");
  assert.equal(placed[0].pinOffsets.length, 8);
});
