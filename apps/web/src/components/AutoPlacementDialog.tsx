import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import type { AiConstraintAssistantController } from "../features/ai/useAiConstraintAssistant";
import { AiConstraintAssistantPanel } from "../features/ai/components/AiConstraintAssistantPanel";
import type { AutoPlacementProgress, PlacementRegion } from "../features/layout/autoPlacement";
import { AutoPlacementProgressPanel } from "../features/layout/components/AutoPlacementProgressPanel";
import { PlacementRegionFields } from "../features/layout/components/PlacementRegionFields";
import type { BoardKind } from "../types/project";

interface AutoPlacementDialogProps {
  boardWidth: number;
  boardHeight: number;
  boardKind: BoardKind;
  warnings: string[];
  running: boolean;
  progress?: AutoPlacementProgress;
  aiAssistant: AiConstraintAssistantController;
  onCancel: () => void;
  onPlace: (region: PlacementRegion) => void | Promise<void>;
}

export function AutoPlacementDialog({
  boardWidth,
  boardHeight,
  boardKind,
  warnings,
  running,
  progress,
  aiAssistant,
  onCancel,
  onPlace
}: AutoPlacementDialogProps) {
  const [x, setX] = useState(1);
  const [y, setY] = useState(1);
  const [width, setWidth] = useState(Math.max(1, boardWidth - 2));
  const [height, setHeight] = useState(Math.max(1, boardHeight - 2));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!running) {
      const region = boardKind === "breadboard"
        ? { x: 0, y, width: boardWidth, height }
        : { x, y, width, height };
      onPlace(region);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="auto-place-title">
        <div className="dialog-header">
          <h2 id="auto-place-title">自动放置</h2>
          <button className="icon-button" type="button" onClick={onCancel} title="关闭" disabled={running}>
            <X size={18} />
          </button>
        </div>

        <form className="dialog-form" onSubmit={handleSubmit}>
          {running && <AutoPlacementProgressPanel progress={progress} />}

          <PlacementRegionFields
            boardWidth={boardWidth}
            boardHeight={boardHeight}
            boardKind={boardKind}
            disabled={running}
            values={{ x, y, width, height }}
            onChange={{ setX, setY, setWidth, setHeight }}
          />

          {boardKind !== "breadboard" && <AiConstraintAssistantPanel controller={aiAssistant} disabled={running} />}

          {warnings.length > 0 && (
            <div className="warning-list">
              {warnings.map((warning, index) => <p key={index}>{warning}</p>)}
            </div>
          )}

          <footer className="dialog-actions">
            <button className="tool-button" type="button" onClick={onCancel} disabled={running}>取消</button>
            <button className="tool-button primary" type="submit" disabled={running}>
              {running ? "运行中" : "放置"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
