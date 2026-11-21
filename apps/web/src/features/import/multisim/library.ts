import type { ImportState, PinProfile } from "../../../types/project.ts";
import { applyInferredPinCounts } from "./pinCountInference.ts";
import { componentIdentity, findProfileForComponent, identityKey } from "./profile.ts";
import { resolveBuiltinProfile } from "./builtinProfiles.ts";
import builtinData from "./multisimProfiles.json" with { type: "json" };
import { STORAGE_KEYS } from "../../storage/storageKeys.ts";

const LIBRARY_KEY = STORAGE_KEYS.pinProfiles;
const MAX_LIBRARY_SIZE = 200;

/** Profiles are identified by part identity, so one entry covers every instance. */
export function upsertProfile(profiles: PinProfile[], profile: PinProfile): PinProfile[] {
  const key = identityKey(profile.identity);
  const rest = profiles.filter((item) => identityKey(item.identity) !== key);
  return [...rest, profile];
}

/**
 * Applies known profiles (project + library) to a freshly parsed import, then
 * fills in the pin counts that can be derived without a profile.
 */
export function applyProfilesToState(state: ImportState, profiles: PinProfile[]): ImportState {
  const wanted = new Set(state.components.map((component) => identityKey(componentIdentity(component))));
  const merged = [...(state.pinProfiles ?? [])];
  let changed = false;
  for (const profile of profiles) {
    const key = identityKey(profile.identity);
    if (!wanted.has(key)) continue;
    if (!merged.some((item) => identityKey(item.identity) === key)) {
      merged.push(profile);
      changed = true;
    }
  }

  const components = state.components.map((component) => {
    const exact = findProfileForComponent(merged, component);
    const profile = exact ?? resolveBuiltinProfile(component);
    if (!profile) return component;
    if (component.pinCount === profile.pinCount && component.pinCountSource) return component;
    changed = true;
    return { ...component, pinCount: profile.pinCount, pinCountSource: exact ? "user" as const : "builtin" as const };
  });

  // Inference must run even when no profile matched: numeric-only parts
  // (resistors, capacitors) get their pin count here, not from a profile.
  return changed
    ? applyInferredPinCounts({ ...state, components, pinProfiles: merged })
    : applyInferredPinCounts(state);
}

export function applyLibraryProfiles(state: ImportState): ImportState {
  return applyProfilesToState(state, loadProfileLibrary());
}

/**
 * Built-in profiles ship with the app (merged from user submissions); the local
 * library wins for the same identity because it is the user's own correction.
 */
export function loadProfileLibrary(): PinProfile[] {
  return mergeProfiles(loadBuiltinProfiles(), loadUserProfiles());
}

export function saveProfileToLibrary(profile: PinProfile) {
  if (typeof window === "undefined") return;
  const next = upsertProfile(loadUserProfiles(), profile).slice(-MAX_LIBRARY_SIZE);
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
}

export function removeProfileFromLibrary(id: string) {
  if (typeof window === "undefined") return;
  const next = loadUserProfiles().filter((profile) => profile.id !== id);
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
}

export function removeUserProfilesForIdentity(identity: { value: string; package: string }) {
  if (typeof window === "undefined") return;
  const key = identityKey(identity);
  const next = loadUserProfiles().filter((profile) => identityKey(profile.identity) !== key);
  window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
}

export function loadBuiltinProfiles(): PinProfile[] {
  const data = builtinData as { profiles?: unknown };
  return Array.isArray(data.profiles) ? data.profiles.filter(isPinProfile) : [];
}

export function loadUserProfiles(): PinProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPinProfile) : [];
  } catch {
    return [];
  }
}

function mergeProfiles(base: PinProfile[], local: PinProfile[]) {
  const result = new Map(base.map((profile) => [identityKey(profile.identity), profile]));
  local.forEach((profile) => result.set(identityKey(profile.identity), profile));
  return [...result.values()];
}

function isPinProfile(value: unknown): value is PinProfile {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PinProfile>;
  return typeof record.id === "string" &&
    Boolean(record.identity) &&
    typeof record.identity?.value === "string" &&
    typeof record.identity?.package === "string" &&
    Number.isInteger(record.pinCount) &&
    Array.isArray(record.pins);
}
