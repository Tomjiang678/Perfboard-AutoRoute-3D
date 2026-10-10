import { useEffect, useMemo, useRef, useState } from "react";
import { HeaderBar } from "./components/HeaderBar.tsx";
import { NewProjectDialog } from "./components/NewProjectDialog.tsx";
import { ProjectSidebar } from "./components/ProjectSidebar.tsx";
import { Workspace } from "./components/Workspace.tsx";
import { AutoPlacementDialog } from "./components/AutoPlacementDialog.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import {
  buildPinOffsetsForComponent,
  type LibraryComponentDefinition
} from "./features/project/componentLibrary.ts";
import { mergeImportState, parseImportFiles, removeFileData } from "./features/import/kicadNetlistParser.ts";
import { createPlacedComponentsFromParsed } from "./features/import/componentMapping.ts";
import { useAutoPlacement } from "./features/layout/useAutoPlacement.ts";
import { useAiConstraintAssistant } from "./features/ai/useAiConstraintAssistant.ts";
import { projectConstraints, withMigratedConstraints } from "./features/constraints/model.ts";
import {
  applyRoutingConstraintReport,
  buildPowerRailTraces
} from "./features/constraints/execution.ts";
import { bendComponentPin, pinGridPosition } from "./features/layout/manualPlacement.ts";
import { resolveNetEndpoints } from "./features/import/netEndpointResolver.ts";
import { autoRouteBoard, validateRoutingResult, MANUAL_NET_NAME } from "./features/routing/autoRouter.ts";
import { stripDrcWarnings } from "./features/routing/drcWarnings.ts";
import { expandOrthogonalPath } from "./features/routing/routingGeometry.ts";
import { removeRoutesToComponent } from "./features/routing/removeComponentRoutes.ts";
import { createProject } from "./features/project/projectFactory.ts";
import { invalidateDrcIfInputsChanged } from "./features/project/projectTransitions.ts";
import { getBoardModel, normalizeBoardDefinition } from "./features/board/factory.ts";
import { componentPinHoles } from "./features/board/placement.ts";
import { clampSpacing } from "./features/project/componentTraits.ts";
import type { BoardSize, DragMoveModifier, ImportState, KeyboardShortcuts, PerfboardProject, PlacedComponent, RoutedNetEndpoint, ThemeMode } from "./types/project.ts";
import type { SelectedPin } from "./components/Perfboard3DViewport.tsx";
import type { RouteEditMode, WorkspaceToolbarProps } from "./components/WorkspaceToolbar.tsx";

const STORAGE_KEY = "perfboard-autoroute-project";
const SETTINGS_KEY = "perfboard-autoroute-settings";
const MAX_UNDO_HISTORY = 50;

interface AppSettings {
  dragMoveModifier: DragMoveModifier;
  shortcuts: KeyboardShortcuts;
  theme: ThemeMode;
}

const defaultShortcuts: KeyboardShortcuts = {
  refresh: "F5",
  select: "V",
  transparent: "T",
  rotate: "R",
  mount: "M",
  unmount: "U",
  delete: "Delete",
  generateComponents: "G",
  autoPlace: "P",
  autoRoute: "A",
  runDrc: "D",
  clearDrc: "C",
  solder: "S",
  jumper: "J",
  erase: "E"
};

const defaultSettings: AppSettings = {
  dragMoveModifier: "shift",
  shortcuts: defaultShortcuts,
  theme: "light"
};

export function App() {
  const [project, setProject] = useState<PerfboardProject | undefined>();
  const projectRef = useRef<PerfboardProject | undefined>(undefined);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string | undefined>();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [undoCount, setUndoCount] = useState(0);
  const undoStackRef = useRef<PerfboardProject[]>([]);
  const [isTransparentBoard, setIsTransparentBoard] = useState(false);
  const [routeEditMode, setRouteEditMode] = useState<RouteEditMode>("select");
  const [routeDraftStart, setRouteDraftStart] = useState<[number, number] | undefined>();
  const [pendingComponent, setPendingComponent] = useState<LibraryComponentDefinition | undefined>();
  const [selectedPin, setSelectedPin] = useState<SelectedPin | undefined>();
  const [toolbarOpenMenu, setToolbarOpenMenu] = useState<string | undefined>();

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      replaceProject(withMigratedConstraints(JSON.parse(saved) as PerfboardProject));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    const savedSettings = window.localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings) as Partial<AppSettings>;
        setSettings({
          ...defaultSettings,
          ...parsed,
          shortcuts: { ...defaultShortcuts, ...parsed.shortcuts }
        });
      } catch {
        window.localStorage.removeItem(SETTINGS_KEY);
      }
    }
  }, []);

  useEffect(() => window.perfboardDesktop?.projectFiles.onOpen((file) => {
    if (file.content !== undefined) {
      handleOpenProjectText(file.content);
    } else {
      window.alert(`无法打开工程文件：${file.filePath ?? ""}\n${file.message ?? "读取失败"}`);
    }
  }), []);

  useEffect(() => {
    if (!project) {
      return;
    }
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [project]);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme;
  }, [settings.theme]);

  function commitProject(updater: (current: PerfboardProject) => PerfboardProject) {
    const current = projectRef.current;
    if (!current) return;

    const updated = updater(current);
    if (updated === current) return;
    const next = invalidateDrcIfInputsChanged(current, updated);

    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_UNDO_HISTORY - 1)), current];
    setUndoCount(undoStackRef.current.length);
    replaceProject(next);
  }

  function replaceProject(next: PerfboardProject | undefined) {
    projectRef.current = next;
    setProject(next);
  }

  function updateComponent(
    componentId: string,
    transform: (component: PlacedComponent) => PlacedComponent | undefined
  ) {
    commitProject((current) => {
      const component = current.components.find((item) => item.id === componentId);
      const updated = component && transform(component);
      if (!updated || updated === component) return current;
      return { ...current, components: current.components.map((item) => item.id === componentId ? updated : item) };
    });
  }

  const aiAssistant = useAiConstraintAssistant({ project, commitProject });
  const autoPlacement = useAutoPlacement({ project, commitProject });

  const selectedComponent = project?.components.find((component) => component.id === selectedComponentId);
  const boardModel = project ? getBoardModel(project.board) : undefined;
  const canEditSelected = Boolean(selectedComponent && !selectedComponent.mounted);
  const canUnmountSelected = Boolean(selectedComponent?.mounted);
  const hasComponents = (project?.components.length ?? 0) > 0;
  const hasImportedComponents = (project?.importState.components.length ?? 0) > 0;
  const hasDrc = Boolean(project?.routing.drc);
  const resolvedEndpoints = useMemo(
    () => (project ? resolveNetEndpoints(project.importState, project.components) : []),
    [project?.importState, project?.components]
  );
  const highlightedEndpoints = useMemo(
    () => getHighlightedEndpoints(resolvedEndpoints, project?.components ?? [], project?.selectedNetName, selectedPin),
    [resolvedEndpoints, project?.components, project?.selectedNetName, selectedPin]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === "Escape") {
        setToolbarOpenMenu(undefined);
        return;
      }
      const matched = keyboardCommands.find((candidate) => candidate.enabled && isShortcut(event, candidate.shortcut));
      if (!matched) {
        return;
      }
      event.preventDefault();
      matched.run();
    }

    const keyboardCommands = [
      command(settings.shortcuts.refresh, true, handleRefreshWorkspaceState),
      command(settings.shortcuts.select, true, handleSelectMode),
      command(settings.shortcuts.transparent, true, () => setIsTransparentBoard((current) => !current)),
      command(settings.shortcuts.rotate, canEditSelected, handleRotateSelected),
      command(settings.shortcuts.mount, canEditSelected, handleMountSelected),
      command(settings.shortcuts.unmount, canUnmountSelected, handleUnmountSelected),
      command(settings.shortcuts.delete, Boolean(selectedComponent), handleDeleteSelected),
      command(settings.shortcuts.generateComponents, hasImportedComponents, handleCreateComponentsFromImport),
      command(settings.shortcuts.autoPlace, hasComponents, () => autoPlacement.open()),
      command(settings.shortcuts.autoRoute, hasComponents, handleAutoRoute),
      command(settings.shortcuts.runDrc, hasComponents, handleRunDrc),
      command(settings.shortcuts.clearDrc, hasDrc, handleClearDrc),
      command(settings.shortcuts.solder, Boolean(boardModel?.capabilities.routePrimitives.has("bottom_trace")), () => toggleRouteEditMode("solder")),
      command(settings.shortcuts.jumper, true, () => toggleRouteEditMode("jumper")),
      command(settings.shortcuts.erase, true, () => toggleRouteEditMode("erase"))
    ];

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest(".toolbar-menu")) {
        return;
      }
      setToolbarOpenMenu(undefined);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function toggleRouteEditMode(mode: RouteEditMode) {
    setRouteEditMode((current) => (current === mode ? "select" : mode));
    setRouteDraftStart(undefined);
  }

  function handleSelectMode() {
    setRouteEditMode("select");
    setRouteDraftStart(undefined);
  }

  function handlePickComponent(component: LibraryComponentDefinition) {
    setPendingComponent(component);
    setRouteEditMode("select");
    setRouteDraftStart(undefined);
  }

  function handleToggleTheme() {
    setSettings((current) => ({ ...current, theme: current.theme === "dark" ? "light" : "dark" }));
  }

  function handleRouteEditPoint(point: [number, number]) {
    if (pendingComponent) {
      // Keep the picked component pending when the spot is invalid so the
      // user can click another hole instead of the pick silently vanishing.
      if (handlePlaceComponent(pendingComponent, point)) {
        setPendingComponent(undefined);
      }
      return;
    }
    if (routeEditMode === "select") {
      return;
    }
    if (routeEditMode === "erase") {
      handleRemoveRouteAt(point);
      setRouteDraftStart(undefined);
      return;
    }
    if (!routeDraftStart) {
      setRouteDraftStart(point);
      return;
    }
    if (routeEditMode === "solder") {
      handleAddBottomTrace(routeDraftStart, point);
    } else {
      handleAddJumper(routeDraftStart, point);
    }
    setRouteDraftStart(undefined);
  }

  function handleRefreshWorkspaceState() {
    setRouteEditMode("select");
    setRouteDraftStart(undefined);
    setPendingComponent(undefined);
    setToolbarOpenMenu(undefined);
    setSelectedPin(undefined);
    setSelectedComponentId(undefined);
    handleClearDrc();
  }

  const toolbar: WorkspaceToolbarProps | undefined = project ? {
    canSolder: Boolean(boardModel?.capabilities.routePrimitives.has("bottom_trace")),
    selectedComponent,
    canEditSelected,
    canUnmountSelected,
    hasComponents,
    hasImportedComponents,
    hasDrc,
    shortcuts: settings.shortcuts,
    openMenu: toolbarOpenMenu,
    onOpenMenu: setToolbarOpenMenu,
    routeEditMode,
    routeDraftStart,
    pendingComponent,
    isTransparentBoard,
    isDarkMode: settings.theme === "dark",
    onToggleDarkMode: handleToggleTheme,
    onToggleRouteEditMode: toggleRouteEditMode,
    onSelectMode: handleSelectMode,
    onRefresh: handleRefreshWorkspaceState,
    onToggleTransparent: () => setIsTransparentBoard((current) => !current),
    onRotateSelected: handleRotateSelected,
    onMountSelected: handleMountSelected,
    onUnmountSelected: handleUnmountSelected,
    onDeleteSelected: handleDeleteSelected,
    onCreateComponentsFromImport: handleCreateComponentsFromImport,
    onOpenAutoPlacement: autoPlacement.open,
    onAutoRoute: handleAutoRoute,
    onRunDrc: handleRunDrc,
    onClearDrc: handleClearDrc,
    onPickComponent: handlePickComponent
  } : undefined;

  function clearUndoHistory() {
    undoStackRef.current = [];
    setUndoCount(0);
  }

  function handleUndo() {
    const previous = undoStackRef.current.at(-1);
    if (!previous) {
      return;
    }

    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setUndoCount(undoStackRef.current.length);
    replaceProject(previous);
    setSelectedComponentId(undefined);
  }

  function handleExportProject() {
    if (!project) {
      return;
    }
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = project.name.trim().replace(/[^A-Za-z0-9_-]+/g, "-") || "perfboard-project";
    link.href = url;
    link.download = `${safeName}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleOpenProject(file: File) {
    try {
      handleOpenProjectText(await file.text());
    } catch {
      window.alert("无法打开工程文件，请确认是导出的 JSON 工程。");
    }
  }

  function handleOpenProjectText(text: string) {
    try {
      const next = withMigratedConstraints(JSON.parse(text) as PerfboardProject);
      replaceProject(next);
      setSelectedComponentId(undefined);
      setSelectedPin(undefined);
      setPendingComponent(undefined);
      clearUndoHistory();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      window.alert("无法打开工程文件，请确认是导出的 JSON 工程。");
    }
  }

  function handleCreateProject(name: string, board: BoardSize) {
    replaceProject(createProject(name, board));
    setSelectedComponentId(undefined);
    setSelectedPin(undefined);
    setPendingComponent(undefined);
    clearUndoHistory();
    setIsCreatingProject(false);
  }

  async function handleImportFiles(files: File[]) {
    let parsed;
    try {
      parsed = await parseImportFiles(files);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      window.alert(`网表导入失败：${message}`);
      console.error("netlist import failed", error);
      return;
    }
    const fileNames = files.map((file) => file.name);

    commitProject((current) => {
      const importState = mergeImportState(removeFileData(current.importState, fileNames), parsed);
      const newFiles = [
        ...current.files.filter((file) => !fileNames.includes(file.name)),
        ...files.map((file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          importedAt: new Date().toISOString()
        }))
      ];
      return {
        ...current,
        files: newFiles,
        importState
      };
    });
  }

  function handleRemoveImportedFile(fileId: string) {
    commitProject((current) => {
      const file = current.files.find((item) => item.id === fileId);
      if (!file) {
        return current;
      }

      const files = current.files.filter((item) => item.id !== fileId);
      const importState: ImportState = {
        components: current.importState.components.filter((component) => component.sourceFile !== file.name),
        nets: current.importState.nets
          .map((net) => ({
            ...net,
            nodes: net.nodes.filter((node) => node.sourceFile !== file.name)
          }))
          .filter((net) => net.nodes.length > 0),
        warnings: current.importState.warnings.filter((warning) => warning.fileName !== file.name),
        pinInfo: current.importState.pinInfo
      };

      return {
        ...current,
        files,
        importState,
        selectedNetName: undefined
      };
    });
  }

  function handlePlaceComponent(component: LibraryComponentDefinition, position: [number, number]) {
    const componentId = crypto.randomUUID();
    if (!project) return false;
    const placedComponent: PlacedComponent = {
      id: componentId,
      kind: component.kind,
      label: component.label,
      name: makeDefaultComponentName(component.label, project.components.length + 1),
      value: "",
      pinCount: component.pinCount,
      leadSpacing: component.leadSpacing,
      rowSpacing: component.rowSpacing,
      sameSidePitch: component.sameSidePitch,
      pinHeaderRows: component.pinHeaderRows,
      pinHeaderColumns: component.pinHeaderColumns,
      pinOffsets: component.pinOffsets,
      position,
      rotation: 0,
      mounted: false
    };
    // Manual placement is an editing action: keep the part visible even when
    // its pins do not fit the board rules. DRC remains responsible for
    // reporting invalid geometry and electrical conflicts.
    setSelectedComponentId(componentId);
    commitProject((current) => ({
      ...current,
      components: [...current.components, placedComponent]
    }));
    return true;
  }

  function handleSelectComponent(componentId: string | undefined) {
    setSelectedComponentId(componentId);
    setSelectedPin((current) => (current && current.componentId !== componentId ? undefined : current));
  }

  function handleMoveComponent(componentId: string, position: [number, number]) {
    updateComponent(componentId, (component) => ({ ...component, position }));
  }

  function handleUpdateBoard(board: BoardSize) {
    commitProject((current) => {
      const normalizedBoard = normalizeBoardDefinition(board);
      return {
        ...current,
        board: normalizedBoard,
      };
    });
  }

  function handleSelectNet(netName: string | undefined) {
    const current = projectRef.current;
    if (!current) return;
    replaceProject({
      ...current,
      selectedNetName: current.selectedNetName === netName ? undefined : netName
    });
  }

  function handleMovePin(componentId: string, pin: number, position: [number, number]) {
    updateComponent(componentId, (component) => bendComponentPin(component, pin, position));
  }

  function handleCreateComponentsFromImport() {
    commitProject((current) => {
      const importedComponents = createPlacedComponentsFromParsed(
        current.importState,
        current.components,
        current.board.width
      );

      if (importedComponents.length === 0) {
        return current;
      }

      return {
        ...current,
        components: [...current.components, ...importedComponents]
      };
    });
  }

  function handleAutoRoute() {
    commitProject((current) => {
      const endpoints = resolveNetEndpoints(current.importState, current.components);
      const allConstraints = projectConstraints(current);
      const extraWarnings: string[] = [];
      let constraints = allConstraints;
      if ((current.board.kind ?? "perfboard") === "breadboard") {
        const railConstraints = allConstraints.filter((constraint) => constraint.kind === "power_rail");
        if (railConstraints.length > 0) {
          extraWarnings.push(...railConstraints.map((constraint) => `面包板不支持电源母线约束：${constraint.net}（已忽略）。`));
          constraints = allConstraints.filter((constraint) => constraint.kind !== "power_rail");
        }
      }
      const rails = buildPowerRailTraces(constraints, endpoints, current.components);
      if (rails.errors.length > 0) {
        return {
          ...current,
          routing: {
            ...current.routing,
            warnings: [...current.routing.warnings, ...rails.errors]
          }
        };
      }
      const fixedTraces = [
        ...rails.traces,
        ...current.routing.traces.filter((trace) => trace.locked && !trace.id.startsWith("constraint-rail-"))
      ];
      const fixedJumpers = current.routing.jumpers.filter((jumper) => jumper.locked);
      const routing = autoRouteBoard(current.board, endpoints, current.components, fixedTraces, constraints, undefined, fixedJumpers);
      const reported = applyRoutingConstraintReport(routing, constraints);
      return {
        ...current,
        routing: { ...reported, warnings: [...reported.warnings, ...extraWarnings] }
      };
    });
  }

  function handleRunDrc() {
    commitProject((current) => {
      const endpoints = resolveNetEndpoints(current.importState, current.components);
      const validation = validateRoutingResult(current.board, current.routing, endpoints, current.components);
      const failedNets = new Set(current.routing.failedNets);
      validation.failedNetDetails.forEach((detail) => failedNets.add(detail.net));
      validation.drc.errors.forEach((issue) => {
        if (issue.net) {
          failedNets.add(issue.net);
        }
        if (issue.expectedNet) {
          failedNets.add(issue.expectedNet);
        }
      });

      return {
        ...current,
        routing: {
          ...current.routing,
          drc: validation.drc,
          diagnostics: { failedNetDetails: validation.failedNetDetails },
          warnings: stripDrcWarnings(current.routing.warnings),
          failedNets: [...failedNets]
        }
      };
    });
  }

  function handleClearDrc() {
    commitProject((current) => ({
      ...current,
      routing: {
        ...current.routing,
        drc: undefined,
        diagnostics: undefined,
        warnings: stripDrcWarnings(current.routing.warnings)
      }
    }));
  }

  function handleAddBottomTrace(from: [number, number], to: [number, number]) {
    commitProject((current) => {
      if (!getBoardModel(current.board).capabilities.routePrimitives.has("bottom_trace")) {
        return current;
      }
      const net = current.selectedNetName ?? MANUAL_NET_NAME;
      return {
        ...current,
        routing: {
          ...current.routing,
          traces: [
            ...current.routing.traces,
            {
              id: crypto.randomUUID(),
              net,
              points: createManualBottomPath(from, to),
              layer: "bottom",
              locked: true
            }
          ]
        }
      };
    });
  }

  function handleAddJumper(from: [number, number], to: [number, number]) {
    commitProject((current) => {
      const net = current.selectedNetName ?? MANUAL_NET_NAME;
      const nextFrom = relocateJumperEndpoint(current, from);
      const nextTo = relocateJumperEndpoint(current, to);
      if (!nextFrom || !nextTo || samePoint(nextFrom, nextTo)) {
        return current;
      }
      return {
        ...current,
        routing: {
          ...current.routing,
          jumpers: [
            ...current.routing.jumpers,
            {
              id: crypto.randomUUID(),
              net,
              from: nextFrom,
              to: nextTo,
              layer: "jumper",
              locked: true
            }
          ]
        }
      };
    });
  }

  function handleRemoveRouteAt(point: [number, number]) {
    commitProject((current) => {
      const traceRemoval = removeBottomTraceSegmentAt(current.routing.traces, point);
      const nextJumpers = current.routing.jumpers.filter((jumper) => !samePoint(jumper.from, point) && !samePoint(jumper.to, point));
      if (!traceRemoval.removed && nextJumpers.length === current.routing.jumpers.length) {
        return current;
      }

      return {
        ...current,
        routing: {
          ...current.routing,
          traces: traceRemoval.traces,
          jumpers: nextJumpers
        }
      };
    });
  }

  function handleRotateSelected() {
    if (selectedComponentId) updateComponent(selectedComponentId, (component) => ({ ...component, rotation: component.rotation + Math.PI / 2 }));
  }

  function handleDeleteSelected() {
    if (!selectedComponentId) {
      return;
    }

    commitProject((current) => {
      const selected = current.components.find((component) => component.id === selectedComponentId);
      if (!selected) {
        return current;
      }
      const deletedPinCells = selected.pinOffsets.map((_, index) => pinGridPosition(selected, index + 1));
      const remainingPinCells = current.components
        .filter((component) => component.id !== selectedComponentId)
        .flatMap((component) => component.pinOffsets.map((_, index) => pinGridPosition(component, index + 1)));
      return {
        ...current,
        components: current.components.filter((component) => component.id !== selectedComponentId),
        routing: removeRoutesToComponent(current.routing, deletedPinCells, remainingPinCells)
      };
    });
    setSelectedComponentId(undefined);
  }

  function handleMountSelected() {
    if (selectedComponentId) updateComponent(selectedComponentId, (component) => ({ ...component, mounted: true }));
  }

  function handleUnmountSelected() {
    if (selectedComponentId) updateComponent(selectedComponentId, (component) => ({ ...component, mounted: false }));
  }

  function handleUpdateSelected(patch: {
    name?: string;
    value?: string;
    leadSpacing?: number;
    rowSpacing?: number;
    sameSidePitch?: number;
  }) {
    if (!selectedComponentId) return;
    commitProject((current) => {
      const component = current.components.find((item) => item.id === selectedComponentId);
      if (!component) return current;
      const next = {
        ...component,
        ...patch,
        leadSpacing: patch.leadSpacing !== undefined ? clampSpacing(component.kind, patch.leadSpacing, "leadSpacing") : component.leadSpacing,
        rowSpacing: patch.rowSpacing !== undefined ? clampSpacing(component.kind, patch.rowSpacing, "rowSpacing") : component.rowSpacing,
        sameSidePitch: patch.sameSidePitch !== undefined ? clampSpacing(component.kind, patch.sameSidePitch, "sameSidePitch") : component.sameSidePitch
      };
      const updated = { ...next, pinOffsets: buildPinOffsetsForComponent(next) };
      return { ...current, components: current.components.map((item) => item.id === component.id ? updated : item) };
    });
  }

  return (
    <div className="app-shell">
      <HeaderBar
        projectName={project?.name}
        theme={settings.theme}
        onToggleTheme={handleToggleTheme}
        onNewProject={() => setIsCreatingProject(true)}
        onSaveProject={handleExportProject}
        onOpenProject={handleOpenProject}
        onUndo={handleUndo}
        canUndo={undoCount > 0}
        onOpenSettings={() => setIsSettingsOpen(true)}
        toolbar={toolbar}
      />
      <div className={project ? "main-layout with-sidebar" : "main-layout"}>
        {project && <ProjectSidebar project={project} aiAssistant={aiAssistant} onImportFiles={handleImportFiles} onRemoveImportedFile={handleRemoveImportedFile} onSelectNet={handleSelectNet} />}
        <Workspace
          project={project}
          selectedComponentId={selectedComponentId}
          onNewProject={() => setIsCreatingProject(true)}
          onPlaceComponent={handlePlaceComponent}
          onSelectComponent={handleSelectComponent}
          onSelectPin={setSelectedPin}
          onMoveComponent={handleMoveComponent}
          onMovePin={handleMovePin}
          onUpdateBoard={handleUpdateBoard}
          onRotateSelected={handleRotateSelected}
          onDeleteSelected={handleDeleteSelected}
          onMountSelected={handleMountSelected}
          onUnmountSelected={handleUnmountSelected}
          onUpdateSelected={handleUpdateSelected}
          highlightedEndpoints={highlightedEndpoints}
          routeEditMode={routeEditMode}
          isPlacingComponent={Boolean(pendingComponent)}
          transparentBoard={isTransparentBoard}
          theme={settings.theme}
          onRouteEditPoint={handleRouteEditPoint}
          dragMoveModifier={settings.dragMoveModifier}
        />
      </div>

      {isCreatingProject && (
        <NewProjectDialog onCancel={() => setIsCreatingProject(false)} onCreate={handleCreateProject} />
      )}
      {autoPlacement.dialogOpen && project && (
        <AutoPlacementDialog
          boardWidth={project.board.width}
          boardHeight={project.board.height}
          boardKind={project.board.kind ?? "perfboard"}
          warnings={autoPlacement.warnings}
          running={autoPlacement.running}
          progress={autoPlacement.progress}
          aiAssistant={aiAssistant}
          onCancel={autoPlacement.close}
          onPlace={autoPlacement.run}
        />
      )}
      {isSettingsOpen && project && (
        <SettingsDialog
          dragMoveModifier={settings.dragMoveModifier}
          shortcuts={settings.shortcuts}
          onUpdate={(dragMoveModifier) => setSettings((current) => ({ ...current, dragMoveModifier }))}
          onUpdateShortcut={(action, shortcut) => setSettings((current) => ({
            ...current,
            shortcuts: { ...current.shortcuts, [action]: shortcut }
          }))}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
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

function normalizeEventKey(key: string) {
  return key === " " ? "Space" : key;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function command(shortcut: string | undefined, enabled: boolean, run: () => void) {
  return { shortcut, enabled, run };
}

function makeDefaultComponentName(label: string, index: number) {
  const prefix = label.replace(/[^A-Za-z]/g, "") || "U";
  return `${prefix}${index}`;
}

function createManualBottomPath(from: [number, number], to: [number, number]): Array<[number, number]> {
  if (from[0] === to[0] || from[1] === to[1]) {
    return expandOrthogonalPath([from, to]);
  }
  return expandOrthogonalPath([from, [to[0], from[1]], to]);
}

function removeBottomTraceSegmentAt(traces: PerfboardProject["routing"]["traces"], point: [number, number]) {
  const nextTraces: PerfboardProject["routing"]["traces"] = [];
  let removed = false;

  for (const trace of traces) {
    if (removed) {
      nextTraces.push(trace);
      continue;
    }

    const removal = findStraightRunAtPoint(trace.points, point);
    if (!removal) {
      nextTraces.push(trace);
      continue;
    }

    removed = true;
    const before = trace.points.slice(0, removal.startIndex + 1);
    const after = trace.points.slice(removal.endIndex);
    if (before.length >= 2) {
      nextTraces.push({ ...trace, id: crypto.randomUUID(), points: before });
    }
    if (after.length >= 2) {
      nextTraces.push({ ...trace, id: crypto.randomUUID(), points: after });
    }
  }

  return { traces: nextTraces, removed };
}

function findStraightRunAtPoint(points: Array<[number, number]>, point: [number, number]) {
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
    const from = points[segmentIndex];
    const to = points[segmentIndex + 1];
    if (!pointOnSegment(point, from, to)) {
      continue;
    }

    let startIndex = segmentIndex;
    let endIndex = segmentIndex + 1;
    while (startIndex > 0 && isSameStraightLine(points[startIndex - 1], points[startIndex], from, to)) {
      startIndex -= 1;
    }
    while (endIndex < points.length - 1 && isSameStraightLine(points[endIndex], points[endIndex + 1], from, to)) {
      endIndex += 1;
    }
    return { startIndex, endIndex };
  }

  return undefined;
}

function pointOnSegment(point: [number, number], from: [number, number], to: [number, number]) {
  if (from[0] === to[0]) {
    return point[0] === from[0] && point[1] >= Math.min(from[1], to[1]) && point[1] <= Math.max(from[1], to[1]);
  }
  if (from[1] === to[1]) {
    return point[1] === from[1] && point[0] >= Math.min(from[0], to[0]) && point[0] <= Math.max(from[0], to[0]);
  }

  return false;
}

function isSameStraightLine(a: [number, number], b: [number, number], from: [number, number], to: [number, number]) {
  const horizontal = from[1] === to[1];
  const vertical = from[0] === to[0];
  if (horizontal) {
    return a[1] === from[1] && b[1] === from[1];
  }
  if (vertical) {
    return a[0] === from[0] && b[0] === from[0];
  }

  return false;
}

function samePoint(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Breadboard rule: one hole takes one wire. A manually drawn jumper endpoint
 * that lands on a component pin hole or another jumper's hole is moved to the
 * nearest free hole of the same electrical node (same 5-hole row / same rail);
 * if no free hole exists there, the jumper is rejected.
 */
function relocateJumperEndpoint(project: PerfboardProject, point: [number, number]): [number, number] | undefined {
  if ((project.board.kind ?? "perfboard") !== "breadboard") {
    return point;
  }
  const boardModel = getBoardModel(project.board);
  const occupied = new Set<string>();
  project.components.forEach((component) => componentPinHoles(component).forEach(([x, y]) => occupied.add(`${x},${y}`)));
  project.routing.jumpers.forEach((jumper) => {
    occupied.add(`${jumper.from[0]},${jumper.from[1]}`);
    occupied.add(`${jumper.to[0]},${jumper.to[1]}`);
  });

  const pointId = `${point[0]},${point[1]}`;
  if (!occupied.has(pointId)) {
    return point;
  }
  const node = boardModel.getElectricalNode(point);
  if (!node) {
    return undefined;
  }
  let best: [number, number] | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  boardModel.getAllHoles().forEach((hole) => {
    if (boardModel.getElectricalNode(hole.id) !== node) return;
    const holeId = `${hole.grid[0]},${hole.grid[1]}`;
    if (occupied.has(holeId)) return;
    const distance = Math.abs(hole.grid[0] - point[0]) + Math.abs(hole.grid[1] - point[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = hole.grid;
    }
  });
  return best;
}
