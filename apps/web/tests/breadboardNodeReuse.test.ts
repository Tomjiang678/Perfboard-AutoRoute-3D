import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { autoPlaceComponents } from "../src/features/layout/autoPlacement.ts";
import { autoRouteBoard } from "../src/features/routing/autoRouter.ts";
import { createBreadboardDefinition } from "../src/features/board/breadboard.ts";
import { getBoardModel } from "../src/features/board/factory.ts";
import { componentPinHoles } from "../src/features/board/placement.ts";
import { resolveNetEndpoints } from "../src/features/import/netEndpointResolver.ts";
import { parseKicadNetlist } from "../src/features/import/kicadNetlistParser.ts";
import { createPlacedComponentsFromParsed } from "../src/features/import/componentMapping.ts";
import type { BoardSize, ImportState, PlacedComponent } from "../src/types/project.ts";

/** Places every component, then routes the result, on a breadboard. */
function placeAndRoute(importState: ImportState, board: BoardSize) {
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
  return { components: placed.components, endpoints: finalEndpoints, routing };
}

/** net -> number of distinct electrical nodes its pins occupy. */
function nodesPerNet(components: PlacedComponent[], endpoints: ReturnType<typeof resolveNetEndpoints>, board: BoardSize) {
  const boardModel = getBoardModel(board);
  const result = new Map<string, Set<string>>();
  components.forEach((component) => {
    const netByPin = new Map<string, string>();
    endpoints.filter((endpoint) => endpoint.ref === component.name).forEach((endpoint) => netByPin.set(`${endpoint.pin}`, endpoint.net));
    componentPinHoles(component).forEach((hole, index) => {
      const net = netByPin.get(`${index + 1}`);
      const node = net ? boardModel.getElectricalNode(hole) : undefined;
      if (!net || !node) return;
      const nodes = result.get(net) ?? new Set<string>();
      nodes.add(node);
      result.set(net, nodes);
    });
  });
  return result;
}

function twoResistorState(): ImportState {
  return {
    components: [
      { ref: "R1", value: "R", category: "Device:R", packageName: "", sourceFile: "s.net" },
      { ref: "R2", value: "R", category: "Device:R", packageName: "", sourceFile: "s.net" }
    ],
    nets: [
      { name: "N1", nodes: [{ ref: "R1", pin: "1" }, { ref: "R2", pin: "1" }] },
      { name: "N2", nodes: [{ ref: "R1", pin: "2" }, { ref: "R2", pin: "2" }] }
    ],
    warnings: [],
    pinInfo: { R1: { "1": {}, "2": {} }, R2: { "1": {}, "2": {} } }
  };
}

test("same-net pins are placed on one shared row, needing zero jumpers", () => {
  const board = createBreadboardDefinition(40, 1);
  const { components, endpoints, routing } = placeAndRoute(twoResistorState(), board);
  assert.equal(routing.jumpers.length, 0);
  const nodes = nodesPerNet(components, endpoints, board);
  assert.equal(nodes.get("N1")?.size, 1);
  assert.equal(nodes.get("N2")?.size, 1);
});

test("shared-node placement survives a rerun deterministically", () => {
  const board = createBreadboardDefinition(40, 1);
  const first = placeAndRoute(twoResistorState(), board);
  const second = placeAndRoute(twoResistorState(), board);
  assert.deepEqual(
    first.components.map((component) => [component.name, component.position, component.rotation]),
    second.components.map((component) => [component.name, component.position, component.rotation])
  );
});

test("unrelated components still keep clear of each other", () => {
  const board = createBreadboardDefinition(40, 1);
  const importState: ImportState = {
    components: [
      { ref: "R1", value: "R", category: "Device:R", packageName: "", sourceFile: "s.net" },
      { ref: "R2", value: "R", category: "Device:R", packageName: "", sourceFile: "s.net" }
    ],
    nets: [{ name: "N1", nodes: [{ ref: "R1", pin: "1" }] }, { name: "N2", nodes: [{ ref: "R2", pin: "1" }] }],
    warnings: [],
    pinInfo: { R1: { "1": {} }, R2: { "1": {} } }
  };
  const { components } = placeAndRoute(importState, board);
  const [first, second] = components;
  const distance = Math.abs(first.position[0] - second.position[0]) + Math.abs(first.position[1] - second.position[1]);
  assert.ok(distance >= 2, `unrelated parts ended up ${distance} cells apart`);
});

test("fixture circuits stay at or below their measured jumper budget", async () => {
  const cases: Array<[string, number]> = [["01_rc_filter.net", 1], ["07_atmega328_minimum.net", 12]];
  for (const [name, budget] of cases) {
    const text = await readFile(new URL(`../../../docs/test-netlists/${name}`, import.meta.url), "utf8");
    const bundle = parseKicadNetlist(text, name);
    const importState: ImportState = { components: bundle.components, nets: bundle.nets, warnings: bundle.warnings, pinInfo: bundle.pinInfo };
    const board = createBreadboardDefinition(60, 1);
    const { routing } = placeAndRoute(importState, board);
    assert.ok(routing.jumpers.length <= budget, `${name}: ${routing.jumpers.length} jumpers exceeds budget ${budget}`);
  }
});
