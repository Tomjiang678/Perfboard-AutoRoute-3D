export const USER_PACKAGE_BOARD_WIDTH = 30;
export const USER_PACKAGE_BOARD_HEIGHT = 20;
export const USER_PACKAGE_PIN_HEIGHT = 0.8;

export type UserPackageShapeKind = "cuboid" | "cylinder" | "pin";

export interface UserPackagePin {
  id: string;
  kind: "pin";
  hole: [number, number];
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
  /** Base height of the first solid; pins added later must not move it. */
  stackBase?: number;
  shapes: UserPackageShape[];
  updatedAt: string;
}

export const DEFAULT_SHAPE_COLOR = "#171a1f";
