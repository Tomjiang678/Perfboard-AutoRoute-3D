import type { ImportState, NetNode, ParsedComponent, ParsedNet } from "../../types/project";
import { buildFallbackPinMaps, normalizePinName, splitLogicalRef, type FallbackPinMaps } from "./fallbackPinMapping";
import {
  devicePinModels,
  ignoredComponentRules,
  normalizeComponentFields,
  parseDipSwitchPinCount,
  simplePinResolverRules,
  type SimplePinResolverRule
} from "./importConfig";

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
  const fallbackPinMaps = buildFallbackPinMaps(importState.nets);
  const warnings: PinResolveWarning[] = [];

  return {
    nets: importState.nets.map((net) => resolveNet(net, componentMap, fallbackPinMaps, warnings)),
    warnings
  };
}

function resolveNet(
  net: ParsedNet,
  componentMap: Map<string, ParsedComponent>,
  fallbackPinMaps: FallbackPinMaps,
  warnings: PinResolveWarning[]
): ResolvedNet {
  const nodes: ResolvedPinNode[] = [];
  const unresolved: NetNode[] = [];

  for (const node of net.nodes) {
    if (isIgnoredComponentNode(node, componentMap)) {
      continue;
    }

    const resolved = resolveNode(node, componentMap, fallbackPinMaps);
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

function isIgnoredComponentNode(node: NetNode, componentMap: Map<string, ParsedComponent>) {
  const logical = splitLogicalRef(node.ref);
  const component = componentMap.get(logical.baseRef);
  if (!component) {
    return false;
  }

  const fields = normalizeComponentFields(component);
  return ignoredComponentRules.some((rule) => rule.match(fields));
}

function resolveNode(node: NetNode, componentMap: Map<string, ParsedComponent>, fallbackPinMaps: FallbackPinMaps): ResolvedPinNode | undefined {
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
    return resolveFallbackComponentNode(node, logical.baseRef, fallbackPinMaps);
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

  const unitPins = model.units[logical.unit] ?? model.units[""] ?? getOnlyUnitPins(model.units);
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
  const fields = normalizeComponentFields(component);
  const pin = normalizePinName(node.pin);
  const rule = simplePinResolverRules.find((candidate) => candidate.match(fields) && (candidate.pinPattern?.test(pin) ?? true));
  const physicalPin = rule ? resolveSimplePhysicalPin(rule, component, pin) : undefined;
  return physicalPin
    ? {
      ...node,
      physicalRef: component.ref,
      physicalPin,
      pinRole: pin
    }
    : undefined;
}

function resolveFallbackComponentNode(node: NetNode, baseRef: string, fallbackPinMaps: FallbackPinMaps): ResolvedPinNode | undefined {
  const normalizedPin = normalizePinName(node.pin);
  const physicalPin = fallbackPinMaps.get(baseRef)?.[normalizedPin];
  if (!physicalPin) {
    return undefined;
  }

  return {
    ...node,
    physicalRef: baseRef,
    physicalPin,
    pinRole: normalizedPin
  };
}

function resolveSimplePhysicalPin(rule: SimplePinResolverRule, component: ParsedComponent, pin: string) {
  const resolvers: Record<SimplePinResolverRule["mode"], () => number | undefined> = {
    numeric: () => parseNumericPinName(pin),
    pinMap: () => rule.pinMap?.[pin],
    dipSwitch: () => {
      const switchPin = pin.match(/^(\d+)P(\d+)$/);
      const physicalPin = switchPin
        ? resolveDipSwitchPhysicalPin(component, Number(switchPin[1]), Number(switchPin[2]))
        : Number(pin);
      return Number.isFinite(physicalPin) && physicalPin > 0 ? physicalPin : undefined;
    }
  };

  return resolvers[rule.mode]();
}

function parseNumericPinName(pin: string) {
  const match = pin.match(/^P?(\d+)$/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function getOnlyUnitPins(units: Record<string, Record<string, number>>) {
  const unitEntries = Object.entries(units);
  return unitEntries.length === 1 ? unitEntries[0][1] : undefined;
}

function resolveDipSwitchPhysicalPin(component: ParsedComponent, switchIndex: number, side: number) {
  if (side !== 1 && side !== 2) {
    return Number.NaN;
  }

  const switchCount = parseDipSwitchPinCount(component.value) ?? parseDipSwitchPinCount(component.packageName);
  if (!switchCount || switchIndex < 1 || switchIndex > switchCount / 2) {
    return Number.NaN;
  }

  if (side === 1) {
    return switchIndex;
  }

  return switchCount - switchIndex + 1;
}
