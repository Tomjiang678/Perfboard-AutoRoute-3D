import type { DrcIssue, DrcReport, ImportState, PlacedComponent } from "../../types/project.ts";
import { findUnmappedNetNodes } from "../import/netEndpointResolver.ts";

export interface NetlistCompletenessResult {
  drc: DrcReport;
  /** 因网表节点没落到板上而失败的网络 */
  failedNets: string[];
}

/**
 * 网表完整性检查：网表里有、但板上找不到对应元件/引脚的节点必须算 DRC 错误。
 * 手动 DRC 和自动布线结果都要过这一关，否则只连了一部分也会显示“通过”。
 */
export function applyNetlistCompleteness(
  drc: DrcReport,
  importState: ImportState,
  components: PlacedComponent[]
): NetlistCompletenessResult {
  const unmapped = findUnmappedNetNodes(importState, components);
  if (unmapped.length === 0) {
    return { drc, failedNets: [] };
  }

  const issues: DrcIssue[] = unmapped.map((node) => ({
    code: "NETLIST_NODE_UNMAPPED",
    severity: "error",
    message: node.reason === "missing_component"
      ? `${node.net}：网表里的 ${node.ref} 在板上不存在（引脚 ${node.pin}）`
      : node.reason === "invalid_pin"
        ? `${node.net}：${node.ref} 的引脚号“${node.pin}”不是有效数字，无法连接`
        : `${node.net}：${node.ref} 没有第 ${node.pin} 脚，无法连接`,
    ref: node.ref,
    pin: typeof node.pin === "number" ? node.pin : undefined,
    net: node.net
  }));

  return {
    drc: {
      ...drc,
      passed: drc.passed && issues.length === 0,
      errors: [...drc.errors, ...issues]
    },
    failedNets: [...new Set(unmapped.map((node) => node.net))]
  };
}
