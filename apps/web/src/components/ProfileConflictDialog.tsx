import { useEffect } from "react";
import { X } from "lucide-react";
import type { ImportState } from "../types/project.ts";
import { collectProfileConflicts, profilePinRows, type ProfileConflict } from "../features/import/multisim/conflicts.ts";
import { useDialogDrag } from "./useDialogDrag.ts";

interface ProfileConflictDialogProps {
  importState: ImportState;
  onChoose: (conflict: ProfileConflict, choice: "public" | "user") => void;
  onClose: () => void;
}

export function ProfileConflictDialog({ importState, onChoose, onClose }: ProfileConflictDialogProps) {
  const conflicts = collectProfileConflicts(importState);
  const drag = useDialogDrag();

  useEffect(() => {
    if (conflicts.length === 0) onClose();
  }, [conflicts.length, onClose]);

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        ref={drag.ref}
        style={{ transform: `translate3d(${drag.offset.x}px, ${drag.offset.y}px, 0)` }}
      >
        <div
          className="dialog-header draggable"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
        >
          <h2 id="conflict-title">库冲突</h2>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="conflict-body">
          {conflicts.map((conflict) => (
            <article className="conflict-card" key={conflict.key}>
              <header className="conflict-card-header">
                <strong>{conflict.value}</strong>
                <span>{conflict.packageName || "-"}</span>
                <small>{conflict.refs.join(", ")}</small>
              </header>

              <div className="conflict-columns">
                <section className="conflict-side">
                  <header>
                    <strong>{conflict.publicSource === "builtin" ? "内置" : "公用"}</strong>
                    <span>{conflict.publicProfile.pinCount} 脚</span>
                  </header>
                  <div className="conflict-pins">
                    {profilePinRows(conflict.publicProfile).map((row) => <span key={row}>{row}</span>)}
                  </div>
                  <button className="tool-button primary" type="button" onClick={() => onChoose(conflict, "public")}>
                    使用公用
                  </button>
                </section>

                <section className="conflict-side">
                  <header>
                    <strong>用户</strong>
                    <span>{conflict.userProfile.pinCount} 脚</span>
                  </header>
                  <div className="conflict-pins">
                    {profilePinRows(conflict.userProfile).map((row) => <span key={row}>{row}</span>)}
                  </div>
                  <button className="tool-button" type="button" onClick={() => onChoose(conflict, "user")}>
                    使用用户
                  </button>
                </section>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
