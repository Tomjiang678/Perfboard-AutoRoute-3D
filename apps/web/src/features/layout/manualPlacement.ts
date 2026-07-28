import type { PlacedComponent } from "../../types/project";

export function isManuallyBendable(component: PlacedComponent) {
  return component.pinOffsets.length === 2 && (
    component.kind === "resistor" ||
    component.kind === "inductor" ||
    component.kind === "radial_capacitor" ||
    component.kind === "diode" ||
    component.kind === "led"
  );
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
  const maxSpan = component.kind === "diode" || component.kind === "led" ? 4 : 5;
  if (span < 1 || span > maxSpan) {
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

export function pinGridPosition(component: PlacedComponent, pin: number): [number, number] {
  const anchor = component.pinOffsets[0] ?? [0, 0];
  const offset = component.pinOffsets[pin - 1] ?? anchor;
  const [rx, ry] = rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
  return [component.position[0] + rx, component.position[1] + ry];
}

function rotateOffset([x, y]: [number, number], rotation: number): [number, number] {
  const quarterTurns = ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
  if (quarterTurns === 1) {
    return [y, -x];
  }
  if (quarterTurns === 2) {
    return [-x, -y];
  }
  if (quarterTurns === 3) {
    return [-y, x];
  }
  return [x, y];
}
