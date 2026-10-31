import type { BoardSize } from "../../types/project.ts";

export interface RouterCell {
  x: number;
  y: number;
}

export type GridPoint = [number, number];

export function key(x: number, y: number) {
  return `${x},${y}`;
}

export function parseKey(id: string): GridPoint {
  const [x, y] = id.split(",").map(Number);
  return [x, y];
}

export function edgeKey(a: GridPoint, b: GridPoint) {
  const first = key(a[0], a[1]);
  const second = key(b[0], b[1]);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

export function traceEdges(points: GridPoint[]) {
  return points.slice(1).map((point, index) => edgeKey(points[index], point));
}

const MAX_PATH_STEPS = 10_000;

/** 走锡坐标必须是有限整数，否则下面的逐格展开永远走不到终点。 */
export function isFiniteGridPoint(point: unknown): point is GridPoint {
  return Array.isArray(point) &&
    point.length === 2 &&
    Number.isInteger(point[0]) &&
    Number.isInteger(point[1]) &&
    Math.abs(point[0]) <= MAX_PATH_STEPS &&
    Math.abs(point[1]) <= MAX_PATH_STEPS;
}

export function pathHasInvalidPoints(points: GridPoint[]): boolean {
  return !Array.isArray(points) || points.some((point) => !isFiniteGridPoint(point));
}

export function expandOrthogonalPath(points: GridPoint[]) {
  if (points.length <= 1) {
    return points;
  }

  // 含非法点的路径一律拒绝展开：静默丢弃坏点会把线路“修好”，让 DRC 误报通过
  if (pathHasInvalidPoints(points)) {
    return [];
  }

  const expanded: GridPoint[] = [points[0]];
  let steps = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = expanded[expanded.length - 1];
    const target = points[index];
    const dx = Math.sign(target[0] - previous[0]);
    const dy = Math.sign(target[1] - previous[1]);

    if (dx !== 0 && dy !== 0) {
      expanded.push(target);
      continue;
    }

    let current = previous;
    while (current[0] !== target[0] || current[1] !== target[1]) {
      if (steps >= MAX_PATH_STEPS) {
        return expanded;
      }
      steps += 1;
      current = [current[0] + dx, current[1] + dy];
      expanded.push(current);
    }
  }

  return expanded;
}

export function adjacentCells(cell: RouterCell): RouterCell[] {
  return [
    { x: cell.x + 1, y: cell.y },
    { x: cell.x - 1, y: cell.y },
    { x: cell.x, y: cell.y + 1 },
    { x: cell.x, y: cell.y - 1 }
  ];
}

export function neighbors(cell: RouterCell, board: BoardSize): RouterCell[] {
  return adjacentCells(cell).filter((next) => next.x >= 0 && next.y >= 0 && next.x < board.width && next.y < board.height);
}

export function manhattan(a: GridPoint, b: GridPoint) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

export function inBounds(point: GridPoint, board: BoardSize) {
  return point[0] >= 0 && point[1] >= 0 && point[0] < board.width && point[1] < board.height;
}

export function segmentsIntersect(a1: GridPoint, a2: GridPoint, b1: GridPoint, b2: GridPoint) {
  const d1 = orientation(a1, a2, b1);
  const d2 = orientation(a1, a2, b2);
  const d3 = orientation(b1, b2, a1);
  const d4 = orientation(b1, b2, a2);

  if (d1 === 0 && onSegment(a1, b1, a2)) {
    return true;
  }
  if (d2 === 0 && onSegment(a1, b2, a2)) {
    return true;
  }
  if (d3 === 0 && onSegment(b1, a1, b2)) {
    return true;
  }
  if (d4 === 0 && onSegment(b1, a2, b2)) {
    return true;
  }
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

export function shareEndpoint(a1: GridPoint, a2: GridPoint, b1: GridPoint, b2: GridPoint) {
  const endpoints = new Set([key(a1[0], a1[1]), key(a2[0], a2[1])]);
  return endpoints.has(key(b1[0], b1[1])) || endpoints.has(key(b2[0], b2[1]));
}

/** 一根直连线（跳线）覆盖的格子，用 Bresenham 走一遍；用于禁布区检查。 */
export function cellsAlongSegment(from: GridPoint, to: GridPoint): GridPoint[] {
  const cells: GridPoint[] = [];
  let [x, y] = from;
  const [targetX, targetY] = to;
  const dx = Math.abs(targetX - x);
  const dy = Math.abs(targetY - y);
  const stepX = targetX > x ? 1 : -1;
  const stepY = targetY > y ? 1 : -1;
  let error = dx - dy;
  let guard = 0;

  while (guard <= dx + dy + 1) {
    guard += 1;
    cells.push([x, y]);
    if (x === targetX && y === targetY) break;
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x += stepX;
    }
    if (doubled < dx) {
      error += dx;
      y += stepY;
    }
  }

  return cells;
}

export function formatSegment(from: GridPoint, to: GridPoint) {
  return `(${from[0]},${from[1]})-(${to[0]},${to[1]})`;
}

function orientation(a: GridPoint, b: GridPoint, c: GridPoint) {
  return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

function onSegment(a: GridPoint, b: GridPoint, c: GridPoint) {
  return b[0] >= Math.min(a[0], c[0]) && b[0] <= Math.max(a[0], c[0])
    && b[1] >= Math.min(a[1], c[1]) && b[1] <= Math.max(a[1], c[1]);
}
