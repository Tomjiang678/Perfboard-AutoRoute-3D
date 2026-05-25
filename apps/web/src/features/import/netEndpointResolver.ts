import type { ImportState, PlacedComponent, RoutedNetEndpoint } from "../../types/project";
import { resolveImportPins } from "./pinResolver";

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

      const pinOffset = component.pinOffsets[node.physicalPin - 1];
      if (!pinOffset) {
        continue;
      }

      const [rx, ry] = rotateOffsetRelativeToAnchor(pinOffset, component.pinOffsets, component.rotation);
      endpoints.push({
        net: net.name,
        ref: node.physicalRef,
        pin: node.physicalPin,
        grid: [component.position[0] + rx, component.position[1] + ry],
        role: node.pinRole
      });
    }
  }

  return endpoints;
}

function rotateOffsetRelativeToAnchor(
  offset: [number, number],
  offsets: Array<[number, number]>,
  rotation: number
): [number, number] {
  const anchor = offsets[0] ?? [0, 0];
  return rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], rotation);
}

function rotateOffset([x, y]: [number, number], rotation: number): [number, number] {
  const quarterTurns = ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
  if (quarterTurns === 1) {
    return [y, -x];
  }
  if (quarterTurns === 2) {
    return [-x, -y];
  }
  if (quarterTurns === 3) {
    return [-y, x];
  }
  return [x, y];
}

