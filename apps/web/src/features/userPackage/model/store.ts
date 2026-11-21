import { STORAGE_KEYS } from "../../storage/storageKeys.ts";
import type { UserPackageDraft } from "./types.ts";

const MAX_PACKAGES = 100;

export function loadUserPackages(): UserPackageDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.userPackages);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDraft);
  } catch {
    return [];
  }
}

export function saveUserPackage(draft: UserPackageDraft) {
  if (typeof window === "undefined") return;
  const packages = loadUserPackages();
  const next = [
    { ...draft, updatedAt: new Date().toISOString() },
    ...packages.filter((item) => item.id !== draft.id)
  ].slice(0, MAX_PACKAGES);
  window.localStorage.setItem(STORAGE_KEYS.userPackages, JSON.stringify(next));
}

export function deleteUserPackage(id: string) {
  if (typeof window === "undefined") return;
  const next = loadUserPackages().filter((item) => item.id !== id);
  window.localStorage.setItem(STORAGE_KEYS.userPackages, JSON.stringify(next));
}

function isDraft(value: unknown): value is UserPackageDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<UserPackageDraft>;
  return typeof draft.id === "string" &&
    typeof draft.name === "string" &&
    typeof draft.updatedAt === "string" &&
    Array.isArray(draft.shapes) &&
    draft.shapes.every(isShape);
}

function isShape(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const shape = value as Record<string, unknown>;
  if (shape.kind === "pin") return isPoint(shape.hole);
  if (shape.kind === "cuboid") {
    return isPoint(shape.center) &&
      isNumber(shape.length) && isNumber(shape.width) &&
      isNumber(shape.angle) && isNumber(shape.height) &&
      typeof shape.color === "string";
  }
  if (shape.kind === "cylinder") {
    return isPoint(shape.center) &&
      isNumber(shape.radius) && isNumber(shape.height) &&
      typeof shape.color === "string";
  }
  return false;
}

function isPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(isNumber);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
