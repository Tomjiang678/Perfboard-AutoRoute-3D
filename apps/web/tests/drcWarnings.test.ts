import assert from "node:assert/strict";
import test from "node:test";
import { stripConstraintWarnings, stripDrcWarnings } from "../src/features/routing/drcWarnings.ts";
import { buildDrcReport } from "../src/features/routing/drcReport.ts";
import type { DesignConstraint, PerfboardProject } from "../src/types/project.ts";

test("重复跑 DRC 不会让约束警告越积越多", () => {
  const warnings = [
    "约束：N1 使用 3 根跳线，超过上限 2。",
    "DRC: some legacy warning",
    "布线提示：保留"
  ];
  const stripped = stripConstraintWarnings(stripDrcWarnings(warnings));
  assert.deepEqual(stripped, ["布线提示：保留"]);
});

test("约束警告只产生一次，且失败网络只包含硬约束", () => {
  const constraint: DesignConstraint = {
    id: "c1",
    kind: "net_jumper_limit",
    strength: "hard",
    status: "active",
    enabled: true,
    sourceText: "",
    explanation: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    net: "N1",
    maxJumpers: 0
  };
  const project: PerfboardProject = {
    id: "p",
    name: "p",
    board: { width: 10, height: 8, kind: "perfboard" },
    files: [],
    importState: { components: [], nets: [], warnings: [], pinInfo: {} },
    components: [],
    routing: {
      traces: [],
      jumpers: [{ id: "j1", net: "N1", from: [0, 0], to: [3, 0], locked: false }],
      failedNets: [],
      warnings: []
    },
    constraints: [constraint],
    createdAt: "2026-01-01T00:00:00.000Z"
  };

  const report = buildDrcReport(project);
  assert.ok(report.warnings.some((warning) => warning.includes("超过上限")));
  assert.ok(report.failedNets.includes("N1"));
  assert.equal(report.warnings.filter((warning) => warning.includes("超过上限")).length, 1);
});
