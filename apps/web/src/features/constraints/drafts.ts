import type { ConstraintRegion, ConstraintStrength } from "../../types/project.ts";

export type ConstraintDraft =
  | {
      kind: "component_in_region";
      strength: ConstraintStrength;
      componentRefs: string[];
      region: ConstraintRegion;
      explanation?: string;
    }
  | {
      kind: "component_on_board_edge";
      strength: ConstraintStrength;
      componentRefs: string[];
      edge: "top" | "bottom" | "left" | "right" | "short_side" | "long_side" | "any";
      depth?: number;
      explanation?: string;
    }
  | {
      kind: "component_near_component";
      strength: ConstraintStrength;
      componentRef: string;
      anchorComponentRef: string;
      maxDistance: number;
      explanation?: string;
    }
  | {
      kind: "component_lock";
      strength: ConstraintStrength;
      componentRef: string;
      lockPosition: boolean;
      lockRotation: boolean;
      explanation?: string;
    }
  | {
      kind: "component_orientation";
      strength: ConstraintStrength;
      componentRef: string;
      rotationDegrees: number;
      explanation?: string;
    }
  | {
      kind: "region_keepout";
      strength: ConstraintStrength;
      region: ConstraintRegion;
      blockPlacement: boolean;
      blockBottomRouting: boolean;
      blockJumpers: boolean;
      explanation?: string;
    }
  | {
      kind: "power_rail";
      strength: ConstraintStrength;
      net: string;
      axis: "row" | "column";
      index: number;
      from: number;
      to: number;
      explanation?: string;
    }
  | {
      kind: "net_jumper_limit";
      strength: ConstraintStrength;
      net: string;
      maxJumpers: number;
      explanation?: string;
    }
  | {
      kind: "component_adapter";
      strength: ConstraintStrength;
      componentRefs: string[];
      /** 缺省字段按芯片默认值补齐；脚数固定等于芯片脚数，不能指定 */
      width?: number;
      height?: number;
      rowSpacing?: number;
      /** true = 摘掉转接板 */
      remove?: boolean;
      explanation?: string;
    };

export interface AiConstraintResponse {
  action: "constraints" | "no_action";
  constraints: ConstraintDraft[];
  message?: string;
}
