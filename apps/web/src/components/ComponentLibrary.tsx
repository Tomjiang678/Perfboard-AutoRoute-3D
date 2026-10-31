import { Component } from "lucide-react";
import { useState } from "react";
import { componentLibrary, type LibraryComponentDefinition } from "../features/project/componentLibrary.ts";
import {
  createPinHeaderDefinition,
  DEFAULT_PIN_HEADER_COLUMNS,
  DEFAULT_PIN_HEADER_ROWS,
  MAX_PIN_HEADER_DIMENSION,
  MAX_PIN_HEADER_PINS
} from "../features/project/pinHeader.ts";
import { createAdapterDefinition, defaultAdapterForChip, normalizeAdapterSpec } from "../features/project/adapter.ts";
import type { AdapterSpec } from "../types/project.ts";

interface ComponentLibraryProps {
  onPickComponent: (component: LibraryComponentDefinition) => void;
}

export function ComponentLibrary({ onPickComponent }: ComponentLibraryProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  return (
    <div className="component-library-menu">
      <button className={isOpen ? "icon-text-button active" : "icon-text-button"} type="button" onClick={() => setIsOpen((current) => !current)}>
        <Component size={16} />
        元件库
      </button>
      {isOpen && (
        <div className="component-library-backdrop" role="presentation" onPointerDown={() => setIsOpen(false)}>
          <section className="component-library-dialog" role="dialog" aria-modal="true" aria-label="Component library" onPointerDown={(event) => event.stopPropagation()}>
            <div className="component-library-dialog-header">
              <h2>元件库</h2>
              <button className="icon-button" type="button" onClick={() => setIsOpen(false)}>
                ×
              </button>
            </div>
            <div className="component-library-dialog-grid">
              {componentLibrary.map((component) => (
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
                    onPickComponent(component);
                    setIsOpen(false);
                  }}
                  title={`Select ${component.title}`}
                >
                  <Component size={16} />
                  <span>{component.kind === "pin_header" ? "排针" : component.kind === "adapter" ? "转接板" : component.title}</span>
                </button>
              ))}
              {pinHeaderConfiguratorOpen && (
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
                      onPickComponent(createPinHeaderDefinition(pinHeaderRows, pinHeaderColumns));
                      setIsOpen(false);
                      setPinHeaderConfiguratorOpen(false);
                    }}
                  >
                    使用 {pinHeaderRows}×{pinHeaderColumns} 排针
                  </button>
                </section>
              )}
              {adapterConfiguratorOpen && (
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
                      onPickComponent(createAdapterDefinition(adapterDraft));
                      setIsOpen(false);
                      setAdapterConfiguratorOpen(false);
                    }}
                  >
                    使用 {adapterDraft.pinCount} 脚转接板
                  </button>
                </section>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function toPinHeaderDimension(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(MAX_PIN_HEADER_DIMENSION, Math.round(parsed)));
}
