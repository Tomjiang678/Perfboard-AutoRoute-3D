import { useEffect, useRef, useState } from "react";
import type { AiApiConfiguration } from "./aiProvider.ts";
import { EMPTY_AI_API_CONFIGURATION } from "./aiProvider.ts";
import { loadAiApiConfiguration, saveAiApiConfiguration } from "./aiConfigStore.ts";
import { requestConstraintDrafts, testAiApiConnection } from "./aiConstraintClient.ts";
import { detectConstraintConflicts } from "../constraints/conflictDetector.ts";
import { projectConstraints } from "../constraints/model.ts";
import { resolveConstraintDrafts } from "../constraints/resolveDrafts.ts";
import type { DesignConstraint, PerfboardProject } from "../../types/project.ts";

type ProjectCommitter = (updater: (current: PerfboardProject) => PerfboardProject) => void;

interface UseAiConstraintAssistantOptions {
  project?: PerfboardProject;
  commitProject: ProjectCommitter;
}

export interface AiConstraintAssistantController {
  configuration: AiApiConfiguration;
  configurationStorageMessage?: string;
  instructionRunning: boolean;
  instructionStatus?: string;
  /**
   * 输入草稿。刻意用 ref 而不是 state：打字不应该触发整棵树（含 3D 工作区）重渲染，
   * 但组件重建时内容还能留下来。
   */
  instructionDraft: { current: string };
  draftConstraints: DesignConstraint[];
  activeConstraints: DesignConstraint[];
  setConfiguration: (configuration: AiApiConfiguration) => void;
  testConnection: () => Promise<void>;
  parseInstruction: (text: string) => Promise<void>;
  confirmDrafts: () => void;
  discardDrafts: () => void;
  toggleConstraint: (constraintId: string) => void;
  deleteConstraint: (constraintId: string) => void;
}

export function useAiConstraintAssistant({
  project,
  commitProject
}: UseAiConstraintAssistantOptions): AiConstraintAssistantController {
  const [configuration, setConfiguration] = useState<AiApiConfiguration>(EMPTY_AI_API_CONFIGURATION);
  const [configurationLoaded, setConfigurationLoaded] = useState(false);
  const [configurationStorageMessage, setConfigurationStorageMessage] = useState<string>();
  const [draftConstraints, setDraftConstraints] = useState<DesignConstraint[]>([]);
  const [instructionStatus, setInstructionStatus] = useState<string>();
  const [instructionRunning, setInstructionRunning] = useState(false);
  const instructionDraft = useRef("");
  const projectIdRef = useRef<string | undefined>(project?.id);
  projectIdRef.current = project?.id;
  /** 当前草案所属的工程 id */
  const draftProjectIdRef = useRef<string | undefined>(undefined);

  // 切换工程时清空待确认草案，避免把 A 的指令确认到 B 上
  useEffect(() => {
    draftProjectIdRef.current = undefined;
    setDraftConstraints([]);
    setInstructionStatus(undefined);
  }, [project?.id]);

  useEffect(() => {
    let cancelled = false;
    loadAiApiConfiguration()
      .then((loaded) => {
        if (!cancelled) {
          setConfiguration(loaded);
          setConfigurationLoaded(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setConfigurationLoaded(true);
          setConfigurationStorageMessage(error instanceof Error ? error.message : "无法读取 AI 配置。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!configurationLoaded) return;
    const timeout = window.setTimeout(() => {
      saveAiApiConfiguration(configuration)
        .then((storage) => setConfigurationStorageMessage(
          storage === "electron-safe-storage"
            ? "配置已加密保存到桌面应用配置目录。"
            : "网页版配置已保存到当前浏览器。"
        ))
        .catch((error) => setConfigurationStorageMessage(
          error instanceof Error ? error.message : "AI 配置保存失败。"
        ));
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [configuration, configurationLoaded]);

  async function testConnection() {
    if (instructionRunning) return;
    setInstructionRunning(true);
    setInstructionStatus("正在测试 API 连接……");
    try {
      await testAiApiConnection(configuration);
      setInstructionStatus("连接成功，API 可以返回结构化指令。");
    } catch (error) {
      setInstructionStatus(error instanceof Error ? error.message : "API 连接测试失败。");
    } finally {
      setInstructionRunning(false);
    }
  }

  async function parseInstruction(text: string) {
    if (!project || instructionRunning) return;
    const sourceProjectId = project.id;
    setInstructionRunning(true);
    setInstructionStatus("正在解析工程指令……");
    setDraftConstraints([]);
    try {
      const response = await requestConstraintDrafts(configuration, text, project);
      // 解析期间可能切了工程：结果属于旧工程，直接丢弃
      if (projectIdRef.current !== sourceProjectId) {
        setInstructionStatus("工程已切换，本次解析结果已丢弃。");
        return;
      }
      if (response.action === "no_action" || response.constraints.length === 0) {
        setInstructionStatus(response.message?.trim() || "未识别到可执行的工程要求。请检查工程中是否存在所指元件和网络。");
        return;
      }
      const resolved = resolveConstraintDrafts(response.constraints, text, project);
      draftProjectIdRef.current = sourceProjectId;
      setDraftConstraints(resolved.constraints);
      setInstructionStatus(resolved.errors.length > 0
        ? `识别到 ${resolved.constraints.length} 条可确认指令；${resolved.errors.join(" ")}`
        : `识别到 ${resolved.constraints.length} 条指令，请确认后应用。`);
    } catch (error) {
      setInstructionStatus(error instanceof Error ? error.message : "AI 指令解析失败。");
    } finally {
      setInstructionRunning(false);
    }
  }

  function confirmDrafts() {
    if (!project || draftConstraints.length === 0) return;
    // 双保险：草案必须属于当前工程
    if (draftProjectIdRef.current !== project.id) {
      setInstructionStatus("工程已切换，请重新解析指令后再确认。");
      setDraftConstraints([]);
      draftProjectIdRef.current = undefined;
      return;
    }
    const conflicts = detectConstraintConflicts([...projectConstraints(project), ...draftConstraints]);
    if (conflicts.length > 0) {
      setInstructionStatus(conflicts.join(" "));
      return;
    }
    commitProject((current) => ({
      ...current,
      constraints: [...projectConstraints(current), ...draftConstraints],
      constraintSchemaVersion: 1
    }));
    setInstructionStatus(`已添加 ${draftConstraints.length} 条工程约束。`);
    setDraftConstraints([]);
  }

  function toggleConstraint(constraintId: string) {
    commitProject((current) => ({
      ...current,
      constraints: projectConstraints(current).map((constraint) => constraint.id === constraintId
        ? { ...constraint, enabled: !constraint.enabled, status: constraint.enabled ? "disabled" : "active" }
        : constraint)
    }));
  }

  function deleteConstraint(constraintId: string) {
    commitProject((current) => ({
      ...current,
      constraints: projectConstraints(current).filter((constraint) => constraint.id !== constraintId)
    }));
  }

  return {
    configuration,
    configurationStorageMessage,
    instructionRunning,
    instructionStatus,
    instructionDraft,
    draftConstraints,
    activeConstraints: project ? projectConstraints(project) : [],
    setConfiguration,
    testConnection,
    parseInstruction,
    confirmDrafts,
    discardDrafts: () => setDraftConstraints([]),
    toggleConstraint,
    deleteConstraint
  };
}

