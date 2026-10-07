import type { PerfboardProject } from "../../types/project.ts";
import { isDrcWarning, stripDrcWarnings } from "../routing/drcWarnings.ts";

export function invalidateDrcIfInputsChanged(current: PerfboardProject, next: PerfboardProject) {
  const inputsChanged = current.board !== next.board ||
    current.components !== next.components ||
    current.importState !== next.importState ||
    current.routing.traces !== next.routing.traces ||
    current.routing.jumpers !== next.routing.jumpers;
  const validationChanged = current.routing.drc !== next.routing.drc ||
    current.routing.diagnostics !== next.routing.diagnostics;
  const hasValidation = Boolean(next.routing.drc || next.routing.diagnostics || next.routing.warnings.some(isDrcWarning));

  if (!inputsChanged || validationChanged || !hasValidation) return next;
  return {
    ...next,
    routing: {
      ...next.routing,
      drc: undefined,
      diagnostics: undefined,
      warnings: stripDrcWarnings(next.routing.warnings)
    }
  };
}
