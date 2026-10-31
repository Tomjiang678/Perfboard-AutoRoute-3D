import { useCallback, useEffect, useRef, useState } from "react";
import type { PerfboardProject } from "../../types/project.ts";
import { withMigratedConstraints } from "../constraints/model.ts";
import { validateProjectShape } from "../project/projectValidation.ts";
import { invalidateDrcIfInputsChanged } from "../project/projectTransitions.ts";

export const PROJECT_STORAGE_KEY = "perfboard-autoroute-project";
const MAX_UNDO_HISTORY = 50;

export interface ProjectDocument {
  project: PerfboardProject | undefined;
  projectRef: React.MutableRefObject<PerfboardProject | undefined>;
  undoCount: number;
  commitProject: (updater: (current: PerfboardProject) => PerfboardProject) => void;
  replaceProject: (next: PerfboardProject | undefined) => void;
  /** 回退一步；返回是否真的回退了 */
  undo: () => boolean;
  clearUndoHistory: () => void;
}

/**
 * 工程文档层：状态、撤销、持久化、载入校验都收在这里，
 * App 只负责界面与交互，不再自己维护这三样东西。
 */
export function useProjectDocument(): ProjectDocument {
  const [project, setProject] = useState<PerfboardProject | undefined>();
  const projectRef = useRef<PerfboardProject | undefined>(undefined);
  const [undoCount, setUndoCount] = useState(0);
  const undoStackRef = useRef<PerfboardProject[]>([]);

  const replaceProject = useCallback((next: PerfboardProject | undefined) => {
    projectRef.current = next;
    setProject(next);
  }, []);

  const commitProject = useCallback((updater: (current: PerfboardProject) => PerfboardProject) => {
    const current = projectRef.current;
    if (!current) return;

    const updated = updater(current);
    if (updated === current) return;
    const next = invalidateDrcIfInputsChanged(current, updated);

    undoStackRef.current = [...undoStackRef.current.slice(-(MAX_UNDO_HISTORY - 1)), current];
    setUndoCount(undoStackRef.current.length);
    projectRef.current = next;
    setProject(next);
  }, []);

  const undo = useCallback(() => {
    const previous = undoStackRef.current.at(-1);
    if (!previous) return false;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setUndoCount(undoStackRef.current.length);
    projectRef.current = previous;
    setProject(previous);
    return true;
  }, []);

  const clearUndoHistory = useCallback(() => {
    undoStackRef.current = [];
    setUndoCount(0);
  }, []);

  // 启动时载入（坏数据直接丢弃，避免每次启动都崩）
  useEffect(() => {
    const saved = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed: unknown = JSON.parse(saved);
      const validation = validateProjectShape(parsed);
      if (!validation.ok) {
        console.warn("[project] 本地工程结构不完整，已忽略：", validation.issues);
        window.localStorage.removeItem(PROJECT_STORAGE_KEY);
        return;
      }
      replaceProject(withMigratedConstraints(parsed as PerfboardProject));
    } catch {
      window.localStorage.removeItem(PROJECT_STORAGE_KEY);
    }
  }, [replaceProject]);

  // 防抖保存
  useEffect(() => {
    if (!project) return;
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [project]);

  return { project, projectRef, undoCount, commitProject, replaceProject, undo, clearUndoHistory };
}
