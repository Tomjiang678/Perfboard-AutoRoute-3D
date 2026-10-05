import type { ReactNode } from "react";
import { Check, Eye, Moon, MousePointer2, RefreshCw, RotateCw, ShieldCheck, Trash2, Undo2, XCircle } from "lucide-react";
import type { LibraryComponentDefinition } from "../features/project/componentLibrary.ts";
import type { KeyboardShortcuts, PlacedComponent } from "../types/project.ts";
import { ComponentLibrary } from "./ComponentLibrary.tsx";

export type RouteEditMode = "select" | "solder" | "jumper" | "erase";

export interface WorkspaceToolbarProps {
  canSolder: boolean;
  selectedComponent?: PlacedComponent;
  canEditSelected: boolean;
  canUnmountSelected: boolean;
  hasComponents: boolean;
  hasImportedComponents: boolean;
  hasUnmountedComponents: boolean;
  hasDrc: boolean;
  shortcuts: KeyboardShortcuts;
  openMenu?: string;
  onOpenMenu: (label: string | undefined) => void;
  routeEditMode: RouteEditMode;
  routeDraftStart?: [number, number];
  pendingComponent?: LibraryComponentDefinition;
  isTransparentBoard: boolean;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onToggleRouteEditMode: (mode: RouteEditMode) => void;
  onSelectMode: () => void;
  onRefresh: () => void;
  onToggleTransparent: () => void;
  onRotateSelected: () => void;
  onMountSelected: () => void;
  onUnmountSelected: () => void;
  onDeleteSelected: () => void;
  onCreateComponentsFromImport: () => void;
  onOpenAutoPlacement: () => void;
  onAutoRoute: () => void;
  onRunDrc: () => void;
  onClearDrc: () => void;
  onPickComponent: (component: LibraryComponentDefinition) => void;
}

export function WorkspaceToolbar({
  canSolder,
  selectedComponent,
  canEditSelected,
  canUnmountSelected,
  hasComponents,
  hasImportedComponents,
  hasUnmountedComponents,
  hasDrc,
  shortcuts,
  openMenu,
  onOpenMenu,
  routeEditMode,
  routeDraftStart,
  pendingComponent,
  isTransparentBoard,
  isDarkMode,
  onToggleDarkMode,
  onToggleRouteEditMode,
  onSelectMode,
  onRefresh,
  onToggleTransparent,
  onRotateSelected,
  onMountSelected,
  onUnmountSelected,
  onDeleteSelected,
  onCreateComponentsFromImport,
  onOpenAutoPlacement,
  onAutoRoute,
  onRunDrc,
  onClearDrc,
  onPickComponent
}: WorkspaceToolbarProps) {
  return (
    <>
      <ToolbarMenu label="查看" openMenu={openMenu} onOpenMenu={onOpenMenu}>
        <MenuButton icon={<RefreshCw size={16} />} shortcut={shortcutLabel(shortcuts.refresh)} onClick={onRefresh}>
          刷新
        </MenuButton>
        <MenuButton active={routeEditMode === "select"} icon={<MousePointer2 size={16} />} shortcut={shortcutLabel(shortcuts.select)} onClick={onSelectMode}>
          选择
        </MenuButton>
        <MenuButton active={isTransparentBoard} icon={<Eye size={16} />} shortcut={shortcutLabel(shortcuts.transparent)} onClick={onToggleTransparent}>
          透视
        </MenuButton>
        <MenuButton active={isDarkMode} icon={<Moon size={16} />} onClick={onToggleDarkMode}>
          深色模式
        </MenuButton>
      </ToolbarMenu>

      <ToolbarMenu label="元件" openMenu={openMenu} onOpenMenu={onOpenMenu}>
        <MenuButton disabled={!canEditSelected} icon={<RotateCw size={16} />} shortcut={shortcutLabel(shortcuts.rotate)} onClick={onRotateSelected}>
          旋转
        </MenuButton>
        <MenuButton disabled={!canEditSelected} icon={<Check size={16} />} shortcut={shortcutLabel(shortcuts.mount)} onClick={onMountSelected}>
          放置
        </MenuButton>
        <MenuButton disabled={!canUnmountSelected} icon={<Undo2 size={16} />} shortcut={shortcutLabel(shortcuts.unmount)} onClick={onUnmountSelected}>
          移除
        </MenuButton>
        <MenuButton danger disabled={!selectedComponent} icon={<Trash2 size={16} />} shortcut={shortcutLabel(shortcuts.delete)} onClick={onDeleteSelected}>
          删除
        </MenuButton>
      </ToolbarMenu>

      <ToolbarMenu label="自动" openMenu={openMenu} onOpenMenu={onOpenMenu}>
        <MenuButton disabled={!hasImportedComponents} shortcut={shortcutLabel(shortcuts.generateComponents)} onClick={onCreateComponentsFromImport}>
          生成元件
        </MenuButton>
        <MenuButton disabled={!hasUnmountedComponents} shortcut={shortcutLabel(shortcuts.autoPlace)} onClick={onOpenAutoPlacement}>
          自动放置
        </MenuButton>
        <MenuButton disabled={!hasComponents} shortcut={shortcutLabel(shortcuts.autoRoute)} onClick={onAutoRoute}>
          自动布线
        </MenuButton>
      </ToolbarMenu>

      <ToolbarMenu label="布线" openMenu={openMenu} onOpenMenu={onOpenMenu}>
        <MenuButton disabled={!canSolder} active={routeEditMode === "solder"} shortcut={shortcutLabel(shortcuts.solder)} onClick={() => onToggleRouteEditMode("solder")}>
          走锡
        </MenuButton>
        <MenuButton active={routeEditMode === "jumper"} shortcut={shortcutLabel(shortcuts.jumper)} onClick={() => onToggleRouteEditMode("jumper")}>
          跳线
        </MenuButton>
        <MenuButton danger active={routeEditMode === "erase"} shortcut={shortcutLabel(shortcuts.erase)} onClick={() => onToggleRouteEditMode("erase")}>
          删线
        </MenuButton>
      </ToolbarMenu>

      <ToolbarMenu label="检查" openMenu={openMenu} onOpenMenu={onOpenMenu}>
        <MenuButton disabled={!hasComponents} icon={<ShieldCheck size={16} />} shortcut={shortcutLabel(shortcuts.runDrc)} onClick={onRunDrc}>
          DRC检查
        </MenuButton>
        <MenuButton disabled={!hasDrc} icon={<XCircle size={16} />} shortcut={shortcutLabel(shortcuts.clearDrc)} onClick={onClearDrc}>
          清除DRC标记
        </MenuButton>
      </ToolbarMenu>

      {routeDraftStart && <span className="route-draft-status">Start {routeDraftStart[0]},{routeDraftStart[1]}</span>}
      <ComponentLibrary onPickComponent={onPickComponent} />
      {pendingComponent && <span className="route-draft-status">Place {pendingComponent.title}</span>}
    </>
  );
}

function ToolbarMenu({
  label,
  children,
  openMenu,
  onOpenMenu
}: {
  label: string;
  children: ReactNode;
  openMenu: string | undefined;
  onOpenMenu: (label: string | undefined) => void;
}) {
  const isOpen = openMenu === label;
  return (
    <details className="toolbar-menu" open={isOpen}>
      <summary
        onClick={(event) => {
          event.preventDefault();
          onOpenMenu(isOpen ? undefined : label);
        }}
      >
        {label}
      </summary>
      <div className="toolbar-menu-panel">
        {children}
      </div>
    </details>
  );
}

function MenuButton({
  active,
  danger,
  disabled,
  icon,
  shortcut,
  children,
  onClick
}: {
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  shortcut?: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={["toolbar-menu-item", active ? "active" : "", danger ? "danger" : ""].filter(Boolean).join(" ")}
      type="button"
      disabled={disabled}
      onClick={(event) => {
        onClick();
        event.currentTarget.closest("details")?.removeAttribute("open");
      }}
    >
      <span className="toolbar-menu-item-label">
        {icon}
        {children}
      </span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
}

function shortcutLabel(shortcut: string | undefined) {
  if (!shortcut || shortcut === "None") {
    return undefined;
  }
  return shortcut === "Delete" ? "Del" : shortcut;
}
