import assert from "node:assert/strict";
import test from "node:test";
import { mergePowerRefs, stripPowerNodes } from "../src/features/import/multisim/normalizeImport.ts";
import type { ImportState } from "../src/types/project.ts";

function state(): ImportState {
  return {
    components: [],
    nets: [
      { name: "0", nodes: [{ ref: "V1", pin: "2", logicalPin: "2" }, { ref: "R1", pin: "2", logicalPin: "2" }] },
      { name: "1", nodes: [{ ref: "V2", pin: "1", logicalPin: "1" }] }
    ],
    warnings: []
  };
}

test("power symbol nodes are removed after the cross-reference identifies them", () => {
  const next = stripPowerNodes(state(), ["V1", "V2"]);
  assert.deepEqual(next.nets.map((net) => net.name), ["0"]);
  assert.deepEqual(next.nets[0].nodes.map((node) => node.ref), ["R1"]);
});

test("a net that only held power symbols disappears", () => {
  const next = stripPowerNodes(state(), ["V1", "V2"]);
  assert.equal(next.nets.some((net) => net.name === "1"), false);
});

test("power refs merge case-insensitively", () => {
  assert.deepEqual(mergePowerRefs(["v1", "VCC"], undefined, ["V2", "vcc"]), ["V1", "VCC", "V2"]);
});
