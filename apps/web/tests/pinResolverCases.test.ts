import assert from "node:assert/strict";
import test from "node:test";
import { resolveImportPins } from "../src/features/import/pinResolver.ts";
import type { ImportState } from "../src/types/project.ts";

function stateWithPins(pins: string[], pinInfo?: ImportState["pinInfo"]): ImportState {
  return {
    components: [],
    nets: pins.map((pin, index) => ({ name: `N${index}`, nodes: [{ ref: "U1", pin }] })),
    warnings: [],
    pinInfo
  };
}

for (let pin = 1; pin <= 16; pin += 1) {
  test(`numeric pin "${pin}" resolves to physical pin ${pin}`, () => {
    const result = resolveImportPins(stateWithPins([String(pin)]));
    assert.equal(result.nets[0].nodes[0].physicalPin, pin);
    assert.equal(result.warnings.length, 0);
  });
}

test("pin role comes from pinInfo when available", () => {
  const result = resolveImportPins(stateWithPins(["1"], { U1: { "1": { name: "1OUT", type: "output" } } }));
  assert.equal(result.nets[0].nodes[0].pinRole, "1OUT");
});

test("pin role falls back to the pin number without pinInfo", () => {
  const result = resolveImportPins(stateWithPins(["3"]));
  assert.equal(result.nets[0].nodes[0].pinRole, "3");
});

for (const bad of ["A", "B", "~G2A", "V+_8", "2.5", "0", "-1", "", "1IN+", " 1"]) {
  test(`non-numeric pin "${bad}" is flagged as unresolved`, () => {
    const result = resolveImportPins(stateWithPins([bad]));
    assert.equal(result.nets[0].nodes.length, 0);
    assert.equal(result.nets[0].unresolved.length, 1);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].pin, bad);
  });
}

test("physicalRef echoes the refdes", () => {
  const state: ImportState = {
    components: [],
    nets: [{ name: "N", nodes: [{ ref: "U2", pin: "8" }] }],
    warnings: []
  };
  assert.equal(resolveImportPins(state).nets[0].nodes[0].physicalRef, "U2");
});

test("multi-node nets keep every node and mixed validity is split", () => {
  const state: ImportState = {
    components: [],
    nets: [{ name: "N", nodes: [{ ref: "U1", pin: "1" }, { ref: "U1", pin: "B" }, { ref: "R1", pin: "2" }] }],
    warnings: []
  };
  const result = resolveImportPins(state);
  assert.equal(result.nets[0].nodes.length, 2);
  assert.equal(result.nets[0].unresolved.length, 1);
});

test("empty nets resolve to empty node lists", () => {
  const state: ImportState = { components: [], nets: [{ name: "EMPTY", nodes: [] }], warnings: [] };
  const result = resolveImportPins(state);
  assert.equal(result.nets[0].nodes.length, 0);
  assert.equal(result.nets[0].unresolved.length, 0);
});
