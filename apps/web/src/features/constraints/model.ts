import type { DesignConstraint, PerfboardProject } from "../../types/project.ts";
import { normalizeBoardDefinition } from "../board/factory.ts";

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
    constraints: Array.isArray(project.constraints) ? project.constraints : [],
    constraintSchemaVersion: CONSTRAINT_SCHEMA_VERSION
  };
}
