import { Moon, RotateCcw, Save, Settings, Sun } from "lucide-react";
import type { ChangeEvent } from "react";
import type { ThemeMode } from "../types/project.ts";
import { WorkspaceToolbar, type WorkspaceToolbarProps } from "./WorkspaceToolbar.tsx";
import appLogo from "../../assets/image1.png";

interface HeaderBarProps {
  projectName?: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onNewProject: () => void;
  onSaveProject: () => void;
  onOpenProject: (file: File) => void;
  onUndo: () => void;
  canUndo: boolean;
  onOpenSettings: () => void;
  toolbar?: WorkspaceToolbarProps;
}

export function HeaderBar({ projectName, theme, onToggleTheme, onNewProject, onSaveProject, onOpenProject, onUndo, canUndo, onOpenSettings, toolbar }: HeaderBarProps) {
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
        <img className="brand-mark" src={appLogo} alt="ProtoRoute 3D" />
        <div>
          <div className="brand-title">ProtoRoute 3D</div>
          <div className="brand-subtitle">{projectName ?? "No project opened"}</div>
        </div>
      </div>

      {toolbar && (
        <div className="header-toolbar">
          <WorkspaceToolbar {...toolbar} />
        </div>
      )}

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
        <button className="icon-button" type="button" title="切换深色/浅色模式" onClick={onToggleTheme}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
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
