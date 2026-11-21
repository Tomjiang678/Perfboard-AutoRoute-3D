import type { ImportState, NetNode, ParsedComponent, ParsedNet, PinProfile } from "../../types/project.ts";
import { resolveProfileForComponent } from "./multisim/builtinProfiles.ts";
import { resolveProfilePin } from "./multisim/profile.ts";

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
 * KiCad netlists already carry physical pin numbers, so resolution is direct.
 * Multisim nodes carry a logical name instead: they are resolved through the
 * user profile for that part identity, and profile pins bound to an existing
 * net are appended as extra endpoints.
 */
export function resolveImportPins(importState: ImportState): PinResolveResult {
  const pinInfo = importState.pinInfo ?? {};
  const profiles = importState.pinProfiles ?? [];
  const components = new Map(importState.components.map((component) => [component.ref, component]));
  const warnings: PinResolveWarning[] = [];

  const nets = importState.nets.map((net) => resolveNet(net, pinInfo, profiles, components, warnings));
  appendBoundPins(nets, profiles, components);

  return { nets, warnings };
}

function resolveNet(
  net: ParsedNet,
  pinInfo: NonNullable<ImportState["pinInfo"]>,
  profiles: PinProfile[],
  components: Map<string, ParsedComponent>,
  warnings: PinResolveWarning[]
): ResolvedNet {
  const nodes: ResolvedPinNode[] = [];
  const unresolved: NetNode[] = [];

  for (const node of net.nodes ?? []) {
    if (node.logicalPin !== undefined) {
      const resolved = resolveLogicalNode(node, profiles, components);
      if (resolved) {
        nodes.push(resolved);
      } else {
        const component = components.get(node.ref);
        const profile = component ? resolveProfileForComponent(profiles, component) : undefined;
        unresolved.push(node);
        warnings.push({
          ref: node.ref,
          pin: node.logicalPin,
          message: profile ? "引脚不在映射中" : "缺少引脚映射"
        });
      }
      continue;
    }

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

function resolveLogicalNode(
  node: NetNode,
  profiles: PinProfile[],
  components: Map<string, ParsedComponent>
): ResolvedPinNode | undefined {
  const component = components.get(node.ref);
  if (!component) {
    return undefined;
  }

  const profile = resolveProfileForComponent(profiles, component);
  if (profile) {
    const pin = resolveProfilePin(profile, node.unit, node.logicalPin!);
    if (!pin) return undefined;
    return {
      ...node,
      physicalRef: node.ref,
      physicalPin: pin.physical,
      pinRole: pin.logical ?? node.logicalPin!
    };
  }

  if (/^\d+$/.test(node.logicalPin!)) {
    const physical = Number(node.logicalPin);
    if (Number.isInteger(physical) && physical >= 1) {
      return {
        ...node,
        physicalRef: node.ref,
        physicalPin: physical,
        pinRole: node.logicalPin!
      };
    }
  }

  return undefined;
}

function appendBoundPins(
  nets: ResolvedNet[],
  profiles: PinProfile[],
  components: Map<string, ParsedComponent>
) {
  const netByName = new Map(nets.map((net) => [net.name, net]));
  const seen = new Set(
    nets.flatMap((net) => net.nodes.map((node) => `${net.name}:${node.physicalRef}:${node.physicalPin}`))
  );

  for (const component of components.values()) {
    const profile = resolveProfileForComponent(profiles, component);
    if (!profile) continue;

    for (const pin of profile.pins) {
      if (pin.connection !== "bound" || !pin.net) continue;
      const net = netByName.get(pin.net);
      if (!net) continue;
      const key = `${net.name}:${component.ref}:${pin.physical}`;
      if (seen.has(key)) continue;
      seen.add(key);
      net.nodes.push({
        ref: component.ref,
        pin: String(pin.physical),
        logicalPin: pin.logical,
        unit: pin.unit,
        synthetic: true,
        physicalRef: component.ref,
        physicalPin: pin.physical,
        pinRole: pin.logical ?? `pin ${pin.physical}`
      });
    }
  }
}

