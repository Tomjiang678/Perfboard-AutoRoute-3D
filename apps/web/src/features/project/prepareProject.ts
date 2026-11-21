import type { PerfboardProject } from "../../types/project.ts";
import { withMigratedConstraints } from "../constraints/model.ts";
import { pruneProjectImportWarnings } from "../import/importWarnings.ts";
import { applyLibraryProfiles } from "../import/multisim/library.ts";
import { pendingComponentRefs } from "../import/multisim/pending.ts";
import { resolveProfileForComponent } from "../import/multisim/builtinProfiles.ts";
import { UNKNOWN_COMPONENT_LABEL } from "./componentTraits.ts";
import { classifyParsedComponent } from "../import/componentMapping.ts";

const PROJECT_SCHEMA_VERSION = 3;

/**
 * One normalization path for both startup and file-open:
 * migrate constraints, drop stale import warnings, and re-apply any pin profile
 * the user already taught (project copy first, local library as fallback).
 *
 * `isFallback`/`fromImport` are legacy fields. They are converted once to
 * `origin`/`placeholder`; after schema 3 nothing branches on the old flags.
 */
export function prepareProject(project: PerfboardProject): PerfboardProject {
  let migrated = pruneProjectImportWarnings(withMigratedConstraints(project));

  if ((migrated.schemaVersion ?? 1) < 2) {
    const importedRefs = new Set(migrated.importState.components.map((component) => component.ref));
    const components = migrated.components.map((component) => {
      const { isFallback, fromImport, ...rest } = component;
      const origin = component.origin ??
        (fromImport || importedRefs.has(component.name) ? "import" : "manual");
      const placeholder = component.placeholder ??
        (Boolean(isFallback) ||
          (origin === "import" && component.kind === "pin_header" && component.label === UNKNOWN_COMPONENT_LABEL));
      return {
        ...rest,
        origin,
        importRef: origin === "import" ? component.importRef ?? component.name : undefined,
        placeholder,
        fallbackReason: placeholder ? component.fallbackReason : undefined
      };
    });
    migrated = { ...migrated, components, schemaVersion: 2 };
  }

  if ((migrated.schemaVersion ?? 1) < PROJECT_SCHEMA_VERSION) {
    // Schema 2 was written before prefix-inferred packages were marked as
    // placeholders. Repair only unbound inferred parts; an explicitly selected
    // package is tracked by packageBound from schema 3 onward.
    const components = migrated.components.map((component) => {
      if (component.origin !== "import" || component.placeholder) return component;
      const ref = component.importRef ?? component.name;
      const parsed = migrated.importState.components.find((item) => item.ref === ref);
      if (!parsed) return component;
      const classified = classifyParsedComponent(parsed);
      if (!classified.placeholder || classified.label !== component.label) return component;
      return {
        ...component,
        placeholder: true,
        fallbackReason: classified.fallbackReason
      };
    });
    migrated = { ...migrated, components, schemaVersion: PROJECT_SCHEMA_VERSION };
  }

  const importState = applyLibraryProfiles(migrated.importState);
  const pending = pendingComponentRefs(importState);
  const parsedRefs = new Set(importState.components.map((component) => component.ref));
  let healed = false;
  const components = migrated.components.map((component) => {
    if (component.origin !== "import") return component;
    const ref = component.importRef ?? component.name;
    const next = component.importRef ? component : { ...component, importRef: ref };
    const hasProfile = importState.components.some((parsed) =>
      parsed.ref === ref && Boolean(resolveProfileForComponent(importState.pinProfiles ?? [], parsed))
    );
    if (next.placeholder && hasProfile && parsedRefs.has(ref) && !pending.has(ref)) {
      healed = true;
      return { ...next, placeholder: false, fallbackReason: undefined };
    }
    if (next !== component) healed = true;
    return next;
  });
  const normalized = healed ? { ...migrated, components } : migrated;
  return importState === normalized.importState ? normalized : { ...normalized, importState };
}
