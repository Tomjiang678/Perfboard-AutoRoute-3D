import assert from "node:assert/strict";
import test from "node:test";
import { resolveConstraintDrafts } from "../src/features/constraints/resolveDrafts.ts";
import { detectConstraintConflicts } from "../src/features/constraints/conflictDetector.ts";
import { buildPowerRailTraces, applyRoutingConstraintReport } from "../src/features/constraints/execution.ts";
import { parseAiConstraintResponse } from "../src/features/constraints/schema.ts";
import { buildConstraintPrompt } from "../src/features/ai/constraintPrompt.ts";
import { normalizeBoardDefinition } from "../src/features/board/factory.ts";
import { createBreadboardDefinition } from "../src/features/board/breadboard.ts";
import type { ConstraintDraft } from "../src/features/constraints/drafts.ts";
import type { DesignConstraint, PerfboardProject, PlacedComponent, RoutedNetEndpoint, RoutingState } from "../src/types/project.ts";

function makeComponent(id: string, name: string, kind: PlacedComponent["kind"] = "resistor"): PlacedComponent {
  return {
    id, kind, label: name, name, value: "",
    pinCount: 2, leadSpacing: 3, rowSpacing: 0, sameSidePitch: 1,
    pinOffsets: [[0, 0], [3, 0]], position: [4, 4], rotation: 0, mounted: true
  };
}

function makeProject(overrides: Partial<PerfboardProject> = {}): PerfboardProject {
  return {
    id: "p1",
    name: "T",
    createdAt: "",
    board: normalizeBoardDefinition({ kind: "perfboard", width: 30, height: 20 }),
    components: [makeComponent("c1", "R1"), makeComponent("c2", "U1", "dip")],
    files: [],
    importState: {
      components: [],
      nets: [{ name: "GND", nodes: [] }, { name: "VCC", nodes: [] }, { name: "SIG", nodes: [] }],
      warnings: []
    },
    constraints: [],
    routing: { traces: [], jumpers: [], failedNets: [], warnings: [] },
    selectedNetName: undefined,
    ...overrides
  };
}

/* ── resolveConstraintDrafts ──────────────────────────────────────────── */

test("component_in_region resolves refs to ids", () => {
  const draft: ConstraintDraft = {
    kind: "component_in_region", strength: "hard", componentRefs: ["R1", "U1"],
    region: { x: 0, y: 0, width: 10, height: 10 }
  };
  const result = resolveConstraintDrafts([draft], "s", makeProject());
  assert.equal(result.errors.length, 0);
  const constraint = result.constraints[0] as Extract<DesignConstraint, { kind: "component_in_region" }>;
  assert.deepEqual(constraint.componentIds, ["c1", "c2"]);
});

test("component_in_region with an unknown ref errors", () => {
  const draft: ConstraintDraft = {
    kind: "component_in_region", strength: "hard", componentRefs: ["NOPE"],
    region: { x: 0, y: 0, width: 10, height: 10 }
  };
  assert.equal(resolveConstraintDrafts([draft], "s", makeProject()).errors.length, 1);
});

test("component_in_region outside the board errors", () => {
  const draft: ConstraintDraft = {
    kind: "component_in_region", strength: "hard", componentRefs: ["R1"],
    region: { x: 20, y: 15, width: 10, height: 10 }
  };
  assert.equal(resolveConstraintDrafts([draft], "s", makeProject()).errors.length, 1);
});

test("component_on_board_edge uses the minimum depth when unspecified", () => {
  const draft: ConstraintDraft = {
    kind: "component_on_board_edge", strength: "hard", componentRefs: ["R1"], edge: "top"
  };
  const result = resolveConstraintDrafts([draft], "s", makeProject());
  assert.equal(result.errors.length, 0);
  const constraint = result.constraints[0] as Extract<DesignConstraint, { kind: "component_on_board_edge" }>;
  assert.ok((constraint.depth ?? 0) >= 1);
});

test("component_on_board_edge rejects impossible depths", () => {
  const draft: ConstraintDraft = {
    kind: "component_on_board_edge", strength: "hard", componentRefs: ["R1"], edge: "top", depth: 1
  };
  assert.equal(resolveConstraintDrafts([draft], "s", makeProject()).errors.length, 1);
});

test("component_near_component resolves both refs", () => {
  const draft: ConstraintDraft = {
    kind: "component_near_component", strength: "hard", componentRef: "R1", anchorComponentRef: "U1", maxDistance: 3
  };
  const result = resolveConstraintDrafts([draft], "s", makeProject());
  assert.equal(result.errors.length, 0);
  assert.equal(result.constraints[0].kind, "component_near_component");
});

test("component_near_component with a missing anchor errors", () => {
  const draft: ConstraintDraft = {
    kind: "component_near_component", strength: "hard", componentRef: "R1", anchorComponentRef: "NOPE", maxDistance: 3
  };
  assert.equal(resolveConstraintDrafts([draft], "s", makeProject()).errors.length, 1);
});

for (const [degrees, expected] of [[90, 90], [450, 90], [-90, 270], [0, 0], [720, 0]] as Array<[number, number]>) {
  test(`component_orientation normalizes ${degrees}° to ${expected}°`, () => {
    const draft: ConstraintDraft = {
      kind: "component_orientation", strength: "hard", componentRef: "R1", rotationDegrees: degrees
    };
    const result = resolveConstraintDrafts([draft], "s", makeProject());
    assert.equal(result.errors.length, 0);
    const constraint = result.constraints[0] as Extract<DesignConstraint, { kind: "component_orientation" }>;
    assert.equal(constraint.rotationDegrees, expected);
  });
}

test("component_lock resolves the ref", () => {
  const draft: ConstraintDraft = {
    kind: "component_lock", strength: "hard", componentRef: "R1", lockPosition: true, lockRotation: false
  };
  const result = resolveConstraintDrafts([draft], "s", makeProject());
  assert.equal(result.errors.length, 0);
});

test("region_keepout passes through with validation", () => {
  const draft: ConstraintDraft = {
    kind: "region_keepout", strength: "hard",
    region: { x: 2, y: 2, width: 5, height: 5 },
    blockPlacement: true, blockBottomRouting: true, blockJumpers: true
  };
  const result = resolveConstraintDrafts([draft], "s", makeProject());
  assert.equal(result.errors.length, 0);
  assert.equal(result.constraints[0].kind, "region_keepout");
});

test("region_keepout outside the board errors", () => {
  const draft: ConstraintDraft = {
    kind: "region_keepout", strength: "hard",
    region: { x: 25, y: 15, width: 10, height: 10 },
    blockPlacement: true, blockBottomRouting: true, blockJumpers: true
  };
  assert.equal(resolveConstraintDrafts([draft], "s", makeProject()).errors.length, 1);
});

test("power_rail requires an existing net", () => {
  const draft: ConstraintDraft = {
    kind: "power_rail", strength: "hard", net: "GND", axis: "row", index: 4, from: 0, to: 20
  };
  assert.equal(resolveConstraintDrafts([draft], "s", makeProject()).errors.length, 0);
});

test("power_rail with an unknown net errors", () => {
  const draft: ConstraintDraft = {
    kind: "power_rail", strength: "hard", net: "NOPE", axis: "row", index: 4, from: 0, to: 20
  };
  assert.equal(resolveConstraintDrafts([draft], "s", makeProject()).errors.length, 1);
});

test("power_rail beyond the board errors", () => {
  const draft: ConstraintDraft = {
    kind: "power_rail", strength: "hard", net: "GND", axis: "row", index: 4, from: 0, to: 35
  };
  assert.equal(resolveConstraintDrafts([draft], "s", makeProject()).errors.length, 1);
});

test("net_jumper_limit requires an existing net", () => {
  const draft: ConstraintDraft = { kind: "net_jumper_limit", strength: "hard", net: "SIG", maxJumpers: 3 };
  assert.equal(resolveConstraintDrafts([draft], "s", makeProject()).errors.length, 0);
});

test("net_jumper_limit with an unknown net errors", () => {
  const draft: ConstraintDraft = { kind: "net_jumper_limit", strength: "hard", net: "NOPE", maxJumpers: 3 };
  assert.equal(resolveConstraintDrafts([draft], "s", makeProject()).errors.length, 1);
});

/* ── conflict detection ───────────────────────────────────────────────── */

function hardConstraint(base: Partial<DesignConstraint> & { kind: DesignConstraint["kind"] }): DesignConstraint {
  return {
    id: crypto.randomUUID(), strength: "hard", status: "active", enabled: true,
    sourceText: "", explanation: "", createdAt: "",
    ...base
  } as DesignConstraint;
}

test("intersecting rails of different nets conflict", () => {
  const conflicts = detectConstraintConflicts([
    hardConstraint({ kind: "power_rail", net: "GND", axis: "row", index: 4, from: 0, to: 20 }),
    hardConstraint({ kind: "power_rail", net: "VCC", axis: "column", index: 10, from: 0, to: 10 })
  ]);
  assert.equal(conflicts.length, 1);
});

test("rails of the same net never conflict", () => {
  const conflicts = detectConstraintConflicts([
    hardConstraint({ kind: "power_rail", net: "GND", axis: "row", index: 4, from: 0, to: 20 }),
    hardConstraint({ kind: "power_rail", net: "GND", axis: "row", index: 4, from: 5, to: 15 })
  ]);
  assert.equal(conflicts.length, 0);
});

test("parallel rails on different rows do not conflict", () => {
  const conflicts = detectConstraintConflicts([
    hardConstraint({ kind: "power_rail", net: "GND", axis: "row", index: 4, from: 0, to: 20 }),
    hardConstraint({ kind: "power_rail", net: "VCC", axis: "row", index: 5, from: 0, to: 20 })
  ]);
  assert.equal(conflicts.length, 0);
});

test("disjoint component regions conflict only when sharing a component", () => {
  const withShared = detectConstraintConflicts([
    hardConstraint({ kind: "component_in_region", componentIds: ["c1"], componentRefs: ["R1"], region: { x: 0, y: 0, width: 5, height: 5 } }),
    hardConstraint({ kind: "component_in_region", componentIds: ["c1"], componentRefs: ["R1"], region: { x: 10, y: 10, width: 5, height: 5 } })
  ]);
  assert.equal(withShared.length, 1);

  const withoutShared = detectConstraintConflicts([
    hardConstraint({ kind: "component_in_region", componentIds: ["c1"], componentRefs: ["R1"], region: { x: 0, y: 0, width: 5, height: 5 } }),
    hardConstraint({ kind: "component_in_region", componentIds: ["c2"], componentRefs: ["U1"], region: { x: 10, y: 10, width: 5, height: 5 } })
  ]);
  assert.equal(withoutShared.length, 0);
});

test("conflicting orientations of the same component conflict", () => {
  const conflicts = detectConstraintConflicts([
    hardConstraint({ kind: "component_orientation", componentId: "c1", componentRef: "R1", rotationDegrees: 0 }),
    hardConstraint({ kind: "component_orientation", componentId: "c1", componentRef: "R1", rotationDegrees: 90 })
  ]);
  assert.equal(conflicts.length, 1);
});

test("soft constraints never conflict", () => {
  const soft: DesignConstraint = {
    ...hardConstraint({ kind: "power_rail", net: "GND", axis: "row", index: 4, from: 0, to: 20 }),
    strength: "soft"
  };
  assert.equal(detectConstraintConflicts([soft, soft]).length, 0);
});

/* ── power rail execution ─────────────────────────────────────────────── */

test("buildPowerRailTraces lays a row rail across the covered range", () => {
  const constraint = hardConstraint({ kind: "power_rail", net: "GND", axis: "row", index: 4, from: 2, to: 18 });
  const endpoints: RoutedNetEndpoint[] = [
    { net: "GND", ref: "R1", pin: 1, grid: [2, 4], role: "1" },
    { net: "GND", ref: "U1", pin: 4, grid: [12, 4], role: "V-" }
  ];
  const result = buildPowerRailTraces([constraint], endpoints, []);
  assert.equal(result.errors.length, 0);
  assert.equal(result.traces.length, 1);
  assert.equal(result.traces[0].net, "GND");
  assert.equal(result.traces[0].points.length, 17);
  assert.deepEqual(result.traces[0].points[0], [2, 4]);
  assert.deepEqual(result.traces[0].points.at(-1), [18, 4]);
  assert.equal(result.traces[0].locked, true);
});

test("buildPowerRailTraces still builds the rail without endpoints on it", () => {
  const constraint = hardConstraint({ kind: "power_rail", net: "GND", axis: "row", index: 4, from: 2, to: 18 });
  const result = buildPowerRailTraces([constraint], [], []);
  assert.equal(result.errors.length, 0);
  assert.equal(result.traces.length, 1);
});

test("buildPowerRailTraces errors when the rail crosses a wrong-net pad", () => {
  const constraint = hardConstraint({ kind: "power_rail", net: "GND", axis: "row", index: 4, from: 2, to: 18 });
  const endpoints: RoutedNetEndpoint[] = [{ net: "VCC", ref: "R1", pin: 1, grid: [5, 4], role: "1" }];
  const result = buildPowerRailTraces([constraint], endpoints, []);
  assert.ok(result.errors.length > 0);
});

test("applyRoutingConstraintReport flags net_jumper_limit violations", () => {
  const constraint = hardConstraint({ kind: "net_jumper_limit", net: "SIG", maxJumpers: 3 });
  const routing: RoutingState = {
    traces: [],
    jumpers: [
      { id: "j1", net: "SIG", from: [1, 1], to: [2, 1] },
      { id: "j2", net: "SIG", from: [2, 1], to: [3, 1] },
      { id: "j3", net: "SIG", from: [3, 1], to: [4, 1] },
      { id: "j4", net: "SIG", from: [4, 1], to: [5, 1] }
    ],
    failedNets: [],
    warnings: []
  };
  const next = applyRoutingConstraintReport(routing, [constraint]);
  assert.ok(next.warnings.some((warning) => warning.includes("超过上限")));
  assert.ok(next.failedNets.includes("SIG"));
});

test("applyRoutingConstraintReport passes when within the jumper limit", () => {
  const constraint = hardConstraint({ kind: "net_jumper_limit", net: "SIG", maxJumpers: 5 });
  const routing: RoutingState = {
    traces: [],
    jumpers: [{ id: "j1", net: "SIG", from: [1, 1], to: [2, 1] }],
    failedNets: [],
    warnings: []
  };
  const next = applyRoutingConstraintReport(routing, [constraint]);
  assert.equal(next.warnings.length, 0);
  assert.equal(next.failedNets.length, 0);
});

/* ── AI prompt ────────────────────────────────────────────────────────── */

test("buildConstraintPrompt embeds user text, refs and nets", () => {
  const prompt = buildConstraintPrompt("把 R1 放在左上角", makeProject());
  assert.ok(prompt.includes("把 R1 放在左上角"));
  assert.ok(prompt.includes("R1"));
  assert.ok(prompt.includes("U1"));
  assert.ok(prompt.includes("GND"));
  assert.ok(prompt.includes("VCC"));
});

test("buildConstraintPrompt reflects the breadboard kind", () => {
  const prompt = buildConstraintPrompt("x", makeProject({ board: createBreadboardDefinition(30, 1) }));
  assert.ok(prompt.includes("breadboard"));
  assert.ok(prompt.includes('"kind":"breadboard"'));
});

test("buildConstraintPrompt reflects the perfboard kind", () => {
  const prompt = buildConstraintPrompt("x", makeProject());
  assert.ok(prompt.includes("perfboard"));
});

/* ── AI response schema ───────────────────────────────────────────────── */

test("parseAiConstraintResponse accepts a valid constraints payload", () => {
  const parsed = parseAiConstraintResponse({
    action: "constraints",
    constraints: [{ kind: "component_lock", strength: "hard", componentRef: "R1", lockPosition: true, lockRotation: false, explanation: "x" }]
  });
  assert.equal(parsed.action, "constraints");
  assert.equal(parsed.constraints.length, 1);
});

test("parseAiConstraintResponse accepts no_action", () => {
  const parsed = parseAiConstraintResponse({ action: "no_action" });
  assert.equal(parsed.action, "no_action");
});

for (const [label, value] of [
  ["missing action", { constraints: [] }],
  ["wrong action", { action: "explode", constraints: [] }],
  ["unknown kind", { action: "constraints", constraints: [{ kind: "fly_to_moon", strength: "hard" }] }],
  ["non-object input", "hello"],
  ["no_action with constraints", { action: "no_action", constraints: [{ kind: "component_lock", strength: "hard", componentRef: "R1" }] }],
  ["empty componentRefs", { action: "constraints", constraints: [{ kind: "component_in_region", strength: "hard", componentRefs: [], region: { x: 0, y: 0, width: 5, height: 5 } }] }],
  ["empty net", { action: "constraints", constraints: [{ kind: "power_rail", strength: "hard", net: "  ", axis: "row", index: 0, from: 0, to: 1 }] }],
  ["bad region", { action: "constraints", constraints: [{ kind: "region_keepout", strength: "hard", region: { x: 0 }, blockPlacement: true, blockBottomRouting: false, blockJumpers: false }] }],
  ["bad edge", { action: "constraints", constraints: [{ kind: "component_on_board_edge", strength: "hard", componentRefs: ["R1"], edge: "diagonal" }] }]
] as Array<[string, unknown]>) {
  test(`parseAiConstraintResponse rejects ${label}`, () => {
    assert.throws(() => parseAiConstraintResponse(value));
  });
}

test("parseAiConstraintResponse tolerates a missing constraints array", () => {
  const parsed = parseAiConstraintResponse({ action: "constraints" });
  assert.deepEqual(parsed.constraints, []);
});

test("parseAiConstraintResponse coerces unknown strengths to hard", () => {
  const parsed = parseAiConstraintResponse({
    action: "constraints",
    constraints: [{ kind: "component_lock", strength: "very", componentRef: "R1" }]
  });
  assert.equal(parsed.constraints[0].strength, "hard");
});
