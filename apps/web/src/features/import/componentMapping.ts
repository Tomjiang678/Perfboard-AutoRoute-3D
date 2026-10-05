import {
  buildPinOffsetsForComponent,
  getLibraryComponentByKind
} from "../project/componentLibrary.ts";
import type { ImportState, LibraryComponentKind, ParsedComponent, PlacedComponent } from "../../types/project.ts";
import { componentMappingRules, fallbackComponentMapping, ignoredComponentRules, normalizeComponentFields } from "./importConfig.ts";

export function createPlacedComponentsFromParsed(
  importState: ImportState,
  existingComponents: PlacedComponent[],
  boardWidth: number
): PlacedComponent[] {
  const existingNames = new Set(existingComponents.map((component) => component.name));
  const pinCountByRef = new Map<string, number>();
  Object.entries(importState.pinInfo ?? {}).forEach(([ref, pins]) => {
    pinCountByRef.set(ref, Object.keys(pins).length);
  });
  const nextComponents: PlacedComponent[] = [];

  importState.components
    .filter((component) => !shouldIgnoreComponent(component))
    .forEach((component) => {
      if (existingNames.has(component.ref)) {
        return;
      }

      const mapped = mapParsedComponent(component, pinCountByRef.get(component.ref));
      const library = getLibraryComponentByKind(mapped.kind, mapped.pinCount);
      if (!library) {
        return;
      }

      const index = existingComponents.length + nextComponents.length;
      const columns = Math.max(1, Math.floor(boardWidth / 8));
      const position: [number, number] = [
        3 + (index % columns) * 8,
        3 + Math.floor(index / columns) * 6
      ];
      const base = {
        kind: library.kind,
        pinCount: mapped.pinCount ?? library.pinCount,
        leadSpacing: mapped.leadSpacing ?? library.leadSpacing,
        rowSpacing: mapped.rowSpacing ?? library.rowSpacing,
        sameSidePitch: library.sameSidePitch
      };

      nextComponents.push({
        id: crypto.randomUUID(),
        kind: library.kind,
        label: mapped.label,
        name: component.ref,
        value: component.value,
        pinCount: base.pinCount,
        leadSpacing: base.leadSpacing,
        rowSpacing: base.rowSpacing,
        sameSidePitch: base.sameSidePitch,
        pinOffsets: buildPinOffsetsForComponent(base),
        position,
        rotation: 0,
        mounted: false,
        isFallback: mapped.isFallback,
        fallbackReason: mapped.fallbackReason
      });
    });

  return nextComponents;
}

function shouldIgnoreComponent(component: ParsedComponent) {
  const fields = normalizeComponentFields(component);
  return ignoredComponentRules.some((rule) => rule.match(fields));
}

function mapParsedComponent(component: ParsedComponent, pinsFromNetlist: number | undefined): {
  kind: LibraryComponentKind;
  label: string;
  pinCount?: number;
  leadSpacing?: number;
  rowSpacing?: number;
  isFallback?: boolean;
  fallbackReason?: string;
} {
  const fields = normalizeComponentFields(component);
  const rule = componentMappingRules.find((candidate) => candidate.match(fields));

  if (rule) {
    const pinCount = rule.pinCount?.(component, pinsFromNetlist);
    return {
      kind: rule.kind,
      label: makeMappedLabel(rule.kind, rule.label, pinCount),
      pinCount,
      leadSpacing: rule.leadSpacing,
      rowSpacing: rule.rowSpacing
    };
  }

  return {
    ...fallbackComponentMapping,
    label: "UNK",
    pinCount: Math.max(2, pinsFromNetlist ?? fallbackComponentMapping.pinCount),
    isFallback: true,
    fallbackReason: `元件 ${component.ref} (${component.category}) 在库中没有对应封装，已按网表引脚生成占位排针。`
  };
}

function makeMappedLabel(kind: LibraryComponentKind, label: string, pinCount?: number) {
  if (kind === "dip" && pinCount) {
    return `DIP${pinCount}`;
  }
  if (kind === "dip_switch" && pinCount) {
    return `DIPSW${Math.max(1, Math.floor(pinCount / 2))}`;
  }
  return label;
}
