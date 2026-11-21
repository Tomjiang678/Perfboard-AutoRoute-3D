import overrides from "../pinLibraryOverrides.json" with { type: "json" };

interface RawPinModel {
  match: string;
  flags?: string;
  template?: string;
  units?: Record<string, Record<string, number>>;
  powerPins?: Record<string, number>;
}

interface RawTemplate {
  units?: Record<string, Record<string, number>>;
  powerPins?: Record<string, number>;
}

interface RawLibrary {
  pinModelTemplates?: Record<string, RawTemplate>;
  devicePinModels?: RawPinModel[];
}

export interface BuiltinPinModel {
  id: string;
  match: RegExp;
  pinCount: number;
  units: Record<string, Record<string, number>>;
  powerPins: Record<string, number>;
}

const raw = overrides as unknown as RawLibrary;

/**
 * The old Multisim pin models (kept in pinLibraryOverrides.json) are the
 * built-in "known parts" database: value regex → logical pin map. They are
 * read-only at runtime; user-taught profiles always win over these.
 */
export const BUILTIN_PIN_MODELS: BuiltinPinModel[] = (raw.devicePinModels ?? [])
  .map((model): BuiltinPinModel | undefined => {
    const template = model.template ? raw.pinModelTemplates?.[model.template] : undefined;
    const units = mergeUnits(template?.units, model.units);
    const powerPins = { ...(template?.powerPins ?? {}), ...(model.powerPins ?? {}) };
    const highestPin = Math.max(
      0,
      ...Object.values(units).flatMap((unitPins) => Object.values(unitPins)),
      ...Object.values(powerPins)
    );
    if (highestPin < 2 || highestPin > 256) return undefined;
    return {
      id: model.match,
      match: new RegExp(model.match, model.flags ?? "i"),
      pinCount: highestPin,
      units,
      powerPins
    };
  })
  .filter((model): model is BuiltinPinModel => Boolean(model));

function mergeUnits(
  base: Record<string, Record<string, number>> | undefined,
  override: Record<string, Record<string, number>> | undefined
) {
  const result: Record<string, Record<string, number>> = {};
  for (const [unit, pins] of Object.entries(base ?? {})) {
    result[unit] = { ...pins };
  }
  for (const [unit, pins] of Object.entries(override ?? {})) {
    result[unit] = { ...(result[unit] ?? {}), ...pins };
  }
  return result;
}
