import type { BoardSize, ConstraintRegion, DesignConstraint, PlacedComponent, RoutedNetEndpoint, RoutingState } from "../../types/project.ts";
import { activeConstraints } from "../constraints/model.ts";
import { autoRouteBoard } from "../routing/autoRouter.ts";
import { getBoardModel } from "../board/factory.ts";
import { componentPinHoles, layoutFromComponent, pinsConflict, placementHasPinConflicts, rotateGridOffset } from "../board/placement.ts";
import type { BoardModel, ElectricalNodeId, GridPoint } from "../board/types.ts";
import { key, manhattan } from "../routing/routingGeometry.ts";
import { isBendableTwoPin, preferredLeadSpan, spacingLimits } from "../project/componentTraits.ts";

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

export interface AutoPlacementProgress {
  percent: number;
  phase: "prepare" | "initial-placement" | "candidate-routing" | "optimization" | "complete";
  detail: string;
  routeEvaluation?: "full";
}

export type AutoPlacementProgressReporter = (progress: AutoPlacementProgress) => void;

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
  component: PlacedComponent;
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
  diagonalPlacementCount: number;
  leadStretchPenalty: number;
}

interface RouteEvaluationBudget {
  remaining: number;
}

/**
 * Inputs that stay constant while scoring every candidate of one component.
 * The net/node index is built once per search and answers "does this net
 * already own this electrical node?" without rescanning placed components.
 */
interface CrowdingAnchor {
  position: [number, number];
  /** Shares a net with the component being placed: allowed to sit closer. */
  netPartner: boolean;
}

interface PlacementScoreContext {
  region: PlacementRegion;
  crowdingAnchors: CrowdingAnchor[];
  placedByName: Map<string, PlacedComponent>;
  endpointMap: EndpointMap;
  netGraph: NetGraph;
  placedAirwires: Airwire[];
  constraints: DesignConstraint[];
  boardModel: BoardModel;
  netNodes: Map<string, Set<ElectricalNodeId>>;
}

type EndpointMap = Map<string, RoutedNetEndpoint[]>;
type NetGraph = Map<string, Set<string>>;

const ROTATIONS = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
const ROUTE_VERIFIED_CANDIDATES = 2;
const INITIAL_ROUTE_EVALUATION_BUDGET = 24;
const OPTIMIZATION_ROUTE_EVALUATION_BUDGET = 8;
const OPTIMIZATION_ROUNDS = 2;
const OPTIMIZATION_MOVE_CANDIDATES = 5;
const MAX_OPTIMIZATION_COMPONENTS = 24;
const DIAGONAL_SEARCH_RADIUS = 4;
const DIAGONAL_LOCAL_CANDIDATES = 10;
/**
 * Breadboard jumper economics: a pin that joins an electrical node already
 * owned by its own net (the same 5-hole row or power rail) needs no jumper at
 * all, so reusing a node is rewarded strongly enough to beat airwire-length
 * and crossing terms.
 */
const SHARED_NODE_REWARD = 260;
/** Preferred clearance between unrelated parts, in grid cells. */
const MIN_COMPONENT_SPACING = 4;
/** Same-net partners may sit closer, so their crowding weight is reduced. */
const NET_PARTNER_CROWDING_FACTOR = 0.25;

export function autoPlaceComponents(
  components: PlacedComponent[],
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number,
  endpoints: RoutedNetEndpoint[] = [],
  constraints: DesignConstraint[] = [],
  reportProgress?: AutoPlacementProgressReporter,
  boardConfig?: BoardSize
): AutoPlacementResult {
  reportProgress?.({ percent: 1, phase: "prepare", detail: "[autoplacement] 正在整理板尺寸、元件和工程约束" });
  const normalizedRegion = insetRegion(normalizeRegion(region, boardWidth, boardHeight), 1);
  const warnings: string[] = [];

  if (normalizedRegion.width <= 0 || normalizedRegion.height <= 0) {
    return { components, placedCount: 0, warnings: ["Placement region is too small after inset."] };
  }

  const movableIds = new Set(components.filter((component) => !component.mounted).map((component) => component.id));
  const board = boardConfig ?? { width: boardWidth, height: boardHeight };
  const initialRouteBudget = { remaining: INITIAL_ROUTE_EVALUATION_BUDGET };
  const optimizationRouteBudget = { remaining: OPTIMIZATION_ROUTE_EVALUATION_BUDGET };
  const initial = createInitialPlacement(components, normalizedRegion, boardWidth, boardHeight, endpoints, warnings, constraints, reportProgress, board, initialRouteBudget);
  if (initial.placedCount === 0) {
    return { components, placedCount: 0, warnings };
  }

  const optimized = optimizePlacement(initial.components, movableIds, normalizedRegion, board, endpoints, constraints, reportProgress, optimizationRouteBudget);
  reportProgress?.({ percent: 100, phase: "complete", detail: "[autoplacement] 自动放置计算完成" });
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
  warnings: string[],
  constraints: DesignConstraint[],
  reportProgress?: AutoPlacementProgressReporter,
  boardConfig?: BoardSize,
  routeBudget: RouteEvaluationBudget = { remaining: INITIAL_ROUTE_EVALUATION_BUDGET }
) {
  const endpointMap = buildEndpointMap(endpoints);
  const netGraph = buildNetGraph(endpoints);
  const lockedComponents = components.filter((component) => component.mounted);
  const movableComponents = components.filter((component) => !component.mounted);
  const occupied = new Set<string>();
  const placedByName = new Map<string, PlacedComponent>();
  const placedPositions = new Map<string, PlacementCandidate>();
  const board: BoardSize = boardConfig ?? { width: boardWidth, height: boardHeight };

  // Register locked (already placed) components as obstacles
  lockedComponents.forEach((component) => {
    placedByName.set(component.name, component);
    getComponentOccupiedCells(component).forEach(([x, y]) => occupied.add(key(x, y)));
  });

  // Separate movable components: hard-constrained first, normal later
  const hasHardPlacementConstraint = (c: PlacedComponent) =>
    activeConstraints(constraints).some((con) =>
      (con.kind === "component_in_region" || con.kind === "component_on_board_edge") &&
      con.strength === "hard" &&
      con.componentIds.includes(c.id)
    );

  const constrainedMovable = movableComponents.filter(hasHardPlacementConstraint);
  const normalMovable = movableComponents.filter((c) => !hasHardPlacementConstraint(c));

  // ── Phase 1: Place hard-constrained components FIRST ──
  // These go directly to their AI-specified positions/edges before anything else.
  for (const [index, component] of constrainedMovable.entries()) {
    reportProgress?.({
      percent: progressInRange(index, constrainedMovable.length, 5, 15),
      phase: "initial-placement",
      detail: `[autoplacement] 正在放置硬约束元件 ${component.name}（${index + 1}/${constrainedMovable.length}）`
    });
    const effectiveRegion = constrainedRegionFor(component, region, constraints, board);
    if (effectiveRegion.width <= 0 || effectiveRegion.height <= 0) {
      warnings.push(`${component.name} 的约束区域为空，无法落位。`);
      continue;
    }
    const candidate = findPlacement(component, components, effectiveRegion, boardWidth, boardHeight, occupied, placedByName, endpointMap, netGraph, endpoints, constraints, undefined, 10, board, false);
    if (!candidate) {
      warnings.push(`${component.name} 无法满足约束条件，无法落位。`);
      continue;
    }
    const placedComponent = { ...candidate.component, mounted: true };
    placedPositions.set(component.id, candidate);
    placedByName.set(component.name, placedComponent);
    getComponentOccupiedCells(placedComponent).forEach(([x, y]) => occupied.add(key(x, y)));
  }

  // ── Phase 2: Place remaining (unconstrained) components ──
  const sortedNormal = [...normalMovable].sort((a, b) => {
    const degreeDiff = connectionDegree(b.name, netGraph) - connectionDegree(a.name, netGraph);
    return degreeDiff || estimateCourtyardArea(b) - estimateCourtyardArea(a);
  });

  const regionArea = region.width * region.height;
  const requiredArea = movableComponents.reduce((sum, c) => sum + estimateCourtyardArea(c), 0);
  if (requiredArea > regionArea) {
    warnings.push(`Placement region is tight: estimated ${requiredArea} occupied cells, current region has ${regionArea}.`);
  }

  for (const [index, component] of sortedNormal.entries()) {
    const percent = progressInRange(index, sortedNormal.length, 15, 50);
    reportProgress?.({
      percent,
      phase: "initial-placement",
      detail: `[autoplacement] 正在为 ${component.name} 生成初始放置候选（${index + 1}/${sortedNormal.length}）`
    });
    const candidate = findPlacement(component, components, region, boardWidth, boardHeight, occupied, placedByName, endpointMap, netGraph, endpoints, constraints, reportProgress, percent, board, true, routeBudget);
    if (!candidate) {
      warnings.push(`${component.name} cannot fit in the selected placement region.`);
      continue;
    }

    const placedComponent = { ...candidate.component, mounted: true };
    placedPositions.set(component.id, candidate);
    placedByName.set(component.name, placedComponent);
    getComponentOccupiedCells(placedComponent).forEach(([x, y]) => occupied.add(key(x, y)));
  }

  return {
    components: components.map((component) => {
      const candidate = placedPositions.get(component.id);
      return candidate ? { ...candidate.component, mounted: true } : component;
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
  placedByName: Map<string, PlacedComponent>,
  endpointMap: EndpointMap,
  netGraph: NetGraph,
  endpoints: RoutedNetEndpoint[],
  constraints: DesignConstraint[],
  reportProgress?: AutoPlacementProgressReporter,
  progressPercent = 25,
  board: BoardSize = { width: boardWidth, height: boardHeight },
  verifyRoutes = true,
  routeBudget: RouteEvaluationBudget = { remaining: INITIAL_ROUTE_EVALUATION_BUDGET }
): PlacementCandidate | undefined {
  const componentRegion = constrainedRegionFor(component, region, constraints, board);
  const placedAirwires = buildPlacedAirwires(placedByName, endpointMap, getBoardModel(board));
  const scoreContext = createScoreContext({ component, region, placedByName, endpointMap, netGraph, placedAirwires, constraints, board });
  const candidates = generatePlacementPoseCandidates(component, true)
    .filter((posed) => matchesOrientationConstraint(posed, constraints))
    .flatMap((posed) => {
    const rotated = posed;
    const box = getFootprintBox(rotated);
    return createSpreadCandidates(componentRegion, box)
      .filter((position) => canPlaceAt(rotated, position, componentRegion, boardWidth, boardHeight, occupied, constraints, board, endpointMap, [...placedByName.values()]))
      .map((position) => ({
        position,
        rotation: rotated.rotation,
        component: { ...rotated, position },
        airwireScore: scorePlacement(position, rotated, scoreContext)
      }));
  }).sort((a, b) => a.airwireScore - b.airwireScore);

  const shortlist = candidates.slice(0, ROUTE_VERIFIED_CANDIDATES);
  if (shortlist.length === 0) {
    return undefined;
  }
  if (!verifyRoutes) return shortlist[0];

  const refs = new Set([...placedByName.keys(), component.name]);
  const partialComponents = allComponents
    .filter((candidate) => refs.has(candidate.name))
    .map((candidate) => placedByName.get(candidate.name) ?? candidate);
  const partialEndpoints = endpoints.filter((endpoint) => refs.has(endpoint.ref));

  const verifiable = shortlist.slice(0, routeBudget.remaining);
  if (verifiable.length === 0) return shortlist[0];

  let best = verifiable[0];
  routeBudget.remaining -= 1;
  reportProgress?.({
    percent: progressPercent,
    phase: "candidate-routing",
    detail: `[autoplacement] 正在用完整布线评估 ${component.name} 的候选 1/${shortlist.length}`
  });
  let bestQuality = routeQualityForComponents(
    replaceComponent(partialComponents, { ...best.component, mounted: true }),
    partialEndpoints,
    board,
    reportProgress,
    progressPercent,
    `${component.name} 候选 1/${shortlist.length}`
  );

  verifiable.slice(1).forEach((candidate, index) => {
    routeBudget.remaining -= 1;
    reportProgress?.({
      percent: progressPercent,
      phase: "candidate-routing",
      detail: `[autoplacement] 正在用完整布线评估 ${component.name} 的候选 ${index + 2}/${shortlist.length}`
    });
    const trial = replaceComponent(partialComponents, { ...candidate.component, mounted: true });
    const quality = routeQualityForComponents(
      trial,
      partialEndpoints,
      board,
      reportProgress,
      progressPercent,
      `${component.name} 候选 ${index + 2}/${shortlist.length}`
    );
    if (compareQuality(quality, bestQuality) < 0 || (compareQuality(quality, bestQuality) === 0 && candidate.airwireScore < best.airwireScore)) {
      best = candidate;
      bestQuality = quality;
    }
  });

  return best;
}

function createScoreContext(params: {
  component: PlacedComponent;
  region: PlacementRegion;
  placedByName: Map<string, PlacedComponent>;
  endpointMap: EndpointMap;
  netGraph: NetGraph;
  placedAirwires: Airwire[];
  constraints: DesignConstraint[];
  board: BoardSize;
}): PlacementScoreContext {
  const boardModel = getBoardModel(params.board);
  return {
    region: params.region,
    crowdingAnchors: buildCrowdingAnchors(params.component, params.placedByName, params.endpointMap),
    placedByName: params.placedByName,
    endpointMap: params.endpointMap,
    netGraph: params.netGraph,
    placedAirwires: params.placedAirwires,
    constraints: params.constraints,
    boardModel,
    netNodes: buildNetNodeIndex(params.placedByName, params.endpointMap, boardModel)
  };
}

/**
 * Anti-crowding anchors. Components that share a net with the candidate are
 * flagged so the spacing penalty can be softened instead of vetoing the
 * "sit on the same row" placements this score is meant to encourage.
 */
function buildCrowdingAnchors(component: PlacedComponent, placedByName: Map<string, PlacedComponent>, endpointMap: EndpointMap): CrowdingAnchor[] {
  const componentNets = new Set((endpointMap.get(component.name) ?? []).map((endpoint) => endpoint.net));
  const anchors: CrowdingAnchor[] = [];
  placedByName.forEach((other) => {
    const netPartner = componentNets.size > 0
      && (endpointMap.get(other.name) ?? []).some((endpoint) => componentNets.has(endpoint.net));
    anchors.push({ position: other.position, netPartner });
  });
  return anchors;
}

/** net -> electrical nodes already owned by a same-net pin (breadboards only). */
function buildNetNodeIndex(placedByName: Map<string, PlacedComponent>, endpointMap: EndpointMap, boardModel: BoardModel) {
  const netNodes = new Map<string, Set<ElectricalNodeId>>();
  if (!boardModel.capabilities.hasInternalConnections) {
    return netNodes;
  }
  placedByName.forEach((other) => {
    const nets = pinNetsForComponent(other, endpointMap);
    componentPinHoles(other).forEach((hole, pinIndex) => {
      const net = nets[pinIndex + 1];
      if (!net) {
        return;
      }
      const node = boardModel.getElectricalNode(hole);
      if (!node) {
        return;
      }
      const nodes = netNodes.get(net) ?? new Set<ElectricalNodeId>();
      nodes.add(node);
      netNodes.set(net, nodes);
    });
  });
  return netNodes;
}

/** Candidate pins that join an existing node of their own net need no jumper. */
function countSameNetNodeReuse(placed: PlacedComponent, context: PlacementScoreContext) {
  if (context.netNodes.size === 0) {
    return 0;
  }
  const nets = pinNetsForComponent(placed, context.endpointMap);
  const reusedNodes = new Set<string>();
  componentPinHoles(placed).forEach((hole, pinIndex) => {
    const net = nets[pinIndex + 1];
    if (!net) {
      return;
    }
    const node = context.boardModel.getElectricalNode(hole);
    if (node && context.netNodes.get(net)?.has(node)) {
      reusedNodes.add(`${net}\u0000${node}`);
    }
  });
  return reusedNodes.size;
}

function scorePlacement(position: [number, number], component: PlacedComponent, context: PlacementScoreContext) {
  const center: [number, number] = [context.region.x + context.region.width / 2, context.region.y + context.region.height / 2];
  const centerDistance = distance(position, center);
  const borderDistance = Math.min(
    position[0] - context.region.x,
    context.region.x + context.region.width - 1 - position[0],
    position[1] - context.region.y,
    context.region.y + context.region.height - 1 - position[1]
  );
  const placed = { ...component, position };
  const network = scoreNetworkPlacement(placed, context);
  const crowdingPenalty = context.crowdingAnchors.reduce((penalty, anchor) => {
    const gap = distance(position, anchor.position);
    if (gap >= MIN_COMPONENT_SPACING) {
      return penalty;
    }
    const weight = anchor.netPartner ? NET_PARTNER_CROWDING_FACTOR : 1;
    return penalty + (MIN_COMPONENT_SPACING - gap) ** 2 * 80 * weight;
  }, 0);
  const edgePenalty = borderDistance <= 0 ? 12 : borderDistance <= 1 ? 4 : 0;
  const crossingPenalty = countCandidateCrossings(network.candidateAirwires, context.placedAirwires);
  const designConstraintPenalty = placementConstraintPenalty(placed, context.placedByName, context.constraints);
  const nodeReuse = countSameNetNodeReuse(placed, context);

  return (
    network.connectedLength * 6 +
    network.unplacedNeighborCount * centerDistance * 0.4 +
    crossingPenalty * 240 +
    crowdingPenalty +
    edgePenalty -
    nodeReuse * SHARED_NODE_REWARD -
    connectionDegree(component.name, context.netGraph) * 8 +
    designConstraintPenalty
  );
}

function optimizePlacement(
  components: PlacedComponent[],
  movableIds: Set<string>,
  region: PlacementRegion,
  board: BoardSize,
  endpoints: RoutedNetEndpoint[],
  constraints: DesignConstraint[],
  reportProgress: AutoPlacementProgressReporter | undefined,
  routeBudget: RouteEvaluationBudget
) {
  const movable = components.filter((component) => movableIds.has(component.id)).slice(0, MAX_OPTIMIZATION_COMPONENTS);
  if (movable.length === 0 || endpoints.length === 0) {
    return components;
  }

  let best = components;
  reportProgress?.({ percent: 52, phase: "optimization", detail: "[autoplacement] 正在评估初始整板布局" });
  let bestQuality = routeQualityForComponents(best, endpoints, board, reportProgress, 52, "初始整板布局");

  routeBudget.remaining -= 1;
  for (let round = 0; round < OPTIMIZATION_ROUNDS; round += 1) {
    let improved = false;
    const focused = focusComponents(best, movableIds, bestQuality, endpoints);

    for (const [componentIndex, component] of focused.entries()) {
      const percent = progressInRange(
        round * focused.length + componentIndex,
        Math.max(1, OPTIMIZATION_ROUNDS * focused.length),
        55,
        94
      );
      reportProgress?.({
        percent,
        phase: "optimization",
        detail: `[autoplacement] 正在优化 ${component.name}（第 ${round + 1}/${OPTIMIZATION_ROUNDS} 轮）`
      });
      const trials = generateLocalCandidates(best, component, movableIds, region, board, endpoints, constraints)
        .map((trial) => ({ trial, estimate: estimateRouteCost(trial, endpoints, board) }))
        .sort((a, b) => a.estimate.jumperCount - b.estimate.jumperCount || a.estimate.length - b.estimate.length)
        .slice(0, routeBudget.remaining);
      for (const [trialIndex, { trial }] of trials.entries()) {
        routeBudget.remaining -= 1;
        const context = `${component.name} 优化候选 ${trialIndex + 1}/${trials.length}，第 ${round + 1}/${OPTIMIZATION_ROUNDS} 轮`;
        reportProgress?.({ percent, phase: "candidate-routing", detail: `[autoplacement] 正在用完整布线评估 ${context}` });
        const quality = routeQualityForComponents(trial, endpoints, board, reportProgress, percent, context);
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

    if (!improved && routeBudget.remaining > 0) {
      const swap = findImprovingSwap(best, movableIds, region, board, endpoints, bestQuality, constraints, reportProgress, 95, routeBudget);
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
  endpoints: RoutedNetEndpoint[],
  constraints: DesignConstraint[]
) {
  const componentRegion = constrainedRegionFor(component, region, constraints, board);
  const occupiedWithoutSelf = buildOccupiedCells(components.filter((candidate) => candidate.id !== component.id));
  const endpointMap = buildEndpointMap(endpoints);
  const netGraph = buildNetGraph(endpoints);
  const placedByName = new Map(components.filter((candidate) => candidate.id !== component.id).map((candidate) => [candidate.name, candidate]));
  const placedAirwires = buildPlacedAirwires(placedByName, endpointMap, getBoardModel(board));
  const scoreContext = createScoreContext({ component, region, placedByName, endpointMap, netGraph, placedAirwires, constraints, board });
  const rotationTrials = generatePlacementPoseCandidates(component, false)
    .filter((trial) => matchesOrientationConstraint(trial, constraints) && canPlaceAt(trial, trial.position, componentRegion, board.width, board.height, occupiedWithoutSelf, constraints, board, endpointMap, [...placedByName.values()]))
    .map((trial) => replaceComponent(components, trial));
  const moveTrials = generatePlacementPoseCandidates(component, false).flatMap((posed) => {
    const rotated = posed;
    const box = getFootprintBox(rotated);
    return createSpreadCandidates(componentRegion, box)
      .filter((position) => matchesOrientationConstraint(rotated, constraints) && canPlaceAt(rotated, position, componentRegion, board.width, board.height, occupiedWithoutSelf, constraints, board, endpointMap, [...placedByName.values()]))
      .map((position) => ({
        component: { ...rotated, position },
        score: scorePlacement(position, rotated, scoreContext)
      }));
  })
    .sort((a, b) => a.score - b.score)
    .slice(0, OPTIMIZATION_MOVE_CANDIDATES)
    .map((trial) => replaceComponent(components, trial.component));
  const diagonalTrials = generateDiagonalCandidates(component, componentRegion, board, occupiedWithoutSelf, placedByName, endpointMap, netGraph, placedAirwires, constraints)
    .map((trial) => replaceComponent(components, trial.component));

  return [...rotationTrials, ...moveTrials, ...diagonalTrials].filter((trial) => isValidPlacement(trial, movableIds, region, board, constraints, endpoints));
}

function findImprovingSwap(
  components: PlacedComponent[],
  movableIds: Set<string>,
  region: PlacementRegion,
  board: BoardSize,
  endpoints: RoutedNetEndpoint[],
  currentQuality: RouteQuality,
  constraints: DesignConstraint[],
  reportProgress: AutoPlacementProgressReporter | undefined,
  progressPercent: number,
  routeBudget: RouteEvaluationBudget
) {
  const movable = components.filter((component) => movableIds.has(component.id)).slice(0, 12);
  for (let a = 0; a < movable.length; a += 1) {
    for (let b = a + 1; b < movable.length; b += 1) {
      if (routeBudget.remaining <= 0) return undefined;
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
      if (!isValidPlacement(swapped, movableIds, region, board, constraints, endpoints)) {
        continue;
      }
      const context = `${first.name} 与 ${second.name} 交换位置`;
      reportProgress?.({ percent: progressPercent, phase: "candidate-routing", detail: `[autoplacement] 正在用完整布线评估 ${context}` });
      const quality = routeQualityForComponents(swapped, endpoints, board, reportProgress, progressPercent, context);
      routeBudget.remaining -= 1;
      if (compareQuality(quality, currentQuality) < 0) {
        return { components: swapped, quality };
      }
    }
  }
  return undefined;
}

function routeQualityForComponents(
  components: PlacedComponent[],
  endpointTemplates: RoutedNetEndpoint[],
  board: BoardSize,
  reportProgress?: AutoPlacementProgressReporter,
  progressPercent = 50,
  context = "放置候选"
): RouteQuality {
  const endpoints = endpointsForComponents(endpointTemplates, components);
  reportProgress?.({
    percent: progressPercent,
    phase: "candidate-routing",
    routeEvaluation: "full",
    detail: `[autoplacement] 正在完整评估布线质量：${context}`
  });
  const routing = autoRouteBoard(board, endpoints, components, [], [], (routingProgress) => {
    const stageLabels = {
      round: "准备布线轮次",
      net: "处理网络",
      "strict-search": "严格寻路",
      "relaxed-search": "宽松寻路",
      "escape-search": "引脚逃逸寻路"
    } as const;
    const net = routingProgress.net ? `，网络 ${routingProgress.net}` : "";
    const expanded = routingProgress.expandedNodes ? `，已展开 ${routingProgress.expandedNodes} 个节点` : "";
    reportProgress?.({
      percent: progressPercent,
      phase: "candidate-routing",
      detail: `[autoplacement] ${context}：${stageLabels[routingProgress.stage]} ${routingProgress.round}/${routingProgress.totalRounds}${net}${expanded}`
    });
  });
  return qualityFromRouting(routing, components, endpoints, board);
}

function qualityFromRouting(routing: RoutingState, components: PlacedComponent[], endpoints: RoutedNetEndpoint[], board: BoardSize): RouteQuality {
  return {
    failedNetCount: routing.failedNets.length,
    jumperCount: routing.jumpers.length,
    jumperLength: routing.jumpers.reduce((sum, jumper) => sum + manhattan(jumper.from, jumper.to), 0),
    bottomLength: routing.traces.reduce((sum, trace) => sum + pathLength(trace.points), 0),
    bendCount: routing.traces.reduce((sum, trace) => sum + countBends(trace.points), 0),
    airwireCrossings: countAirwireCrossings(components, endpoints, board),
    diagonalPlacementCount: components.filter(isDiagonalPlacement).length,
    leadStretchPenalty: components.reduce((sum, component) => sum + leadStretchPenalty(component), 0)
  };
}

function compareQuality(a: RouteQuality, b: RouteQuality) {
  return (
    a.failedNetCount - b.failedNetCount ||
    a.jumperCount - b.jumperCount ||
    a.jumperLength - b.jumperLength ||
    a.bottomLength - b.bottomLength ||
    a.bendCount - b.bendCount ||
    a.diagonalPlacementCount - b.diagonalPlacementCount ||
    a.leadStretchPenalty - b.leadStretchPenalty ||
    a.airwireCrossings - b.airwireCrossings
  );
}

function estimateRouteCost(components: PlacedComponent[], endpointTemplates: RoutedNetEndpoint[], board: BoardSize) {
  const endpoints = endpointsForComponents(endpointTemplates, components);
  const boardModel = getBoardModel(board);
  const byNet = new Map<string, Map<string, GridPoint[]>>();
  endpoints.forEach((endpoint) => {
    const node = boardModel.getElectricalNode(endpoint.grid);
    const nodeKey = node ?? `unresolved:${endpoint.ref}:${endpoint.pin}`;
    const groups = byNet.get(endpoint.net) ?? new Map<string, GridPoint[]>();
    const points = groups.get(nodeKey) ?? [];
    points.push(endpoint.grid);
    groups.set(nodeKey, points);
    byNet.set(endpoint.net, groups);
  });

  let jumperCount = 0;
  let length = 0;
  byNet.forEach((groups) => {
    const nodes = [...groups.values()];
    if (board.kind === "breadboard") {
      jumperCount += Math.max(0, nodes.length - 1);
    }
    length += minimumGroupSpanningLength(nodes);
  });
  return { jumperCount, length };
}

function minimumGroupSpanningLength(groups: GridPoint[][]) {
  const remaining = groups.slice(1);
  const connected = groups.length > 0 ? [groups[0]] : [];
  let length = 0;
  while (remaining.length > 0 && connected.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      for (const connectedGroup of connected) {
        for (const from of connectedGroup) {
          for (const to of remaining[index]) {
            const distance = manhattan(from, to);
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestIndex = index;
            }
          }
        }
      }
    }
    length += nearestDistance;
    connected.push(remaining.splice(nearestIndex, 1)[0]);
  }
  return length;
}

function generatePlacementPoseCandidates(component: PlacedComponent, includeDiagonal: boolean): PlacedComponent[] {
  const baseCandidates = isStretchableTwoPin(component)
    ? leadSpacingRange(component).flatMap((spacing) => {
      const stretched = withTwoPinVector(component, spacing, 0);
      return ROTATIONS.map((rotation) => ({ ...stretched, rotation }));
    })
    : ROTATIONS.map((rotation) => ({ ...component, rotation }));

  if (!includeDiagonal || !isStretchableTwoPin(component)) {
    return baseCandidates;
  }

  const diagonal = diagonalVectors(component).map(([dx, dy]) => withTwoPinVector(component, dx, dy));
  return [...baseCandidates, ...diagonal];
}

function generateDiagonalCandidates(
  component: PlacedComponent,
  region: PlacementRegion,
  board: BoardSize,
  occupiedWithoutSelf: Set<string>,
  placedByName: Map<string, PlacedComponent>,
  endpointMap: EndpointMap,
  netGraph: NetGraph,
  placedAirwires: Airwire[],
  constraints: DesignConstraint[]
) {
  if (!isStretchableTwoPin(component)) {
    return [];
  }

  const scoreContext = createScoreContext({ component, region, placedByName, endpointMap, netGraph, placedAirwires, constraints, board });
  return generatePlacementPoseCandidates(component, true)
    .filter((candidate) => isDiagonalPlacement(candidate))
    .flatMap((candidate) => {
      const positions = nearbyPositions(component.position, DIAGONAL_SEARCH_RADIUS);
      return positions
        .filter((position) => matchesOrientationConstraint(candidate, constraints) && canPlaceAt(candidate, position, region, board.width, board.height, occupiedWithoutSelf, constraints, board, endpointMap, [...placedByName.values()]))
        .map((position) => ({
          component: { ...candidate, position },
          score: scorePlacement(position, candidate, scoreContext)
        }));
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, DIAGONAL_LOCAL_CANDIDATES);
}

function focusComponents(components: PlacedComponent[], movableIds: Set<string>, quality: RouteQuality, endpoints: RoutedNetEndpoint[]) {
  const failedOrJumperNets = new Set<string>();
  if (quality.failedNetCount > 0 || quality.jumperCount > 0) {
    endpoints.forEach((endpoint) => failedOrJumperNets.add(endpoint.net));
  }
  const movable = components.filter((component) => movableIds.has(component.id));
  return [...movable].sort((a, b) => relevantEndpointCount(b, endpoints, failedOrJumperNets) - relevantEndpointCount(a, endpoints, failedOrJumperNets));
}

function relevantEndpointCount(component: PlacedComponent, endpoints: RoutedNetEndpoint[], nets: Set<string>) {
  return endpoints.filter((endpoint) => endpoint.ref === component.name && (nets.size === 0 || nets.has(endpoint.net))).length;
}

function isStretchableTwoPin(component: PlacedComponent) {
  return isBendableTwoPin(component);
}

function leadSpacingRange(component: PlacedComponent) {
  const { min, max } = spacingLimits(component.kind).leadSpacing;
  const values = new Set<number>([component.leadSpacing]);
  for (let spacing = min; spacing <= max; spacing += 1) {
    values.add(spacing);
  }
  return [...values].filter((spacing) => spacing >= 1).sort((a, b) => a - b);
}

function diagonalVectors(component: PlacedComponent): Array<[number, number]> {
  const { min, max } = spacingLimits(component.kind).leadSpacing;
  const vectors: Array<[number, number]> = [];
  for (let dx = -max; dx <= max; dx += 1) {
    for (let dy = -max; dy <= max; dy += 1) {
      if (dx === 0 || dy === 0) {
        continue;
      }
      const span = Math.hypot(dx, dy);
      if (span >= min && span <= max) {
        vectors.push([dx, dy]);
      }
    }
  }
  return vectors.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]));
}

function withTwoPinVector(component: PlacedComponent, dx: number, dy: number): PlacedComponent {
  return {
    ...component,
    leadSpacing: Math.round(Math.hypot(dx, dy) * 100) / 100,
    rowSpacing: dy,
    rotation: 0,
    pinOffsets: [[0, 0], [dx, dy]]
  };
}

function isDiagonalPlacement(component: PlacedComponent) {
  if (!isStretchableTwoPin(component)) {
    return false;
  }
  const anchor = component.pinOffsets[0] ?? [0, 0];
  const other = component.pinOffsets[1] ?? anchor;
  const [dx, dy] = rotateGridOffset([other[0] - anchor[0], other[1] - anchor[1]], component.rotation);
  return dx !== 0 && dy !== 0;
}

function leadStretchPenalty(component: PlacedComponent) {
  if (!isStretchableTwoPin(component)) {
    return 0;
  }
  const anchor = component.pinOffsets[0] ?? [0, 0];
  const other = component.pinOffsets[1] ?? anchor;
  const actualSpacing = Math.hypot(other[0] - anchor[0], other[1] - anchor[1]);
  return Math.abs(actualSpacing - preferredLeadSpan(component));
}

function nearbyPositions(center: [number, number], radius: number) {
  const positions: Array<[number, number]> = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) <= radius) {
        positions.push([center[0] + dx, center[1] + dy]);
      }
    }
  }
  return positions.sort((a, b) => manhattan(a, center) - manhattan(b, center));
}

function scoreNetworkPlacement(placed: PlacedComponent, context: PlacementScoreContext) {
  const candidateAirwires: Airwire[] = [];
  let connectedLength = 0;
  let unplacedNeighborCount = 0;
  const endpointsByNet = endpointsGroupedByNet(context.endpointMap);

  endpointsByNet.forEach((netEndpoints, net) => {
    const existingNodes = new Map<string, GridPoint[]>();
    const candidateNodes = new Map<string, GridPoint[]>();
    const unplacedRefs = new Set<string>();
    netEndpoints.forEach((endpoint) => {
      const component = endpoint.ref === placed.name ? placed : context.placedByName.get(endpoint.ref);
      if (!component) {
        unplacedRefs.add(endpoint.ref);
        return;
      }
      const point = pinGridAt(component, component.position, endpoint.pin);
      const electricalNode = context.boardModel.getElectricalNode(point);
      const nodeKey = electricalNode ?? `unresolved:${point[0]},${point[1]}`;
      const nodes = endpoint.ref === placed.name ? candidateNodes : existingNodes;
      const points = nodes.get(nodeKey) ?? [];
      points.push(point);
      nodes.set(nodeKey, points);
    });
    unplacedNeighborCount += unplacedRefs.size * 0.25;

    let connectedPoints = [...existingNodes.values()].flat();
    const remaining: GridPoint[][] = [];
    candidateNodes.forEach((points, node) => {
      if (existingNodes.has(node)) connectedPoints.push(...points);
      else remaining.push(points);
    });
    if (connectedPoints.length === 0 && remaining.length > 0) {
      connectedPoints = remaining.shift() ?? [];
    }
    while (remaining.length > 0 && connectedPoints.length > 0) {
      let best: { from: GridPoint; to: GridPoint; distance: number; targetIndex: number } | undefined;
      remaining.forEach((toNode, targetIndex) => {
        connectedPoints.forEach((from) => toNode.forEach((to) => {
          const distance = manhattan(from, to);
          if (!best || distance < best.distance) best = { from, to, distance, targetIndex };
        }));
      });
      if (!best) break;
      connectedLength += best.distance;
      if (best.distance > 0) {
        candidateAirwires.push({ from: best.from, to: best.to, net });
      }
      connectedPoints.push(...remaining.splice(best.targetIndex, 1)[0]);
    }
  });

  return { connectedLength, unplacedNeighborCount, candidateAirwires };
}

function canPlaceAt(
  component: PlacedComponent,
  position: [number, number],
  region: PlacementRegion,
  boardWidth: number,
  boardHeight: number,
  occupied: Set<string>,
  constraints: DesignConstraint[] = [],
  board: BoardSize = { width: boardWidth, height: boardHeight },
  endpointMap: EndpointMap = new Map(),
  placedComponents: PlacedComponent[] = []
) {
  const placed = { ...component, position };
  const cells = getComponentOccupiedCells(placed);
  const boardModel = getBoardModel(board);
  const placementIsValid = boardModel.validatePlacement(placed, pinNetsForComponent(placed, endpointMap)).valid;
  if (pinsConflictWithPlaced(placed, placedComponents, endpointMap, board)) {
    return false;
  }
  return placementIsValid && cells.every(([x, y]) => {
    return (
      x >= 0 &&
      y >= 0 &&
      x < boardWidth &&
      y < boardHeight &&
      x >= region.x &&
      y >= region.y &&
      x < region.x + region.width &&
      y < region.y + region.height &&
      !occupied.has(key(x, y)) &&
      !isPlacementKeepoutCell(x, y, constraints)
    );
  }) && isWithinRequiredEdgeRegion(placed, cells, board, constraints);
}

/**
 * Cross-component pin rules (one hole = one pin; shared node must be one net)
 * come from the board layer so manual placement, auto-placement and DRC all
 * apply exactly the same rule.
 */
function pinsConflictWithPlaced(
  candidate: PlacedComponent,
  placedComponents: PlacedComponent[],
  endpointMap: EndpointMap,
  board: BoardSize
) {
  if (placedComponents.length === 0) {
    return false;
  }
  const boardModel = getBoardModel(board);
  const candidateNets = pinNetsForComponent(candidate, endpointMap);
  const candidateHoles = componentPinHoles(candidate);
  return placedComponents.some((other) => {
    const otherNets = pinNetsForComponent(other, endpointMap);
    const otherHoles = componentPinHoles(other);
    return candidateHoles.some((hole, candidateIndex) => otherHoles.some((otherHole, otherIndex) => pinsConflict(
      boardModel,
      hole,
      candidateNets[candidateIndex + 1],
      otherHole,
      otherNets[otherIndex + 1]
    )));
  });
}

function crossComponentPinLayouts(components: PlacedComponent[], endpointMap: EndpointMap) {
  return components.map((component) => layoutFromComponent(component, pinNetsForComponent(component, endpointMap)));
}

function constrainedRegionFor(component: PlacedComponent, fallback: PlacementRegion, constraints: DesignConstraint[], board: BoardSize): PlacementRegion {
  const active = activeConstraints(constraints);
  const inRegionConstraints = active.filter(
    (c): c is DesignConstraint & { kind: "component_in_region"; region: ConstraintRegion } =>
      c.kind === "component_in_region" && c.strength === "hard" && (c as { componentIds: string[] }).componentIds.includes(component.id)
  );
  const edgeConstraints = active.filter(
    (c): c is DesignConstraint & { kind: "component_on_board_edge"; edge: "top" | "bottom" | "left" | "right" | "short_side" | "long_side" | "any" } =>
      c.kind === "component_on_board_edge" && c.strength === "hard" && (c as { componentIds: string[] }).componentIds.includes(component.id)
  );

  // When hard component_in_region constraints exist, start from the AI-specified region
  // rather than the manual fallback, so AI constraints are directly satisfied.
  let region: PlacementRegion;
  if (inRegionConstraints.length > 0) {
    region = inRegionConstraints[0].region;
    for (let i = 1; i < inRegionConstraints.length; i += 1) {
      region = intersectRegions(region, inRegionConstraints[i].region);
    }
    // Also intersect with board bounds for safety
    region = intersectRegions(region, { x: 0, y: 0, width: board.width, height: board.height });
  } else {
    region = fallback;
  }

  // Extend region toward board edges for hard component_on_board_edge constraints
  for (const constraint of edgeConstraints) {
    const edges = resolveEdgeTargets(constraint.edge, board);
    for (const edge of edges) {
      region = extendRegionToEdge(region, edge, board);
    }
  }

  return region;
}

function resolveEdgeTargets(edge: "top" | "bottom" | "left" | "right" | "short_side" | "long_side" | "any", board: BoardSize): Array<"top" | "bottom" | "left" | "right"> {
  if (edge === "top" || edge === "bottom" || edge === "left" || edge === "right") return [edge];
  if (edge === "any") return ["top", "bottom", "left", "right"];
  const horizontalShort = board.width <= board.height;
  if (edge === "short_side") return horizontalShort ? ["top", "bottom"] : ["left", "right"];
  return horizontalShort ? ["left", "right"] : ["top", "bottom"];
}

function extendRegionToEdge(region: PlacementRegion, edge: "top" | "bottom" | "left" | "right", board: BoardSize): PlacementRegion {
  switch (edge) {
    case "left":
      return { x: 0, y: region.y, width: region.x + region.width, height: region.height };
    case "right":
      return { x: region.x, y: region.y, width: board.width - region.x, height: region.height };
    case "top":
      return { x: region.x, y: 0, width: region.width, height: region.y + region.height };
    case "bottom":
      return { x: region.x, y: region.y, width: region.width, height: board.height - region.y };
  }
}

function allowedEdgeRegionsFor(component: PlacedComponent, board: BoardSize, constraints: DesignConstraint[]): PlacementRegion[] {
  return activeConstraints(constraints).flatMap((constraint) => {
    if (constraint.kind !== "component_on_board_edge" || constraint.strength !== "hard" || !constraint.componentIds.includes(component.id)) {
      return [];
    }
    return edgeRegions(constraint.edge, constraint.depth ?? 1, board);
  });
}

function edgeRegions(edge: "top" | "bottom" | "left" | "right" | "short_side" | "long_side" | "any", depth: number, board: BoardSize): PlacementRegion[] {
  const top = { x: 0, y: 0, width: board.width, height: Math.min(depth, board.height) };
  const bottom = { x: 0, y: Math.max(0, board.height - depth), width: board.width, height: Math.min(depth, board.height) };
  const left = { x: 0, y: 0, width: Math.min(depth, board.width), height: board.height };
  const right = { x: Math.max(0, board.width - depth), y: 0, width: Math.min(depth, board.width), height: board.height };
  if (edge === "top") return [top];
  if (edge === "bottom") return [bottom];
  if (edge === "left") return [left];
  if (edge === "right") return [right];
  if (edge === "any") return [top, bottom, left, right];
  const horizontalShort = board.width <= board.height;
  if (edge === "short_side") return horizontalShort ? [top, bottom] : [left, right];
  return horizontalShort ? [left, right] : [top, bottom];
}

function placementConstraintPenalty(
  component: PlacedComponent,
  placedByName: Map<string, PlacedComponent>,
  constraints: DesignConstraint[]
) {
  let penalty = 0;
  for (const constraint of activeConstraints(constraints)) {
    const multiplier = constraint.strength === "hard" ? 10000 : 120;
    if (constraint.kind === "component_in_region" && constraint.componentIds.includes(component.id)) {
      const [x, y] = component.position;
      const dx = x < constraint.region.x
        ? constraint.region.x - x
        : Math.max(0, x - (constraint.region.x + constraint.region.width - 1));
      const dy = y < constraint.region.y
        ? constraint.region.y - y
        : Math.max(0, y - (constraint.region.y + constraint.region.height - 1));
      penalty += (dx + dy) * multiplier;
    }
    if (constraint.kind === "component_near_component" && constraint.componentId === component.id) {
      const anchor = [...placedByName.values()].find((candidate) => candidate.id === constraint.anchorComponentId);
      if (anchor) {
        const distance = Math.abs(component.position[0] - anchor.position[0]) + Math.abs(component.position[1] - anchor.position[1]);
        penalty += Math.max(0, distance - constraint.maxDistance) * multiplier;
      }
    }
    if (constraint.kind === "component_orientation" && constraint.componentId === component.id && constraint.strength === "soft") {
      const degrees = ((component.rotation * 180 / Math.PI) % 360 + 360) % 360;
      penalty += Math.min(Math.abs(degrees - constraint.rotationDegrees), 360 - Math.abs(degrees - constraint.rotationDegrees)) * 2;
    }
    if (constraint.kind === "region_keepout" && constraint.blockPlacement && constraint.strength === "soft") {
      const [x, y] = component.position;
      if (x >= constraint.region.x && y >= constraint.region.y && x < constraint.region.x + constraint.region.width && y < constraint.region.y + constraint.region.height) {
        penalty += 500;
      }
    }
  }
  return penalty;
}

function intersectRegions(a: PlacementRegion, b: PlacementRegion): PlacementRegion {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function matchesOrientationConstraint(component: PlacedComponent, constraints: DesignConstraint[]) {
  const orientation = activeConstraints(constraints).find(
    (constraint) => constraint.kind === "component_orientation" && constraint.strength === "hard" && constraint.componentId === component.id
  );
  if (!orientation || orientation.kind !== "component_orientation") return true;
  const degrees = ((component.rotation * 180 / Math.PI) % 360 + 360) % 360;
  return Math.abs(degrees - orientation.rotationDegrees) < 0.001;
}

function isPlacementKeepoutCell(x: number, y: number, constraints: DesignConstraint[]) {
  return activeConstraints(constraints).some((constraint) => (
    constraint.kind === "region_keepout" &&
    constraint.strength === "hard" && constraint.blockPlacement &&
    x >= constraint.region.x &&
    y >= constraint.region.y &&
    x < constraint.region.x + constraint.region.width &&
    y < constraint.region.y + constraint.region.height
  ));
}

function isValidPlacement(
  components: PlacedComponent[],
  movableIds: Set<string>,
  region: PlacementRegion,
  board: BoardSize,
  constraints: DesignConstraint[] = [],
  endpoints: RoutedNetEndpoint[] = []
) {
  const occupied = new Set<string>();
  const boardModel = getBoardModel(board);
  const endpointMap = buildEndpointMap(endpoints);
  for (const component of components) {
    const cells = getComponentOccupiedCells(component);
    const effectiveRegion = movableIds.has(component.id)
      ? constrainedRegionFor(component, region, constraints, board)
      : undefined;
    for (const [x, y] of cells) {
      if (x < 0 || y < 0 || x >= board.width || y >= board.height) {
        return false;
      }
      if (effectiveRegion && (x < effectiveRegion.x || y < effectiveRegion.y || x >= effectiveRegion.x + effectiveRegion.width || y >= effectiveRegion.y + effectiveRegion.height)) {
        return false;
      }
      if (isPlacementKeepoutCell(x, y, constraints)) {
        return false;
      }
      const id = key(x, y);
      if (occupied.has(id)) {
        return false;
      }
      occupied.add(id);
    }
    if (!boardModel.validatePlacement(component, pinNetsForComponent(component, endpointMap)).valid) return false;
    if (!isWithinRequiredEdgeRegion(component, cells, board, constraints)) {
      return false;
    }
  }
  if (placementHasPinConflicts(getBoardModel(board), crossComponentPinLayouts(components, endpointMap))) {
    return false;
  }
  return true;
}

function isWithinRequiredEdgeRegion(
  component: PlacedComponent,
  cells: Array<[number, number]>,
  board: BoardSize,
  constraints: DesignConstraint[]
) {
  const regions = allowedEdgeRegionsFor(component, board, constraints);
  if (regions.length === 0) {
    return true;
  }
  return regions.some((region) => cells.every(([x, y]) => (
    x >= region.x &&
    y >= region.y &&
    x < region.x + region.width &&
    y < region.y + region.height
  )));
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
  if (component.kind === "dip" || component.kind === "dip_switch" || component.kind === "seven_segment_display" || component.kind === "alphanumeric_display" || component.kind === "pin_header") {
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
  return componentPinHoles(component);
}

function getFootprintBox(component: PlacedComponent): FootprintBox {
  const anchor = component.pinOffsets[0] ?? [0, 0];
  const holes = component.pinOffsets.map((offset) => rotateGridOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation));
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

function buildPlacedAirwires(placedByName: Map<string, PlacedComponent>, endpointMap: EndpointMap, boardModel: BoardModel) {
  const airwires: Airwire[] = [];
  const byNet = endpointsGroupedByNet(endpointMap);
  byNet.forEach((netEndpoints, net) => {
    const groups = new Map<string, GridPoint[]>();
    netEndpoints.forEach((endpoint) => {
      const component = placedByName.get(endpoint.ref);
      if (!component) return;
      const point = pinGridAt(component, component.position, endpoint.pin);
      const node = boardModel.getElectricalNode(point);
      const nodeKey = node ?? `unresolved:${point[0]},${point[1]}`;
      const points = groups.get(nodeKey) ?? [];
      points.push(point);
      groups.set(nodeKey, points);
    });

    const remaining = [...groups.values()];
    const connected = remaining.splice(0, 1);
    while (remaining.length > 0 && connected.length > 0) {
      let best: { from: GridPoint; to: GridPoint; distance: number; targetIndex: number } | undefined;
      connected.forEach((fromGroup) => remaining.forEach((toGroup, targetIndex) => {
        fromGroup.forEach((from) => toGroup.forEach((to) => {
          const distance = manhattan(from, to);
          if (!best || distance < best.distance) best = { from, to, distance, targetIndex };
        }));
      }));
      if (!best) break;
      if (best.distance > 0) airwires.push({ from: best.from, to: best.to, net });
      connected.push(remaining.splice(best.targetIndex, 1)[0]);
    }
  });
  return airwires;
}

function countAirwireCrossings(components: PlacedComponent[], endpoints: RoutedNetEndpoint[], board: BoardSize) {
  const byName = new Map(components.map((component) => [component.name, component]));
  return countCandidateCrossings(buildPlacedAirwires(byName, buildEndpointMap(endpoints), getBoardModel(board)), []);
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
  const [rx, ry] = rotateGridOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
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

function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
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

function pinNetsForComponent(component: PlacedComponent, endpointMap: EndpointMap) {
  return Object.fromEntries((endpointMap.get(component.name) ?? []).map((endpoint) => [endpoint.pin, endpoint.net]));
}

function progressInRange(index: number, total: number, start: number, end: number) {
  if (total <= 0) return end;
  return Math.round(start + (end - start) * Math.min(1, Math.max(0, index / total)));
}
