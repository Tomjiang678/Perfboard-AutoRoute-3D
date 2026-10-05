import assert from "node:assert/strict";
import test from "node:test";
import { resolveNetEndpoints } from "../src/features/import/netEndpointResolver.ts";
import { removeRoutesToComponent } from "../src/features/routing/removeComponentRoutes.ts";
import { isCenterBridgeComponent } from "../src/features/project/componentTraits.ts";
import { componentPinHoles } from "../src/features/board/placement.ts";
import type { ImportState, PlacedComponent, RoutingState } from "../src/types/project.ts";

function dip(name: string, position: [number, number], rotation = 0): PlacedComponent {
  return {
    id: `id-${name}`, kind: "dip", label: name, name, value: "LM358",
    pinCount: 8, leadSpacing: 3, rowSpacing: 3, sameSidePitch: 1,
    pinOffsets: [[0, 0], [0, 1], [0, 2], [0, 3], [3, 3], [3, 2], [3, 1], [3, 0]],
    position, rotation, mounted: true
  };
}

function state(components: PlacedComponent[], nets: ImportState["nets"], pinInfo: ImportState["pinInfo"] = {}): ImportState {
  return { components: [], nets, warnings: [], pinInfo };
}

test("nodes map to physical pin grids", () => {
  const components = [dip("U1", [7, 10])];
  const importState = state(components, [
    { name: "SIG", nodes: [{ ref: "U1", pin: "1" }, { ref: "U1", pin: "8" }] }
  ], { U1: { "1": { name: "1OUT" }, "8": { name: "V+" } } });
  const endpoints = resolveNetEndpoints(importState, components);
  assert.equal(endpoints.length, 2);
  const pin1 = endpoints.find((endpoint) => endpoint.pin === 1)!;
  const pin8 = endpoints.find((endpoint) => endpoint.pin === 8)!;
  assert.deepEqual(pin1.grid, [7, 10]);
  assert.deepEqual(pin8.grid, [10, 10]);
  assert.equal(pin1.role, "1OUT");
  assert.equal(pin8.role, "V+");
});

test("rotated components resolve rotated pin positions", () => {
  const components = [dip("U1", [7, 10], Math.PI)];
  const importState = state(components, [{ name: "SIG", nodes: [{ ref: "U1", pin: "1" }] }]);
  const endpoints = resolveNetEndpoints(importState, components);
  assert.deepEqual(endpoints[0].grid, [7, 10]);
});

test("non-numeric pins yield no endpoints", () => {
  const components = [dip("U1", [7, 10])];
  const importState = state(components, [{ name: "SIG", nodes: [{ ref: "U1", pin: "B" }] }]);
  assert.equal(resolveNetEndpoints(importState, components).length, 0);
});

test("unknown refs are skipped", () => {
  const components = [dip("U1", [7, 10])];
  const importState = state(components, [{ name: "SIG", nodes: [{ ref: "U99", pin: "1" }] }]);
  assert.equal(resolveNetEndpoints(importState, components).length, 0);
});

test("pins without a net do not produce endpoints", () => {
  const components = [dip("U1", [7, 10])];
  const importState = state(components, []);
  assert.equal(resolveNetEndpoints(importState, components).length, 0);
});

test("numeric pins resolve without pinInfo", () => {
  const components = [dip("U1", [7, 10])];
  const importState = state(components, [{ name: "SIG", nodes: [{ ref: "U1", pin: "2" }] }]);
  const endpoints = resolveNetEndpoints(importState, components);
  assert.equal(endpoints.length, 1);
  assert.deepEqual(endpoints[0].grid, [7, 11]);
  assert.equal(endpoints[0].role, "2");
});

test("a pin in two different nets produces two endpoints", () => {
  const components = [dip("U1", [7, 10])];
  const importState = state(components, [
    { name: "A", nodes: [{ ref: "U1", pin: "1" }] },
    { name: "B", nodes: [{ ref: "U1", pin: "1" }] }
  ]);
  assert.equal(resolveNetEndpoints(importState, components).length, 2);
});

/* ── removeRoutesToComponent ──────────────────────────────────────────── */

test("removeRoutesToComponent strips traces and jumpers touching the pins", () => {
  const component = dip("U1", [7, 10]);
  const routing: RoutingState = {
    traces: [
      { id: "t1", net: "N1", points: [[7, 10], [7, 12]] },
      { id: "t2", net: "N2", points: [[1, 1], [3, 1]] }
    ],
    jumpers: [
      { id: "j1", net: "N1", from: [10, 13], to: [12, 13] },
      { id: "j2", net: "N3", from: [20, 20], to: [21, 20] }
    ],
    failedNets: [],
    warnings: []
  };
  const deletedCells = componentPinHoles(component);
  const next = removeRoutesToComponent(routing, deletedCells, []);
  assert.deepEqual(next.traces.map((trace) => trace.id), ["t2"]);
  assert.deepEqual(next.jumpers.map((item) => item.id), ["j2"]);
});

test("removeRoutesToComponent keeps everything when nothing touches", () => {
  const component = dip("U1", [7, 10]);
  const routing: RoutingState = {
    traces: [{ id: "t1", net: "N1", points: [[1, 1], [3, 1]] }],
    jumpers: [{ id: "j1", net: "N1", from: [20, 20], to: [21, 20] }],
    failedNets: [],
    warnings: []
  };
  const deletedCells = componentPinHoles(component);
  const next = removeRoutesToComponent(routing, deletedCells, []);
  assert.equal(next.traces.length, 1);
  assert.equal(next.jumpers.length, 1);
});

/* ── component traits ─────────────────────────────────────────────────── */

for (const [kind, expected] of [
  ["dip", true],
  ["dip_switch", true],
  ["resistor", false],
  ["pin_header", false],
  ["seven_segment_display", true]
] as Array<[PlacedComponent["kind"], boolean]>) {
  test(`isCenterBridgeComponent(${kind}) = ${expected}`, () => {
    assert.equal(isCenterBridgeComponent({ ...dip("X", [0, 0]), kind }), expected);
  });
}
