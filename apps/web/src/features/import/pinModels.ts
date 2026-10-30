import type { DevicePinModel } from "./importConfig.ts";
import { devicePinModels } from "./importConfig.ts";

/**
 * Pin-name lookup shared by every netlist importer. The KiCad path uses it to
 * recover generic pin names ("+"/"-"/"~") from the generated symbol library;
 * the Protel path has no pin names at all and depends on it entirely.
 */
export function findDevicePinModel(value: string, category: string): DevicePinModel | undefined {
  const candidates = [value, category.split(":")[1] ?? ""].filter(Boolean);
  for (const candidate of candidates) {
    const model = devicePinModels.find((entry) => entry.match.test(candidate));
    if (model) return model;
  }
  return undefined;
}

export function pinNameFromModel(model: DevicePinModel | undefined, pin: number): string {
  if (!model) return "";
  const allUnits = Object.fromEntries(
    Object.values(model.units).flatMap((unit) => Object.entries(unit))
  );
  const entry = Object.entries(allUnits).find(([, physical]) => physical === pin);
  return entry?.[0] ?? "";
}

export function isModelPowerPin(model: DevicePinModel | undefined, pin: number) {
  return Boolean(model && Object.values(model.powerPins).includes(pin));
}
