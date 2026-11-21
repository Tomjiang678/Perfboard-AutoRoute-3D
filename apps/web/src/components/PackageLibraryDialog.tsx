import { Component } from "lucide-react";
import { useState } from "react";
import { componentLibrary, getLibraryComponentByKind, libraryPinCount, type LibraryComponentDefinition } from "../features/project/componentLibrary.ts";
import { useDialogDrag } from "./useDialogDrag.ts";
import {
  createPinHeaderDefinition,
  DEFAULT_PIN_HEADER_COLUMNS,
  DEFAULT_PIN_HEADER_ROWS,
  MAX_PIN_HEADER_DIMENSION,
  MAX_PIN_HEADER_PINS
} from "../features/project/pinHeader.ts";
import { createAdapterDefinition, defaultAdapterForChip, normalizeAdapterSpec } from "../features/project/adapter.ts";
import { applyPackageOverride, savePackageOverride } from "../features/project/packageOverrides.ts";
import { PackagePinNumbersDialog } from "./PackagePinNumbersDialog.tsx";
import { UserPackageEditorDialog } from "../features/userPackage/editor/UserPackageEditorDialog.tsx";
import { UserPackageLibraryList } from "../features/userPackage/editor/UserPackageLibraryList.tsx";
import { loadUserPackages, saveUserPackage, deleteUserPackage } from "../features/userPackage/model/store.ts";
import type { UserPackageDraft } from "../features/userPackage/model/types.ts";
import type { AdapterSpec } from "../types/project.ts";

interface PackageLibraryDialogProps {
  onPickComponent: (component: LibraryComponentDefinition) => void;
  onClose: () => void;
  /** When set, only package entries with this pin count can be picked. */
  pinCount?: number;
  /** True only for "使用元件库封装" on an imported component. */
  assigning?: boolean;
}

export function PackageLibraryDialog({ onPickComponent, onClose, pinCount, assigning = false }: PackageLibraryDialogProps) {
  const drag = useDialogDrag();
  const availableComponents = (pinCount === undefined
    ? componentLibrary
    : componentLibrary.filter((component) =>
      component.kind !== "pin_header" && component.kind !== "adapter" && libraryPinCount(component) === pinCount
    )).filter((component) => component.kind !== "dip");
  const dipEligible = pinCount === undefined || (pinCount >= 4 && pinCount % 2 === 0);
  const [dipConfiguratorOpen, setDipConfiguratorOpen] = useState(false);
  const [dipPinCount, setDipPinCount] = useState(14);
  const [numberTarget, setNumberTarget] = useState<LibraryComponentDefinition | undefined>();
  const [tab, setTab] = useState<"public" | "user">("public");
  const [userPackages, setUserPackages] = useState<UserPackageDraft[]>(() => loadUserPackages());
  const [editorPackage, setEditorPackage] = useState<UserPackageDraft | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [pinHeaderConfiguratorOpen, setPinHeaderConfiguratorOpen] = useState(false);
  const [pinHeaderRows, setPinHeaderRows] = useState(DEFAULT_PIN_HEADER_ROWS);
  const [pinHeaderColumns, setPinHeaderColumns] = useState(DEFAULT_PIN_HEADER_COLUMNS);
  const pinHeaderPinCount = pinHeaderRows * pinHeaderColumns;
  const pinHeaderValid = pinHeaderPinCount <= MAX_PIN_HEADER_PINS;

  const [adapterConfiguratorOpen, setAdapterConfiguratorOpen] = useState(false);
  // 脚数一变，宽高/排距跟着回到该脚数的默认尺寸
  const [adapterSpec, setAdapterSpec] = useState<AdapterSpec>(() => defaultAdapterForChip(16, 0));
  const adapterDraft = normalizeAdapterSpec(adapterSpec);
  const patchAdapter = (change: Partial<AdapterSpec>) =>
    setAdapterSpec((current) => normalizeAdapterSpec({ ...current, ...change }));

  function choosePackage(definition: LibraryComponentDefinition) {
    if (!assigning) {
      onPickComponent(definition);
      onClose();
      return;
    }
    setNumberTarget(applyPackageOverride(definition));
  }

  function pickDip(count: number) {
    const definition = getLibraryComponentByKind("dip", count);
    if (!definition) return;
    choosePackage(definition);
  }

  function openNewUserPackage() {
    setEditorPackage(undefined);
    setEditorOpen(true);
  }

  function handleSaveUserPackage(draft: UserPackageDraft) {
    saveUserPackage(draft);
    setUserPackages(loadUserPackages());
    setEditorOpen(false);
    setEditorPackage(undefined);
  }

  function handleDeleteUserPackage(id: string) {
    deleteUserPackage(id);
    setUserPackages(loadUserPackages());
  }

  return (
    <>
      <div className="component-library-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        className="component-library-dialog package-library-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="封装库"
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
          <h2>封装库</h2>
          <button className="icon-button" type="button" onClick={onClose}>
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

        {tab === "public" && (
          <div className="library-body">
          <div className="component-library-dialog-grid">
            {dipEligible && (
              <button
                className={dipConfiguratorOpen ? "library-item active" : "library-item"}
                type="button"
                onClick={() => {
                  if (pinCount !== undefined) {
                    pickDip(pinCount);
                    return;
                  }
                  setDipConfiguratorOpen(true);
                }}
              >
                <Component size={16} />
                <span>DIP</span>
              </button>
            )}
            {availableComponents.map((component) => (
              <button
                className={
                  (component.kind === "pin_header" && pinHeaderConfiguratorOpen) ||
                  (component.kind === "adapter" && adapterConfiguratorOpen)
                    ? "library-item active"
                    : "library-item"
                }
                key={`${component.kind}-${component.label}-${component.pinCount ?? ""}`}
                type="button"
                onClick={() => {
                  if (component.kind === "pin_header") {
                    setPinHeaderConfiguratorOpen(true);
                    return;
                  }
                  if (component.kind === "adapter") {
                    setAdapterConfiguratorOpen(true);
                    return;
                  }
                  choosePackage(component);
                }}
                title={`Select ${component.title}`}
              >
                <Component size={16} />
                <span>{component.kind === "pin_header" ? "排针" : component.kind === "adapter" ? "转接板" : component.title}</span>
              </button>
            ))}
            {pinCount === undefined && dipConfiguratorOpen && (
              <section className="pin-header-configurator" aria-label="DIP 系列">
                <div className="pin-header-configurator-heading">
                  <strong>DIP 系列</strong>
                  <span>{dipPinCount} 脚，双排</span>
                </div>
                <div className="pin-header-dimension-fields">
                  <label>
                    <span>脚数</span>
                    <input
                      type="number"
                      min={4}
                      max={64}
                      step={2}
                      value={dipPinCount}
                      onChange={(event) => setDipPinCount(Math.max(4, Math.min(64, Math.round(Number(event.target.value) || 4))))}
                    />
                  </label>
                </div>
                <button
                  className="tool-button primary"
                  type="button"
                  onClick={() => pickDip(Math.max(4, Math.min(64, dipPinCount - (dipPinCount % 2))))}
                >
                  使用 DIP-{Math.max(4, Math.min(64, dipPinCount - (dipPinCount % 2)))}
                </button>
              </section>
            )}
            {pinCount === undefined && pinHeaderConfiguratorOpen && (
              <section className="pin-header-configurator" aria-label="排针">
                <div className="pin-header-configurator-heading">
                  <strong>自定义排针</strong>
                  <span>{pinHeaderRows}×{pinHeaderColumns}，共 {pinHeaderPinCount} 脚</span>
                </div>
                <div className="pin-header-dimension-fields">
                  <label>
                    <span>行数 m</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_PIN_HEADER_DIMENSION}
                      value={pinHeaderRows}
                      onChange={(event) => setPinHeaderRows(toPinHeaderDimension(event.target.value))}
                    />
                  </label>
                  <span className="pin-header-dimension-symbol">×</span>
                  <label>
                    <span>列数 n</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_PIN_HEADER_DIMENSION}
                      value={pinHeaderColumns}
                      onChange={(event) => setPinHeaderColumns(toPinHeaderDimension(event.target.value))}
                    />
                  </label>
                </div>
                {!pinHeaderValid && <p>总引脚数不能超过 {MAX_PIN_HEADER_PINS}。</p>}
                <small>引脚按从左到右、从上到下编号，孔距为 1 格。</small>
                <button
                  className="tool-button primary"
                  type="button"
                  disabled={!pinHeaderValid}
                  onClick={() => {
                    choosePackage(createPinHeaderDefinition(pinHeaderRows, pinHeaderColumns));
                    setPinHeaderConfiguratorOpen(false);
                  }}
                >
                  使用 {pinHeaderRows}×{pinHeaderColumns} 排针
                </button>
              </section>
            )}
            {pinCount === undefined && adapterConfiguratorOpen && (
              <section className="pin-header-configurator" aria-label="转接板">
                <div className="pin-header-configurator-heading">
                  <strong>自定义转接板</strong>
                  <span>
                    {adapterDraft.pinCount} 脚 · {adapterDraft.width}×{adapterDraft.height} 孔
                  </span>
                </div>
                <div className="pin-header-dimension-fields">
                  <label>
                    <span>排针脚数</span>
                    <input
                      type="number"
                      min={2}
                      max={64}
                      step={2}
                      value={adapterDraft.pinCount}
                      onChange={(event) => {
                        const pins = Math.max(2, Math.round(Number(event.target.value) || 2));
                        // 换脚数时尺寸回到该脚数的默认值，而不是沿用上一个脚数的宽高
                        setAdapterSpec(defaultAdapterForChip(pins, 0));
                      }}
                    />
                  </label>
                  <label>
                    <span>两排间距</span>
                    <input
                      type="number"
                      min={1}
                      max={63}
                      value={adapterDraft.rowSpacing}
                      onChange={(event) => patchAdapter({ rowSpacing: Math.max(1, Math.round(Number(event.target.value) || 1)) })}
                    />
                  </label>
                </div>
                <div className="pin-header-dimension-fields">
                  <label>
                    <span>宽（孔）</span>
                    <input
                      type="number"
                      min={2}
                      max={64}
                      value={adapterDraft.width}
                      onChange={(event) => patchAdapter({ width: Math.max(2, Math.round(Number(event.target.value) || 2)) })}
                    />
                  </label>
                  <label>
                    <span>高（孔）</span>
                    <input
                      type="number"
                      min={2}
                      max={64}
                      value={adapterDraft.height}
                      onChange={(event) => patchAdapter({ height: Math.max(2, Math.round(Number(event.target.value) || 2)) })}
                    />
                  </label>
                </div>
                <button
                  className="tool-button primary"
                  type="button"
                  onClick={() => {
                    choosePackage(createAdapterDefinition(adapterDraft));
                    setAdapterConfiguratorOpen(false);
                  }}
                >
                  使用 {adapterDraft.pinCount} 脚转接板
                </button>
              </section>
            )}
          </div>
        </div>
        )}
        {tab === "user" && (
          <div className="library-body">
            <section className="library-section">
              <button className="tool-button user-package-new" type="button" onClick={openNewUserPackage}>
                新增
              </button>
              <UserPackageLibraryList
                packages={userPackages}
                onEdit={(draft) => {
                  setEditorPackage(draft);
                  setEditorOpen(true);
                }}
                onDelete={handleDeleteUserPackage}
              />
            </section>
          </div>
        )}
      </section>
      </div>
      {editorOpen && (
        <UserPackageEditorDialog
          initial={editorPackage}
          onSave={handleSaveUserPackage}
          onClose={() => {
            setEditorOpen(false);
            setEditorPackage(undefined);
          }}
        />
      )}
      {numberTarget && (
        <PackagePinNumbersDialog
          key={`${numberTarget.kind}:${numberTarget.pinCount ?? 0}:${numberTarget.label}`}
          definition={numberTarget}
          onCancel={() => setNumberTarget(undefined)}
          onConfirm={(pinOffsets) => {
            savePackageOverride(numberTarget, pinOffsets);
            onPickComponent({ ...numberTarget, pinOffsets });
            setNumberTarget(undefined);
            onClose();
          }}
        />
      )}
    </>
  );
}

function toPinHeaderDimension(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(MAX_PIN_HEADER_DIMENSION, Math.round(parsed)));
}
