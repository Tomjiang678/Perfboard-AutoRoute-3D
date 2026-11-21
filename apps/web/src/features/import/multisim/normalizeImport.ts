import type { ImportState } from "../../../types/project.ts";

/**
 * Multisim exports power symbols (V1, V2, VCC, 0, …) as if they were parts.
 * The cross-reference report is what tells us which refs are symbols; once the
 * netlist and cross-reference arrive in separate imports, the nodes they left
 * behind must be removed from the merged state.
 */
export function stripPowerNodes(state: ImportState, powerRefs: string[]): ImportState {
  if (powerRefs.length === 0) return state;

  const refs = new Set(powerRefs.map((ref) => ref.toUpperCase()));
  let changed = false;
  const nets = state.nets
    .map((net) => {
      const nodes = net.nodes.filter((node) => !refs.has(node.ref.toUpperCase()));
      if (nodes.length === net.nodes.length) return net;
      changed = true;
      return { ...net, nodes };
    })
    .filter((net) => net.nodes.length > 0);

  return changed ? { ...state, nets } : state;
}

export function mergePowerRefs(...groups: Array<string[] | undefined>) {
  return [...new Set(groups.flatMap((group) => group ?? []).map((ref) => ref.toUpperCase()))];
}
