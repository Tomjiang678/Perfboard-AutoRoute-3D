import type { SubmissionProfile } from "./submissionTypes.ts";
import { normalizeIdentityToken } from "./profile.ts";

/**
 * Canonical content hash: pin order and formatting must not create a second
 * "different" submission for the same physical mapping.
 */
export function hashSubmissionProfile(profile: SubmissionProfile): string {
  const pins = [...profile.pins]
    .sort((a, b) => a.physical - b.physical)
    .map((pin) => ({
      physical: pin.physical,
      logical: pin.logical ?? "",
      unit: pin.unit ?? "",
      shared: pin.shared ?? false,
      connection: pin.connection,
      net: pin.net ?? ""
    }));
  const text = JSON.stringify({
    value: normalizeIdentityToken(profile.identity.value),
    package: normalizeIdentityToken(profile.identity.package),
    pinCount: profile.pinCount,
    pins
  });
  return fnv1a(text);
}

function fnv1a(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
