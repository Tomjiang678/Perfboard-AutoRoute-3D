import type { DragMoveModifier } from "../types/project";

interface SettingsDialogProps {
  dragMoveModifier: DragMoveModifier;
  onUpdate: (dragMoveModifier: DragMoveModifier) => void;
  onClose: () => void;
}

export function SettingsDialog({ dragMoveModifier, onUpdate, onClose }: SettingsDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Settings" onPointerDown={(event) => event.stopPropagation()}>
        <div className="settings-dialog-header">
          <h2>Settings</h2>
          <button className="icon-button" type="button" onClick={onClose} title="Close settings">
            x
          </button>
        </div>

        <label className="settings-field">
          <span>Move component shortcut</span>
          <select value={dragMoveModifier} onChange={(event) => onUpdate(event.target.value as DragMoveModifier)}>
            <option value="shift">Shift + drag</option>
            <option value="alt">Alt + drag</option>
            <option value="ctrl">Ctrl + drag</option>
            <option value="none">Drag directly</option>
          </select>
        </label>
      </section>
    </div>
  );
}
