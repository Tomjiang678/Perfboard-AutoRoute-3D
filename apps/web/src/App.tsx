import { useEffect, useMemo, useState } from "react";
import { HeaderBar } from "./components/HeaderBar.tsx";
import { NewProjectDialog } from "./components/NewProjectDialog.tsx";
import { ProjectSidebar } from "./components/ProjectSidebar.tsx";
import { PinProfilesDialog } from "./components/PinProfilesDialog.tsx";
import { PackageLibraryDialog } from "./components/PackageLibraryDialog.tsx";
import { MappingLibraryDialog } from "./components/MappingLibraryDialog.tsx";
import { ProfileConflictDialog } from "./components/ProfileConflictDialog.tsx";
import { HelpDialog } from "./components/help/HelpDialog.tsx";
import { Workspace } from "./components/Workspace.tsx";
import { AutoPlacementDialog } from "./components/AutoPlacementDialog.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import {
  type LibraryComponentDefinition
} from "./features/project/componentLibrary.ts";
import { componentImportRef } from "./features/project/componentTraits.ts";
import { applyPinProfile } from "./features/project/applyPinProfile.ts";
import { updateBoard } from "./features/project/updateBoard.ts";
import { mergeImportState, parseImportFiles, removeFileData } from "./features/import/kicadNetlistParser.ts";
import { pruneResolvedBundleWarnings, stripBundleWarnings } from "./features/import/importWarnings.ts";
import { mergePowerRefs, stripPowerNodes } from "./features/import/multisim/normalizeImport.ts";
import { createPlacedComponentsFromParsed } from "./features/import/componentMapping.ts";
import { applyLibraryProfiles, loadUserProfiles, removeProfileFromLibrary, removeUserProfilesForIdentity, saveProfileToLibrary } from "./features/import/multisim/library.ts";
import { collectPendingParts } from "./features/import/multisim/pending.ts";
import { componentIdentity, identityKey } from "./features/import/multisim/profile.ts";
import { queueProfileSubmission, flushProfileSubmissions } from "./features/import/multisim/submit.ts";
import { clearPinDraft } from "./features/import/multisim/draftStore.ts";
import type { ProfileConflict } from "./features/import/multisim/conflicts.ts";
import { useAutoPlacement } from "./features/layout/useAutoPlacement.ts";
import { useAiConstraintAssistant } from "./features/ai/useAiConstraintAssistant.ts";
import { resolveNetEndpoints } from "./features/import/netEndpointResolver.ts";
import { invalidateComponentRouting } from "./features/routing/invalidateComponentRouting.ts";
import { usePackageAssignment } from "./features/project/usePackageAssignment.ts";
import { useComponentActions } from "./features/project/useComponentActions.ts";
import { useRoutingActions } from "./features/routing/useRoutingActions.ts";
import { STORAGE_KEYS } from "./features/storage/storageKeys.ts";
import { confirmAction, notify } from "./features/storage/notify.ts";
import { createProject } from "./features/project/projectFactory.ts";
import { useProjectDocument, PROJECT_STORAGE_KEY } from "./features/project/useProjectDocument.ts";
import { validateProjectShape } from "./features/project/projectValidation.ts";
import { prepareProject } from "./features/project/prepareProject.ts";
import { getBoardModel } from "./features/board/factory.ts";
import type { BoardSize, DragMoveModifier, ImportState, KeyboardShortcuts, PerfboardProject, PinProfile, PlacedComponent, RoutedNetEndpoint, ThemeMode } from "./types/project.ts";
import type { SelectedPin } from "./components/Perfboard3DViewport.tsx";
import type { RouteEditMode, WorkspaceToolbarProps } from "./components/WorkspaceToolbar.tsx";

const SETTINGS_KEY = STORAGE_KEYS.settings;

interface AppSettings {
  dragMoveModifier: DragMoveModifier;
  shortcuts: KeyboardShortcuts;
  theme: ThemeMode;
  saveDirectory?: string;
  packageDirectory?: string;
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
  // 工程文档（状态 + 撤销 + 持久化）统一由文档层负责
  const { project, projectRef, undoCount, commitProject, replaceProject, undo, clearUndoHistory } = useProjectDocument();
  const packageAssignment = usePackageAssignment(projectRef, commitProject);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMappingLibraryOpen, setIsMappingLibraryOpen] = useState(false);
  const [isConflictOpen, setIsConflictOpen] = useState(false);
  const [isPinProfilesOpen, setIsPinProfilesOpen] = useState(false);
  const [pinProfileFocus, setPinProfileFocus] = useState<string | undefined>();
  const [selectedComponentId, setSelectedComponentId] = useState<string | undefined>();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isTransparentBoard, setIsTransparentBoard] = useState(false);
  const [routeEditMode, setRouteEditMode] = useState<RouteEditMode>("select");
  const [routeDraftStart, setRouteDraftStart] = useState<[number, number] | undefined>();
  const [pendingComponent, setPendingComponent] = useState<LibraryComponentDefinition | undefined>();
  const [selectedPin, setSelectedPin] = useState<SelectedPin | undefined>();
  const [toolbarOpenMenu, setToolbarOpenMenu] = useState<string | undefined>();
  const [routingRunning, setRoutingRunning] = useState(false);
  const {
    updateComponent,
    handleMoveComponent,
    handleMovePin,
    handleRotateSelected,
    handleDeleteSelected,
    handleMountSelected,
    handleUnmountSelected,
    handleUpdateSelected,
    handleDetachAdapter
  } = useComponentActions({
    projectRef,
    commitProject,
    selectedComponentId,
    setSelectedComponentId,
    setSelectedPin
  });
  const {
    handleAutoRoute,
    handleClearRoutes,
    handleRunDrc,
    handleClearDrc,
    handleAddBottomTrace,
    handleAddJumper,
    handleRemoveRouteAt
  } = useRoutingActions({
    projectRef,
    commitProject,
    routingRunning,
    setRoutingRunning,
    setRouteDraftStart
  });

  useEffect(() => {
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

  useEffect(() => {
    void flushProfileSubmissions();
  }, []);

  useEffect(() => window.perfboardDesktop?.projectFiles.onOpen((file) => {
    if (file.content !== undefined) {
      handleOpenProjectText(file.content);
    } else {
      notify(`无法打开工程文件：${file.filePath ?? ""}\n${file.message ?? "读取失败"}`);
    }
  }), []);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (settings.saveDirectory?.trim()) return;
    const storage = window.perfboardDesktop?.storage;
    if (!storage?.getDefaultDirectory) return;
    let active = true;
    void storage.getDefaultDirectory()
      .then((directory) => {
        if (!active || !directory) return;
        setSettings((current) => current.saveDirectory?.trim()
          ? current
          : { ...current, saveDirectory: directory });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [settings.saveDirectory]);

  useEffect(() => {
    if (settings.packageDirectory?.trim()) return;
    const storage = window.perfboardDesktop?.storage;
    if (!storage?.getDefaultPackageDirectory) return;
    let active = true;
    void storage.getDefaultPackageDirectory()
      .then((directory) => {
        if (!active || !directory) return;
        setSettings((current) => current.packageDirectory?.trim()
          ? current
          : { ...current, packageDirectory: directory });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [settings.packageDirectory]);

  useEffect(() => {
    const directory = settings.saveDirectory?.trim();
    if (!project || !directory || !window.perfboardDesktop?.storage) return;
    const timeout = window.setTimeout(() => {
      void window.perfboardDesktop?.storage
        .writeBackup({ directory, content: buildBackupContent(project) })
        .catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [project, settings.saveDirectory]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.colorScheme = settings.theme;
  }, [settings.theme]);


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
    if (packageAssignment.assignTargetId) {
      if (packageAssignment.assign(component)) {
        setSelectedPin(undefined);
      }
      return;
    }
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
    routingRunning,
    canClearRoutes: project.routing.traces.length > 0 || project.routing.jumpers.length > 0 || Boolean(project.routing.drc),
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
    onClearRoutes: handleClearRoutes,
    onRunDrc: handleRunDrc,
    onClearDrc: handleClearDrc,
    onOpenPackageLibrary: packageAssignment.openPicker,
    onOpenMappingLibrary: () => setIsMappingLibraryOpen(true)
  } : undefined;

  function handleUndo() {
    if (!undo()) return;
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

  async function handleChooseSaveDirectory() {
    const directory = await window.perfboardDesktop?.storage.chooseDirectory();
    if (directory) {
      setSettings((current) => ({ ...current, saveDirectory: directory }));
    }
  }

  async function handleChoosePackageDirectory() {
    const directory = await window.perfboardDesktop?.storage.chooseDirectory();
    if (directory) {
      setSettings((current) => ({ ...current, packageDirectory: directory }));
    }
  }

  async function handleOpenProject(file: File) {
    try {
      handleOpenProjectText(await file.text());
    } catch {
      notify("无法打开工程文件，请确认是导出的 JSON 工程。");
    }
  }

  function handleOpenProjectText(text: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      notify("无法打开工程文件，请确认是导出的 JSON 工程。");
      return;
    }

    // 先校验结构，再动状态和本地存储：坏工程不能覆盖掉当前工程
    const validation = validateProjectShape(parsed);
    if (!validation.ok) {
      notify(`工程文件不完整，已拒绝载入：\n${validation.issues.slice(0, 6).join("\n")}`);
      return;
    }

    try {
      const next = prepareProject(parsed as PerfboardProject);
      replaceProject(next);
      setSelectedComponentId(undefined);
      setSelectedPin(undefined);
      setPendingComponent(undefined);
      clearUndoHistory();
      window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      notify("无法打开工程文件，请确认是导出的 JSON 工程。");
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

  /** Removes every component and all copper; the netlist stays so parts can be regenerated. */
  function handleClearProject() {
    if (!projectRef.current) return;
    if (!confirmAction("清空工程：删除全部元件与走线？导入的网表记录会保留，可重新生成元件。")) return;
    commitProject((current) => ({
      ...current,
      components: [],
      selectedNetName: undefined,
      routing: { traces: [], jumpers: [], failedNets: [], warnings: [] }
    }));
    setSelectedComponentId(undefined);
    setSelectedPin(undefined);
    setPendingComponent(undefined);
    setRouteEditMode("select");
    setRouteDraftStart(undefined);
  }

  async function handleImportFiles(files: File[]) {
    // 记录下来这次导入属于哪个工程：读文件期间可能新建/打开了别的工程
    const targetProjectId = projectRef.current?.id;
    let parsed;
    try {
      parsed = await parseImportFiles(files);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      notify(`网表导入失败：${message}`);
      console.error("netlist import failed", error);
      return;
    }
    const fileNames = files.map((file) => file.name);

    commitProject((current) => {
      if (!targetProjectId || current.id !== targetProjectId) {
        console.warn("[import] 工程已切换，本次导入结果已丢弃");
        return current;
      }
      const base = removeFileData(current.importState, fileNames);
      const cleaned = parsed.hasMultisim ? { ...base, warnings: stripBundleWarnings(base.warnings) } : base;
      const powerRefs = mergePowerRefs(base.powerRefs, parsed.powerRefs);
      const merged = applyLibraryProfiles(mergeImportState(cleaned, parsed));
      const withoutPowerNodes = parsed.hasMultisim ? stripPowerNodes(merged, powerRefs) : merged;
      const importState = pruneResolvedBundleWarnings(
        powerRefs.length > 0 && parsed.hasMultisim ? { ...withoutPowerNodes, powerRefs } : withoutPowerNodes
      );
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

    const imported = projectRef.current;
    if (imported && collectPendingParts(imported.importState).length > 0) {
      setPinProfileFocus(undefined);
      setIsPinProfilesOpen(true);
    }
  }

  function handleRemoveImportedFile(fileId: string) {
    commitProject((current) => {
      const file = current.files.find((item) => item.id === fileId);
      if (!file) {
        return current;
      }

      const files = current.files.filter((item) => item.id !== fileId);
      const components = current.importState.components.filter((component) => component.sourceFile !== file.name);
      const identities = new Set(components.map((component) => identityKey(componentIdentity(component))));
      const importState: ImportState = {
        components,
        nets: current.importState.nets
          .map((net) => ({
            ...net,
            nodes: net.nodes.filter((node) => node.sourceFile !== file.name)
          }))
          .filter((net) => net.nodes.length > 0),
        warnings: current.importState.warnings.filter((warning) => warning.fileName !== file.name),
        pinInfo: current.importState.pinInfo,
        pinProfiles: (current.importState.pinProfiles ?? []).filter((profile) => identities.has(identityKey(profile.identity))),
        powerRefs: current.importState.powerRefs
      };

      return {
        ...current,
        files,
        importState,
        selectedNetName: undefined
      };
    });
  }

  function handleSavePinProfile(profile: PinProfile) {
    commitProject((current) => applyPinProfile(current, profile));

    // Persist immediately: the debounced writer can lose the last edit if the
    // window is refreshed right after pressing Save.
    try {
      if (projectRef.current) {
        window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(projectRef.current));
      }
    } catch {
      // Quota errors must not undo the in-memory save.
    }
    try {
      saveProfileToLibrary(profile);
    } catch {
      // The project copy is authoritative; the share library is best-effort.
    }
    queueProfileSubmission(profile);
  }

  function handleDeletePinProfile(profileId: string) {
    const projectProfile = projectRef.current?.importState.pinProfiles?.find((profile) => profile.id === profileId);
    const libraryProfile = loadUserProfiles().find((profile) => profile.id === profileId);
    const identity = projectProfile?.identity ?? libraryProfile?.identity;

    try {
      removeProfileFromLibrary(profileId);
    } catch {
      // Deleting the project copy below still works.
    }
    if (!identity) return;

    const currentProjectId = projectRef.current?.id;
    commitProject((current) => {
      const profiles = current.importState.pinProfiles ?? [];
      const next = profiles.filter((profile) => identityKey(profile.identity) !== identityKey(identity));
      if (next.length === profiles.length) return current;
      return {
        ...current,
        importState: { ...current.importState, pinProfiles: next }
      };
    });
    if (currentProjectId) {
      clearPinDraft(currentProjectId, identityKey(identity));
    }
    // The part is still in the netlist, so it now shows up as "needs pin map".
  }

  function handleChooseProfileConflict(conflict: ProfileConflict, choice: "public" | "user") {
    const key = identityKey(conflict.userProfile.identity);
    if (choice === "user") {
      commitProject((current) => ({
        ...current,
        importState: {
          ...current.importState,
          pinProfileChoices: { ...(current.importState.pinProfileChoices ?? {}), [key]: "user" }
        }
      }));
      return;
    }

    try {
      removeUserProfilesForIdentity(conflict.userProfile.identity);
    } catch {
      // Removing the project copy below is enough for this project.
    }
    const projectId = projectRef.current?.id;
    commitProject((current) => {
      const profiles = (current.importState.pinProfiles ?? [])
        .filter((profile) => identityKey(profile.identity) !== key);
      if (conflict.publicSource === "public") {
        profiles.push(conflict.publicProfile);
      }
      const choices = { ...(current.importState.pinProfileChoices ?? {}) };
      delete choices[key];
      return {
        ...current,
        importState: {
          ...current.importState,
          pinProfiles: profiles,
          components: current.importState.components.map((component) =>
            identityKey(componentIdentity(component)) === key
              ? { ...component, pinCount: conflict.publicProfile.pinCount, pinCountSource: "builtin" as const }
              : component
          ),
          pinProfileChoices: choices
        }
      };
    });
    if (projectId) {
      clearPinDraft(projectId, key);
    }
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
      adapter: component.adapter,
      position,
      rotation: 0,
      mounted: false,
      origin: "manual",
      placeholder: false
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

  function handleUpdateBoard(board: BoardSize) {
    commitProject((current) => updateBoard(current, board));
  }

  function handleSelectNet(netName: string | undefined) {
    const current = projectRef.current;
    if (!current) return;
    replaceProject({
      ...current,
      selectedNetName: current.selectedNetName === netName ? undefined : netName
    });
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

  return (
    <div className="app-shell">
      <HeaderBar
        projectName={project?.name}
        theme={settings.theme}
        onToggleTheme={handleToggleTheme}
        onNewProject={() => setIsCreatingProject(true)}
        onSaveProject={handleExportProject}
        onOpenProject={handleOpenProject}
        onClearProject={handleClearProject}
        onUndo={handleUndo}
        canUndo={undoCount > 0}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        toolbar={toolbar}
      />
      <div className={project ? "main-layout with-sidebar" : "main-layout"}>
        {project && <ProjectSidebar project={project} aiAssistant={aiAssistant} onImportFiles={handleImportFiles} onRemoveImportedFile={handleRemoveImportedFile} onSelectNet={handleSelectNet} onOpenPinProfiles={() => { setPinProfileFocus(undefined); setIsPinProfilesOpen(true); }} onEditPinProfile={(key) => { setPinProfileFocus(key); setIsPinProfilesOpen(true); }} onOpenConflicts={() => setIsConflictOpen(true)} />}
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
          onAssignPackage={packageAssignment.openAssign}
          canAssignPackage={packageAssignment.canAssign}
          onMountSelected={handleMountSelected}
          onUnmountSelected={handleUnmountSelected}
          onUpdateSelected={handleUpdateSelected}
          onDetachAdapter={handleDetachAdapter}
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
      {isPinProfilesOpen && project && (
        <PinProfilesDialog
          importState={project.importState}
          projectId={project.id}
          focusKey={pinProfileFocus}
          onSave={handleSavePinProfile}
          onClose={() => {
            setIsPinProfilesOpen(false);
            setPinProfileFocus(undefined);
          }}
        />
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
      {isHelpOpen && <HelpDialog onClose={() => setIsHelpOpen(false)} />}
      {packageAssignment.isOpen && (
        <PackageLibraryDialog
          onPickComponent={handlePickComponent}
          pinCount={packageAssignment.targetPinCount}
          assigning={Boolean(packageAssignment.assignTargetId)}
          onClose={packageAssignment.close}
        />
      )}
      {isMappingLibraryOpen && (
        <MappingLibraryDialog
          onDeleteProfile={handleDeletePinProfile}
          onClose={() => setIsMappingLibraryOpen(false)}
        />
      )}
      {isConflictOpen && project && (
        <ProfileConflictDialog
          importState={project.importState}
          onChoose={handleChooseProfileConflict}
          onClose={() => setIsConflictOpen(false)}
        />
      )}
      {isSettingsOpen && project && (
        <SettingsDialog
          dragMoveModifier={settings.dragMoveModifier}
          shortcuts={settings.shortcuts}
          saveDirectory={settings.saveDirectory}
          packageDirectory={settings.packageDirectory}
          onUpdate={(dragMoveModifier) => setSettings((current) => ({ ...current, dragMoveModifier }))}
          onUpdateShortcut={(action, shortcut) => setSettings((current) => ({
            ...current,
            shortcuts: { ...current.shortcuts, [action]: shortcut }
          }))}
          onUpdateSaveDirectory={(saveDirectory) => setSettings((current) => ({ ...current, saveDirectory }))}
          onChooseSaveDirectory={window.perfboardDesktop?.storage ? handleChooseSaveDirectory : undefined}
          onUpdatePackageDirectory={(packageDirectory) => setSettings((current) => ({ ...current, packageDirectory }))}
          onChoosePackageDirectory={window.perfboardDesktop?.storage ? handleChoosePackageDirectory : undefined}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function buildBackupContent(project: PerfboardProject) {
  return JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    project,
    pinProfiles: loadUserProfiles()
  }, null, 2);
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

