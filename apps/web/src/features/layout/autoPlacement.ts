import type { BoardSize, PlacedComponent, RoutedNetEndpoint, RoutingState } from "../../types/project";
import { autoRouteBoard } from "../routing/autoRouter";

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

interface PlacementCandidate {
  position: [number, number];
  rotation: number;
  airwireScore: number;
}

interface Airwire {
  from: [number, number];
  to: [number, number];
  net: string;
}

interface RouteQuality {
  failedNetCount: number;
  jumperCount: number;
  jumperLength: number;
  bottomLength: number;
  bendCount: number;
  airwireCrossings: number;
}

type EndpointMap = Map<string, RoutedNetEndpoint[]>;
type NetGraph = Map<string, Set<string>>;

const ROTATIONS = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
const ROUTE_VERIFIED_CANDIDATES = 6;
const OPTIMIZATION_ROUNDS = 2;
const OPTIMIZATION_MOVE_CANDIDATES = 5;
const MAX_OPTIMIZATION_COMPONENTS = 24;

export function autoPlaceComponents(
  components: PlacedComponent[],
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number,
  endpoints: RoutedNetEndpoint[] = []
): AutoPlacementResult {
  const normalizedRegion = insetRegion(normalizeRegion(region, boardWidth, boardHeight), 1);
  const warnings: string[] = [];

  if (normalizedRegion.width <= 0 || normalizedRegion.height <= 0) {
    return { components, placedCount: 0, warnings: ["Placement region is too small after inset."] };
  }

  const movableIds = new Set(components.filter((component) => !component.mounted).map((component) => component.id));
  const initial = createInitialPlacement(components, normalizedRegion, boardWidth, boardHeight, endpoints, warnings);
  if (initial.placedCount === 0) {
    return { components, placedCount: 0, warnings };
  }

  const optimized = optimizePlacement(initial.components, movableIds, normalizedRegion, { width: boardWidth, height: boardHeight }, endpoints);
  return {
    components: optimized,
    placedCount: initial.placedCount,
    warnings
  };
}

function createInitialPlacement(
  components: PlacedComponent[],
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number,
  endpoints: RoutedNetEndpoint[],
  warnings: string[]
) {
  const endpointMap = buildEndpointMap(endpoints);
  const netGraph = buildNetGraph(endpoints);
  const lockedComponents = components.filter((component) => component.mounted);
  const movableComponents = components.filter((component) => !component.mounted);
  const occupied = new Set<string>();
  const placedByName = new Map<string, PlacedComponent>();
  const placedPositions = new Map<string, PlacementCandidate>();
  const placedAnchors: Array<[number, number]> = [];

  lockedComponents.forEach((component) => {
    placedByName.set(component.name, component);
    placedAnchors.push(component.position);
    getComponentOccupiedCells(component).forEach(([x, y]) => occupied.add(key(x, y)));
  });

  const regionArea = region.width * region.height;
  const requiredArea = movableComponents.reduce((sum, component) => sum + estimateCourtyardArea(component), 0);
  if (requiredArea > regionArea) {
    warnings.push(`Placement region is tight: estimated ${requiredArea} occupied cells, current region has ${regionArea}.`);
  }

  const sortedMovable = [...movableComponents].sort((a, b) => {
    const degreeDiff = connectionDegree(b.name, netGraph) - connectionDegree(a.name, netGraph);
    return degreeDiff || estimateCourtyardArea(b) - estimateCourtyardArea(a);
  });

  for (const component of sortedMovable) {
    const candidate = findPlacement(component, components, region, boardWidth, boardHeight, occupied, placedAnchors, placedByName, endpointMap, netGraph, endpoints);
    if (!candidate) {
      warnings.push(`${component.name} cannot fit in the selected placement region.`);
      continue;
    }

    const placedComponent = { ...component, position: candidate.position, rotation: candidate.rotation };
    placedPositions.set(component.id, candidate);
    placedByName.set(component.name, placedComponent);
    placedAnchors.push(candidate.position);
    getComponentOccupiedCells(placedComponent).forEach(([x, y]) => occupied.add(key(x, y)));
  }

  return {
    components: components.map((component) => {
      const candidate = placedPositions.get(component.id);
      return candidate ? { ...component, position: candidate.position, rotation: candidate.rotation, mounted: true } : component;
    }),
    placedCount: placedPositions.size
  };
}

function findPlacement(
  component: PlacedComponent,
  allComponents: PlacedComponent[],
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number,
  occupied: Set<string>,
  placedAnchors: Array<[number, number]>,
  placedByName: Map<string, PlacedComponent>,
  endpointMap: EndpointMap,
  netGraph: NetGraph,
  endpoints: RoutedNetEndpoint[]
): PlacementCandidate | undefined {
  const placedAirwires = buildPlacedAirwires(placedByName, endpointMap);
  const candidates = ROTATIONS.flatMap((rotation) => {
    const rotated = { ...component, rotation };
    const box = getFootprintBox(rotated);
    return createSpreadCandidates(region, box)
      .filter((position) => canPlaceAt(rotated, position, region, boardWidth, boardHeight, occupied))
      .map((position) => ({
        position,
        rotation,
        airwireScore: scorePlacement(position, rotated, placedAnchors, region, placedByName, endpointMap, netGraph, placedAirwires)
      }));
  }).sort((a, b) => a.airwireScore - b.airwireScore);

  const shortlist = candidates.slice(0, ROUTE_VERIFIED_CANDIDATES);
  if (shortlist.length === 0) {
    return undefined;
  }

  const refs = new Set([...placedByName.keys(), component.name]);
  const partialComponents = allComponents
    .filter((candidate) => refs.has(candidate.name))
    .map((candidate) => placedByName.get(candidate.name) ?? candidate);
  const partialEndpoints = endpoints.filter((endpoint) => refs.has(endpoint.ref));

  let best = shortlist[0];
  let bestQuality = routeQualityForComponents(
    replaceComponent(partialComponents, { ...component, position: best.position, rotation: best.rotation, mounted: true }),
    partialEndpoints,
    { width: boardWidth, height: boardHeight }
  );

  shortlist.slice(1).forEach((candidate) => {
    const trial = replaceComponent(partialComponents, { ...component, position: candidate.position, rotation: candidate.rotation, mounted: true });
    const quality = routeQualityForComponents(trial, partialEndpoints, { width: boardWidth, height: boardHeight });
    if (compareQuality(quality, bestQuality) < 0 || (compareQuality(quality, bestQuality) === 0 && candidate.airwireScore < best.airwireScore)) {
      best = candidate;
      bestQuality = quality;
    }
  });

  return best;
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
  const nearestDistance = placedAnchors.length > 0 ? Math.min(...placedAnchors.map((anchor) => distance(position, anchor))) : Number.POSITIVE_INFINITY;
  const minimumSpacing = 4;
  const crowdingPenalty = nearestDistance < minimumSpacing ? (minimumSpacing - nearestDistance) ** 2 * 80 : 0;
  const edgePenalty = borderDistance <= 0 ? 12 : borderDistance <= 1 ? 4 : 0;
  const crossingPenalty = countCandidateCrossings(network.candidateAirwires, placedAirwires);

  return (
    network.connectedLength * 6 +
    network.unplacedNeighborCount * centerDistance * 0.4 +
    crossingPenalty * 240 +
    crowdingPenalty +
    edgePenalty -
    connectionDegree(component.name, netGraph) * 8
  );
}

function optimizePlacement(
  components: PlacedComponent[],
  movableIds: Set<string>,
  region: PlacementRegion,
  board: BoardSize,
  endpoints: RoutedNetEndpoint[]
) {
  const movable = components.filter((component) => movableIds.has(component.id)).slice(0, MAX_OPTIMIZATION_COMPONENTS);
  if (movable.length === 0 || endpoints.length === 0) {
    return components;
  }

  let best = components;
  let bestQuality = routeQualityForComponents(best, endpoints, board);

  for (let round = 0; round < OPTIMIZATION_ROUNDS; round += 1) {
    let improved = false;
    const focused = focusComponents(best, movableIds, bestQuality, endpoints);

    for (const component of focused) {
      const trials = generateLocalCandidates(best, component, movableIds, region, board, endpoints);
      for (const trial of trials) {
        const quality = routeQualityForComponents(trial, endpoints, board);
        if (compareQuality(quality, bestQuality) < 0) {
          best = trial;
          bestQuality = quality;
          improved = true;
          break;
        }
      }
      if (improved) {
        break;
      }
    }

    if (!improved) {
      const swap = findImprovingSwap(best, movableIds, region, board, endpoints, bestQuality);
      if (swap) {
        best = swap.components;
        bestQuality = swap.quality;
        improved = true;
      }
    }

    if (!improved) {
      break;
    }
  }

  return best;
}

function generateLocalCandidates(
  components: PlacedComponent[],
  component: PlacedComponent,
  movableIds: Set<string>,
  region: PlacementRegion,
  board: BoardSize,
  endpoints: RoutedNetEndpoint[]
) {
  const occupiedWithoutSelf = buildOccupiedCells(components.filter((candidate) => candidate.id !== component.id));
  const endpointMap = buildEndpointMap(endpoints);
  const netGraph = buildNetGraph(endpoints);
  const placedByName = new Map(components.filter((candidate) => candidate.id !== component.id).map((candidate) => [candidate.name, candidate]));
  const placedAnchors = components.filter((candidate) => candidate.id !== component.id).map((candidate) => candidate.position);
  const placedAirwires = buildPlacedAirwires(placedByName, endpointMap);
  const rotationTrials = ROTATIONS
    .map((rotation) => ({ ...component, rotation }))
    .filter((trial) => canPlaceAt(trial, trial.position, region, board.width, board.height, occupiedWithoutSelf))
    .map((trial) => replaceComponent(components, trial));
  const moveTrials = ROTATIONS.flatMap((rotation) => {
    const rotated = { ...component, rotation };
    const box = getFootprintBox(rotated);
    return createSpreadCandidates(region, box)
      .filter((position) => canPlaceAt(rotated, position, region, board.width, board.height, occupiedWithoutSelf))
      .map((position) => ({
        component: { ...rotated, position },
        score: scorePlacement(position, rotated, placedAnchors, region, placedByName, endpointMap, netGraph, placedAirwires)
      }));
  })
    .sort((a, b) => a.score - b.score)
    .slice(0, OPTIMIZATION_MOVE_CANDIDATES)
    .map((trial) => replaceComponent(components, trial.component));

  return [...rotationTrials, ...moveTrials].filter((trial) => isValidPlacement(trial, movableIds, region, board));
}

function findImprovingSwap(
  components: PlacedComponent[],
  movableIds: Set<string>,
  region: PlacementRegion,
  board: BoardSize,
  endpoints: RoutedNetEndpoint[],
  currentQuality: RouteQuality
) {
  const movable = components.filter((component) => movableIds.has(component.id)).slice(0, 12);
  for (let a = 0; a < movable.length; a += 1) {
    for (let b = a + 1; b < movable.length; b += 1) {
      const first = movable[a];
      const second = movable[b];
      const swapped = components.map((component) => {
        if (component.id === first.id) {
          return { ...component, position: second.position, rotation: second.rotation };
        }
        if (component.id === second.id) {
          return { ...component, position: first.position, rotation: first.rotation };
        }
        return component;
      });
      if (!isValidPlacement(swapped, movableIds, region, board)) {
        continue;
      }
      const quality = routeQualityForComponents(swapped, endpoints, board);
      if (compareQuality(quality, currentQuality) < 0) {
        return { components: swapped, quality };
      }
    }
  }
  return undefined;
}

function routeQualityForComponents(components: PlacedComponent[], endpointTemplates: RoutedNetEndpoint[], board: BoardSize): RouteQuality {
  const endpoints = endpointsForComponents(endpointTemplates, components);
  const routing = autoRouteBoard(board, endpoints, components);
  return qualityFromRouting(routing, components, endpoints);
}

function qualityFromRouting(routing: RoutingState, components: PlacedComponent[], endpoints: RoutedNetEndpoint[]): RouteQuality {
  return {
    failedNetCount: routing.failedNets.length,
    jumperCount: routing.jumpers.length,
    jumperLength: routing.jumpers.reduce((sum, jumper) => sum + manhattan(jumper.from, jumper.to), 0),
    bottomLength: routing.traces.reduce((sum, trace) => sum + pathLength(trace.points), 0),
    bendCount: routing.traces.reduce((sum, trace) => sum + countBends(trace.points), 0),
    airwireCrossings: countAirwireCrossings(components, endpoints)
  };
}

function compareQuality(a: RouteQuality, b: RouteQuality) {
  return (
    a.failedNetCount - b.failedNetCount ||
    a.jumperCount - b.jumperCount ||
    a.jumperLength - b.jumperLength ||
    a.bottomLength - b.bottomLength ||
    a.bendCount - b.bendCount ||
    a.airwireCrossings - b.airwireCrossings
  );
}

function focusComponents(components: PlacedComponent[], movableIds: Set<string>, quality: RouteQuality, endpoints: RoutedNetEndpoint[]) {
  const failedOrJumperNets = new Set<string>();
  if (quality.failedNetCount > 0 || quality.jumperCount > 0) {
    endpoints.forEach((endpoint) => {
      if (!isPowerNet(endpoint.net)) {
        failedOrJumperNets.add(endpoint.net);
      }
    });
  }
  const movable = components.filter((component) => movableIds.has(component.id));
  return [...movable].sort((a, b) => relevantEndpointCount(b, endpoints, failedOrJumperNets) - relevantEndpointCount(a, endpoints, failedOrJumperNets));
}

function relevantEndpointCount(component: PlacedComponent, endpoints: RoutedNetEndpoint[], nets: Set<string>) {
  return endpoints.filter((endpoint) => endpoint.ref === component.name && (nets.size === 0 || nets.has(endpoint.net))).length;
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
    if (isPowerNet(endpoint.net)) {
      return;
    }
    const from = pinGridAt(component, position, endpoint.pin);
    const netEndpoints = endpointsByNet.get(endpoint.net) ?? [];
    netEndpoints.forEach((other) => {
      if (other.ref === component.name) {
        return;
      }
      const otherComponent = placedByName.get(other.ref);
      if (!otherComponent) {
        unplacedNeighborCount += 0.25;
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
  const cells = getComponentOccupiedCells({ ...component, position });
  return cells.every(([x, y]) => {
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

function isValidPlacement(components: PlacedComponent[], movableIds: Set<string>, region: PlacementRegion, board: BoardSize) {
  const occupied = new Set<string>();
  for (const component of components) {
    const cells = getComponentOccupiedCells(component);
    for (const [x, y] of cells) {
      if (x < 0 || y < 0 || x >= board.width || y >= board.height) {
        return false;
      }
      if (movableIds.has(component.id) && (x < region.x || y < region.y || x >= region.x + region.width || y >= region.y + region.height)) {
        return false;
      }
      const id = key(x, y);
      if (occupied.has(id)) {
        return false;
      }
      occupied.add(id);
    }
  }
  return true;
}

function getComponentOccupiedCells(component: PlacedComponent): Array<[number, number]> {
  const box = getFootprintBox(component);
  const margin = courtyardMargin(component);
  const cells: Array<[number, number]> = [];
  for (let y = box.minY - margin; y <= box.maxY + margin; y += 1) {
    for (let x = box.minX - margin; x <= box.maxX + margin; x += 1) {
      cells.push([component.position[0] + x, component.position[1] + y]);
    }
  }
  return dedupePositions([...cells, ...getComponentOccupiedHoles(component)]);
}

function courtyardMargin(component: PlacedComponent) {
  if (component.kind === "dip" || component.kind === "pin_header") {
    return 0;
  }
  if (component.kind === "resistor" || component.kind === "inductor" || component.kind === "diode" || component.kind === "led") {
    return 1;
  }
  return 1;
}

function estimateCourtyardArea(component: PlacedComponent) {
  return getComponentOccupiedCells({ ...component, position: [0, 0] }).length;
}

function getComponentOccupiedHoles(component: PlacedComponent): Array<[number, number]> {
  const anchor = component.pinOffsets[0] ?? [0, 0];
  return component.pinOffsets.map((offset) => {
    const [rx, ry] = rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
    return [component.position[0] + rx, component.position[1] + ry];
  });
}

function getFootprintBox(component: PlacedComponent): FootprintBox {
  const anchor = component.pinOffsets[0] ?? [0, 0];
  const holes = component.pinOffsets.map((offset) => rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation));
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

function buildOccupiedCells(components: PlacedComponent[]) {
  const occupied = new Set<string>();
  components.forEach((component) => {
    getComponentOccupiedCells(component).forEach(([x, y]) => occupied.add(key(x, y)));
  });
  return occupied;
}

function endpointsForComponents(endpointTemplates: RoutedNetEndpoint[], components: PlacedComponent[]) {
  const componentByName = new Map(components.map((component) => [component.name, component]));
  return endpointTemplates
    .map((endpoint) => {
      const component = componentByName.get(endpoint.ref);
      if (!component) {
        return undefined;
      }
      return {
        ...endpoint,
        grid: pinGridAt(component, component.position, endpoint.pin)
      };
    })
    .filter((endpoint): endpoint is RoutedNetEndpoint => Boolean(endpoint));
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
  const count = Math.max(96, Math.min(1400, region.width * region.height));
  for (let index = 0; index < count; index += 1) {
    const u = (index * goldenRatio) % 1;
    const v = (index * 0.754877666) % 1;
    candidates.push([
      Math.round(minAnchorX + u * (maxAnchorX - minAnchorX)),
      Math.round(minAnchorY + v * (maxAnchorY - minAnchorY))
    ]);
  }

  const gridStep = Math.max(1, Math.floor(Math.sqrt((region.width * region.height) / 160)));
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
    if (isPowerNet(endpoint.net)) {
      return;
    }
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
    if (isPowerNet(net)) {
      return;
    }
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

function countAirwireCrossings(components: PlacedComponent[], endpoints: RoutedNetEndpoint[]) {
  const byName = new Map(components.map((component) => [component.name, component]));
  return countCandidateCrossings(buildPlacedAirwires(byName, buildEndpointMap(endpoints)), []);
}

function countCandidateCrossings(candidateAirwires: Airwire[], placedAirwires: Airwire[]) {
  const all = [...candidateAirwires, ...placedAirwires];
  let crossings = 0;
  for (let a = 0; a < all.length; a += 1) {
    for (let b = a + 1; b < all.length; b += 1) {
      if (all[a].net === all[b].net || shareEndpoint(all[a], all[b])) {
        continue;
      }
      if (segmentsCross(all[a].from, all[a].to, all[b].from, all[b].to)) {
        crossings += 1;
      }
    }
  }
  return crossings;
}

function pinGridAt(component: PlacedComponent, position: [number, number], pin: number): [number, number] {
  const anchor = component.pinOffsets[0] ?? [0, 0];
  const offset = component.pinOffsets[pin - 1] ?? anchor;
  const [rx, ry] = rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
  return [position[0] + rx, position[1] + ry];
}

function replaceComponent(components: PlacedComponent[], replacement: PlacedComponent) {
  return components.map((component) => (component.id === replacement.id ? replacement : component));
}

function pathLength(points: Array<[number, number]>) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += manhattan(points[index - 1], points[index]);
  }
  return length;
}

function countBends(points: Array<[number, number]>) {
  let bends = 0;
  let previousDirection: string | undefined;
  for (let index = 1; index < points.length; index += 1) {
    const direction = points[index][0] === points[index - 1][0] ? "v" : "h";
    if (previousDirection && previousDirection !== direction) {
      bends += 1;
    }
    previousDirection = direction;
  }
  return bends;
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

function isPowerNet(net: string) {
  return /^(0|GND|VCC|VDD|VEE|VSS|VDC|VDC\d+|\+?\d+V)$/i.test(net);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function key(x: number, y: number) {
  return `${x},${y}`;
}
