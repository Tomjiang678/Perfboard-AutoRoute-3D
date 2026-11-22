import type { PlacedComponent } from "../../../types/project.ts";
import type { UserPackageBendDirection, UserPackagePin } from "./types.ts";

export interface PinBend {
  range: number;
  direction: UserPackageBendDirection;
}

export function pinBend(pin: UserPackagePin): PinBend {
  return {
    range: Math.max(0, Math.round(pin.bendRange ?? 0)),
    direction: normalizeDirection(pin.bendDirection)
  };
}

export function userPackagePins(component: PlacedComponent): UserPackagePin[] {
  if (!component.userPackage) return [];
  return component.userPackage.shapes.filter(
    (shape): shape is UserPackagePin => shape.kind === "pin"
  );
}

export function hasBendableUserPackagePins(component: PlacedComponent): boolean {
  return userPackagePins(component).some((pin) => pinBend(pin).range > 0);
}

/**
 * Move one pin from its initial hole in one of the four board-plane directions.
 * `offset` is the non-negative distance (grid cells) from the initial hole.
 */
export function bendUserPackagePin(
  component: PlacedComponent,
  pin: number,
  offset: number
): PlacedComponent | undefined {
  if (component.mounted || !component.userPackage) return undefined;
  const pins = userPackagePins(component);
  const source = pins[pin - 1];
  if (!source) return undefined;
  const bend = pinBend(source);
  if (bend.range <= 0) return undefined;

  const clamped = Math.max(0, Math.min(bend.range, Math.round(offset)));
  const axis = bend.direction.endsWith("x") ? 0 : 1;
  const sign = bend.direction.startsWith("-") ? -1 : 1;
  const initial = source.hole;
  const nextPin: [number, number] = [initial[0], initial[1]];
  nextPin[axis] = initial[axis] + sign * clamped;

  return {
    ...component,
    pinOffsets: component.pinOffsets.map((current, index) =>
      index === pin - 1 ? nextPin : current
    )
  };
}

export function userPackagePinOffset(component: PlacedComponent, pin: number): number {
  const source = userPackagePins(component)[pin - 1];
  const current = component.pinOffsets[pin - 1];
  if (!source || !current) return 0;
  const bend = pinBend(source);
  const axis = bend.direction.endsWith("x") ? 0 : 1;
  const sign = bend.direction.startsWith("-") ? -1 : 1;
  const raw = (current[axis] - source.hole[axis]) * sign;
  return Math.max(0, Math.min(bend.range, raw));
}

export function directionLabel(direction: UserPackageBendDirection) {
  return direction.toUpperCase();
}

function normalizeDirection(
  value: UserPackageBendDirection | "+y" | "-y" | "x" | "y" | "z" | undefined
): UserPackageBendDirection {
  if (value === "+x" || value === "-x" || value === "+z" || value === "-z") return value;
  // Old drafts used unsigned x/y or the old X/Y wording; map them onto XZ.
  if (value === "x") return "+x";
  if (value === "+y" || value === "y" || value === "z") return "+z";
  if (value === "-y") return "-z";
  return "+z";
}
