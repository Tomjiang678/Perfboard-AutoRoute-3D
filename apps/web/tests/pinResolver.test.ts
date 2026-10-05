import assert from "node:assert/strict";
import test from "node:test";
import { resolveImportPins } from "../src/features/import/pinResolver.ts";
import type { ImportState } from "../src/types/project.ts";

test("numeric KiCad pin numbers resolve directly, with roles from pinInfo", () => {
  const state: ImportState = {
    components: [{ ref: "U1", value: "LM358", category: "Amplifier_Operational:LM358", packageName: "", sourceFile: "x.net" }],
    nets: [
      { name: "N1", nodes: [{ ref: "U1", pin: "1" }] },
      { name: "N2", nodes: [{ ref: "U1", pin: "4" }] }
    ],
    warnings: [],
    pinInfo: {
      U1: {
        "1": { name: "1OUT", type: "output" },
        "2": { name: "-", type: "input" },
        "4": { name: "V-", type: "power" }
      }
    }
  };

  const result = resolveImportPins(state);
  assert.equal(result.warnings.length, 0);
  const byNet = Object.fromEntries(result.nets.map((net) => [net.name, net.nodes[0]]));
  assert.equal(byNet.N1.physicalRef, "U1");
  assert.equal(byNet.N1.physicalPin, 1);
  assert.equal(byNet.N1.pinRole, "1OUT");
  assert.equal(byNet.N2.physicalPin, 4);
  assert.equal(byNet.N2.pinRole, "V-");
});

test("non-numeric pin names become unresolved warnings", () => {
  const state: ImportState = {
    components: [],
    nets: [{ name: "N1", nodes: [{ ref: "Q1", pin: "B" }] }],
    warnings: []
  };

  const result = resolveImportPins(state);
  assert.equal(result.nets[0].nodes.length, 0);
  assert.equal(result.nets[0].unresolved.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].ref, "Q1");
});
