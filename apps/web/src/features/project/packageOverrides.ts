import type { LibraryComponentDefinition } from "./componentLibrary.ts";
import { STORAGE_KEYS } from "../storage/storageKeys.ts";

const OVERRIDES_KEY = STORAGE_KEYS.packagePinOverrides;

interface PackageOverride {
  version?: 1;
  pinOffsets: Array<[number, number]>;
}

function packageKey(definition: LibraryComponentDefinition) {
  return `${definition.kind}:${definition.pinCount ?? 0}:${definition.label}`;
}

function loadOverrides(): Record<string, PackageOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) as Record<string, PackageOverride> : {};
  } catch {
    return {};
  }
}

export function applyPackageOverride(definition: LibraryComponentDefinition): LibraryComponentDefinition {
  const override = loadOverrides()[packageKey(definition)];
  if (!override || (override.version !== undefined && override.version !== 1) || override.pinOffsets.length !== definition.pinOffsets.length) {
    return definition;
  }
  if (!override.pinOffsets.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) {
    return definition;
  }
  return { ...definition, pinOffsets: override.pinOffsets.map(([x, y]) => [x, y]) };
}

export function savePackageOverride(definition: LibraryComponentDefinition, pinOffsets: Array<[number, number]>) {
  if (typeof window === "undefined") return;
  if (pinOffsets.length !== definition.pinOffsets.length) return;
  if (!pinOffsets.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return;
  const overrides = loadOverrides();
  overrides[packageKey(definition)] = {
    version: 1,
    pinOffsets: pinOffsets.map(([x, y]) => [x, y])
  };
  window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}

export function clearPackageOverride(definition: LibraryComponentDefinition) {
  if (typeof window === "undefined") return;
  const overrides = loadOverrides();
  delete overrides[packageKey(definition)];
  window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}
