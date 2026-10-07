import {
  buildPinOffsetsForComponent,
  getLibraryComponentByKind
} from "../project/componentLibrary.ts";
import { clampSpacing, UNKNOWN_COMPONENT_LABEL } from "../project/componentTraits.ts";
import type { ImportState, LibraryComponentKind, ParsedComponent, PlacedComponent } from "../../types/project.ts";
import { componentMappingRules, fallbackComponentMapping, ignoredComponentRules, normalizeComponentFields } from "./importConfig.ts";

export const PLACEHOLDER_NOTE = "已按网表引脚生成占位排针";

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
        leadSpacing: clampSpacing(library.kind, mapped.leadSpacing ?? library.leadSpacing, "leadSpacing"),
        rowSpacing: clampSpacing(library.kind, mapped.rowSpacing ?? library.rowSpacing, "rowSpacing"),
        sameSidePitch: clampSpacing(library.kind, library.sameSidePitch, "sameSidePitch")
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

  // Generic inference fallback: library-name independent, so netlists exported
  // from schematics that were imported from other EDA tools (LTSpice, Altium,
  // PADS, EasyEDA, ...) still land on a sensible package.
  const inferred = inferKindFromComponent(component, pinsFromNetlist);
  if (inferred) {
    return inferred;
  }

  return {
    ...fallbackComponentMapping,
    label: UNKNOWN_COMPONENT_LABEL,
    pinCount: Math.max(2, pinsFromNetlist ?? fallbackComponentMapping.pinCount),
    isFallback: true,
    fallbackReason: `元件 ${component.ref} (${component.category}) 在库中没有对应封装，${PLACEHOLDER_NOTE}。`
  };
}

function inferKindFromComponent(component: ParsedComponent, pinsFromNetlist: number | undefined) {
  const ref = component.ref.toUpperCase();
  const value = component.value.toUpperCase();
  const pins = Math.max(1, pinsFromNetlist ?? 2);
  const prefix = ref.match(/^[A-Z#]+/)?.[0] ?? "";

  if (/^(LED|DS)/.test(prefix) || value.includes("LED")) {
    return { kind: "led" as const, label: "LED", pinCount: pins, leadSpacing: 1 };
  }
  if (prefix === "R") {
    return { kind: "resistor" as const, label: "R", pinCount: pins, leadSpacing: 3 };
  }
  if (prefix === "C") {
    return { kind: "radial_capacitor" as const, label: "C", pinCount: pins, leadSpacing: 1 };
  }
  if (prefix === "L") {
    return { kind: "inductor" as const, label: "L", pinCount: pins, leadSpacing: 3 };
  }
  if (prefix === "D") {
    return { kind: "diode" as const, label: "D", pinCount: pins, leadSpacing: 3 };
  }
  if (prefix === "Q") {
    return { kind: pins <= 3 ? "to92" as const : "to220" as const, label: "Q", pinCount: pins, leadSpacing: 1 };
  }
  if (prefix === "SW") {
    return { kind: pins === 4 ? "tactile_switch" as const : "slide_switch" as const, label: "SW", pinCount: pins, leadSpacing: 1 };
  }
  if (prefix === "U") {
    return { kind: "dip" as const, label: `DIP${pins}`, pinCount: pins, rowSpacing: 3 };
  }
  if (prefix === "K") {
    return { kind: "relay" as const, label: "RLY", pinCount: pins, rowSpacing: 1 };
  }
  if (prefix === "Y") {
    return { kind: "crystal" as const, label: "Y", pinCount: pins, leadSpacing: 2 };
  }
  if (/^(J|P|X|TP)/.test(prefix)) {
    return { kind: "pin_header" as const, label: "HDR", pinCount: pins };
  }
  return undefined;
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
