import type { PerfboardProject } from "../../types/project.ts";
import { getBoardModel } from "../board/factory.ts";
import { projectConstraints } from "../constraints/model.ts";
import { buildPowerRailTraces } from "../constraints/execution.ts";
import { resolveNetEndpoints } from "../import/netEndpointResolver.ts";
import { MANUAL_NET_NAME } from "./autoRouter.ts";
import { autoRouteInWorker } from "./autoRouteWorkerClient.ts";
import { buildDrcReport } from "./drcReport.ts";
import { stripConstraintWarnings, stripDrcWarnings } from "./drcWarnings.ts";
import { createManualBottomPath, relocateJumperEndpoint, removeBottomTraceSegmentAt, samePoint } from "./manualRoutes.ts";
import { confirmAction } from "../storage/notify.ts";

interface ProjectRef {
  current: PerfboardProject | undefined;
}

interface Options {
  projectRef: ProjectRef;
  commitProject: (updater: (current: PerfboardProject) => PerfboardProject) => void;
  routingRunning: boolean;
  setRoutingRunning: (running: boolean) => void;
  setRouteDraftStart: (point: [number, number] | undefined) => void;
}

export function useRoutingActions({
  projectRef,
  commitProject,
  routingRunning,
  setRoutingRunning,
  setRouteDraftStart
}: Options) {
  async function handleAutoRoute() {
    const sourceProject = projectRef.current;
    if (!sourceProject || routingRunning) return;
    setRoutingRunning(true);
    try {
      const endpoints = resolveNetEndpoints(sourceProject.importState, sourceProject.components);
      const allConstraints = projectConstraints(sourceProject);
      const extraWarnings: string[] = [];
      let constraints = allConstraints;
      if ((sourceProject.board.kind ?? "perfboard") === "breadboard") {
        const railConstraints = allConstraints.filter((constraint) => constraint.kind === "power_rail");
        if (railConstraints.length > 0) {
          extraWarnings.push(...railConstraints.map((constraint) => `面包板不支持电源母线约束：${constraint.net}（已忽略）。`));
          constraints = allConstraints.filter((constraint) => constraint.kind !== "power_rail");
        }
      }
      const rails = buildPowerRailTraces(constraints, endpoints, sourceProject.components);
      if (rails.errors.length > 0) {
        commitProject((current) => ({
          ...current,
          routing: {
            ...current.routing,
            warnings: [...current.routing.warnings, ...rails.errors]
          }
        }));
        return;
      }
      const fixedTraces = [
        ...rails.traces,
        ...sourceProject.routing.traces.filter((trace) => trace.locked && !trace.id.startsWith("constraint-rail-"))
      ];
      const fixedJumpers = sourceProject.routing.jumpers.filter((jumper) => jumper.locked);

      // 放到 worker 里跑：这里是最重的一段，主线程不能卡
      const routing = await autoRouteInWorker({
        board: sourceProject.board,
        endpoints,
        components: sourceProject.components,
        fixedTraces,
        constraints,
        fixedJumpers
      });

      // 布线结果也走同一个 DRC 真值入口（接线校验 + 网表完整性 + 约束报告）
      const report = buildDrcReport(sourceProject, routing);
      const routed = {
        ...routing,
        drc: report.drc,
        diagnostics: report.diagnostics,
        failedNets: report.failedNets
      };
      // 布线期间用户可能改了布局/线路：输入变了就丢弃这次结果，不能覆盖它
      commitProject((current) => {
        if (current.id !== sourceProject.id) return current;
        const inputsUnchanged =
          current.components === sourceProject.components &&
          current.board === sourceProject.board &&
          current.routing === sourceProject.routing &&
          current.constraints === sourceProject.constraints &&
          // 布线期间重新导入网表同样会让结果过期
          current.importState === sourceProject.importState;
        if (!inputsUnchanged) {
          return {
            ...current,
            routing: {
              ...current.routing,
              warnings: [...current.routing.warnings, "布线期间工程已被修改，本次自动布线结果已丢弃。"]
            }
          };
        }
        return {
          ...current,
          routing: {
            ...routed,
            warnings: [...stripConstraintWarnings(routed.warnings), ...report.warnings, ...extraWarnings]
          }
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动布线失败。";
      commitProject((current) => ({
        ...current,
        routing: { ...current.routing, warnings: [...current.routing.warnings, `自动布线失败：${message}`] }
      }));
    } finally {
      setRoutingRunning(false);
    }
  }

  /** Removes all copper and DRC marks, keeping components and their placement. */
  function handleClearRoutes() {
    if (!projectRef.current) return;
    if (!confirmAction("清除全部走线、跳线与 DRC 标记？元件与摆放位置会保留。")) return;
    commitProject((current) => ({
      ...current,
      // Routing warnings describe copper that no longer exists, so they go too.
      routing: { traces: [], jumpers: [], failedNets: [], warnings: [] }
    }));
    setRouteDraftStart(undefined);
  }

  function handleRunDrc() {
    commitProject((current) => {
      // 唯一的 DRC 真值来源：接线校验 + 网表完整性 + 约束报告
      const report = buildDrcReport(current, current.routing);
      return {
        ...current,
        routing: {
          ...current.routing,
          drc: report.drc,
          diagnostics: report.diagnostics,
          warnings: [...stripConstraintWarnings(stripDrcWarnings(current.routing.warnings)), ...report.warnings],
          failedNets: report.failedNets
        }
      };
    });
  }

  function handleClearDrc() {
    commitProject((current) => ({
      ...current,
      routing: {
        ...current.routing,
        drc: undefined,
        diagnostics: undefined,
        warnings: stripDrcWarnings(current.routing.warnings)
      }
    }));
  }

  function handleAddBottomTrace(from: [number, number], to: [number, number]) {
    commitProject((current) => {
      if (!getBoardModel(current.board).capabilities.routePrimitives.has("bottom_trace")) {
        return current;
      }
      const net = current.selectedNetName ?? MANUAL_NET_NAME;
      return {
        ...current,
        routing: {
          ...current.routing,
          traces: [
            ...current.routing.traces,
            {
              id: crypto.randomUUID(),
              net,
              points: createManualBottomPath(from, to),
              layer: "bottom",
              locked: true
            }
          ]
        }
      };
    });
  }

  function handleAddJumper(from: [number, number], to: [number, number]) {
    commitProject((current) => {
      const net = current.selectedNetName ?? MANUAL_NET_NAME;
      const nextFrom = relocateJumperEndpoint(current, from);
      const nextTo = relocateJumperEndpoint(current, to);
      if (!nextFrom || !nextTo || samePoint(nextFrom, nextTo)) return current;
      return {
        ...current,
        routing: {
          ...current.routing,
          jumpers: [
            ...current.routing.jumpers,
            {
              id: crypto.randomUUID(),
              net,
              from: nextFrom,
              to: nextTo,
              layer: "jumper",
              locked: true
            }
          ]
        }
      };
    });
  }

  function handleRemoveRouteAt(point: [number, number]) {
    commitProject((current) => {
      const traceRemoval = removeBottomTraceSegmentAt(current.routing.traces, point);
      const nextJumpers = current.routing.jumpers.filter((jumper) => !samePoint(jumper.from, point) && !samePoint(jumper.to, point));
      if (!traceRemoval.removed && nextJumpers.length === current.routing.jumpers.length) {
        return current;
      }
      return {
        ...current,
        routing: {
          ...current.routing,
          traces: traceRemoval.traces,
          jumpers: nextJumpers
        }
      };
    });
  }

  return {
    handleAutoRoute,
    handleClearRoutes,
    handleRunDrc,
    handleClearDrc,
    handleAddBottomTrace,
    handleAddJumper,
    handleRemoveRouteAt
  };
}

