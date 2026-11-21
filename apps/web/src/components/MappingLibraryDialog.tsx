import { useState } from "react";
import { loadBuiltinProfiles, loadUserProfiles } from "../features/import/multisim/library.ts";
import { BUILTIN_PIN_MODELS, type BuiltinPinModel } from "../features/import/multisim/builtinPinModels.ts";
import type { PinProfile } from "../types/project.ts";
import { PinProfileLibraryList } from "./PinProfileLibraryList.tsx";
import { useDialogDrag } from "./useDialogDrag.ts";

interface MappingLibraryDialogProps {
  onDeleteProfile: (profileId: string) => void;
  onClose: () => void;
}

export function MappingLibraryDialog({ onDeleteProfile, onClose }: MappingLibraryDialogProps) {
  const drag = useDialogDrag();
  const [tab, setTab] = useState<"public" | "user">("public");
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const [userProfiles, setUserProfiles] = useState<PinProfile[]>(() => loadUserProfiles());
  const builtinProfiles = loadBuiltinProfiles();

  function handleDelete(id: string) {
    if (!window.confirm("删除这个型号的引脚配置？")) return;
    onDeleteProfile(id);
    setUserProfiles(loadUserProfiles());
    setExpandedId(undefined);
  }

  return (
    <div className="component-library-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        className="component-library-dialog mapping-library-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Multisim 映射规则库"
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
          <h2>Multisim 映射规则库</h2>
          <button className="icon-button" type="button" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <div className="library-tabs">
          <button
            className={tab === "public" ? "library-tab active" : "library-tab"}
            type="button"
            onClick={() => setTab("public")}
          >
            公用
          </button>
          <button
            className={tab === "user" ? "library-tab active" : "library-tab"}
            type="button"
            onClick={() => setTab("user")}
          >
            用户
          </button>
        </div>

        <div className="library-body">
          {tab === "public" ? (
            <>
              {builtinProfiles.length > 0 && (
                <section className="library-section">
                  <h3>公用配置</h3>
                  <PinProfileLibraryList profiles={builtinProfiles} expandedId={expandedId} onToggle={setExpandedId} />
                </section>
              )}
              <section className="library-section">
                <h3>内置型号</h3>
                <div className="pin-profile-library">
                  {BUILTIN_PIN_MODELS.map((model, index) => {
                    const key = `builtin-model:${index}`;
                    return (
                      <div className="pin-profile-item" key={key}>
                        <div className="pin-profile-item-header">
                          <button
                            className="pin-profile-row"
                            type="button"
                            title={model.id}
                            onClick={() => setExpandedId(expandedId === key ? undefined : key)}
                          >
                            <span>{model.id}</span>
                            <small>{model.pinCount} 脚</small>
                          </button>
                        </div>
                        {expandedId === key && (
                          <div className="pin-profile-pins">
                            {modelPinRows(model).map((row) => <span key={row}>{row}</span>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <PinProfileLibraryList
              profiles={userProfiles}
              expandedId={expandedId}
              onToggle={setExpandedId}
              onDelete={handleDelete}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function modelPinRows(model: BuiltinPinModel) {
  const rows: string[] = [];
  for (const [unit, pins] of Object.entries(model.units)) {
    for (const [logical, physical] of Object.entries(pins)) {
      rows.push(`${unit ? `${unit}:` : ""}${logical} → ${physical}`);
    }
  }
  for (const [logical, physical] of Object.entries(model.powerPins)) {
    rows.push(`${logical} → ${physical}`);
  }
  return rows;
}
