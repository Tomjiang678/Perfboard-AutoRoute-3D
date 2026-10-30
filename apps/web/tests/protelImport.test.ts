import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProtelComponent,
  isProtelNetlist,
  parseProtelNetlist
} from "../src/features/import/protelNetlist.ts";
import { mergeImportState, parseImportFiles } from "../src/features/import/kicadNetlistParser.ts";
import { createPlacedComponentsFromParsed } from "../src/features/import/componentMapping.ts";
import { buildNetlistText } from "./helpers/netlistFactory.ts";
import type { ImportState } from "../src/types/project.ts";

const EMPTY_IMPORT_STATE: ImportState = { components: [], nets: [], warnings: [], pinInfo: {} };

function protelNetlistText() {
  return [
    "PROTEL NETLIST 2.0",
    "",
    "[",
    "DESIGNATOR",
    "R1",
    "FOOTPRINT",
    "AXIAL0.4",
    "VALUE",
    "10K",
    "]",
    "[",
    "DESIGNATOR",
    "C1",
    "FOOTPRINT",
    "CAP-TH_BD5.0-P2.00",
    "VALUE",
    "10uF",
    "]",
    "[",
    "DESIGNATOR",
    "U1",
    "FOOTPRINT",
    "DIP-8",
    "VALUE",
    "LM2904",
    "]",
    "[",
    "DESIGNATOR",
    "J1",
    "FOOTPRINT",
    "HDR1X2",
    "VALUE",
    "2P",
    "]",
    "(",
    "VCC",
    "R1-1",
    "U1-8",
    ")",
    "(",
    "GND",
    "C1-2",
    "U1-4",
    "J1-2",
    ")",
    "(",
    "OUT",
    "R1-2",
    "C1-1",
    "U1-1",
    ")",
    "(",
    "IN",
    "J1-1",
    "U1-3",
    ")",
    "(",
    "NC_A",
    "U1-2",
    ")",
    "(",
    "NC_B",
    "U1-5",
    ")",
    "(",
    "NC_C",
    "U1-6",
    ")",
    "(",
    "NC_D",
    "U1-7",
    ")"
  ].join("\n");
}

test("detects a Protel netlist by its header, not by file extension", () => {
  assert.equal(isProtelNetlist(protelNetlistText()), true);
  assert.equal(isProtelNetlist("\uFEFF  protel netlist 2.0\n["), true);

  const kicad = buildNetlistText({
    components: [{ ref: "R1", lib: "Device", part: "R", value: "1k", pins: [{ num: 1, name: "1", type: "passive" }, { num: 2, name: "2", type: "passive" }] }],
    nets: [{ name: "N1", nodes: [{ ref: "R1", pin: 1 }] }]
  });
  assert.equal(isProtelNetlist(kicad), false);
});

test("detects a Protel netlist even when the banner was stripped", () => {
  const withoutBanner = protelNetlistText().replace("PROTEL NETLIST 2.0\n\n", "");
  assert.equal(isProtelNetlist(withoutBanner), true);
  const bundle = parseProtelNetlist(withoutBanner, "noheader.net");
  assert.equal(bundle.components.length, 4);
});

test("parses components, nets and pin numbers from a Protel netlist", () => {
  const bundle = parseProtelNetlist(protelNetlistText(), "board.net");
  assert.deepEqual(bundle.components.map((component) => component.ref), ["R1", "C1", "U1", "J1"]);
  assert.equal(bundle.warnings.length, 0);

  const resistor = bundle.components.find((component) => component.ref === "R1");
  assert.equal(resistor?.category, "Device:R");
  assert.equal(resistor?.packageName, "AXIAL0.4");
  assert.equal(resistor?.value, "10K");

  const opamp = bundle.components.find((component) => component.ref === "U1");
  assert.equal(opamp?.category, "Amplifier_Operational:OpAmp");
  // The pin table is rebuilt from net membership: a DIP-8 that appears on nets
  // with all eight pins must end up with eight pins, not the fallback two.
  assert.deepEqual(Object.keys(bundle.pinInfo.U1 ?? {}).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
  // Pin roles come from the shared device pin models, not from the netlist.
  assert.equal(bundle.pinInfo.U1?.[4]?.type, "power");
  assert.equal(bundle.pinInfo.U1?.[8]?.type, "power");
  assert.equal(bundle.pinInfo.U1?.[1]?.type, "signal");
  assert.ok((bundle.pinInfo.U1?.[4]?.name ?? "").length > 0);

  const gnd = bundle.nets.find((net) => net.name === "GND");
  assert.deepEqual(gnd?.nodes.map((node) => `${node.ref}-${node.pin}`), ["C1-2", "U1-4", "J1-2"]);
  assert.equal(gnd?.sourceFile, "board.net");
});

test("reports nets that reference a designator missing from the component list", () => {
  const text = [
    "PROTEL NETLIST 2.0",
    "[",
    "DESIGNATOR",
    "R1",
    "FOOTPRINT",
    "AXIAL0.4",
    "]",
    "(",
    "N1",
    "R1-1",
    "R9-2",
    ")"
  ].join("\n");
  const bundle = parseProtelNetlist(text, "broken.net");
  assert.ok(bundle.warnings.some((warning) => warning.message.includes("R9")));
});

test("classifies parts by designator prefix and value/footprint keywords", () => {
  assert.equal(classifyProtelComponent("U1", "LM2904", "DIP-8", 8), "Amplifier_Operational:OpAmp");
  assert.equal(classifyProtelComponent("U2", "NE555", "DIP-8", 8), "Timer:NE555");
  assert.equal(classifyProtelComponent("U3", "74HC14", "DIP-14", 14), "74xx:74xx");
  assert.equal(classifyProtelComponent("U4", "STM32F103", "LQFP-48", 48), "MCU_Generic:MCU");
  assert.equal(classifyProtelComponent("C1", "100uF", "CAP-ELEC", 2), "Device:CP");
  assert.equal(classifyProtelComponent("C2", "100nF", "0603", 2), "Device:C");
  assert.equal(classifyProtelComponent("Q1", "IRF540", "TO-220", 3), "Transistor_FET:MOSFET");
  assert.equal(classifyProtelComponent("Q2", "S8050", "TO-92", 3), "Transistor_BJT:NPN");
  assert.equal(classifyProtelComponent("J1", "4P", "HDR1X4", 4), "Connector_Generic:Conn_01x04");
  assert.equal(classifyProtelComponent("K1", "SRD-05", "RELAY", 5), "Relay:Relay_SPDT");
  assert.equal(classifyProtelComponent("SW1", "拨动", "SW-DIP", 4), "Switch:SW_DIP_x04");
  assert.equal(classifyProtelComponent("D1", "", "LED-3MM", 2), "Device:LED");
  assert.equal(classifyProtelComponent("X1", "8MHz", "HC-49", 2), "Device:Crystal");
  // Unknown parts still produce a stable category; component mapping falls back
  // to its own prefix inference for them.
  assert.ok(classifyProtelComponent("Z9", "weird", "MYSTERY-3", 3).startsWith("Unknown:"));
});

test("a Protel file imported through the file API lands on the library as real parts", async () => {
  const file = new File([protelNetlistText()], "lceda.net", { type: "text/plain" });
  const bundle = await parseImportFiles([file]);
  const importState = mergeImportState(EMPTY_IMPORT_STATE, bundle);
  const placed = createPlacedComponentsFromParsed(importState, [], 30);

  const byName = new Map(placed.map((component) => [component.name, component]));
  assert.equal(byName.get("R1")?.kind, "resistor");
  assert.equal(byName.get("C1")?.kind, "radial_capacitor");
  assert.equal(byName.get("U1")?.kind, "dip");
  assert.equal(byName.get("U1")?.pinCount, 8);
  assert.equal(byName.get("J1")?.kind, "pin_header");
  assert.ok(placed.every((component) => !component.isFallback), "no part should degrade to a placeholder header");
});

test("KiCad files still go through the KiCad parser when both formats are present", async () => {
  const kicad = buildNetlistText({
    components: [{ ref: "R7", lib: "Device", part: "R", value: "1k", pins: [{ num: 1, name: "1", type: "passive" }, { num: 2, name: "2", type: "passive" }] }],
    nets: [{ name: "N1", nodes: [{ ref: "R7", pin: 1 }, { ref: "R7", pin: 2 }] }]
  });
  const bundle = await parseImportFiles([
    new File([kicad], "kicad.net"),
    new File([protelNetlistText()], "lceda.net")
  ]);
  assert.deepEqual(bundle.components.map((component) => component.ref).sort(), ["C1", "J1", "R1", "R7", "U1"]);
});
