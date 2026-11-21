import { USER_PACKAGE_PIN_HEIGHT, type UserPackageDraft, type UserPackageShape } from "./types.ts";

/**
 * Shapes are stacked in creation order. `stackBase` is frozen when the first
 * solid is created: pins added later must not lift existing solids. Older
 * drafts without stackBase infer it from the pins they already have.
 */
export function shapeBaseY(shapes: UserPackageShape[], index: number, stackBase?: number): number {
  let base = stackBase ?? (shapes.some((shape) => shape.kind === "pin") ? USER_PACKAGE_PIN_HEIGHT : 0);
  for (let cursor = 0; cursor < index; cursor += 1) {
    const shape = shapes[cursor];
    if (shape.kind !== "pin") base += shape.height;
  }
  return base;
}

export function shapeTopY(shapes: UserPackageShape[], index: number, stackBase?: number): number {
  const shape = shapes[index];
  return shapeBaseY(shapes, index, stackBase) +
    (shape?.kind === "pin" ? USER_PACKAGE_PIN_HEIGHT : shape?.height ?? 0);
}

export function modelHeight(shapes: UserPackageShape[], stackBase?: number): number {
  return shapes.reduce((height, shape) => height + (shape.kind === "pin" ? 0 : shape.height),
    stackBase ?? (shapes.some((shape) => shape.kind === "pin") ? USER_PACKAGE_PIN_HEIGHT : 0));
}

export function nextStackBase(draft: UserPackageDraft): number {
  if (draft.stackBase !== undefined) return draft.stackBase;
  return draft.shapes.some((shape) => shape.kind === "pin") ? USER_PACKAGE_PIN_HEIGHT : 0;
}

export function clampShapeCount(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
