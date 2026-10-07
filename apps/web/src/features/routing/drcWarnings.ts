const LEGACY_DRC_WARNING = /^(?:DRC:|(?:ERROR|WARNING) [A-Z][A-Z0-9_]*(?: |:|$))/;

export function isDrcWarning(warning: string) {
  return LEGACY_DRC_WARNING.test(warning);
}

export function stripDrcWarnings(warnings: string[]) {
  return warnings.filter((warning) => !isDrcWarning(warning));
}
