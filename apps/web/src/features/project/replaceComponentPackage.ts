import type { LibraryComponentDefinition } from "./componentLibrary.ts";
import type { PerfboardProject } from "../../types/project.ts";
import { clampSpacing, componentImportRef } from "./componentTraits.ts";
import { invalidateComponentRouting } from "../routing/invalidateComponentRouting.ts";

/** Swap the physical package of an imported component and drop stale copper. */
export function replaceComponentPackage(
  project: PerfboardProject,
  componentId: string,
  definition: LibraryComponentDefinition
): PerfboardProject {
  const component = project.components.find((item) => item.id === componentId);
  if (!component) return project;

  const pinCount = definition.pinCount ?? component.pinCount;
  if (!pinCount || pinCount !== component.pinCount) return project;

  const base = {
    kind: definition.kind,
    pinCount,
    leadSpacing: clampSpacing(definition.kind, definition.leadSpacing, "leadSpacing"),
    rowSpacing: clampSpacing(definition.kind, definition.rowSpacing, "rowSpacing"),
    sameSidePitch: clampSpacing(definition.kind, definition.sameSidePitch, "sameSidePitch")
  };

  return {
    ...project,
    components: project.components.map((item) =>
      item.id === componentId
        ? {
          ...item,
          ...base,
          label: definition.label,
          pinOffsets: definition.pinOffsets.map(([x, y]) => [x, y] as [number, number]),
          pinHeaderRows: undefined,
          pinHeaderColumns: undefined,
          adapter: undefined,
          origin: "import",
          importRef: component.importRef ?? component.name,
          packageBound: true,
          placeholder: false,
          fallbackReason: undefined
        }
        : item
    ),
    routing: invalidateComponentRouting(project, componentImportRef(component))
  };
}
