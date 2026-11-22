import type { PlacedComponent } from "../../../types/project.ts";
import type { UserPackageDraft, UserPackageShape } from "./types.ts";

/**
 * Convert an editor draft into a placed component. Pins become the anchor:
 * all model coordinates are rebased to the first pin so collision, dragging,
 * and rotation share the same local coordinate system as built-in packages.
 */
export function createUserPackageComponent(
  draft: UserPackageDraft,
  position: [number, number]
): PlacedComponent | undefined {
  const pins = draft.shapes.filter((shape): shape is Extract<UserPackageShape, { kind: "pin" }> => shape.kind === "pin");
  if (pins.length === 0) return undefined;
  const anchor = pins[0].hole;
  const pinOffsets = dedupePoints(pins.map((pin) => [pin.hole[0] - anchor[0], pin.hole[1] - anchor[1]] as [number, number]));
  if (pinOffsets.length === 0) return undefined;

  const normalized: UserPackageDraft = {
    ...draft,
    shapes: draft.shapes.map((shape) => {
      if (shape.kind === "pin") {
        return { ...shape, hole: [shape.hole[0] - anchor[0], shape.hole[1] - anchor[1]] as [number, number] };
      }
      return { ...shape, center: [shape.center[0] - anchor[0], shape.center[1] - anchor[1]] as [number, number] };
    })
  };

  return {
    id: crypto.randomUUID(),
    kind: "pin_header",
    label: normalized.name,
    name: normalized.name,
    value: "",
    pinCount: pinOffsets.length,
    leadSpacing: 1,
    rowSpacing: 1,
    sameSidePitch: 1,
    pinOffsets,
    position,
    rotation: 0,
    mounted: false,
    origin: "manual",
    userPackage: normalized
  };
}

function dedupePoints(points: Array<[number, number]>) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point[0]},${point[1]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
