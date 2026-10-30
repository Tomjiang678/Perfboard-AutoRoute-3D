import type { ImportState, ImportWarning, ParsedComponent, ParsedNet } from "../../types/project.ts";
import type { ParsedImportBundle } from "./kicadNetlistParser.ts";
import { findDevicePinModel, isModelPowerPin, pinNameFromModel } from "./pinModels.ts";

/**
 * Protel 2 netlist importer (嘉立创 EDA / 立创EDA "Protel / Protel2" export).
 *
 * Format:
 *   PROTEL NETLIST 2.0
 *   [
 *   DESIGNATOR
 *   R1
 *   FOOTPRINT
 *   AXIAL0.4
 *   VALUE
 *   10K
 *   ]
 *   (
 *   GND
 *   R1-2
 *   C1-2
 *   )
 *
 * The file carries no library/symbol information at all: a part is only a
 * designator, a value and a footprint, and its pin numbers exist solely as
 * entries on net nodes. So the importer synthesises the same import bundle the
 * KiCad path produces (instead of round-tripping through a fake S-expression),
 * and reuses the project's own device pin models so pin names and power pins
 * still show up.
 */
const PROTEL_HEADER = /^PROTEL\s+NETLIST\b/i;

/**
 * Format sniff. The banner is the reliable signal, but some exporters strip it
 * (or prepend a BOM/comment), so a DESIGNATOR key inside a bracketed block plus
 * parenthesised net blocks is accepted as well — KiCad netlists contain neither.
 */
export function isProtelNetlist(text: string) {
  const normalized = normalizeText(text);
  if (PROTEL_HEADER.test(normalized.trimStart())) return true;
  return /^\s*DESIGNATOR\s*$/im.test(normalized) &&
    /^\s*\[\s*$/m.test(normalized) &&
    /^\s*\(\s*$/m.test(normalized);
}

export function parseProtelNetlist(text: string, fileName: string): ParsedImportBundle {
  const lines = normalizeText(text).split("\n");
  const rawComponents: RawComponent[] = [];
  const rawNets: RawNet[] = [];
  const warnings: ImportWarning[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line !== "[" && line !== "(") continue;
    const block = readBlock(lines, index, line);
    index = block.lastIndex;
    if (line === "[") {
      const component = parseComponentBlock(block.lines);
      if (component) rawComponents.push(component);
      else if (block.lines.some((entry) => entry.trim())) {
        warnings.push({ fileName, message: "跳过了一个无法识别的元件块（缺少 DESIGNATOR）。" });
      }
    } else {
      const net = parseNetBlock(block.lines);
      if (net) rawNets.push(net);
    }
  }

  const pinNumbersByRef = collectPinNumbers(rawNets);
  const components = buildComponents(rawComponents, pinNumbersByRef, fileName);
  const knownRefs = new Set(components.map((component) => component.ref));
  const missingRefs = [...new Set(rawNets.flatMap((net) => net.nodes.map((node) => node.ref)))]
    .filter((ref) => !knownRefs.has(ref));
  if (missingRefs.length > 0) {
    warnings.push({
      fileName,
      message: `网络引用了元件表中不存在的位号：${formatList(missingRefs)}。请确认原理图导出完整。`
    });
  }

  const nets: ParsedNet[] = rawNets.map((net) => ({
    name: net.name,
    nodes: net.nodes.map((node) => ({ ref: node.ref, pin: node.pin, sourceFile: fileName })),
    sourceFile: fileName
  }));

  if (components.length === 0) {
    warnings.push({
      fileName,
      message: "未识别到 Protel 网表内容，请确认导出格式选的是 Protel / Protel2。"
    });
  }

  return { components, nets, pinInfo: buildPinInfo(components, pinNumbersByRef), warnings };
}

/* ── Block parsing ────────────────────────────────────────────────────── */

interface RawComponent {
  ref: string;
  value: string;
  footprint: string;
}

interface RawNet {
  name: string;
  nodes: Array<{ ref: string; pin: string }>;
}

function normalizeText(text: string) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

/**
 * Reads a `[`/`(` delimited block starting at `start`. Nesting is not expected
 * in Protel 2, so the first matching closer ends the block.
 */
function readBlock(lines: string[], start: number, opener: "[" | "(") {
  const closer = opener === "[" ? "]" : ")";
  const collected: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].trim() === closer) {
      return { lines: collected, lastIndex: index };
    }
    collected.push(lines[index]);
  }
  // Unterminated block: keep what we saw instead of dropping it silently.
  return { lines: collected, lastIndex: lines.length };
}

/**
 * Component blocks are alternating key/value lines. Keys are matched
 * case-insensitively because EasyEDA and Altium spell them differently.
 */
function parseComponentBlock(block: string[]): RawComponent | undefined {
  const fields = new Map<string, string>();
  for (let index = 0; index + 1 < block.length; index += 2) {
    const key = block[index].trim().toUpperCase();
    if (!key) {
      // Re-sync by one line instead of pairing a value with the next key.
      index -= 1;
      continue;
    }
    if (!fields.has(key)) fields.set(key, block[index + 1].trim());
  }

  const ref = fields.get("DESIGNATOR") ?? fields.get("REFERENCE") ?? fields.get("REF");
  if (!ref) return undefined;

  return {
    ref,
    value: fields.get("VALUE") ?? fields.get("PARTTYPE") ?? fields.get("NAME") ?? "",
    footprint: fields.get("FOOTPRINT") ?? fields.get("PACKAGE") ?? fields.get("DEVICE") ?? ""
  };
}

/**
 * Net blocks start with the net name and continue with one `REF-PIN` token per
 * node. Everything after the first whitespace on a line (Protel appends the
 * symbol pin name there) is ignored.
 */
function parseNetBlock(block: string[]): RawNet | undefined {
  const lines = block.map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return undefined;

  const name = lines[0];
  const nodes: RawNet["nodes"] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const token = line.split(/\s+/)[0];
    const match = token.match(/^(.+?)\s*-\s*(\d+)$/);
    if (!match) continue;
    const ref = match[1].trim();
    const pin = match[2];
    const id = `${ref}.${pin}`;
    if (seen.has(id)) continue;
    seen.add(id);
    nodes.push({ ref, pin });
  }

  return nodes.length > 0 ? { name, nodes } : undefined;
}

/* ── Component classification ─────────────────────────────────────────── */

/**
 * Protel has no `lib:part`, so a category is synthesised from the designator
 * prefix plus value/footprint keywords. The output uses the same `Lib:Part`
 * vocabulary as KiCad netlists, which means the existing mapping table in
 * importConfigData.json applies unchanged — no second mapping layer.
 */
export function classifyProtelComponent(ref: string, value: string, footprint: string, pinCount: number) {
  const prefix = ref.toUpperCase().match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "";
  const v = value.toUpperCase();
  const f = footprint.toUpperCase();
  const haystack = `${v} ${f}`;
  const pads = pinCount > 0 ? pinCount : 2;
  const padSuffix = pads < 10 ? `0${pads}` : String(pads);

  if (/SEG|数码|7SEG|LED_?DISPLAY/.test(haystack)) return "Display_Character:7SEG";
  if (/^(LED|DS)/.test(prefix) || haystack.includes("LED")) return "Device:LED";
  if (prefix === "K" || prefix === "RL" || haystack.includes("RELAY")) return "Relay:Relay_SPDT";
  if (prefix === "BR" || prefix === "DB" || haystack.includes("BRIDGE")) return "Diode_Bridge:BR";
  if (prefix === "RV" || prefix === "VR" || prefix === "PR" || prefix === "RP") return "Device:R_Potentiometer";
  if (prefix === "RN") return "Device:R_Network";
  if (/^(Y|X|XTAL)$/.test(prefix) || haystack.includes("CRYSTAL")) return "Device:Crystal";
  if (prefix === "TB" || haystack.includes("TERMINAL") || haystack.includes("SCREW")) return "TerminalBlock:TerminalBlock";
  if (/^(BZ|LS|SP|BUZ)$/.test(prefix) || haystack.includes("BUZZER")) return "Device:Buzzer";

  if (/^(SW|KEY|S)$/.test(prefix) || haystack.includes("SWITCH")) {
    if (haystack.includes("DIP")) return "Switch:SW_DIP_x04";
    if (/PUSH|TACT|轻触|BUTTON|MOMENTARY/.test(haystack)) return "Button:SW_Push";
    return "Switch:SW_SPDT";
  }

  if (/^(Q|T|VT|QT)$/.test(prefix)) {
    if (/IRF|IRL|IRFP|STP|FQP|2SK|IXFP|AO\d|SI\d/.test(v) ||
        /TO-?220|TO-?247|TO-?252|DPAK/.test(f)) {
      return "Transistor_FET:MOSFET";
    }
    return "Transistor_BJT:NPN";
  }

  if (/^(U|IC|N|A|DA|OP)$/.test(prefix)) {
    if (v.includes("555")) return "Timer:NE555";
    // 74HC14 / 74LS00 / 741 / 4017 / 40106 all land on the DIP rules.
    if (/^74\d/.test(v) || /^74[A-Z]{1,3}\d/.test(v) || /^4[05]\d/.test(v)) return "74xx:74xx";
    if (/^(LM|TL|NE|OP|AD|LT|MC|CA|TDA|INA|THS)\d/.test(v)) return "Amplifier_Operational:OpAmp";
    if (/STM32|ATMEGA|ATTINY|ESP32|ESP8266|PIC\d|RP2040|MSP430/.test(v)) return "MCU_Generic:MCU";
    return "Socket:DIP";
  }

  if (/^(J|P|CN|JP|H|CON|XH)$/.test(prefix)) return `Connector_Generic:Conn_01x${padSuffix}`;
  if (/^(TP|TEST)$/.test(prefix)) return "TestPoint:TestPad";

  if (prefix.startsWith("R")) return "Device:R";
  if (prefix.startsWith("C")) {
    return /CP|POLAR|ELEC|电解|钽/.test(haystack) ? "Device:CP" : "Device:C";
  }
  if (prefix.startsWith("L")) return "Device:L";
  if (prefix.startsWith("D")) return "Device:D";
  if (prefix.startsWith("F")) return "Device:Fuse";

  return `Unknown:${(footprint || value || "Generic").replace(/\s+/g, "_")}`;
}

function buildComponents(
  rawComponents: RawComponent[],
  pinNumbersByRef: Map<string, Set<string>>,
  fileName: string
): ParsedComponent[] {
  const byRef = new Map<string, ParsedComponent>();
  for (const raw of rawComponents) {
    if (byRef.has(raw.ref)) continue;
    const pinCount = pinNumbersByRef.get(raw.ref)?.size ?? 0;
    byRef.set(raw.ref, {
      ref: raw.ref,
      value: raw.value,
      category: classifyProtelComponent(raw.ref, raw.value, raw.footprint, pinCount),
      packageName: raw.footprint,
      sourceFile: fileName
    });
  }
  return [...byRef.values()];
}

function collectPinNumbers(rawNets: RawNet[]) {
  const byRef = new Map<string, Set<string>>();
  for (const net of rawNets) {
    for (const node of net.nodes) {
      const pins = byRef.get(node.ref) ?? new Set<string>();
      pins.add(node.pin);
      byRef.set(node.ref, pins);
    }
  }
  return byRef;
}

/**
 * Pin metadata is rebuilt from net membership (there is nothing else to read),
 * with pin names/types filled in from the device pin models. Components that
 * never appear on a net keep no entry and fall back to the library defaults.
 */
function buildPinInfo(components: ParsedComponent[], pinNumbersByRef: Map<string, Set<string>>) {
  const pinInfo: NonNullable<ImportState["pinInfo"]> = {};

  for (const component of components) {
    const rawPins = pinNumbersByRef.get(component.ref);
    if (!rawPins || rawPins.size === 0) continue;
    const pins = [...rawPins]
      .map(Number)
      .filter((pin) => Number.isInteger(pin) && pin > 0)
      .sort((a, b) => a - b);
    if (pins.length === 0) continue;

    const model = findDevicePinModel(component.value, component.category);
    const perPin: NonNullable<ImportState["pinInfo"]>[string] = {};
    for (const pin of pins) {
      const modelName = pinNameFromModel(model, pin);
      perPin[pin] = {
        name: modelName || String(pin),
        type: isModelPowerPin(model, pin) ? "power" : "signal"
      };
    }
    pinInfo[component.ref] = perPin;
  }

  return pinInfo;
}

function formatList(values: string[]) {
  const head = values.slice(0, 8).join("、");
  return values.length > 8 ? `${head} 等 ${values.length} 个` : head;
}
