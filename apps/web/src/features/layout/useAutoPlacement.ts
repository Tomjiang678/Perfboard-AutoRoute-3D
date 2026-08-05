import { useState } from "react";
import type { AutoPlacementProgress, PlacementRegion } from "./autoPlacement";
import { runAutoPlacementInWorker } from "./autoPlacementWorkerClient";
import { projectConstraints } from "../constraints/model";
import { evaluatePlacementConstraints, prepareComponentsForConstraints } from "../constraints/execution";
import { resolveNetEndpoints } from "../import/netEndpointResolver";
import type { PerfboardProject } from "../../types/project";

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

  function open() {
    setWarnings([]);
    setProgress(undefined);
    setDialogOpen(true);
  }

  function close() {
    if (!running) setDialogOpen(false);
  }

  async function run(region: PlacementRegion) {
    if (!project || running) return;
    const sourceProject = project;
    const constraints = projectConstraints(sourceProject);
    const preparedComponents = prepareComponentsForConstraints(sourceProject.components, constraints);
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
        endpoints,
        constraints
      }, setProgress);

      const constraintWarnings = evaluatePlacementConstraints(result.components, constraints);
      setWarnings([...result.warnings, ...constraintWarnings]);
      if (result.warnings.length > 0 && result.placedCount === 0) return;

      commitProject((current) => current.id === sourceProject.id
        ? { ...current, components: result.components }
        : current);
      setDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setWarnings([`自动放置失败：${message}`]);
      setProgress((current) => ({
        percent: current?.percent ?? 0,
        phase: current?.phase ?? "prepare",
        detail: `[autoplacement] 运行失败：${message}`
      }));
    } finally {
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

