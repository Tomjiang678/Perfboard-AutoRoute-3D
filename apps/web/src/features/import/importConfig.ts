import type { LibraryComponentKind, ParsedComponent } from "../../types/project";
import configData from "./importConfigData.json";
import pinLibraryData from "./pinLibraryData.json";

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
  template?: string;
  units?: Record<string, Record<string, number>>;
  powerPins?: Record<string, number>;
}

interface RawComponentMappingRule {
  kind: LibraryComponentKind;
  label: string;
  match: MatchExpression[];
  matchMode?: "any" | "all";
  pinCountStrategy?: "dipPackage" | "dipSwitch" | "moduleFallback" | "fixed2" | "fixed3" | "fixed8" | "fixed10" | "fixed14" | "fixed16";
  leadSpacing?: number;
  rowSpacing?: number;
}

type MatchExpression =
  | { field: keyof NormalizedComponentFields; equals?: string; includes?: string; matches?: string }
  | { any: MatchExpression[] }
  | { all: MatchExpression[] }
  | { not: MatchExpression };

const rawConfig = configData as unknown as {
  componentMappingRules: RawComponentMappingRule[];
  fallbackComponentMapping: {
    kind: LibraryComponentKind;
    label: string;
    pinCount: number;
  };
};

const rawPinLibrary = pinLibraryData as unknown as {
  pinModelTemplates: Record<string, {
    units: Record<string, Record<string, number>>;
    powerPins: Record<string, number>;
  }>;
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
};

export const devicePinModels: DevicePinModel[] = rawPinLibrary.devicePinModels.map(buildDevicePinModel);

export const simplePinMaps = {
  passiveCategories: new RegExp(rawPinLibrary.simplePinMaps.passiveCategories),
  diodeCategories: new RegExp(rawPinLibrary.simplePinMaps.diodeCategories),
  diodeValuePatterns: new RegExp(rawPinLibrary.simplePinMaps.diodeValuePatterns),
  diodePins: rawPinLibrary.simplePinMaps.diodePins,
  bjtCategories: new RegExp(rawPinLibrary.simplePinMaps.bjtCategories),
  bjtPins: rawPinLibrary.simplePinMaps.bjtPins,
  switchCategories: new RegExp(rawPinLibrary.simplePinMaps.switchCategories)
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

function buildDevicePinModel(model: RawDevicePinModel): DevicePinModel {
  const template = model.template ? rawPinLibrary.pinModelTemplates[model.template] : undefined;
  return {
    match: new RegExp(model.match, model.flags),
    units: mergeUnitMaps(template?.units, model.units),
    powerPins: {
      ...(template?.powerPins ?? {}),
      ...(model.powerPins ?? {})
    }
  };
}

function mergeUnitMaps(
  base: Record<string, Record<string, number>> | undefined,
  override: Record<string, Record<string, number>> | undefined
) {
  const result: Record<string, Record<string, number>> = {};
  for (const [unit, pins] of Object.entries(base ?? {})) {
    result[unit] = { ...pins };
  }
  for (const [unit, pins] of Object.entries(override ?? {})) {
    result[unit] = {
      ...(result[unit] ?? {}),
      ...pins
    };
  }
  return result;
}

export function parseDipPinCount(packageName: string) {
  const normalized = packageName.toUpperCase();
  if (normalized.includes("CASE751A")) {
    return 14;
  }

  const match = normalized.match(/(?:DIP|PDIP|SDIP|SO|SOP|SOIC)-?P?-?(\d+)/i)
    ?? normalized.match(/\bD0?(\d+)\b/i)
    ?? normalized.match(/\bDO(\d+)\b/i)
    ?? normalized.match(/(\d+)\s*PIN/i);
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
  if (strategy === "fixed2") {
    return () => 2;
  }
  if (strategy === "fixed3") {
    return () => 3;
  }
  if (strategy === "fixed8") {
    return () => 8;
  }
  if (strategy === "fixed10") {
    return () => 10;
  }
  if (strategy === "fixed14") {
    return () => 14;
  }
  if (strategy === "fixed16") {
    return () => 16;
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
  if ("not" in expression) {
    return !evaluateMatch(expression.not, component);
  }

  const value = component[expression.field];
  if (expression.equals !== undefined) {
    return value === expression.equals;
  }
  if (expression.includes !== undefined) {
    return value.includes(expression.includes);
  }
  if (expression.matches !== undefined) {
    return new RegExp(expression.matches).test(value);
  }

  return false;
}
