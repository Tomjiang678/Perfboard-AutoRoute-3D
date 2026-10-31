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

export type UnmappedNodeReason = "missing_component" | "pin_out_of_range" | "invalid_pin";

export interface UnmappedNetNode {
  net: string;
  ref: string;
  pin: number | string;
  reason: UnmappedNodeReason;
}

/**
 * 网表里没能落到板上的节点：元件不存在、引脚号不是数字、或引脚号超出封装。
 * 这些节点不会出现在 endpoints 里，如果只看 endpoints 会误判“网络已连通”，
 * 所以 DRC 必须单独把它们列为错误。
 */
export function findUnmappedNetNodes(importState: ImportState, components: PlacedComponent[]): UnmappedNetNode[] {
  const componentMap = new Map(components.map((component) => [component.name, component]));
  const resolved = resolveImportPins(importState);
  const unmapped: UnmappedNetNode[] = [];

  for (const net of resolved.nets) {
    // 引脚号无法解析（例如 "A1"）的节点会被放进 unresolved，这里同样要算缺失
    for (const node of net.unresolved) {
      unmapped.push({ net: net.name, ref: node.ref, pin: node.pin, reason: "invalid_pin" });
    }
    for (const node of net.nodes) {
      const component = componentMap.get(node.physicalRef);
      if (!component) {
        unmapped.push({ net: net.name, ref: node.physicalRef, pin: node.physicalPin, reason: "missing_component" });
        continue;
      }
      if (!component.pinOffsets[node.physicalPin - 1]) {
        unmapped.push({ net: net.name, ref: node.physicalRef, pin: node.physicalPin, reason: "pin_out_of_range" });
      }
    }
  }

  return unmapped;
}
