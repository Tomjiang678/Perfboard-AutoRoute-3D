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
  fromPins: (component, pinsFromNetlist) => resolvePinCountHint(component, pinsFromNetlist),
  fixed2: () => 2,
  fixed3: () => 3,
  fixed4: () => 4,
  fixed8: () => 8
};

// KiCad pin-name enrichment uses the generated symbol library. The Multisim
// built-in models are a separate read-only source (multisim/builtinPinModels.ts
// reads pinLibraryOverrides.json).
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

/**
 * 封装名里的脚数。只认“数字就是引脚数”的封装族：
 * TO-220 / SOT-23 这类名字里的数字是封装尺寸，不能当脚数。
 */
const PACKAGE_PIN_FAMILIES = [
  "TSSOP", "SSOP", "MSOP", "QSOP", "SOIC", "SOP", "PDIP", "DIP",
  "TQFP", "LQFP", "QFP", "PLCC", "QFN", "SOJ", "BGA"
];
const PACKAGE_PIN_PATTERN = new RegExp(
  `\\b(?:${PACKAGE_PIN_FAMILIES.join("|")})[-_ ]?(\\d{1,3})(?!\\d)`,
  "i"
);

export function inferPinCountFromPackage(packageName: string): number | undefined {
  const match = packageName.match(PACKAGE_PIN_PATTERN);
  if (!match) return undefined;
  const pins = Number(match[1]);
  return Number.isInteger(pins) && pins >= 2 && pins <= 256 ? pins : undefined;
}

/**
 * 一个元件到底有几个脚：取“网表里用到的脚数 / 型号库 / 封装名”三者的最大值。
 *
 * 为什么要取最大：Protel、嘉立创这类网表只记录**接了线的引脚**，
 * 一颗 8 脚芯片只用 1、2 脚时，网表里只能看到 2 个脚，
 * 只看它就当成两脚元件了；封装名 DIP-8 和型号库都能把它纠正回来。
 */
export function resolvePinCountHint(component: ParsedComponent, pinsFromNetlist?: number): number {
  const candidates = [
    pinsFromNetlist,
    inferPinCountFromDevicePinModels(component.value),
    inferPinCountFromPackage(component.packageName)
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  return Math.max(2, ...candidates);
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
