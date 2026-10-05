import type { AutoPlacementProgress } from "../autoPlacement.ts";

interface AutoPlacementProgressPanelProps {
  progress?: AutoPlacementProgress;
}

export function AutoPlacementProgressPanel({ progress }: AutoPlacementProgressPanelProps) {
  const percent = progress?.percent ?? 0;
  return (
    <div className="auto-placement-progress" role="status" aria-live="polite">
      <div className="auto-placement-progress-heading">
        <span>自动放置进度</span>
        <strong>{percent}%</strong>
      </div>
      <div
        className="auto-placement-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <aside className="auto-placement-diagnostic-popup" aria-live="polite">
        <strong>运行详情</strong>
        <p>{progress?.detail ?? "[autoplacement] 正在启动"}</p>
        <small>阶段：{progressPhaseLabel(progress?.phase)}</small>
      </aside>
    </div>
  );
}

function progressPhaseLabel(phase: AutoPlacementProgress["phase"] | undefined) {
  switch (phase) {
    case "prepare": return "准备";
    case "initial-placement": return "初始放置";
    case "candidate-routing": return "候选布线评分";
    case "optimization": return "布局优化";
    case "complete": return "完成";
    default: return "等待开始";
  }
}

