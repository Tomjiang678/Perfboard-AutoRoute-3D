import type { BoardSize } from "../../types/project.ts";
import { createBreadboardModel, normalizeBreadboardDefinition } from "./breadboard.ts";
import { createPerfboardModel } from "./perfboard.ts";
import type { BoardModel } from "./types.ts";

const modelCache = new WeakMap<BoardSize, BoardModel>();

export function normalizeBoardDefinition(board: BoardSize): BoardSize {
  return board.kind === "breadboard" ? normalizeBreadboardDefinition(board) : { ...board, kind: "perfboard", breadboard: undefined };
}

export function createBoardModel(board: BoardSize): BoardModel {
  const normalized = normalizeBoardDefinition(board);
  return normalized.kind === "breadboard" ? createBreadboardModel(normalized) : createPerfboardModel(normalized);
}

export function getBoardModel(board: BoardSize): BoardModel {
  const cached = modelCache.get(board);
  if (cached) return cached;
  const model = createBoardModel(board);
  modelCache.set(board, model);
  return model;
}
