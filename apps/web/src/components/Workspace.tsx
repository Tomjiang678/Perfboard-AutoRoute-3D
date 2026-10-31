import { Layers3 } from "lucide-react";
import type { LibraryComponentDefinition } from "../features/project/componentLibrary.ts";
import type { AdapterSpec, BoardSize, DragMoveModifier, PerfboardProject, RoutedNetEndpoint, ThemeMode } from "../types/project.ts";
import { getBoardModel } from "../features/board/factory.ts";
import { normalizeAdapter } from "../features/project/adapter.ts";
import { spacingLimits } from "../features/project/componentTraits.ts";
import { PLACEHOLDER_NOTE } from "../features/import/componentMapping.ts";
import { Perfboard3DViewport, type SelectedPin } from "./Perfboard3DViewport.tsx";
import type { RouteEditMode } from "./WorkspaceToolbar.tsx";

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
  onDetachAdapter: () => void;
  onMountSelected: () => void;
  onUnmountSelected: () => void;
  onUpdateSelected: (patch: {
    name?: string;
    value?: string;
    leadSpacing?: number;
    rowSpacing?: number;
    sameSidePitch?: number;
    adapter?: AdapterSpec;
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
  onDetachAdapter,
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
          <h1>ProtoRoute 3D</h1>
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
          onDetachAdapter={onDetachAdapter}
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
        {selectedComponent && (() => {
          const limits = spacingLimits(selectedComponent.kind);
          return (
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
              {limits.leadSpacing.min !== limits.leadSpacing.max && (
                <label>
                  <span>脚距（{limits.leadSpacing.min}–{limits.leadSpacing.max}）</span>
                  <input
                    type="number"
                    min={limits.leadSpacing.min}
                    max={limits.leadSpacing.max}
                    value={selectedComponent.leadSpacing}
                    onChange={(event) => onUpdateSelected({ leadSpacing: toGridNumber(event.target.value) })}
                  />
                </label>
              )}
              {limits.rowSpacing.min !== limits.rowSpacing.max && (
                <label>
                  <span>异侧排距（{limits.rowSpacing.min}–{limits.rowSpacing.max}）</span>
                  <input
                    type="number"
                    min={limits.rowSpacing.min}
                    max={limits.rowSpacing.max}
                    value={selectedComponent.rowSpacing}
                    onChange={(event) => onUpdateSelected({ rowSpacing: toGridNumber(event.target.value) })}
                  />
                </label>
              )}
              {limits.sameSidePitch.min !== limits.sameSidePitch.max && (
                <label>
                  <span>同侧脚距（{limits.sameSidePitch.min}–{limits.sameSidePitch.max}）</span>
                  <input
                    type="number"
                    min={limits.sameSidePitch.min}
                    max={limits.sameSidePitch.max}
                    value={selectedComponent.sameSidePitch}
                    onChange={(event) => onUpdateSelected({ sameSidePitch: Math.max(1, toGridNumber(event.target.value)) })}
                  />
                </label>
              )}
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
            {selectedComponent.adapter && (() => {
              const adapter = selectedComponent.adapter;
              const locked = selectedComponent.mounted;
              const chipPins = selectedComponent.pinOffsets.length;
              const chipRowSpacing = Math.max(1, selectedComponent.rowSpacing || 1);
              const minWidth = Math.max(adapter.rowSpacing + 1, chipRowSpacing + 1);
              const minHeight = Math.ceil(chipPins / 2);
              const patchAdapter = (change: Partial<AdapterSpec>) =>
                onUpdateSelected({
                  adapter: normalizeAdapter(
                    { ...adapter, ...change },
                    { pinCount: chipPins, rowSpacing: chipRowSpacing }
                  ).adapter
                });
              return (
                <div className={`adapter-inspector${locked ? " is-locked" : ""}`}>
                  <h3>转接板{locked && <span className="adapter-lock-note">已放置，锁定</span>}</h3>
                  <p className="adapter-pin-count">排针 {chipPins} 脚</p>
                  <label>
                    <span>两列间距（≥{chipRowSpacing}）</span>
                    <input
                      type="number"
                      min={chipRowSpacing}
                      max={63}
                      disabled={locked}
                      value={adapter.rowSpacing}
                      onChange={(event) => patchAdapter({ rowSpacing: Number(event.target.value) })}
                    />
                  </label>
                  <div className="adapter-inspector-size">
                    <label>
                      <span>宽（≥{minWidth}）</span>
                      <input
                        type="number"
                        min={minWidth}
                        max={64}
                        disabled={locked}
                        value={adapter.width}
                        onChange={(event) => patchAdapter({ width: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>高（≥{minHeight}）</span>
                      <input
                        type="number"
                        min={minHeight}
                        max={64}
                        disabled={locked}
                        value={adapter.height}
                        onChange={(event) => patchAdapter({ height: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  <button className="icon-text-button" type="button" disabled={locked} onClick={onDetachAdapter}>
                    {locked ? "放置后不能移除转接板" : "移除转接板"}
                  </button>
                </div>
              );
            })()}
            {selectedComponent.isFallback && (
              <div className="fallback-component-note">
                <strong>库中无对应封装</strong>
                <span>{selectedComponent.fallbackReason ?? `已将 ${selectedComponent.name} ${PLACEHOLDER_NOTE}。`}</span>
                {selectedComponent.fallbackPinMap && (
                  <small>临时脚位：{formatFallbackPinMap(selectedComponent.fallbackPinMap)}</small>
                )}
              </div>
            )}
            </aside>
          );
        })()}
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
