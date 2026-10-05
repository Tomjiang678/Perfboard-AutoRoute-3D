import type { AiConstraintResponse, ConstraintDraft } from "./drafts.ts";

const DRAFT_KINDS = new Set([
  "component_in_region",
  "component_on_board_edge",
  "component_near_component",
  "component_lock",
  "component_orientation",
  "region_keepout",
  "power_rail",
  "net_jumper_limit"
]);

export function parseAiConstraintResponse(value: unknown): AiConstraintResponse {
  if (!isRecord(value)) {
    throw new Error("AI 返回内容不是 JSON 对象。");
  }
  const action = value.action;
  if (action !== "constraints" && action !== "no_action") {
    throw new Error("AI 返回了不支持的 action。");
  }
  const rawConstraints = Array.isArray(value.constraints) ? value.constraints : [];
  if (rawConstraints.length > 20) {
    throw new Error("单次最多接受 20 条指令。");
  }
  const constraints = rawConstraints.map(validateDraft);
  if (action === "no_action" && constraints.length > 0) {
    throw new Error("no_action 不能同时包含工程指令。");
  }
  return {
    action,
    constraints,
    message: typeof value.message === "string" ? value.message.slice(0, 300) : undefined
  };
}

function validateDraft(value: unknown): ConstraintDraft {
  if (!isRecord(value) || typeof value.kind !== "string" || !DRAFT_KINDS.has(value.kind)) {
    throw new Error("AI 返回了不支持的约束类型。");
  }
  const strength = value.strength === "soft" ? "soft" : "hard";
  const explanation = typeof value.explanation === "string" ? value.explanation.slice(0, 500) : undefined;
  switch (value.kind) {
    case "component_in_region":
      return { kind: value.kind, strength, componentRefs: stringArray(value.componentRefs), region: region(value.region), explanation };
    case "component_on_board_edge":
      return {
        kind: value.kind,
        strength,
        componentRefs: stringArray(value.componentRefs),
        edge: edge(value.edge),
        depth: value.depth === undefined ? undefined : finiteNumber(value.depth, "depth", 1, 10000),
        explanation
      };
    case "component_near_component":
      return {
        kind: value.kind,
        strength,
        componentRef: text(value.componentRef, "componentRef"),
        anchorComponentRef: text(value.anchorComponentRef, "anchorComponentRef"),
        maxDistance: finiteNumber(value.maxDistance, "maxDistance", 0, 1000),
        explanation
      };
    case "component_lock":
      return {
        kind: value.kind,
        strength,
        componentRef: text(value.componentRef, "componentRef"),
        lockPosition: Boolean(value.lockPosition),
        lockRotation: Boolean(value.lockRotation),
        explanation
      };
    case "component_orientation":
      return {
        kind: value.kind,
        strength,
        componentRef: text(value.componentRef, "componentRef"),
        rotationDegrees: finiteNumber(value.rotationDegrees, "rotationDegrees", -3600, 3600),
        explanation
      };
    case "region_keepout":
      return {
        kind: value.kind,
        strength,
        region: region(value.region),
        blockPlacement: Boolean(value.blockPlacement),
        blockBottomRouting: Boolean(value.blockBottomRouting),
        blockJumpers: Boolean(value.blockJumpers),
        explanation
      };
    case "power_rail":
      return {
        kind: value.kind,
        strength,
        net: text(value.net, "net"),
        axis: value.axis === "column" ? "column" : "row",
        index: finiteNumber(value.index, "index", 0, 10000),
        from: finiteNumber(value.from, "from", 0, 10000),
        to: finiteNumber(value.to, "to", 0, 10000),
        explanation
      };
    case "net_jumper_limit":
      return {
        kind: value.kind,
        strength,
        net: text(value.net, "net"),
        maxJumpers: finiteNumber(value.maxJumpers, "maxJumpers", 0, 1000),
        explanation
      };
    default:
      throw new Error("未知约束类型。");
  }
}

function edge(value: unknown) {
  if (
    value === "top" ||
    value === "bottom" ||
    value === "left" ||
    value === "right" ||
    value === "short_side" ||
    value === "long_side" ||
    value === "any"
  ) {
    return value;
  }
  throw new Error("edge 必须是受支持的板边类型。");
}

function region(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("区域参数无效。");
  }
  return {
    x: finiteNumber(value.x, "region.x", 0, 10000),
    y: finiteNumber(value.y, "region.y", 0, 10000),
    width: finiteNumber(value.width, "region.width", 1, 10000),
    height: finiteNumber(value.height, "region.height", 1, 10000)
  };
}

function stringArray(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error("componentRefs 必须是非空数组。");
  }
  return value.map((item) => text(item, "componentRefs"));
}

function text(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} 不能为空。`);
  }
  return value.trim().slice(0, 200);
}

function finiteNumber(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} 超出有效范围。`);
  }
  return Math.round(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
