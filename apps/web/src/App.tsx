import { useEffect, useRef, useState } from "react";
import { HeaderBar } from "./components/HeaderBar";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { Workspace } from "./components/Workspace";
import { AutoPlacementDialog } from "./components/AutoPlacementDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import {
  buildPinOffsetsForComponent,
  type LibraryComponentDefinition
} from "./features/project/componentLibrary";
import { mergeImportState, parseImportFiles } from "./features/import/multisimReportParser";
import { createPlacedComponentsFromParsed } from "./features/import/componentMapping";
import { autoPlaceComponents, type PlacementRegion } from "./features/layout/autoPlacement";
import { resolveNetEndpoints } from "./features/import/netEndpointResolver";
import { autoRouteBoard } from "./features/routing/autoRouter";
import { createProject } from "./features/project/projectFactory";
import type { BoardSize, DragMoveModifier, ImportKind, PerfboardProject } from "./types/project";

const STORAGE_KEY = "perfboard-autoroute-project";
const SETTINGS_KEY = "perfboard-autoroute-settings";
const MAX_UNDO_HISTORY = 50;

interface AppSettings {
  dragMoveModifier: DragMoveModifier;
}

const defaultSettings: AppSettings = {
  dragMoveModifier: "shift"
};

export function App() {
  const [project, setProject] = useState<PerfboardProject | undefined>();
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isAutoPlacing, setIsAutoPlacing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [autoPlacementWarnings, setAutoPlacementWarnings] = useState<string[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<string | undefined>();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [undoCount, setUndoCount] = useState(0);
  const undoStackRef = useRef<PerfboardProject[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      setProject(JSON.parse(saved) as PerfboardProject);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    const savedSettings = window.localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(savedSettings) });
      } catch {
        window.localStorage.removeItem(SETTINGS_KEY);
      }
    }
  }, []);

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

  function commitProject(updater: (current: PerfboardProject) => PerfboardProject) {
    setProject((current) => {
      if (!current) {
        return current;
      }

      const next = updater(current);
      if (next === current) {
        return current;
      }

      undoStackRef.current = [...undoStackRef.current.slice(-(MAX_UNDO_HISTORY - 1)), current];
      setUndoCount(undoStackRef.current.length);
      return next;
    });
  }

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
    setProject(previous);
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
      const text = await file.text();
      const next = JSON.parse(text) as PerfboardProject;
      setProject(next);
      setSelectedComponentId(undefined);
      clearUndoHistory();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      window.alert("无法打开工程文件，请确认是导出的 JSON 工程。");
    }
  }

  function handleCreateProject(name: string, board: BoardSize) {
    setProject(createProject(name, board.width, board.height));
    setSelectedComponentId(undefined);
    clearUndoHistory();
    setIsCreatingProject(false);
  }

  async function handleImportFiles(kind: ImportKind, files: File[]) {
    const parsed = await parseImportFiles(kind, files);

    commitProject((current) => {
      return {
        ...current,
        files: [
          ...current.files,
          ...files.map((file) => ({
            id: crypto.randomUUID(),
            kind,
            name: file.name,
            size: file.size,
            importedAt: new Date().toISOString()
          }))
        ],
        importState: mergeImportState(current.importState, parsed)
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
      const importState = file.kind === "bom"
        ? {
            ...current.importState,
            components: current.importState.components.filter((component) => component.sourceFile !== file.name)
          }
        : {
            ...current.importState,
            nets: current.importState.nets
              .map((net) => ({
                ...net,
                nodes: net.nodes.filter((node) => node.sourceFile !== file.name)
              }))
              .filter((net) => net.nodes.length > 0)
          };

      return {
        ...current,
        files,
        importState,
        selectedNetName: file.kind === "netlist" ? undefined : current.selectedNetName
      };
    });
  }

  function handlePlaceComponent(component: LibraryComponentDefinition, position: [number, number]) {
    const componentId = crypto.randomUUID();
    commitProject((current) => {
      return {
        ...current,
        components: [
          ...current.components,
          {
            id: componentId,
            kind: component.kind,
            label: component.label,
            name: makeDefaultComponentName(component.label, current.components.length + 1),
            value: "",
            pinCount: component.pinCount,
            leadSpacing: component.leadSpacing,
            rowSpacing: component.rowSpacing,
            sameSidePitch: component.sameSidePitch,
            pinOffsets: component.pinOffsets,
            position,
            rotation: 0,
            mounted: false
          }
        ]
      };
    });
    setSelectedComponentId(componentId);
  }

  function handleSelectComponent(componentId: string | undefined) {
    setSelectedComponentId(componentId);
  }

  function handleMoveComponent(componentId: string, position: [number, number]) {
    commitProject((current) => {
      return {
        ...current,
        components: current.components.map((component) => {
          if (component.id !== componentId || component.mounted) {
            return component;
          }

          return { ...component, position };
        })
      };
    });
  }

  function handleUpdateBoard(board: BoardSize) {
    commitProject((current) => {
      return {
        ...current,
        board,
        components: current.components.map((component) => ({
          ...component,
          position: [
            Math.max(0, Math.min(board.width - 1, component.position[0])),
            Math.max(0, Math.min(board.height - 1, component.position[1]))
          ]
        }))
      };
    });
  }

  function handleSelectNet(netName: string | undefined) {
    setProject((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        selectedNetName: current.selectedNetName === netName ? undefined : netName
      };
    });
  }

  function handleAutoPlace(region: PlacementRegion) {
    commitProject((current) => {
      const result = autoPlaceComponents(current.components, region, current.board.width, current.board.height);
      setAutoPlacementWarnings(result.warnings);
      if (result.warnings.length > 0 && result.placedCount === 0) {
        return current;
      }

      setIsAutoPlacing(false);
      return {
        ...current,
        components: result.components
      };
    });
  }

  function handleCreateComponentsFromImport() {
    commitProject((current) => {
      const importedComponents = createPlacedComponentsFromParsed(
        current.importState.components,
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
      return {
        ...current,
        routing: autoRouteBoard(current.board, endpoints, current.components)
      };
    });
  }

  function handleAddBottomTrace(from: [number, number], to: [number, number]) {
    commitProject((current) => {
      const net = current.selectedNetName ?? "MANUAL";
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
      const net = current.selectedNetName ?? "MANUAL";
      return {
        ...current,
        routing: {
          ...current.routing,
          jumpers: [
            ...current.routing.jumpers,
            {
              id: crypto.randomUUID(),
              net,
              from,
              to,
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
      return {
        ...current,
        routing: {
          ...current.routing,
          traces: current.routing.traces.filter((trace) => !trace.points.some((item) => samePoint(item, point))),
          jumpers: current.routing.jumpers.filter((jumper) => !samePoint(jumper.from, point) && !samePoint(jumper.to, point))
        }
      };
    });
  }

  function handleRotateSelected() {
    if (!selectedComponentId) {
      return;
    }

    commitProject((current) => {
      return {
        ...current,
        components: current.components.map((component) => {
          if (component.id !== selectedComponentId || component.mounted) {
            return component;
          }

          return { ...component, rotation: component.rotation + Math.PI / 2 };
        })
      };
    });
  }

  function handleDeleteSelected() {
    if (!selectedComponentId) {
      return;
    }

    commitProject((current) => {
      return {
        ...current,
        components: current.components.filter((component) => component.id !== selectedComponentId)
      };
    });
    setSelectedComponentId(undefined);
  }

  function handleMountSelected() {
    if (!selectedComponentId) {
      return;
    }

    commitProject((current) => {
      return {
        ...current,
        components: current.components.map((component) =>
          component.id === selectedComponentId ? { ...component, mounted: true } : component
        )
      };
    });
  }

  function handleUnmountSelected() {
    if (!selectedComponentId) {
      return;
    }

    commitProject((current) => {
      return {
        ...current,
        components: current.components.map((component) =>
          component.id === selectedComponentId ? { ...component, mounted: false } : component
        )
      };
    });
  }

  function handleUpdateSelected(patch: {
    name?: string;
    value?: string;
    leadSpacing?: number;
    rowSpacing?: number;
    sameSidePitch?: number;
  }) {
    if (!selectedComponentId) {
      return;
    }

    commitProject((current) => {
      return {
        ...current,
        components: current.components.map((component) => {
          if (component.id !== selectedComponentId) {
            return component;
          }

          const next = { ...component, ...patch };
          return {
            ...next,
            pinOffsets: buildPinOffsetsForComponent(next)
          };
        })
      };
    });
  }

  return (
    <div className="app-shell">
      <HeaderBar
        projectName={project?.name}
        onNewProject={() => setIsCreatingProject(true)}
        onSaveProject={handleExportProject}
        onOpenProject={handleOpenProject}
        onUndo={handleUndo}
        canUndo={undoCount > 0}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className={project ? "main-layout with-sidebar" : "main-layout"}>
        {project && <ProjectSidebar project={project} onImportFiles={handleImportFiles} onRemoveImportedFile={handleRemoveImportedFile} onSelectNet={handleSelectNet} />}
        <Workspace
          project={project}
          selectedComponentId={selectedComponentId}
          onNewProject={() => setIsCreatingProject(true)}
          onPlaceComponent={handlePlaceComponent}
          onSelectComponent={handleSelectComponent}
          onMoveComponent={handleMoveComponent}
          onUpdateBoard={handleUpdateBoard}
          onRotateSelected={handleRotateSelected}
          onDeleteSelected={handleDeleteSelected}
          onMountSelected={handleMountSelected}
          onUnmountSelected={handleUnmountSelected}
          onUpdateSelected={handleUpdateSelected}
          onCreateComponentsFromImport={handleCreateComponentsFromImport}
          onOpenAutoPlacement={() => {
            setAutoPlacementWarnings([]);
            setIsAutoPlacing(true);
          }}
          onAutoRoute={handleAutoRoute}
          onAddBottomTrace={handleAddBottomTrace}
          onAddJumper={handleAddJumper}
          onRemoveRouteAt={handleRemoveRouteAt}
          dragMoveModifier={settings.dragMoveModifier}
        />
      </div>

      {isCreatingProject && (
        <NewProjectDialog onCancel={() => setIsCreatingProject(false)} onCreate={handleCreateProject} />
      )}
      {isAutoPlacing && project && (
        <AutoPlacementDialog
          boardWidth={project.board.width}
          boardHeight={project.board.height}
          warnings={autoPlacementWarnings}
          onCancel={() => setIsAutoPlacing(false)}
          onPlace={handleAutoPlace}
        />
      )}
      {isSettingsOpen && project && (
        <SettingsDialog
          dragMoveModifier={settings.dragMoveModifier}
          onUpdate={(dragMoveModifier) => setSettings((current) => ({ ...current, dragMoveModifier }))}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function makeDefaultComponentName(label: string, index: number) {
  const prefix = label.replace(/[^A-Za-z]/g, "") || "U";
  return `${prefix}${index}`;
}

function createManualBottomPath(from: [number, number], to: [number, number]): Array<[number, number]> {
  if (from[0] === to[0] || from[1] === to[1]) {
    return [from, to];
  }
  return [from, [to[0], from[1]], to];
}

function samePoint(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1];
}
