import type { BottomTrace, JumperRoute, RoutingState } from "../../types/project.ts";
import { stripDrcWarnings } from "./drcWarnings.ts";
import { expandOrthogonalPath, key, type GridPoint } from "./routingGeometry.ts";

interface GraphEdge {
  id: string;
  from: GridPoint;
  to: GridPoint;
}

export function removeRoutesToComponent(
  routing: RoutingState,
  deletedPinCells: GridPoint[],
  remainingPinCells: GridPoint[]
): RoutingState {
  const deletedCells = new Set(deletedPinCells.map((cell) => key(...cell)));
  const terminalCells = new Set(remainingPinCells.map((cell) => key(...cell)));
  const nets = new Set([...routing.traces.map((trace) => trace.net), ...routing.jumpers.map((jumper) => jumper.net)]);
  const removedEdgeIds = new Set<string>();

  for (const net of nets) {
    const edges = buildNetEdges(
      routing.traces.filter((trace) => trace.net === net),
      routing.jumpers.filter((jumper) => jumper.net === net)
    );
    pruneDeletedBranches(edges, deletedCells, terminalCells, removedEdgeIds);
  }

  return {
    ...routing,
    traces: routing.traces.flatMap((trace) => splitRetainedTrace(trace, removedEdgeIds)),
    jumpers: routing.jumpers.filter((jumper) => !removedEdgeIds.has(jumperEdgeId(jumper))),
    failedNets: [],
    diagnostics: undefined,
    drc: undefined,
    warnings: stripDrcWarnings(routing.warnings)
  };
}

function buildNetEdges(traces: BottomTrace[], jumpers: JumperRoute[]) {
  const edges: GraphEdge[] = [];
  for (const trace of traces) {
    const points = expandOrthogonalPath(trace.points);
    for (let index = 1; index < points.length; index += 1) {
      edges.push({
        id: traceEdgeId(trace, index - 1),
        from: points[index - 1],
        to: points[index]
      });
    }
  }
  for (const jumper of jumpers) {
    edges.push({ id: jumperEdgeId(jumper), from: jumper.from, to: jumper.to });
  }
  return edges;
}

function pruneDeletedBranches(
  edges: GraphEdge[],
  deletedCells: Set<string>,
  terminalCells: Set<string>,
  removedEdgeIds: Set<string>
) {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    addAdjacentEdge(adjacency, key(...edge.from), edge.id);
    addAdjacentEdge(adjacency, key(...edge.to), edge.id);
  }

  const queue = [...deletedCells].filter((cell) => adjacency.has(cell) && !terminalCells.has(cell));
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (terminalCells.has(cell)) {
      continue;
    }
    const activeEdges = [...(adjacency.get(cell) ?? [])].filter((id) => !removedEdgeIds.has(id));
    if (activeEdges.length > 1) {
      continue;
    }
    const edgeId = activeEdges[0];
    if (!edgeId) {
      continue;
    }

    removedEdgeIds.add(edgeId);
    const edge = edgeById.get(edgeId);
    if (!edge) {
      continue;
    }
    const fromKey = key(...edge.from);
    const toKey = key(...edge.to);
    queue.push(fromKey === cell ? toKey : fromKey);
  }
}

function splitRetainedTrace(trace: BottomTrace, removedEdgeIds: Set<string>): BottomTrace[] {
  const points = expandOrthogonalPath(trace.points);
  const runs: GridPoint[][] = [];
  let current: GridPoint[] = [];

  for (let index = 1; index < points.length; index += 1) {
    if (removedEdgeIds.has(traceEdgeId(trace, index - 1))) {
      if (current.length >= 2) {
        runs.push(current);
      }
      current = [];
      continue;
    }
    if (current.length === 0) {
      current.push(points[index - 1]);
    }
    current.push(points[index]);
  }
  if (current.length >= 2) {
    runs.push(current);
  }

  return runs.map((run, index) => ({
    ...trace,
    id: index === 0 ? trace.id : crypto.randomUUID(),
    points: compressPath(run),
    edges: run.slice(1).map((point, pointIndex) => [run[pointIndex], point])
  }));
}

function compressPath(points: GridPoint[]) {
  if (points.length <= 2) {
    return points;
  }
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) {
      return true;
    }
    const previous = points[index - 1];
    const next = points[index + 1];
    return previous[0] !== point[0] || point[0] !== next[0]
      ? previous[1] !== point[1] || point[1] !== next[1]
      : false;
  });
}

function addAdjacentEdge(adjacency: Map<string, Set<string>>, cell: string, edgeId: string) {
  const edges = adjacency.get(cell) ?? new Set<string>();
  edges.add(edgeId);
  adjacency.set(cell, edges);
}

function traceEdgeId(trace: BottomTrace, index: number) {
  return `trace:${trace.id}:${index}`;
}

function jumperEdgeId(jumper: JumperRoute) {
  return `jumper:${jumper.id}`;
}
