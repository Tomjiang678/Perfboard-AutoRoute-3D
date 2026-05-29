import type { PlacedComponent, RoutedNetEndpoint } from "../../types/project";

export interface PlacementRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AutoPlacementResult {
  components: PlacedComponent[];
  placedCount: number;
  warnings: string[];
}

interface FootprintBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

type EndpointMap = Map<string, RoutedNetEndpoint[]>;
type NetGraph = Map<string, Set<string>>;

interface Airwire {
  from: [number, number];
  to: [number, number];
  net: string;
}

export function autoPlaceComponents(
  components: PlacedComponent[],
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number,
  endpoints: RoutedNetEndpoint[] = []
): AutoPlacementResult {
  const normalizedRegion = insetRegion(normalizeRegion(region, boardWidth, boardHeight), 1);
  const lockedComponents = components.filter((component) => component.mounted);
  const movableComponents = components.filter((component) => !component.mounted);
  const endpointMap = buildEndpointMap(endpoints);
  const netGraph = buildNetGraph(endpoints);
  const occupied = new Set<string>();
  const placedByName = new Map<string, PlacedComponent>();
  const placedPositions = new Map<string, [number, number]>();
  const placedAnchors: Array<[number, number]> = [];

  lockedComponents.forEach((component) => {
    placedByName.set(component.name, component);
    placedAnchors.push(component.position);
    getComponentOccupiedHoles(component).forEach(([x, y]) => occupied.add(key(x, y)));
  });

  const warnings: string[] = [];
  if (normalizedRegion.width <= 0 || normalizedRegion.height <= 0) {
    return { components, placedCount: 0, warnings: ["Placement region is too small after inset."] };
  }

  const regionArea = normalizedRegion.width * normalizedRegion.height;
  const requiredArea = movableComponents.reduce((sum, component) => {
    const box = getFootprintBox(component);
    return sum + Math.max(1, (box.width + 2) * (box.height + 2));
  }, 0);

  if (requiredArea > regionArea) {
    warnings.push(`Placement region is too small: estimated ${requiredArea} grid cells needed, current region has ${regionArea}.`);
    return { components, placedCount: 0, warnings };
  }

  const sortedMovable = [...movableComponents].sort((a, b) => {
    const boxA = getFootprintBox(a);
    const boxB = getFootprintBox(b);
    const degreeDiff = connectionDegree(b.name, netGraph) - connectionDegree(a.name, netGraph);
    return degreeDiff || boxB.width * boxB.height - boxA.width * boxA.height;
  });

  for (const component of sortedMovable) {
    const placement = findPlacement(
      component,
      normalizedRegion,
      boardWidth,
      boardHeight,
      occupied,
      placedAnchors,
      placedByName,
      endpointMap,
      netGraph
    );

    if (!placement) {
      warnings.push(`${component.name} cannot fit in the selected placement region.`);
      continue;
    }

    const placedComponent = { ...component, position: placement };
    placedPositions.set(component.id, placement);
    placedByName.set(component.name, placedComponent);
    placedAnchors.push(placement);
    getComponentOccupiedHoles(placedComponent).forEach(([x, y]) => occupied.add(key(x, y)));
  }

  return {
    components: components.map((component) => {
      const position = placedPositions.get(component.id);
      return position ? { ...component, position, mounted: true } : component;
    }),
    placedCount: placedPositions.size,
    warnings
  };
}

function findPlacement(
  component: PlacedComponent,
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number,
  occupied: Set<string>,
  placedAnchors: Array<[number, number]>,
  placedByName: Map<string, PlacedComponent>,
  endpointMap: EndpointMap,
  netGraph: NetGraph
): [number, number] | undefined {
  const box = getFootprintBox(component);
  const placedAirwires = buildPlacedAirwires(placedByName, endpointMap);
  const candidates = createSpreadCandidates(region, box)
    .filter((position) => canPlaceAt(component, position, region, boardWidth, boardHeight, occupied))
    .sort((a, b) =>
      scorePlacement(a, component, placedAnchors, region, placedByName, endpointMap, netGraph, placedAirwires) -
      scorePlacement(b, component, placedAnchors, region, placedByName, endpointMap, netGraph, placedAirwires)
    );

  return candidates[0];
}

function scorePlacement(
  position: [number, number],
  component: PlacedComponent,
  placedAnchors: Array<[number, number]>,
  region: PlacementRegion,
  placedByName: Map<string, PlacedComponent>,
  endpointMap: EndpointMap,
  netGraph: NetGraph,
  placedAirwires: Airwire[]
) {
  const center: [number, number] = [region.x + region.width / 2, region.y + region.height / 2];
  const centerDistance = distance(position, center);
  const borderDistance = Math.min(
    position[0] - region.x,
    region.x + region.width - 1 - position[0],
    position[1] - region.y,
    region.y + region.height - 1 - position[1]
  );
  const network = scoreNetworkPlacement(position, component, placedByName, endpointMap);
  const crossingPenalty = countCandidateCrossings(network.candidateAirwires, placedAirwires);

  if (placedAnchors.length === 0) {
    return centerDistance * 0.4 - borderDistance * 0.2 - connectionDegree(component.name, netGraph) * 20;
  }

  const nearestDistance = Math.min(...placedAnchors.map((anchor) => distance(position, anchor)));
  const averageDistance = placedAnchors.reduce((sum, anchor) => sum + distance(position, anchor), 0) / placedAnchors.length;
  const idealSpacing = Math.max(8, Math.min(20, Math.sqrt((region.width * region.height) / Math.max(1, placedAnchors.length + 1)) * 1.05));
  const crowdingPenalty = nearestDistance < idealSpacing ? (idealSpacing - nearestDistance) ** 2 * 42 : 0;
  const edgePenalty = borderDistance <= 1 ? 4 : 0;

  return (
    network.connectedLength * 5 +
    network.unplacedNeighborCount * centerDistance * 0.8 +
    crossingPenalty * 220 +
    crowdingPenalty +
    edgePenalty -
    Math.min(nearestDistance, idealSpacing * 1.4) * 18 -
    averageDistance * 3
  );
}

function scoreNetworkPlacement(
  position: [number, number],
  component: PlacedComponent,
  placedByName: Map<string, PlacedComponent>,
  endpointMap: EndpointMap
) {
  const candidateAirwires: Airwire[] = [];
  let connectedLength = 0;
  let unplacedNeighborCount = 0;
  const componentEndpoints = endpointMap.get(component.name) ?? [];
  const endpointsByNet = endpointsGroupedByNet(endpointMap);

  componentEndpoints.forEach((endpoint) => {
    const from = pinGridAt(component, position, endpoint.pin);
    const netEndpoints = endpointsByNet.get(endpoint.net) ?? [];
    netEndpoints.forEach((other) => {
      if (other.ref === component.name) {
        return;
      }
      const otherComponent = placedByName.get(other.ref);
      if (!otherComponent) {
        unplacedNeighborCount += 1;
        return;
      }
      const to = pinGridAt(otherComponent, otherComponent.position, other.pin);
      connectedLength += manhattan(from, to);
      candidateAirwires.push({ from, to, net: endpoint.net });
    });
  });

  return { connectedLength, unplacedNeighborCount, candidateAirwires };
}

function canPlaceAt(
  component: PlacedComponent,
  position: [number, number],
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number,
  occupied: Set<string>
) {
  const holes = getComponentOccupiedHoles({ ...component, position });
  return holes.every(([x, y]) => {
    return (
      x >= 0 &&
      y >= 0 &&
      x < boardWidth &&
      y < boardHeight &&
      x >= region.x &&
      y >= region.y &&
      x < region.x + region.width &&
      y < region.y + region.height &&
      !occupied.has(key(x, y))
    );
  });
}

function getComponentOccupiedHoles(component: PlacedComponent): Array<[number, number]> {
  const anchor = component.pinOffsets[0] ?? [0, 0];
  return component.pinOffsets.map((offset) => {
    const [rx, ry] = rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
    return [component.position[0] + rx, component.position[1] + ry];
  });
}

function getFootprintBox(component: PlacedComponent): FootprintBox {
  const holes = getComponentOccupiedHoles({ ...component, position: [0, 0] });
  const xs = holes.map(([x]) => x);
  const ys = holes.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function normalizeRegion(region: PlacementRegion, boardWidth: number, boardHeight: number): PlacementRegion {
  const x = clamp(Math.round(region.x), 0, boardWidth - 1);
  const y = clamp(Math.round(region.y), 0, boardHeight - 1);
  const width = clamp(Math.round(region.width), 1, boardWidth - x);
  const height = clamp(Math.round(region.height), 1, boardHeight - y);
  return { x, y, width, height };
}

function insetRegion(region: PlacementRegion, inset: number): PlacementRegion {
  return {
    x: region.x + inset,
    y: region.y + inset,
    width: region.width - inset * 2,
    height: region.height - inset * 2
  };
}

function createSpreadCandidates(region: PlacementRegion, box: FootprintBox): Array<[number, number]> {
  const candidates: Array<[number, number]> = [];
  const minAnchorX = region.x - box.minX;
  const maxAnchorX = region.x + region.width - 1 - box.maxX;
  const minAnchorY = region.y - box.minY;
  const maxAnchorY = region.y + region.height - 1 - box.maxY;

  if (minAnchorX > maxAnchorX || minAnchorY > maxAnchorY) {
    return candidates;
  }

  const goldenRatio = 0.61803398875;
  const count = Math.max(96, Math.min(1800, region.width * region.height * 2));
  for (let index = 0; index < count; index += 1) {
    const u = (index * goldenRatio) % 1;
    const v = (index * 0.754877666) % 1;
    candidates.push([
      Math.round(minAnchorX + u * (maxAnchorX - minAnchorX)),
      Math.round(minAnchorY + v * (maxAnchorY - minAnchorY))
    ]);
  }

  const gridStep = Math.max(1, Math.floor(Math.sqrt((region.width * region.height) / 180)));
  for (let y = minAnchorY; y <= maxAnchorY; y += gridStep) {
    for (let x = minAnchorX; x <= maxAnchorX; x += gridStep) {
      candidates.push([x, y]);
    }
  }

  return dedupePositions(candidates);
}

function buildEndpointMap(endpoints: RoutedNetEndpoint[]): EndpointMap {
  const map: EndpointMap = new Map();
  endpoints.forEach((endpoint) => {
    const list = map.get(endpoint.ref) ?? [];
    list.push(endpoint);
    map.set(endpoint.ref, list);
  });
  return map;
}

function endpointsGroupedByNet(endpointMap: EndpointMap) {
  const byNet = new Map<string, RoutedNetEndpoint[]>();
  endpointMap.forEach((endpoints) => {
    endpoints.forEach((endpoint) => {
      const list = byNet.get(endpoint.net) ?? [];
      list.push(endpoint);
      byNet.set(endpoint.net, list);
    });
  });
  return byNet;
}

function buildNetGraph(endpoints: RoutedNetEndpoint[]): NetGraph {
  const graph: NetGraph = new Map();
  const byNet = new Map<string, Set<string>>();
  endpoints.forEach((endpoint) => {
    const refs = byNet.get(endpoint.net) ?? new Set<string>();
    refs.add(endpoint.ref);
    byNet.set(endpoint.net, refs);
    if (!graph.has(endpoint.ref)) {
      graph.set(endpoint.ref, new Set());
    }
  });

  byNet.forEach((refs) => {
    const list = [...refs];
    list.forEach((ref) => {
      const neighbors = graph.get(ref) ?? new Set<string>();
      list.forEach((other) => {
        if (other !== ref) {
          neighbors.add(other);
        }
      });
      graph.set(ref, neighbors);
    });
  });
  return graph;
}

function connectionDegree(ref: string, graph: NetGraph) {
  return graph.get(ref)?.size ?? 0;
}

function buildPlacedAirwires(placedByName: Map<string, PlacedComponent>, endpointMap: EndpointMap) {
  const airwires: Airwire[] = [];
  const byNet = endpointsGroupedByNet(endpointMap);
  byNet.forEach((netEndpoints, net) => {
    for (let a = 0; a < netEndpoints.length; a += 1) {
      for (let b = a + 1; b < netEndpoints.length; b += 1) {
        const firstComponent = placedByName.get(netEndpoints[a].ref);
        const secondComponent = placedByName.get(netEndpoints[b].ref);
        if (!firstComponent || !secondComponent) {
          continue;
        }
        airwires.push({
          from: pinGridAt(firstComponent, firstComponent.position, netEndpoints[a].pin),
          to: pinGridAt(secondComponent, secondComponent.position, netEndpoints[b].pin),
          net
        });
      }
    }
  });
  return airwires;
}

function countCandidateCrossings(candidateAirwires: Airwire[], placedAirwires: Airwire[]) {
  let crossings = 0;
  candidateAirwires.forEach((candidate) => {
    placedAirwires.forEach((placed) => {
      if (candidate.net === placed.net || shareEndpoint(candidate, placed)) {
        return;
      }
      if (segmentsCross(candidate.from, candidate.to, placed.from, placed.to)) {
        crossings += 1;
      }
    });
  });
  return crossings;
}

function pinGridAt(component: PlacedComponent, position: [number, number], pin: number): [number, number] {
  const anchor = component.pinOffsets[0] ?? [0, 0];
  const offset = component.pinOffsets[pin - 1] ?? anchor;
  const [rx, ry] = rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
  return [position[0] + rx, position[1] + ry];
}

function dedupePositions(positions: Array<[number, number]>) {
  const seen = new Set<string>();
  const result: Array<[number, number]> = [];
  for (const position of positions) {
    const id = key(position[0], position[1]);
    if (!seen.has(id)) {
      result.push(position);
      seen.add(id);
    }
  }
  return result;
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

function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function manhattan(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function shareEndpoint(first: Airwire, second: Airwire) {
  return samePoint(first.from, second.from) || samePoint(first.from, second.to) || samePoint(first.to, second.from) || samePoint(first.to, second.to);
}

function samePoint(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1];
}

function segmentsCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]) {
  return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
}

function orientation(a: [number, number], b: [number, number], c: [number, number]) {
  const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return value === 0 ? 0 : value > 0 ? 1 : -1;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function key(x: number, y: number) {
  return `${x},${y}`;
}
