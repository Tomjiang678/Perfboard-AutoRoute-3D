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
  return spacingLimits(component.kind).leadSpacing.max;
}

export function preferredLeadSpan(component: Pick<PlacedComponent, "kind">) {
  const { min, max } = spacingLimits(component.kind).leadSpacing;
  const base = component.kind === "led" || component.kind === "radial_capacitor" ? 1 : 3;
  return Math.min(max, Math.max(min, base));
}

export interface SpacingLimits {
  leadSpacing: { min: number; max: number };
  rowSpacing: { min: number; max: number };
  sameSidePitch: { min: number; max: number };
}

const FIXED = { min: 1, max: 1 };

// Per-package pitch limits in grid units (1 grid = 2.54 mm). Fields that do
// not affect a package's geometry are locked to their default (1..1).
const SPACING_LIMITS: Partial<Record<LibraryComponentKind, SpacingLimits>> = {
  resistor: { leadSpacing: { min: 2, max: 7 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  inductor: { leadSpacing: { min: 2, max: 7 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  diode: { leadSpacing: { min: 2, max: 6 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  led: { leadSpacing: { min: 1, max: 5 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  radial_capacitor: { leadSpacing: { min: 1, max: 4 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  electrolytic_capacitor: { leadSpacing: { min: 1, max: 4 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  crystal: { leadSpacing: { min: 2, max: 4 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  fuse: { leadSpacing: { min: 4, max: 8 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  buzzer: { leadSpacing: { min: 2, max: 4 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  terminal_block: { leadSpacing: { min: 1, max: 3 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  to92: { leadSpacing: FIXED, rowSpacing: FIXED, sameSidePitch: FIXED },
  to220: { leadSpacing: { min: 1, max: 2 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  to247: { leadSpacing: { min: 2, max: 3 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  to39: { leadSpacing: { min: 2, max: 3 }, rowSpacing: { min: 1, max: 2 }, sameSidePitch: FIXED },
  to3: { leadSpacing: { min: 2, max: 3 }, rowSpacing: { min: 2, max: 3 }, sameSidePitch: FIXED },
  bridge_rectifier: { leadSpacing: { min: 1, max: 2 }, rowSpacing: FIXED, sameSidePitch: FIXED },
  relay: { leadSpacing: FIXED, rowSpacing: { min: 1, max: 2 }, sameSidePitch: FIXED },
  potentiometer: { leadSpacing: FIXED, rowSpacing: FIXED, sameSidePitch: FIXED },
  slide_switch: { leadSpacing: FIXED, rowSpacing: FIXED, sameSidePitch: FIXED },
  tactile_switch: { leadSpacing: { min: 2, max: 3 }, rowSpacing: { min: 2, max: 3 }, sameSidePitch: { min: 2, max: 3 } },
  dip: { leadSpacing: FIXED, rowSpacing: { min: 2, max: 6 }, sameSidePitch: { min: 1, max: 2 } },
  dip_switch: { leadSpacing: FIXED, rowSpacing: { min: 2, max: 6 }, sameSidePitch: { min: 1, max: 2 } },
  seven_segment_display: { leadSpacing: FIXED, rowSpacing: { min: 2, max: 6 }, sameSidePitch: { min: 1, max: 2 } },
  alphanumeric_display: { leadSpacing: FIXED, rowSpacing: { min: 2, max: 6 }, sameSidePitch: { min: 1, max: 2 } },
  pin_header: { leadSpacing: FIXED, rowSpacing: FIXED, sameSidePitch: { min: 1, max: 2 } }
};

export function spacingLimits(kind: LibraryComponentKind): SpacingLimits {
  return SPACING_LIMITS[kind] ?? { leadSpacing: FIXED, rowSpacing: FIXED, sameSidePitch: FIXED };
}

export function clampSpacing(kind: LibraryComponentKind, value: number, field: keyof SpacingLimits): number {
  const { min, max } = spacingLimits(kind)[field];
  return Math.min(max, Math.max(min, Math.round(value)));
}
