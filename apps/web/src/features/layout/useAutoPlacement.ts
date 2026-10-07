import { useRef, useState } from "react";
import type { AutoPlacementProgress, PlacementRegion } from "./autoPlacement.ts";
import { runAutoPlacementInWorker } from "./autoPlacementWorkerClient.ts";
import { projectConstraints } from "../constraints/model.ts";
import { evaluatePlacementConstraints, prepareComponentsForConstraints } from "../constraints/execution.ts";
import { resolveNetEndpoints } from "../import/netEndpointResolver.ts";
import type { PerfboardProject } from "../../types/project.ts";

type ProjectCommitter = (updater: (current: PerfboardProject) => PerfboardProject) => void;

interface UseAutoPlacementOptions {
  project?: PerfboardProject;
  commitProject: ProjectCommitter;
}

export interface AutoPlacementController {
  dialogOpen: boolean;
  running: boolean;
  progress?: AutoPlacementProgress;
  warnings: string[];
  open: () => void;
  close: () => void;
  run: (region: PlacementRegion) => Promise<void>;
}

export function useAutoPlacement({ project, commitProject }: UseAutoPlacementOptions): AutoPlacementController {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<AutoPlacementProgress>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  function open() {
    setWarnings([]);
    setProgress(undefined);
    setDialogOpen(true);
  }

  function close() {
    if (running) abortControllerRef.current?.abort();
    setDialogOpen(false);
  }

  async function run(region: PlacementRegion) {
    if (!project || running) return;
    const sourceProject = project;
    const constraints = projectConstraints(sourceProject);
    // Re-placement starts from a clean slate: previously auto-placed parts are
    // unlocked so the whole board can be arranged again. AI component_lock
    // constraints are re-applied by prepareComponentsForConstraints.
    const resettableComponents = sourceProject.components.map((component) => ({ ...component, mounted: false }));
    const preparedComponents = prepareComponentsForConstraints(resettableComponents, constraints);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setWarnings([]);
    setProgress({ percent: 0, phase: "prepare", detail: "[autoplacement] 正在启动自动放置诊断" });
    setRunning(true);

    try {
      await waitForPaint();
      const endpoints = resolveNetEndpoints(sourceProject.importState, preparedComponents);
      const result = await runAutoPlacementInWorker({
        components: preparedComponents,
        region,
        boardWidth: sourceProject.board.width,
        boardHeight: sourceProject.board.height,
        board: sourceProject.board,
        endpoints,
        constraints
      }, setProgress, abortController.signal);

      const constraintWarnings = evaluatePlacementConstraints(result.components, constraints);
      setWarnings([...result.warnings, ...constraintWarnings]);
      if (result.warnings.length > 0 && result.placedCount === 0) return;

      commitProject((current) => current.id === sourceProject.id &&
        current.board === sourceProject.board &&
        current.components === sourceProject.components &&
        current.importState === sourceProject.importState &&
        current.constraints === sourceProject.constraints
        ? { ...current, components: result.components }
        : current);
      setDialogOpen(false);
    } catch (error) {
      if (abortController.signal.aborted) return;
      const message = error instanceof Error ? error.message : "未知错误";
      setWarnings([`自动放置失败：${message}`]);
      setProgress((current) => ({
        percent: current?.percent ?? 0,
        phase: current?.phase ?? "prepare",
        detail: `[autoplacement] 运行失败：${message}`
      }));
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = undefined;
      }
      setRunning(false);
    }
  }

  return { dialogOpen, running, progress, warnings, open, close, run };
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}
