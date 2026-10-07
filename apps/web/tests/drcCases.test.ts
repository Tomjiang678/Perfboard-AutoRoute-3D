import assert from "node:assert/strict";
import test from "node:test";
import { validateRoutingResult } from "../src/features/routing/autoRouter.ts";
import { createBreadboardDefinition } from "../src/features/board/breadboard.ts";
import { normalizeBoardDefinition } from "../src/features/board/factory.ts";
import type { BottomTrace, JumperRoute, PlacedComponent, RoutedNetEndpoint, RoutingState } from "../src/types/project.ts";

const breadboard = createBreadboardDefinition(24, 1);
const perfboard = normalizeBoardDefinition({ kind: "perfboard", width: 30, height: 20 });

function jumper(id: string, net: string, from: [number, number], to: [number, number]): JumperRoute {
  return { id, net, from, to };
}

function trace(net: string, points: Array<[number, number]>): BottomTrace {
  return {
    id: `t-${net}-${points[0]?.join("_")}`,
    net,
    points,
    edges: points.slice(1).map((point, index) => [points[index], point] as [[number, number], [number, number]])
  };
}

function routingWith(jumpers: JumperRoute[] = [], traces: BottomTrace[] = []): RoutingState {
  return { traces, jumpers, failedNets: [], warnings: [] };
}

function endpoint(net: string, ref: string, pin: number, grid: [number, number], role = "X"): RoutedNetEndpoint {
  return { net, ref, pin, grid, role };
}

/** A single-pin physical component placed exactly on `grid` (pin 1). */
function pinComponent(ref: string, grid: [number, number]): PlacedComponent {
  return {
    id: `id-${ref}`,
    kind: "pin_header",
    label: ref,
    name: ref,
    value: "",
    pinCount: 1,
    leadSpacing: 1,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0]],
    position: grid,
    rotation: 0,
    mounted: true
  };
}

function run(board: typeof breadboard, routing: RoutingState, endpoints: RoutedNetEndpoint[] = [], components: PlacedComponent[] = []) {
  return validateRoutingResult(board, routing, endpoints, components);
}

/* ── breadboard jumper endpoint validity ──────────────────────────────── */

for (const hole of [[8, 4], [9, 4], [2, 4], [15, 4], [0, 5], [30, 0]] as Array<[number, number]>) {
  test(`jumper endpoint ${hole} on a non-hole reports JUMPER_ENDPOINT_INVALID_HOLE`, () => {
    const result = run(breadboard, routingWith([jumper("j1", "N1", hole, [3, 10])]));
    assert.ok(result.drc.errors.some((issue) => issue.code === "JUMPER_ENDPOINT_INVALID_HOLE"));
  });
}

test("jumper endpoints on valid terminal holes produce no endpoint errors", () => {
  const result = run(breadboard, routingWith([jumper("j1", "N1", [3, 2], [3, 10])]));
  assert.equal(result.drc.errors.length, 0);
});

test("jumper landing on a component pin hole reports JUMPER_ENDPOINT_OCCUPIED", () => {
  const component = pinComponent("R1", [3, 6]);
  const result = run(breadboard, routingWith([jumper("j1", "N1", [3, 2], [3, 6])]), [], [component]);
  assert.ok(result.drc.errors.some((issue) => issue.code === "JUMPER_ENDPOINT_OCCUPIED"));
});

test("two jumpers sharing one endpoint hole report JUMPER_ENDPOINT_OCCUPIED", () => {
  const routing = routingWith([
    jumper("j1", "N1", [3, 2], [3, 8]),
    jumper("j2", "N2", [3, 8], [4, 10])
  ]);
  const result = run(breadboard, routing);
  assert.ok(result.drc.errors.some((issue) => issue.code === "JUMPER_ENDPOINT_OCCUPIED"));
});

for (const [from, to, label] of [
  [[3, 2], [5, 2], "same terminal node"],
  [[3, 2], [7, 2], "same bank row"],
  [[0, 2], [0, 10], "same rail"]
] as Array<[[number, number], [number, number], string]>) {
  test(`jumper with both ends on ${label} warns JUMPER_SAME_ELECTRICAL_NODE`, () => {
    const result = run(breadboard, routingWith([jumper("j1", "N1", from, to)]));
    assert.ok(result.drc.warnings.some((issue) => issue.code === "JUMPER_SAME_ELECTRICAL_NODE"));
    assert.equal(result.drc.errors.length, 0);
  });
}

test("jumper bridging two different nodes is clean", () => {
  const result = run(breadboard, routingWith([jumper("j1", "N1", [3, 2], [4, 4])]));
  assert.equal(result.drc.errors.length, 0);
  assert.equal(result.drc.warnings.length, 0);
});

/* ── breadboard connectivity propagation ──────────────────────────────── */

test("pins on the same breadboard node connect through the board itself", () => {
  const components = [pinComponent("A", [3, 2]), pinComponent("B", [5, 2]), pinComponent("C", [3, 12])];
  const endpoints = [endpoint("N1", "A", 1, [3, 2]), endpoint("N1", "B", 1, [5, 2]), endpoint("N1", "C", 1, [3, 12])];
  const routing = routingWith([jumper("j1", "N1", [4, 2], [4, 12])]);
  const result = run(breadboard, routing, endpoints, components);
  assert.ok(result.drc.pinStatuses.every((status) => status.status === "CONNECTED"));
});

test("pins on different nodes without a jumper stay unconnected", () => {
  const components = [pinComponent("A", [3, 2]), pinComponent("B", [3, 12])];
  const endpoints = [endpoint("N1", "A", 1, [3, 2]), endpoint("N1", "B", 1, [3, 12])];
  const result = run(breadboard, routingWith([]), endpoints, components);
  assert.ok(result.drc.pinStatuses.some((status) => status.status === "REQUIRED_UNCONNECTED"));
});

test("a jumper between two different nets' nodes is reported as a short", () => {
  const components = [pinComponent("A", [3, 2]), pinComponent("B", [4, 2])];
  const endpoints = [endpoint("N1", "A", 1, [3, 2]), endpoint("N2", "B", 1, [4, 2])];
  const routing = routingWith([jumper("j1", "N1", [3, 2], [4, 2])]);
  const result = run(breadboard, routing, endpoints, components);
  assert.ok(result.drc.pinStatuses.some((status) => status.status === "WRONG_NET_SHORT"));
});

test("pins without any net report NO_NET_UNUSED without errors", () => {
  const result = run(breadboard, routingWith([]), [], [pinComponent("C", [4, 8])]);
  assert.equal(result.drc.pinStatuses[0]?.status, "NO_NET_UNUSED");
  assert.equal(result.drc.errors.length, 0);
});

test("non-power nets on rail holes report POWER_RAIL_NET_REQUIRED", () => {
  const component = pinComponent("U1", [0, 2]);
  const endpoints = [endpoint("SIG", "U1", 1, [0, 2])];
  const result = run(breadboard, routingWith([]), endpoints, [component]);
  assert.ok(result.drc.errors.some((issue) => issue.code === "POWER_RAIL_NET_REQUIRED"));
});

/* ── perfboard traces ─────────────────────────────────────────────────── */

test("perfboard trace connecting two pins is clean", () => {
  const components = [pinComponent("A", [5, 3]), pinComponent("B", [9, 3])];
  const endpoints = [endpoint("N1", "A", 1, [5, 3]), endpoint("N1", "B", 1, [9, 3])];
  const routing = routingWith([], [trace("N1", [[5, 3], [6, 3], [7, 3], [8, 3], [9, 3]])]);
  const result = run(perfboard, routing, endpoints, components);
  assert.equal(result.drc.errors.length, 0);
  assert.ok(result.drc.pinStatuses.every((status) => status.status === "CONNECTED"));
});

test("perfboard perpendicular traces of different nets short at the shared cell", () => {
  const endpoints = [
    endpoint("N1", "A", 1, [5, 3]), endpoint("N1", "B", 1, [9, 3]),
    endpoint("N2", "C", 1, [7, 1]), endpoint("N2", "D", 1, [7, 5])
  ];
  const routing = routingWith([], [
    trace("N1", [[5, 3], [9, 3]]),
    trace("N2", [[7, 1], [7, 5]])
  ]);
  const result = run(perfboard, routing, endpoints);
  assert.ok(result.drc.errors.some((issue) => issue.code === "SHORT_BETWEEN_NETS"));
});

test("two overlapping traces of different nets report SHORT_BETWEEN_NETS", () => {
  const endpoints = [
    endpoint("N1", "A", 1, [5, 3]), endpoint("N1", "B", 1, [9, 3]),
    endpoint("N2", "C", 1, [6, 3]), endpoint("N2", "D", 1, [10, 3])
  ];
  const routing = routingWith([], [
    trace("N1", [[5, 3], [9, 3]]),
    trace("N2", [[6, 3], [10, 3]])
  ]);
  const result = run(perfboard, routing, endpoints);
  assert.ok(result.drc.errors.some((issue) => issue.code === "SHORT_BETWEEN_NETS"));
});

test("two component pins in one hole report HOLE_OCCUPIED", () => {
  const result = run(perfboard, routingWith([]), [], [pinComponent("A", [5, 3]), pinComponent("B", [5, 3])]);
  assert.ok(result.drc.errors.some((issue) => issue.code === "HOLE_OCCUPIED"));
});

test("two pins in one hole report HOLE_OCCUPIED even when they share a net", () => {
  const endpoints = [endpoint("N1", "A", 1, [5, 3]), endpoint("N1", "B", 1, [5, 3])];
  const result = run(perfboard, routingWith([]), endpoints, [pinComponent("A", [5, 3]), pinComponent("B", [5, 3])]);
  assert.ok(result.drc.errors.some((issue) => issue.code === "HOLE_OCCUPIED"));
});

test("two pins in one hole are reported on the breadboard as well", () => {
  const result = run(breadboard, routingWith([]), [], [pinComponent("A", [3, 5]), pinComponent("B", [3, 5])]);
  assert.ok(result.drc.errors.some((issue) => issue.code === "HOLE_OCCUPIED"));
});

test("an endpoint outside the board reports INVALID_BOARD_HOLE", () => {
  const endpoints = [endpoint("N1", "A", 1, [40, 3])];
  const result = run(perfboard, routingWith([]), endpoints, [pinComponent("A", [40, 3])]);
  assert.ok(result.drc.errors.some((issue) => issue.code === "INVALID_BOARD_HOLE"));
});

test("unrouted pins report NET_PIN_UNROUTED", () => {
  const components = [pinComponent("A", [5, 3]), pinComponent("B", [9, 3])];
  const endpoints = [endpoint("N1", "A", 1, [5, 3]), endpoint("N1", "B", 1, [9, 3])];
  const result = run(perfboard, routingWith([]), endpoints, components);
  assert.ok(result.drc.pinStatuses.some((status) => status.status === "NET_PIN_UNROUTED"));
  assert.ok(result.drc.errors.some((issue) => issue.code === "NET_PIN_UNROUTED"));
});

/* ── pin name passthrough ─────────────────────────────────────────────── */

test("pin names flow into statuses from endpoint roles", () => {
  const component = pinComponent("U1", [3, 2]);
  const endpoints = [endpoint("N1", "U1", 1, [3, 2], "1OUT")];
  const result = run(breadboard, routingWith([jumper("j1", "N1", [3, 2], [4, 2])]), endpoints, [component]);
  assert.equal(result.drc.pinStatuses[0]?.pinName, "1OUT");
});

/* ── MANUAL net handling (perfboard) ──────────────────────────────────── */

test("MANUAL net traces are excluded from net-specific checks", () => {
  const endpoints = [endpoint("N1", "A", 1, [5, 3])];
  const routing = routingWith([], [trace("MANUAL", [[1, 1], [3, 1]])]);
  const result = run(perfboard, routing, endpoints);
  assert.equal(result.drc.errors.length, 0);
});
