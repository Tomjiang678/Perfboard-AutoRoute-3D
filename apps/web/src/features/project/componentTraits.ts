import type { LibraryComponentKind, PlacedComponent } from "../../types/project.ts";

const kinds = <T extends LibraryComponentKind>(...values: T[]) => new Set<LibraryComponentKind>(values);

export const centerBridgeKinds = kinds("dip", "dip_switch", "seven_segment_display", "alphanumeric_display");
export const bendableTwoPinKinds = kinds("resistor", "inductor", "radial_capacitor", "diode", "led", "crystal", "fuse");
export const threeInlinePinKinds = kinds("to92", "to220", "potentiometer", "slide_switch");
export const transistorKinds = kinds("to92", "to39", "to220");

export function hasKind(component: Pick<PlacedComponent, "kind">, set: ReadonlySet<LibraryComponentKind>) {
  return set.has(component.kind);
}

export function isCenterBridgeComponent(component: Pick<PlacedComponent, "kind">) {
  return hasKind(component, centerBridgeKinds);
}

export function isBendableTwoPin(component: Pick<PlacedComponent, "kind" | "pinOffsets">) {
  return component.pinOffsets.length === 2 && hasKind(component, bendableTwoPinKinds);
}

export function maximumLeadSpan(component: Pick<PlacedComponent, "kind">) {
  return component.kind === "diode" || component.kind === "led" ? 4 : 5;
}

export function preferredLeadSpan(component: Pick<PlacedComponent, "kind">) {
  return component.kind === "led" || component.kind === "radial_capacitor" ? 1 : 3;
}
