import assert from "node:assert/strict";
import test from "node:test";
import { applyProfilesToState } from "../src/features/import/multisim/library.ts";
import { resolveBuiltinProfile } from "../src/features/import/multisim/builtinProfiles.ts";
import { findProfilePin } from "../src/features/import/multisim/profile.ts";
import { collectPendingParts } from "../src/features/import/multisim/pending.ts";
import { resolveImportPins } from "../src/features/import/pinResolver.ts";
import type { ImportState, ParsedComponent } from "../src/types/project.ts";

function component(value: string, packageName: string): ParsedComponent {
  return {
    ref: "U1",
    value,
    category: "Amplifier_Operational:OpAmp",
    packageName,
    sourceFile: "x",
    format: "multisim"
  };
}

function stateWith(value: string, packageName: string, logicalPins: Array<[string, string]>): ImportState {
  return {
    components: [component(value, packageName)],
    nets: logicalPins.map(([unit, logical]) => ({
      name: logical,
      nodes: [{ ref: "U1", pin: logical, logicalPin: logical, unit }]
    })),
    warnings: []
  };
}

test("old dual-opamp models expose their logical pins and aliases", () => {
  const profile = resolveBuiltinProfile(component("TL062IP", "PDIP-P-8"));
  assert.equal(profile?.pinCount, 8);
  assert.equal(findProfilePin(profile!, "A", "1OUT")?.physical, 1);
  assert.equal(findProfilePin(profile!, "A", "OUT")?.physical, 1);
  assert.equal(findProfilePin(profile!, "B", "2OUT")?.physical, 7);
  assert.equal(findProfilePin(profile!, "A", "VS+")?.physical, 8);
  assert.equal(findProfilePin(profile!, "B", "VS-")?.physical, 4);
});

test("LM324 and 74xx quad parts resolve without a user profile", () => {
  const lm324 = resolveBuiltinProfile(component("LM324D", "CASE751A"));
  assert.equal(lm324?.pinCount, 14);
  assert.equal(findProfilePin(lm324!, "C", "3IN+")?.physical, 10);
  assert.equal(findProfilePin(lm324!, "D", "4OUT")?.physical, 14);

  const gate = resolveBuiltinProfile(component("74HC00N", "DIP-14"));
  assert.equal(gate?.pinCount, 14);
  assert.equal(findProfilePin(gate!, "B", "2A")?.physical, 4);
  assert.equal(findProfilePin(gate!, "D", "4Y")?.physical, 11);
});

test("discrete, timer and regulator models keep their physical pin order", () => {
  const timer = resolveBuiltinProfile(component("NE555P", "DIP-8"));
  assert.equal(findProfilePin(timer!, undefined, "TRIG")?.physical, 2);
  assert.equal(findProfilePin(timer!, undefined, "VCC")?.physical, 8);

  const transistor = resolveBuiltinProfile(component("2N3904", "TO-92"));
  assert.equal(findProfilePin(transistor!, undefined, "E")?.physical, 1);
  assert.equal(findProfilePin(transistor!, undefined, "B")?.physical, 2);
  assert.equal(findProfilePin(transistor!, undefined, "C")?.physical, 3);

  const regulator = resolveBuiltinProfile(component("LM317T", "TO-220"));
  assert.equal(findProfilePin(regulator!, undefined, "ADJ")?.physical, 1);
  assert.equal(findProfilePin(regulator!, undefined, "OUT")?.physical, 2);
  assert.equal(findProfilePin(regulator!, undefined, "IN")?.physical, 3);
});

test("built-in profiles resolve imports without adding project data", () => {
  const state = applyProfilesToState(stateWith("TL062IP", "PDIP-P-8", [
    ["A", "1IN+"],
    ["A", "1OUT"],
    ["B", "2IN-"]
  ]), []);

  assert.equal(collectPendingParts(state).length, 0);
  assert.deepEqual(state.pinProfiles ?? [], []);
  assert.equal(state.components[0].pinCount, 8);

  const resolved = resolveImportPins(state);
  assert.equal(resolved.nets[0].nodes[0].physicalPin, 3);
});

test("every model carried over from the old override file resolves", () => {
  const cases: Array<[string, number]> = [
    ["TL062IP", 8], ["TL072CP", 8], ["TL082CP", 8], ["LM358N", 8], ["LM2904", 8],
    ["LM393N", 8], ["LM2903", 8], ["LM324D", 14], ["LM2902", 14],
    ["LM339N", 14], ["LM2901", 14], ["NE555P", 8], ["LM555", 8], ["TLC555", 8],
    ["74HC00N", 14], ["74HC04N", 14], ["74HC08N", 14], ["74HC10N", 14],
    ["74HC20N", 14], ["74HC74N", 14], ["74LS138N", 16], ["74LS160N", 16], ["74LS85N", 16],
    ["LM317T", 3], ["LM317AH", 3], ["IRF540N", 3], ["2N3904", 3], ["2N3906", 3],
    ["OP07CP", 8], ["SEVEN_SEG_COM_K", 8], ["ALPHA_NUMERIC_COM_A", 18]
  ];
  for (const [value, pinCount] of cases) {
    const profile = resolveBuiltinProfile(component(value, "DIP-14"));
    assert.ok(profile, `${value} should resolve`);
    assert.equal(profile.pinCount, pinCount, `${value} pin count`);
  }
});

test("single-unit symbols tolerate a missing or extra unit suffix", () => {
  const decoder = resolveBuiltinProfile(component("74LS138N", "DIP-16"));
  assert.equal(findProfilePin(decoder!, undefined, "A")?.physical, 1);
  assert.equal(findProfilePin(decoder!, "B", "A")?.physical, 1);

  const timer = resolveBuiltinProfile(component("NE555P", "DIP-8"));
  assert.equal(findProfilePin(timer!, "A", "TRIG")?.physical, 2);
});

test("a user profile overrides the built-in model for the same identity", () => {
  const userProfile = {
    id: "custom",
    identity: { value: "TL062IP", package: "PDIP-P-8" },
    pinCount: 8,
    pins: [{ physical: 7, logical: "1OUT", unit: "A", connection: "netlist" as const }],
    createdAt: "2026-11-20"
  };
  const state = applyProfilesToState(stateWith("TL062IP", "PDIP-P-8", [["A", "1OUT"]]), [userProfile]);
  const resolved = resolveImportPins(state);
  assert.equal(resolved.nets[0].nodes[0].physicalPin, 7);
});
