import type { ParsedComponent, PinProfile, PinProfilePin } from "../../../types/project.ts";

export function normalizeIdentityToken(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function componentIdentity(component: ParsedComponent) {
  return {
    value: normalizeIdentityToken(component.value),
    package: normalizeIdentityToken(component.packageName),
    category: normalizeIdentityToken(component.category)
  };
}

export function identityKey(identity: { value: string; package: string }) {
  return `${normalizeIdentityToken(identity.value)}\u0000${normalizeIdentityToken(identity.package)}`;
}

export function profileMatchesComponent(profile: PinProfile, component: ParsedComponent) {
  return identityKey(profile.identity) === identityKey(componentIdentity(component));
}

export function findProfileForComponent(profiles: PinProfile[], component: ParsedComponent) {
  return profiles.find((profile) => profileMatchesComponent(profile, component));
}

/**
 * Power pins belong to the package, not to a symbol unit: Multisim exports
 * `A:VS+` and `B:VS+` for the same physical pin. These names are matched once
 * and every unit shares the binding.
 */
const SHARED_POWER_PIN = /^(?:VS[+-]|VCC|VDD|VEE|VSS|V\+|V-|GND|GROUND|VPP|VBAT|VIN|VOUT)$/i;

export function isSharedPowerPinName(name: string) {
  return SHARED_POWER_PIN.test(name.trim());
}

export function findProfilePin(profile: PinProfile, unit: string | undefined, logical: string): PinProfilePin | undefined {
  const wantedPin = normalizeIdentityToken(logical);
  const wantedUnit = (unit ?? "").toUpperCase();
  const matchesName = (pin: PinProfilePin) =>
    Boolean(pin.logical) && (
      normalizeIdentityToken(pin.logical!) === wantedPin ||
      (pin.aliases ?? []).some((alias) => normalizeIdentityToken(alias) === wantedPin)
    );

  const exact = profile.pins.find((pin) => matchesName(pin) && (pin.unit ?? "").toUpperCase() === wantedUnit);
  if (exact) return exact;

  if (isSharedPowerPinName(logical)) {
    const aliases = profile.pins.filter(matchesName);
    return aliases.find((pin) => pin.shared || !pin.unit) ?? aliases[0];
  }

  // Single-unit symbols are sometimes exported with a unit suffix (U1A) while
  // the model has none, or the other way round.
  const logicalUnits = new Set(
    profile.pins
      .filter((pin) => pin.logical && !pin.shared)
      .map((pin) => (pin.unit ?? "").toUpperCase())
  );
  if (logicalUnits.size === 1) {
    return profile.pins.find((pin) => matchesName(pin) && (pin.unit ?? "").toUpperCase() === [...logicalUnits][0]);
  }

  return undefined;
}

export function resolveProfilePin(profile: PinProfile, unit: string | undefined, logical: string) {
  const pin = findProfilePin(profile, unit, logical);
  if (!pin || !Number.isInteger(pin.physical) || pin.physical < 1) {
    return undefined;
  }
  return pin;
}

/** Applies a profile to every component of the same identity: pin count is shared. */
export function withProfilePinCount(components: ParsedComponent[], profile: PinProfile) {
  return components.map((component) =>
    profileMatchesComponent(profile, component) ? { ...component, pinCount: profile.pinCount, pinCountSource: "user" as const } : component
  );
}
