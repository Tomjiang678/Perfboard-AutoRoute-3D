import type { ImportState, NetNode, ParsedComponent, ParsedNet } from "../../types/project";
import { devicePinModels, simplePinMaps } from "./importConfig";

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

export function resolveImportPins(importState: ImportState): PinResolveResult {
  const componentMap = new Map(importState.components.map((component) => [component.ref, component]));
  const warnings: PinResolveWarning[] = [];

  return {
    nets: importState.nets.map((net) => resolveNet(net, componentMap, warnings)),
    warnings
  };
}

function resolveNet(
  net: ParsedNet,
  componentMap: Map<string, ParsedComponent>,
  warnings: PinResolveWarning[]
): ResolvedNet {
  const nodes: ResolvedPinNode[] = [];
  const unresolved: NetNode[] = [];

  for (const node of net.nodes) {
    const resolved = resolveNode(node, componentMap);
    if (resolved) {
      nodes.push(resolved);
    } else {
      unresolved.push(node);
      warnings.push({
        ref: node.ref,
        pin: node.pin,
        message: "无法解析逻辑引脚到物理封装脚"
      });
    }
  }

  return {
    name: net.name,
    nodes,
    unresolved
  };
}

function resolveNode(node: NetNode, componentMap: Map<string, ParsedComponent>): ResolvedPinNode | undefined {
  const logical = splitLogicalRef(node.ref);
  const component = componentMap.get(logical.baseRef);
  if (!component) {
    return resolveSimpleTwoPinNode(node);
  }

  const simple = resolveSimpleComponentNode(node, component);
  if (simple) {
    return simple;
  }

  const model = devicePinModels.find((candidate) => candidate.match.test(component.value));
  if (!model) {
    return undefined;
  }

  const normalizedPin = normalizePinName(node.pin);
  const powerPin = model.powerPins[normalizedPin];
  if (powerPin) {
    return {
      ...node,
      physicalRef: logical.baseRef,
      physicalPin: powerPin,
      pinRole: normalizedPin
    };
  }

  const unitPins = model.units[logical.unit] ?? model.units[""];
  const physicalPin = unitPins?.[normalizedPin];
  if (!physicalPin) {
    return undefined;
  }

  return {
    ...node,
    physicalRef: logical.baseRef,
    physicalPin,
    pinRole: normalizedPin
  };
}

function resolveSimpleTwoPinNode(node: NetNode): ResolvedPinNode | undefined {
  if (/^[12]$/.test(node.pin)) {
    return {
      ...node,
      physicalRef: node.ref,
      physicalPin: Number(node.pin),
      pinRole: node.pin
    };
  }

  return undefined;
}

function resolveSimpleComponentNode(node: NetNode, component: ParsedComponent): ResolvedPinNode | undefined {
  const category = component.category.toUpperCase();
  const pin = normalizePinName(node.pin);

  if (/^[12]$/.test(pin) && simplePinMaps.passiveCategories.test(category)) {
    return {
      ...node,
      physicalRef: component.ref,
      physicalPin: Number(pin),
      pinRole: pin
    };
  }

  if (simplePinMaps.diodeCategories.test(category) || simplePinMaps.diodeValuePatterns.test(component.value.toUpperCase())) {
    const physicalPin = simplePinMaps.diodePins[pin];
    if (physicalPin) {
      return {
        ...node,
        physicalRef: component.ref,
        physicalPin,
        pinRole: pin
      };
    }
  }

  if (simplePinMaps.bjtCategories.test(category)) {
    const physicalPin = simplePinMaps.bjtPins[pin];
    if (physicalPin) {
      return {
        ...node,
        physicalRef: component.ref,
        physicalPin,
        pinRole: pin
      };
    }
  }

  if (simplePinMaps.switchCategories.test(category)) {
    const switchPin = pin.match(/^(\d+)P(\d+)$/);
    const physicalPin = switchPin ? (Number(switchPin[1]) - 1) * 2 + Number(switchPin[2]) : Number(pin);
    if (Number.isFinite(physicalPin) && physicalPin > 0) {
      return {
        ...node,
        physicalRef: component.ref,
        physicalPin,
        pinRole: pin
      };
    }
  }

  return undefined;
}

function splitLogicalRef(ref: string) {
  const match = ref.match(/^([A-Za-z]+\d+)([A-Z])$/);
  if (!match) {
    return {
      baseRef: ref,
      unit: ""
    };
  }

  return {
    baseRef: match[1],
    unit: match[2]
  };
}

function normalizePinName(pin: string) {
  return pin.trim().toUpperCase().replace(/\s+/g, "");
}
