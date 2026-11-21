import { Component } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { UserPackageDraft } from "../model/types.ts";

interface UserPackageLibraryListProps {
  packages: UserPackageDraft[];
  onEdit: (draft: UserPackageDraft) => void;
  onDelete: (id: string) => void;
}

export function UserPackageLibraryList({ packages, onEdit, onDelete }: UserPackageLibraryListProps) {
  const [menu, setMenu] = useState<{ draft: UserPackageDraft; x: number; y: number } | undefined>();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(undefined);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  return (
    <>
      <div className="component-library-dialog-grid">
        {packages.map((draft) => (
          <button
            className="library-item"
            type="button"
            key={draft.id}
            onClick={() => onEdit(draft)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ draft, x: event.clientX, y: event.clientY });
            }}
          >
            <Component size={16} />
            <span>{draft.name}</span>
          </button>
        ))}
      </div>
      {menu && createPortal(
        <div
          ref={menuRef}
          className="component-context-menu"
          style={{ left: menu.x, top: menu.y, zIndex: 60 }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onDelete(menu.draft.id);
              setMenu(undefined);
            }}
          >
            删除
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
