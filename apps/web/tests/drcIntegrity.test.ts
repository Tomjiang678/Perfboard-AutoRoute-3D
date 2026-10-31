import assert from "node:assert/strict";
import test from "node:test";
import { expandOrthogonalPath } from "../src/features/routing/routingGeometry.ts";
import { autoRouteBoard, validateRoutingResult } from "../src/features/routing/autoRouter.ts";
import { findUnmappedNetNodes } from "../src/features/import/netEndpointResolver.ts";
import { componentPinHoles, pinGridPosition } from "../src/features/board/placement.ts";
import { validateProjectShape } from "../src/features/project/projectValidation.ts";
import { applyNetlistCompleteness } from "../src/features/routing/netlistCompleteness.ts";
import type { BoardSize, DesignConstraint, ImportState, JumperRoute, PlacedComponent, RoutedNetEndpoint } from "../src/types/project.ts";

const BOARD: BoardSize = { width: 5, height: 5, kind: "perfboard" };

function dip(id: string, name: string, position: [number, number], adapter?: PlacedComponent["adapter"]): PlacedComponent {
  const pinOffsets: Array<[number, number]> = [];
  for (let i = 0; i < 7; i += 1) pinOffsets.push([0, i]);
  for (let i = 6; i >= 0; i -= 1) pinOffsets.push([3, i]);
  return {
    id,
    kind: "dip",
    label: name,
    name,
    value: "",
    pinCount: 14,
    leadSpacing: 1,
    rowSpacing: 3,
    sameSidePitch: 1,
    pinOffsets,
    position,
    rotation: 0,
    mounted: true,
    adapter
  };
}

function twoPin(id: string, position: [number, number]): PlacedComponent {
  return {
    id,
    kind: "resistor",
    label: id,
    name: id,
    value: "",
    leadSpacing: 2,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [2, 0]],
    position,
    rotation: 0,
    mounted: true
  };
}

const EMPTY_IMPORT: ImportState = { components: [], nets: [], warnings: [], pinInfo: {} };

test("路径展开遇到非整数坐标不会死循环", () => {
  const started = Date.now();
  const expanded = expandOrthogonalPath([[0, 0], [0.5, 0]] as Array<[number, number]>);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1000, `展开耗时 ${elapsed}ms，疑似死循环`);
  assert.ok(expanded.length <= 2);

  // 正常整数路径仍然完整展开
  assert.deepEqual(expandOrthogonalPath([[0, 0], [0, 3]]), [[0, 0], [0, 1], [0, 2], [0, 3]]);
});

test("走锡越出板外时 DRC 不再通过", () => {
  const trace = {
    id: "t1",
    net: "N1",
    points: [[0, 0], [0, -1], [4, -1], [4, 0]] as Array<[number, number]>,
    layer: "bottom" as const,
    locked: false
  };
  const routing = { traces: [trace], jumpers: [], failedNets: [], warnings: [] };
  const validation = validateRoutingResult(BOARD, routing, [], []);
  assert.equal(validation.drc.passed, false);
  assert.ok(validation.drc.errors.some((issue) => issue.code === "TRACE_OUT_OF_BOARD"));
});

test("网表里有板上不存在的元件或引脚时，能被单独列出来", () => {
  const importState: ImportState = {
    components: [],
    nets: [
      { name: "N1", nodes: [{ ref: "U1", pin: "1" }, { ref: "U9", pin: "1" }, { ref: "U1", pin: "99" }] }
    ] as ImportState["nets"],
    warnings: [],
    pinInfo: {}
  };
  const unmapped = findUnmappedNetNodes(importState, [dip("u1", "U1", [0, 0])]);
  assert.equal(unmapped.length, 2);
  assert.ok(unmapped.some((node) => node.ref === "U9" && node.reason === "missing_component"));
  assert.ok(unmapped.some((node) => node.ref === "U1" && node.reason === "pin_out_of_range"));
});

test("转接板排针占孔：即使存着脚数不匹配的历史数据，也按排针算冲突", () => {
  const chip = dip("u1", "U1", [0, 0], { pinCount: 16, width: 7, height: 10, rowSpacing: 6 });
  // 历史数据：14 脚芯片配了 16 脚板；迁移后会改回 14，但这里直接构造来验证占孔仍按排针算
  assert.equal(componentPinHoles(chip).length, 16);

  const spareHole = pinGridPosition(chip, 15);
  const resistor = twoPin("R1", spareHole);
  const routing = { traces: [], jumpers: [], failedNets: [], warnings: [] };
  const validation = validateRoutingResult(BOARD, routing, [], [chip, resistor]);
  assert.equal(validation.drc.passed, false);
  assert.ok(validation.drc.errors.some((issue) => issue.code === "HOLE_OCCUPIED"));
});

test("洞洞板自动布线保留锁定的手工跳线", () => {
  const jumper: JumperRoute = { id: "j1", net: "N1", from: [0, 0], to: [4, 0], locked: true };
  const result = autoRouteBoard(BOARD, [], [], [], [], undefined, [jumper]);
  assert.ok(result.jumpers.some((item) => item.id === "j1"), "锁定跳线被丢掉了");
});

test("压缩成两个端点的固定走锡，也会占住中间所有孔", () => {
  const board: BoardSize = { width: 10, height: 6, kind: "perfboard" };
  const fixedTrace = { id: "fixed-1", net: "GND", points: [[3, 2], [7, 2]] as Array<[number, number]>, layer: "bottom" as const, locked: true };
  const endpoints: RoutedNetEndpoint[] = [
    { net: "N1", ref: "U1", pin: 1, grid: [5, 0], role: "signal" },
    { net: "N1", ref: "U2", pin: 1, grid: [5, 4], role: "signal" }
  ];
  const result = autoRouteBoard(board, endpoints, [], [fixedTrace]);
  const n1Points = result.traces
    .filter((trace) => trace.net === "N1")
    .flatMap((trace) => expandOrthogonalPath(trace.points));
  assert.ok(
    !n1Points.some(([x, y]) => x === 5 && y === 2),
    "新走锡穿过了固定走锡的中间孔"
  );
});

test("已有走锡穿过硬禁布区会被报出来", () => {  const base = {
    id: "keep-1",
    strength: "hard" as const,
    status: "active" as const,
    enabled: true,
    sourceText: "这块区域不许走锡",
    explanation: "禁布区",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
  const keepout: DesignConstraint = {
    ...base,
    kind: "region_keepout",
    region: { x: 2, y: 0, width: 1, height: 5 },
    blockPlacement: false,
    blockBottomRouting: true,
    blockJumpers: false
  };
  const trace = { id: "t1", net: "N1", points: [[2, 0], [2, 4]] as Array<[number, number]>, layer: "bottom" as const, locked: true };
  const routing = { traces: [trace], jumpers: [], failedNets: [], warnings: [] };

  const withoutConstraints = validateRoutingResult(BOARD, routing, [], []);
  assert.equal(withoutConstraints.drc.passed, true);

  const withConstraints = validateRoutingResult(BOARD, routing, [], [], [keepout]);
  assert.equal(withConstraints.drc.passed, false);
  assert.ok(withConstraints.drc.errors.some((issue) => issue.code === "KEEPOUT_VIOLATION"));
});

test("路径含非法点时拒绝这条线路，而不是删掉坏点接着连", () => {
  const badTrace = {
    id: "t-bad",
    net: "N1",
    points: [[1, 1], [null, 3], [3, 1]] as unknown as Array<[number, number]>,
    layer: "bottom" as const,
    locked: false
  };
  // 展开不再"修复"数据
  assert.deepEqual(expandOrthogonalPath(badTrace.points), []);

  const routing = { traces: [badTrace], jumpers: [], failedNets: [], warnings: [] };
  const validation = validateRoutingResult(BOARD, routing, [], []);
  assert.equal(validation.drc.passed, false);
  assert.ok(validation.drc.errors.some((issue) => issue.code === "TRACE_INVALID_PATH"));
});

test("引脚号无法解析的节点（例如 A1）也算未映射", () => {
  const importState: ImportState = {
    components: [],
    nets: [{ name: "N1", nodes: [{ ref: "U1", pin: "A1" }, { ref: "U1", pin: "1" }] }] as ImportState["nets"],
    warnings: [],
    pinInfo: {}
  };
  const unmapped = findUnmappedNetNodes(importState, [dip("u1", "U1", [0, 0])]);
  assert.equal(unmapped.length, 1);
  assert.equal(unmapped[0].reason, "invalid_pin");
  assert.equal(unmapped[0].pin, "A1");
});

test("网表完整性检查能作用到任意 DRC 结果上（自动布线也走这条）", () => {
  const importState: ImportState = {
    components: [],
    nets: [{ name: "N1", nodes: [{ ref: "U1", pin: "1" }, { ref: "U9", pin: "1" }] }] as ImportState["nets"],
    warnings: [],
    pinInfo: {}
  };
  const cleanDrc = { passed: true, errors: [], warnings: [], pinStatuses: [] };
  const result = applyNetlistCompleteness(cleanDrc, importState, [dip("u1", "U1", [0, 0])]);
  assert.equal(result.drc.passed, false);
  assert.deepEqual(result.failedNets, ["N1"]);
  assert.ok(result.drc.errors.some((issue) => issue.code === "NETLIST_NODE_UNMAPPED"));

  const noMissing = applyNetlistCompleteness(cleanDrc, importState, [dip("u1", "U1", [0, 0]), dip("u9", "U9", [0, 0])]);
  assert.equal(noMissing.drc.passed, true);
  assert.deepEqual(noMissing.failedNets, []);
});

test("跳线穿过“禁止跳线”的硬禁布区也会被报出来", () => {
  const base = {
    id: "keep-2",
    strength: "hard" as const,
    status: "active" as const,
    enabled: true,
    sourceText: "这块区域不许跳线",
    explanation: "禁跳线区",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
  const keepout: DesignConstraint = {
    ...base,
    kind: "region_keepout",
    region: { x: 2, y: 2, width: 2, height: 2 },
    blockPlacement: false,
    blockBottomRouting: false,
    blockJumpers: true
  };
  const jumper: JumperRoute = { id: "j1", net: "N1", from: [2, 2], to: [3, 3], locked: true };
  const routing = { traces: [], jumpers: [jumper], failedNets: [], warnings: [] };

  const withoutConstraints = validateRoutingResult(BOARD, routing, [], []);
  assert.equal(withoutConstraints.drc.passed, true);

  const withConstraints = validateRoutingResult(BOARD, routing, [], [], [keepout]);
  assert.equal(withConstraints.drc.passed, false);
  assert.ok(withConstraints.drc.errors.some((issue) => issue.code === "KEEPOUT_VIOLATION"));
});

test("缺 importState / routing 的工程会被拒绝载入", () => {
  const valid = {
    id: "p1",
    name: "P",
    board: { width: 20, height: 20, kind: "perfboard" },
    components: [],
    importState: EMPTY_IMPORT,
    routing: { traces: [], jumpers: [], failedNets: [], warnings: [] },
    createdAt: "2026-01-01T00:00:00.000Z"
  };
  assert.equal(validateProjectShape(valid).ok, true);

  const missingRouting = { ...valid, routing: undefined };
  assert.equal(validateProjectShape(missingRouting).ok, false);

  const missingImport = { ...valid, importState: undefined };
  assert.equal(validateProjectShape(missingImport).ok, false);

  const brokenComponent = { ...valid, components: [{ id: "x" }] };
  assert.equal(validateProjectShape(brokenComponent).ok, false);

  // 逐层校验：网络缺 nodes、走锡坐标非法、约束缺 kind 都要被拒绝
  const netWithoutNodes = { ...valid, importState: { ...EMPTY_IMPORT, nets: [{ name: "N" }] } };
  assert.equal(validateProjectShape(netWithoutNodes).ok, false);

  const badTrace = {
    ...valid,
    routing: { traces: [{ id: "t1", net: "N1", points: [[0, 0], [null, 1]] }], jumpers: [], failedNets: [], warnings: [] }
  };
  assert.equal(validateProjectShape(badTrace).ok, false);

  const badConstraint = { ...valid, constraints: [{ strength: "hard" }] };
  assert.equal(validateProjectShape(badConstraint).ok, false);

  // 只写 kind、缺 region 的约束以前能通过校验，渲染时会读 undefined.x 崩掉
  const partialKeepout = { ...valid, constraints: [{ kind: "region_keepout", strength: "hard" }] };
  assert.equal(validateProjectShape(partialKeepout).ok, false);

  assert.equal(validateProjectShape(null).ok, false);
});
