import type {
  BoardSize,
  BottomTrace,
  DesignConstraint,
  JumperRoute,
  PlacedComponent,
  RoutedNetEndpoint,
  RoutingState
} from "../../types/project.ts";

export interface RoutingRequest {
  board: BoardSize;
  endpoints: RoutedNetEndpoint[];
  components: PlacedComponent[];
  fixedTraces: BottomTrace[];
  constraints: DesignConstraint[];
  fixedJumpers: JumperRoute[];
}

export type AutoRoutingResult =
  | { type: "result"; routing: RoutingState }
  | { type: "error"; message: string };

/** 在 worker 里跑一次完整自动布线，避免阻塞 UI。 */
export function autoRouteInWorker(request: RoutingRequest): Promise<RoutingState> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./autoRoute.worker.ts", import.meta.url), { type: "module" });
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      action();
    };

    worker.onmessage = (event: MessageEvent<AutoRoutingResult>) => {
      const message = event.data;
      finish(() => message.type === "result"
        ? resolve(message.routing)
        : reject(new Error(message.message)));
    };

    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || "自动布线 worker 启动失败。")));
    };

    try {
      worker.postMessage(request);
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))));
    }
  });
}
