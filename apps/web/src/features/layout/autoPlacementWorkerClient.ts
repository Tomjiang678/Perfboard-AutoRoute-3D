import type { DesignConstraint, PlacedComponent, RoutedNetEndpoint } from "../../types/project";
import type { AutoPlacementProgress, AutoPlacementResult, PlacementRegion } from "./autoPlacement";

interface AutoPlacementWorkerRequest {
  components: PlacedComponent[];
  region: PlacementRegion;
  boardWidth: number;
  boardHeight: number;
  endpoints: RoutedNetEndpoint[];
  constraints: DesignConstraint[];
}

type AutoPlacementWorkerMessage =
  | { type: "progress"; progress: AutoPlacementProgress }
  | { type: "result"; result: AutoPlacementResult }
  | { type: "error"; message: string };

export function runAutoPlacementInWorker(
  request: AutoPlacementWorkerRequest,
  onProgress: (progress: AutoPlacementProgress) => void
) {
  return new Promise<AutoPlacementResult>((resolve, reject) => {
    const worker = new Worker(new URL("./autoPlacement.worker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (event: MessageEvent<AutoPlacementWorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress(message.progress);
        return;
      }
      worker.terminate();
      if (message.type === "result") {
        resolve(message.result);
      } else {
        reject(new Error(message.message));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "自动放置 Worker 启动失败。"));
    };

    worker.postMessage(request);
  });
}

