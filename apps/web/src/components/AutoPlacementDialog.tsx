import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import type { PlacementRegion } from "../features/layout/autoPlacement";

interface AutoPlacementDialogProps {
  boardWidth: number;
  boardHeight: number;
  warnings: string[];
  onCancel: () => void;
  onPlace: (region: PlacementRegion) => void;
}

export function AutoPlacementDialog({
  boardWidth,
  boardHeight,
  warnings,
  onCancel,
  onPlace
}: AutoPlacementDialogProps) {
  const [x, setX] = useState(1);
  const [y, setY] = useState(1);
  const [width, setWidth] = useState(Math.max(1, boardWidth - 2));
  const [height, setHeight] = useState(Math.max(1, boardHeight - 2));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onPlace({
      x,
      y,
      width,
      height
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="auto-place-title">
        <div className="dialog-header">
          <h2 id="auto-place-title">自动放置</h2>
          <button className="icon-button" type="button" onClick={onCancel} title="关闭">
            <X size={18} />
          </button>
        </div>

        <form className="dialog-form" onSubmit={handleSubmit}>
          <div className="field-grid">
            <label>
              <span>起点 X</span>
              <input type="number" min={0} max={boardWidth - 1} value={x} onChange={(event) => setX(toNumber(event.target.value))} />
            </label>
            <label>
              <span>起点 Y</span>
              <input type="number" min={0} max={boardHeight - 1} value={y} onChange={(event) => setY(toNumber(event.target.value))} />
            </label>
            <label>
              <span>区域宽</span>
              <input type="number" min={1} max={boardWidth} value={width} onChange={(event) => setWidth(toNumber(event.target.value))} />
            </label>
            <label>
              <span>区域高</span>
              <input type="number" min={1} max={boardHeight} value={height} onChange={(event) => setHeight(toNumber(event.target.value))} />
            </label>
          </div>

          {warnings.length > 0 && (
            <div className="warning-list">
              {warnings.map((warning, index) => (
                <p key={index}>{warning}</p>
              ))}
            </div>
          )}

          <footer className="dialog-actions">
            <button className="tool-button" type="button" onClick={onCancel}>
              取消
            </button>
            <button className="tool-button primary" type="submit">
              放置
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function toNumber(value: string) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0;
}

