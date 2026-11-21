import type { PinProfile } from "../../../types/project.ts";
import type { ProfileSubmission } from "./submissionTypes.ts";
import { hashSubmissionProfile } from "./profileHash.ts";
import { STORAGE_KEYS } from "../../storage/storageKeys.ts";

const OUTBOX_KEY = STORAGE_KEYS.profileOutbox;
const MAX_OUTBOX = 50;
const APP_VERSION = "2.0.0";

function endpoint(): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_PROFILE_ENDPOINT?.trim() || undefined;
}

/**
 * Profile sharing is fire-and-forget: the payload only contains the part
 * pinout the user just taught (never nets, refdes, project or file names), so
 * saving a part never blocks on the network and never interrupts the editor.
 */
export function queueProfileSubmission(profile: PinProfile) {
  if (typeof window === "undefined") return;

  try {
    const payload: ProfileSubmission = {
      kind: "protoroute.pin-profile",
      schemaVersion: 1,
      appVersion: APP_VERSION,
      submissionId: newSubmissionId(),
      contentHash: hashSubmissionProfile({
        identity: { value: profile.identity.value, package: profile.identity.package },
        pinCount: profile.pinCount,
        pins: profile.pins
      }),
      createdAt: new Date().toISOString().slice(0, 10),
      profile: {
        identity: { value: profile.identity.value, package: profile.identity.package },
        pinCount: profile.pinCount,
        pins: profile.pins
      }
    };

    const outbox = readOutbox();
    if (outbox.some((item) => item.contentHash === payload.contentHash)) return;
    writeOutbox([...outbox, payload].slice(-MAX_OUTBOX));
    void flushProfileSubmissions();
  } catch {
    // Sharing must never block saving a profile.
  }
}

function newSubmissionId() {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  return cryptoApi?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function flushProfileSubmissions(url = endpoint()) {
  if (!url || typeof window === "undefined") return;

  const outbox = readOutbox();
  const remaining: ProfileSubmission[] = [];
  for (const item of outbox) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(item),
        keepalive: true
      });
      if (!response.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  writeOutbox(remaining);
}

function readOutbox(): ProfileSubmission[] {
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as ProfileSubmission[] : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: ProfileSubmission[]) {
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}
