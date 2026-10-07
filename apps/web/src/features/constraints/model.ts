import type { DesignConstraint, PerfboardProject } from "../../types/project.ts";
import { normalizeBoardDefinition } from "../board/factory.ts";
import { buildPinOffsetsForComponent } from "../project/componentLibrary.ts";

export const CONSTRAINT_SCHEMA_VERSION = 1;

export function projectConstraints(project: PerfboardProject): DesignConstraint[] {
  return project.constraints ?? [];
}

export function activeConstraints(constraints: DesignConstraint[]) {
  return constraints.filter((constraint) => constraint.enabled && constraint.status === "active");
}

export function withMigratedConstraints(project: PerfboardProject): PerfboardProject {
  return {
    ...project,
    board: normalizeBoardDefinition(project.board),
    components: project.components.map((component) => {
      if (component.kind !== "to39" || component.leadSpacing >= 2) return component;
      const migrated = { ...component, leadSpacing: 2 };
      return { ...migrated, pinOffsets: buildPinOffsetsForComponent(migrated) };
    }),
    constraints: Array.isArray(project.constraints) ? project.constraints : [],
    constraintSchemaVersion: CONSTRAINT_SCHEMA_VERSION
  };
}
