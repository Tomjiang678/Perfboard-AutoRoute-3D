import { RotateCcw, Save, Settings } from "lucide-react";
import type { ChangeEvent } from "react";

interface HeaderBarProps {
  projectName?: string;
  onNewProject: () => void;
  onSaveProject: () => void;
  onOpenProject: (file: File) => void;
  onUndo: () => void;
  canUndo: boolean;
  onOpenSettings: () => void;
}

export function HeaderBar({ projectName, onNewProject, onSaveProject, onOpenProject, onUndo, canUndo, onOpenSettings }: HeaderBarProps) {
  function handleProjectAction(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    event.target.value = "";
    if (value === "new") {
      onNewProject();
    }
    if (value === "open") {
      document.getElementById("project-open-input")?.click();
    }
  }

  return (
    <header className="header-bar">
      <div className="brand">
        <div className="brand-mark">PB</div>
        <div>
          <div className="brand-title">PerfBoard AutoRoute 3D</div>
          <div className="brand-subtitle">{projectName ?? "No project opened"}</div>
        </div>
      </div>

      <nav className="header-actions" aria-label="Project actions">
        <select className="project-action-select" defaultValue="" onChange={handleProjectAction} title="Project">
          <option value="" disabled>Project</option>
          <option value="new">New</option>
          <option value="open">Open</option>
        </select>
        <input
          id="project-open-input"
          className="file-input"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onOpenProject(file);
            }
            event.target.value = "";
          }}
        />
        <button className="icon-button" type="button" title="Undo" disabled={!canUndo} onClick={onUndo}>
          <RotateCcw size={18} />
        </button>
        <button className="icon-button" type="button" title="Export project JSON" disabled={!projectName} onClick={onSaveProject}>
          <Save size={18} />
        </button>
        <button className="icon-button" type="button" title="Settings" disabled={!projectName} onClick={onOpenSettings}>
          <Settings size={18} />
        </button>
      </nav>
    </header>
  );
}
