/**
 * 打开工程前的结构校验。
 *
 * 只做“能不能安全渲染”的检查：缺字段的工程一旦被载入，渲染层会直接崩，
 * 而且会被写回本地存储，导致刷新后仍然打不开。所以宁可拒绝载入。
 *
 * 校验是逐层的：外层数组之外，网络节点、元件引脚、走锡路径、约束内部结构都要查，
 * 否则 `nets: [{ name: "N" }]` 这种数据会一路通过，直到引脚解析时崩掉。
 */
export interface ProjectValidationResult {
  ok: boolean;
  issues: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isGridPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]);
}

function isRegion(value: unknown): boolean {
  return isRecord(value) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    (value.width as number) >= 0 &&
    (value.height as number) >= 0;
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * 约束按类型校验内部字段：只检查 kind 是不够的，
 * 例如 `{ kind: "region_keepout" }` 缺少 region，渲染时会读 undefined.x 直接崩。
 */
export function isValidConstraintShape(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  const hasIds = isStringArray(value.componentIds);
  const hasRefs = isStringArray(value.componentRefs);

  switch (value.kind) {
    case "component_in_region":
      return hasIds && hasRefs && isRegion(value.region);
    case "component_on_board_edge":
      return hasIds && hasRefs && typeof value.edge === "string";
    case "component_near_component":
      return typeof value.componentId === "string" &&
        typeof value.componentRef === "string" &&
        typeof value.anchorComponentId === "string" &&
        typeof value.anchorComponentRef === "string" &&
        Number.isFinite(value.maxDistance);
    case "component_lock":
      return typeof value.componentId === "string" &&
        typeof value.componentRef === "string" &&
        typeof value.lockPosition === "boolean" &&
        typeof value.lockRotation === "boolean";
    case "component_orientation":
      return typeof value.componentId === "string" &&
        typeof value.componentRef === "string" &&
        Number.isFinite(value.rotationDegrees);
    case "region_keepout":
      return isRegion(value.region) &&
        typeof value.blockPlacement === "boolean" &&
        typeof value.blockBottomRouting === "boolean" &&
        typeof value.blockJumpers === "boolean";
    case "power_rail":
      return typeof value.net === "string" &&
        (value.axis === "row" || value.axis === "column") &&
        Number.isFinite(value.index) &&
        Number.isFinite(value.from) &&
        Number.isFinite(value.to);
    case "net_jumper_limit":
      return typeof value.net === "string" && Number.isFinite(value.maxJumpers);
    case "component_adapter":
      return hasIds && hasRefs && (value.requested === null || value.requested === undefined || isRecord(value.requested));
    default:
      return false;
  }
}

export function validateProjectShape(raw: unknown): ProjectValidationResult {
  const issues: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, issues: ["工程文件不是有效的 JSON 对象"] };
  }

  if (typeof raw.id !== "string" || raw.id.length === 0) issues.push("缺少工程 id");
  if (typeof raw.name !== "string") issues.push("缺少工程名称");

  const board = raw.board;
  if (!isRecord(board)) {
    issues.push("缺少 board");
  } else {
    if (!Number.isFinite(board.width) || !Number.isFinite(board.height) || (board.width as number) < 1 || (board.height as number) < 1) {
      issues.push("board 尺寸无效");
    }
  }

  if (!Array.isArray(raw.components)) {
    issues.push("缺少 components 数组");
  } else {
    const broken = raw.components.filter((component) => !(
      isRecord(component) &&
      typeof component.id === "string" &&
      typeof component.name === "string" &&
      typeof component.kind === "string" &&
      Array.isArray(component.pinOffsets) &&
      component.pinOffsets.every(isGridPoint) &&
      isGridPoint(component.position) &&
      Number.isFinite(component.rotation)
    ));
    if (broken.length > 0) {
      issues.push(`${broken.length} 个元件缺少必要字段`);
    }
  }

  const importState = raw.importState;
  if (!isRecord(importState)) {
    issues.push("缺少 importState");
  } else {
    if (!Array.isArray(importState.nets)) {
      issues.push("importState.nets 不是数组");
    } else {
      const brokenNets = importState.nets.filter((net) => !(
        isRecord(net) &&
        typeof net.name === "string" &&
        Array.isArray(net.nodes) &&
        net.nodes.every((node) => isRecord(node) && typeof node.ref === "string" && (typeof node.pin === "string" || Number.isFinite(node.pin)))
      ));
      if (brokenNets.length > 0) {
        issues.push(`${brokenNets.length} 个网络缺少 nodes 或节点字段不完整`);
      }
    }
    if (!Array.isArray(importState.components)) issues.push("importState.components 不是数组");
    if (!Array.isArray(importState.warnings)) issues.push("importState.warnings 不是数组");
  }

  const routing = raw.routing;
  if (!isRecord(routing)) {
    issues.push("缺少 routing");
  } else {
    for (const field of ["traces", "jumpers", "failedNets", "warnings"]) {
      if (!Array.isArray(routing[field])) issues.push(`routing.${field} 不是数组`);
    }
    if (Array.isArray(routing.traces)) {
      const brokenTraces = routing.traces.filter((trace) => !(
        isRecord(trace) &&
        typeof trace.id === "string" &&
        typeof trace.net === "string" &&
        Array.isArray(trace.points) &&
        trace.points.length >= 2 &&
        trace.points.every(isGridPoint)
      ));
      if (brokenTraces.length > 0) {
        issues.push(`${brokenTraces.length} 条走锡路径无效（坐标必须是有限整数且至少两点）`);
      }
    }
    if (Array.isArray(routing.jumpers)) {
      const brokenJumpers = routing.jumpers.filter((jumper) => !(
        isRecord(jumper) &&
        typeof jumper.id === "string" &&
        typeof jumper.net === "string" &&
        isGridPoint(jumper.from) &&
        isGridPoint(jumper.to)
      ));
      if (brokenJumpers.length > 0) {
        issues.push(`${brokenJumpers.length} 根跳线端点无效`);
      }
    }
  }

  if (raw.constraints !== undefined) {
    if (!Array.isArray(raw.constraints)) {
      issues.push("constraints 不是数组");
    } else {
      const brokenConstraints = raw.constraints.filter((constraint) => !isValidConstraintShape(constraint));
      if (brokenConstraints.length > 0) {
        issues.push(`${brokenConstraints.length} 条约束字段不完整`);
      }
    }
  }

  if (raw.files !== undefined && !Array.isArray(raw.files)) {
    issues.push("files 不是数组");
  }

  return { ok: issues.length === 0, issues };
}
