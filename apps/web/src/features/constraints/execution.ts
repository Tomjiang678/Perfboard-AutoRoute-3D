import type {
  BottomTrace,
  DesignConstraint,
  PlacedComponent,
  RoutedNetEndpoint,
  RoutingState
} from "../../types/project.ts";
import { activeConstraints } from "./model.ts";
import { pinGridPosition } from "../layout/manualPlacement.ts";
import { adapterFromRequest, chipProfileOf } from "../project/adapter.ts";

export function prepareComponentsForConstraints(components: PlacedComponent[], constraints: DesignConstraint[]) {
  const active = activeConstraints(constraints);
  return components.map((component) => {
    const lock = active.find((constraint) => constraint.kind === "component_lock" && constraint.componentId === component.id);
    const orientation = active.find((constraint) => constraint.kind === "component_orientation" && constraint.componentId === component.id);
    const adapterConstraint = active.find((constraint) => constraint.kind === "component_adapter" && constraint.componentIds.includes(component.id));
    const shouldMoveForConstraint = active.some((constraint) => (
      (constraint.kind === "component_in_region" && constraint.componentIds.includes(component.id)) ||
      (constraint.kind === "component_on_board_edge" && constraint.componentIds.includes(component.id)) ||
      (constraint.kind === "component_near_component" && constraint.componentId === component.id) ||
      (constraint.kind === "component_orientation" && constraint.componentId === component.id) ||
      (constraint.kind === "component_adapter" && constraint.componentIds.includes(component.id))
    ));
    const lockPosition = Boolean(lock && lock.kind === "component_lock" && lock.lockPosition);
    const lockRotation = Boolean(lock && lock.kind === "component_lock" && lock.lockRotation);
    // 转接板会改脚位，位置锁定的元件不允许被悄悄换脚
    const adapter = adapterConstraint && adapterConstraint.kind === "component_adapter" && !lockPosition
      ? adapterFromRequest(adapterConstraint.requested, chipProfileOf(component))
      : component.adapter;
    return {
      ...component,
      adapter,
      rotationLocked: lockRotation,
      mounted: lockPosition || (component.mounted && !shouldMoveForConstraint),
      rotation: orientation && orientation.kind === "component_orientation"
        ? orientation.rotationDegrees * Math.PI / 180
        : component.rotation
    };
  });
}

export function buildPowerRailTraces(
  constraints: DesignConstraint[],
  endpoints: RoutedNetEndpoint[],
  components: PlacedComponent[]
) {
  const traces: BottomTrace[] = [];
  const errors: string[] = [];
  const endpointAt = new Map(endpoints.map((endpoint) => [`${endpoint.grid[0]},${endpoint.grid[1]}`, endpoint]));
  const padAt = new Map<string, { ref: string; pin: number }>();
  components.forEach((component) => component.pinOffsets.forEach((_, index) => {
    const point = pinGridPosition(component, index + 1);
    padAt.set(`${point[0]},${point[1]}`, { ref: component.name, pin: index + 1 });
  }));
  const claimed = new Map<string, string>();
  for (const constraint of activeConstraints(constraints)) {
    if (constraint.kind !== "power_rail") continue;
    const points: Array<[number, number]> = [];
    for (let value = constraint.from; value <= constraint.to; value += 1) {
      const point: [number, number] = constraint.axis === "row" ? [value, constraint.index] : [constraint.index, value];
      const id = `${point[0]},${point[1]}`;
      const endpoint = endpointAt.get(id);
      const pad = padAt.get(id);
      const existingNet = claimed.get(id);
      if (endpoint && endpoint.net !== constraint.net) {
        errors.push(`${constraint.net} 母线经过 ${endpoint.ref}.${endpoint.pin} 的异网焊点 ${endpoint.net}。`);
      }
      if (pad && !endpoint) {
        errors.push(`${constraint.net} 母线经过未接网络的引脚 ${pad.ref}.${pad.pin}。`);
      }
      if (existingNet && existingNet !== constraint.net) {
        errors.push(`${constraint.net} 母线与 ${existingNet} 母线在 (${id}) 冲突。`);
      }
      claimed.set(id, constraint.net);
      points.push(point);
    }
    traces.push({ id: `constraint-rail-${constraint.id}`, net: constraint.net, points, layer: "bottom", locked: true });
  }
  return { traces, errors: [...new Set(errors)] };
}

export function applyRoutingConstraintReport(routing: RoutingState, constraints: DesignConstraint[]): RoutingState {
  const warnings = [...routing.warnings];
  const failedNets = new Set(routing.failedNets);
  for (const constraint of activeConstraints(constraints)) {
    if (constraint.kind !== "net_jumper_limit") continue;
    const actual = routing.jumpers.filter((jumper) => jumper.net === constraint.net).length;
    if (actual > constraint.maxJumpers) {
      warnings.push(`约束：${constraint.net} 使用 ${actual} 根跳线，超过上限 ${constraint.maxJumpers}。`);
      if (constraint.strength === "hard") failedNets.add(constraint.net);
    }
  }
  return { ...routing, warnings, failedNets: [...failedNets] };
}

export function evaluatePlacementConstraints(components: PlacedComponent[], constraints: DesignConstraint[]) {
  const byId = new Map(components.map((component) => [component.id, component]));
  const warnings: string[] = [];
  for (const constraint of activeConstraints(constraints)) {
    if (constraint.kind === "component_in_region") {
      constraint.componentIds.forEach((id) => {
        const component = byId.get(id);
        if (!component) {
          warnings.push(`约束引用的元件 ${id} 已不存在。`);
          return;
        }
        const [x, y] = component.position;
        if (x < constraint.region.x || y < constraint.region.y || x >= constraint.region.x + constraint.region.width || y >= constraint.region.y + constraint.region.height) {
          warnings.push(`约束未满足：${component.name} 不在指定区域内。`);
        }
      });
    }
    if (constraint.kind === "component_near_component") {
      const component = byId.get(constraint.componentId);
      const anchor = byId.get(constraint.anchorComponentId);
      if (!component || !anchor) continue;
      const distance = Math.abs(component.position[0] - anchor.position[0]) + Math.abs(component.position[1] - anchor.position[1]);
      if (distance > constraint.maxDistance) warnings.push(`约束未满足：${component.name} 与 ${anchor.name} 相距 ${distance} 孔，目标不超过 ${constraint.maxDistance} 孔。`);
    }
    if (constraint.kind === "component_adapter") {
      constraint.componentIds.forEach((id) => {
        const component = byId.get(id);
        if (!component) {
          warnings.push(`约束引用的元件 ${id} 已不存在。`);
          return;
        }
        const expected = adapterFromRequest(constraint.requested, chipProfileOf(component));
        if (JSON.stringify(expected ?? null) !== JSON.stringify(component.adapter ?? null)) {
          warnings.push(`约束未满足：${component.name} 的转接板未按指令生效（位置被锁定的元件不会改脚位）。`);
        }
      });
    }
  }
  return warnings;
}
