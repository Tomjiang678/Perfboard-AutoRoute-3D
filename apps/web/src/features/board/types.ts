import type { BoardSize, PlacedComponent } from "../../types/project.ts";

export type GridPoint = [number, number];
export type HoleId = string;
export type ElectricalNodeId = string;
export type RoutePrimitiveKind = "bottom_trace" | "jumper";

export interface BoardHole {
  id: HoleId;
  grid: GridPoint;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface BoardCapabilities {
  routePrimitives: ReadonlySet<RoutePrimitiveKind>;
  hasInternalConnections: boolean;
  canResizeWidth: boolean;
  canResizeHeight: boolean;
  canRenderBottomView: boolean;
  jumperSide: "top" | "bottom";
}

export type PlacementIssueCode =
  | "invalid_hole"
  | "duplicate_pin_hole"
  | "shared_electrical_node"
  | "power_rail_requires_power_net"
  | "two_pin_horizontal_must_bridge_center"
  | "chip_must_bridge_center";

export interface PlacementIssue {
  code: PlacementIssueCode;
  message: string;
  pins?: number[];
  holes?: GridPoint[];
}

export interface PlacementValidation {
  valid: boolean;
  pinHoles: GridPoint[];
  issues: PlacementIssue[];
}

export type PinNetAssignments = Readonly<Record<number, string | undefined>>;

export interface BoardModel {
  readonly definition: BoardSize;
  readonly capabilities: BoardCapabilities;
  getAllHoles(): readonly BoardHole[];
  getHole(point: GridPoint): BoardHole | undefined;
  isValidHole(point: GridPoint): boolean;
  snapToHole(point: GridPoint): GridPoint | undefined;
  getElectricalNode(hole: HoleId | GridPoint): ElectricalNodeId | undefined;
  areInternallyConnected(a: HoleId | GridPoint, b: HoleId | GridPoint): boolean;
  validatePlacement(component: PlacedComponent, pinNets?: PinNetAssignments): PlacementValidation;
  getDisplayName(): string;
}

export function gridHoleId([x, y]: GridPoint): HoleId {
  return `${x},${y}`;
}

export function parseGridHoleId(id: HoleId): GridPoint | undefined {
  const [rawX, rawY, ...rest] = id.split(",");
  if (rest.length > 0) return undefined;
  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isInteger(x) && Number.isInteger(y) ? [x, y] : undefined;
}
