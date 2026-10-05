import type { AiConstraintAssistantController } from "../useAiConstraintAssistant.ts";
import type { DesignConstraint } from "../../../types/project.ts";

export function AiConstraintLists({ controller }: { controller: AiConstraintAssistantController }) {
  return (
    <>
      {controller.draftConstraints.length > 0 && (
        <section className="constraint-list-section draft">
          <h3>待确认指令</h3>
          {controller.draftConstraints.map((constraint) => <ConstraintRow key={constraint.id} constraint={constraint} />)}
          <div className="constraint-list-actions">
            <button className="tool-button" type="button" onClick={controller.discardDrafts}>放弃</button>
            <button className="tool-button primary" type="button" onClick={controller.confirmDrafts}>确认添加</button>
          </div>
        </section>
      )}
      {controller.activeConstraints.length > 0 && (
        <section className="constraint-list-section">
          <h3>本工程约束</h3>
          {controller.activeConstraints.map((constraint) => (
            <ConstraintRow
              key={constraint.id}
              constraint={constraint}
              actions={(
                <>
                  <button type="button" onClick={() => controller.toggleConstraint(constraint.id)}>
                    {constraint.enabled ? "禁用" : "启用"}
                  </button>
                  <button type="button" onClick={() => controller.deleteConstraint(constraint.id)}>删除</button>
                </>
              )}
            />
          ))}
        </section>
      )}
    </>
  );
}

function ConstraintRow({ constraint, actions }: { constraint: DesignConstraint; actions?: React.ReactNode }) {
  return (
    <article className={constraint.enabled ? "constraint-row" : "constraint-row disabled"}>
      <div>
        <strong>{constraint.strength === "hard" ? "硬约束" : "软约束"}</strong>
        <span>{constraint.explanation}</span>
      </div>
      <small>{constraintSummary(constraint)}</small>
      {actions && <footer>{actions}</footer>}
    </article>
  );
}

function constraintSummary(constraint: DesignConstraint) {
  switch (constraint.kind) {
    case "component_in_region": return `${constraint.componentRefs.join("、")} → (${constraint.region.x}, ${constraint.region.y}) ${constraint.region.width}×${constraint.region.height}`;
    case "component_on_board_edge": return `${constraint.componentRefs.join("、")} → ${edgeLabel(constraint.edge)}，深度 ${constraint.depth ?? "自动"}`;
    case "component_near_component": return `${constraint.componentRef} ↔ ${constraint.anchorComponentRef}，最大 ${constraint.maxDistance} 孔`;
    case "component_lock": return `${constraint.componentRef}：${constraint.lockPosition ? "锁位置" : ""}${constraint.lockRotation ? " 锁方向" : ""}`;
    case "component_orientation": return `${constraint.componentRef}：${constraint.rotationDegrees}°`;
    case "region_keepout": return `区域 (${constraint.region.x}, ${constraint.region.y}) ${constraint.region.width}×${constraint.region.height}`;
    case "power_rail": return `${constraint.net}：${constraint.axis === "row" ? "第 " + constraint.index + " 行" : "第 " + constraint.index + " 列"}，${constraint.from}..${constraint.to}`;
    case "net_jumper_limit": return `${constraint.net}：最多 ${constraint.maxJumpers} 根跳线`;
  }
}

function edgeLabel(edge: Extract<DesignConstraint, { kind: "component_on_board_edge" }>["edge"]) {
  return {
    top: "上边缘",
    bottom: "下边缘",
    left: "左边缘",
    right: "右边缘",
    short_side: "任一短边边缘",
    long_side: "任一长边边缘",
    any: "任一板边"
  }[edge];
}

