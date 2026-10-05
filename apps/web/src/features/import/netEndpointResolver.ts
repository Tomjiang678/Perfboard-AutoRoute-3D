import type { ImportState, PlacedComponent, RoutedNetEndpoint } from "../../types/project.ts";
import { resolveImportPins } from "./pinResolver.ts";
import { pinGridPosition } from "../board/placement.ts";

export function resolveNetEndpoints(importState: ImportState, components: PlacedComponent[]): RoutedNetEndpoint[] {
  const componentMap = new Map(components.map((component) => [component.name, component]));
  const resolved = resolveImportPins(importState);
  const endpoints: RoutedNetEndpoint[] = [];

  for (const net of resolved.nets) {
    for (const node of net.nodes) {
      const component = componentMap.get(node.physicalRef);
      if (!component) {
        continue;
      }

      if (!component.pinOffsets[node.physicalPin - 1]) {
        continue;
      }
      endpoints.push({
        net: net.name,
        ref: node.physicalRef,
        pin: node.physicalPin,
        grid: pinGridPosition(component, node.physicalPin),
        role: node.pinRole
      });
    }
  }

  return endpoints;
}

