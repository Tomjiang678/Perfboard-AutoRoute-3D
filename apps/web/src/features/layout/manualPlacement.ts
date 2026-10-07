import type { PlacedComponent } from "../../types/project.ts";
import { pinGridPosition } from "../board/placement.ts";
import { isBendableTwoPin, spacingLimits } from "../project/componentTraits.ts";

export { pinGridPosition } from "../board/placement.ts";

export function isManuallyBendable(component: PlacedComponent) {
  return isBendableTwoPin(component);
}

export function bendComponentPin(
  component: PlacedComponent,
  pin: number,
  target: [number, number]
): PlacedComponent | undefined {
  if (component.mounted || ![1, 2].includes(pin) || !isManuallyBendable(component)) {
    return undefined;
  }

  const firstPin = pinGridPosition(component, 1);
  const secondPin = pinGridPosition(component, 2);
  const nextFirst = pin === 1 ? target : firstPin;
  const nextSecond = pin === 2 ? target : secondPin;
  const dx = nextSecond[0] - nextFirst[0];
  const dy = nextSecond[1] - nextFirst[1];
  const span = Math.hypot(dx, dy);
  const { min, max } = spacingLimits(component.kind).leadSpacing;
  if (span < min || span > max) {
    return undefined;
  }

  return {
    ...component,
    position: nextFirst,
    rotation: 0,
    leadSpacing: Math.round(span * 100) / 100,
    rowSpacing: dy,
    pinOffsets: [[0, 0], [dx, dy]]
  };
}
