import type { ConstraintRegion, ConstraintStrength } from "../../types/project";

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
    };

export interface AiConstraintResponse {
  action: "constraints" | "no_action";
  constraints: ConstraintDraft[];
  message?: string;
}
