import type { ImportState, PinProfile } from "../../../types/project.ts";
import { loadBuiltinProfiles } from "./library.ts";
import { resolveBuiltinProfile } from "./builtinProfiles.ts";
import { componentIdentity, identityKey } from "./profile.ts";

export interface ProfileConflict {
  key: string;
  value: string;
  packageName: string;
  refs: string[];
  userProfile: PinProfile;
  publicProfile: PinProfile;
  publicSource: "public" | "builtin";
}

/**
 * A conflict means: this project has a user profile for the part identity, and
 * the public/built-in library has a different pin mapping. Identical mappings
 * (including the public profile already stored in the project) are not conflicts.
 */
export function collectProfileConflicts(state: ImportState): ProfileConflict[] {
  const choices = state.pinProfileChoices ?? {};
  const publicProfiles = new Map(
    loadBuiltinProfiles().map((profile) => [identityKey(profile.identity), profile])
  );
  const conflicts = new Map<string, ProfileConflict>();

  for (const component of state.components) {
    if (component.format !== "multisim") continue;

    const identity = componentIdentity(component);
    const key = identityKey(identity);
    if (choices[key] === "user") continue;

    const userProfile = (state.pinProfiles ?? []).find((profile) => identityKey(profile.identity) === key);
    if (!userProfile) continue;

    const exactPublic = publicProfiles.get(key);
    const publicProfile = exactPublic ?? resolveBuiltinProfile(component);
    if (!publicProfile) continue;
    if (samePinMap(userProfile, publicProfile)) continue;

    const existing = conflicts.get(key);
    if (existing) {
      if (!existing.refs.includes(component.ref)) existing.refs.push(component.ref);
      continue;
    }
    conflicts.set(key, {
      key,
      value: identity.value,
      packageName: identity.package,
      refs: [component.ref],
      userProfile,
      publicProfile,
      publicSource: exactPublic ? "public" : "builtin"
    });
  }

  return [...conflicts.values()].sort((a, b) => a.value.localeCompare(b.value) || a.packageName.localeCompare(b.packageName));
}

export function profilePinRows(profile: PinProfile) {
  const mapped = profile.pins
    .filter((pin) => pin.logical)
    .map((pin) => `${pin.unit ? `${pin.unit}:` : ""}${pin.logical} → ${pin.physical}`);
  const bound = profile.pins
    .filter((pin) => pin.connection === "bound" && pin.net)
    .map((pin) => `pin ${pin.physical} → ${pin.net}`);
  return [...mapped, ...bound];
}

function samePinMap(a: PinProfile, b: PinProfile) {
  return a.pinCount === b.pinCount && mappingSignature(a) === mappingSignature(b);
}

function mappingSignature(profile: PinProfile) {
  return JSON.stringify(
    profile.pins
      .filter((pin) => pin.logical)
      .map((pin) => `${(pin.unit ?? "").toUpperCase()}|${pin.logical!.toUpperCase()}|${pin.physical}`)
      .sort()
  );
}
