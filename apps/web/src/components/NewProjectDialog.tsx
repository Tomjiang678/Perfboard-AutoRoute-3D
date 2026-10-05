import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { createBreadboardDefinition } from "../features/board/breadboard.ts";
import type { BoardKind, BoardSize } from "../types/project.ts";

interface NewProjectDialogProps {
  onCancel: () => void;
  onCreate: (name: string, board: BoardSize) => void;
}

export function NewProjectDialog({ onCancel, onCreate }: NewProjectDialogProps) {
  const [name, setName] = useState("Untitled Perfboard");
  const [kind, setKind] = useState<BoardKind>("perfboard");
  const [width, setWidth] = useState(30);
  const [height, setHeight] = useState(20);
  const [breadboardHeight, setBreadboardHeight] = useState(30);
  const [breadboardModules, setBreadboardModules] = useState(1);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fallbackName = kind === "breadboard" ? "Untitled Breadboard" : "Untitled Perfboard";
    const board = kind === "breadboard"
      ? createBreadboardDefinition(breadboardHeight, breadboardModules)
      : { kind: "perfboard" as const, width: clampGrid(width), height: clampGrid(height) };
    onCreate(name.trim() || fallbackName, board);
  }

  function handleKindChange(nextKind: BoardKind) {
    setKind(nextKind);
    if (name === "Untitled Perfboard" || name === "Untitled Breadboard") {
      setName(nextKind === "breadboard" ? "Untitled Breadboard" : "Untitled Perfboard");
    }
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

          <label>
            <span>Board type</span>
            <select value={kind} onChange={(event) => handleKindChange(event.target.value as BoardKind)}>
              <option value="perfboard">Perfboard</option>
              <option value="breadboard">Breadboard</option>
            </select>
          </label>

          {kind === "perfboard" ? <div className="field-grid">
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
          </div> : <div className="field-grid">
            <label>
              <span>Breadboard height / rows</span>
              <input
                type="number"
                min={5}
                max={150}
                value={Number.isNaN(breadboardHeight) ? "" : breadboardHeight}
                onChange={(event) => setBreadboardHeight(Number(event.target.value))}
              />
            </label>
            <label>
              <span>Combined boards / N-in-1</span>
              <input
                type="number"
                min={1}
                max={8}
                value={Number.isNaN(breadboardModules) ? "" : breadboardModules}
                onChange={(event) => setBreadboardModules(Number(event.target.value))}
              />
            </label>
          </div>}

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
