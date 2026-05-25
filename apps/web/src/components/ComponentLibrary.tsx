import { Component } from "lucide-react";
import { useState } from "react";
import { componentLibrary, type LibraryComponentDefinition } from "../features/project/componentLibrary";

interface ComponentLibraryProps {
  onPickComponent: (component: LibraryComponentDefinition) => void;
}

export function ComponentLibrary({ onPickComponent }: ComponentLibraryProps) {
  const [isOpen, setIsOpen] = useState(false);

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
                  className="library-item"
                  key={`${component.kind}-${component.label}-${component.pinCount ?? ""}`}
                  type="button"
                  onClick={() => {
                    onPickComponent(component);
                    setIsOpen(false);
                  }}
                  title={`Select ${component.title}`}
                >
                  <Component size={16} />
                  <span>{component.title}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
