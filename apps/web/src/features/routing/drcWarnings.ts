const LEGACY_DRC_WARNING = /^(?:DRC:|(?:ERROR|WARNING) [A-Z][A-Z0-9_]*(?: |:|$))/;
const CONSTRAINT_WARNING_PREFIX = "约束：";

export function isDrcWarning(warning: string) {
  return LEGACY_DRC_WARNING.test(warning);
}

export function stripDrcWarnings(warnings: string[]) {
  return warnings.filter((warning) => !isDrcWarning(warning));
}

/**
 * 约束报告每次都会重新生成，旧的必须清掉，
 * 否则反复跑 DRC 会让同一条“约束：…”越积越多。
 */
export function stripConstraintWarnings(warnings: string[]) {
  return warnings.filter((warning) => !warning.startsWith(CONSTRAINT_WARNING_PREFIX));
}
