import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Eye, Layers3, MousePointer2, RefreshCw, RotateCw, ShieldCheck, Trash2, Undo2, XCircle } from "lucide-react";
import type { LibraryComponentDefinition } from "../features/project/componentLibrary";
import type { DragMoveModifier, KeyboardShortcuts, PerfboardProject, RoutedNetEndpoint } from "../types/project";
import { Perfboard3DViewport } from "./Perfboard3DViewport";
import type { SelectedPin } from "./Perfboard3DViewport";
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
  shortcuts: KeyboardShortcuts;
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
  dragMoveModifier,
  shortcuts
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
  const [selectedPin, setSelectedPin] = useState<SelectedPin | undefined>();
  const resolvedEndpoints = useMemo(
    () => resolveNetEndpoints(project.importState, project.components),
    [project.importState, project.components]
  );
  const highlightedEndpoints = useMemo(
    () => getHighlightedEndpoints(resolvedEndpoints, project.components, project.selectedNetName, selectedPin),
    [resolvedEndpoints, project.components, project.selectedNetName, selectedPin]
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

      if (event.key === "Escape") {
        setOpenMenu(undefined);
      } else if (isShortcut(event, shortcuts.refresh)) {
        event.preventDefault();
        handleRefreshWorkspaceState();
      } else if (isShortcut(event, shortcuts.select)) {
        setRouteEditMode("select");
        setRouteDraftStart(undefined);
      } else if (isShortcut(event, shortcuts.transparent)) {
        setIsTransparentBoard((current) => !current);
      } else if (isShortcut(event, shortcuts.rotate) && canEditSelected) {
        onRotateSelected();
      } else if (isShortcut(event, shortcuts.mount) && canEditSelected) {
        onMountSelected();
      } else if (isShortcut(event, shortcuts.unmount) && canUnmountSelected) {
        onUnmountSelected();
      } else if (isShortcut(event, shortcuts.delete) && selectedComponent) {
        onDeleteSelected();
      } else if (isShortcut(event, shortcuts.generateComponents) && hasImportedComponents) {
        onCreateComponentsFromImport();
      } else if (isShortcut(event, shortcuts.autoPlace) && hasUnmountedComponents) {
        onOpenAutoPlacement();
      } else if (isShortcut(event, shortcuts.autoRoute) && hasComponents) {
        onAutoRoute();
      } else if (isShortcut(event, shortcuts.runDrc) && hasComponents) {
        onRunDrc();
      } else if (isShortcut(event, shortcuts.clearDrc) && hasDrc) {
        onClearDrc();
      } else if (isShortcut(event, shortcuts.solder)) {
        toggleRouteEditMode("solder");
      } else if (isShortcut(event, shortcuts.jumper)) {
        toggleRouteEditMode("jumper");
      } else if (isShortcut(event, shortcuts.erase)) {
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
    setSelectedPin(undefined);
    onSelectComponent(undefined);
    onClearDrc();
  }

  return (
    <main className="workspace">
      <div className="viewport-toolbar">
        <ToolbarMenu label="查看" openMenu={openMenu} onOpenMenu={setOpenMenu}>
          <MenuButton icon={<RefreshCw size={16} />} shortcut={shortcutLabel(shortcuts.refresh)} onClick={handleRefreshWorkspaceState}>
            刷新
          </MenuButton>
          <MenuButton active={routeEditMode === "select"} icon={<MousePointer2 size={16} />} shortcut={shortcutLabel(shortcuts.select)} onClick={() => { setRouteEditMode("select"); setRouteDraftStart(undefined); }}>
            选择
          </MenuButton>
          <MenuButton active={isTransparentBoard} icon={<Eye size={16} />} shortcut={shortcutLabel(shortcuts.transparent)} onClick={() => setIsTransparentBoard((current) => !current)}>
            透视
          </MenuButton>
        </ToolbarMenu>

        <ToolbarMenu label="元件" openMenu={openMenu} onOpenMenu={setOpenMenu}>
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

        <ToolbarMenu label="自动" openMenu={openMenu} onOpenMenu={setOpenMenu}>
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

        <ToolbarMenu label="布线" openMenu={openMenu} onOpenMenu={setOpenMenu}>
          <MenuButton active={routeEditMode === "solder"} shortcut={shortcutLabel(shortcuts.solder)} onClick={() => toggleRouteEditMode("solder")}>
            走锡
          </MenuButton>
          <MenuButton active={routeEditMode === "jumper"} shortcut={shortcutLabel(shortcuts.jumper)} onClick={() => toggleRouteEditMode("jumper")}>
            跳线
          </MenuButton>
          <MenuButton danger active={routeEditMode === "erase"} shortcut={shortcutLabel(shortcuts.erase)} onClick={() => toggleRouteEditMode("erase")}>
            删线
          </MenuButton>
        </ToolbarMenu>

        <ToolbarMenu label="检查" openMenu={openMenu} onOpenMenu={setOpenMenu}>
          <MenuButton disabled={!hasComponents} icon={<ShieldCheck size={16} />} shortcut={shortcutLabel(shortcuts.runDrc)} onClick={onRunDrc}>
            DRC检查
          </MenuButton>
          <MenuButton disabled={!hasDrc} icon={<XCircle size={16} />} shortcut={shortcutLabel(shortcuts.clearDrc)} onClick={onClearDrc}>
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
          onSelectComponent={(componentId) => {
            onSelectComponent(componentId);
            if (componentId !== selectedPin?.componentId) {
              setSelectedPin(undefined);
            }
          }}
          onSelectPin={setSelectedPin}
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

function getHighlightedEndpoints(
  endpoints: RoutedNetEndpoint[],
  components: PerfboardProject["components"],
  selectedNetName: string | undefined,
  selectedPin: SelectedPin | undefined
) {
  if (selectedPin) {
    const component = components.find((item) => item.id === selectedPin.componentId);
    const selectedEndpoint = component
      ? endpoints.find((endpoint) => endpoint.ref === component.name && endpoint.pin === selectedPin.pin)
      : undefined;
    if (!selectedEndpoint) {
      return [];
    }

    return endpoints.filter((endpoint) => endpoint.net === selectedEndpoint.net);
  }

  const highlighted = new Map<string, RoutedNetEndpoint>();

  endpoints.forEach((endpoint) => {
    if (endpoint.net !== selectedNetName) {
      return;
    }
    highlighted.set(`${endpoint.net}:${endpoint.ref}:${endpoint.pin}:${endpoint.grid[0]},${endpoint.grid[1]}`, endpoint);
  });

  return [...highlighted.values()];
}

function isShortcut(event: KeyboardEvent, shortcut: string | undefined) {
  if (!shortcut || shortcut === "None") {
    return false;
  }

  const parts = shortcut.split("+");
  const expectedKey = parts.at(-1);
  const expectsCtrl = parts.includes("Ctrl");
  const expectsAlt = parts.includes("Alt");
  const expectsShift = parts.includes("Shift");
  const expectsMeta = parts.includes("Meta");
  if (
    event.ctrlKey !== expectsCtrl ||
    event.altKey !== expectsAlt ||
    event.shiftKey !== expectsShift ||
    event.metaKey !== expectsMeta
  ) {
    return false;
  }

  if (!expectedKey) {
    return false;
  }
  if (expectedKey.length === 1) {
    return event.key.toLowerCase() === expectedKey.toLowerCase();
  }
  return normalizeEventKey(event.key) === expectedKey;
}

function shortcutLabel(shortcut: string | undefined) {
  if (!shortcut || shortcut === "None") {
    return undefined;
  }
  return shortcut === "Delete" ? "Del" : shortcut;
}

function normalizeEventKey(key: string) {
  return key === " " ? "Space" : key;
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
