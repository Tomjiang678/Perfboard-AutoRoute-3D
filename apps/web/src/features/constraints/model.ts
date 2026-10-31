import type { DesignConstraint, PerfboardProject, PlacedComponent } from "../../types/project.ts";
import { normalizeBoardDefinition } from "../board/factory.ts";
import { buildPinOffsetsForComponent } from "../project/componentLibrary.ts";
import { chipProfileOf, normalizeAdapter } from "../project/adapter.ts";
import { isValidConstraintShape } from "../project/projectValidation.ts";

export const CONSTRAINT_SCHEMA_VERSION = 1;

const CONSTRAINT_KINDS = new Set([
  "component_in_region",
  "component_on_board_edge",
  "component_near_component",
  "component_lock",
  "component_orientation",
  "region_keepout",
  "power_rail",
  "net_jumper_limit",
  "component_adapter"
]);

const KIND_LABELS: Record<string, string> = {
  component_in_region: "限制元件在区域内",
  component_on_board_edge: "元件靠近板边",
  component_near_component: "元件靠近另一元件",
  component_lock: "锁定元件",
  component_orientation: "固定元件方向",
  region_keepout: "保留板上区域",
  power_rail: "建立电源母线",
  net_jumper_limit: "限制跳线数量",
  component_adapter: "插上转接板"
};

export function projectConstraints(project: PerfboardProject): DesignConstraint[] {
  return project.constraints ?? [];
}

export function activeConstraints(constraints: DesignConstraint[]) {
  return constraints.filter((constraint) => constraint.enabled && constraint.status === "active");
}

/**
 * 读入工程时把约束整理成当前结构：
 *  - 旧工程里没有 enabled/status/id 等字段的约束会被补全（否则会被 activeConstraints 静默丢掉）；
 *  - 元件重新导入后 id 会变，按位号把引用重新指回现有元件；
 *  - 无法识别的约束类型直接丢弃。
 */
export function normalizeConstraints(raw: unknown, components: PlacedComponent[]): DesignConstraint[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(components.map((component) => [component.id, component]));
  const byName = new Map(components.map((component) => [component.name.trim().toLowerCase(), component]));

  const resolve = (id: unknown, ref: unknown): PlacedComponent | undefined => {
    if (typeof id === "string") {
      const hit = byId.get(id);
      if (hit) return hit;
    }
    if (typeof ref === "string") {
      const hit = byName.get(ref.trim().toLowerCase());
      if (hit) return hit;
    }
    return undefined;
  };

  const constraints: DesignConstraint[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const kind = typeof record.kind === "string" ? record.kind : undefined;
    if (!kind || !CONSTRAINT_KINDS.has(kind)) continue;
    // 字段不完整的约束（例如缺 region）会在渲染时崩，直接丢弃
    if (!isValidConstraintShape(record)) continue;

    const enabled = record.enabled !== false;
    const status = record.status === "disabled" || record.status === "conflicted" || record.status === "orphaned"
      ? record.status
      : enabled ? "active" : "disabled";

    const base = {
      id: typeof record.id === "string" && record.id.length > 0 ? record.id : crypto.randomUUID(),
      strength: record.strength === "soft" ? ("soft" as const) : ("hard" as const),
      status: status as DesignConstraint["status"],
      enabled,
      sourceText: typeof record.sourceText === "string" ? record.sourceText : "",
      explanation: typeof record.explanation === "string" && record.explanation.trim().length > 0
        ? record.explanation
        : KIND_LABELS[kind] ?? kind,
      createdAt: typeof record.createdAt === "string" && record.createdAt.length > 0
        ? record.createdAt
        : new Date().toISOString()
    };

    const constraint = { ...record, ...base } as DesignConstraint;
    constraints.push(relinkConstraint(constraint, resolve));
  }
  return constraints;
}

function relinkConstraint(
  constraint: DesignConstraint,
  resolve: (id: unknown, ref: unknown) => PlacedComponent | undefined
): DesignConstraint {
  switch (constraint.kind) {
    case "component_in_region":
    case "component_on_board_edge":
    case "component_adapter": {
      const ids: string[] = [];
      const refs: string[] = [];
      const sourceIds = Array.isArray(constraint.componentIds) ? constraint.componentIds : [];
      const sourceRefs = Array.isArray(constraint.componentRefs) ? constraint.componentRefs : [];
      sourceIds.forEach((id, index) => {
        const hit = resolve(id, sourceRefs[index]);
        ids.push(hit ? hit.id : id);
        refs.push(hit ? hit.name : sourceRefs[index] ?? id);
      });
      return { ...constraint, componentIds: ids, componentRefs: refs };
    }
    case "component_lock":
    case "component_orientation": {
      const hit = resolve(constraint.componentId, constraint.componentRef);
      return hit
        ? { ...constraint, componentId: hit.id, componentRef: hit.name }
        : constraint;
    }
    case "component_near_component": {
      const hit = resolve(constraint.componentId, constraint.componentRef);
      const anchor = resolve(constraint.anchorComponentId, constraint.anchorComponentRef);
      return {
        ...constraint,
        componentId: hit ? hit.id : constraint.componentId,
        componentRef: hit ? hit.name : constraint.componentRef,
        anchorComponentId: anchor ? anchor.id : constraint.anchorComponentId,
        anchorComponentRef: anchor ? anchor.name : constraint.anchorComponentRef
      };
    }
    default:
      return constraint;
  }
}

export function withMigratedConstraints(project: PerfboardProject): PerfboardProject {
  const components = project.components.map((component) => {
    const migrated = component.kind === "to39" && component.leadSpacing < 2
      ? { ...component, leadSpacing: 2 }
      : component;
    const withPins = migrated === component
      ? migrated
      : { ...migrated, pinOffsets: buildPinOffsetsForComponent(migrated) };
    // 老工程里可能存着“14 脚芯片 + 16 脚转接板”，读入时统一到芯片脚数
    return withPins.adapter
      ? { ...withPins, adapter: normalizeAdapter(withPins.adapter, chipProfileOf(withPins)).adapter }
      : withPins;
  });

  return {
    ...project,
    board: normalizeBoardDefinition(project.board),
    components,
    constraints: normalizeConstraints(project.constraints, components),
    constraintSchemaVersion: CONSTRAINT_SCHEMA_VERSION
  };
}
