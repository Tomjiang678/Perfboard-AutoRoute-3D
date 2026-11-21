import type { PerfboardProject, PlacedComponent } from "../../types/project.ts";
import { pinGridPosition } from "../board/placement.ts";
import { componentBoardPinCount } from "./adapter.ts";
import { invalidateComponentRouting } from "../routing/invalidateComponentRouting.ts";

/**
 * Single transition for any change that can move pins on the board.
 * Callers pass a pure component updater; this function owns the routing
 * invalidation so move/rotate/spacing/bend/delete cannot diverge again.
 */
export function updateComponentGeometry(
  project: PerfboardProject,
  componentId: string,
  updater: (component: PlacedComponent) => PlacedComponent | undefined
): PerfboardProject {
  const current = project.components.find((component) => component.id === componentId);
  if (!current) return project;
  const updated = updater(current);
  if (!updated || updated === current) return project;

  const pinsChanged = !samePinCells(current, updated);
  const next = {
    ...project,
    components: project.components.map((component) => component.id === componentId ? updated : component)
  };
  return pinsChanged
    ? { ...next, routing: invalidateComponentRouting(project, current.name) }
    : next;
}

export function samePinCells(a: PlacedComponent, b: PlacedComponent): boolean {
  const count = componentBoardPinCount(a);
  if (count !== componentBoardPinCount(b)) return false;
  for (let pin = 1; pin <= count; pin += 1) {
    const left = pinGridPosition(a, pin);
    const right = pinGridPosition(b, pin);
    if (left[0] !== right[0] || left[1] !== right[1]) return false;
  }
  return true;
}
