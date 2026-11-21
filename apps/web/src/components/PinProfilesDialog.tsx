import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { ImportState, PinProfile } from "../types/project.ts";
import { collectPendingParts, profilePart, type PendingLogicalPin, type PendingPart } from "../features/import/multisim/pending.ts";
import { loadProfileLibrary } from "../features/import/multisim/library.ts";
import { identityKey } from "../features/import/multisim/profile.ts";
import { suggestPinCountFromPackage } from "../features/import/pinCount.ts";
import { buildProfile, isDraftValid } from "../features/import/multisim/profileBuilder.ts";
import { clearPinDraft, loadPinDraft, savePinDraft } from "../features/import/multisim/draftStore.ts";
import { useDialogDrag } from "./useDialogDrag.ts";

interface PinProfilesDialogProps {
  importState: ImportState;
  projectId: string;
  /** Identity key of an already stored profile to edit alongside pending parts. */
  focusKey?: string;
  onSave: (profile: PinProfile) => void;
  onClose: () => void;
}

interface Draft {
  pinCount: string;
  mapping: Record<string, string>;
  bindings: Record<string, string>;
}

/**
 * One screen for every part the importer could not resolve. Pin count, logical
 * pin placement and spare-pin net binding are edited together; saving teaches
 * the part once and every instance of the same value/package reuses it.
 */
export function PinProfilesDialog({ importState, projectId, focusKey, onSave, onClose }: PinProfilesDialogProps) {
  const pending = useMemo(() => {
    const parts = collectPendingParts(importState);
    const focused = focusKey ? profilePart(importState, focusKey) : undefined;
    return focused && !parts.some((part) => part.key === focused.key) ? [...parts, focused] : parts;
  }, [importState, focusKey]);
  const [remaining, setRemaining] = useState(() => pending.map((part) => part.key));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(
    pending.map((part) => [part.key, seedDraft(part, projectId)])
  ));
  const drag = useDialogDrag();

  useEffect(() => {
    for (const [key, draft] of Object.entries(drafts)) {
      if (remaining.includes(key)) savePinDraft(projectId, key, draft);
    }
  }, [drafts, remaining, projectId]);

  const parts = pending.filter((part) => remaining.includes(part.key));

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  function dismiss(key: string) {
    const next = remaining.filter((item) => item !== key);
    setRemaining(next);
    if (next.length === 0) onClose();
  }

  function save(part: PendingPart) {
    const draft = drafts[part.key];
    if (!draft || !isCardValid(part, draft)) return;
    const pinCount = Number(draft.pinCount);
    const mappings = part.logicalPins.flatMap((pin) => {
      const physical = Number(draft.mapping[mappingKey(pin)]);
      return Number.isInteger(physical) ? [{ unit: pin.unit, logical: pin.logical, physical, shared: pin.shared }] : [];
    });
    const mapped = new Set(mappings.map((mapping) => mapping.physical));
    const bindings = Array.from({ length: pinCount }, (_, index) => index + 1)
      .filter((physical) => !mapped.has(physical))
      .flatMap((physical) => {
        const net = draft.bindings[physical];
        return net ? [{ physical, net }] : [];
      });

    onSave(buildProfile(
      { value: part.value, package: part.packageName, category: part.category },
      { pinCount, mappings, bindings }
    ));
    clearPinDraft(projectId, part.key);
    dismiss(part.key);
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog pin-workbench"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-workbench-title"
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
          <h2 id="pin-workbench-title">Multisim parts</h2>
          <button className="icon-button" type="button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="pin-workbench-body">
          {parts.map((part) => {
            const draft = drafts[part.key];
            const valid = isCardValid(part, draft);
            const pinCount = Number(draft.pinCount);
            const mapped = new Set(
              part.logicalPins
                .map((pin) => Number(draft.mapping[mappingKey(pin)]))
                .filter((value) => Number.isInteger(value))
            );
            const spare = Number.isInteger(pinCount) && pinCount > 0
              ? Array.from({ length: pinCount }, (_, index) => index + 1).filter((physical) => !mapped.has(physical))
              : [];

            return (
              <article className="pin-card" key={part.key}>
                <header className="pin-card-header">
                  <strong>{part.value}</strong>
                  <span>{part.packageName || "-"}</span>
                  <small>{part.refs.join(", ")}</small>
                </header>

                <div className="pin-card-grid">
                  <label className="pin-count">
                    <span>Pin count</span>
                    <input
                      type="number"
                      min={2}
                      max={256}
                      value={draft.pinCount}
                      onChange={(event) => updateDraft(part.key, { pinCount: event.target.value })}
                    />
                  </label>

                  {part.logicalPins.length > 0 && (
                    <div className="pin-map">
                      {part.logicalPins.map((pin) => (
                        <label className="pin-map-row" key={mappingKey(pin)}>
                          <span>{pinLabel(pin)}</span>
                          <input
                            type="number"
                            min={1}
                            max={pinCount || undefined}
                            value={draft.mapping[mappingKey(pin)] ?? ""}
                            onChange={(event) => updateDraft(part.key, {
                              mapping: { ...draft.mapping, [mappingKey(pin)]: event.target.value }
                            })}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {spare.length > 0 && (
                  <div className="pin-spare">
                    {spare.map((physical) => (
                      <label className="pin-spare-row" key={physical}>
                        <span>{physical}</span>
                        <select
                          value={draft.bindings[physical] ?? ""}
                          onChange={(event) => updateDraft(part.key, {
                            bindings: { ...draft.bindings, [physical]: event.target.value }
                          })}
                        >
                          <option value="">-</option>
                          {importState.nets.map((net) => (
                            <option value={net.name} key={net.name}>{net.name}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                )}

                <footer className="pin-card-actions">
                  <button className="tool-button" type="button" onClick={() => dismiss(part.key)}>
                    Skip
                  </button>
                  <button className="tool-button primary" type="button" disabled={!valid} onClick={() => save(part)}>
                    Save
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function seedDraft(part: PendingPart, projectId: string): Draft {
  const draft = loadPinDraft(projectId, part.key);
  if (draft) {
    return {
      pinCount: draft.pinCount,
      mapping: Object.fromEntries(
        part.logicalPins.map((pin) => [mappingKey(pin), draft.mapping[mappingKey(pin)] ?? ""])
      ),
      bindings: draft.bindings
    };
  }

  const stored = part.profile ?? loadProfileLibrary().find((profile) =>
    identityKey(profile.identity) === identityKey({ value: part.value, package: part.packageName })
  );
  const pinCount = stored?.pinCount ?? part.pinCount ?? suggestPinCountFromPackage(part.packageName);
  const mapping: Record<string, string> = {};
  const bindings: Record<string, string> = {};

  for (const pin of part.logicalPins) {
    const binding = stored?.pins.find((item) =>
      item.logical !== undefined &&
      item.logical.toUpperCase() === pin.logical.toUpperCase() &&
      (pin.shared
        ? item.shared === true || !item.unit
        : (item.unit ?? "").toUpperCase() === (pin.unit ?? "").toUpperCase())
    );
    mapping[mappingKey(pin)] = binding ? String(binding.physical) : "";
  }

  for (const storedPin of stored?.pins ?? []) {
    if (storedPin.connection === "bound" && storedPin.net) {
      bindings[storedPin.physical] = storedPin.net;
    }
  }

  return { pinCount: pinCount ? String(pinCount) : "", mapping, bindings };
}

function isCardValid(part: PendingPart, draft: Draft | undefined) {
  if (!draft) return false;
  const pinCount = Number(draft.pinCount);
  if (!Number.isInteger(pinCount)) return false;

  const mappings = part.logicalPins.map((pin) => ({
    unit: pin.shared ? undefined : pin.unit,
    logical: pin.logical,
    physical: Number(draft.mapping[mappingKey(pin)]),
    shared: pin.shared
  }));
  if (mappings.some((mapping) => !Number.isInteger(mapping.physical) || mapping.physical < 1)) {
    return false;
  }

  const mapped = new Set(mappings.map((mapping) => mapping.physical));
  const bindings = Object.entries(draft.bindings)
    .filter(([, net]) => Boolean(net))
    .map(([physical, net]) => ({ physical: Number(physical), net }));

  return isDraftValid({ pinCount, mappings, bindings }) && mapped.size === mappings.length;
}

function mappingKey(pin: PendingLogicalPin) {
  return `${pin.shared ? "" : pin.unit ?? ""}|${pin.logical}`;
}

function pinLabel(pin: PendingLogicalPin) {
  return pin.shared || !pin.unit ? pin.logical : `${pin.unit}:${pin.logical}`;
}
