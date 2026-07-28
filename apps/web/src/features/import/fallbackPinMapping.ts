import type { ParsedNet } from "../../types/project";

export type FallbackPinMaps = Map<string, Record<string, number>>;

export function buildFallbackPinMaps(nets: ParsedNet[]): FallbackPinMaps {
  const pinsByRef = new Map<string, Set<string>>();

  for (const net of nets) {
    for (const node of net.nodes) {
      const logical = splitLogicalRef(node.ref);
      const pin = normalizePinName(node.pin);
      if (!pin) {
        continue;
      }
      const pins = pinsByRef.get(logical.baseRef) ?? new Set<string>();
      pins.add(pin);
      pinsByRef.set(logical.baseRef, pins);
    }
  }

  return new Map([...pinsByRef.entries()].map(([ref, pins]) => [ref, buildPinMap([...pins])]));
}

export function splitLogicalRef(ref: string) {
  const match = ref.match(/^([A-Za-z]+\d+)([A-Z])$/);
  return {
    baseRef: match?.[1] ?? ref,
    unit: match?.[2] ?? ""
  };
}

export function normalizePinName(pin: string) {
  return pin.trim().toUpperCase().replace(/\s+/g, "");
}

function buildPinMap(pins: string[]) {
  const sortedPins = pins.sort(comparePins);
  return Object.fromEntries(sortedPins.map((pin, index) => [pin, index + 1]));
}

function comparePins(a: string, b: string) {
  const aNumber = parseNumericPinName(a);
  const bNumber = parseNumericPinName(b);
  if (aNumber !== undefined && bNumber !== undefined) {
    return aNumber - bNumber;
  }
  if (aNumber !== undefined) {
    return -1;
  }
  if (bNumber !== undefined) {
    return 1;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function parseNumericPinName(pin: string) {
  const match = pin.match(/^P?(\d+)$/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
