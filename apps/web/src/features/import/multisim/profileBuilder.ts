import type { PinProfile, PinProfilePin } from "../../../types/project.ts";

export interface ProfileDraft {
  pinCount: number;
  mappings: Array<{ unit?: string; logical: string; physical: number; shared?: boolean }>;
  bindings: Array<{ physical: number; net: string }>;
}

export function isDraftValid(draft: ProfileDraft): boolean {
  const { pinCount } = draft;
  if (!Number.isInteger(pinCount) || pinCount < 2 || pinCount > 256) {
    return false;
  }

  const used = new Set<number>();
  for (const mapping of draft.mappings) {
    if (!Number.isInteger(mapping.physical) || mapping.physical < 1 || mapping.physical > pinCount) {
      return false;
    }
    if (used.has(mapping.physical)) {
      return false;
    }
    used.add(mapping.physical);
  }

  for (const binding of draft.bindings) {
    if (!Number.isInteger(binding.physical) || binding.physical < 1 || binding.physical > pinCount) {
      return false;
    }
    if (used.has(binding.physical) || !binding.net) {
      return false;
    }
    used.add(binding.physical);
  }

  return true;
}

export function buildProfile(
  identity: { value: string; package: string; category?: string },
  draft: ProfileDraft
): PinProfile {
  const mappingByPhysical = new Map(draft.mappings.map((mapping) => [mapping.physical, mapping]));
  const bindingByPhysical = new Map(draft.bindings.map((binding) => [binding.physical, binding.net]));
  const pins: PinProfilePin[] = [];

  for (let physical = 1; physical <= draft.pinCount; physical += 1) {
    const mapping = mappingByPhysical.get(physical);
    if (mapping) {
      pins.push({
        physical,
        logical: mapping.logical,
        unit: mapping.shared ? undefined : mapping.unit,
        shared: mapping.shared || undefined,
        connection: "netlist"
      });
      continue;
    }

    const net = bindingByPhysical.get(physical);
    pins.push(net
      ? { physical, connection: "bound", net }
      : { physical, connection: "unconnected" });
  }

  return {
    id: `${identity.value}@${identity.package}`.toLowerCase().replace(/[^a-z0-9@._-]+/g, "-"),
    identity,
    pinCount: draft.pinCount,
    pins,
    createdAt: new Date().toISOString()
  };
}
