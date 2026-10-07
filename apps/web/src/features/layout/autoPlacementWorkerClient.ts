import type { BoardSize, DesignConstraint, PlacedComponent, RoutedNetEndpoint } from "../../types/project.ts";
import type { AutoPlacementProgress, AutoPlacementResult, PlacementRegion } from "./autoPlacement.ts";

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

export function runAutoPlacementInWorker(
  request: AutoPlacementWorkerRequest,
  onProgress: (progress: AutoPlacementProgress) => void,
  signal?: AbortSignal
) {
  return new Promise<AutoPlacementResult>((resolve, reject) => {
    const worker = new Worker(new URL("./autoPlacement.worker.ts", import.meta.url), { type: "module" });
    let settled = false;

    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const abort = () => {
      const error = new Error("Automatic placement was cancelled.");
      error.name = "AbortError";
      finish(() => reject(error));
    };

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });

    worker.onmessage = (event: MessageEvent<AutoPlacementWorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        if (!settled) onProgress(message.progress);
        return;
      }
      finish(() => message.type === "result" ? resolve(message.result) : reject(new Error(message.message)));
    };

    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || "Auto-placement worker failed.")));
    };

    try {
      worker.postMessage(request);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
