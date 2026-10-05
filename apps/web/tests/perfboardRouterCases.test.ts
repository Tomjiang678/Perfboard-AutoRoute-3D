import assert from "node:assert/strict";
import test from "node:test";
import { autoRouteBoard, validateRoutingResult } from "../src/features/routing/autoRouter.ts";
import { normalizeBoardDefinition } from "../src/features/board/factory.ts";
import { manhattan } from "../src/features/routing/routingGeometry.ts";
import type { DesignConstraint, PlacedComponent, RoutedNetEndpoint, RoutingState } from "../src/types/project.ts";

function board() {
  return normalizeBoardDefinition({ kind: "perfboard", width: 30, height: 20 });
}

function endpoint(net: string, ref: string, pin: number, grid: [number, number], role = "X"): RoutedNetEndpoint {
  return { net, ref, pin, grid, role };
}

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

function route(boardSize: ReturnType<typeof board>, endpoints: RoutedNetEndpoint[], components: PlacedComponent[] = [], constraints: DesignConstraint[] = []) {
  const routing = autoRouteBoard(boardSize, endpoints, components, [], constraints);
  return { routing, validation: validateRoutingResult(boardSize, routing, endpoints, components) };
}

test("a two-pin net becomes a single straight trace", () => {
  const endpoints = [endpoint("N1", "A", 1, [5, 3]), endpoint("N1", "B", 1, [9, 3])];
  const { routing, validation } = route(board(), endpoints, []);
  assert.equal(routing.traces.length, 1);
  assert.equal(validation.drc.errors.length, 0);
  const points = routing.traces[0].points;
  assert.equal(manhattan(points[0], points.at(-1)!), 4);
});

test("all trace segments are one-grid-step long after expansion", () => {
  const endpoints = [endpoint("N1", "A", 1, [2, 2]), endpoint("N1", "B", 1, [20, 18])];
  const { routing } = route(board(), endpoints, []);
  for (const trace of routing.traces) {
    for (let index = 1; index < trace.points.length; index += 1) {
      assert.equal(manhattan(trace.points[index - 1], trace.points[index]), 1);
    }
  }
});

for (const pinCount of [3, 4, 5]) {
  test(`a ${pinCount}-pin net is fully connected by bottom traces`, () => {
    const endpoints = Array.from({ length: pinCount }, (_, i) => endpoint("N1", `P${i + 1}`, 1, [2 + i * 6, 2 + (i % 3) * 6]));
    const { validation } = route(board(), endpoints, []);
    assert.equal(validation.drc.errors.length, 0);
    assert.ok(validation.drc.pinStatuses.every((status) => status.status === "CONNECTED"));
  });
}

for (let nets = 2; nets <= 5; nets += 1) {
  test(`${nets} independent nets route without shorts`, () => {
    const endpoints: RoutedNetEndpoint[] = [];
    for (let n = 0; n < nets; n += 1) {
      endpoints.push(endpoint(`N${n}`, `A${n}`, 1, [2 + n * 2, 2]));
      endpoints.push(endpoint(`N${n}`, `B${n}`, 1, [2 + n * 2, 16]));
    }
    const { validation } = route(board(), endpoints, []);
    assert.equal(validation.drc.errors.length, 0);
    assert.ok(validation.drc.pinStatuses.every((status) => status.status === "CONNECTED"));
  });
}

test("traces never pass through component pin holes", () => {
  const endpoints = [endpoint("N1", "A", 1, [2, 2]), endpoint("N1", "B", 1, [20, 2])];
  const blockers = [pinComponent("X1", [10, 2]), pinComponent("X2", [11, 2])];
  const { routing } = route(board(), endpoints, blockers);
  const blocked = new Set(blockers.map((component) => component.position.join(",")));
  for (const trace of routing.traces) {
    for (const point of trace.points) {
      assert.ok(!blocked.has(point.join(",")), `trace crosses pin hole ${point}`);
    }
  }
});

test("traces stay inside the board", () => {
  const endpoints = [
    endpoint("N1", "A", 1, [0, 0]), endpoint("N1", "B", 1, [29, 19]),
    endpoint("N2", "C", 1, [0, 19]), endpoint("N2", "D", 1, [29, 0])
  ];
  const { routing } = route(board(), endpoints, []);
  for (const trace of routing.traces) {
    for (const [x, y] of trace.points) {
      assert.ok(x >= 0 && x < 30 && y >= 0 && y < 20, `point ${x},${y} out of board`);
    }
  }
});

test("locked traces survive re-routing", () => {
  const endpoints = [endpoint("N1", "A", 1, [5, 3]), endpoint("N1", "B", 1, [9, 3]), endpoint("N1", "C", 1, [5, 9])];
  const fixed: RoutingState["traces"] = [{
    id: "locked-trace", net: "N1",
    points: [[5, 3], [6, 3], [7, 3], [8, 3], [9, 3]],
    locked: true
  }];
  const routing = autoRouteBoard(board(), endpoints, [], fixed);
  assert.ok(routing.traces.some((trace) => trace.id === "locked-trace" && trace.locked));
  const validation = validateRoutingResult(board(), routing, endpoints, []);
  assert.ok(validation.drc.pinStatuses.every((status) => status.status === "CONNECTED"));
});

test("region keepout blocks bottom traces from crossing", () => {
  const constraint: DesignConstraint = {
    id: "keep", kind: "region_keepout", strength: "hard",
    status: "active", enabled: true, sourceText: "", explanation: "keep", createdAt: "",
    region: { x: 10, y: 5, width: 6, height: 6 },
    blockPlacement: false, blockBottomRouting: true, blockJumpers: false
  };
  const endpoints = [endpoint("N1", "A", 1, [4, 8]), endpoint("N1", "B", 1, [24, 8])];
  const { routing } = route(board(), endpoints, [], [constraint]);
  for (const trace of routing.traces) {
    for (const [x, y] of trace.points) {
      const inside = x >= 10 && x < 16 && y >= 5 && y < 11;
      assert.ok(!inside, `trace point ${x},${y} inside keepout`);
    }
  }
});

test("endpoints outside the board fail routing and DRC", () => {
  const endpoints = [endpoint("N1", "A", 1, [2, 2]), endpoint("N1", "B", 1, [40, 3])];
  const { routing, validation } = route(board(), endpoints, []);
  assert.ok(validation.drc.errors.some((issue) => issue.code === "INVALID_BOARD_HOLE"));
  assert.ok(routing.failedNets.includes("N1") || validation.drc.pinStatuses.some((status) => status.status !== "CONNECTED"));
});

test("routing is deterministic for identical inputs (same geometry)", () => {
  const endpoints = [endpoint("N1", "A", 1, [3, 3]), endpoint("N1", "B", 1, [17, 13]), endpoint("N2", "C", 1, [3, 13]), endpoint("N2", "D", 1, [17, 3])];
  const first = autoRouteBoard(board(), endpoints, []);
  const second = autoRouteBoard(board(), endpoints, []);
  assert.deepEqual(first.traces.map((trace) => trace.points), second.traces.map((trace) => trace.points));
});

test("a mixed circuit routes on perfboard without DRC errors", () => {
  const endpoints = [
    endpoint("N1", "R1", 1, [2, 2]), endpoint("N1", "R1", 2, [8, 2]),
    endpoint("N2", "C1", 1, [8, 4]), endpoint("N2", "U1", 2, [14, 4]),
    endpoint("N3", "U1", 3, [14, 6]), endpoint("N3", "D1", 2, [20, 6]),
    endpoint("GND", "U1", 4, [14, 10]), endpoint("GND", "R2", 1, [2, 10]), endpoint("GND", "C2", 1, [8, 10]),
    endpoint("VCC", "U1", 8, [14, 14]), endpoint("VCC", "R2", 2, [2, 14])
  ];
  const { validation } = route(board(), endpoints, []);
  assert.equal(validation.drc.errors.length, 0);
  assert.ok(validation.drc.pinStatuses.every((status) => status.status === "CONNECTED"));
});

for (let run = 1; run <= 6; run += 1) {
  test(`perfboard corner stress case ${run} stays short-free`, () => {
    const corners: Array<[number, number]> = [[0, 0], [29, 0], [0, 19], [29, 19]];
    const shuffled = [...corners].sort(() => 0.5 - (run % 2));
    const endpoints = shuffled.map((grid, index) => endpoint(`N${index % 2}`, `P${index}`, 1, grid));
    const { validation } = route(board(), endpoints, []);
    const shorts = validation.drc.errors.filter((issue) => issue.code === "SHORT_BETWEEN_NETS");
    assert.equal(shorts.length, 0);
  });
}

test("empty endpoint list yields an empty routing", () => {
  const { routing, validation } = route(board(), [], []);
  assert.equal(routing.traces.length, 0);
  assert.equal(validation.drc.pinStatuses.length, 0);
});
