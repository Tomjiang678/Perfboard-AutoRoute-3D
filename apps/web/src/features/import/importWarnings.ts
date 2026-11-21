import type { ImportState, ImportWarning, PerfboardProject } from "../../types/project.ts";

const BUNDLE_CODES = new Set(["missing_crossref", "missing_netlist"]);
const LEGACY_BUNDLE_PREFIXES = ["缺少交叉引用报告", "缺少网表报告"];

/** Old "missing half" warnings describe a past import, not the current state. */
export function stripBundleWarnings(warnings: ImportWarning[]) {
  return warnings.filter((warning) => !isBundleWarning(warning));
}

function isBundleWarning(warning: ImportWarning) {
  if (warning.code) return BUNDLE_CODES.has(warning.code);
  return LEGACY_BUNDLE_PREFIXES.some((prefix) => warning.message.startsWith(prefix));
}

export function pruneResolvedBundleWarnings(state: ImportState): ImportState {
  if (state.components.length === 0 || state.nets.length === 0) {
    return state;
  }
  const warnings = stripBundleWarnings(state.warnings);
  return warnings.length === state.warnings.length ? state : { ...state, warnings };
}

export function pruneProjectImportWarnings(project: PerfboardProject): PerfboardProject {
  const importState = pruneResolvedBundleWarnings(project.importState);
  return importState === project.importState ? project : { ...project, importState };
}
