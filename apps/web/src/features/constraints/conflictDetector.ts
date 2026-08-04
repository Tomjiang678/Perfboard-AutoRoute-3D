import type { DesignConstraint } from "../../types/project";
import { activeConstraints } from "./model";

export function detectConstraintConflicts(constraints: DesignConstraint[]) {
  const active = activeConstraints(constraints);
  const conflicts: string[] = [];
  for (let firstIndex = 0; firstIndex < active.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < active.length; secondIndex += 1) {
      const first = active[firstIndex];
      const second = active[secondIndex];
      if (first.strength !== "hard" || second.strength !== "hard") continue;
      if (first.kind === "component_in_region" && second.kind === "component_in_region") {
        const sharesComponent = first.componentIds.some((id) => second.componentIds.includes(id));
        if (sharesComponent && !regionsOverlap(first.region, second.region)) {
          conflicts.push(`硬约束冲突：“${first.explanation}”与“${second.explanation}”的区域不相交。`);
        }
      }
      if (first.kind === "power_rail" && second.kind === "power_rail" && first.net !== second.net && railsIntersect(first, second)) {
        conflicts.push(`硬约束冲突：${first.net} 与 ${second.net} 母线相交。`);
      }
      if (first.kind === "component_orientation" && second.kind === "component_orientation" && first.componentId === second.componentId && first.rotationDegrees !== second.rotationDegrees) {
        conflicts.push(`硬约束冲突：${first.componentRef} 同时指定了 ${first.rotationDegrees}° 和 ${second.rotationDegrees}°。`);
      }
    }
  }
  return [...new Set(conflicts)];
}

function regionsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function railsIntersect(
  a: Extract<DesignConstraint, { kind: "power_rail" }>,
  b: Extract<DesignConstraint, { kind: "power_rail" }>
) {
  if (a.axis === b.axis) {
    return a.index === b.index && Math.max(a.from, b.from) <= Math.min(a.to, b.to);
  }
  const row = a.axis === "row" ? a : b;
  const column = a.axis === "column" ? a : b;
  return column.index >= row.from && column.index <= row.to && row.index >= column.from && row.index <= column.to;
}
