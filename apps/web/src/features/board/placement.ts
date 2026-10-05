import type { PlacedComponent } from "../../types/project.ts";
import type { BoardModel, GridPoint, PinNetAssignments, PlacementIssue, PlacementValidation } from "./types.ts";
export { isCenterBridgeComponent } from "../project/componentTraits.ts";

export function componentPinHoles(component: PlacedComponent): GridPoint[] {
  return component.pinOffsets.map((_, index) => pinGridPosition(component, index + 1));
}

export function pinGridPosition(component: PlacedComponent, pin: number): GridPoint {
  const anchor = component.pinOffsets[0] ?? [0, 0];
  const offset = component.pinOffsets[pin - 1] ?? anchor;
  const [x, y] = rotateGridOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
  return [component.position[0] + x, component.position[1] + y];
}

export function validateBasicPlacement(
  board: Pick<BoardModel, "isValidHole" | "getElectricalNode">,
  component: PlacedComponent,
  pinNets: PinNetAssignments = {}
): PlacementValidation {
  const pinHoles = componentPinHoles(component);
  const issues: PlacementIssue[] = [];
  const pinsByHole = new Map<string, number[]>();
  const pinsByNode = new Map<string, number[]>();

  pinHoles.forEach((hole, index) => {
    const pin = index + 1;
    if (!board.isValidHole(hole)) {
      issues.push({ code: "invalid_hole", message: `${component.name}.${pin} 未落在有效孔位`, pins: [pin], holes: [hole] });
      return;
    }
    const holeKey = `${hole[0]},${hole[1]}`;
    const sameHolePins = pinsByHole.get(holeKey) ?? [];
    sameHolePins.push(pin);
    pinsByHole.set(holeKey, sameHolePins);
    const node = board.getElectricalNode(hole);
    if (node) {
      const sameNodePins = pinsByNode.get(node) ?? [];
      sameNodePins.push(pin);
      pinsByNode.set(node, sameNodePins);
    }
  });

  pinsByHole.forEach((pins, holeKey) => {
    if (pins.length > 1) issues.push({ code: "duplicate_pin_hole", message: `引脚 ${pins.join(", ")} 占用同一孔 ${holeKey}`, pins });
  });
  pinsByNode.forEach((pins) => {
    if (pins.length < 2) return;
    const nets = pins.map((pin) => pinNets[pin]).filter((net): net is string => Boolean(net));
    const knownSameNet = nets.length === pins.length && new Set(nets).size === 1;
    if (!knownSameNet) issues.push({ code: "shared_electrical_node", message: `引脚 ${pins.join(", ")} 落在同一板内电气节点`, pins });
  });

  return { valid: issues.length === 0, pinHoles, issues };
}

export function isPowerNet(net: string | undefined) {
  if (!net) return false;
  return /(^|[^A-Z0-9])(0|GND|GROUND|VCC|VDD|VEE|VSS|VPP|VBAT|VIN|VOUT|VDC\d*|3V3|3\.3V|[+-]?\d+(?:\.\d+)?V|[+-]V|[AD]GND)((?:\d*)(?:[^A-Z0-9]|$))/i.test(net);
}

export function rotateGridOffset([x, y]: GridPoint, rotation: number): GridPoint {
  const quarterTurns = ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
  if (quarterTurns === 1) return [y, -x];
  if (quarterTurns === 2) return [-x, -y];
  if (quarterTurns === 3) return [-y, x];
  return [x, y];
}
