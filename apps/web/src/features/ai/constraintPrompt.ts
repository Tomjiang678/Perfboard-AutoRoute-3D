import type { PerfboardProject } from "../../types/project";
import { constraintCatalogForPrompt, constraintResponseSchema } from "../constraints/catalog";
import { resolveNetEndpoints } from "../import/netEndpointResolver";

export function buildConstraintPrompt(userText: string, project: PerfboardProject) {
  const physicalEndpoints = resolveNetEndpoints(project.importState, project.components);
  const componentRefs = project.components.map((component) => component.name);
  const netNames = project.importState.nets.map((net) => net.name).filter((name) => name.trim().length > 0);
  const context = {
    board: {
      ...project.board,
      coordinateSystem: {
        origin: [0, 0],
        xAxis: "positive-right",
        yAxis: "positive-down",
        validX: [0, project.board.width - 1],
        validY: [0, project.board.height - 1]
      }
    },
    components: project.components.map((component) => ({
      id: component.id,
      ref: component.name,
      label: component.label,
      category: component.kind,
      value: component.value,
      pinCount: component.pinOffsets.length,
      pinOffsets: component.pinOffsets,
      feasibleFootprintSizes: feasibleFootprintSizes(component.pinOffsets),
      mounted: component.mounted,
      position: component.position,
      rotationDegrees: Math.round(component.rotation * 180 / Math.PI)
    })),
    nets: project.importState.nets.map((net) => ({
      name: net.name,
      nodes: net.nodes.map((node) => ({ ref: node.ref, pin: node.pin }))
    })),
    physicalEndpoints: physicalEndpoints.map((endpoint) => ({
      net: endpoint.net,
      ref: endpoint.ref,
      physicalPin: endpoint.pin,
      grid: endpoint.grid,
      role: endpoint.role
    })),
    availableComponentRefs: componentRefs,
    availableNetworkNames: netNames
  };

  const catalog = constraintCatalogForPrompt();
  const outputSchema = constraintResponseSchema(componentRefs, netNames);

  return `你是洞洞板工程指令解析器，不是聊天机器人。你的唯一输出是一个 JSON 对象；不回答问题，不输出 Markdown，不输出解释性正文。
如果输入不是可执行的放置/布线要求，输出 {"action":"no_action","constraints":[]}。
根据完整工程上下文理解用户指代的实体和集合。所有实体引用最终都要展开成上下文中的确切 ref 或网络 name。
只能引用上下文中真实存在的元件 ref 和网络 name。不得创建元件或网络，不得把名称相似的独立网络合并。
所有 componentRef/componentRefs 值必须逐字选自 availableComponentRefs。所有 net 值必须是非空字符串，并逐字选自 availableNetworkNames。
如果用户指代的网络无法唯一对应 availableNetworkNames，不得输出空 net，也不得猜测；返回 no_action，并在 message 中列出无法解析的指代和 availableNetworkNames。
必须把一句话中的每个独立工程要求分别输出，不能因为已经识别一条就遗漏其余要求。
只允许使用指令目录中列出的 kind 和字段，禁止自创 kind、字段或自然语言动作。
根据用户完整语义判断 strength；不可违反的要求使用 hard，可优化但允许折中的偏好使用 soft。
所有区域和行列坐标只根据 board.coordinateSystem 计算。
component_in_region 的 region 必须能容纳所列每个元件的至少一个 feasibleFootprintSizes 项；不要给元件输出无法放入的单行或单列区域。
有效结果格式：{"action":"constraints","constraints":[...]}。

指令目录：${JSON.stringify(catalog)}
输出 JSON Schema：${JSON.stringify(outputSchema)}
工程上下文：${JSON.stringify(context)}
用户输入：${JSON.stringify(userText)}`;
}

function feasibleFootprintSizes(pinOffsets: Array<[number, number]>) {
  const base = footprintSize(pinOffsets);
  return [
    base,
    { width: base.height, height: base.width }
  ].filter((size, index, list) => list.findIndex((candidate) => candidate.width === size.width && candidate.height === size.height) === index);
}

function footprintSize(pinOffsets: Array<[number, number]>) {
  if (pinOffsets.length === 0) return { width: 1, height: 1 };
  const xs = pinOffsets.map(([x]) => x);
  const ys = pinOffsets.map(([, y]) => y);
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  const height = Math.max(...ys) - Math.min(...ys) + 1;
  const margin = pinOffsets.length <= 2 ? 1 : 0;
  return {
    width: width + margin * 2,
    height: height + margin * 2
  };
}

export function buildConstraintRepairPrompt(originalPrompt: string, invalidOutput: string, validationError: string) {
  return `${originalPrompt}

你刚才的输出未通过本地 Schema 校验。
校验错误：${JSON.stringify(validationError)}
无效输出：${JSON.stringify(invalidOutput.slice(0, 8000))}
请严格按照上面的指令目录重新输出完整 JSON。不要遗漏原用户输入中的任何独立要求。`;
}
