import { Component } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { UserPackageDraft } from "../model/types.ts";

interface UserPackageLibraryListProps {
  packages: UserPackageDraft[];
  onPlace: (draft: UserPackageDraft) => void;
  onEdit: (draft: UserPackageDraft) => void;
  onDelete: (id: string) => void;
}

export function UserPackageLibraryList({ packages, onPlace, onEdit, onDelete }: UserPackageLibraryListProps) {
  const [menu, setMenu] = useState<{ draft: UserPackageDraft; x: number; y: number } | undefined>();

  useEffect(() => {
    if (!menu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(undefined);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menu]);

  return (
    <>
      <div className="component-library-dialog-grid">
        {packages.map((draft) => (
          <button
            className="library-item"
            type="button"
            key={draft.id}
            onClick={() => onPlace(draft)}
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
        <>
          <div
            className="component-context-menu-scrim"
            onPointerDown={(event) => {
              event.stopPropagation();
              setMenu(undefined);
            }}
          />
          <div
            className="component-context-menu"
            style={{ left: menu.x, top: menu.y, zIndex: 60 }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onEdit(menu.draft);
                setMenu(undefined);
              }}
            >
              修改
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete(menu.draft.id);
                setMenu(undefined);
              }}
            >
              删除
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
