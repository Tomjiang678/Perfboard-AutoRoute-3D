import type {
  BoardSize,
  BottomTrace,
  DrcIssue,
  DrcReport,
  JumperRoute,
  PlacedComponent,
  FailedNetDiagnostic,
  PinRouteStatus,
  RoutedNetEndpoint,
  RoutingState
} from "../../types/project";
import {
  adjacentCells,
  edgeKey,
  expandOrthogonalPath,
  formatSegment,
  inBounds,
  key,
  manhattan,
  neighbors,
  parseKey,
  segmentsIntersect,
  shareEndpoint,
  traceEdges,
  type GridPoint,
  type RouterCell
} from "./routingGeometry";

interface NetPlan {
  net: string;
  endpoints: RoutedNetEndpoint[];
  priority: number;
  span: number;
}

interface SearchNode extends RouterCell {
  direction?: string;
  cost: number;
  priority: number;
}

interface RouteOwner {
  net: string;
  routeId: string;
  priority: number;
  locked?: boolean;
}

interface RouteRecord {
  id: string;
  net: string;
  traces: BottomTrace[];
  jumpers: JumperRoute[];
  priority: number;
  locked: boolean;
  failedConnections: number;
  blockedRouteIds: Set<string>;
}

interface EscapeCandidate {
  endpoint: RoutedNetEndpoint;
  path: Array<[number, number]>;
  terminal: [number, number];
  cost: number;
}

interface AppliedEscape {
  terminalByEndpoint: Map<string, [number, number]>;
  endpointCellByTerminal: Map<string, string>;
  traces: BottomTrace[];
}

interface SearchResult {
  path?: Array<[number, number]>;
  cost: number;
  blockedRouteIds: Set<string>;
}

interface RouteAttempt {
  traces: BottomTrace[];
  jumpers: JumperRoute[];
  failedConnections: number;
  blockedRouteIds: Set<string>;
}

interface CongestionMap {
  width: number;
  height: number;
  cost: number[];
}

interface PinAccessKeepout {
  reservedByCell: Map<string, Set<string>>;
}

interface PadOwner {
  ref: string;
  pin: number;
  grid: GridPoint;
  expectedNet?: string;
}

interface RoutingScore {
  routedNetCount: number;
  failedNetCount: number;
  totalBottomLength: number;
  jumperCount: number;
  totalJumperLength: number;
  viaOrLayerSwitchCount: number;
  congestionPenalty: number;
  pinAccessPenalty: number;
  score: number;
}

interface RoutingResultWithScore extends RoutingState {
  /**
   * Optional diagnostic fields added by the improved autorouter.
   * Existing UI ignores them, so older callers remain compatible.
   */
  score?: RoutingScore;
  jumperStats?: {
    count: number;
    totalLength: number;
  };
}

interface ConnectivityCheckResult {
  warnings: string[];
  failedNetDetails: FailedNetDiagnostic[];
}

export interface RoutingValidationResult extends ConnectivityCheckResult {
  drc: DrcReport;
}

const MAX_ROUTING_ROUNDS = 5;
const MAX_RIP_UPS_PER_FAILURE = 3;
const MAX_TOTAL_RIP_UPS = 18;
const MAX_ESCAPES_PER_PIN = 3;

export function autoRouteBoard(
  board: BoardSize,
  endpoints: RoutedNetEndpoint[],
  components: PlacedComponent[] = []
): RoutingState {
  const plans = buildNetPlans(endpoints);
  const endpointOwner = buildEndpointOwner(endpoints);
  const padOwner = buildPadOwner(components, endpoints);
  const pinAccessKeepout = buildPinAccessKeepout(board, endpoints);
  const componentByRef = new Map(components.map((component) => [component.name, component]));
  const escapeCandidates = generatePinEscapeCandidates(board, endpoints, componentByRef);
  let bestResult: RoutingResultWithScore | undefined;
  let ripUpBudget = MAX_TOTAL_RIP_UPS;
  const congestionBias = createEmptyCongestionBias(board);
  const warnings: string[] = [];

  for (let round = 0; round < MAX_ROUTING_ROUNDS; round += 1) {
    const records = new Map<string, RouteRecord>();
    const routeOwner = new Map<string, RouteOwner>();
    const edgeOwner = new Map<string, RouteOwner>();
    const failedNets = new Set<string>();
    const queue = sortNetPlans(plans, congestionBias);
    let didRipUp = false;

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const plan = queue[queueIndex];
      const congestionMap = buildCongestionMap(board, endpoints, routeOwner, congestionBias);
      const attempt = routeMultiPinNet(
        board,
        plan,
        endpointOwner,
        padOwner,
        pinAccessKeepout,
        routeOwner,
        edgeOwner,
        congestionMap,
        escapeCandidates
      );

      if (attempt.failedConnections > 0 || attempt.jumpers.length > Math.max(1, Math.ceil(plan.endpoints.length / 2))) {
        const ripped = ripUpBlockingRoutes(records, routeOwner, edgeOwner, attempt.blockedRouteIds, plan, ripUpBudget);
        if (ripped.length > 0) {
          ripUpBudget -= ripped.length;
          didRipUp = true;
          increaseCongestionBias(congestionBias, ripped, board);
          queue.push(...ripped.map((record) => planFromRecord(record, plans)));
        }
      }

      const record = commitRouteAttempt(plan, attempt, records, routeOwner, edgeOwner);
      if (record.failedConnections > 0) {
        failedNets.add(plan.net);
      }
    }

    const result = buildRoutingStateFromRecords(records, plans, failedNets, warnings);
    const validation = validateRoutingResult(board, result, endpoints, components);
    result.drc = validation.drc;
    result.warnings = [...result.warnings, ...validation.warnings];
    result.diagnostics = { failedNetDetails: validation.failedNetDetails };
    validation.failedNetDetails.forEach((detail) => failedNets.add(detail.net));
    validation.drc.errors.forEach((issue) => {
      if (issue.net) {
        failedNets.add(issue.net);
      }
      if (issue.expectedNet) {
        failedNets.add(issue.expectedNet);
      }
    });
    result.failedNets = [...new Set([...result.failedNets, ...failedNets])];
    result.score = scoreRoutingResult(board, result, endpoints, buildCongestionMap(board, endpoints, new Map(), congestionBias));
    result.jumperStats = {
      count: result.jumpers.length,
      totalLength: totalJumperLength(result.jumpers)
    };

    if (!bestResult || result.score.score < (bestResult.score?.score ?? Number.POSITIVE_INFINITY)) {
      bestResult = result;
    }

    if (!didRipUp || ripUpBudget <= 0 || result.failedNets.length === 0) {
      break;
    }
  }

  const finalResult = bestResult ?? {
    traces: [],
    jumpers: [],
    failedNets: plans.map((plan) => plan.net),
    warnings: ["Autorouter did not produce a route."]
  };

  if (finalResult.jumpers.length > 0) {
    finalResult.warnings = [
      ...finalResult.warnings,
      `Bottom routing used ${finalResult.jumpers.length} jumper(s), total jumper length ${totalJumperLength(finalResult.jumpers).toFixed(1)} grid units.`
    ];
  }

  return finalResult;
}

function generatePinEscapeCandidates(
  board: BoardSize,
  endpoints: RoutedNetEndpoint[],
  componentByRef: Map<string, PlacedComponent>
) {
  const endpointCells = new Set(endpoints.map((endpoint) => key(endpoint.grid[0], endpoint.grid[1])));
  const candidates = new Map<string, EscapeCandidate[]>();

  endpoints.forEach((endpoint) => {
    const component = componentByRef.get(endpoint.ref);
    const directions = getEscapeDirections(endpoint, component, board);
    const endpointCandidates: EscapeCandidate[] = [];

    directions.slice(0, MAX_ESCAPES_PER_PIN).forEach((direction, directionIndex) => {
      for (let length = 1; length <= 3; length += 1) {
        const path = buildStraightEscapePath(endpoint.grid, direction, length, board);
        if (path.length < 2) {
          continue;
        }

        const terminal = path[path.length - 1];
        const crossesOtherEndpoint = path.slice(1).some(([x, y]) => endpointCells.has(key(x, y)));
        if (crossesOtherEndpoint) {
          continue;
        }

        endpointCandidates.push({
          endpoint,
          path,
          terminal,
          cost: length + directionIndex * 2 + edgePenalty(terminal, board)
        });
      }
    });

    if (endpointCandidates.length === 0) {
      endpointCandidates.push({ endpoint, path: [endpoint.grid], terminal: endpoint.grid, cost: 20 });
    }

    candidates.set(endpointKey(endpoint), endpointCandidates.sort((a, b) => a.cost - b.cost));
  });

  return candidates;
}

function applyEscapeRoutes(
  board: BoardSize,
  plan: NetPlan,
  routeOwner: Map<string, RouteOwner>,
  edgeOwner: Map<string, RouteOwner>,
  endpointOwner: Map<string, string>,
  padOwner: Map<string, PadOwner>,
  pinAccessKeepout: PinAccessKeepout,
  congestionMap: CongestionMap,
  escapeCandidates: Map<string, EscapeCandidate[]>
): AppliedEscape {
  const terminalByEndpoint = new Map<string, [number, number]>();
  const endpointCellByTerminal = new Map<string, string>();
  const traces: BottomTrace[] = [];

  plan.endpoints.forEach((endpoint) => {
    const candidates = escapeCandidates.get(endpointKey(endpoint)) ?? [
      { endpoint, path: [endpoint.grid], terminal: endpoint.grid, cost: 0 }
    ];
    const selected = candidates.find((candidate) =>
      candidate.path.every(([x, y], index) => {
        const id = key(x, y);
        if (index === 0) {
          return true;
        }
        const previous = candidate.path[index - 1];
        return isCellPassable(id, plan.net, endpointOwner, padOwner, pinAccessKeepout, new Set([key(endpoint.grid[0], endpoint.grid[1])]), routeOwner, undefined, undefined)
          && isEdgePassable(edgeKey(previous, [x, y]), plan.net, edgeOwner);
      })
    ) ?? { endpoint, path: [endpoint.grid], terminal: endpoint.grid, cost: 100 };

    terminalByEndpoint.set(endpointKey(endpoint), selected.terminal);
    endpointCellByTerminal.set(key(selected.terminal[0], selected.terminal[1]), key(endpoint.grid[0], endpoint.grid[1]));
    if (selected.path.length > 1) {
      traces.push({
        id: makeId(),
        net: plan.net,
        points: selected.path
      });
      selected.path.forEach(([x, y]) => addSoftCongestion(congestionMap, x, y, 1.2));
    }
  });

  return { terminalByEndpoint, endpointCellByTerminal, traces };
}

function routeMultiPinNet(
  board: BoardSize,
  plan: NetPlan,
  endpointOwner: Map<string, string>,
  padOwner: Map<string, PadOwner>,
  pinAccessKeepout: PinAccessKeepout,
  routeOwner: Map<string, RouteOwner>,
  edgeOwner: Map<string, RouteOwner>,
  congestionMap: CongestionMap,
  escapeCandidates: Map<string, EscapeCandidate[]>
): RouteAttempt {
  const blockedRouteIds = new Set<string>();
  const escape = applyEscapeRoutes(board, plan, routeOwner, edgeOwner, endpointOwner, padOwner, pinAccessKeepout, congestionMap, escapeCandidates);
  const terminals = dedupePoints(plan.endpoints.map((endpoint) => escape.terminalByEndpoint.get(endpointKey(endpoint)) ?? endpoint.grid));
  const traces = [...escape.traces];
  const jumpers: JumperRoute[] = [];
  let failedConnections = 0;

  if (terminals.length < 2) {
    return { traces, jumpers, failedConnections, blockedRouteIds };
  }

  const connectionOrder = createMultiPinConnectionOrder(plan, terminals);
  const connected: Array<[number, number]> = [connectionOrder[0]];
  const remaining = connectionOrder.slice(1);
  const connectedEndpointCells = new Set<string>();
  const firstEndpointCell = escape.endpointCellByTerminal.get(key(connectionOrder[0][0], connectionOrder[0][1]));
  if (firstEndpointCell) {
    connectedEndpointCells.add(firstEndpointCell);
  }

  while (remaining.length > 0) {
    const pair = findBestPair(connected, remaining, congestionMap);
    const targetEndpointCell = escape.endpointCellByTerminal.get(key(pair.to[0], pair.to[1]));
    const allowedSameNetEndpointCells = new Set(connectedEndpointCells);
    if (targetEndpointCell) {
      allowedSameNetEndpointCells.add(targetEndpointCell);
    }
    const routed = routeNetWithAStar(
      board,
      pair.from,
      pair.to,
      plan,
      endpointOwner,
      padOwner,
      pinAccessKeepout,
      allowedSameNetEndpointCells,
      routeOwner,
      edgeOwner,
      congestionMap
    );
    mergeSet(blockedRouteIds, routed.blockedRouteIds);
    const jumperCost = estimateJumperCost(pair.from, pair.to, jumpers.length);
    const shouldUseJumper = !routed.path || jumperCost + 8 < routed.cost;

    if (shouldUseJumper) {
      jumpers.push({
        id: makeId(),
        net: plan.net,
        from: pair.from,
        to: pair.to
      });
    } else if (routed.path) {
      traces.push({
        id: makeId(),
        net: plan.net,
        points: routed.path
      });
      routed.path.forEach(([x, y]) => addSoftCongestion(congestionMap, x, y, 1));
    }

    connected.push(pair.to);
    if (targetEndpointCell) {
      connectedEndpointCells.add(targetEndpointCell);
    }
    remaining.splice(pair.remainingIndex, 1);
  }

  return { traces, jumpers, failedConnections, blockedRouteIds };
}

function routeNetWithAStar(
  board: BoardSize,
  from: [number, number],
  to: [number, number],
  plan: NetPlan,
  endpointOwner: Map<string, string>,
  padOwner: Map<string, PadOwner>,
  pinAccessKeepout: PinAccessKeepout,
  allowedSameNetEndpointCells: Set<string>,
  routeOwner: Map<string, RouteOwner>,
  edgeOwner: Map<string, RouteOwner>,
  congestionMap: CongestionMap
): SearchResult {
  const startId = key(from[0], from[1]);
  const targetId = key(to[0], to[1]);
  const open: SearchNode[] = [{ x: from[0], y: from[1], cost: 0, priority: manhattan(from, to) }];
  const bestCost = new Map<string, number>([[startId, 0]]);
  const parent = new Map<string, string>();
  const blockedRouteIds = new Set<string>();

  while (open.length > 0) {
    const current = open.splice(takeLowestPriorityIndex(open), 1)[0];
    const currentId = key(current.x, current.y);
    if (currentId === targetId) {
      const path = reconstructPath(parent, from, to);
      return { path, cost: current.cost, blockedRouteIds };
    }

    for (const next of neighbors(current, board)) {
      const id = key(next.x, next.y);
      const owner = routeOwner.get(id);
      if (owner && owner.net !== plan.net) {
        blockedRouteIds.add(owner.routeId);
      }
      if (!isCellPassable(id, plan.net, endpointOwner, padOwner, pinAccessKeepout, allowedSameNetEndpointCells, routeOwner, startId, targetId)) {
        continue;
      }
      const edge = edgeKey([current.x, current.y], [next.x, next.y]);
      const edgeConflict = edgeOwner.get(edge);
      if (edgeConflict && edgeConflict.net !== plan.net) {
        blockedRouteIds.add(edgeConflict.routeId);
      }
      if (!isEdgePassable(edge, plan.net, edgeOwner)) {
        continue;
      }

      const direction = directionKey(current, next);
      const turnPenalty = current.direction && current.direction !== direction ? 4 : 0;
      const routeReuseBonus = owner?.net === plan.net ? -1.5 : 0;
      const nextCost =
        current.cost +
        1 +
        turnPenalty +
        congestionAt(congestionMap, next.x, next.y) +
        endpointAdjacencyPenalty(next, plan.net, endpointOwner) +
        routeReuseBonus;

      const previousBest = bestCost.get(id);
      if (previousBest !== undefined && previousBest <= nextCost) {
        continue;
      }

      bestCost.set(id, nextCost);
      parent.set(id, currentId);
      open.push({
        ...next,
        direction,
        cost: nextCost,
        priority: nextCost + manhattan([next.x, next.y], to) * 1.1
      });
    }
  }

  return { cost: Number.POSITIVE_INFINITY, blockedRouteIds };
}

function buildCongestionMap(
  board: BoardSize,
  endpoints: RoutedNetEndpoint[],
  routeOwner: Map<string, RouteOwner>,
  congestionBias: CongestionMap
): CongestionMap {
  const map = createEmptyCongestionBias(board);

  for (let y = 0; y < board.height; y += 1) {
    for (let x = 0; x < board.width; x += 1) {
      const edgeDistance = Math.min(x, y, board.width - 1 - x, board.height - 1 - y);
      addSoftCongestion(map, x, y, edgeDistance <= 1 ? 1.6 : edgeDistance <= 2 ? 0.6 : 0);
      addSoftCongestion(map, x, y, congestionAt(congestionBias, x, y));
    }
  }

  endpoints.forEach((endpoint) => {
    neighbors({ x: endpoint.grid[0], y: endpoint.grid[1] }, board).forEach((cell) => addSoftCongestion(map, cell.x, cell.y, 2.2));
    addSoftCongestion(map, endpoint.grid[0], endpoint.grid[1], 4);
  });

  routeOwner.forEach((owner, id) => {
    const [x, y] = parseKey(id);
    addSoftCongestion(map, x, y, owner.locked ? 12 : 5);
    neighbors({ x, y }, board).forEach((cell) => addSoftCongestion(map, cell.x, cell.y, 1.4));
  });

  return map;
}

function buildPinAccessKeepout(board: BoardSize, endpoints: RoutedNetEndpoint[]): PinAccessKeepout {
  const reservedByCell = new Map<string, Set<string>>();
  const endpointCells = new Set(endpoints.map((endpoint) => key(endpoint.grid[0], endpoint.grid[1])));

  endpoints.forEach((endpoint) => {
    neighbors({ x: endpoint.grid[0], y: endpoint.grid[1] }, board).forEach((cell) => {
      const id = key(cell.x, cell.y);
      if (endpointCells.has(id)) {
        return;
      }

      const nets = reservedByCell.get(id) ?? new Set<string>();
      nets.add(endpoint.net);
      reservedByCell.set(id, nets);
    });
  });

  return { reservedByCell };
}

function ripUpBlockingRoutes(
  records: Map<string, RouteRecord>,
  routeOwner: Map<string, RouteOwner>,
  edgeOwner: Map<string, RouteOwner>,
  blockedRouteIds: Set<string>,
  currentPlan: NetPlan,
  remainingBudget: number
) {
  if (remainingBudget <= 0 || blockedRouteIds.size === 0) {
    return [];
  }

  const candidates = [...blockedRouteIds]
    .map((id) => records.get(id))
    .filter((record): record is RouteRecord => record !== undefined && !record.locked && record.net !== currentPlan.net)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, Math.min(MAX_RIP_UPS_PER_FAILURE, remainingBudget));

  candidates.forEach((record) => {
    records.delete(record.id);
    record.traces.forEach((trace) => trace.points.forEach(([x, y]) => {
      const id = key(x, y);
      if (routeOwner.get(id)?.routeId === record.id) {
        routeOwner.delete(id);
      }
    }));
    record.traces.forEach((trace) => traceEdges(trace.points).forEach((edge) => {
      if (edgeOwner.get(edge)?.routeId === record.id) {
        edgeOwner.delete(edge);
      }
    }));
  });

  return candidates;
}

function rerouteQueue(plans: NetPlan[], records: RouteRecord[]) {
  const byNet = new Map(plans.map((plan) => [plan.net, plan]));
  return sortNetPlans(records.map((record) => byNet.get(record.net)).filter((plan): plan is NetPlan => Boolean(plan)));
}

function scoreRoutingResult(
  board: BoardSize,
  result: RoutingState,
  endpoints: RoutedNetEndpoint[],
  congestionMap: CongestionMap
): RoutingScore {
  const routedNetCount = new Set([...result.traces.map((trace) => trace.net), ...result.jumpers.map((jumper) => jumper.net)]).size;
  const failedNetCount = result.failedNets.length;
  const totalBottomLength = result.traces.reduce((sum, trace) => sum + pathLength(trace.points), 0);
  const jumperCount = result.jumpers.length;
  const totalTopLength = totalJumperLength(result.jumpers);
  const viaOrLayerSwitchCount = jumperCount * 2;
  const congestionPenalty = result.traces.reduce(
    (sum, trace) => sum + trace.points.reduce((traceSum, point) => traceSum + congestionAt(congestionMap, point[0], point[1]), 0),
    0
  );
  const pinAccessPenalty = calculatePinAccessPenalty(board, endpoints, result.traces);
  const score =
    failedNetCount * 10000 +
    jumperCount * 360 +
    totalTopLength * 28 +
    viaOrLayerSwitchCount * 90 +
    totalBottomLength * 3 +
    congestionPenalty * 12 +
    pinAccessPenalty * 120 -
    routedNetCount * 500;

  return {
    routedNetCount,
    failedNetCount,
    totalBottomLength,
    jumperCount,
    totalJumperLength: totalTopLength,
    viaOrLayerSwitchCount,
    congestionPenalty,
    pinAccessPenalty,
    score
  };
}

export function validateRoutingResult(
  board: BoardSize,
  result: RoutingState,
  endpoints: RoutedNetEndpoint[],
  components: PlacedComponent[]
): RoutingValidationResult {
  const issues: DrcIssue[] = [];
  const endpointByRefPin = new Map(endpoints.map((endpoint) => [`${endpoint.ref}:${endpoint.pin}`, endpoint]));
  const requiredByNet = new Map<string, RoutedNetEndpoint[]>();
  const expectedNetByCell = new Map<string, Set<string>>();
  const routeNetsByCell = new Map<string, Set<string>>();
  const edgeNetByKey = new Map<string, { net: string; segment: [[number, number], [number, number]] }>();
  const dsu = new DisjointSet();

  endpoints.forEach((endpoint) => {
    const list = requiredByNet.get(endpoint.net) ?? [];
    list.push(endpoint);
    requiredByNet.set(endpoint.net, list);
    const cell = key(endpoint.grid[0], endpoint.grid[1]);
    const expected = expectedNetByCell.get(cell) ?? new Set<string>();
    expected.add(endpoint.net);
    expectedNetByCell.set(cell, expected);
    dsu.add(graphKey(endpoint.net, cell));
  });

  result.traces.forEach((trace) => {
    const points = expandOrthogonalPath(trace.points);
    const net = resolveManualRouteNet(trace.net, points, expectedNetByCell, routeNetsByCell);
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const cell = key(point[0], point[1]);
      addRouteNet(routeNetsByCell, cell, net);
      dsu.add(graphKey(net, cell));

      if (index === 0) {
        continue;
      }

      const previous = points[index - 1];
      const segment: [[number, number], [number, number]] = [previous, point];
      if (manhattan(previous, point) !== 1) {
        issues.push({
          code: "BOTTOM_ROUTE_CROSSING",
          severity: "error",
          message: `Bottom route ${net} has non-grid segment ${formatSegment(previous, point)}`,
          net,
          segment
        });
      }

      const edge = edgeKey(previous, point);
      const existing = edgeNetByKey.get(edge);
      if (existing && existing.net !== net) {
        issues.push({
          code: "BOTTOM_ROUTE_OVERLAP",
          severity: "error",
          message: `Bottom edge ${edge} is shared by ${existing.net} and ${net}`,
          net,
          actualNets: [existing.net, net],
          segment
        });
      }
      edgeNetByKey.set(edge, { net, segment });
      dsu.union(graphKey(net, key(previous[0], previous[1])), graphKey(net, cell));
    }
  });

  result.jumpers.forEach((jumper) => {
    const fromCell = key(jumper.from[0], jumper.from[1]);
    const toCell = key(jumper.to[0], jumper.to[1]);
    const net = resolveManualRouteNet(jumper.net, [jumper.from, jumper.to], expectedNetByCell, routeNetsByCell);
    addRouteNet(routeNetsByCell, fromCell, net);
    addRouteNet(routeNetsByCell, toCell, net);
    dsu.add(graphKey(net, fromCell));
    dsu.add(graphKey(net, toCell));
    dsu.union(graphKey(net, fromCell), graphKey(net, toCell));
  });

  routeNetsByCell.forEach((actualNets, cell) => {
    if (actualNets.size > 1) {
      issues.push({
        code: "SHORT_BETWEEN_NETS",
        severity: "error",
        message: `Different nets share hole ${cell}: ${[...actualNets].join(", ")}`,
        actualNets: [...actualNets],
        grid: parseKey(cell)
      });
    }

    const expectedNets = expectedNetByCell.get(cell);
    if (expectedNets) {
      actualNets.forEach((actualNet) => {
        if (!expectedNets.has(actualNet)) {
          issues.push({
            code: "WRONG_NET_SHORT",
            severity: "error",
            message: `Route ${actualNet} touches pin pad ${cell}, expected ${[...expectedNets].join(", ")}`,
            actualNet,
            expectedNet: [...expectedNets].join(","),
            grid: parseKey(cell)
          });
        }
      });
    }
  });

  issues.push(...detectBottomRouteCrossingIssues(result.traces));

  const pinStatuses = buildPinStatuses(components, endpointByRefPin, routeNetsByCell, dsu);
  pinStatuses.forEach((status) => {
    if (status.status === "CONNECTED") {
      return;
    }
    issues.push({
      code: status.status === "WRONG_NET_SHORT" ? "WRONG_NET_SHORT" : status.status,
      severity: status.status === "NO_NET_UNUSED" ? "warning" : "error",
      message: `${status.status}: ${status.ref}.${status.pin} expected ${status.expectedNet ?? "no net"}, actual ${status.actualNets.join(", ") || "none"} at ${status.grid[0]},${status.grid[1]}`,
      ref: status.ref,
      pin: status.pin,
      pinName: status.pinName,
      expectedNet: status.expectedNet,
      actualNets: status.actualNets,
      grid: status.grid,
      net: status.expectedNet
    });
  });

  issues.push(...detectSuspiciousAdjacentPinIssues(endpoints, components));
  issues.push(...detectDipGeometryIssues(components));

  const failedNetDetails = buildFailedNetDetails(requiredByNet, dsu);
  const errors = dedupeIssues(issues.filter((issue) => issue.severity === "error"));
  const warnings = dedupeIssues(issues.filter((issue) => issue.severity === "warning"));

  return {
    warnings: [...errors, ...warnings].map(formatDrcIssue),
    failedNetDetails,
    drc: {
      passed: errors.length === 0,
      errors,
      warnings,
      pinStatuses
    }
  };
}

function buildPinStatuses(
  components: PlacedComponent[],
  endpointByRefPin: Map<string, RoutedNetEndpoint>,
  routeNetsByCell: Map<string, Set<string>>,
  dsu: DisjointSet
): PinRouteStatus[] {
  return components.flatMap((component) => {
    const anchor = component.pinOffsets[0] ?? [0, 0];
    return component.pinOffsets.map((offset, index) => {
      const pin = index + 1;
      const endpoint = endpointByRefPin.get(`${component.name}:${pin}`);
      const [rx, ry] = rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
      const grid: [number, number] = endpoint?.grid ?? [component.position[0] + rx, component.position[1] + ry];
      const cell = key(grid[0], grid[1]);
      const actualNets = [...(routeNetsByCell.get(cell) ?? new Set<string>())];

      if (!endpoint) {
        return {
          ref: component.name,
          pin,
          grid,
          actualNets,
          status: actualNets.length > 0 ? "WRONG_NET_SHORT" : "NO_NET_UNUSED"
        } satisfies PinRouteStatus;
      }

      const expectedNet = endpoint.net;
      const wrongNets = actualNets.filter((net) => net !== expectedNet);
      if (wrongNets.length > 0) {
        return {
          ref: endpoint.ref,
          pin: endpoint.pin,
          pinName: endpoint.role,
          grid,
          expectedNet,
          actualNets,
          status: "WRONG_NET_SHORT"
        } satisfies PinRouteStatus;
      }

      if (!actualNets.includes(expectedNet)) {
        return {
          ref: endpoint.ref,
          pin: endpoint.pin,
          pinName: endpoint.role,
          grid,
          expectedNet,
          actualNets,
          status: "NET_PIN_UNROUTED"
        } satisfies PinRouteStatus;
      }

      const requiredRoot = dsu.find(graphKey(expectedNet, cell));
      const sameNetPins = [...endpointByRefPin.values()].filter((candidate) => candidate.net === expectedNet);
      const connectedToAll = sameNetPins.every((candidate) => dsu.find(graphKey(expectedNet, key(candidate.grid[0], candidate.grid[1]))) === requiredRoot);

      return {
        ref: endpoint.ref,
        pin: endpoint.pin,
        pinName: endpoint.role,
        grid,
        expectedNet,
        actualNets,
        status: connectedToAll ? "CONNECTED" : "REQUIRED_UNCONNECTED"
      } satisfies PinRouteStatus;
    });
  });
}

function buildFailedNetDetails(requiredByNet: Map<string, RoutedNetEndpoint[]>, dsu: DisjointSet) {
  const failed: FailedNetDiagnostic[] = [];
  requiredByNet.forEach((netEndpoints, net) => {
    if (netEndpoints.length < 2) {
      return;
    }

    const groupsByRoot = new Map<string, RoutedNetEndpoint[]>();
    netEndpoints.forEach((endpoint) => {
      const root = dsu.find(graphKey(net, key(endpoint.grid[0], endpoint.grid[1])));
      const group = groupsByRoot.get(root) ?? [];
      group.push(endpoint);
      groupsByRoot.set(root, group);
    });

    const connectedGroups = [...groupsByRoot.values()].sort((a, b) => b.length - a.length);
    if (connectedGroups.length > 1) {
      failed.push({
        net,
        endpoints: netEndpoints,
        unconnectedEndpoints: connectedGroups.slice(1).flat(),
        connectedGroups
      });
    }
  });
  return failed;
}

function addRouteNet(routeNetsByCell: Map<string, Set<string>>, cell: string, net: string) {
  const nets = routeNetsByCell.get(cell) ?? new Set<string>();
  nets.add(net);
  routeNetsByCell.set(cell, nets);
}

function resolveManualRouteNet(
  routeNet: string,
  points: GridPoint[],
  expectedNetByCell: Map<string, Set<string>>,
  routeNetsByCell: Map<string, Set<string>>
) {
  if (routeNet !== "MANUAL") {
    return routeNet;
  }

  const candidates = new Set<string>();
  points.forEach((point) => {
    const cell = key(point[0], point[1]);
    expectedNetByCell.get(cell)?.forEach((net) => candidates.add(net));
    routeNetsByCell.get(cell)?.forEach((net) => {
      if (net !== "MANUAL") {
        candidates.add(net);
      }
    });
  });

  return candidates.size === 1 ? [...candidates][0] : routeNet;
}

function detectBottomRouteCrossingIssues(traces: BottomTrace[]): DrcIssue[] {
  const issues: DrcIssue[] = [];
  const segments = traces.flatMap((trace) => {
    const points = expandOrthogonalPath(trace.points);
    return points.slice(1).map((point, index) => ({
      net: trace.net,
      from: points[index],
      to: point
    }));
  });

  for (let a = 0; a < segments.length; a += 1) {
    for (let b = a + 1; b < segments.length; b += 1) {
      const first = segments[a];
      const second = segments[b];
      if (first.net === second.net || shareEndpoint(first.from, first.to, second.from, second.to)) {
        continue;
      }
      if (segmentsIntersect(first.from, first.to, second.from, second.to)) {
        issues.push({
          code: "BOTTOM_ROUTE_CROSSING",
          severity: "error",
          message: `Bottom traces cross: ${first.net} ${formatSegment(first.from, first.to)} x ${second.net} ${formatSegment(second.from, second.to)}`,
          net: first.net,
          actualNets: [first.net, second.net],
          segment: [first.from, first.to]
        });
      }
    }
  }

  return issues;
}

function detectSuspiciousAdjacentPinIssues(endpoints: RoutedNetEndpoint[], components: PlacedComponent[]): DrcIssue[] {
  return checkSuspiciousAdjacentPins(endpoints, components).map((message) => ({
    code: "SUSPICIOUS_ADJACENT_IC_PINS",
    severity: "warning",
    message
  }));
}

function detectDipGeometryIssues(components: PlacedComponent[]): DrcIssue[] {
  return checkDipPinGeometry(components).map((message) => ({
    code: "DIP_PIN_GEOMETRY",
    severity: "warning",
    message
  }));
}

function formatDrcIssue(issue: DrcIssue) {
  const location = issue.grid ? ` @ ${issue.grid[0]},${issue.grid[1]}` : "";
  const pin = issue.ref ? ` ${issue.ref}${issue.pin ? `.${issue.pin}` : ""}` : "";
  return `${issue.severity.toUpperCase()} ${issue.code}${pin}${location}: ${issue.message}`;
}

function dedupeIssues(issues: DrcIssue[]) {
  const seen = new Set<string>();
  const result: DrcIssue[] = [];
  issues.forEach((issue) => {
    const id = `${issue.code}|${issue.message}|${issue.ref ?? ""}|${issue.pin ?? ""}|${issue.grid?.join(",") ?? ""}`;
    if (!seen.has(id)) {
      seen.add(id);
      result.push(issue);
    }
  });
  return result;
}

function checkSuspiciousAdjacentPins(endpoints: RoutedNetEndpoint[], components: PlacedComponent[]) {
  const warnings: string[] = [];
  const componentByName = new Map(components.map((component) => [component.name, component]));
  const endpointsByRef = new Map<string, RoutedNetEndpoint[]>();

  endpoints.forEach((endpoint) => {
    const list = endpointsByRef.get(endpoint.ref) ?? [];
    list.push(endpoint);
    endpointsByRef.set(endpoint.ref, list);
  });

  endpointsByRef.forEach((componentEndpoints, ref) => {
    const component = componentByName.get(ref);
    if (!component || (component.kind !== "dip" && component.kind !== "pin_header" && component.kind !== "to92")) {
      return;
    }

    const sorted = [...componentEndpoints].sort((a, b) => a.pin - b.pin);
    let run: RoutedNetEndpoint[] = [];
    sorted.forEach((endpoint) => {
      const previous = run[run.length - 1];
      if (previous && previous.net === endpoint.net && endpoint.pin === previous.pin + 1) {
        run.push(endpoint);
      } else {
        if (run.length >= 2 && !isPowerNet(run[0].net)) {
          warnings.push(formatAdjacentPinWarning(ref, run));
        }
        run = [endpoint];
      }
    });

    if (run.length >= 2 && !isPowerNet(run[0].net)) {
      warnings.push(formatAdjacentPinWarning(ref, run));
    }
  });

  return warnings;
}

function formatAdjacentPinWarning(ref: string, endpoints: RoutedNetEndpoint[]) {
  return `DRC: suspicious adjacent pins on ${ref}: pins ${endpoints.map((endpoint) => endpoint.pin).join(",")} share net ${endpoints[0].net}`;
}

function checkDipPinGeometry(components: PlacedComponent[]) {
  const warnings: string[] = [];
  components.filter((component) => component.kind === "dip").forEach((component) => {
    const pinCount = component.pinCount ?? component.pinOffsets.length;
    const pinsPerSide = Math.ceil(pinCount / 2);
    const left = component.pinOffsets.slice(0, pinsPerSide);
    const right = component.pinOffsets.slice(pinsPerSide);
    const leftX = left[0]?.[0];
    const rightX = right[0]?.[0];
    const leftColumnOk = left.every(([x], index) => x === leftX && (index === 0 || left[index - 1][1] < left[index][1]));
    const rightColumnOk = right.every(([x], index) => x === rightX && (index === 0 || right[index - 1][1] > right[index][1]));
    const separatedRows = leftX !== undefined && rightX !== undefined && leftX !== rightX;

    if (!leftColumnOk || !rightColumnOk || !separatedRows) {
      warnings.push(`DRC: DIP pin geometry suspicious on ${component.name}; check pin coordinates and bottom-side mirror assumptions`);
    }
  });
  return warnings;
}

function createMultiPinConnectionOrder(plan: NetPlan, terminals: Array<[number, number]>) {
  if (isPowerNet(plan.net)) {
    const xs = terminals.map(([x]) => x);
    const ys = terminals.map(([, y]) => y);
    const xSpan = Math.max(...xs) - Math.min(...xs);
    const ySpan = Math.max(...ys) - Math.min(...ys);
    return [...terminals].sort((a, b) => (xSpan >= ySpan ? a[0] - b[0] : a[1] - b[1]));
  }

  const center = boundingCenter(terminals);
  return [...terminals].sort((a, b) => manhattan(a, center) - manhattan(b, center));
}

function buildNetPlans(endpoints: RoutedNetEndpoint[]): NetPlan[] {
  return groupEndpointsByNet(endpoints)
    .filter((plan) => plan.endpoints.length >= 2)
    .map((plan) => {
      const points = dedupePoints(plan.endpoints.map((endpoint) => endpoint.grid));
      return {
        ...plan,
        span: boundingSpan(points),
        priority: priorityNet(plan.net, plan.endpoints.length, boundingSpan(points))
      };
    });
}

function sortNetPlans(plans: NetPlan[], congestionBias?: CongestionMap) {
  return [...plans].sort((a, b) => {
    const biasedA = a.priority + (congestionBias ? netBias(a, congestionBias) : 0);
    const biasedB = b.priority + (congestionBias ? netBias(b, congestionBias) : 0);
    return biasedB - biasedA;
  });
}

function commitRouteAttempt(
  plan: NetPlan,
  attempt: RouteAttempt,
  records: Map<string, RouteRecord>,
  routeOwner: Map<string, RouteOwner>,
  edgeOwner: Map<string, RouteOwner>
) {
  const record: RouteRecord = {
    id: makeId(),
    net: plan.net,
    traces: attempt.traces.map((trace) => ({
      ...trace,
      layer: "bottom" as const,
      edges: trace.points.slice(1).map((point, index) => [trace.points[index], point] as [[number, number], [number, number]]),
      locked: false
    })),
    jumpers: attempt.jumpers.map((jumper) => ({ ...jumper, layer: "jumper" as const, locked: false })),
    priority: plan.priority,
    locked: isPowerNet(plan.net),
    failedConnections: attempt.failedConnections,
    blockedRouteIds: attempt.blockedRouteIds
  };
  records.set(record.id, record);
  record.traces.forEach((trace) =>
    trace.points.forEach(([x, y]) => routeOwner.set(key(x, y), { net: plan.net, routeId: record.id, priority: plan.priority, locked: record.locked }))
  );
  record.traces.forEach((trace) =>
    traceEdges(trace.points).forEach((edge) => edgeOwner.set(edge, { net: plan.net, routeId: record.id, priority: plan.priority, locked: record.locked }))
  );
  return record;
}

function buildRoutingStateFromRecords(
  records: Map<string, RouteRecord>,
  plans: NetPlan[],
  failedNets: Set<string>,
  extraWarnings: string[]
): RoutingResultWithScore {
  const traces = [...records.values()].flatMap((record) => record.traces);
  const jumpers = [...records.values()].flatMap((record) => record.jumpers);
  const routedNets = new Set([...traces.map((trace) => trace.net), ...jumpers.map((jumper) => jumper.net)]);
  const failed = plans.filter((plan) => failedNets.has(plan.net) || !routedNets.has(plan.net)).map((plan) => plan.net);

  return {
    traces,
    jumpers,
    failedNets: [...new Set(failed)],
    warnings: extraWarnings
  };
}

function getEscapeDirections(endpoint: RoutedNetEndpoint, component: PlacedComponent | undefined, board: BoardSize): Array<[number, number]> {
  if (!component) {
    return directionsTowardOpenBoard(endpoint.grid, board);
  }

  const pinOffset = component.pinOffsets[endpoint.pin - 1] ?? [0, 0];
  const xs = component.pinOffsets.map(([x]) => x);
  const ys = component.pinOffsets.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;

  if (component.kind === "dip") {
    const outward: [number, number] = pinOffset[0] <= midX ? [-1, 0] : [1, 0];
    return rotateDirections([outward], component.rotation);
  }

  if (component.kind === "pin_header") {
    const boardCenter: [number, number] = [Math.floor(board.width / 2), Math.floor(board.height / 2)];
    const toCenter: [number, number] = Math.abs(boardCenter[0] - endpoint.grid[0]) > Math.abs(boardCenter[1] - endpoint.grid[1])
      ? [boardCenter[0] >= endpoint.grid[0] ? 1 : -1, 0]
      : [0, boardCenter[1] >= endpoint.grid[1] ? 1 : -1];
    const lineHorizontal = Math.abs(maxX - minX) >= Math.abs(maxY - minY);
    const perpendiculars: Array<[number, number]> = lineHorizontal ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
    return rotateDirections([toCenter, ...perpendiculars], component.rotation);
  }

  if (component.kind === "to92") {
    const pinIndex = Math.max(0, endpoint.pin - 1);
    const base: Array<[number, number]> = pinIndex === 0 ? [[-1, 0], [0, -1], [0, 1]]
      : pinIndex === 1 ? [[0, 1], [0, -1], [1, 0]]
        : [[1, 0], [0, -1], [0, 1]];
    return rotateDirections(base, component.rotation);
  }

  return directionsTowardOpenBoard(endpoint.grid, board);
}

function buildStraightEscapePath(from: [number, number], direction: [number, number], length: number, board: BoardSize) {
  const path: Array<[number, number]> = [from];
  for (let step = 1; step <= length; step += 1) {
    const next: [number, number] = [from[0] + direction[0] * step, from[1] + direction[1] * step];
    if (!inBounds(next, board)) {
      break;
    }
    path.push(next);
  }
  return path;
}

function isCellPassable(
  id: string,
  net: string,
  endpointOwner: Map<string, string>,
  padOwner: Map<string, PadOwner>,
  pinAccessKeepout: PinAccessKeepout,
  allowedSameNetEndpointCells: Set<string>,
  routeOwner: Map<string, RouteOwner>,
  startId: string | undefined,
  targetId: string | undefined
) {
  if (id !== startId && id !== targetId) {
    const endpointNet = endpointOwner.get(id);
    if (endpointNet && endpointNet !== net) {
      return false;
    }
    if (endpointNet === net && !allowedSameNetEndpointCells.has(id)) {
      return false;
    }
  }

  if (id !== startId && id !== targetId) {
    const pad = padOwner.get(id);
    if (pad) {
      if (!pad.expectedNet) {
        return false;
      }
      if (pad.expectedNet !== net) {
        return false;
      }
      if (!allowedSameNetEndpointCells.has(id)) {
        return false;
      }
    }
  }

  if (id !== startId && id !== targetId) {
    const reservedFor = pinAccessKeepout.reservedByCell.get(id);
    if (reservedFor && !reservedFor.has(net)) {
      return false;
    }
  }

  const owner = routeOwner.get(id);
  return !owner || owner.net === net;
}

function isEdgePassable(edge: string, net: string, edgeOwner: Map<string, RouteOwner>) {
  const owner = edgeOwner.get(edge);
  return !owner || owner.net === net;
}

function findBestPair(connected: Array<[number, number]>, remaining: Array<[number, number]>, congestionMap: CongestionMap) {
  let best = {
    from: connected[0],
    to: remaining[0],
    remainingIndex: 0,
    cost: Number.POSITIVE_INFINITY
  };

  connected.forEach((from) => {
    remaining.forEach((to, remainingIndex) => {
      const cost = manhattan(from, to) + congestionAt(congestionMap, to[0], to[1]) * 2;
      if (cost < best.cost) {
        best = { from, to, remainingIndex, cost };
      }
    });
  });

  return best;
}

function estimateJumperCost(from: [number, number], to: [number, number], existingJumpersForNet: number) {
  const enterJumper = 38;
  const topStep = 1.7;
  const exitJumper = 38;
  const jumperLengthPenalty = manhattan(from, to) * topStep;
  const jumperCountPenalty = existingJumpersForNet * 55;
  return enterJumper + exitJumper + jumperLengthPenalty + jumperCountPenalty;
}

function calculatePinAccessPenalty(board: BoardSize, endpoints: RoutedNetEndpoint[], traces: BottomTrace[]) {
  const occupied = new Set<string>();
  traces.forEach((trace) => trace.points.forEach(([x, y]) => occupied.add(key(x, y))));
  return endpoints.reduce((penalty, endpoint) => {
    const blocked = neighbors({ x: endpoint.grid[0], y: endpoint.grid[1] }, board).filter((cell) => occupied.has(key(cell.x, cell.y))).length;
    return penalty + Math.max(0, blocked - 1);
  }, 0);
}

function increaseCongestionBias(
  bias: CongestionMap,
  records: RouteRecord[],
  board: BoardSize
) {
  records.forEach((record) => {
    record.traces.forEach((trace) => trace.points.forEach(([x, y]) => {
      addSoftCongestion(bias, x, y, 2.5);
      neighbors({ x, y }, board).forEach((cell) => addSoftCongestion(bias, cell.x, cell.y, 0.8));
    }));
  });
}

function planFromRecord(record: RouteRecord, plans: NetPlan[]) {
  return plans.find((plan) => plan.net === record.net) ?? {
    net: record.net,
    endpoints: [],
    priority: record.priority,
    span: 0
  };
}

function createEmptyCongestionBias(board: BoardSize): CongestionMap {
  return {
    width: board.width,
    height: board.height,
    cost: Array.from({ length: board.width * board.height }, () => 0)
  };
}

function addSoftCongestion(map: CongestionMap, x: number, y: number, amount: number) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return;
  }
  map.cost[y * map.width + x] += amount;
}

function congestionAt(map: CongestionMap, x: number, y: number) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return 10;
  }
  return map.cost[y * map.width + x] ?? 0;
}

function endpointAdjacencyPenalty(cell: RouterCell, net: string, endpointOwner: Map<string, string>) {
  return adjacentCells(cell).reduce((penalty, neighbor) => {
    const endpointNet = endpointOwner.get(key(neighbor.x, neighbor.y));
    return endpointNet && endpointNet !== net ? penalty + 4 : penalty;
  }, 0);
}

function buildEndpointOwner(endpoints: RoutedNetEndpoint[]) {
  const owner = new Map<string, string>();
  endpoints.forEach((endpoint) => {
    const id = key(endpoint.grid[0], endpoint.grid[1]);
    const existing = owner.get(id);
    if (!existing) {
      owner.set(id, endpoint.net);
    }
  });
  return owner;
}

function buildPadOwner(components: PlacedComponent[], endpoints: RoutedNetEndpoint[]) {
  const endpointByRefPin = new Map(endpoints.map((endpoint) => [`${endpoint.ref}:${endpoint.pin}`, endpoint]));
  const pads = new Map<string, PadOwner>();

  components.forEach((component) => {
    const anchor = component.pinOffsets[0] ?? [0, 0];
    component.pinOffsets.forEach((offset, index) => {
      const pin = index + 1;
      const endpoint = endpointByRefPin.get(`${component.name}:${pin}`);
      const [rx, ry] = rotateOffset([offset[0] - anchor[0], offset[1] - anchor[1]], component.rotation);
      const grid: GridPoint = endpoint?.grid ?? [component.position[0] + rx, component.position[1] + ry];
      pads.set(key(grid[0], grid[1]), {
        ref: component.name,
        pin,
        grid,
        expectedNet: endpoint?.net
      });
    });
  });

  return pads;
}

function groupEndpointsByNet(endpoints: RoutedNetEndpoint[]): Array<Omit<NetPlan, "priority" | "span">> {
  const map = new Map<string, RoutedNetEndpoint[]>();
  endpoints.forEach((endpoint) => {
    const list = map.get(endpoint.net) ?? [];
    list.push(endpoint);
    map.set(endpoint.net, list);
  });
  return [...map.entries()].map(([net, netEndpoints]) => ({ net, endpoints: netEndpoints }));
}

function priorityNet(net: string, endpointCount: number, span: number) {
  const powerPriority = isPowerNet(net) ? 10000 : 0;
  return powerPriority + endpointCount * 180 + span * 22;
}

function isPowerNet(net: string) {
  return /^(0|GND|VCC|VDD|VEE|VSS|VDC|VDC\d+|\+?\d+V)$/i.test(net);
}

function netBias(plan: NetPlan, map: CongestionMap) {
  return plan.endpoints.reduce((sum, endpoint) => sum + congestionAt(map, endpoint.grid[0], endpoint.grid[1]), 0);
}

function reconstructPath(parent: Map<string, string>, from: [number, number], to: [number, number]) {
  const start = key(from[0], from[1]);
  let current = key(to[0], to[1]);
  const path: Array<[number, number]> = [to];

  while (current !== start) {
    const previous = parent.get(current);
    if (!previous) {
      return undefined;
    }
    current = previous;
    path.push(parseKey(current));
  }

  return path.reverse();
}

function takeLowestPriorityIndex(open: SearchNode[]) {
  let bestIndex = 0;
  for (let index = 1; index < open.length; index += 1) {
    if (open[index].priority < open[bestIndex].priority) {
      bestIndex = index;
    }
  }
  return bestIndex;
}

function directionKey(from: RouterCell, to: RouterCell) {
  if (to.x > from.x) {
    return "right";
  }
  if (to.x < from.x) {
    return "left";
  }
  if (to.y > from.y) {
    return "down";
  }
  return "up";
}

function directionsTowardOpenBoard(point: [number, number], board: BoardSize): Array<[number, number]> {
  const options: Array<{ direction: [number, number]; clearance: number }> = [
    { direction: [-1, 0], clearance: point[0] },
    { direction: [1, 0], clearance: board.width - 1 - point[0] },
    { direction: [0, -1], clearance: point[1] },
    { direction: [0, 1], clearance: board.height - 1 - point[1] }
  ];
  return options.sort((a, b) => b.clearance - a.clearance).map((option) => option.direction);
}

function rotateDirections(directions: Array<[number, number]>, rotation: number) {
  return directions.map((direction) => rotateOffset(direction, rotation));
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

function dedupePoints(points: Array<[number, number]>) {
  const seen = new Set<string>();
  const result: Array<[number, number]> = [];
  points.forEach((point) => {
    const id = key(point[0], point[1]);
    if (!seen.has(id)) {
      result.push(point);
      seen.add(id);
    }
  });
  return result;
}

function boundingCenter(points: Array<[number, number]>): [number, number] {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [
    Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
    Math.round((Math.min(...ys) + Math.max(...ys)) / 2)
  ];
}

function boundingSpan(points: Array<[number, number]>) {
  if (points.length === 0) {
    return 0;
  }
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
}

function pathLength(points: Array<[number, number]>) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += manhattan(points[index - 1], points[index]);
  }
  return length;
}

function totalJumperLength(jumpers: JumperRoute[]) {
  return jumpers.reduce((sum, jumper) => sum + manhattan(jumper.from, jumper.to), 0);
}

function edgePenalty(point: [number, number], board: BoardSize) {
  const distance = Math.min(point[0], point[1], board.width - 1 - point[0], board.height - 1 - point[1]);
  return distance <= 0 ? 5 : distance <= 1 ? 1.5 : 0;
}

function mergeSet<T>(target: Set<T>, source: Set<T>) {
  source.forEach((item) => target.add(item));
}

class DisjointSet {
  private parent = new Map<string, string>();

  add(item: string) {
    if (!this.parent.has(item)) {
      this.parent.set(item, item);
    }
  }

  find(item: string): string {
    this.add(item);
    const parent = this.parent.get(item);
    if (!parent || parent === item) {
      return item;
    }
    const root = this.find(parent);
    this.parent.set(item, root);
    return root;
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootB, rootA);
    }
  }
}

function endpointKey(endpoint: RoutedNetEndpoint) {
  return `${endpoint.ref}:${endpoint.pin}:${endpoint.net}`;
}

function graphKey(net: string, cell: string) {
  return `${net}@${cell}`;
}

function makeId() {
  return crypto.randomUUID();
}

export const __autorouterDebug = {
  buildCongestionMap,
  generatePinEscapeCandidates,
  applyEscapeRoutes,
  routeNetWithAStar,
  routeMultiPinNet,
  ripUpBlockingRoutes,
  rerouteQueue,
  scoreRoutingResult,
  validateRoutingResult
};
