import type { BoardModel, ElectricalNodeId, GridPoint } from "./types.ts";

export interface PinElectricalAssignment {
  pinId: string;
  net: string;
  hole: GridPoint;
}

export interface ElectricalNodeConflict {
  node: ElectricalNodeId;
  nets: string[];
  pins: PinElectricalAssignment[];
}

export interface BoardConnectivityAnalysis {
  alreadyConnectedNets: Set<string>;
  nodesByNet: Map<string, Set<ElectricalNodeId>>;
  conflicts: ElectricalNodeConflict[];
  invalidPins: PinElectricalAssignment[];
}

export function analyzeBoardConnectivity(
  board: BoardModel,
  assignments: PinElectricalAssignment[]
): BoardConnectivityAnalysis {
  const pinsByNode = new Map<ElectricalNodeId, PinElectricalAssignment[]>();
  const nodesByNet = new Map<string, Set<ElectricalNodeId>>();
  const invalidPins: PinElectricalAssignment[] = [];

  assignments.forEach((assignment) => {
    const node = board.getElectricalNode(assignment.hole);
    if (!node) {
      invalidPins.push(assignment);
      return;
    }
    const pins = pinsByNode.get(node) ?? [];
    pins.push(assignment);
    pinsByNode.set(node, pins);
    const nodes = nodesByNet.get(assignment.net) ?? new Set<ElectricalNodeId>();
    nodes.add(node);
    nodesByNet.set(assignment.net, nodes);
  });

  const conflicts: ElectricalNodeConflict[] = [];
  pinsByNode.forEach((pins, node) => {
    const nets = [...new Set(pins.map((pin) => pin.net))];
    if (nets.length > 1) conflicts.push({ node, nets, pins });
  });

  return {
    alreadyConnectedNets: new Set([...nodesByNet].filter(([, nodes]) => nodes.size <= 1).map(([net]) => net)),
    nodesByNet,
    conflicts,
    invalidPins
  };
}
