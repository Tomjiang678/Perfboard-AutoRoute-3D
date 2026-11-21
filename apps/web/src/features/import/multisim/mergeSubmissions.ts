import type { PinProfile, PinProfilePin } from "../../../types/project.ts";
import type { ProfileSubmission } from "./submissionTypes.ts";
import { hashSubmissionProfile } from "./profileHash.ts";
import { normalizeIdentityToken } from "./profile.ts";

export interface MergeCandidate {
  identity: { value: string; package: string };
  pinCount: number;
  pins: PinProfilePin[];
  submissions: number;
}

export interface MergeConflict {
  identity: { value: string; package: string };
  variants: Array<{ contentHash: string; pinCount: number; pins: PinProfilePin[]; submissions: number }>;
}

export interface MergeResult {
  profiles: PinProfile[];
  candidates: MergeCandidate[];
  conflicts: MergeConflict[];
  stats: {
    submissions: number;
    invalid: number;
    identities: number;
    verified: number;
    candidates: number;
    conflicts: number;
  };
}

export interface MergeOptions {
  minConfirmations: number;
}

interface Variant {
  profile: { identity: { value: string; package: string }; pinCount: number; pins: PinProfilePin[] };
  count: number;
  firstSeen: string;
}

interface Group {
  identity: { value: string; package: string };
  variants: Map<string, Variant>;
  submissions: number;
}

/**
 * Turns raw submissions into a verified library:
 * - identical content is counted, never duplicated;
 * - an identity with two different contents is a conflict and is never merged automatically;
 * - a single confirmation stays a candidate until minConfirmations independent
 *   submissions agree (or a maintainer lowers the threshold manually).
 */
export function mergeSubmissions(raw: unknown[], options: MergeOptions): MergeResult {
  const groups = new Map<string, Group>();
  let invalid = 0;

  for (const entry of raw) {
    if (!isSubmission(entry)) {
      invalid += 1;
      continue;
    }
    const identity = {
      value: normalizeIdentityToken(entry.profile.identity.value),
      package: normalizeIdentityToken(entry.profile.identity.package)
    };
    const key = `${identity.value}\u0000${identity.package}`;
    const profile = { identity, pinCount: entry.profile.pinCount, pins: entry.profile.pins };
    const contentHash = hashSubmissionProfile(profile);

    const group = groups.get(key) ?? { identity, variants: new Map<string, Variant>(), submissions: 0 };
    group.submissions += 1;
    const variant = group.variants.get(contentHash);
    if (variant) {
      variant.count += 1;
    } else {
      group.variants.set(contentHash, { profile, count: 1, firstSeen: entry.createdAt });
    }
    groups.set(key, group);
  }

  const profiles: PinProfile[] = [];
  const candidates: MergeCandidate[] = [];
  const conflicts: MergeConflict[] = [];

  for (const group of groups.values()) {
    if (group.variants.size > 1) {
      conflicts.push({
        identity: group.identity,
        variants: [...group.variants.entries()].map(([contentHash, variant]) => ({
          contentHash,
          pinCount: variant.profile.pinCount,
          pins: variant.profile.pins,
          submissions: variant.count
        }))
      });
      continue;
    }

    const variant = [...group.variants.values()][0];
    if (variant.count < options.minConfirmations) {
      candidates.push({
        identity: group.identity,
        pinCount: variant.profile.pinCount,
        pins: variant.profile.pins,
        submissions: variant.count
      });
      continue;
    }

    profiles.push({
      id: `${group.identity.value}@${group.identity.package}`.toLowerCase().replace(/[^a-z0-9@._-]+/g, "-"),
      identity: group.identity,
      pinCount: variant.profile.pinCount,
      pins: variant.profile.pins,
      createdAt: variant.firstSeen
    });
  }

  const byIdentity = (a: { identity: { value: string; package: string } }, b: { identity: { value: string; package: string } }) =>
    a.identity.value.localeCompare(b.identity.value) || a.identity.package.localeCompare(b.identity.package);

  return {
    profiles: profiles.sort(byIdentity),
    candidates: candidates.sort(byIdentity),
    conflicts: conflicts.sort(byIdentity),
    stats: {
      submissions: raw.length - invalid,
      invalid,
      identities: groups.size,
      verified: profiles.length,
      candidates: candidates.length,
      conflicts: conflicts.length
    }
  };
}

function isSubmission(value: unknown): value is ProfileSubmission {
  if (!isRecord(value) || value.kind !== "protoroute.pin-profile") return false;
  const profile = value.profile;
  if (!isRecord(profile) || !isRecord(profile.identity)) return false;
  if (typeof profile.identity.value !== "string" || typeof profile.identity.package !== "string") return false;
  if (!Number.isInteger(profile.pinCount) || (profile.pinCount as number) < 2 || (profile.pinCount as number) > 256) return false;
  if (!Array.isArray(profile.pins)) return false;

  const seen = new Set<number>();
  for (const pin of profile.pins) {
    if (!isRecord(pin)) return false;
    if (!Number.isInteger(pin.physical) || (pin.physical as number) < 1 || (pin.physical as number) > (profile.pinCount as number)) return false;
    if (seen.has(pin.physical as number)) return false;
    seen.add(pin.physical as number);
    if (pin.connection !== "netlist" && pin.connection !== "bound" && pin.connection !== "unconnected") return false;
    if (pin.connection === "bound" && typeof pin.net !== "string") return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
