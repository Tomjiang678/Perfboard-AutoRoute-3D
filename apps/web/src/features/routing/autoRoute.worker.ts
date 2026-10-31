import type { AutoRoutingResult, RoutingRequest } from "./autoRouteWorkerClient.ts";
import { autoRouteBoard } from "./autoRouter.ts";

// 自动布线跑在 worker 里：它很重，放主线程会让界面假死。
self.onmessage = (event: MessageEvent<RoutingRequest>) => {
  try {
    const request = event.data;
    const routing = autoRouteBoard(
      request.board,
      request.endpoints,
      request.components,
      request.fixedTraces,
      request.constraints,
      undefined,
      request.fixedJumpers
    );
    self.postMessage({ type: "result", routing } satisfies AutoRoutingResult);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "自动布线发生未知错误。"
    } satisfies AutoRoutingResult);
  }
};
