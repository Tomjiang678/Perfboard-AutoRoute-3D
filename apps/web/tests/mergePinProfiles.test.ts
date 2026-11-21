import assert from "node:assert/strict";
import test from "node:test";
import { mergeSubmissions } from "../src/features/import/multisim/mergeSubmissions.ts";
import { hashSubmissionProfile } from "../src/features/import/multisim/profileHash.ts";
import type { ProfileSubmission } from "../src/features/import/multisim/submissionTypes.ts";
import type { PinProfilePin } from "../src/types/project.ts";

function pins(): PinProfilePin[] {
  return [
    { physical: 1, unit: "A", logical: "1OUT", connection: "netlist" },
    { physical: 2, unit: "A", logical: "1IN-", connection: "netlist" },
    { physical: 3, unit: "A", logical: "1IN+", connection: "netlist" },
    { physical: 8, unit: "A", logical: "VS+", connection: "netlist" }
  ];
}

function submission(pinList: PinProfilePin[], overrides: Partial<ProfileSubmission> = {}): ProfileSubmission {
  return {
    kind: "protoroute.pin-profile",
    schemaVersion: 1,
    appVersion: "2.0.0",
    submissionId: "id",
    contentHash: "ignored",
    createdAt: "2026-11-19",
    profile: {
      identity: { value: "TL062IP", package: "PDIP-P-8" },
      pinCount: 8,
      pins: pinList
    },
    ...overrides
  };
}

test("identical submissions are counted and become a verified profile", () => {
  const shuffled = [...pins()].reverse();
  const result = mergeSubmissions([submission(pins()), submission(shuffled)], { minConfirmations: 2 });
  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].identity.value, "TL062IP");
  assert.equal(result.profiles[0].pinCount, 8);
  assert.equal(result.stats.conflicts, 0);
  assert.equal(result.stats.candidates, 0);
});

test("a single confirmation stays a candidate", () => {
  const result = mergeSubmissions([submission(pins())], { minConfirmations: 2 });
  assert.equal(result.profiles.length, 0);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].submissions, 1);
});

test("different pinouts for the same identity are a conflict, never auto-merged", () => {
  const other = pins().map((pin, index) => ({ ...pin, physical: [2, 3, 4, 7][index] }));
  const result = mergeSubmissions([submission(pins()), submission(other)], { minConfirmations: 1 });
  assert.equal(result.profiles.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].variants.length, 2);
});

test("invalid submissions are ignored instead of corrupting the library", () => {
  const result = mergeSubmissions([
    submission(pins()),
    { kind: "other" },
    submission([{ physical: 99, connection: "netlist" }]),
    submission([{ physical: 1, connection: "bound" }])
  ], { minConfirmations: 1 });
  assert.equal(result.stats.invalid, 3);
  assert.equal(result.profiles.length, 1);
});

test("content hash ignores pin order and identity case", () => {
  const first = hashSubmissionProfile({ identity: { value: "tl062ip", package: "pdip-p-8" }, pinCount: 8, pins: pins() });
  const second = hashSubmissionProfile({ identity: { value: "TL062IP", package: "PDIP-P-8" }, pinCount: 8, pins: [...pins()].reverse() });
  assert.equal(first, second);
});
