import type { PerfboardProject, PinProfile } from "../../types/project.ts";
import { createPlacedComponentsFromParsed } from "../import/componentMapping.ts";
import { identityKey, profileMatchesComponent } from "../import/multisim/profile.ts";
import { upsertProfile } from "../import/multisim/library.ts";
import { buildPinOffsetsForComponent } from "./componentLibrary.ts";
import { componentImportRef } from "./componentTraits.ts";
import { invalidateComponentRouting } from "../routing/invalidateComponentRouting.ts";

/**
 * Persist one taught pin profile into a project and append any imported
 * components that become resolvable as a result. This is the single place
 * where "profile saved" and "component generated" are allowed to meet.
 */
export function applyPinProfile(project: PerfboardProject, profile: PinProfile): PerfboardProject {
  const refs = new Set(
    project.importState.components
      .filter((component) => profileMatchesComponent(profile, component))
      .map((component) => component.ref)
  );

  const components = project.components.map((component) => {
    if (!refs.has(componentImportRef(component))) return component;
    const needsUpdate = component.pinCount !== profile.pinCount ||
      component.placeholder === true ||
      component.fallbackReason !== undefined;
    if (!needsUpdate) return component;
    const next = {
      ...component,
      pinCount: profile.pinCount,
      mounted: false,
      placeholder: false,
      fallbackReason: undefined,
      adapter: component.adapter?.pinCount === profile.pinCount ? component.adapter : undefined
    };
    return { ...next, pinOffsets: buildPinOffsetsForComponent(next) };
  });

  const changed = new Set(
    components
      .filter((component, index) => component !== project.components[index])
      .map((component) => componentImportRef(component))
  );
  const importState = {
    ...project.importState,
    pinProfiles: upsertProfile(project.importState.pinProfiles ?? [], profile),
    pinProfileChoices: Object.fromEntries(
      Object.entries(project.importState.pinProfileChoices ?? {})
        .filter(([key]) => key !== identityKey(profile.identity))
    ),
    components: project.importState.components.map((component) =>
      refs.has(component.ref)
        ? { ...component, pinCount: profile.pinCount, pinCountSource: "user" as const }
        : component
    )
  };

  const created = createPlacedComponentsFromParsed(importState, components, project.board.width)
    .map((component) => refs.has(componentImportRef(component))
      ? { ...component, placeholder: false, fallbackReason: undefined }
      : component);

  return {
    ...project,
    components: [...components, ...created],
    routing: changed.size > 0 ? invalidateComponentRouting(project, [...changed]) : project.routing,
    importState
  };
}
