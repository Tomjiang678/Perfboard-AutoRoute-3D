import assert from "node:assert/strict";
import test from "node:test";
import { autoRouteBoard, validateRoutingResult } from "../src/features/routing/autoRouter.ts";
import { createBreadboardDefinition } from "../src/features/board/breadboard.ts";
import type { DesignConstraint, PlacedComponent, RoutedNetEndpoint, RoutingState } from "../src/types/project.ts";

function board24() {
  return createBreadboardDefinition(24, 1);
}

function endpoint(net: string, ref: string, pin: number, grid: [number, number], role = "X"): RoutedNetEndpoint {
  return { net, ref, pin, grid, role };
}

function validate(board: ReturnType<typeof board24>, routing: RoutingState, endpoints: RoutedNetEndpoint[], components: PlacedComponent[] = []) {
  return validateRoutingResult(board, routing, endpoints, components);
}

/* ── basic routing invariants ─────────────────────────────────────────── */

test("a single two-pin net routes with one jumper and is fully connected", () => {
  const board = board24();
  const endpoints = [endpoint("N1", "R1", 1, [3, 2]), endpoint("N1", "R1", 2, [3, 14])];
  const routing = autoRouteBoard(board, endpoints, []);
  assert.equal(routing.jumpers.length, 1);
  const result = validate(board, routing, endpoints);
  assert.equal(result.drc.errors.length, 0);
  assert.ok(result.drc.pinStatuses.every((status) => status.status === "CONNECTED"));
});

test("two independent nets route without cross-net node sharing", () => {
  const board = board24();
  const endpoints = [
    endpoint("N1", "R1", 1, [3, 2]), endpoint("N1", "R1", 2, [3, 14]),
    endpoint("N2", "R2", 1, [4, 4]), endpoint("N2", "R2", 2, [4, 12])
  ];
  const routing = autoRouteBoard(board, endpoints, []);
  const result = validate(board, routing, endpoints);
  assert.equal(result.drc.errors.length, 0);
  assert.equal(result.drc.pinStatuses.filter((s) => s.status !== "CONNECTED").length, 0);
});

for (const holeCount of [3, 4, 5, 6]) {
  test(`a ${holeCount}-hole net routes into a single connected group`, () => {
    const board = board24();
    const endpoints = Array.from({ length: holeCount }, (_, i) =>
      endpoint("N1", `P${i + 1}`, 1, [3 + (i % 3), 2 + i * 4])
    );
    const routing = autoRouteBoard(board, endpoints, []);
    const result = validate(board, routing, endpoints);
    assert.equal(result.drc.errors.length, 0);
    assert.ok(result.drc.pinStatuses.every((status) => status.status === "CONNECTED"));
  });
}

test("no two jumpers of different nets share an endpoint hole", () => {
  const board = board24();
  const endpoints = [
    endpoint("N1", "A", 1, [3, 2]), endpoint("N1", "B", 1, [3, 14]),
    endpoint("N2", "C", 1, [3, 6]), endpoint("N2", "D", 1, [3, 12])
  ];
  const routing = autoRouteBoard(board, endpoints, []);
  const byHole = new Map<string, Set<string>>();
  for (const jumper of routing.jumpers) {
    for (const hole of [jumper.from, jumper.to]) {
      const key = hole.join(",");
      const nets = byHole.get(key) ?? new Set();
      nets.add(jumper.net);
      byHole.set(key, nets);
    }
  }
  for (const [hole, nets] of byHole) {
    assert.ok(nets.size === 1, `hole ${hole} shared by nets ${[...nets].join(",")}`);
  }
});

test("jumper endpoints never land on a pin hole", () => {
  const board = board24();
  const endpoints = [
    endpoint("N1", "A", 1, [3, 2]), endpoint("N1", "B", 1, [3, 14]),
    endpoint("N2", "C", 1, [4, 3]), endpoint("N2", "D", 1, [4, 13])
  ];
  const components: PlacedComponent[] = endpoints.map((item, index) => ({
    id: `c${index}`,
    kind: "pin_header",
    label: item.ref,
    name: item.ref,
    value: "",
    pinCount: 1,
    leadSpacing: 1,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0]],
    position: item.grid,
    rotation: 0,
    mounted: true
  }));
  const pinHoles = new Set(endpoints.map((e) => e.grid.join(",")));
  const routing = autoRouteBoard(board, endpoints, components);
  for (const jumper of routing.jumpers) {
    assert.ok(!pinHoles.has(jumper.from.join(",")), `${jumper.net} from ${jumper.from} is a pin hole`);
    assert.ok(!pinHoles.has(jumper.to.join(",")), `${jumper.net} to ${jumper.to} is a pin hole`);
  }
});

/* ── rails ────────────────────────────────────────────────────────────── */

test("power net endpoints may use rail holes", () => {
  const board = board24();
  const endpoints = [endpoint("VCC", "U1", 8, [0, 2]), endpoint("VCC", "U2", 8, [0, 14])];
  const routing = autoRouteBoard(board, endpoints, []);
  const result = validate(board, routing, endpoints);
  assert.ok(result.drc.pinStatuses.every((status) => status.status === "CONNECTED"));
});

test("non-power net pins on rail holes are reported by DRC", () => {
  const board = board24();
  const endpoints = [endpoint("SIG", "U1", 1, [0, 2]), endpoint("SIG", "U2", 1, [0, 14])];
  const components: PlacedComponent[] = endpoints.map((item, index) => ({
    id: `c${index}`,
    kind: "pin_header",
    label: item.ref,
    name: item.ref,
    value: "",
    pinCount: 1,
    leadSpacing: 1,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0]],
    position: item.grid,
    rotation: 0,
    mounted: true
  }));
  const routing = autoRouteBoard(board, endpoints, components);
  const result = validate(board, routing, endpoints, components);
  assert.ok(result.drc.errors.some((issue) => issue.code === "POWER_RAIL_NET_REQUIRED"));
});

/* ── locked jumpers ───────────────────────────────────────────────────── */

test("locked jumpers are preserved during re-routing", () => {
  const board = board24();
  const endpoints = [
    endpoint("N1", "A", 1, [3, 2]), endpoint("N1", "B", 1, [3, 14]),
    endpoint("N1", "C", 1, [4, 8])
  ];
  const locked: RoutingState["jumpers"] = [{
    id: "locked-1", net: "N1", from: [3, 2], to: [3, 8], locked: true
  }];
  const routing = autoRouteBoard(board, endpoints, [], [], [], undefined, locked);
  assert.ok(routing.jumpers.some((jumper) => jumper.id === "locked-1" && jumper.locked));
  const result = validate(board, routing, endpoints);
  assert.ok(result.drc.pinStatuses.every((status) => status.status === "CONNECTED"));
});

/* ── keepout constraints ──────────────────────────────────────────────── */

test("region keepout blocks jumper endpoints inside the region", () => {
  const board = board24();
  const endpoints = [endpoint("N1", "A", 1, [3, 2]), endpoint("N1", "B", 1, [3, 20])];
  const keepout: DesignConstraint = {
    id: "k1", kind: "region_keepout", strength: "hard",
    status: "active", enabled: true, sourceText: "", explanation: "keep", createdAt: new Date().toISOString(),
    region: { x: 3, y: 10, width: 1, height: 4 }, blockPlacement: false, blockBottomRouting: false, blockJumpers: true
  };
  const routing = autoRouteBoard(board, endpoints, [], [], [keepout]);
  for (const jumper of routing.jumpers) {
    for (const hole of [jumper.from, jumper.to]) {
      const inside = hole[0] >= 3 && hole[0] < 4 && hole[1] >= 10 && hole[1] < 14;
      assert.ok(!inside, `hole ${hole} inside keepout region`);
    }
  }
});

/* ── invalid holes / unconnected pins ─────────────────────────────────── */

test("endpoints on channel holes fail and are reported", () => {
  const board = board24();
  const endpoints = [endpoint("N1", "A", 1, [8, 2]), endpoint("N1", "B", 1, [3, 14])];
  const components: PlacedComponent[] = endpoints.map((item, index) => ({
    id: `c${index}`,
    kind: "pin_header",
    label: item.ref,
    name: item.ref,
    value: "",
    pinCount: 1,
    leadSpacing: 1,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0]],
    position: item.grid,
    rotation: 0,
    mounted: true
  }));
  const routing = autoRouteBoard(board, endpoints, components);
  const result = validate(board, routing, endpoints, components);
  assert.ok(result.drc.errors.some((issue) => issue.code === "INVALID_BOARD_HOLE"));
});

test("no-net pins stay unused without errors", () => {
  const board = board24();
  const endpoints = [endpoint("N1", "A", 1, [3, 2]), endpoint("N1", "B", 1, [3, 14])];
  const components: PlacedComponent[] = endpoints.map((item, index) => ({
    id: `c${index}`,
    kind: "pin_header",
    label: item.ref,
    name: item.ref,
    value: "",
    pinCount: 1,
    leadSpacing: 1,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0]],
    position: item.grid,
    rotation: 0,
    mounted: true
  }));
  components.push({
    id: "c-nc",
    kind: "pin_header",
    label: "C",
    name: "C",
    value: "",
    pinCount: 1,
    leadSpacing: 1,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0]],
    position: [4, 8],
    rotation: 0,
    mounted: true
  });
  const routing = autoRouteBoard(board, endpoints, components);
  const result = validate(board, routing, endpoints, components);
  const unused = result.drc.pinStatuses.find((s) => s.ref === "C");
  assert.equal(unused?.status, "NO_NET_UNUSED");
  assert.equal(result.drc.errors.length, 0);
});
