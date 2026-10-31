import assert from "node:assert/strict";
import test from "node:test";
import { activeConstraints, normalizeConstraints, withMigratedConstraints } from "../src/features/constraints/model.ts";
import { prepareComponentsForConstraints } from "../src/features/constraints/execution.ts";
import type { DesignConstraint, PerfboardProject, PlacedComponent } from "../src/types/project.ts";

function dip(id: string, name: string, position: [number, number]): PlacedComponent {
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
    mounted: false
  };
}

function project(components: PlacedComponent[], constraints: unknown): PerfboardProject {
  return {
    id: "p1",
    name: "P",
    board: { width: 40, height: 30, kind: "perfboard" },
    files: [],
    importState: { components: [], nets: [], warnings: [], pinInfo: {} },
    components,
    routing: { traces: [], jumpers: [], failedNets: [], warnings: [] },
    constraints: constraints as DesignConstraint[],
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

test("旧工程里没有 enabled/status 的约束，读入后仍然生效", () => {
  const legacy = {
    kind: "component_in_region",
    strength: "hard",
    componentIds: ["u1"],
    componentRefs: ["U1"],
    region: { x: 0, y: 0, width: 10, height: 10 },
    sourceText: "U1 放左上角",
    explanation: "U1 放左上角"
    // 注意：没有 id / enabled / status / createdAt
  };
  const migrated = withMigratedConstraints(project([dip("u1", "U1", [20, 20])], [legacy]));
  assert.equal(migrated.constraints?.length, 1);
  const constraint = migrated.constraints![0];
  assert.equal(constraint.enabled, true);
  assert.equal(constraint.status, "active");
  assert.ok(constraint.id.length > 0);

  assert.equal(activeConstraints(migrated.constraints!).length, 1);

  const prepared = prepareComponentsForConstraints(migrated.components, migrated.constraints!);
  // 约束会让元件参与重排（mounted=false），说明它被当成有效约束
  assert.equal(prepared[0].mounted, false);
});

test("元件重新导入后 id 变了，按位号把约束重新指回去", () => {
  const components = [dip("new-u1", "U1", [5, 5])];
  const stale = {
    kind: "component_lock",
    strength: "hard",
    componentId: "old-u1",
    componentRef: "U1",
    lockPosition: true,
    lockRotation: false,
    enabled: true,
    status: "active",
    sourceText: "锁住 U1",
    explanation: "锁住 U1",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
  const constraints = normalizeConstraints([stale], components);
  assert.equal(constraints.length, 1);
  assert.equal(constraints[0].kind, "component_lock");
  if (constraints[0].kind !== "component_lock") return;
  assert.equal(constraints[0].componentId, "new-u1");

  const prepared = prepareComponentsForConstraints(components, constraints);
  assert.equal(prepared[0].mounted, true);
});

test("多条旧约束与新约束共存时全部保持生效", () => {
  const components = [dip("u1", "U1", [5, 5]), dip("u2", "U2", [20, 5])];
  const legacy = [
    { kind: "component_in_region", strength: "hard", componentIds: ["u1"], componentRefs: ["U1"], region: { x: 0, y: 0, width: 12, height: 12 } },
    { kind: "component_lock", strength: "soft", componentId: "u2", componentRef: "U2", lockPosition: true, lockRotation: false }
  ];
  const migrated = normalizeConstraints(legacy, components);
  const fresh: DesignConstraint = {
    id: "fresh-1",
    kind: "component_lock",
    strength: "hard",
    status: "active",
    enabled: true,
    sourceText: "新约束",
    explanation: "锁住 U2",
    createdAt: "2026-02-01T00:00:00.000Z",
    componentId: "u2",
    componentRef: "U2",
    lockPosition: true,
    lockRotation: true
  };
  const all = [...migrated, fresh];
  assert.equal(activeConstraints(all).length, 3);
});

test("无法识别的约束类型被丢弃，坏数据不会让工程打不开", () => {
  const constraints = normalizeConstraints(
    [
      null,
      "oops",
      { kind: "totally_unknown" },
      { kind: "region_keepout", strength: "soft", region: { x: 1, y: 1, width: 4, height: 4 }, blockPlacement: true, blockBottomRouting: false, blockJumpers: false }
    ],
    [dip("u1", "U1", [0, 0])]
  );
  assert.equal(constraints.length, 1);
  assert.equal(constraints[0].kind, "region_keepout");
  assert.equal(constraints[0].status, "active");
  assert.equal(constraints[0].enabled, true);
});

test("明确停用的约束读入后仍然是停用状态", () => {
  const constraints = normalizeConstraints(
    [{ kind: "component_lock", componentId: "u1", componentRef: "U1", lockPosition: true, lockRotation: false, enabled: false }],
    [dip("u1", "U1", [0, 0])]
  );
  assert.equal(constraints[0].status, "disabled");
  assert.equal(activeConstraints(constraints).length, 0);
});

test("缺少必需字段的残缺约束会被丢弃，不会让页面崩掉", () => {
  const constraints = normalizeConstraints(
    [
      { kind: "component_in_region", strength: "hard", region: { x: 0, y: 0, width: 5, height: 5 } },
      { kind: "region_keepout", strength: "soft" },
      { kind: "component_near_component", strength: "soft", maxDistance: 5 },
      { kind: "component_adapter", strength: "hard", componentIds: ["u1"], componentRefs: ["U1"] }
    ],
    [dip("u1", "U1", [0, 0])]
  );
  // 只剩字段完整的转接板约束
  assert.equal(constraints.length, 1);
  const adapter = constraints[0];
  assert.equal(adapter.kind, "component_adapter");
  if (adapter.kind === "component_adapter") {
    assert.deepEqual(adapter.componentIds, ["u1"]);
    assert.deepEqual(adapter.componentRefs, ["U1"]);
  }
});

test("旧工程里 14 脚芯片配 16 脚板，载入时会收敛到 14 脚", () => {
  const chip = {
    ...dip("u1", "U1", [0, 0]),
    adapter: { pinCount: 16, width: 7, height: 10, rowSpacing: 5 }
  };
  const migrated = withMigratedConstraints(project([chip], []));
  assert.equal(migrated.components[0].adapter?.pinCount, 14);
});
