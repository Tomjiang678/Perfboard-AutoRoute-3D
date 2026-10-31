import assert from "node:assert/strict";
import test from "node:test";
import { buildDrcReport } from "../src/features/routing/drcReport.ts";
import { checkComponentPlacement } from "../src/features/layout/placementValidity.ts";
import type { DesignConstraint, ImportState, PerfboardProject, PlacedComponent } from "../src/types/project.ts";

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

function project(overrides: Partial<PerfboardProject> = {}): PerfboardProject {
  const importState: ImportState = { components: [], nets: [], warnings: [], pinInfo: {} };
  return {
    id: "p1",
    name: "P",
    board: { width: 10, height: 8, kind: "perfboard" },
    files: [],
    importState,
    components: [],
    routing: { traces: [], jumpers: [], failedNets: [], warnings: [] },
    constraints: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

const base = {
  id: "c1",
  strength: "hard" as const,
  status: "active" as const,
  enabled: true,
  sourceText: "",
  explanation: "",
  createdAt: "2026-01-01T00:00:00.000Z"
};

test("buildDrcReport 把网表缺失节点算进结果（不用再手动点 DRC 才有）", () => {
  const importState: ImportState = {
    components: [],
    nets: [{ name: "N1", nodes: [{ ref: "U1", pin: "1" }, { ref: "U9", pin: "1" }] }] as ImportState["nets"],
    warnings: [],
    pinInfo: {}
  };
  const p = project({ importState, components: [twoPin("U1", [0, 0])] });
  const report = buildDrcReport(p);
  assert.equal(report.drc.passed, false);
  assert.ok(report.drc.errors.some((issue) => issue.code === "NETLIST_NODE_UNMAPPED"));
  assert.deepEqual(report.failedNets, ["N1"]);
});

test("buildDrcReport 同时包含接线校验与约束检查的结论", () => {
  const keepout: DesignConstraint = {
    ...base,
    kind: "region_keepout",
    region: { x: 2, y: 2, width: 3, height: 2 },
    blockPlacement: true,
    blockBottomRouting: true,
    blockJumpers: false
  };
  const crossing = {
    id: "t1",
    net: "N1",
    points: [[2, 0], [2, 5]] as Array<[number, number]>,
    layer: "bottom" as const
  };
  const p = project({ constraints: [keepout], routing: { traces: [crossing], jumpers: [], failedNets: [], warnings: [] } });
  const report = buildDrcReport(p);
  assert.equal(report.drc.passed, false);
  assert.ok(report.drc.errors.some((issue) => issue.code === "KEEPOUT_VIOLATION"));
});

test("手动放置与自动放置共用同一套判定：重叠被拒绝", () => {
  const p = project({ components: [twoPin("R1", [0, 0])] });
  const check = checkComponentPlacement(p, twoPin("R2", [2, 0]));
  assert.equal(check.valid, false);
  assert.ok(check.reasons.some((reason) => reason.includes("重叠")));
});

test("手动放置也会拒绝硬禁布区（以前只有自动放置拦）", () => {
  const keepout: DesignConstraint = {
    ...base,
    kind: "region_keepout",
    region: { x: 0, y: 0, width: 3, height: 3 },
    blockPlacement: true,
    blockBottomRouting: false,
    blockJumpers: false
  };
  const p = project({ constraints: [keepout] });
  const blocked = checkComponentPlacement(p, twoPin("R1", [0, 0]));
  assert.equal(blocked.valid, false);

  const free = checkComponentPlacement(p, twoPin("R1", [6, 4]));
  assert.equal(free.valid, true);
});
