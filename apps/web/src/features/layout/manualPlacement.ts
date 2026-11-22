import type { PlacedComponent } from "../../types/project.ts";
import { pinGridPosition, rotateGridOffset } from "../board/placement.ts";
import { isBendableTwoPin, spacingLimits } from "../project/componentTraits.ts";
import {
  bendUserPackagePin,
  hasBendableUserPackagePins,
  pinBend,
  userPackagePins
} from "../userPackage/model/pinBend.ts";

export { pinGridPosition } from "../board/placement.ts";
export {
  bendUserPackagePin,
  directionLabel,
  pinBend,
  userPackagePinOffset,
  userPackagePins
} from "../userPackage/model/pinBend.ts";

export function isManuallyBendable(component: PlacedComponent) {
  return component.userPackage
    ? hasBendableUserPackagePins(component)
    : isBendableTwoPin(component);
}

export function bendComponentPin(
  component: PlacedComponent,
  pin: number,
  target: [number, number]
): PlacedComponent | undefined {
  if (component.userPackage) {
    return bendUserPackageTarget(component, pin, target);
  }
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

function bendUserPackageTarget(
  component: PlacedComponent,
  pin: number,
  target: [number, number]
): PlacedComponent | undefined {
  if (component.mounted) return undefined;
  const source = userPackagePins(component)[pin - 1];
  if (!source) return undefined;
  const bend = pinBend(source);
  if (bend.range <= 0) return undefined;

  const [rx, ry] = rotateGridOffset(source.hole, component.rotation);
  const anchor: [number, number] = [component.position[0] + rx, component.position[1] + ry];
  const [localX, localY] = rotateGridOffset(
    [target[0] - anchor[0], target[1] - anchor[1]],
    -component.rotation
  );
  const axis = bend.direction.endsWith("x") ? 0 : 1;
  const sign = bend.direction.startsWith("-") ? -1 : 1;
  const offset = sign * (axis === 0 ? localX : localY);
  return bendUserPackagePin(component, pin, offset);
}

