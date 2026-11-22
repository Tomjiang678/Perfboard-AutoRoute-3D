import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseMultisimFiles } from "../src/features/import/multisim/multisimReport.ts";
import { applyInferredPinCounts } from "../src/features/import/multisim/pinCountInference.ts";
import { collectPendingParts } from "../src/features/import/multisim/pending.ts";
import { applyProfilesToState } from "../src/features/import/multisim/library.ts";
import { buildProfile } from "../src/features/import/multisim/profileBuilder.ts";
import { createUserPackageComponent } from "../src/features/userPackage/model/placement.ts";
import { bendUserPackagePin } from "../src/features/userPackage/model/pinBend.ts";
import { createUserPackageModel } from "../src/features/userPackage/scene/placedModel.ts";
import { saveUserPackage, loadUserPackages, deleteUserPackage } from "../src/features/userPackage/model/store.ts";
import {
  cellsAt,
  componentFootprint,
  componentsOverlap
} from "../src/features/collision/footprint.ts";
import type { ImportState } from "../src/types/project.ts";
import type { UserPackageDraft as Draft } from "../src/features/userPackage/model/types.ts";

function draft(): Draft {
  return {
    id: "coverage-package",
    name: "coverage",
    stackBase: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    shapes: [
      { id: "p1", kind: "pin", hole: [4, 4], bendRange: 2, bendDirection: "+z" },
      { id: "p2", kind: "pin", hole: [7, 4], bendRange: 1, bendDirection: "-x" },
      {
        id: "b1", kind: "cuboid", center: [5.5, 4], length: 4, width: 2,
        angle: 0, height: 2, color: "#f69104"
      }
    ]
  };
}

test("Multisim fixture files parse, infer pins, and resolve a profile", async () => {
  const dir = new URL("../../../docs/test-netlists/multisim-discrete-unknown/", import.meta.url);
  const crossref = await readFile(new URL("crossref.txt", dir), "utf8");
  const netlist = await readFile(new URL("netlist.txt", dir), "utf8");
  const parsed = parseMultisimFiles([
    { name: "crossref.txt", text: crossref },
    { name: "netlist.txt", text: netlist }
  ]);
  assert.ok(parsed.components.length > 20);
  assert.ok(parsed.components.every((component) => component.format === "multisim"));
  assert.ok(parsed.components.some((component) => component.ref === "Q1"));
  assert.ok(parsed.nets.some((net) => net.name === "5V"));
  assert.ok(parsed.powerRefs?.includes("5V"));

  const state: ImportState = {
    components: applyInferredPinCounts({
      components: parsed.components,
      nets: parsed.nets,
      warnings: parsed.warnings,
      pinInfo: {}
    }).components,
    nets: parsed.nets,
    warnings: parsed.warnings,
    pinInfo: {}
  };
  const q1 = state.components.find((component) => component.ref === "Q1");
  assert.equal(q1?.pinCount, 3);

  const profile = buildProfile(
    { value: "2N2222A", package: "TO-92", category: "TRANSISTOR" },
    { pinCount: 3, mappings: [{ unit: "Q1", logical: "B", physical: 2 }], bindings: [] }
  );
  const withProfile = applyProfilesToState(state, [profile]);
  assert.ok(withProfile.components.some((component) => component.ref === "Q1"));
  assert.equal(collectPendingParts(state).some((part) => part.value === "2N2222A"), true);
});

test("user package store round-trips pin activity metadata", () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    }
  });
  try {
    saveUserPackage(draft());
    const [saved] = loadUserPackages();
    assert.ok(saved);
    assert.deepEqual(saved.shapes[0], {
      id: "p1", kind: "pin", hole: [4, 4], bendRange: 2, bendDirection: "+z"
    });
    assert.deepEqual(saved.shapes[1], {
      id: "p2", kind: "pin", hole: [7, 4], bendRange: 1, bendDirection: "-x"
    });
    deleteUserPackage(saved.id);
    assert.equal(loadUserPackages().length, 0);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("collision footprint translates geometry and detects body/pin overlap", () => {
  const component = createUserPackageComponent(draft(), [10, 10]);
  assert.ok(component);
  const footprint = componentFootprint(component!);
  assert.equal(footprint.bodyCells.has("11,10"), true);
  assert.equal(footprint.pinCells.has("13,10"), true);
  assert.equal(footprint.cells.has("11,10"), true);

  const translated = cellsAt(component!, [20, 10]);
  assert.equal(translated.has("21,10"), true);
  assert.equal(translated.has("23,10"), true);

  const overlapping = { ...component!, id: "overlap", position: [10, 10] as [number, number] };
  const clear = { ...component!, id: "clear", position: [18, 10] as [number, number] };
  assert.equal(componentsOverlap(component!, overlapping), true);
  assert.equal(componentsOverlap(component!, clear), false);
});

test("bending a user package pin moves only its pin cells", () => {
  const component = createUserPackageComponent(draft(), [10, 10]);
  assert.ok(component);
  const before = componentFootprint(component!);
  const bent = bendUserPackagePin(component!, 1, 2);
  assert.ok(bent);
  const after = componentFootprint(bent!);
  assert.deepEqual([...after.bodyCells].sort(), [...before.bodyCells].sort());
  assert.equal(after.pinCells.has("10,12"), true);
  assert.equal(after.pinCells.has("10,10"), false);
});

test("the placed pin models consume the current pin offsets", () => {
  const component = createUserPackageComponent(draft(), [10, 10]);
  assert.ok(component);
  const model = createUserPackageModel(component!.userPackage!, [[0, 2], [3, 0]]);
  const pinMeshes = model.children.filter((child) => typeof child.userData.pinIndex === "number");
  assert.equal(pinMeshes.length, 2);
  assert.equal(pinMeshes[0].position.x, 0);
  assert.equal(pinMeshes[0].position.z, 2);
  assert.equal(pinMeshes[1].position.x, 3);
  assert.equal(pinMeshes[1].position.z, 0);
});

test("all four user pin directions are distinct", () => {
  for (const direction of ["+x", "-x", "+z", "-z"] as const) {
    const source = draft();
    const pin = source.shapes[0];
    assert.equal(pin.kind, "pin");
    if (pin.kind !== "pin") continue;
    pin.bendRange = 2;
    pin.bendDirection = direction;
    const component = createUserPackageComponent(source, [10, 10]);
    assert.ok(component);
    const bent = bendUserPackagePin(component!, 1, 1);
    assert.ok(bent);
    const expected = direction.endsWith("x")
      ? (direction === "+x" ? [1, 0] : [-1, 0])
      : (direction === "+z" ? [0, 1] : [0, -1]);
    assert.deepEqual(bent.pinOffsets[0], expected);
  }
});
