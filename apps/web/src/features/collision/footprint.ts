import type { PlacedComponent } from "../../types/project.ts";
import type { LibraryComponentKind } from "../../types/project.ts";
import type { GridPoint } from "../board/types.ts";
import { componentBoardPinOffsets } from "../project/adapter.ts";
import { rotateGridOffset } from "../board/placement.ts";
import { adapterPinOffsets } from "../project/adapter.ts";
import type { UserPackageDraft, UserPackageShape } from "../userPackage/model/types.ts";

export interface FootprintBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ComponentFootprint {
  /** Board cells covered by the body, excluding bare pin holes. */
  bodyCells: Set<string>;
  /** Board cells occupied by electrical pins. */
  pinCells: Set<string>;
  /** Union of body and pins; this is what placement occupancy uses. */
  cells: Set<string>;
  /** Local bounds relative to the component anchor. */
  box: FootprintBox;
}

export interface LocalFootprint {
  bodyCells: Set<string>;
  pinCells: Set<string>;
  cells: Set<string>;
  box: FootprintBox;
}

const localCache = new WeakMap<PlacedComponent, LocalFootprint>();
const footprintCache = new WeakMap<PlacedComponent, ComponentFootprint>();
const localPointCache = new WeakMap<PlacedComponent, GridPoint[]>();

/** Geometry is cached once; position only translates the cached local cells. */
export function localFootprint(component: PlacedComponent): LocalFootprint {
  const cached = localCache.get(component);
  if (cached) return cached;

  const pins = localPins(component);
  const pinCells = new Set(pins.map(cellKey));
  const bodyCells = component.adapter
    ? localAdapterBodyCells(component)
    : component.userPackage
      ? localUserPackageBodyCells(component.userPackage, component.rotation)
      : localBuiltInBodyCells(component);
  const box = unionBox([
    boxFromPoints([...bodyCells].map(parseCell)),
    boxFromPoints(pins)
  ]);
  const footprint = { bodyCells, pinCells, cells: new Set([...bodyCells, ...pinCells]), box };
  localCache.set(component, footprint);
  return footprint;
}

/** Board-space view for consumers that already have a placed component. */
export function componentFootprint(component: PlacedComponent): ComponentFootprint {
  const cached = footprintCache.get(component);
  if (cached) return cached;
  const local = localFootprint(component);
  const footprint = {
    bodyCells: translateCells(local.bodyCells, component.position),
    pinCells: translateCells(local.pinCells, component.position),
    cells: translateCells(local.cells, component.position),
    box: local.box
  };
  footprintCache.set(component, footprint);
  return footprint;
}

export function componentOccupiedCells(component: PlacedComponent): Set<string> {
  return componentFootprint(component).cells;
}

export function componentBodyCells(component: PlacedComponent): Set<string> {
  return componentFootprint(component).bodyCells;
}

/** Cells for a candidate position without rebuilding its geometry. */
export function cellsAt(component: PlacedComponent, position: [number, number]): Set<string> {
  return translateCells(localFootprint(component).cells, position);
}

/**
 * Numeric version of cellsAt. Auto placement probes thousands of positions
 * for the same component, so avoid re-splitting the local cell strings.
 */
export function occupiedPointsAt(component: PlacedComponent, position: [number, number]): GridPoint[] {
  let points = localPointCache.get(component);
  if (!points) {
    points = [...localFootprint(component).cells].map(parseCell);
    localPointCache.set(component, points);
  }
  return points.map(([x, y]) => [x + position[0], y + position[1]]);
}

export function bodyCellsAt(component: PlacedComponent, position: [number, number]): Set<string> {
  return translateCells(localFootprint(component).bodyCells, position);
}

export function pinCellsAt(component: PlacedComponent, position: [number, number]): Set<string> {
  return translateCells(localFootprint(component).pinCells, position);
}

/** Adapter plate cells; kept as a named collision entry for adapter tests/tools. */
export function adapterOccupiedCells(component: PlacedComponent): Set<string> {
  return component.adapter ? componentFootprint(component).bodyCells : new Set();
}

export function componentsOverlap(a: PlacedComponent, b: PlacedComponent): boolean {
  return intersects(componentFootprint(a).cells, componentFootprint(b).cells);
}

export function bodiesOverlap(a: PlacedComponent, b: PlacedComponent): boolean {
  return intersects(componentFootprint(a).bodyCells, componentFootprint(b).bodyCells);
}

/** A body covering another component's pin is a collision even when the pins are on the same net. */
export function bodyPinOverlap(a: PlacedComponent, b: PlacedComponent): boolean {
  const first = componentFootprint(a);
  const second = componentFootprint(b);
  return intersects(first.bodyCells, second.pinCells) ||
    intersects(second.bodyCells, first.pinCells);
}

export function cellsOverlap(a: Set<string>, b: Set<string>): boolean {
  return intersects(a, b);
}

export function footprintBox(component: PlacedComponent): FootprintBox {
  return localFootprint(component).box;
}

function intersects(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return false;
  for (const cell of a) if (b.has(cell)) return true;
  return false;
}

function cellKey([x, y]: GridPoint) {
  return `${x},${y}`;
}

function parseCell(cell: string): [number, number] {
  const [x, y] = cell.split(",").map(Number);
  return [x, y];
}

function localPins(component: PlacedComponent): GridPoint[] {
  const offsets = componentBoardPinOffsets(component);
  // User packages keep their body anchored at the first pin's initial hole.
  const anchor = component.userPackage ? [0, 0] as GridPoint : offsets[0] ?? [0, 0];
  return offsets.map(([x, y]) => {
    const [rx, ry] = rotateGridOffset([x - anchor[0], y - anchor[1]], component.rotation);
    return [rx, ry];
  });
}

function localAdapterBodyCells(component: PlacedComponent): Set<string> {
  const adapter = component.adapter;
  if (!adapter) return new Set();
  const offsets = adapterPinOffsets(adapter);
  const xs = offsets.map(([x]) => x);
  const ys = offsets.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(adapter.width, maxX - minX + 2);
  const height = Math.max(adapter.height, maxY - minY + 2);
  const left = (minX + maxX) / 2 - width / 2;
  const top = (minY + maxY) / 2 - height / 2;
  return rotateCells(cellsInRect(left, top, width, height), component.rotation);
}

function localBuiltInBodyCells(component: PlacedComponent): Set<string> {
  const profile = BODY_PROFILES[component.kind] ?? DEFAULT_BODY_PROFILE;
  const pinBox = localPinBox(component.pinOffsets);
  const body = profile(pinBox, component);
  const centerX = (pinBox.minX + pinBox.maxX) / 2;
  const centerY = (pinBox.minY + pinBox.maxY) / 2;
  return rotateCells(
    cellsInRect(centerX - body.width / 2, centerY - body.height / 2, body.width, body.height),
    component.rotation
  );
}

function localUserPackageBodyCells(draft: UserPackageDraft, rotation: number): Set<string> {
  const cells = new Set<string>();
  for (const shape of draft.shapes) {
    if (shape.kind === "pin") continue;
    for (const cell of userShapeCells(shape)) cells.add(cell);
  }
  return rotateCells([...cells], rotation);
}

function userShapeCells(shape: Exclude<UserPackageShape, { kind: "pin" }>): Set<string> {
  if (shape.kind === "cylinder") {
    return cellsInCircle(shape.center[0], shape.center[1], shape.radius);
  }
  const angle = shape.angle * Math.PI / 180;
  const halfLength = shape.length / 2;
  const halfWidth = shape.width / 2;
  const bounds = Math.max(halfLength, halfWidth);
  const cells = new Set<string>();
  for (let x = Math.floor(shape.center[0] - bounds); x <= Math.ceil(shape.center[0] + bounds); x += 1) {
    for (let y = Math.floor(shape.center[1] - bounds); y <= Math.ceil(shape.center[1] + bounds); y += 1) {
      if (insideRotatedRect(x - shape.center[0], y - shape.center[1], halfLength, halfWidth, angle)) {
        cells.add(`${x},${y}`);
      }
    }
  }
  return cells;
}

function insideRotatedRect(x: number, y: number, halfLength: number, halfWidth: number, angle: number) {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const localX = x * cos - y * sin;
  const localY = x * sin + y * cos;
  return Math.abs(localX) <= halfLength && Math.abs(localY) <= halfWidth;
}

function cellsInCircle(cx: number, cy: number, radius: number): Set<string> {
  const cells = new Set<string>();
  for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) cells.add(`${x},${y}`);
    }
  }
  return cells;
}

function cellsInRect(left: number, top: number, width: number, height: number): string[] {
  const cells: string[] = [];
  for (let x = Math.floor(left); x <= Math.ceil(left + width); x += 1) {
    for (let y = Math.floor(top); y <= Math.ceil(top + height); y += 1) {
      if (x >= left && x < left + width && y >= top && y < top + height) cells.push(`${x},${y}`);
    }
  }
  return cells;
}

function rotateCells(cells: string[], rotation: number): Set<string> {
  const rotated = new Set<string>();
  for (const cell of cells) {
    const [x, y] = parseCell(cell);
    const [rx, ry] = rotateGridOffset([x, y], rotation);
    rotated.add(`${rx},${ry}`);
  }
  return rotated;
}

function translateCells(cells: Set<string>, position: [number, number]): Set<string> {
  const translated = new Set<string>();
  for (const cell of cells) {
    const [x, y] = parseCell(cell);
    translated.add(`${x + position[0]},${y + position[1]}`);
  }
  return translated;
}

function localPinBox(pinOffsets: Array<[number, number]>): FootprintBox {
  const anchor = pinOffsets[0] ?? [0, 0];
  const points = pinOffsets.map(([x, y]) => [x - anchor[0], y - anchor[1]] as [number, number]);
  return boxFromPoints(points);
}

function boxFromPoints(points: Array<[number, number]>): FootprintBox {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 1, height: 1 };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function unionBox(boxes: FootprintBox[]): FootprintBox {
  const minX = Math.min(...boxes.map((box) => box.minX));
  const maxX = Math.max(...boxes.map((box) => box.maxX));
  const minY = Math.min(...boxes.map((box) => box.minY));
  const maxY = Math.max(...boxes.map((box) => box.maxY));
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

interface BodySize {
  width: number;
  height: number;
}

type BodyProfile = (pinBox: FootprintBox, component: PlacedComponent) => BodySize;

const BODY_PROFILES: Partial<Record<LibraryComponentKind, BodyProfile>> = {
  dip: (box) => ({ width: Math.max(2.4, box.width - 0.45), height: box.height + 0.7 }),
  dip_switch: (box) => ({ width: Math.max(2.4, box.width - 0.25), height: box.height + 0.75 }),
  seven_segment_display: (box) => ({ width: Math.max(3.2, box.width + 1), height: Math.max(5.1, box.height + 1) }),
  alphanumeric_display: (box) => ({ width: Math.max(3.2, box.width + 1), height: Math.max(5.1, box.height + 1) }),
  pin_header: (box) => ({ width: Math.max(1, box.width + 0.6), height: Math.max(0.62, box.height + 0.5) }),
  resistor: (box) => ({ width: box.width + 0.4, height: Math.max(0.8, box.height + 0.5) }),
  inductor: (box) => ({ width: box.width + 0.4, height: Math.max(0.8, box.height + 0.5) }),
  diode: (box) => ({ width: box.width + 0.4, height: Math.max(0.8, box.height + 0.5) }),
  led: (box) => ({ width: box.width + 0.4, height: Math.max(0.8, box.height + 0.5) })
};

const DEFAULT_BODY_PROFILE: BodyProfile = (box) => ({
  width: box.width + 1,
  height: box.height + 1
});
