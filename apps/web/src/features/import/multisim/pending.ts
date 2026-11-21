import type { ImportState, PinProfile } from "../../../types/project.ts";
import { componentIdentity, identityKey, isSharedPowerPinName, normalizeIdentityToken, resolveProfilePin } from "./profile.ts";
import { resolveProfileForComponent } from "./builtinProfiles.ts";

const NUMERIC_PIN = /^\d+$/;

export interface PendingLogicalPin {
  unit?: string;
  logical: string;
  /** Power pins are shared by all units and shown once. */
  shared?: boolean;
}

export interface PendingPart {
  key: string;
  value: string;
  packageName: string;
  category: string;
  refs: string[];
  pinCount?: number;
  reason: "pin_count" | "pin_map" | "pin_missing";
  logicalPins: PendingLogicalPin[];
  profile?: PinProfile;
}

/**
 * Parts the importer cannot resolve yet: either the physical pin count is
 * unknown, or a user profile is missing, or the profile does not cover every
 * logical pin the netlist uses. Grouped by part identity, not by refdes.
 */
export function collectPendingParts(state: ImportState): PendingPart[] {
  const profiles = state.pinProfiles ?? [];
  const pinsByRef = collectLogicalPinsByRef(state);
  const parts = new Map<string, PendingPart>();

  for (const component of state.components) {
    if (component.format !== "multisim") continue;

    const identity = componentIdentity(component);
    const key = identityKey(identity);
    const profile = resolveProfileForComponent(profiles, component);
    const logicalPins = pinsByRef.get(component.ref) ?? [];
    const allNumeric = logicalPins.length > 0 && logicalPins.every((pin) => NUMERIC_PIN.test(pin.logical));

    let reason: PendingPart["reason"] | undefined;
    if (profile) {
      const missing = logicalPins.some((pin) => !resolveProfilePin(profile, pin.unit, pin.logical));
      if (missing) reason = "pin_missing";
    } else if (component.pinCount && logicalPins.length === 0) {
      reason = undefined;
    } else if (allNumeric && component.pinCount) {
      reason = undefined;
    } else if (allNumeric) {
      reason = "pin_count";
    } else {
      reason = component.pinCount ? "pin_map" : "pin_count";
    }

    if (!reason) continue;

    const part = parts.get(key) ?? {
      key,
      value: identity.value,
      packageName: identity.package,
      category: identity.category,
      refs: [],
      pinCount: profile?.pinCount ?? component.pinCount,
      reason,
      logicalPins: [],
      profile
    };

    addUnique(part.refs, component.ref);
    for (const pin of logicalPins) {
      pushLogicalPin(part.logicalPins, pin.unit, pin.logical);
    }
    if (!part.pinCount && (component.pinCount ?? profile?.pinCount)) {
      part.pinCount = component.pinCount ?? profile?.pinCount;
    }
    if (REASON_PRIORITY[reason] > REASON_PRIORITY[part.reason]) {
      part.reason = reason;
    }
    parts.set(key, part);
  }

  return [...parts.values()].sort((a, b) => a.value.localeCompare(b.value) || a.packageName.localeCompare(b.packageName));
}

const REASON_PRIORITY: Record<PendingPart["reason"], number> = {
  pin_missing: 0,
  pin_map: 1,
  pin_count: 2
};

export function pendingComponentRefs(state: ImportState): Set<string> {
  return new Set(collectPendingParts(state).flatMap((part) => part.refs));
}

/** Rebuilds the editor card for an already stored profile (edit, not first entry). */
export function profilePart(state: ImportState, key: string): PendingPart | undefined {
  const profile = (state.pinProfiles ?? []).find((item) => identityKey(item.identity) === key);
  if (!profile) return undefined;

  const refs = state.components
    .filter((component) => identityKey(componentIdentity(component)) === key)
    .map((component) => component.ref);
  const refSet = new Set(refs);
  const logicalPins: PendingLogicalPin[] = [];

  for (const net of state.nets) {
    for (const node of net.nodes) {
      if (!refSet.has(node.ref) || node.logicalPin === undefined) continue;
      pushLogicalPin(logicalPins, node.unit, node.logicalPin);
    }
  }

  return {
    key,
    value: profile.identity.value,
    packageName: profile.identity.package,
    category: profile.identity.category ?? "",
    refs,
    pinCount: profile.pinCount,
    reason: "pin_missing",
    logicalPins,
    profile
  };
}

function collectLogicalPinsByRef(state: ImportState) {
  const byRef = new Map<string, PendingLogicalPin[]>();
  for (const net of state.nets) {
    for (const node of net.nodes) {
      if (node.logicalPin === undefined) continue;
      const list = byRef.get(node.ref) ?? [];
      pushLogicalPin(list, node.unit, node.logicalPin);
      byRef.set(node.ref, list);
    }
  }
  return byRef;
}

function pushLogicalPin(list: PendingLogicalPin[], unit: string | undefined, logical: string) {
  if (isSharedPowerPinName(logical)) {
    if (!list.some((pin) => pin.shared && normalizeIdentityToken(pin.logical) === normalizeIdentityToken(logical))) {
      list.push({ logical, shared: true });
    }
    return;
  }
  if (!list.some((pin) => normalizeIdentityToken(pin.logical) === normalizeIdentityToken(logical) && (pin.unit ?? "") === (unit ?? ""))) {
    list.push({ unit, logical });
  }
}

function addUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}
