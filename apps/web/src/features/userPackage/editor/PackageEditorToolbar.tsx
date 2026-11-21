import { Box, Cylinder, Pin, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import type { UserPackageEditorTool } from "./useUserPackageEditor.ts";

interface PackageEditorToolbarProps {
  tool: UserPackageEditorTool;
  onTool: (tool: UserPackageEditorTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canDelete: boolean;
  onDelete: () => void;
  onSave: () => void;
}

export function PackageEditorToolbar({
  tool,
  onTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canDelete,
  onDelete,
  onSave
}: PackageEditorToolbarProps) {
  return (
    <div className="user-package-toolbar">
      <div className="user-package-toolbar-group">
        <button
          className={tool === "cuboid" ? "tool-button active" : "tool-button"}
          type="button"
          onClick={() => onTool("cuboid")}
        >
          <Box size={15} />
          <span>长方体</span>
        </button>
        <button
          className={tool === "cylinder" ? "tool-button active" : "tool-button"}
          type="button"
          onClick={() => onTool("cylinder")}
        >
          <Cylinder size={15} />
          <span>圆柱体</span>
        </button>
        <button
          className={tool === "pin" ? "tool-button active" : "tool-button"}
          type="button"
          onClick={() => onTool("pin")}
        >
          <Pin size={15} />
          <span>引脚</span>
        </button>
      </div>

      <div className="user-package-toolbar-group">
        <button className="tool-button" type="button" disabled={!canUndo} onClick={onUndo} title="撤销">
          <Undo2 size={15} />
        </button>
        <button className="tool-button" type="button" disabled={!canRedo} onClick={onRedo} title="重做">
          <Redo2 size={15} />
        </button>
        <button className="tool-button" type="button" disabled={!canDelete} onClick={onDelete} title="删除">
          <Trash2 size={15} />
        </button>
      </div>

      <button className="tool-button primary user-package-save" type="button" onClick={onSave}>
        <Save size={15} />
        <span>保存</span>
      </button>
    </div>
  );
}
