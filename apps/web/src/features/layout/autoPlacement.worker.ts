import { autoPlaceComponents, type AutoPlacementProgress, type AutoPlacementResult, type PlacementRegion } from "./autoPlacement.ts";
import type { BoardSize, DesignConstraint, PlacedComponent, RoutedNetEndpoint } from "../../types/project.ts";

interface AutoPlacementWorkerRequest {
  components: PlacedComponent[];
  region: PlacementRegion;
  boardWidth: number;
  boardHeight: number;
  board: BoardSize;
  endpoints: RoutedNetEndpoint[];
  constraints: DesignConstraint[];
}

type AutoPlacementWorkerMessage =
  | { type: "progress"; progress: AutoPlacementProgress }
  | { type: "result"; result: AutoPlacementResult }
  | { type: "error"; message: string };

self.onmessage = (event: MessageEvent<AutoPlacementWorkerRequest>) => {
  try {
    const request = event.data;
    const result = autoPlaceComponents(
      request.components,
      request.region,
      request.boardWidth,
      request.boardHeight,
      request.endpoints,
      request.constraints,
      (progress) => self.postMessage({ type: "progress", progress } satisfies AutoPlacementWorkerMessage),
      request.board
    );
    self.postMessage({ type: "result", result } satisfies AutoPlacementWorkerMessage);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "自动放置 Worker 发生未知错误。"
    } satisfies AutoPlacementWorkerMessage);
  }
};
