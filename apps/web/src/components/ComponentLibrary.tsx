import { Component } from "lucide-react";
import { useState } from "react";
import { componentLibrary, type LibraryComponentDefinition } from "../features/project/componentLibrary";
import {
  createPinHeaderDefinition,
  DEFAULT_PIN_HEADER_COLUMNS,
  DEFAULT_PIN_HEADER_ROWS,
  MAX_PIN_HEADER_DIMENSION,
  MAX_PIN_HEADER_PINS
} from "../features/project/pinHeader";

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
                  className={component.kind === "pin_header" && pinHeaderConfiguratorOpen ? "library-item active" : "library-item"}
                  key={`${component.kind}-${component.label}-${component.pinCount ?? ""}`}
                  type="button"
                  onClick={() => {
                    if (component.kind === "pin_header") {
                      setPinHeaderConfiguratorOpen(true);
                      return;
                    }
                    onPickComponent(component);
                    setIsOpen(false);
                  }}
                  title={`Select ${component.title}`}
                >
                  <Component size={16} />
                  <span>{component.kind === "pin_header" ? "排针" : component.title}</span>
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
