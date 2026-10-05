import assert from "node:assert/strict";
import test from "node:test";
import { parseKicadNetlist } from "../src/features/import/kicadNetlistParser.ts";
import { createPlacedComponentsFromParsed } from "../src/features/import/componentMapping.ts";
import { resolveNetEndpoints } from "../src/features/import/netEndpointResolver.ts";
import { autoRouteBoard, validateRoutingResult } from "../src/features/routing/autoRouter.ts";
import { autoPlaceComponents } from "../src/features/layout/autoPlacement.ts";
import { createBreadboardDefinition } from "../src/features/board/breadboard.ts";
import { normalizeBoardDefinition } from "../src/features/board/factory.ts";
import { generateCircuit } from "./helpers/netlistFactory.ts";
import type { BoardSize, ImportState } from "../src/types/project.ts";

function runPipeline(board: BoardSize, seed: number) {
  const circuit = generateCircuit(seed);
  const bundle = parseKicadNetlist(circuit.text, `seed-${seed}.net`);
  const importState: ImportState = {
    components: bundle.components,
    nets: bundle.nets,
    warnings: bundle.warnings,
    pinInfo: bundle.pinInfo
  };
  const components = createPlacedComponentsFromParsed(importState, [], board.width);
  const endpoints = resolveNetEndpoints(importState, components);
  const placed = autoPlaceComponents(
    components,
    { x: 0, y: 0, width: board.width, height: board.height },
    board.width,
    board.height,
    endpoints,
    [],
    undefined,
    board
  );
  const finalEndpoints = resolveNetEndpoints(importState, placed.components);
  const routing = autoRouteBoard(board, finalEndpoints, placed.components);
  return validateRoutingResult(board, routing, finalEndpoints, placed.components);
}

for (let seed = 1; seed <= 10; seed += 1) {
  test(`breadboard end-to-end seed ${seed} routes with zero red pins`, () => {
    const board = createBreadboardDefinition(40, 1);
    const result = runPipeline(board, seed);
    const reds = result.drc.pinStatuses.filter((status) => status.status !== "CONNECTED" && status.status !== "NO_NET_UNUSED");
    assert.equal(reds.length, 0, reds.map((s) => `${s.ref}.${s.pin} ${s.status}`).join("; "));
    assert.equal(result.drc.errors.length, 0);
  });
}

for (let seed = 1; seed <= 10; seed += 1) {
  test(`perfboard end-to-end seed ${seed} routes with zero red pins`, () => {
    const board = normalizeBoardDefinition({ kind: "perfboard", width: 40, height: 26 });
    const result = runPipeline(board, seed);
    const reds = result.drc.pinStatuses.filter((status) => status.status !== "CONNECTED" && status.status !== "NO_NET_UNUSED");
    assert.equal(reds.length, 0, reds.map((s) => `${s.ref}.${s.pin} ${s.status}`).join("; "));
    assert.equal(result.drc.errors.length, 0);
  });
}

test("generated circuit yields 4 real nets plus chain nets", () => {
  const circuit = generateCircuit(3);
  const bundle = parseKicadNetlist(circuit.text, "x.net");
  assert.ok(bundle.nets.some((net) => net.name === "GND"));
  assert.ok(bundle.nets.some((net) => net.name === "VCC"));
  assert.ok(bundle.nets.some((net) => net.name === "SIG"));
  assert.equal(bundle.components.length, 9);
});

test("generated op-amps resolve to DIP-8 with libpart pin names", () => {
  const circuit = generateCircuit(5);
  const bundle = parseKicadNetlist(circuit.text, "x.net");
  assert.equal(bundle.pinInfo.U1["4"].type, "power");
  assert.equal(bundle.pinInfo.U1["8"].name, "V+");
  const board = createBreadboardDefinition(40, 1);
  const importState: ImportState = { components: bundle.components, nets: bundle.nets, warnings: bundle.warnings, pinInfo: bundle.pinInfo };
  const components = createPlacedComponentsFromParsed(importState, [], board.width);
  const u1 = components.find((component) => component.name === "U1");
  assert.equal(u1?.kind, "dip");
  assert.equal(u1?.pinOffsets.length, 8);
  const endpoints = resolveNetEndpoints(importState, components);
  assert.ok(endpoints.some((item) => item.ref === "U1" && item.role === "V+"));
});

test("generated circuit uses no fallback placeholders", () => {
  const circuit = generateCircuit(7);
  const bundle = parseKicadNetlist(circuit.text, "x.net");
  const board = createBreadboardDefinition(40, 1);
  const importState: ImportState = { components: bundle.components, nets: bundle.nets, warnings: bundle.warnings, pinInfo: bundle.pinInfo };
  const components = createPlacedComponentsFromParsed(importState, [], board.width);
  assert.equal(components.some((component) => component.isFallback), false);
});
