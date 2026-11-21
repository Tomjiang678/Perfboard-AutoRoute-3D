import assert from "node:assert/strict";
import test from "node:test";
import { collectProfileConflicts } from "../src/features/import/multisim/conflicts.ts";
import { resolveBuiltinProfile } from "../src/features/import/multisim/builtinProfiles.ts";
import { identityKey } from "../src/features/import/multisim/profile.ts";
import type { ImportState, ParsedComponent, PinProfile } from "../src/types/project.ts";

const component: ParsedComponent = {
  ref: "U3",
  value: "LM324D",
  category: "Amplifier_Operational:OpAmp",
  packageName: "CASE751A",
  sourceFile: "x",
  format: "multisim"
};

function state(pinProfiles: PinProfile[], choices?: ImportState["pinProfileChoices"]): ImportState {
  return { components: [component], nets: [], warnings: [], pinProfiles, pinProfileChoices: choices };
}

function userProfileWithWrongPin(): PinProfile {
  return {
    id: "user-lm324",
    identity: { value: "LM324D", package: "CASE751A" },
    pinCount: 14,
    pins: [{ physical: 7, unit: "A", logical: "1OUT", connection: "netlist" }],
    createdAt: "2026-11-20"
  };
}

test("a different user mapping is reported as a conflict", () => {
  const conflicts = collectProfileConflicts(state([userProfileWithWrongPin()]));
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].publicSource, "builtin");
  assert.equal(conflicts[0].userProfile.pinCount, 14);
  assert.equal(conflicts[0].publicProfile.pinCount, 14);
});

test("the same mapping is not a conflict", () => {
  const publicProfile = resolveBuiltinProfile(component);
  assert.ok(publicProfile);
  assert.equal(collectProfileConflicts(state([publicProfile])).length, 0);
});

test("choosing the user version suppresses the conflict", () => {
  const key = identityKey({ value: "LM324D", package: "CASE751A" });
  assert.equal(collectProfileConflicts(state([userProfileWithWrongPin()], { [key]: "user" })).length, 0);
});
