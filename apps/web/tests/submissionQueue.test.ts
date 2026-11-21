import assert from "node:assert/strict";
import test from "node:test";
import { flushProfileSubmissions, queueProfileSubmission } from "../src/features/import/multisim/submit.ts";
import { buildProfile } from "../src/features/import/multisim/profileBuilder.ts";

const OUTBOX_KEY = "protoroute-profile-outbox";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }
  };
}

function installWindow() {
  const storage = memoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  return storage;
}

function profile() {
  return buildProfile(
    { value: "TL062IP", package: "PDIP-P-8" },
    {
      pinCount: 8,
      mappings: [
        { unit: "A", logical: "1OUT", physical: 1 },
        { unit: "A", logical: "1VS+", physical: 8 }
      ],
      bindings: [{ physical: 4, net: "0" }]
    }
  );
}

test("saving a profile enqueues a minimal payload", () => {
  const storage = installWindow();
  queueProfileSubmission(profile());
  const outbox = JSON.parse(storage.getItem(OUTBOX_KEY) ?? "[]");
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].kind, "protoroute.pin-profile");
  assert.equal(outbox[0].profile.identity.value, "TL062IP");
  assert.equal(outbox[0].profile.pinCount, 8);
  assert.equal("nets" in outbox[0].profile, false);
  assert.equal("refs" in outbox[0].profile, false);
});

test("the same profile is not queued twice", () => {
  const storage = installWindow();
  queueProfileSubmission(profile());
  queueProfileSubmission(profile());
  assert.equal(JSON.parse(storage.getItem(OUTBOX_KEY) ?? "[]").length, 1);
});

test("flush posts queued submissions and clears the outbox", async () => {
  const storage = installWindow();
  const calls: Array<{ url: string; body: string; contentType: string }> = [];
  (globalThis as { fetch?: unknown }).fetch = async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: String(init.body),
      contentType: String((init.headers as Record<string, string>)["content-type"])
    });
    return { ok: true };
  };

  queueProfileSubmission(profile());
  await flushProfileSubmissions("https://example.test/api/pin-profile");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.test/api/pin-profile");
  assert.equal(calls[0].contentType, "text/plain;charset=UTF-8");
  assert.equal(JSON.parse(calls[0].body).profile.identity.value, "TL062IP");
  assert.deepEqual(JSON.parse(storage.getItem(OUTBOX_KEY) ?? "[]"), []);
});

test("a failed flush keeps the submission for the next attempt", async () => {
  const storage = installWindow();
  (globalThis as { fetch?: unknown }).fetch = async () => {
    throw new Error("offline");
  };

  queueProfileSubmission(profile());
  await flushProfileSubmissions("https://example.test/api/pin-profile");
  assert.equal(JSON.parse(storage.getItem(OUTBOX_KEY) ?? "[]").length, 1);
});

test("queueing never throws when crypto.randomUUID is unavailable", () => {
  const storage = installWindow();
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
  try {
    assert.doesNotThrow(() => queueProfileSubmission(profile()));
    assert.equal(JSON.parse(storage.getItem(OUTBOX_KEY) ?? "[]").length, 1);
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
  }
});
