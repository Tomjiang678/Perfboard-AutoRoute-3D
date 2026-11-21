import assert from "node:assert/strict";
import test from "node:test";
import { inferPinCountFromPackage, resolvePinCountHint } from "../src/features/import/importConfig.ts";
import { parseProtelNetlist } from "../src/features/import/protelNetlist.ts";
import { createPlacedComponentsFromParsed } from "../src/features/import/componentMapping.ts";
import type { ImportState, ParsedComponent } from "../src/types/project.ts";

test("封装名里的脚数：常见芯片封装能解析", () => {
  assert.equal(inferPinCountFromPackage("DIP-8"), 8);
  assert.equal(inferPinCountFromPackage("Package_DIP:DIP-14_W7.62mm"), 14);
  assert.equal(inferPinCountFromPackage("SOIC-14_3.9x8.7mm_P1.27mm"), 14);
  assert.equal(inferPinCountFromPackage("TSSOP-20"), 20);
  assert.equal(inferPinCountFromPackage("QFN-32_5x5mm"), 32);
});

test("封装名里的脚数：尺寸族不能误判", () => {
  // TO-220 / SOT-23 的数字是封装型号，不是脚数
  assert.equal(inferPinCountFromPackage("TO-220-3_Vertical"), undefined);
  assert.equal(inferPinCountFromPackage("SOT-23"), undefined);
  assert.equal(inferPinCountFromPackage("R_0805_2012Metric"), undefined);
  assert.equal(inferPinCountFromPackage("HDR1X2"), undefined);
});

test("脚数取“网表用到 / 型号库 / 封装名”的最大值", () => {
  const chip: ParsedComponent = {
    ref: "U1",
    value: "LM2904",
    category: "Amplifier_Operational:OpAmp",
    packageName: "DIP-8",
    sourceFile: "a.net"
  };
  // 网表里只用了 2 个脚，但封装是 DIP-8
  assert.equal(resolvePinCountHint(chip, 2), 8);
  // 完全没有网表信息时，靠封装名
  assert.equal(resolvePinCountHint(chip, undefined), 8);
  // 型号库认识的芯片，即使封装名没了也能纠正
  const noPackage = { ...chip, packageName: "" };
  assert.ok(resolvePinCountHint(noPackage, 2) >= 8);
});

function protelWithPartialChip(): string {
  return [
    "PROTEL NETLIST 2.0",
    "",
    "[",
    "DESIGNATOR",
    "U2",
    "FOOTPRINT",
    "DIP-8",
    "VALUE",
    "LM358",
    "]",
    "[",
    "DESIGNATOR",
    "R1",
    "FOOTPRINT",
    "AXIAL0.4",
    "VALUE",
    "10K",
    "]",
    "(",
    "OUT",
    "U2-1",
    "R1-1",
    ")",
    "(",
    "IN",
    "U2-3",
    "R1-2",
    ")"
  ].join("\n");
}

test("嘉立创/Protel 网表：8 脚芯片只接了 2 个脚，仍然识别成 8 脚", () => {
  const bundle = parseProtelNetlist(protelWithPartialChip(), "partial.net");
  const importState: ImportState = {
    components: bundle.components,
    nets: bundle.nets,
    warnings: bundle.warnings,
    pinInfo: bundle.pinInfo
  };
  // 网表里确实只有 2 个脚
  assert.deepEqual(Object.keys(importState.pinInfo?.U2 ?? {}).map(Number).sort((a, b) => a - b), [1, 3]);

  const placed = createPlacedComponentsFromParsed(importState, [], 30);
  const chip = placed.find((component) => component.name === "U2");
  assert.ok(chip, "U2 没有被生成");
  assert.equal(chip.pinCount, 8);
  assert.equal(chip.kind, "dip");

  // 两脚电阻不受影响
  const resistor = placed.find((component) => component.name === "R1");
  assert.equal(resistor?.pinCount, 2);
});
