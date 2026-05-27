import type { LibraryComponentKind, ParsedComponent } from "../../types/project";
import configData from "./importConfigData.json";

export interface DevicePinModel {
  match: RegExp;
  units: Record<string, Record<string, number>>;
  powerPins: Record<string, number>;
}

export interface ComponentMappingRule {
  kind: LibraryComponentKind;
  label: string;
  match: (component: NormalizedComponentFields) => boolean;
  pinCount?: (component: ParsedComponent) => number | undefined;
  leadSpacing?: number;
  rowSpacing?: number;
}

export interface NormalizedComponentFields {
  refPrefix: string;
  category: string;
  packageName: string;
  value: string;
}

interface RawDevicePinModel {
  match: string;
  flags?: string;
  units: Record<string, Record<string, number>>;
  powerPins: Record<string, number>;
}

interface RawComponentMappingRule {
  kind: LibraryComponentKind;
  label: string;
  match: MatchExpression[];
  matchMode?: "any" | "all";
  pinCountStrategy?: "dipPackage" | "dipSwitch" | "moduleFallback";
  leadSpacing?: number;
  rowSpacing?: number;
}

type MatchExpression =
  | { field: keyof NormalizedComponentFields; equals?: string; includes?: string }
  | { any: MatchExpression[] }
  | { all: MatchExpression[] };

const rawConfig = configData as unknown as {
  devicePinModels: RawDevicePinModel[];
  simplePinMaps: {
    passiveCategories: string;
    diodeCategories: string;
    diodeValuePatterns: string;
    diodePins: Record<string, number>;
    bjtCategories: string;
    bjtPins: Record<string, number>;
    switchCategories: string;
  };
  componentMappingRules: RawComponentMappingRule[];
  fallbackComponentMapping: {
    kind: LibraryComponentKind;
    label: string;
    pinCount: number;
  };
};

export const devicePinModels: DevicePinModel[] = rawConfig.devicePinModels.map((model) => ({
  match: new RegExp(model.match, model.flags),
  units: model.units,
  powerPins: model.powerPins
}));

export const simplePinMaps = {
  passiveCategories: new RegExp(rawConfig.simplePinMaps.passiveCategories),
  diodeCategories: new RegExp(rawConfig.simplePinMaps.diodeCategories),
  diodeValuePatterns: new RegExp(rawConfig.simplePinMaps.diodeValuePatterns),
  diodePins: rawConfig.simplePinMaps.diodePins,
  bjtCategories: new RegExp(rawConfig.simplePinMaps.bjtCategories),
  bjtPins: rawConfig.simplePinMaps.bjtPins,
  switchCategories: new RegExp(rawConfig.simplePinMaps.switchCategories)
};

export const componentMappingRules: ComponentMappingRule[] = rawConfig.componentMappingRules.map((rule) => ({
  kind: rule.kind,
  label: rule.label,
  leadSpacing: rule.leadSpacing,
  rowSpacing: rule.rowSpacing,
  pinCount: buildPinCountResolver(rule.pinCountStrategy),
  match: (component) => evaluateMatchList(rule.match, component, rule.matchMode ?? "any")
}));

export const fallbackComponentMapping = rawConfig.fallbackComponentMapping;

export function parseDipPinCount(packageName: string) {
  const match = packageName.match(/(?:DIP|PDIP|P)-?P?-?(\d+)/i) ?? packageName.match(/(\d+)\s*PIN/i);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export function parseDipSwitchPinCount(value: string) {
  const match = value.match(/DIPSW(\d+)/i);
  if (!match) {
    return undefined;
  }

  const switchCount = Number(match[1]);
  return Number.isFinite(switchCount) ? switchCount * 2 : undefined;
}

function buildPinCountResolver(strategy: RawComponentMappingRule["pinCountStrategy"]) {
  if (strategy === "dipPackage") {
    return (component: ParsedComponent) => parseDipPinCount(component.packageName) ?? 8;
  }
  if (strategy === "dipSwitch") {
    return (component: ParsedComponent) => parseDipSwitchPinCount(component.value) ?? parseDipSwitchPinCount(component.packageName) ?? 4;
  }
  if (strategy === "moduleFallback") {
    return getFallbackPinCount;
  }
  return undefined;
}

function getFallbackPinCount(component: ParsedComponent) {
  if (component.value.toUpperCase().includes("BOOST_CONVERTER")) {
    return 3;
  }

  return 4;
}

function evaluateMatchList(expressions: MatchExpression[], component: NormalizedComponentFields, mode: "any" | "all") {
  if (mode === "all") {
    return expressions.every((expression) => evaluateMatch(expression, component));
  }

  return expressions.some((expression) => evaluateMatch(expression, component));
}

function evaluateMatch(expression: MatchExpression, component: NormalizedComponentFields): boolean {
  if ("any" in expression) {
    return expression.any.some((item) => evaluateMatch(item, component));
  }
  if ("all" in expression) {
    return expression.all.every((item) => evaluateMatch(item, component));
  }

  const value = component[expression.field];
  if (expression.equals !== undefined) {
    return value === expression.equals;
  }
  if (expression.includes !== undefined) {
    return value.includes(expression.includes);
  }

  return false;
}
