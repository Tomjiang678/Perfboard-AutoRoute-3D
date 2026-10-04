import type { BoardSize } from "../../types/project";
import { gridHoleId, parseGridHoleId, type BoardHole, type BoardModel, type GridPoint, type HoleId } from "./types.ts";
import { validateBasicPlacement } from "./placement.ts";

export function createPerfboardModel(definition: BoardSize): BoardModel {
  const board: BoardSize = { ...definition, kind: "perfboard", breadboard: undefined };
  let holes: readonly BoardHole[] | undefined;
  const isValidHole = ([x, y]: GridPoint) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < board.width && y < board.height;
  const pointFor = (hole: HoleId | GridPoint) => typeof hole === "string" ? parseGridHoleId(hole) : hole;
  const getElectricalNode = (hole: HoleId | GridPoint) => {
    const point = pointFor(hole);
    return point && isValidHole(point) ? `perfboard:${gridHoleId(point)}` : undefined;
  };

  return {
    definition: board,
    capabilities: {
      routePrimitives: new Set(["bottom_trace", "jumper"]),
      hasInternalConnections: false,
      canResizeWidth: true,
      canResizeHeight: true,
      canRenderBottomView: true,
      jumperSide: "bottom"
    },
    getAllHoles() {
      if (!holes) {
        const next: BoardHole[] = [];
        for (let y = 0; y < board.height; y += 1) for (let x = 0; x < board.width; x += 1) next.push({ id: gridHoleId([x, y]), grid: [x, y] });
        holes = next;
      }
      return holes;
    },
    getHole(point) {
      return isValidHole(point) ? { id: gridHoleId(point), grid: point } : undefined;
    },
    isValidHole,
    snapToHole(point) {
      const snapped: GridPoint = [Math.max(0, Math.min(board.width - 1, Math.round(point[0]))), Math.max(0, Math.min(board.height - 1, Math.round(point[1])))];
      return isValidHole(snapped) ? snapped : undefined;
    },
    getElectricalNode,
    areInternallyConnected(a, b) {
      const first = getElectricalNode(a);
      return first !== undefined && first === getElectricalNode(b);
    },
    validatePlacement(component, pinNets) {
      return validateBasicPlacement(this, component, pinNets);
    },
    getDisplayName() {
      return `${board.width} x ${board.height} holes`;
    }
  };
}
