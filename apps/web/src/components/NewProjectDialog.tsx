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
    onCreate(name.trim() || "Untitled Perfboard", {
      width: clampGrid(width),
      height: clampGrid(height)
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <div className="dialog-header">
          <h2 id="new-project-title">New project</h2>
          <button className="icon-button" type="button" onClick={onCancel} title="Close">
            <X size={18} />
          </button>
        </div>

        <form className="dialog-form" onSubmit={handleSubmit}>
          <label>
            <span>Project name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <div className="field-grid">
            <label>
              <span>Board width / holes</span>
              <input
                type="number"
                min={5}
                max={150}
                value={Number.isNaN(width) ? "" : width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Board height / holes</span>
              <input
                type="number"
                min={5}
                max={150}
                value={Number.isNaN(height) ? "" : height}
                onChange={(event) => setHeight(Number(event.target.value))}
              />
            </label>
          </div>

          <footer className="dialog-actions">
            <button className="tool-button" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="tool-button primary" type="submit">
              Create
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
