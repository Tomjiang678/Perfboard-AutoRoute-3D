import type { AdapterSpec, LibraryComponentKind } from "../../types/project.ts";
import { createAdapterDefinition } from "./adapter.ts";
import { createPinHeaderDefinition, createPinHeaderOffsets } from "./pinHeader.ts";
import { centerBridgeKinds, threeInlinePinKinds } from "./componentTraits.ts";

export interface LibraryComponentDefinition {
  kind: LibraryComponentKind;
  label: string;
  title: string;
  pinCount?: number;
  leadSpacing: number;
  rowSpacing: number;
  sameSidePitch: number;
  pinHeaderRows?: number;
  pinHeaderColumns?: number;
  pinOffsets: Array<[number, number]>;
  /** 转接板条目才有：它的外形与排针规格 */
  adapter?: AdapterSpec;
}

// Geometry is defined in exactly one place (buildPinOffsetsForComponent):
// entries here only declare the spacing parameters and derive their pin
// offsets through the shared builder.
const rawLibrary: Array<Omit<LibraryComponentDefinition, "pinOffsets"> & { pinOffsets?: Array<[number, number]> }> = [
  makeTwoPin("resistor", "R", "电阻", 3),
  makeTwoPin("inductor", "L", "电感", 3),
  makeTwoPin("diode", "D", "二极管", 3),
  makeTwoPin("led", "LED", "LED", 1),
  makeTwoPin("radial_capacitor", "C", "普通电容", 1),
  makeTwoPin("electrolytic_capacitor", "EC", "电解电容", 1),
  { kind: "to92", label: "Q", title: "TO-92", pinCount: 3, leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1 },
  { kind: "to39", label: "Q", title: "TO-39", pinCount: 3, leadSpacing: 2, rowSpacing: 1, sameSidePitch: 1 },
  { kind: "to220", label: "Q", title: "TO-220", pinCount: 3, leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1 },
  { kind: "to3", label: "Q", title: "TO-3", pinCount: 3, leadSpacing: 2, rowSpacing: 2, sameSidePitch: 1 },
  { kind: "to247", label: "Q", title: "TO-247", pinCount: 3, leadSpacing: 2, rowSpacing: 0, sameSidePitch: 2 },
  { kind: "bridge_rectifier", label: "BR", title: "整流桥堆", pinCount: 4, leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1 },
  makeRelay("RLY-SPDT", "继电器 SPDT", 5),
  makeRelay("RLY-DPDT", "继电器 DPDT", 8),
  makeTwoPin("crystal", "Y", "晶振 HC-49", 2),
  makeTwoPin("fuse", "F", "保险丝", 5),
  makeDip("DIP8", "DIP-8", 8, 3, 1),
  makeDip("DIP14", "DIP-14", 14, 3, 1),
  makeDip("DIP16", "DIP-16", 16, 3, 1),
  makeDipSwitch("DIPSW6", "DIP 开关 6 位", 12, 3, 1),
  makeDipSwitch("DIPSW8", "DIP 开关 8 位", 16, 3, 1),
  makeDipSwitch("DIPSW10", "DIP 开关 10 位", 20, 3, 1),
  makeDisplay("7SEG", "七段数码管", "seven_segment_display", 10, 3, 1),
  makeDisplay("ALNUM", "字母数字显示器", "alphanumeric_display", 14, 3, 1),
  createPinHeaderDefinition(1, 4),
  createAdapterDefinition({ pinCount: 16, width: 7, height: 10, rowSpacing: 6 }),
  makeTwoPin("terminal_block", "TB", "接线端子", 1, 2),
  { kind: "slide_switch", label: "SW", title: "拨动开关 SPDT", pinCount: 3, leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1 },
  makeTwoPin("buzzer", "BZ", "蜂鸣器", 2),
  { kind: "tactile_switch", label: "SW", title: "轻触按键", pinCount: 4, leadSpacing: 2, rowSpacing: 2, sameSidePitch: 2 },
  { kind: "potentiometer", label: "RV", title: "电位器", pinCount: 3, leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1 }
];

export const componentLibrary: LibraryComponentDefinition[] = rawLibrary.map(finalizeLibraryEntry);

export const componentLibraryByKey = new Map(
  componentLibrary.map((component) => [makeLibraryDragKey(component), component])
);

export function getLibraryComponentByKind(kind: LibraryComponentKind, pinCount?: number) {
  const exact = componentLibrary.find((component) => component.kind === kind && component.pinCount === pinCount);
  return exact ?? (pinCount ? makeDynamicLibraryComponent(kind, pinCount) : undefined) ?? componentLibrary.find((component) => component.kind === kind);
}

export function makeLibraryDragKey(component: LibraryComponentDefinition) {
  return `${component.kind}:${component.pinCount ?? ""}:${component.label}`;
}

/** Single geometry source: derives pin offsets for any library entry. */
function finalizeLibraryEntry<T extends Omit<LibraryComponentDefinition, "pinOffsets"> & { pinOffsets?: Array<[number, number]> }>(entry: T): LibraryComponentDefinition {
  return { ...entry, pinOffsets: entry.pinOffsets ?? buildPinOffsetsForComponent(entry) };
}

function makeDynamicLibraryComponent(
  kind: LibraryComponentKind,
  pinCount: number
): LibraryComponentDefinition | undefined {
  if (pinCount <= 0) {
    return undefined;
  }

  if (kind === "dip") {
    return makeDip(`DIP${pinCount}`, `DIP-${pinCount}`, pinCount, 3, 1);
  }

  if (kind === "dip_switch") {
    const switchCount = Math.max(1, Math.floor(pinCount / 2));
    return makeDipSwitch(`DIPSW${switchCount}`, `DIP 开关 ${switchCount} 位`, pinCount, 3, 1);
  }

  if (kind === "pin_header") {
    return createPinHeaderDefinition(1, pinCount);
  }

  if (kind === "to92" || kind === "to220" || kind === "to247") {
    // 3-pin TO-92/TO-220 is the common case; netlists occasionally use 4/5-pin
    // variants, which become an inline single-row package with the same body.
    const pitch = kind === "to247" ? 2 : 1;
    return finalizeLibraryEntry({
      kind,
      label: "Q",
      title: kind === "to92" ? `TO-92-${pinCount}` : kind === "to247" ? `TO-247-${pinCount}` : `TO-220-${pinCount}`,
      pinCount,
      leadSpacing: pitch,
      rowSpacing: 0,
      sameSidePitch: pitch
    });
  }

  if (kind === "bridge_rectifier") {
    return finalizeLibraryEntry({
      kind,
      label: "BR",
      title: `桥堆 ${pinCount} 脚`,
      pinCount,
      leadSpacing: 1,
      rowSpacing: 0,
      sameSidePitch: 1
    });
  }

  if (kind === "relay") {
    return makeRelay(`RLY${pinCount}`, `继电器 ${pinCount} 脚`, pinCount);
  }

  if (kind === "seven_segment_display") {
    return makeDisplay("7SEG", "七段数码管", "seven_segment_display", pinCount, 3, 1);
  }

  if (kind === "alphanumeric_display") {
    return makeDisplay("ALNUM", "字母数字显示器", "alphanumeric_display", pinCount, 3, 1);
  }

  return undefined;
}

export function buildPinOffsetsForComponent(component: {
  kind: LibraryComponentKind;
  pinCount?: number;
  leadSpacing: number;
  rowSpacing: number;
  sameSidePitch: number;
  pinHeaderRows?: number;
  pinHeaderColumns?: number;
}): Array<[number, number]> {
  if (centerBridgeKinds.has(component.kind)) {
    return makeDipPinOffsetsWithPitch(component.pinCount ?? 8, component.rowSpacing, component.sameSidePitch);
  }

  if (threeInlinePinKinds.has(component.kind)) {
    return inlinePinOffsets(component.pinCount ?? 3, component.leadSpacing);
  }

  if (component.kind === "to247") {
    return inlinePinOffsets(component.pinCount ?? 3, component.leadSpacing);
  }

  if (component.kind === "to3") {
    const sideOffset = Math.max(1, Math.round(component.leadSpacing / 2));
    return [[-sideOffset, 0], [sideOffset, 0], [0, component.rowSpacing || 2]];
  }

  if (component.kind === "bridge_rectifier") {
    return inlinePinOffsets(component.pinCount ?? 4, component.leadSpacing);
  }

  if (component.kind === "relay") {
    return relayPinOffsets(component.pinCount ?? 5, component.rowSpacing);
  }

  if (component.kind === "crystal" || component.kind === "fuse") {
    return [[0, 0], [component.leadSpacing, 0]];
  }

  if (component.kind === "to39") {
    return [[-component.leadSpacing, 0], [component.leadSpacing, 0], [0, component.rowSpacing || 1]];
  }

  if (component.kind === "pin_header") {
    const rows = component.pinHeaderRows ?? 1;
    const columns = component.pinHeaderColumns ?? component.pinCount ?? 4;
    return createPinHeaderOffsets(rows, columns, component.sameSidePitch);
  }

  if (component.kind === "tactile_switch") {
    return [[0, 0], [component.leadSpacing, 0], [0, component.rowSpacing], [component.leadSpacing, component.rowSpacing]];
  }

  return [[0, 0], [component.leadSpacing, 0]];
}

function makeTwoPin(
  kind: LibraryComponentKind,
  label: string,
  title: string,
  leadSpacing: number,
  pinCount?: number
): LibraryComponentDefinition {
  return finalizeLibraryEntry({
    kind,
    label,
    title,
    pinCount,
    leadSpacing,
    rowSpacing: 0,
    sameSidePitch: 1
  });
}

function inlinePinOffsets(pinCount: number, pitch = 1): Array<[number, number]> {
  const start = -Math.floor(pinCount / 2) * pitch;
  return Array.from({ length: pinCount }, (_, index) => [start + index * pitch, 0] as [number, number]);
}

function makeRelay(label: string, title: string, pinCount: number): LibraryComponentDefinition {
  return finalizeLibraryEntry({
    kind: "relay",
    label,
    title,
    pinCount,
    leadSpacing: 1,
    rowSpacing: 1,
    sameSidePitch: 1
  });
}

function relayPinOffsets(pinCount: number, rowSpacing: number): Array<[number, number]> {
  // SPDT: 2 coil pins + COM/NO/NC; DPDT: 2 coil pins + 2×3 switch pins.
  if (pinCount === 5) {
    const switchRow = 1 + rowSpacing;
    return [[0, 0], [1, 0], [0, switchRow], [1, switchRow], [2, switchRow]];
  }
  if (pinCount === 8) {
    const firstSwitchRow = 1 + rowSpacing;
    const secondSwitchRow = firstSwitchRow + rowSpacing;
    return [[0, 0], [1, 0], [0, firstSwitchRow], [1, firstSwitchRow], [2, firstSwitchRow], [0, secondSwitchRow], [1, secondSwitchRow], [2, secondSwitchRow]];
  }
  return inlinePinOffsets(pinCount, 1);
}

function makeDip(
  label: string,
  title: string,
  pinCount: number,
  rowSpacing: number,
  sameSidePitch: number
): LibraryComponentDefinition {
  return makeDualRow("dip", label, title, pinCount, rowSpacing, sameSidePitch);
}

function makeDipSwitch(
  label: string,
  title: string,
  pinCount: number,
  rowSpacing: number,
  sameSidePitch: number
): LibraryComponentDefinition {
  return makeDualRow("dip_switch", label, title, pinCount, rowSpacing, sameSidePitch);
}

function makeDisplay(
  label: string,
  title: string,
  kind: "seven_segment_display" | "alphanumeric_display",
  pinCount: number,
  rowSpacing: number,
  sameSidePitch: number
): LibraryComponentDefinition {
  return makeDualRow(kind, label, title, pinCount, rowSpacing, sameSidePitch);
}

function makeDualRow(
  kind: "dip" | "dip_switch" | "seven_segment_display" | "alphanumeric_display",
  label: string,
  title: string,
  pinCount: number,
  rowSpacing: number,
  sameSidePitch: number
): LibraryComponentDefinition {
  return finalizeLibraryEntry({
    kind,
    label,
    title,
    pinCount,
    leadSpacing: rowSpacing,
    rowSpacing,
    sameSidePitch
  });
}

export function dipPinsPerSide(pinCount: number) {
  return Math.ceil(pinCount / 2);
}

export function makeDipPinOffsetsWithPitch(pinCount: number, rowSpacing: number, sameSidePitch: number) {
  const pinsPerSide = dipPinsPerSide(pinCount);
  const offsets: Array<[number, number]> = [];
  for (let index = 0; index < pinsPerSide; index += 1) {
    offsets.push([0, index * sameSidePitch]);
  }
  for (let index = pinsPerSide - 1; index >= 0; index -= 1) {
    offsets.push([rowSpacing, index * sameSidePitch]);
  }
  return offsets;
}
