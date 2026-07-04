import {
  buildPinOffsetsForComponent,
  getLibraryComponentByKind
} from "../project/componentLibrary";
import type { LibraryComponentKind, ParsedComponent, PlacedComponent } from "../../types/project";
import { componentMappingRules, fallbackComponentMapping } from "./importConfig";

export function createPlacedComponentsFromParsed(
  parsedComponents: ParsedComponent[],
  existingComponents: PlacedComponent[],
  boardWidth: number
): PlacedComponent[] {
  const existingNames = new Set(existingComponents.map((component) => component.name));
  const nextComponents: PlacedComponent[] = [];

  parsedComponents
    .filter((component) => shouldCreatePhysicalComponent(component))
    .forEach((component) => {
      if (existingNames.has(component.ref)) {
        return;
      }

      const mapped = mapParsedComponent(component);
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
        mounted: false
      });
    });

  return nextComponents;
}

function shouldCreatePhysicalComponent(component: ParsedComponent) {
  const category = component.category.toUpperCase();
  const value = component.value.toUpperCase();

  if (category === "POWER_SOURCES") {
    return false;
  }

  if (component.ref === "0" || value === "GROUND") {
    return false;
  }

  return true;
}

function mapParsedComponent(component: ParsedComponent): {
  kind: LibraryComponentKind;
  label: string;
  pinCount?: number;
  leadSpacing?: number;
  rowSpacing?: number;
} {
  const refPrefix = component.ref.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? "";
  const category = component.category.toUpperCase();
  const packageName = component.packageName.toUpperCase();
  const value = component.value.toUpperCase();
  const fields = { refPrefix, category, packageName, value };
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

  return fallbackComponentMapping;
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
