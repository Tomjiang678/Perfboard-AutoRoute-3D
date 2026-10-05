import type { LibraryComponentKind } from "../../types/project.ts";
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
}

export const componentLibrary: LibraryComponentDefinition[] = [
  makeTwoPin("resistor", "R", "电阻", 3),
  makeTwoPin("inductor", "L", "电感", 3),
  makeTwoPin("diode", "D", "二极管", 3),
  makeTwoPin("led", "LED", "LED", 1),
  makeTwoPin("radial_capacitor", "C", "普通电容", 1),
  makeTwoPin("electrolytic_capacitor", "EC", "电解电容", 1),
  { kind: "to92", label: "Q", title: "TO-92", leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1, pinOffsets: [[-1, 0], [0, 0], [1, 0]] },
  { kind: "to39", label: "Q", title: "TO-39", leadSpacing: 1, rowSpacing: 1, sameSidePitch: 1, pinOffsets: [[-1, 0], [1, 0], [0, 1]] },
  { kind: "to220", label: "Q", title: "TO-220", leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1, pinOffsets: [[-1, 0], [0, 0], [1, 0]] },
  makeDip("DIP8", "DIP-8", 8, 3, 1),
  makeDip("DIP14", "DIP-14", 14, 3, 1),
  makeDip("DIP16", "DIP-16", 16, 3, 1),
  makeDipSwitch("DIPSW6", "DIP 开关 6 位", 12, 3, 1),
  makeDipSwitch("DIPSW8", "DIP 开关 8 位", 16, 3, 1),
  makeDipSwitch("DIPSW10", "DIP 开关 10 位", 20, 3, 1),
  makeDisplay("7SEG", "七段数码管", "seven_segment_display", 10, 3, 1),
  makeDisplay("ALNUM", "字母数字显示器", "alphanumeric_display", 14, 3, 1),
  createPinHeaderDefinition(1, 4),
  makeTwoPin("terminal_block", "TB", "接线端子", 1, 2),
  { kind: "slide_switch", label: "SW", title: "拨动开关 SPDT", pinCount: 3, leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1, pinOffsets: [[-1, 0], [0, 0], [1, 0]] },
  makeTwoPin("buzzer", "BZ", "蜂鸣器", 2),
  { kind: "tactile_switch", label: "SW", title: "轻触按键", leadSpacing: 2, rowSpacing: 2, sameSidePitch: 2, pinOffsets: [[0, 0], [2, 0], [0, 2], [2, 2]] },
  { kind: "potentiometer", label: "RV", title: "电位器", leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1, pinOffsets: [[-1, 0], [0, 0], [1, 0]] }
];

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
    return [[-component.leadSpacing, 0], [0, 0], [component.leadSpacing, 0]];
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
  return {
    kind,
    label,
    title,
    pinCount,
    leadSpacing,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [leadSpacing, 0]]
  };
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
  return {
    kind,
    label,
    title,
    pinCount,
    leadSpacing: rowSpacing,
    rowSpacing,
    sameSidePitch,
    pinOffsets: makeDipPinOffsetsWithPitch(pinCount, rowSpacing, sameSidePitch)
  };
}

function makeDipPinOffsetsWithPitch(pinCount: number, rowSpacing: number, sameSidePitch: number) {
  const pinsPerSide = Math.ceil(pinCount / 2);
  const offsets: Array<[number, number]> = [];
  for (let index = 0; index < pinsPerSide; index += 1) {
    offsets.push([0, index * sameSidePitch]);
  }
  for (let index = pinsPerSide - 1; index >= 0; index -= 1) {
    offsets.push([rowSpacing, index * sameSidePitch]);
  }
  return offsets;
}
