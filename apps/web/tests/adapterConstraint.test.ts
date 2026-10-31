import assert from "node:assert/strict";
import test from "node:test";
import { resolveConstraintDrafts } from "../src/features/constraints/resolveDrafts.ts";
import { evaluatePlacementConstraints, prepareComponentsForConstraints } from "../src/features/constraints/execution.ts";
import { buildConstraintPrompt } from "../src/features/ai/constraintPrompt.ts";
import { CONSTRAINT_CATALOG, constraintResponseSchema } from "../src/features/constraints/catalog.ts";
import { parseAiConstraintResponse } from "../src/features/constraints/schema.ts";
import type { DesignConstraint, PerfboardProject, PlacedComponent } from "../src/types/project.ts";

function dip14(overrides: Partial<PlacedComponent> = {}): PlacedComponent {
  const pinOffsets: Array<[number, number]> = [];
  for (let i = 0; i < 7; i += 1) pinOffsets.push([0, i]);
  for (let i = 6; i >= 0; i -= 1) pinOffsets.push([3, i]);
  return {
    id: "u1",
    kind: "dip",
    label: "U1",
    name: "U1",
    value: "74HC00",
    pinCount: 14,
    leadSpacing: 1,
    rowSpacing: 3,
    sameSidePitch: 1,
    pinOffsets,
    position: [5, 5],
    rotation: 0,
    mounted: false,
    ...overrides
  };
}

function projectWith(components: PlacedComponent[]): PerfboardProject {
  return {
    id: "p1",
    name: "P",
    board: { width: 40, height: 30, kind: "perfboard" },
    files: [],
    importState: { components: [], nets: [], warnings: [], pinInfo: {} },
    components,
    routing: { traces: [], jumpers: [], failedNets: [], warnings: [] },
    constraints: [],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

test("指令目录里有 component_adapter，schema 允许它", () => {
  assert.ok(CONSTRAINT_CATALOG.some((entry) => entry.kind === "component_adapter"));
  const schema = constraintResponseSchema(["U1"], []);
  const items = (schema.properties.constraints as { items: { oneOf: Array<{ properties: { kind: { const: string } } }> } }).items;
  assert.ok(items.oneOf.some((option) => option.properties.kind.const === "component_adapter"));
});

test("AI 返回的 component_adapter 能通过本地校验", () => {
  const response = parseAiConstraintResponse({
    action: "constraints",
    constraints: [
      {
        kind: "component_adapter",
        strength: "hard",
        componentRefs: ["U1"],
        rowSpacing: 5,
        explanation: "给 U1 加转接板"
      },
      {
        kind: "component_adapter",
        strength: "soft",
        componentRefs: ["U2"],
        remove: true
      }
    ]
  });
  assert.equal(response.constraints.length, 2);
  const first = response.constraints[0];
  assert.equal(first.kind, "component_adapter");
  if (first.kind !== "component_adapter") return;
  assert.equal(first.rowSpacing, 5);
  assert.equal(first.remove, undefined);

  const second = response.constraints[1];
  if (second.kind !== "component_adapter") return;
  assert.equal(second.remove, true);
});

test("“给 U1 加转接板”能解析成 component_adapter 约束", () => {
  const project = projectWith([dip14()]);
  const result = resolveConstraintDrafts(
    [{ kind: "component_adapter", strength: "hard", componentRefs: ["U1"], rowSpacing: 5 }],
    "给 U1 加个转接板",
    project
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.constraints.length, 1);
  const constraint = result.constraints[0];
  assert.equal(constraint.kind, "component_adapter");
  if (constraint.kind !== "component_adapter") return;
  assert.deepEqual(constraint.componentIds, ["u1"]);
  assert.deepEqual(constraint.requested, { rowSpacing: 5 });
});

test("执行时按芯片脚数决定转接板脚数", () => {
  const project = projectWith([dip14()]);
  const { constraints } = resolveConstraintDrafts(
    [{ kind: "component_adapter", strength: "hard", componentRefs: ["U1"] }],
    "给 U1 加转接板",
    project
  );
  const prepared = prepareComponentsForConstraints(project.components, constraints);
  const adapter = prepared[0].adapter;
  assert.ok(adapter);
  assert.equal(adapter.pinCount, 14);
  assert.ok(adapter.width >= 4);
  assert.ok(adapter.height >= 7);
});

test("remove=true 时摘掉转接板", () => {
  const chip = dip14({ adapter: { pinCount: 16, width: 7, height: 10, rowSpacing: 5 } });
  const project = projectWith([chip]);
  const { constraints } = resolveConstraintDrafts(
    [{ kind: "component_adapter", strength: "hard", componentRefs: ["U1"], remove: true }],
    "去掉 U1 的转接板",
    project
  );
  assert.equal(constraints[0].kind === "component_adapter" && constraints[0].requested, null);
  const prepared = prepareComponentsForConstraints(project.components, constraints);
  assert.equal(prepared[0].adapter, undefined);
});

test("AI 不写尺寸时，完全采用芯片的默认预设", () => {
  const project = projectWith([dip14()]);
  const { constraints } = resolveConstraintDrafts(
    [{ kind: "component_adapter", strength: "hard", componentRefs: ["U1"] }],
    "给 U1 加转接板",
    project
  );
  const prepared = prepareComponentsForConstraints(project.components, constraints);
  // 14 脚预设：7×9 格、两列间距 6 格
  assert.deepEqual(prepared[0].adapter, { pinCount: 14, rowSpacing: 6, width: 7, height: 9 });
});

test("AI 给出的脚数和芯片不一致时，一律按芯片脚数", () => {
  const project = projectWith([dip14()]);
  const { constraints } = resolveConstraintDrafts(
    [{ kind: "component_adapter", strength: "hard", componentRefs: ["U1"] }],
    "给 U1 加 16 脚转接板",
    project
  );
  const prepared = prepareComponentsForConstraints(project.components, constraints);
  // 14 脚芯片只能配 14 脚板：7×9 格、两列间距 6 格
  assert.deepEqual(prepared[0].adapter, { pinCount: 14, rowSpacing: 6, width: 7, height: 9 });
});

test("已放置的芯片，AI 加转接板依然生效（自动放置会整体重排）", () => {
  const project = projectWith([dip14({ mounted: true })]);
  const { constraints } = resolveConstraintDrafts(
    [{ kind: "component_adapter", strength: "hard", componentRefs: ["U1"] }],
    "给 U1 加转接板",
    project
  );
  const prepared = prepareComponentsForConstraints(project.components, constraints);
  assert.ok(prepared[0].adapter);
  assert.equal(prepared[0].adapter?.pinCount, 14);
  // 自动放置是整体重排，所以放置状态会被清掉，参与重新摆位
  assert.equal(prepared[0].mounted, false);
  assert.equal(evaluatePlacementConstraints(prepared, constraints).length, 0);
});

test("位置锁定的元件不会被改脚位，并给出提示", () => {
  const chip = dip14();
  const project = projectWith([chip]);
  const { constraints } = resolveConstraintDrafts(
    [{ kind: "component_adapter", strength: "hard", componentRefs: ["U1"] }],
    "给 U1 加转接板",
    project
  );
  const lock: DesignConstraint = {
    id: "lock-1",
    kind: "component_lock",
    strength: "hard",
    status: "active",
    enabled: true,
    sourceText: "锁住 U1",
    explanation: "锁定 U1 位置",
    createdAt: "2026-01-01T00:00:00.000Z",
    componentId: "u1",
    componentRef: "U1",
    lockPosition: true,
    lockRotation: false
  };
  const all = [...constraints, lock];
  const prepared = prepareComponentsForConstraints(project.components, all);
  assert.equal(prepared[0].adapter, undefined);
  const warnings = evaluatePlacementConstraints(prepared, all);
  assert.ok(warnings.some((warning) => warning.includes("转接板未按指令生效")));
});

test("提示词里带着转接板信息，并用板面尺寸算占位", () => {
  const pins: Array<[number, number]> = [];
  for (let i = 0; i < 8; i += 1) pins.push([0, i]);
  for (let i = 7; i >= 0; i -= 1) pins.push([3, i]);
  const chip = dip14({
    pinCount: 16,
    pinOffsets: pins,
    adapter: { pinCount: 16, width: 7, height: 10, rowSpacing: 5 }
  });
  const prompt = buildConstraintPrompt("把 U1 放到左上角", projectWith([chip]));
  assert.ok(prompt.includes("component_adapter"));
  assert.ok(prompt.includes("\"adapter\""));
  assert.ok(prompt.includes("boardPinOffsets"));
  // 16 脚芯片 + 16 脚转接板 → 板上 16 个脚位
  assert.ok(prompt.includes("\"boardPinCount\":16"));
});
