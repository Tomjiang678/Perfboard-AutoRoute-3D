export interface PinDraft {
  pinCount: string;
  mapping: Record<string, string>;
  bindings: Record<string, string>;
}

import { STORAGE_KEYS } from "../../storage/storageKeys.ts";

const PREFIX = `${STORAGE_KEYS.pinDraftPrefix}:`;

/**
 * Unsaved editor input is kept per project + part identity. This is a safety
 * net, not the save itself: pressing Save still writes the profile into the
 * project and the user library.
 */
export function loadPinDraft(projectId: string, identityKey: string): PinDraft | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId, identityKey));
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!isDraft(value)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

export function savePinDraft(projectId: string, identityKey: string, draft: PinDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(projectId, identityKey), JSON.stringify(draft));
  } catch {
    // Drafts are best-effort.
  }
}

export function clearPinDraft(projectId: string, identityKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(projectId, identityKey));
  } catch {
    // Ignore.
  }
}

function storageKey(projectId: string, identityKey: string) {
  return `${PREFIX}${projectId}:${identityKey}`;
}

function isDraft(value: unknown): value is PinDraft {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PinDraft>;
  return typeof record.pinCount === "string" &&
    Boolean(record.mapping) && typeof record.mapping === "object" &&
    Boolean(record.bindings) && typeof record.bindings === "object";
}
