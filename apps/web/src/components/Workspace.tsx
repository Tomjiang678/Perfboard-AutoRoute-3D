import { Layers3 } from "lucide-react";
import type { LibraryComponentDefinition } from "../features/project/componentLibrary";
import type { BoardSize, DragMoveModifier, PerfboardProject, RoutedNetEndpoint, ThemeMode } from "../types/project";
import { getBoardModel } from "../features/board/factory";
import { Perfboard3DViewport, type SelectedPin } from "./Perfboard3DViewport";
import type { RouteEditMode } from "./WorkspaceToolbar";

interface WorkspaceProps {
  project?: PerfboardProject;
  selectedComponentId?: string;
  onNewProject: () => void;
  onPlaceComponent: (component: LibraryComponentDefinition, position: [number, number]) => void;
  onSelectComponent: (componentId: string | undefined) => void;
  onSelectPin: (pin: SelectedPin | undefined) => void;
  onMoveComponent: (componentId: string, position: [number, number]) => void;
  onMovePin: (componentId: string, pin: number, position: [number, number]) => void;
  onUpdateBoard: (board: BoardSize) => void;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;
  onMountSelected: () => void;
  onUnmountSelected: () => void;
  onUpdateSelected: (patch: {
    name?: string;
    value?: string;
    leadSpacing?: number;
    rowSpacing?: number;
    sameSidePitch?: number;
  }) => void;
  highlightedEndpoints: RoutedNetEndpoint[];
  routeEditMode: RouteEditMode;
  isPlacingComponent: boolean;
  transparentBoard: boolean;
  theme: ThemeMode;
  onRouteEditPoint: (point: [number, number]) => void;
  dragMoveModifier: DragMoveModifier;
}

export function Workspace({
  project,
  selectedComponentId,
  onNewProject,
  onPlaceComponent,
  onSelectComponent,
  onSelectPin,
  onMoveComponent,
  onMovePin,
  onUpdateBoard,
  onRotateSelected,
  onDeleteSelected,
  onMountSelected,
  onUnmountSelected,
  onUpdateSelected,
  highlightedEndpoints,
  routeEditMode,
  isPlacingComponent,
  transparentBoard,
  theme,
  onRouteEditPoint,
  dragMoveModifier
}: WorkspaceProps) {
  if (!project) {
    return (
      <main className="empty-workspace">
        <div className="empty-panel">
          <Layers3 size={36} />
          <h1>PerfBoard AutoRoute 3D</h1>
          <p>创建工程后导入 KiCad 网表（.net），随后进入洞洞板布局与布线流程。</p>
          <button className="tool-button primary" type="button" onClick={onNewProject}>
            新建工程
          </button>
        </div>
      </main>
    );
  }

  const selectedComponent = project.components.find((component) => component.id === selectedComponentId);
  const boardModel = getBoardModel(project.board);

  return (
    <main className="workspace">
      <section className="board-stage" aria-label="电路板工作区">
        <Perfboard3DViewport
          board={project.board}
          components={project.components}
          selectedComponentId={selectedComponentId}
          onPlaceComponent={onPlaceComponent}
          onSelectComponent={onSelectComponent}
          onSelectPin={onSelectPin}
          onMoveComponent={onMoveComponent}
          onMovePin={onMovePin}
          onRotateSelected={onRotateSelected}
          onDeleteSelected={onDeleteSelected}
          onMountSelected={onMountSelected}
          onUnmountSelected={onUnmountSelected}
          onUpdateBoard={onUpdateBoard}
          highlightedEndpoints={highlightedEndpoints}
          routing={project.routing}
          transparentBoard={transparentBoard}
          theme={theme}
          routeEditMode={routeEditMode}
          isPlacingComponent={isPlacingComponent}
          dragMoveModifier={dragMoveModifier}
          onRouteEditPoint={onRouteEditPoint}
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
              <span>
                {selectedComponent.kind === "pin_header" && selectedComponent.pinHeaderRows && selectedComponent.pinHeaderColumns
                  ? `${selectedComponent.pinHeaderRows}×${selectedComponent.pinHeaderColumns} 排针 / ${selectedComponent.pinCount} pins`
                  : selectedComponent.pinCount ? `${selectedComponent.pinCount} pins` : selectedComponent.kind}
              </span>
              <span>{selectedComponent.mounted ? "已放置" : "未放置"}</span>
            </div>
            {selectedComponent.isFallback && (
              <div className="fallback-component-note">
                <strong>库中无对应封装</strong>
                <span>{selectedComponent.fallbackReason ?? `已将 ${selectedComponent.name} 生成为占位排针。`}</span>
                {selectedComponent.fallbackPinMap && (
                  <small>临时脚位：{formatFallbackPinMap(selectedComponent.fallbackPinMap)}</small>
                )}
              </div>
            )}
          </aside>
        )}
      </section>

      <div className="status-strip">
        <span>{project.name}</span>
        <span>
          {boardModel.getDisplayName()}
        </span>
        <span>{project.files.length} imported files</span>
        <span>{project.components.length} components</span>
      </div>
    </main>
  );
}

function toGridNumber(value: string) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return 0;
  }
  return Math.max(0, Math.round(next));
}

function formatFallbackPinMap(pinMap: Record<string, number>) {
  return Object.entries(pinMap)
    .sort(([, left], [, right]) => left - right)
    .map(([logical, physical]) => `${logical}->${physical}`)
    .join(", ");
}
