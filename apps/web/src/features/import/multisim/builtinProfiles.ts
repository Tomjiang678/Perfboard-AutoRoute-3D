import type { ParsedComponent, PinProfile, PinProfilePin } from "../../../types/project.ts";
import { BUILTIN_PIN_MODELS, type BuiltinPinModel } from "./builtinPinModels.ts";
import { findProfileForComponent } from "./profile.ts";

/** Exact user/project profile first; built-in model as a read-only fallback. */
export function resolveProfileForComponent(profiles: PinProfile[], component: ParsedComponent) {
  return findProfileForComponent(profiles, component) ?? resolveBuiltinProfile(component);
}

export function resolveBuiltinProfile(component: ParsedComponent): PinProfile | undefined {
  if (component.format !== "multisim") return undefined;
  const model = BUILTIN_PIN_MODELS.find((entry) => entry.match.test(component.value));
  if (!model) return undefined;
  return profileFromModel(model, component);
}

function profileFromModel(model: BuiltinPinModel, component: ParsedComponent): PinProfile {
  const byPhysical = new Map<number, PhysicalPin>();

  // Power pins first so shared power names win as the display name.
  for (const [logical, physical] of Object.entries(model.powerPins)) {
    addMapping(byPhysical, physical, undefined, logical, true);
  }
  for (const [unit, pins] of Object.entries(model.units)) {
    for (const [logical, physical] of Object.entries(pins)) {
      addMapping(byPhysical, physical, unit || undefined, logical, false);
    }
  }

  const pinCount = Math.max(model.pinCount, ...byPhysical.keys());
  const pins: PinProfilePin[] = [];
  for (let physical = 1; physical <= pinCount; physical += 1) {
    const entry = byPhysical.get(physical);
    pins.push(entry
      ? {
        physical,
        logical: entry.primary,
        unit: entry.unit,
        aliases: entry.aliases.length > 0 ? entry.aliases : undefined,
        shared: entry.shared || undefined,
        connection: "netlist"
      }
      : { physical, connection: "unconnected" });
  }

  return {
    id: `builtin:${component.value}@${component.packageName}`.toLowerCase().replace(/[^a-z0-9@._:-]+/g, "-"),
    identity: {
      value: component.value,
      package: component.packageName,
      category: component.category
    },
    pinCount,
    pins,
    createdAt: "builtin"
  };
}

interface PhysicalPin {
  unit?: string;
  primary: string;
  aliases: string[];
  shared: boolean;
}

function addMapping(
  byPhysical: Map<number, PhysicalPin>,
  physical: number,
  unit: string | undefined,
  logical: string,
  shared: boolean
) {
  if (!Number.isInteger(physical) || physical < 1) return;
  const existing = byPhysical.get(physical);
  if (!existing) {
    byPhysical.set(physical, { unit, primary: logical, aliases: [], shared });
    return;
  }
  if (existing.primary !== logical && !existing.aliases.includes(logical)) {
    existing.aliases.push(logical);
  }
  if (shared) existing.shared = true;
}
