import type { LibraryComponentKind, ParsedComponent } from "../../types/project";
import behaviorData from "./importBehaviorData.json";
import configData from "./importConfigData.json";
import pinLibraryOverrides from "./pinLibraryOverrides.json";

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
  ref: string;
  refPrefix: string;
  category: string;
  packageName: string;
  value: string;
}

export type SimplePinResolverMode = "numeric" | "pinMap" | "dipSwitch";

export interface SimplePinResolverRule {
  mode: SimplePinResolverMode;
  match: (component: NormalizedComponentFields) => boolean;
  pinPattern?: RegExp;
  pinMap?: Record<string, number>;
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
  pinCountStrategy?: "dipPackage" | "dipSwitch" | "fixed2" | "fixed3" | "fixed8" | "fixed10" | "fixed18";
  leadSpacing?: number;
  rowSpacing?: number;
}

interface RawBehaviorRule {
  match: MatchExpression[];
  matchMode?: "any" | "all";
}

interface RawSimplePinResolverRule extends RawBehaviorRule {
  mode: SimplePinResolverMode;
  pinPattern?: string;
  pinMap?: Record<string, number>;
}

interface RawPinLibraryData {
  source?: string;
  pinModelTemplates?: Record<string, {
    units: Record<string, Record<string, number>>;
    powerPins: Record<string, number>;
  }>;
  devicePinModels?: RawDevicePinModel[];
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

const rawBehavior = behaviorData as unknown as {
  ignoredComponentRules: RawBehaviorRule[];
  simplePinResolverRules: RawSimplePinResolverRule[];
};

const rawPinLibrary = pinLibraryOverrides as unknown as RawPinLibraryData;

const pinCountResolvers: Record<NonNullable<RawComponentMappingRule["pinCountStrategy"]>, (component: ParsedComponent) => number> = {
  dipPackage: (component) => parseDipPinCount(component.packageName) ?? inferPinCountFromDevicePinModels(component.value) ?? 8,
  dipSwitch: (component) => parseDipSwitchPinCount(component.value) ?? parseDipSwitchPinCount(component.packageName) ?? 4,
  fixed2: () => 2,
  fixed3: () => 3,
  fixed8: () => 8,
  fixed10: () => 10,
  fixed18: () => 18
};

export const devicePinModels: DevicePinModel[] = (rawPinLibrary.devicePinModels ?? []).map(buildDevicePinModel);

export const componentMappingRules: ComponentMappingRule[] = rawConfig.componentMappingRules.map((rule) => ({
  kind: rule.kind,
  label: rule.label,
  leadSpacing: rule.leadSpacing,
  rowSpacing: rule.rowSpacing,
  pinCount: buildPinCountResolver(rule.pinCountStrategy),
  match: (component) => evaluateMatchList(rule.match, component, rule.matchMode ?? "any")
}));

export const fallbackComponentMapping = rawConfig.fallbackComponentMapping;

export const ignoredComponentRules = rawBehavior.ignoredComponentRules.map(buildBehaviorRule);

export const simplePinResolverRules: SimplePinResolverRule[] = rawBehavior.simplePinResolverRules.map((rule) => ({
  mode: rule.mode,
  pinPattern: rule.pinPattern ? new RegExp(rule.pinPattern) : undefined,
  pinMap: rule.pinMap,
  match: buildBehaviorRule(rule).match
}));

export function normalizeComponentFields(component: ParsedComponent): NormalizedComponentFields {
  return {
    ref: component.ref.toUpperCase(),
    refPrefix: component.ref.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? "",
    category: component.category.toUpperCase(),
    packageName: component.packageName.toUpperCase(),
    value: component.value.toUpperCase()
  };
}

function buildDevicePinModel(model: RawDevicePinModel): DevicePinModel {
  const template = model.template ? rawPinLibrary.pinModelTemplates?.[model.template] : undefined;
  return {
    match: new RegExp(model.match, model.flags),
    units: mergeUnitMaps(template?.units, model.units),
    powerPins: {
      ...(template?.powerPins ?? {}),
      ...(model.powerPins ?? {})
    }
  };
}

function buildBehaviorRule(rule: RawBehaviorRule) {
  return {
    match: (component: NormalizedComponentFields) => evaluateMatchList(rule.match, component, rule.matchMode ?? "any")
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
    ?? normalized.match(/\bN0?(\d+)\b/i)
    ?? normalized.match(/\bNO(\d+)\b/i)
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
  return strategy ? pinCountResolvers[strategy] : undefined;
}

function inferPinCountFromDevicePinModels(value: string) {
  const model = devicePinModels.find((candidate) => candidate.match.test(value));
  if (!model) {
    return undefined;
  }

  const pins = [
    ...Object.values(model.powerPins),
    ...Object.values(model.units).flatMap((unitPins) => Object.values(unitPins))
  ];
  const pinCount = Math.max(0, ...pins);
  return pinCount > 0 ? pinCount : undefined;
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
