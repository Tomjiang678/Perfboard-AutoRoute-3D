import { useState } from "react";
import { commitHistory, createHistory, redoHistory, undoHistory, type HistoryState } from "../model/history.ts";
import { nextStackBase } from "../model/stack.ts";
import { DEFAULT_SHAPE_COLOR, type UserPackageDraft, type UserPackageShape } from "../model/types.ts";

export type UserPackageEditorTool = "select" | "cuboid" | "cylinder" | "pin";

export function useUserPackageEditor(initial?: UserPackageDraft) {
  const [history, setHistory] = useState<HistoryState<UserPackageDraft>>(() => createHistory(initial ?? emptyDraft()));
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [tool, setTool] = useState<UserPackageEditorTool>("select");
  const draft = history.present;
  const selectedShape = draft.shapes.find((shape) => shape.id === selectedId);

  function commit(next: UserPackageDraft) {
    setHistory((current) => commitHistory(current, next));
  }

  function updateShape(id: string, patch: Partial<Omit<UserPackageShape, "id" | "kind">>) {
    commit({
      ...draft,
      shapes: draft.shapes.map((shape) => shape.id === id ? { ...shape, ...patch } as UserPackageShape : shape)
    });
  }

  function addCuboid(center: [number, number]) {
    const shape: UserPackageShape = {
      id: crypto.randomUUID(),
      kind: "cuboid",
      center,
      length: 4,
      width: 3,
      angle: 0,
      height: 2,
      color: DEFAULT_SHAPE_COLOR
    };
    commit({ ...draft, stackBase: draft.stackBase ?? nextStackBase(draft), shapes: [...draft.shapes, shape] });
    setSelectedId(shape.id);
    setTool("select");
  }

  function addCylinder(center: [number, number]) {
    const shape: UserPackageShape = {
      id: crypto.randomUUID(),
      kind: "cylinder",
      center,
      radius: 1.5,
      height: 2,
      color: DEFAULT_SHAPE_COLOR
    };
    commit({ ...draft, stackBase: draft.stackBase ?? nextStackBase(draft), shapes: [...draft.shapes, shape] });
    setSelectedId(shape.id);
    setTool("select");
  }

  function addPin(hole: [number, number]) {
    if (draft.shapes.some((shape) => shape.kind === "pin" && sameHole(shape.hole, hole))) {
      return;
    }
    const shape: UserPackageShape = { id: crypto.randomUUID(), kind: "pin", hole };
    commit({ ...draft, shapes: [...draft.shapes, shape] });
    setSelectedId(shape.id);
  }

  function deleteSelected() {
    if (!selectedId) return;
    commit({ ...draft, shapes: draft.shapes.filter((shape) => shape.id !== selectedId) });
    setSelectedId(undefined);
  }

  function undo() {
    setHistory((current) => undoHistory(current));
  }

  function redo() {
    setHistory((current) => redoHistory(current));
  }

  function rename(name: string) {
    commit({ ...draft, name });
  }

  return {
    draft,
    selectedShape,
    selectedId,
    tool,
    setTool,
    setSelectedId,
    updateShape,
    addCuboid,
    addCylinder,
    addPin,
    deleteSelected,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    rename
  };
}

function emptyDraft(): UserPackageDraft {
  return {
    id: crypto.randomUUID(),
    name: "新建封装",
    shapes: [],
    updatedAt: new Date().toISOString()
  };
}

function sameHole(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1];
}
