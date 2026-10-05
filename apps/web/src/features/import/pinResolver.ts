import type { ImportState, NetNode, ParsedNet } from "../../types/project.ts";

export interface ResolvedPinNode extends NetNode {
  physicalRef: string;
  physicalPin: number;
  pinRole: string;
}

export interface ResolvedNet {
  name: string;
  nodes: ResolvedPinNode[];
  unresolved: NetNode[];
}

export interface PinResolveWarning {
  ref: string;
  pin: string;
  message: string;
}

export interface PinResolveResult {
  nets: ResolvedNet[];
  warnings: PinResolveWarning[];
}

/**
 * KiCad netlists already carry physical pin numbers, so resolution is direct:
 * the logical name is only used for display (pin role).
 */
export function resolveImportPins(importState: ImportState): PinResolveResult {
  const pinInfo = importState.pinInfo ?? {};
  const warnings: PinResolveWarning[] = [];

  return {
    nets: importState.nets.map((net) => resolveNet(net, pinInfo, warnings)),
    warnings
  };
}

function resolveNet(
  net: ParsedNet,
  pinInfo: NonNullable<ImportState["pinInfo"]>,
  warnings: PinResolveWarning[]
): ResolvedNet {
  const nodes: ResolvedPinNode[] = [];
  const unresolved: NetNode[] = [];

  for (const node of net.nodes) {
    const physicalPin = Number(node.pin);
    if (!/^\d+$/.test(node.pin) || !Number.isInteger(physicalPin) || physicalPin < 1) {
      unresolved.push(node);
      warnings.push({
        ref: node.ref,
        pin: node.pin,
        message: "引脚号不是有效数字"
      });
      continue;
    }
    const info = pinInfo[node.ref]?.[node.pin];
    nodes.push({
      ...node,
      physicalRef: node.ref,
      physicalPin,
      pinRole: info?.name || node.pin
    });
  }

  return {
    name: net.name,
    nodes,
    unresolved
  };
}
