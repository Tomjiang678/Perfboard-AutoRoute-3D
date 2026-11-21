import type { PerfboardProject } from "../../types/project.ts";
import { withMigratedConstraints } from "../constraints/model.ts";
import { pruneProjectImportWarnings } from "../import/importWarnings.ts";
import { applyLibraryProfiles } from "../import/multisim/library.ts";
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
        placeholder,
        fallbackReason: placeholder ? component.fallbackReason : undefined
      };
    });
    migrated = { ...migrated, components, schemaVersion: 2 };
  }

  if ((migrated.schemaVersion ?? 1) < PROJECT_SCHEMA_VERSION) {
    // Schema 2 was written before prefix-inferred packages were marked as
    // placeholders. Repair only unbound inferred parts; a user-assigned
    // package has a different label, so it is left alone.
    const components = migrated.components.map((component) => {
      if (component.origin !== "import" || component.placeholder) return component;
      const parsed = migrated.importState.components.find((item) => item.ref === component.name);
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
  return importState === migrated.importState ? migrated : { ...migrated, importState };
}
