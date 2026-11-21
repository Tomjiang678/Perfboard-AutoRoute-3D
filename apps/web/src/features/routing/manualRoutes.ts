import type { PerfboardProject } from "../../types/project.ts";
import { getBoardModel } from "../board/factory.ts";
import { componentPinHoles } from "../board/placement.ts";
import { expandOrthogonalPath } from "./routingGeometry.ts";

export function createManualBottomPath(from: [number, number], to: [number, number]): Array<[number, number]> {
  if (from[0] === to[0] || from[1] === to[1]) {
    return expandOrthogonalPath([from, to]);
  }
  return expandOrthogonalPath([from, [to[0], from[1]], to]);
}

export function removeBottomTraceSegmentAt(traces: PerfboardProject["routing"]["traces"], point: [number, number]) {
  const nextTraces: PerfboardProject["routing"]["traces"] = [];
  let removed = false;

  for (const trace of traces) {
    if (removed) {
      nextTraces.push(trace);
      continue;
    }

    const removal = findStraightRunAtPoint(trace.points, point);
    if (!removal) {
      nextTraces.push(trace);
      continue;
    }

    removed = true;
    const before = trace.points.slice(0, removal.startIndex + 1);
    const after = trace.points.slice(removal.endIndex);
    if (before.length >= 2) {
      nextTraces.push({ ...trace, id: crypto.randomUUID(), points: before });
    }
    if (after.length >= 2) {
      nextTraces.push({ ...trace, id: crypto.randomUUID(), points: after });
    }
  }

  return { traces: nextTraces, removed };
}

function findStraightRunAtPoint(points: Array<[number, number]>, point: [number, number]) {
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const from = points[segmentIndex];
    const to = points[segmentIndex + 1];
    if (!pointOnSegment(point, from, to)) continue;

    let startIndex = segmentIndex;
    let endIndex = segmentIndex + 1;
    while (startIndex > 0 && isSameStraightLine(points[startIndex - 1], points[startIndex], from, to)) {
      startIndex -= 1;
    }
    while (endIndex < points.length - 1 && isSameStraightLine(points[endIndex], points[endIndex + 1], from, to)) {
      endIndex += 1;
    }
    return { startIndex, endIndex };
  }

  return undefined;
}

function pointOnSegment(point: [number, number], from: [number, number], to: [number, number]) {
  if (from[0] === to[0]) {
    return point[0] === from[0] && point[1] >= Math.min(from[1], to[1]) && point[1] <= Math.max(from[1], to[1]);
  }
  if (from[1] === to[1]) {
    return point[1] === from[1] && point[0] >= Math.min(from[0], to[0]) && point[0] <= Math.max(from[0], to[0]);
  }
  return false;
}

function isSameStraightLine(a: [number, number], b: [number, number], from: [number, number], to: [number, number]) {
  const horizontal = from[1] === to[1];
  const vertical = from[0] === to[0];
  if (horizontal) return a[1] === from[1] && b[1] === from[1];
  if (vertical) return a[0] === from[0] && b[0] === from[0];
  return false;
}

export function samePoint(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Breadboard rule: one hole takes one wire. A manually drawn jumper endpoint
 * that lands on a component pin hole or another jumper's hole is moved to the
 * nearest free hole of the same electrical node (same 5-hole row / same rail);
 * if no free hole exists there, the jumper is rejected.
 */
export function relocateJumperEndpoint(project: PerfboardProject, point: [number, number]): [number, number] | undefined {
  if ((project.board.kind ?? "perfboard") !== "breadboard") return point;
  const boardModel = getBoardModel(project.board);
  const occupied = new Set<string>();
  project.components.forEach((component) => componentPinHoles(component).forEach(([x, y]) => occupied.add(`${x},${y}`)));
  project.routing.jumpers.forEach((jumper) => {
    occupied.add(`${jumper.from[0]},${jumper.from[1]}`);
    occupied.add(`${jumper.to[0]},${jumper.to[1]}`);
  });

  const pointId = `${point[0]},${point[1]}`;
  if (!occupied.has(pointId)) return point;
  const node = boardModel.getElectricalNode(point);
  if (!node) return undefined;
  let best: [number, number] | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  boardModel.getAllHoles().forEach((hole) => {
    if (boardModel.getElectricalNode(hole.id) !== node) return;
    const holeId = `${hole.grid[0]},${hole.grid[1]}`;
    if (occupied.has(holeId)) return;
    const distance = Math.abs(hole.grid[0] - point[0]) + Math.abs(hole.grid[1] - point[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = hole.grid;
    }
  });
  return best;
}
