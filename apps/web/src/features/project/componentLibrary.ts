import type { LibraryComponentKind } from "../../types/project";

export interface LibraryComponentDefinition {
  kind: LibraryComponentKind;
  label: string;
  title: string;
  pinCount?: number;
  leadSpacing: number;
  rowSpacing: number;
  sameSidePitch: number;
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
  makeDip("DIP8", "DIP-8", 8, 3, 1),
  makeDip("DIP14", "DIP-14", 14, 3, 1),
  makeDip("DIP16", "DIP-16", 16, 3, 1),
  { kind: "pin_header", label: "HDR", title: "排针", pinCount: 4, leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1, pinOffsets: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  makeTwoPin("terminal_block", "TB", "接线端子", 1, 2),
  { kind: "tactile_switch", label: "SW", title: "轻触按键", leadSpacing: 2, rowSpacing: 2, sameSidePitch: 2, pinOffsets: [[0, 0], [2, 0], [0, 2], [2, 2]] },
  { kind: "potentiometer", label: "RV", title: "电位器", leadSpacing: 1, rowSpacing: 0, sameSidePitch: 1, pinOffsets: [[-1, 0], [0, 0], [1, 0]] }
];

export const componentLibraryByKey = new Map(
  componentLibrary.map((component) => [makeLibraryDragKey(component), component])
);

export function getLibraryComponentByKind(kind: LibraryComponentKind, pinCount?: number) {
  return componentLibrary.find((component) => component.kind === kind && component.pinCount === pinCount)
    ?? componentLibrary.find((component) => component.kind === kind);
}

export function makeLibraryDragKey(component: LibraryComponentDefinition) {
  return `${component.kind}:${component.pinCount ?? ""}:${component.label}`;
}

function makeDipPinOffsets(pinCount: number, rowSpacing: number) {
  const pinsPerSide = Math.ceil(pinCount / 2);
  const offsets: Array<[number, number]> = [];
  for (let index = 0; index < pinsPerSide; index += 1) {
    offsets.push([0, index]);
  }
  for (let index = pinsPerSide - 1; index >= 0; index -= 1) {
    offsets.push([rowSpacing, index]);
  }
  return offsets;
}

export function buildPinOffsetsForComponent(component: {
  kind: LibraryComponentKind;
  pinCount?: number;
  leadSpacing: number;
  rowSpacing: number;
  sameSidePitch: number;
}): Array<[number, number]> {
  if (component.kind === "dip") {
    return makeDipPinOffsetsWithPitch(component.pinCount ?? 8, component.rowSpacing, component.sameSidePitch);
  }

  if (component.kind === "to92" || component.kind === "potentiometer") {
    return [[-component.leadSpacing, 0], [0, 0], [component.leadSpacing, 0]];
  }

  if (component.kind === "pin_header") {
    return Array.from({ length: component.pinCount ?? 4 }, (_, index) => [index * component.sameSidePitch, 0] as [number, number]);
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
  return {
    kind: "dip",
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
