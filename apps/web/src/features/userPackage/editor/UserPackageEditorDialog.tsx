import { useEffect } from "react";
import { PackageEditorToolbar } from "./PackageEditorToolbar.tsx";
import { PackageEditorInspector } from "./PackageEditorInspector.tsx";
import { PackageEditorViewport } from "./PackageEditorViewport.tsx";
import { useUserPackageEditor } from "./useUserPackageEditor.ts";
import type { UserPackageDraft } from "../model/types.ts";
import { useDialogDrag } from "../../../components/useDialogDrag.ts";

interface UserPackageEditorDialogProps {
  initial?: UserPackageDraft;
  onSave: (draft: UserPackageDraft) => void;
  onClose: () => void;
}

export function UserPackageEditorDialog({ initial, onSave, onClose }: UserPackageEditorDialogProps) {
  const drag = useDialogDrag();
  const editor = useUserPackageEditor(initial);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | undefined;
      if (target?.matches("input, textarea, select")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        editor.redo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (!editor.selectedId) return;
        event.preventDefault();
        editor.deleteSelected();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  return (
    <div className="component-library-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        className="component-library-dialog user-package-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="用户封装模型"
        onPointerDown={(event) => event.stopPropagation()}
        ref={drag.ref}
        style={{ transform: `translate3d(${drag.offset.x}px, ${drag.offset.y}px, 0)` }}
      >
        <div
          className="component-library-dialog-header draggable"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
        >
          <span className="user-package-dialog-title">用户封装</span>
          <input
            className="user-package-name"
            value={editor.draft.name}
            aria-label="封装名称"
            placeholder="封装名称"
            onChange={(event) => editor.rename(event.target.value)}
            onFocus={(event) => event.target.select()}
          />
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <PackageEditorToolbar
          tool={editor.tool}
          onTool={editor.setTool}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onUndo={editor.undo}
          onRedo={editor.redo}
          canDelete={Boolean(editor.selectedId)}
          onDelete={editor.deleteSelected}
          onSave={() => onSave(editor.draft)}
        />

        <div className="user-package-editor-body">
          <PackageEditorViewport
            draft={editor.draft}
            selectedId={editor.selectedId}
            tool={editor.tool}
            onSelect={editor.setSelectedId}
            onPlacePin={editor.addPin}
            onPlaceShape={(kind, center) => {
              if (kind === "cuboid") editor.addCuboid(center);
              else editor.addCylinder(center);
            }}
          />
          <PackageEditorInspector
            draft={editor.draft}
            selectedShape={editor.selectedShape}
            onUpdate={editor.updateShape}
            onSelect={editor.setSelectedId}
          />
        </div>
      </section>
    </div>
  );
}
