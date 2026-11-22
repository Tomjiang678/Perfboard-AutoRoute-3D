import type { PerfboardProject, PlacedComponent } from "../../types/project.ts";
import { activeConstraints, projectConstraints } from "../constraints/model.ts";
import { componentOccupiedCells, componentsOverlap } from "../collision/footprint.ts";

export interface PlacementCheck {
  valid: boolean;
  reasons: string[];
}

/**
 * “这个元件能不能放在这里”的统一判定（手动拖动与自动放置共用）。
 *
 * 之前手动路径只查“与别的元件重叠”，而自动路径还查硬禁布区，
 * 于是同一个位置：手动能拖进去、自动放置不允许、DRC 也不报——
 * 三条路径对“合法”的定义不同。
 */
export function checkComponentPlacement(
  project: PerfboardProject,
  candidate: PlacedComponent,
  options: { ignoreIds?: string[] } = {}
): PlacementCheck {
  const reasons: string[] = [];
  const ignore = new Set([candidate.id, ...(options.ignoreIds ?? [])]);
  const others = project.components.filter((component) => !ignore.has(component.id));
  const candidateCells = componentOccupiedCells(candidate);

  for (const cell of candidateCells) {
    const [x, y] = cell.split(",").map(Number);
    if (x < 0 || y < 0 || x >= project.board.width || y >= project.board.height) {
      reasons.push("超出板面范围");
      break;
    }
  }

  for (const other of others) {
    if (componentsOverlap(candidate, other)) {
      reasons.push(`与 ${other.name} 重叠`);
    }
  }

  const keepouts = activeConstraints(projectConstraints(project)).filter(
    (constraint) => constraint.kind === "region_keepout" && constraint.strength === "hard" && constraint.blockPlacement
  );
  if (keepouts.length > 0) {
    const cells = candidateCells;
    for (const constraint of keepouts) {
      if (constraint.kind !== "region_keepout") continue;
      const region = constraint.region;
      const hits = [...cells].some((cell) => {
        const [x, y] = cell.split(",").map(Number);
        return x >= region.x && y >= region.y && x < region.x + region.width && y < region.y + region.height;
      });
      if (hits) {
        reasons.push(`落在禁布区 (${region.x}, ${region.y}) ${region.width}×${region.height} 内`);
      }
    }
  }

  return { valid: reasons.length === 0, reasons };
}
