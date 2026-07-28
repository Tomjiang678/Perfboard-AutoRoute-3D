import {
  buildPinOffsetsForComponent,
  getLibraryComponentByKind
} from "../project/componentLibrary";
import type { LibraryComponentKind, ParsedComponent, ParsedNet, PlacedComponent } from "../../types/project";
import { buildFallbackPinMaps } from "./fallbackPinMapping";
import { componentMappingRules, fallbackComponentMapping, ignoredComponentRules, normalizeComponentFields } from "./importConfig";

export function createPlacedComponentsFromParsed(
  parsedComponents: ParsedComponent[],
  parsedNets: ParsedNet[],
  existingComponents: PlacedComponent[],
  boardWidth: number
): PlacedComponent[] {
  const existingNames = new Set(existingComponents.map((component) => component.name));
  const fallbackPinMaps = buildFallbackPinMaps(parsedNets);
  const nextComponents: PlacedComponent[] = [];

  parsedComponents
    .filter((component) => shouldCreatePhysicalComponent(component))
    .forEach((component) => {
      if (existingNames.has(component.ref)) {
        return;
      }

      const mapped = mapParsedComponent(component, fallbackPinMaps.get(component.ref));
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
        fallbackReason: mapped.fallbackReason,
        fallbackPinMap: mapped.fallbackPinMap
      });
    });

  return nextComponents;
}

function shouldCreatePhysicalComponent(component: ParsedComponent) {
  const fields = normalizeComponentFields(component);
  return !ignoredComponentRules.some((rule) => rule.match(fields));
}

function mapParsedComponent(component: ParsedComponent, fallbackPinMap: Record<string, number> | undefined): {
  kind: LibraryComponentKind;
  label: string;
  pinCount?: number;
  leadSpacing?: number;
  rowSpacing?: number;
  isFallback?: boolean;
  fallbackReason?: string;
  fallbackPinMap?: Record<string, number>;
} {
  const fields = normalizeComponentFields(component);
  const rule = componentMappingRules.find((candidate) => candidate.match(fields));

  if (rule) {
    const pinCount = rule.pinCount?.(component);
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
    pinCount: Math.max(2, Object.keys(fallbackPinMap ?? {}).length || fallbackComponentMapping.pinCount),
    isFallback: true,
    fallbackReason: `元件 ${component.ref} (${component.value}) 在库中没有对应封装，已按网表引脚生成占位排针。`,
    fallbackPinMap
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
