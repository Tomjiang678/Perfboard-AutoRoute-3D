import type { BoardSize, PerfboardProject } from "../../types/project.ts";
import { normalizeBoardDefinition } from "../board/factory.ts";

/** Board dimensions define every hole, so changing them invalidates all copper. */
export function updateBoard(project: PerfboardProject, board: BoardSize): PerfboardProject {
  const normalized = normalizeBoardDefinition(board);
  if (normalized.width === project.board.width &&
      normalized.height === project.board.height &&
      normalized.kind === project.board.kind) {
    return project;
  }
  return {
    ...project,
    board: normalized,
    routing: {
      ...project.routing,
      traces: [],
      jumpers: [],
      failedNets: [],
      warnings: [],
      drc: undefined,
      diagnostics: undefined
    }
  };
}
