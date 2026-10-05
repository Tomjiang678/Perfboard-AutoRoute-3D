import assert from "node:assert/strict";
import test from "node:test";
import { isPowerNet } from "../src/features/board/placement.ts";

const POWER_NETS = [
  "GND", "gnd", "Gnd", "GROUND", "VCC", "VDD", "VEE", "VSS", "VPP",
  "VBAT", "VIN", "VOUT", "3V3", "3.3V", "+5V", "+12V", "-5V", "-12V",
  "+3.3V", "12V", "5V", "VDC5", "+V", "-V", "0",
  "GND1", "VCC2", "VDD_A", "VEE_B", "VSS1", "VPP1", "VBAT2", "VIN3", "VOUT4",
  " +5V", "+5V ", "PWR_VCC", "DGND", "AGND", "GND_D", "GND_A", "5V_REG"
];

const NON_POWER_NETS = [
  "SIGNAL", "N1", "NET_1", "OUT", "IN", "CLK", "DATA", "LED1", "R1_PAD1",
  "Net-(R1-Pad2)", "Net-(U1A--)", "unconnected-(R1-Pad1)", "SDA", "SCL",
  "A0", "B1", "TX", "RX", "MOSI", "MISO", "CS", "EN", "REF", "FB", "COMP",
  "V1", "VCORE", "V_REF", "VDIGITAL", "V_SENSE", "PGOOD", "TRIG",
  "THRES", "DISCH", "CTRL", "RESET", "VO", "VI", "ADJ"
];

for (const net of POWER_NETS) {
  test(`isPowerNet("${net}") = true`, () => {
    assert.equal(isPowerNet(net), true);
  });
}

for (const net of NON_POWER_NETS) {
  test(`isPowerNet("${net}") = false`, () => {
    assert.equal(isPowerNet(net), false);
  });
}

test("isPowerNet(undefined) = false", () => {
  assert.equal(isPowerNet(undefined), false);
});

test("isPowerNet does not match power-ish substrings inside words", () => {
  assert.equal(isPowerNet("VCCIO"), false);
  assert.equal(isPowerNet("GNDA"), false);
  assert.equal(isPowerNet("AVDD"), false);
});
