import assert from "node:assert/strict";
import test from "node:test";
import { isMultisimCrossRef, isMultisimNetlist, parseMultisimFiles } from "../src/features/import/multisim/multisimReport.ts";
import { applyInferredPinCounts } from "../src/features/import/multisim/pinCountInference.ts";
import { applyProfilesToState } from "../src/features/import/multisim/library.ts";
import { collectPendingParts } from "../src/features/import/multisim/pending.ts";
import { resolveImportPins } from "../src/features/import/pinResolver.ts";
import { mergeImportState, removeFileData } from "../src/features/import/kicadNetlistParser.ts";
import { suggestPinCountFromPackage } from "../src/features/import/pinCount.ts";
import { buildProfile, isDraftValid } from "../src/features/import/multisim/profileBuilder.ts";
import type { ImportState, PinProfile } from "../src/types/project.ts";

const CROSS_REF = `_uc9 RefDes report (2026_uc7: 2026_uc15e745_uc_uc, 22:44:29)
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
RefDes                      _uc263cf8ff0                               _uc27cfb5217                               _uc25c0188c5
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
VEE                         VEE                              POWER_SOURCES                    -
0                           GROUND                           POWER_SOURCES                    -
VCC                         VCC                              POWER_SOURCES                    -
U1                          TL062IP                          OPAMP                            PDIP-P-8
R1                          1kOhm                            RESISTOR                         -
D1                          1N4149                           DIODE                            DO-35
--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
`;

const NETLIST = `_uca7f5 report (2026_uc462535: 2026_uc15e745, 22:40:11)
------------------------------------------------------------------------------------------------------------------
_uc27f517edc                       _uc375358def56fe                       _uc3514356684ef6                       _uc27ba1811a
------------------------------------------------------------------------------------------------------------------
0                              try1                      U1A                                   1IN+
0                              try1                      _uc257307ebf                          1
1                              try1                      U1A                                   1OUT
1                              try1                      R1                                    2
2                              try1                      R1                                    1
2                              try1                      U1A                                   1IN-
VCC                            try1                      U1A                                   VS+
VCC                            try1                      VCC                                   VCC
------------------------------------------------------------------------------------------------------------------
`;

function parseFixture(): ImportState {
  const parsed = parseMultisimFiles([
    { name: "cross.txt", text: CROSS_REF },
    { name: "netlist.txt", text: NETLIST }
  ]);
  return {
    components: parsed.components,
    nets: parsed.nets,
    warnings: parsed.warnings,
    pinInfo: {}
  };
}

function tl062Profile(): PinProfile {
  return buildProfile(
    { value: "TL062IP", package: "PDIP-P-8", category: "AMPLIFIER_OPERATIONAL:OPAMP" },
    {
      pinCount: 8,
      mappings: [
        { unit: "A", logical: "1OUT", physical: 1 },
        { unit: "A", logical: "1IN-", physical: 2 },
        { unit: "A", logical: "1IN+", physical: 3 },
        { unit: "A", logical: "VS+", physical: 8 }
      ],
      bindings: [{ physical: 4, net: "0" }]
    }
  );
}

test("detects Multisim reports by structure, not by header text", () => {
  assert.equal(isMultisimCrossRef(CROSS_REF), true);
  assert.equal(isMultisimNetlist(NETLIST), true);
  assert.equal(isMultisimNetlist(CROSS_REF), false);
  assert.equal(isMultisimNetlist("(export (version D) (components))"), false);
  assert.equal(isMultisimNetlist("PROTEL NETLIST 2.0\n[\nDESIGNATOR\nR1\n]"), false);
});

test("parses parts, nets, units and drops power symbols plus mojibake refs", () => {
  const state = parseFixture();
  assert.deepEqual(state.components.map((component) => component.ref).sort(), ["D1", "R1", "U1"]);

  const u1 = state.components.find((component) => component.ref === "U1");
  assert.equal(u1?.value, "TL062IP");
  assert.equal(u1?.category, "Amplifier_Operational:OpAmp");
  assert.equal(u1?.packageName, "PDIP-P-8");
  assert.equal(u1?.format, "multisim");

  const ground = state.nets.find((net) => net.name === "0");
  assert.deepEqual(ground?.nodes, [{ ref: "U1", pin: "1IN+", logicalPin: "1IN+", unit: "A", sourceFile: "netlist.txt" }]);

  const vcc = state.nets.find((net) => net.name === "VCC");
  assert.deepEqual(vcc?.nodes.map((node) => node.ref), ["U1"]);
  assert.ok(state.components.every((component) => component.ref !== "VCC"));
});

test("numeric logical pins get a physical pin count without a profile", () => {
  const state = parseFixture();
  const next = applyInferredPinCounts(state);
  const r1 = next.components.find((component) => component.ref === "R1");
  assert.equal(r1?.pinCount, 2);
  assert.equal(next.components.find((component) => component.ref === "U1")?.pinCount, 8);
  assert.equal(next.components.find((component) => component.ref === "D1")?.pinCount, 2);
});

test("unresolved parts are listed once per identity", () => {
  const parsed = parseFixture();
  const state = applyInferredPinCounts({
    ...parsed,
    components: parsed.components.map((component) =>
      component.ref === "U1" ? { ...component, value: "MYSTERYCHIP" } : component
    )
  });
  const pending = collectPendingParts(state);
  assert.equal(pending.length, 1);
  const chip = pending.find((part) => part.value === "MYSTERYCHIP");
  assert.equal(chip?.reason, "pin_map");
  assert.equal(chip?.pinCount, 8);
  assert.deepEqual(
    chip?.logicalPins.map((pin) => pin.shared ? pin.logical : `${pin.unit}:${pin.logical}`).sort(),
    ["A:1IN+", "A:1IN-", "A:1OUT", "VS+"]
  );
});

test("numeric-only parts keep their inferred pin count when no profile matches", () => {
  const state = applyProfilesToState(parseFixture(), []);
  const r1 = state.components.find((component) => component.ref === "R1");
  assert.equal(r1?.pinCount, 2);
  assert.equal(state.components.find((component) => component.ref === "U1")?.pinCount, 8);
});

test("a saved profile resolves logical pins and binds spare pins to existing nets", () => {
  const state = applyProfilesToState(parseFixture(), [tl062Profile()]);
  assert.equal(collectPendingParts(state).length, 0);

  const resolved = resolveImportPins(state);
  const net0 = resolved.nets.find((net) => net.name === "0");
  const synthetic = net0?.nodes.find((node) => node.synthetic);
  assert.equal(synthetic?.physicalPin, 4);
  assert.equal(synthetic?.physicalRef, "U1");

  const net1 = resolved.nets.find((net) => net.name === "1");
  const u1Out = net1?.nodes.find((node) => node.ref === "U1");
  assert.equal(u1Out?.physicalPin, 1);
  assert.equal(u1Out?.pinRole, "1OUT");
});

test("profile coverage drives the pending state", () => {
  const profile = tl062Profile();
  const state = applyProfilesToState(parseFixture(), [profile]);
  const pending = collectPendingParts(state);
  assert.ok(pending.every((part) => part.value !== "TL062IP"));
});

test("profile validation rejects duplicate and out-of-range pins", () => {
  assert.equal(isDraftValid({
    pinCount: 8,
    mappings: [{ logical: "A", physical: 1 }, { logical: "Y", physical: 1 }],
    bindings: []
  }), false);
  assert.equal(isDraftValid({
    pinCount: 8,
    mappings: [{ logical: "A", physical: 9 }],
    bindings: []
  }), false);
  assert.equal(isDraftValid({
    pinCount: 8,
    mappings: [{ logical: "A", physical: 1 }],
    bindings: [{ physical: 7, net: "0" }]
  }), true);
});

test("shared power pins are listed once and every unit resolves to the same physical pin", () => {
  const profile = buildProfile(
    { value: "LM324D", package: "CASE751A" },
    {
      pinCount: 14,
      mappings: [
        { unit: "A", logical: "1OUT", physical: 1 },
        { unit: "A", logical: "1IN-", physical: 2 },
        { unit: "A", logical: "1IN+", physical: 3 },
        { unit: "B", logical: "2OUT", physical: 7 },
        { logical: "VS+", physical: 4, shared: true },
        { logical: "VS-", physical: 11, shared: true }
      ],
      bindings: []
    }
  );

  const state: ImportState = {
    components: [{ ref: "U1", value: "LM324D", category: "Amplifier_Operational:OpAmp", packageName: "CASE751A", sourceFile: "x", format: "multisim" }],
    nets: [
      { name: "1", nodes: [{ ref: "U1", pin: "1OUT", logicalPin: "1OUT", unit: "A" }] },
      { name: "VCC", nodes: [{ ref: "U1", pin: "VS+", logicalPin: "VS+", unit: "A" }, { ref: "U1", pin: "VS+", logicalPin: "VS+", unit: "B" }] }
    ],
    warnings: [],
    pinProfiles: [profile]
  };

  assert.equal(collectPendingParts(state).length, 0);
  const resolved = resolveImportPins(state);
  const vcc = resolved.nets.find((net) => net.name === "VCC");
  assert.deepEqual(vcc?.nodes.map((node) => node.physicalPin), [4, 4]);
});

test("profile validation rejects duplicate physical pins even for power names", () => {
  assert.equal(isDraftValid({
    pinCount: 14,
    mappings: [
      { logical: "VS+", physical: 4, shared: true },
      { logical: "VS+", physical: 4, shared: true }
    ],
    bindings: []
  }), false);
});

test("package hints cover Multisim and Ultiboard naming", () => {
  assert.equal(suggestPinCountFromPackage("PDIP-P-8"), 8);
  assert.equal(suggestPinCountFromPackage("DIP-14"), 14);
  assert.equal(suggestPinCountFromPackage("SOIC-16_3.9x9.9mm"), 16);
  assert.equal(suggestPinCountFromPackage("TO-39"), 3);
  assert.equal(suggestPinCountFromPackage("TO-220-3_Vertical"), 3);
  assert.equal(suggestPinCountFromPackage("HDR1X4"), 4);
  assert.equal(suggestPinCountFromPackage("Conn_01x04"), 4);
  assert.equal(suggestPinCountFromPackage("-"), undefined);
});

test("merging and removing files keep user profiles", () => {
  const profile = tl062Profile();
  const state: ImportState = { ...parseFixture(), pinProfiles: [profile] };
  const merged = mergeImportState(state, { components: [], nets: [], pinInfo: {}, warnings: [] });
  assert.deepEqual(merged.pinProfiles, [profile]);

  const removed = removeFileData(state, ["netlist.txt"]);
  assert.deepEqual(removed.pinProfiles, [profile]);
});

test("a half import tags its warning so a later import can clear it", () => {
  const netlistOnly = parseMultisimFiles([{ name: "netlist.txt", text: NETLIST }]);
  assert.deepEqual(netlistOnly.warnings.map((warning) => warning.code), ["missing_crossref"]);

  const crossOnly = parseMultisimFiles([{ name: "cross.txt", text: CROSS_REF }]);
  assert.deepEqual(crossOnly.warnings.map((warning) => warning.code), ["missing_netlist"]);

  const both = parseMultisimFiles([
    { name: "netlist.txt", text: NETLIST },
    { name: "cross.txt", text: CROSS_REF }
  ]);
  assert.equal(both.warnings.length, 0);
});

