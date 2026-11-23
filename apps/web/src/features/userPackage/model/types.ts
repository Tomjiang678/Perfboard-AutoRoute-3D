export const USER_PACKAGE_BOARD_WIDTH = 30;
export const USER_PACKAGE_BOARD_HEIGHT = 20;
export const USER_PACKAGE_PIN_HEIGHT = 0.8;

export type UserPackageShapeKind = "cuboid" | "cylinder" | "pin";

export type UserPackageBendDirection = "+x" | "-x" | "+z" | "-z";

export interface UserPackagePin {
  id: string;
  kind: "pin";
  hole: [number, number];
  /** Maximum cells this pin can move from its initial hole. Missing/0 means fixed. */
  bendRange?: number;
  /** One of the four board-plane directions (X/Z); Y is height only. */
  bendDirection?: UserPackageBendDirection;
}

export interface UserPackageCuboid {
  id: string;
  kind: "cuboid";
  center: [number, number];
  length: number;
  width: number;
  angle: number;
  height: number;
  color: string;
}

export interface UserPackageCylinder {
  id: string;
  kind: "cylinder";
  center: [number, number];
  radius: number;
  height: number;
  color: string;
}

export type UserPackageShape = UserPackagePin | UserPackageCuboid | UserPackageCylinder;

export interface UserPackageDraft {
  id: string;
  name: string;
  /**
   * Base height of the first solid. It is reset when the last solid is
   * removed, so pins added after that can lift the next solid normally.
   */
  stackBase?: number;
  shapes: UserPackageShape[];
  updatedAt: string;
}

export const DEFAULT_SHAPE_COLOR = "#171a1f";
