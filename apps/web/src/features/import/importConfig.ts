import type { LibraryComponentKind, ParsedComponent } from "../../types/project.ts";
import behaviorData from "./importBehaviorData.json" with { type: "json" };
import configData from "./importConfigData.json" with { type: "json" };
import pinLibraryGenerated from "./pinLibraryGenerated.json" with { type: "json" };

export interface DevicePinModel {
  match: RegExp;
  units: Record<string, Record<string, number>>;
  powerPins: Record<string, number>;
}

export interface ComponentMappingRule {
  kind: LibraryComponentKind;
  label: string;
  match: (component: NormalizedComponentFields) => boolean;
  pinCount?: (component: ParsedComponent, pinsFromNetlist?: number) => number | undefined;
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

export interface IgnoredComponentRule {
  match: (component: NormalizedComponentFields) => boolean;
}

interface RawDevicePinModel {
  match: string;
  flags?: string;
  units?: Record<string, Record<string, number>>;
  powerPins?: Record<string, number>;
}

interface RawComponentMappingRule {
  kind: LibraryComponentKind;
  label: string;
  match: MatchExpression[];
  matchMode?: "any" | "all";
  pinCountStrategy?: "fromPins" | "fixed2" | "fixed3" | "fixed4" | "fixed8";
  leadSpacing?: number;
  rowSpacing?: number;
}

interface RawBehaviorRule {
  match: MatchExpression[];
  matchMode?: "any" | "all";
}

interface RawPinLibraryData {
  source?: string;
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
};

const rawGenerated = pinLibraryGenerated as unknown as RawPinLibraryData;

const pinCountResolvers: Record<NonNullable<RawComponentMappingRule["pinCountStrategy"]>, (component: ParsedComponent, pinsFromNetlist?: number) => number> = {
  fromPins: (component, pinsFromNetlist) => Math.max(1, pinsFromNetlist ?? inferPinCountFromDevicePinModels(component.value) ?? 2),
  fixed2: () => 2,
  fixed3: () => 3,
  fixed4: () => 4,
  fixed8: () => 8
};

// Single pin-model source: the library generated from the KiCad symbol
// libraries. pinLibraryOverrides.json is deprecated and no longer loaded.
export const devicePinModels: DevicePinModel[] = (rawGenerated.devicePinModels ?? []).map(buildDevicePinModel);

export const componentMappingRules: ComponentMappingRule[] = rawConfig.componentMappingRules.map((rule) => ({
  kind: rule.kind,
  label: rule.label,
  leadSpacing: rule.leadSpacing,
  rowSpacing: rule.rowSpacing,
  pinCount: buildPinCountResolver(rule.pinCountStrategy),
  match: (component) => evaluateMatchList(rule.match, component, rule.matchMode ?? "any")
}));

export const fallbackComponentMapping = rawConfig.fallbackComponentMapping;

export const ignoredComponentRules: IgnoredComponentRule[] = rawBehavior.ignoredComponentRules.map(buildBehaviorRule);

export function normalizeComponentFields(component: ParsedComponent): NormalizedComponentFields {
  return {
    ref: component.ref.toUpperCase(),
    refPrefix: component.ref.match(/^[A-Za-z#]+/)?.[0].toUpperCase() ?? "",
    category: component.category.toUpperCase(),
    packageName: component.packageName.toUpperCase(),
    value: component.value.toUpperCase()
  };
}

function buildPinCountResolver(strategy: RawComponentMappingRule["pinCountStrategy"]) {
  return strategy ? pinCountResolvers[strategy] : undefined;
}

function buildDevicePinModel(model: RawDevicePinModel): DevicePinModel {
  return {
    match: new RegExp(model.match, model.flags),
    units: model.units ?? {},
    powerPins: model.powerPins ?? {}
  };
}

function buildBehaviorRule(rule: RawBehaviorRule): IgnoredComponentRule {
  return {
    match: (component: NormalizedComponentFields) => evaluateMatchList(rule.match, component, rule.matchMode ?? "any")
  };
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
