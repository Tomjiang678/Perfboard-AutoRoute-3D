import type { ImportState, ParsedComponent } from "../../../types/project.ts";
import { suggestPinCountFromPackage } from "../pinCount.ts";

const NUMERIC_PIN = /^\d+$/;

/**
 * Multisim parts whose logical pin names are already numbers (resistors,
 * capacitors, headers) need no user profile. Their physical pin count is the
 * larger of "highest pin seen" (a lower bound) and the package hint, so a
 * two-terminal part becomes 2 pins instead of landing in the workbench.
 */
export function applyInferredPinCounts(state: ImportState): ImportState {
  const highestPinByRef = new Map<string, number>();
  const nonNumericRefs = new Set<string>();

  for (const net of state.nets) {
    for (const node of net.nodes) {
      if (node.logicalPin === undefined) continue;
      if (!NUMERIC_PIN.test(node.logicalPin)) {
        nonNumericRefs.add(node.ref);
        continue;
      }
      highestPinByRef.set(node.ref, Math.max(highestPinByRef.get(node.ref) ?? 0, Number(node.logicalPin)));
    }
  }

  let changed = false;
  const components = state.components.map((component) => {
    const resolved = inferPinCount(component, highestPinByRef.get(component.ref), nonNumericRefs.has(component.ref));
    if (!resolved) return component;
    changed = true;
    return resolved;
  });

  return changed ? { ...state, components } : state;
}

function inferPinCount(component: ParsedComponent, highestPin: number | undefined, hasLogicalPins: boolean): ParsedComponent | undefined {
  if (component.format !== "multisim" || component.pinCount) {
    return undefined;
  }
  const packageHint = suggestPinCountFromPackage(component.packageName);
  if (hasLogicalPins) {
    return packageHint
      ? { ...component, pinCount: packageHint, pinCountSource: "package" }
      : undefined;
  }
  const pinCount = Math.max(highestPin ?? 0, packageHint ?? 0) || undefined;
  if (!pinCount) {
    return undefined;
  }
  return {
    ...component,
    pinCount,
    pinCountSource: packageHint && packageHint >= (highestPin ?? 0) ? "package" : "netlist"
  };
}

