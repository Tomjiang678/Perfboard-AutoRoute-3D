import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import type { BoardSize } from "../types/project";

interface NewProjectDialogProps {
  onCancel: () => void;
  onCreate: (name: string, board: BoardSize) => void;
}

export function NewProjectDialog({ onCancel, onCreate }: NewProjectDialogProps) {
  const [name, setName] = useState("Untitled Perfboard");
  const [width, setWidth] = useState(30);
  const [height, setHeight] = useState(20);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate(name, {
      width: clampGrid(width),
      height: clampGrid(height)
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <div className="dialog-header">
          <h2 id="new-project-title">新建工程</h2>
          <button className="icon-button" type="button" onClick={onCancel} title="关闭">
            <X size={18} />
          </button>
        </div>

        <form className="dialog-form" onSubmit={handleSubmit}>
          <label>
            <span>工程名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <div className="field-grid">
            <label>
              <span>板宽 / 孔</span>
              <input
                type="number"
                min={5}
                max={150}
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
            </label>
            <label>
              <span>板高 / 孔</span>
              <input
                type="number"
                min={5}
                max={150}
                value={height}
                onChange={(event) => setHeight(Number(event.target.value))}
              />
            </label>
          </div>

          <footer className="dialog-actions">
            <button className="tool-button" type="button" onClick={onCancel}>
              取消
            </button>
            <button className="tool-button primary" type="submit">
              创建
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function clampGrid(value: number) {
  if (Number.isNaN(value)) {
    return 20;
  }

  return Math.max(5, Math.min(150, Math.round(value)));
}
