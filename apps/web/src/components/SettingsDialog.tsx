import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { DragMoveModifier, KeyboardShortcuts, ShortcutAction } from "../types/project";

interface SettingsDialogProps {
  dragMoveModifier: DragMoveModifier;
  shortcuts: KeyboardShortcuts;
  onUpdate: (dragMoveModifier: DragMoveModifier) => void;
  onUpdateShortcut: (action: ShortcutAction, shortcut: string) => void;
  onClose: () => void;
}

const shortcutGroups: Array<{
  title: string;
  actions: Array<{ action: ShortcutAction; label: string }>;
}> = [
  {
    title: "View",
    actions: [
      { action: "refresh", label: "Refresh workspace" },
      { action: "select", label: "Select mode" },
      { action: "transparent", label: "Transparent board" }
    ]
  },
  {
    title: "Component",
    actions: [
      { action: "rotate", label: "Rotate selected" },
      { action: "mount", label: "Mount selected" },
      { action: "unmount", label: "Unmount selected" },
      { action: "delete", label: "Delete selected" }
    ]
  },
  {
    title: "Automation",
    actions: [
      { action: "generateComponents", label: "Generate components" },
      { action: "autoPlace", label: "Auto place" },
      { action: "autoRoute", label: "Auto route" }
    ]
  },
  {
    title: "Routing and DRC",
    actions: [
      { action: "solder", label: "Solder mode" },
      { action: "jumper", label: "Jumper mode" },
      { action: "erase", label: "Erase route mode" },
      { action: "runDrc", label: "Run DRC" },
      { action: "clearDrc", label: "Clear DRC markers" }
    ]
  }
];

export function SettingsDialog({ dragMoveModifier, shortcuts, onUpdate, onUpdateShortcut, onClose }: SettingsDialogProps) {
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | undefined>();
  const [shortcutError, setShortcutError] = useState<string | undefined>();

  function handleShortcutKeyDown(event: KeyboardEvent<HTMLButtonElement>, action: ShortcutAction) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setRecordingAction(undefined);
      setShortcutError(undefined);
      return;
    }

    const shortcut = normalizeShortcut(event);
    if (!shortcut) {
      return;
    }

    const conflict = findShortcutConflict(shortcuts, action, shortcut);
    if (conflict) {
      setShortcutError(`${shortcut} is already assigned to ${labelForAction(conflict)}.`);
      return;
    }

    onUpdateShortcut(action, shortcut);
    setRecordingAction(undefined);
    setShortcutError(undefined);
  }

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onPointerDown={(event) => {
          event.stopPropagation();
          if (
            recordingAction &&
            event.target instanceof Element &&
            !event.target.closest(".shortcut-capture") &&
            !event.target.closest(".shortcut-clear")
          ) {
            setRecordingAction(undefined);
            setShortcutError(undefined);
          }
        }}
      >
        <div className="settings-dialog-header">
          <h2>Settings</h2>
          <button className="icon-button" type="button" onClick={onClose} title="Close settings">
            <X size={16} />
          </button>
        </div>

        <div className="settings-shortcuts">
          <section className="settings-shortcut-group">
            <h3>Pointer</h3>
            <label className="settings-shortcut-row modifier-row">
              <span>Move component</span>
              <select value={dragMoveModifier} onChange={(event) => onUpdate(event.target.value as DragMoveModifier)}>
                <option value="shift">Shift + drag</option>
                <option value="alt">Alt + drag</option>
                <option value="ctrl">Ctrl + drag</option>
                <option value="none">Drag directly</option>
              </select>
            </label>
          </section>

          {shortcutError && <p className="settings-shortcut-error">{shortcutError}</p>}
          {shortcutGroups.map((group) => (
            <section className="settings-shortcut-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.actions.map(({ action, label }) => (
                <div className="settings-shortcut-row" key={action}>
                  <span>{label}</span>
                  <button
                    className={recordingAction === action ? "shortcut-capture recording" : "shortcut-capture"}
                    type="button"
                    onClick={() => {
                      setRecordingAction(action);
                      setShortcutError(undefined);
                    }}
                    onKeyDown={(event) => handleShortcutKeyDown(event, action)}
                    title="Click, then press a key. Backspace/Delete clears it."
                  >
                    {recordingAction === action ? "Press key..." : formatShortcut(shortcuts[action])}
                  </button>
                  <button
                    className="shortcut-clear"
                    type="button"
                    onClick={() => {
                      onUpdateShortcut(action, "None");
                      setRecordingAction(undefined);
                      setShortcutError(undefined);
                    }}
                    title="Clear shortcut"
                  >
                    Clear
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function normalizeShortcut(event: KeyboardEvent) {
  const key = normalizeKey(event.key);
  if (!key || key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") {
    return undefined;
  }

  const parts = [
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    event.metaKey ? "Meta" : "",
    key
  ].filter(Boolean);
  return parts.join("+");
}

function normalizeKey(key: string) {
  if (key.length === 1) {
    return key.toUpperCase();
  }
  if (key === " ") {
    return "Space";
  }
  return key;
}

function findShortcutConflict(shortcuts: KeyboardShortcuts, action: ShortcutAction, shortcut: string) {
  return (Object.entries(shortcuts) as Array<[ShortcutAction, string]>).find(
    ([candidateAction, candidateShortcut]) => (
      candidateAction !== action &&
      candidateShortcut !== "None" &&
      candidateShortcut.toLowerCase() === shortcut.toLowerCase()
    )
  )?.[0];
}

function labelForAction(action: ShortcutAction) {
  return shortcutGroups
    .flatMap((group) => group.actions)
    .find((item) => item.action === action)?.label ?? action;
}

function formatShortcut(shortcut: string | undefined) {
  return !shortcut || shortcut === "None" ? "Unassigned" : shortcut;
}
