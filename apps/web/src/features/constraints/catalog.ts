export interface ConstraintCatalogEntry {
  kind: string;
  purpose: string;
  fields: Record<string, string>;
}

export const CONSTRAINT_CATALOG: ConstraintCatalogEntry[] = [
  {
    kind: "component_in_region",
    purpose: "把一个或多个已存在元件限制在矩形区域内",
    fields: { strength: "hard | soft", componentRefs: "string[]，必须展开成确切位号", region: "{x,y,width,height}" }
  },
  {
    kind: "component_on_board_edge",
    purpose: "把一个或多个已存在元件放到板边附近的可放置带状区域。用于用户表达靠边、边缘、短边、长边等意图，不要用单行或单列矩形代替。",
    fields: { strength: "hard | soft", componentRefs: "string[]，必须展开成确切位号", edge: "top | bottom | left | right | short_side | long_side | any", depth: "可选正整数；省略时由本地根据元件尺寸计算" }
  },
  {
    kind: "component_near_component",
    purpose: "让一个已存在元件靠近另一个已存在元件",
    fields: { strength: "hard | soft", componentRef: "确切位号", anchorComponentRef: "确切位号", maxDistance: "非负整数孔距" }
  },
  {
    kind: "component_lock",
    purpose: "锁定元件当前位置和/或方向",
    fields: { strength: "hard | soft", componentRef: "确切位号", lockPosition: "boolean", lockRotation: "boolean" }
  },
  {
    kind: "component_orientation",
    purpose: "指定元件旋转角度",
    fields: { strength: "hard | soft", componentRef: "确切位号", rotationDegrees: "number" }
  },
  {
    kind: "region_keepout",
    purpose: "限制矩形区域内的元件、底面走锡和/或跳线",
    fields: { strength: "hard | soft", region: "{x,y,width,height}", blockPlacement: "boolean", blockBottomRouting: "boolean", blockJumpers: "boolean" }
  },
  {
    kind: "power_rail",
    purpose: "把整行或整列连续焊接为某个已存在网络",
    fields: { strength: "hard | soft", net: "确切网络名", axis: "row | column", index: "行/列索引", from: "起始索引", to: "结束索引" }
  },
  {
    kind: "net_jumper_limit",
    purpose: "限制某个已存在网络的跳线数量",
    fields: { strength: "hard | soft", net: "确切网络名", maxJumpers: "非负整数" }
  },
  {
    kind: "component_adapter",
    purpose:
      "给一个或多个已存在芯片插上转接板（或移除）。芯片插在转接板上时会占用整块板面，比芯片本身大；用户提到“转接板、转接、插在板上、加个底座、引出来”时用这个。省略的尺寸字段按芯片默认值补齐；remove=true 表示移除转接板。",
    fields: {
      strength: "hard | soft",
      componentRefs: "string[]，必须展开成确切位号",
      pinCount: "可选，偶数，不得小于芯片脚数",
      rowSpacing: "可选，两列排针间距，不得小于芯片自身排距",
      width: "可选，板面宽度（孔），不得小于芯片宽度",
      height: "可选，板面高度（孔），不得小于每列针数",
      remove: "可选 boolean，true 表示移除转接板"
    }
  }
];

export function constraintCatalogForPrompt() {
  return CONSTRAINT_CATALOG.map((entry) => ({ kind: entry.kind, purpose: entry.purpose, fields: entry.fields }));
}

export function constraintResponseSchema(componentRefs: string[], netNames: string[]) {
  const strength = { type: "string", enum: ["hard", "soft"] };
  const explanation = { type: "string" };
  const componentRef = { type: "string", enum: componentRefs };
  const net = { type: "string", enum: netNames };
  const edge = { type: "string", enum: ["top", "bottom", "left", "right", "short_side", "long_side", "any"] };
  const region = {
    type: "object",
    additionalProperties: false,
    required: ["x", "y", "width", "height"],
    properties: {
      x: { type: "integer", minimum: 0 },
      y: { type: "integer", minimum: 0 },
      width: { type: "integer", minimum: 1 },
      height: { type: "integer", minimum: 1 }
    }
  };
  const command = (kind: string, required: string[], properties: Record<string, unknown>) => ({
    type: "object",
    additionalProperties: false,
    required: ["kind", "strength", ...required],
    properties: { kind: { const: kind }, strength, explanation, ...properties }
  });
  return {
    type: "object",
    additionalProperties: false,
    required: ["action", "constraints"],
    properties: {
      action: { type: "string", enum: ["constraints", "no_action"] },
      message: { type: "string" },
      constraints: {
        type: "array",
        maxItems: 20,
        items: {
          oneOf: [
            command("component_in_region", ["componentRefs", "region"], {
              componentRefs: { type: "array", minItems: 1, uniqueItems: true, items: componentRef }, region
            }),
            command("component_on_board_edge", ["componentRefs", "edge"], {
              componentRefs: { type: "array", minItems: 1, uniqueItems: true, items: componentRef },
              edge,
              depth: { type: "integer", minimum: 1 }
            }),
            command("component_near_component", ["componentRef", "anchorComponentRef", "maxDistance"], {
              componentRef, anchorComponentRef: componentRef, maxDistance: { type: "integer", minimum: 0 }
            }),
            command("component_lock", ["componentRef", "lockPosition", "lockRotation"], {
              componentRef, lockPosition: { type: "boolean" }, lockRotation: { type: "boolean" }
            }),
            command("component_orientation", ["componentRef", "rotationDegrees"], {
              componentRef, rotationDegrees: { type: "number" }
            }),
            command("region_keepout", ["region", "blockPlacement", "blockBottomRouting", "blockJumpers"], {
              region, blockPlacement: { type: "boolean" }, blockBottomRouting: { type: "boolean" }, blockJumpers: { type: "boolean" }
            }),
            command("power_rail", ["net", "axis", "index", "from", "to"], {
              net, axis: { type: "string", enum: ["row", "column"] }, index: { type: "integer", minimum: 0 }, from: { type: "integer", minimum: 0 }, to: { type: "integer", minimum: 0 }
            }),
            command("net_jumper_limit", ["net", "maxJumpers"], {
              net, maxJumpers: { type: "integer", minimum: 0 }
            }),
            command("component_adapter", ["componentRefs"], {
              componentRefs: { type: "array", minItems: 1, uniqueItems: true, items: componentRef },
              rowSpacing: { type: "integer", minimum: 1, maximum: 63 },
              width: { type: "integer", minimum: 2, maximum: 64 },
              height: { type: "integer", minimum: 2, maximum: 64 },
              remove: { type: "boolean" }
            })
          ]
        }
      }
    }
  };
}
