import type {
  DrcReport,
  PerfboardProject,
  RoutingDiagnostics,
  RoutingState
} from "../../types/project.ts";
import { validateRoutingResult } from "./autoRouter.ts";
import { resolveNetEndpoints } from "../import/netEndpointResolver.ts";
import { applyNetlistCompleteness } from "./netlistCompleteness.ts";
import { applyRoutingConstraintReport } from "../constraints/execution.ts";
import { projectConstraints } from "../constraints/model.ts";

export interface DrcReportBundle {
  drc: DrcReport;
  failedNets: string[];
  diagnostics: RoutingDiagnostics;
  /** 由约束产生的警告（调用方负责追加到工程 warnings） */
  warnings: string[];
}

/**
 * 工程里“DRC 是否通过”的唯一真值来源。
 *
 * 以前这条流水线在 4 个地方各拼一遍（布线内部、手动 DRC、自动布线后处理），
 * 组合顺序和步骤还不一致，导致同一块板在不同入口得到不同结论。
 * 现在所有入口都走这里：接线校验 → 网表完整性 → 约束报告。
 */
export function buildDrcReport(project: PerfboardProject, routing: RoutingState = project.routing): DrcReportBundle {
  const constraints = projectConstraints(project);
  const endpoints = resolveNetEndpoints(project.importState, project.components);

  const validation = validateRoutingResult(project.board, routing, endpoints, project.components, constraints);
  const completeness = applyNetlistCompleteness(validation.drc, project.importState, project.components);
  const withConstraintReport = applyRoutingConstraintReport(routing, constraints);
  const constraintWarnings = withConstraintReport.warnings.slice(routing.warnings.length);

  const failedNets = new Set<string>(completeness.failedNets);
  validation.failedNetDetails.forEach((detail) => failedNets.add(detail.net));
  completeness.drc.errors.forEach((issue) => {
    if (issue.net) failedNets.add(issue.net);
    if (issue.expectedNet) failedNets.add(issue.expectedNet);
  });
  withConstraintReport.failedNets.forEach((net) => failedNets.add(net));

  return {
    drc: completeness.drc,
    failedNets: [...failedNets],
    diagnostics: { failedNetDetails: validation.failedNetDetails },
    warnings: constraintWarnings
  };
}
