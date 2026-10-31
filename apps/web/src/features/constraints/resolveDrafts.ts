import type { DesignConstraint, PerfboardProject, PlacedComponent } from "../../types/project.ts";
import type { ConstraintDraft } from "./drafts.ts";

export interface ResolveDraftsResult {
  constraints: DesignConstraint[];
  errors: string[];
}

export function resolveConstraintDrafts(
  drafts: ConstraintDraft[],
  sourceText: string,
  project: PerfboardProject
): ResolveDraftsResult {
  const errors: string[] = [];
  const constraints: DesignConstraint[] = [];
  for (const draft of drafts) {
    try {
      constraints.push(resolveDraft(draft, sourceText, project));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "指令解析失败。");
    }
  }
  return { constraints, errors };
}

function resolveDraft(draft: ConstraintDraft, sourceText: string, project: PerfboardProject): DesignConstraint {
  const base = {
    id: crypto.randomUUID(),
    strength: draft.strength,
    status: "active" as const,
    enabled: true,
    sourceText,
    explanation: draft.explanation ?? defaultExplanation(draft),
    createdAt: new Date().toISOString()
  };
  switch (draft.kind) {
    case "component_in_region": {
      const components = draft.componentRefs.map((ref) => resolveComponent(ref, project.components));
      validateRegion(draft.region, project);
      validateComponentsFitRegion(components, draft.region);
      return { ...base, kind: draft.kind, componentIds: components.map((item) => item.id), componentRefs: components.map((item) => item.name), region: draft.region };
    }
    case "component_on_board_edge": {
      const components = draft.componentRefs.map((ref) => resolveComponent(ref, project.components));
      const minDepth = Math.max(...components.map((component) => minimumEdgeBandDepth(component)));
      if (draft.depth !== undefined && draft.depth < minDepth) {
        throw new Error(`边缘带深度 ${draft.depth} 无法容纳 ${components.map((component) => component.name).join("、")}，至少需要 ${minDepth}。`);
      }
      return {
        ...base,
        kind: draft.kind,
        componentIds: components.map((item) => item.id),
        componentRefs: components.map((item) => item.name),
        edge: draft.edge,
        depth: draft.depth ?? minDepth
      };
    }
    case "component_near_component": {
      const component = resolveComponent(draft.componentRef, project.components);
      const anchor = resolveComponent(draft.anchorComponentRef, project.components);
      return { ...base, kind: draft.kind, componentId: component.id, componentRef: component.name, anchorComponentId: anchor.id, anchorComponentRef: anchor.name, maxDistance: draft.maxDistance };
    }
    case "component_lock": {
      const component = resolveComponent(draft.componentRef, project.components);
      return { ...base, kind: draft.kind, componentId: component.id, componentRef: component.name, lockPosition: draft.lockPosition, lockRotation: draft.lockRotation };
    }
    case "component_orientation": {
      const component = resolveComponent(draft.componentRef, project.components);
      return { ...base, kind: draft.kind, componentId: component.id, componentRef: component.name, rotationDegrees: normalizeDegrees(draft.rotationDegrees) };
    }
    case "region_keepout":
      validateRegion(draft.region, project);
      return { ...base, ...draft };
    case "power_rail":
      {
      const net = validateNet(draft.net, project);
      validateRail(draft, project);
      return { ...base, ...draft, net };
      }
    case "net_jumper_limit":
      return { ...base, ...draft, net: validateNet(draft.net, project) };
    case "component_adapter": {
      const components = draft.componentRefs.map((ref) => resolveComponent(ref, project.components));
      // 只保留 AI 真正给出的字段，缺省的交由默认预设补齐
      const requested = draft.remove
        ? null
        : {
            ...(draft.width === undefined ? {} : { width: draft.width }),
            ...(draft.height === undefined ? {} : { height: draft.height }),
            ...(draft.rowSpacing === undefined ? {} : { rowSpacing: draft.rowSpacing })
          };
      return {
        ...base,
        kind: draft.kind,
        componentIds: components.map((item) => item.id),
        componentRefs: components.map((item) => item.name),
        requested
      };
    }
  }
}

function resolveComponent(ref: string, components: PlacedComponent[]) {
  const normalized = ref.trim().toLowerCase();
  const exact = components.filter((component) => component.name.toLowerCase() === normalized || component.id.toLowerCase() === normalized);
  if (exact.length === 1) return exact[0];
  const byLabel = components.filter((component) => component.label.toLowerCase() === normalized || component.value.toLowerCase() === normalized);
  if (byLabel.length === 1) return byLabel[0];
  if (exact.length + byLabel.length > 1) throw new Error(`“${ref}”匹配到多个元件，请使用明确位号。`);
  throw new Error(`工程中找不到元件“${ref}”。`);
}

function validateNet(net: string, project: PerfboardProject) {
  const matches = project.importState.nets.filter((candidate) => candidate.name.toLowerCase() === net.toLowerCase());
  if (matches.length !== 1) throw new Error(`工程中找不到唯一网络“${net}”，不会自动合并相似电源网络。`);
  return matches[0].name;
}

function validateRegion(region: { x: number; y: number; width: number; height: number }, project: PerfboardProject) {
  if (region.x + region.width > project.board.width || region.y + region.height > project.board.height) {
    throw new Error(`区域 (${region.x}, ${region.y}, ${region.width}, ${region.height}) 超出板边界。`);
  }
}

function validateComponentsFitRegion(components: PlacedComponent[], region: { width: number; height: number }) {
  const failed = components.filter((component) => !canComponentFitRegion(component, region));
  if (failed.length > 0) {
    throw new Error(`区域 ${region.width}×${region.height} 无法容纳 ${failed.map((component) => component.name).join("、")} 的实际占用尺寸。`);
  }
}

function minimumEdgeBandDepth(component: PlacedComponent) {
  return Math.min(...feasibleFootprintSizes(component).map((size) => Math.min(size.width, size.height)));
}

function canComponentFitRegion(component: PlacedComponent, region: { width: number; height: number }) {
  return feasibleFootprintSizes(component).some((size) => size.width <= region.width && size.height <= region.height);
}

function feasibleFootprintSizes(component: PlacedComponent) {
  const base = footprintSize(component.pinOffsets);
  return [
    base,
    { width: base.height, height: base.width }
  ].filter((size, index, list) => list.findIndex((candidate) => candidate.width === size.width && candidate.height === size.height) === index);
}

function footprintSize(pinOffsets: Array<[number, number]>) {
  if (pinOffsets.length === 0) return { width: 1, height: 1 };
  const xs = pinOffsets.map(([x]) => x);
  const ys = pinOffsets.map(([, y]) => y);
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  const height = Math.max(...ys) - Math.min(...ys) + 1;
  const margin = pinOffsets.length <= 2 ? 1 : 0;
  return {
    width: width + margin * 2,
    height: height + margin * 2
  };
}

function validateRail(draft: Extract<ConstraintDraft, { kind: "power_rail" }>, project: PerfboardProject) {
  if (project.board.kind === "breadboard") {
    throw new Error("面包板不支持电源母线约束。");
  }
  const axisLimit = draft.axis === "row" ? project.board.height : project.board.width;
  const rangeLimit = draft.axis === "row" ? project.board.width : project.board.height;
  if (draft.index >= axisLimit || draft.from > draft.to || draft.to >= rangeLimit) {
    throw new Error(`${draft.net} 母线坐标超出板边界。`);
  }
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function defaultExplanation(draft: ConstraintDraft) {
  switch (draft.kind) {
    case "component_in_region": return `${draft.componentRefs.join("、")} 放入指定区域`;
    case "component_on_board_edge": return `${draft.componentRefs.join("、")} 靠近板边`;
    case "component_near_component": return `${draft.componentRef} 靠近 ${draft.anchorComponentRef}`;
    case "component_lock": return `锁定 ${draft.componentRef}`;
    case "component_orientation": return `${draft.componentRef} 固定方向 ${draft.rotationDegrees}°`;
    case "region_keepout": return "保留指定板上区域";
    case "power_rail": return `建立 ${draft.net} 连续母线`;
    case "net_jumper_limit": return `限制 ${draft.net} 跳线数量`;
    case "component_adapter": return draft.remove
      ? `移除 ${draft.componentRefs.join("、")} 的转接板`
      : `给 ${draft.componentRefs.join("、")} 插上转接板`;
  }
}
