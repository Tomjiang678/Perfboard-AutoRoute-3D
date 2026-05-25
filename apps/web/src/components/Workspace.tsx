import { useState } from "react";
import { Check, Eye, Layers3, MousePointer2, RotateCw, Trash2, Undo2 } from "lucide-react";
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

  const selectedComponent = project?.components.find((component) => component.id === selectedComponentId);
  const [isTransparentBoard, setIsTransparentBoard] = useState(false);
  const [routeEditMode, setRouteEditMode] = useState<RouteEditMode>("select");
  const [routeDraftStart, setRouteDraftStart] = useState<[number, number] | undefined>();
  const [pendingComponent, setPendingComponent] = useState<LibraryComponentDefinition | undefined>();
  const highlightedEndpoints = resolveNetEndpoints(project.importState, project.components).filter(
    (endpoint) => endpoint.net === project.selectedNetName
  );

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

  return (
    <main className="workspace">
      <div className="viewport-toolbar">
        <button className={routeEditMode === "select" ? "icon-text-button active" : "icon-text-button"} type="button" onClick={() => { setRouteEditMode("select"); setRouteDraftStart(undefined); }}>
          <MousePointer2 size={16} />
          选择
        </button>
        <button
          className={isTransparentBoard ? "icon-text-button active" : "icon-text-button"}
          type="button"
          onClick={() => setIsTransparentBoard((current) => !current)}
        >
          <Eye size={16} />
          透视
        </button>
        <button className="icon-text-button" type="button" disabled={!selectedComponent || selectedComponent.mounted} onClick={onRotateSelected}>
          <RotateCw size={16} />
          旋转
        </button>
        <button className="icon-text-button" type="button" disabled={!selectedComponent || selectedComponent.mounted} onClick={onMountSelected}>
          <Check size={16} />
          放置
        </button>
        <button className="icon-text-button" type="button" disabled={!selectedComponent || !selectedComponent.mounted} onClick={onUnmountSelected}>
          <Undo2 size={16} />
          移除
        </button>
        <button className="icon-text-button danger" type="button" disabled={!selectedComponent} onClick={onDeleteSelected}>
          <Trash2 size={16} />
          删除
        </button>
        <button
          className="icon-text-button"
          type="button"
          disabled={project.importState.components.length === 0}
          onClick={onCreateComponentsFromImport}
        >
          生成元件
        </button>
        <button
          className="icon-text-button"
          type="button"
          disabled={project.components.filter((component) => !component.mounted).length === 0}
          onClick={onOpenAutoPlacement}
        >
          自动放置
        </button>
        <button
          className="icon-text-button"
          type="button"
          disabled={project.components.length === 0}
          onClick={onAutoRoute}
        >
          自动布线
        </button>
        <button className={routeEditMode === "solder" ? "icon-text-button active" : "icon-text-button"} type="button" onClick={() => toggleRouteEditMode("solder")}>
          走锡
        </button>
        <button className={routeEditMode === "jumper" ? "icon-text-button active" : "icon-text-button"} type="button" onClick={() => toggleRouteEditMode("jumper")}>
          跳线
        </button>
        <button className={routeEditMode === "erase" ? "icon-text-button danger active" : "icon-text-button danger"} type="button" onClick={() => toggleRouteEditMode("erase")}>
          删线
        </button>
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

function toGridNumber(value: string) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return 0;
  }
  return Math.max(0, Math.round(next));
}


