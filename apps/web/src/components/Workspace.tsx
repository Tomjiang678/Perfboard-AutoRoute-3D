import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Eye, Layers3, MousePointer2, RefreshCw, RotateCw, ShieldCheck, Trash2, Undo2, XCircle } from "lucide-react";
import type { LibraryComponentDefinition } from "../features/project/componentLibrary";
import type { DragMoveModifier, PerfboardProject } from "../types/project";
import { Perfboard3DViewport } from "./Perfboard3DViewport";
import { resolveNetEndpoints } from "../features/import/netEndpointResolver";
import { ComponentLibrary } from "./ComponentLibrary";

type RouteEditMode = "select" | "solder" | "jumper" | "erase";

interface WorkspaceProps {
  project?: PerfboardProject;
  selectedComponentId?: string;
  onNewProject: () => void;
  onPlaceComponent: (component: LibraryComponentDefinition, position: [number, number]) => void;
  onSelectComponent: (componentId: string | undefined) => void;
  onMoveComponent: (componentId: string, position: [number, number]) => void;
  onUpdateBoard: (board: { width: number; height: number }) => void;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;
  onMountSelected: () => void;
  onUnmountSelected: () => void;
  onUpdateSelected: (patch: { name?: string; value?: string; leadSpacing?: number; rowSpacing?: number; sameSidePitch?: number }) => void;
  onCreateComponentsFromImport: () => void;
  onOpenAutoPlacement: () => void;
  onAutoRoute: () => void;
  onRunDrc: () => void;
  onClearDrc: () => void;
  onAddBottomTrace: (from: [number, number], to: [number, number]) => void;
  onAddJumper: (from: [number, number], to: [number, number]) => void;
  onRemoveRouteAt: (point: [number, number]) => void;
  dragMoveModifier: DragMoveModifier;
}

export function Workspace({
  project,
  selectedComponentId,
  onNewProject,
  onPlaceComponent,
  onSelectComponent,
  onMoveComponent,
  onUpdateBoard,
  onRotateSelected,
  onDeleteSelected,
  onMountSelected,
  onUnmountSelected,
  onUpdateSelected,
  onCreateComponentsFromImport,
  onOpenAutoPlacement,
  onAutoRoute,
  onRunDrc,
  onClearDrc,
  onAddBottomTrace,
  onAddJumper,
  onRemoveRouteAt,
  dragMoveModifier
}: WorkspaceProps) {
  if (!project) {
    return (
      <main className="empty-workspace">
        <div className="empty-panel">
          <Layers3 size={36} />
          <h1>PerfBoard AutoRoute 3D</h1>
          <p>创建工程后开始导入网表和 BOM，随后进入洞洞板布局与布线流程。</p>
          <button className="tool-button primary" type="button" onClick={onNewProject}>
            新建工程
          </button>
        </div>
      </main>
    );
  }

  const selectedComponent = project.components.find((component) => component.id === selectedComponentId);
  const [isTransparentBoard, setIsTransparentBoard] = useState(false);
  const [routeEditMode, setRouteEditMode] = useState<RouteEditMode>("select");
  const [routeDraftStart, setRouteDraftStart] = useState<[number, number] | undefined>();
  const [pendingComponent, setPendingComponent] = useState<LibraryComponentDefinition | undefined>();
  const [openMenu, setOpenMenu] = useState<string | undefined>();
  const highlightedEndpoints = useMemo(
    () => resolveNetEndpoints(project.importState, project.components).filter(
      (endpoint) => endpoint.net === project.selectedNetName
    ),
    [project.importState, project.components, project.selectedNetName]
  );
  const canEditSelected = Boolean(selectedComponent && !selectedComponent.mounted);
  const canUnmountSelected = Boolean(selectedComponent?.mounted);
  const hasComponents = project.components.length > 0;
  const hasImportedComponents = project.importState.components.length > 0;
  const hasUnmountedComponents = project.components.some((component) => !component.mounted);
  const hasDrc = Boolean(project.routing.drc);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        setOpenMenu(undefined);
      } else if (event.key === "F5") {
        event.preventDefault();
        handleRefreshWorkspaceState();
      } else if (key === "v") {
        setRouteEditMode("select");
        setRouteDraftStart(undefined);
      } else if (key === "t") {
        setIsTransparentBoard((current) => !current);
      } else if (key === "r" && canEditSelected) {
        onRotateSelected();
      } else if (key === "m" && canEditSelected) {
        onMountSelected();
      } else if (key === "u" && canUnmountSelected) {
        onUnmountSelected();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedComponent) {
        onDeleteSelected();
      } else if (key === "g" && hasImportedComponents) {
        onCreateComponentsFromImport();
      } else if (key === "p" && hasUnmountedComponents) {
        onOpenAutoPlacement();
      } else if (key === "a" && hasComponents) {
        onAutoRoute();
      } else if (key === "d" && hasComponents) {
        onRunDrc();
      } else if (key === "c" && hasDrc) {
        onClearDrc();
      } else if (key === "s") {
        toggleRouteEditMode("solder");
      } else if (key === "j") {
        toggleRouteEditMode("jumper");
      } else if (key === "e") {
        toggleRouteEditMode("erase");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest(".toolbar-menu")) {
        return;
      }
      setOpenMenu(undefined);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function handleRouteEditPoint(point: [number, number]) {
    if (pendingComponent) {
      onPlaceComponent(pendingComponent, point);
      setPendingComponent(undefined);
      return;
    }
    if (routeEditMode === "select") {
      return;
    }
    if (routeEditMode === "erase") {
      onRemoveRouteAt(point);
      setRouteDraftStart(undefined);
      return;
    }
    if (!routeDraftStart) {
      setRouteDraftStart(point);
      return;
    }
    if (routeEditMode === "solder") {
      onAddBottomTrace(routeDraftStart, point);
    } else {
      onAddJumper(routeDraftStart, point);
    }
    setRouteDraftStart(undefined);
  }

  function handleRefreshWorkspaceState() {
    setRouteEditMode("select");
    setRouteDraftStart(undefined);
    setPendingComponent(undefined);
    setOpenMenu(undefined);
    onSelectComponent(undefined);
    onClearDrc();
  }

  return (
    <main className="workspace">
      <div className="viewport-toolbar">
        <ToolbarMenu label="查看" openMenu={openMenu} onOpenMenu={setOpenMenu}>
          <MenuButton icon={<RefreshCw size={16} />} shortcut="F5" onClick={handleRefreshWorkspaceState}>
            刷新
          </MenuButton>
          <MenuButton active={routeEditMode === "select"} icon={<MousePointer2 size={16} />} shortcut="V" onClick={() => { setRouteEditMode("select"); setRouteDraftStart(undefined); }}>
            选择
          </MenuButton>
          <MenuButton active={isTransparentBoard} icon={<Eye size={16} />} shortcut="T" onClick={() => setIsTransparentBoard((current) => !current)}>
            透视
          </MenuButton>
        </ToolbarMenu>

        <ToolbarMenu label="元件" openMenu={openMenu} onOpenMenu={setOpenMenu}>
          <MenuButton disabled={!canEditSelected} icon={<RotateCw size={16} />} shortcut="R" onClick={onRotateSelected}>
            旋转
          </MenuButton>
          <MenuButton disabled={!canEditSelected} icon={<Check size={16} />} shortcut="M" onClick={onMountSelected}>
            放置
          </MenuButton>
          <MenuButton disabled={!canUnmountSelected} icon={<Undo2 size={16} />} shortcut="U" onClick={onUnmountSelected}>
            移除
          </MenuButton>
          <MenuButton danger disabled={!selectedComponent} icon={<Trash2 size={16} />} shortcut="Del" onClick={onDeleteSelected}>
            删除
          </MenuButton>
        </ToolbarMenu>

        <ToolbarMenu label="自动" openMenu={openMenu} onOpenMenu={setOpenMenu}>
          <MenuButton disabled={!hasImportedComponents} shortcut="G" onClick={onCreateComponentsFromImport}>
            生成元件
          </MenuButton>
          <MenuButton disabled={!hasUnmountedComponents} shortcut="P" onClick={onOpenAutoPlacement}>
            自动放置
          </MenuButton>
          <MenuButton disabled={!hasComponents} shortcut="A" onClick={onAutoRoute}>
            自动布线
          </MenuButton>
        </ToolbarMenu>

        <ToolbarMenu label="布线" openMenu={openMenu} onOpenMenu={setOpenMenu}>
          <MenuButton active={routeEditMode === "solder"} shortcut="S" onClick={() => toggleRouteEditMode("solder")}>
            走锡
          </MenuButton>
          <MenuButton active={routeEditMode === "jumper"} shortcut="J" onClick={() => toggleRouteEditMode("jumper")}>
            跳线
          </MenuButton>
          <MenuButton danger active={routeEditMode === "erase"} shortcut="E" onClick={() => toggleRouteEditMode("erase")}>
            删线
          </MenuButton>
        </ToolbarMenu>

        <ToolbarMenu label="检查" openMenu={openMenu} onOpenMenu={setOpenMenu}>
          <MenuButton disabled={!hasComponents} icon={<ShieldCheck size={16} />} shortcut="D" onClick={onRunDrc}>
            DRC检查
          </MenuButton>
          <MenuButton disabled={!hasDrc} icon={<XCircle size={16} />} shortcut="C" onClick={onClearDrc}>
            清除DRC标记
          </MenuButton>
        </ToolbarMenu>

        {routeDraftStart && <span className="route-draft-status">Start {routeDraftStart[0]},{routeDraftStart[1]}</span>}
        <ComponentLibrary onPickComponent={(component) => {
          setPendingComponent(component);
          setRouteEditMode("select");
          setRouteDraftStart(undefined);
        }} />
        {pendingComponent && <span className="route-draft-status">Place {pendingComponent.title}</span>}
      </div>

      <section className="board-stage" aria-label="洞洞板工作区">
        <Perfboard3DViewport
          board={project.board}
          components={project.components}
          selectedComponentId={selectedComponentId}
          onPlaceComponent={onPlaceComponent}
          onSelectComponent={onSelectComponent}
          onMoveComponent={onMoveComponent}
          onRotateSelected={onRotateSelected}
          onDeleteSelected={onDeleteSelected}
          onMountSelected={onMountSelected}
          onUnmountSelected={onUnmountSelected}
          onUpdateBoard={onUpdateBoard}
          highlightedEndpoints={highlightedEndpoints}
          routing={project.routing}
          transparentBoard={isTransparentBoard}
          routeEditMode={routeEditMode}
          isPlacingComponent={Boolean(pendingComponent)}
          dragMoveModifier={dragMoveModifier}
          onRouteEditPoint={handleRouteEditPoint}
        />
        {selectedComponent && (
          <aside className="component-inspector">
            <h2>元件属性</h2>
            <label>
              <span>名称</span>
              <input
                value={selectedComponent.name}
                onChange={(event) => onUpdateSelected({ name: event.target.value })}
              />
            </label>
            <label>
              <span>参数</span>
              <input
                placeholder="例如 1kΩ / 100uF / TL062IP"
                value={selectedComponent.value}
                onChange={(event) => onUpdateSelected({ value: event.target.value })}
              />
            </label>
            <label>
              <span>脚距</span>
              <input
                type="number"
                min={0}
                max={20}
                value={selectedComponent.leadSpacing}
                onChange={(event) => onUpdateSelected({ leadSpacing: toGridNumber(event.target.value) })}
              />
            </label>
            <label>
              <span>异侧排距</span>
              <input
                type="number"
                min={0}
                max={20}
                value={selectedComponent.rowSpacing}
                onChange={(event) => onUpdateSelected({ rowSpacing: toGridNumber(event.target.value) })}
              />
            </label>
            <label>
              <span>同侧脚距</span>
              <input
                type="number"
                min={1}
                max={10}
                value={selectedComponent.sameSidePitch}
                onChange={(event) => onUpdateSelected({ sameSidePitch: Math.max(1, toGridNumber(event.target.value)) })}
              />
            </label>
            <div className="inspector-meta">
              <span>
                坐标 {selectedComponent.position[0]}, {selectedComponent.position[1]}
              </span>
              <span>{selectedComponent.pinCount ? `${selectedComponent.pinCount} pins` : selectedComponent.kind}</span>
              <span>{selectedComponent.mounted ? "已放置" : "未放置"}</span>
            </div>
          </aside>
        )}
      </section>

      <div className="status-strip">
        <span>{project.name}</span>
        <span>
          {project.board.width} x {project.board.height} grid
        </span>
        <span>{project.files.length} imported files</span>
        <span>{project.components.length} components</span>
      </div>
    </main>
  );

  function toggleRouteEditMode(mode: RouteEditMode) {
    setRouteEditMode((current) => (current === mode ? "select" : mode));
    setRouteDraftStart(undefined);
  }
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

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function toGridNumber(value: string) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return 0;
  }
  return Math.max(0, Math.round(next));
}
