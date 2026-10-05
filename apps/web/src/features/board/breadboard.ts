import type { BoardSize, BreadboardLayout } from "../../types/project.ts";
import { gridHoleId, parseGridHoleId, type BoardHole, type BoardModel, type ElectricalNodeId, type GridPoint, type HoleId } from "./types.ts";
import { isCenterBridgeComponent, isPowerNet, validateBasicPlacement } from "./placement.ts";

const TERMINAL_MODULE_WIDTH = 12;
const MODULE_BOUNDARY_WIDTH = 4;

export type BreadboardColumnRole =
  | { kind: "rail"; id: string; color: "red" | "blue" }
  | { kind: "terminal"; moduleIndex: number; bank: "left" | "right" }
  | { kind: "channel" }
  | { kind: "spacer" };

export function createBreadboardDefinition(terminalRows: number, modules: number): BoardSize {
  const normalizedRows = clampInteger(terminalRows, 5, 150, 30);
  const normalizedModules = clampInteger(modules, 1, 8, 1);
  return {
    kind: "breadboard",
    width: breadboardWidth(normalizedModules),
    height: normalizedRows,
    breadboard: {
      modules: normalizedModules,
      terminalRows: normalizedRows,
      powerRailsPerSide: normalizedModules === 1 ? 2 : 1
    }
  };
}

export function normalizeBreadboardDefinition(board: BoardSize): BoardSize {
  const layout = normalizeBreadboardLayout(board);
  return createBreadboardDefinition(layout.terminalRows, layout.modules);
}

export function createBreadboardModel(definition: BoardSize): BoardModel {
  const board = normalizeBreadboardDefinition(definition);
  let holes: readonly BoardHole[] | undefined;
  const isValidHole = ([x, y]: GridPoint) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= board.width || y >= board.height) return false;
    const role = getBreadboardColumnRole(board, x);
    if (role.kind === "rail") {
      // Power rails come in groups of 5 holes; every 6th row is a gap with
      // no hole at all.
      return !isRailGapRow(y);
    }
    return role.kind === "terminal";
  };
  const pointFor = (hole: HoleId | GridPoint) => typeof hole === "string" ? parseGridHoleId(hole) : hole;
  const electricalNode = (point: GridPoint): ElectricalNodeId | undefined => {
    if (!Number.isInteger(point[0]) || !Number.isInteger(point[1]) || point[0] < 0 || point[1] < 0 || point[0] >= board.width || point[1] >= board.height) return undefined;
    const [x, y] = point;
    const role = getBreadboardColumnRole(board, x);
    if (role.kind === "rail") return `breadboard:rail:${role.id}`;
    if (role.kind === "terminal") return `breadboard:${role.moduleIndex}:row:${y}:${role.bank}-bank`;
    return undefined;
  };

  return {
    definition: board,
    capabilities: {
      routePrimitives: new Set(["jumper"]),
      hasInternalConnections: true,
      canResizeWidth: false,
      canResizeHeight: true,
      canRenderBottomView: false,
      jumperSide: "top"
    },
    getAllHoles() {
      if (!holes) {
        const next: BoardHole[] = [];
        for (let y = 0; y < board.height; y += 1) {
          for (let x = 0; x < board.width; x += 1) {
            if (!isValidHole([x, y])) continue;
            const role = getBreadboardColumnRole(board, x);
            next.push({
              id: gridHoleId([x, y]),
              grid: [x, y],
              metadata: role.kind === "rail"
                ? { role: role.kind, color: role.color }
                : role.kind === "terminal"
                  ? { role: role.kind, moduleIndex: role.moduleIndex, bank: role.bank }
                  : undefined
            });
          }
        }
        holes = next;
      }
      return holes;
    },
    getHole(point) {
      return isValidHole(point) ? { id: gridHoleId(point), grid: point } : undefined;
    },
    isValidHole,
    snapToHole(point) {
      const clamped: GridPoint = [Math.max(0, Math.min(board.width - 1, Math.round(point[0]))), Math.max(0, Math.min(board.height - 1, Math.round(point[1])))];
      if (isValidHole(clamped)) return clamped;
      for (let distance = 1; distance < board.width; distance += 1) {
        const left: GridPoint = [clamped[0] - distance, clamped[1]];
        const right: GridPoint = [clamped[0] + distance, clamped[1]];
        if (isValidHole(left)) return left;
        if (isValidHole(right)) return right;
      }
      return undefined;
    },
    getElectricalNode(hole) {
      const point = pointFor(hole);
      return point ? electricalNode(point) : undefined;
    },
    areInternallyConnected(a, b) {
      const first = this.getElectricalNode(a);
      return first !== undefined && first === this.getElectricalNode(b);
    },
    validatePlacement(component, pinNets = {}) {
      const validation = validateBasicPlacement(this, component, pinNets);
      validation.pinHoles.forEach((hole, index) => {
        const role = getBreadboardColumnRole(board, hole[0]);
        if (role.kind === "rail" && !isPowerNet(pinNets[index + 1])) {
          validation.issues.push({
            code: "power_rail_requires_power_net",
            message: `${component.name}.${index + 1} 只有明确的电源网络才能插入电源轨`,
            pins: [index + 1],
            holes: [hole]
          });
        }
      });

      if (validation.pinHoles.length === 2 && validation.pinHoles[0][1] === validation.pinHoles[1][1]) {
        const firstRole = getBreadboardColumnRole(board, validation.pinHoles[0][0]);
        const secondRole = getBreadboardColumnRole(board, validation.pinHoles[1][0]);
        const bridgesCenter = firstRole.kind === "terminal" &&
          secondRole.kind === "terminal" &&
          firstRole.moduleIndex === secondRole.moduleIndex &&
          firstRole.bank !== secondRole.bank;
        if (!bridgesCenter) {
          validation.issues.push({
            code: "two_pin_horizontal_must_bridge_center",
            message: `${component.name} 同排横插时必须跨过同一面包板单元的中央沟槽`,
            pins: [1, 2],
            holes: validation.pinHoles
          });
        }
      }

      if (isCenterBridgeComponent(component)) {
        const terminalRoles = validation.pinHoles.map(([x]) => getBreadboardColumnRole(board, x));
        const validRoles = terminalRoles.filter((role): role is Extract<BreadboardColumnRole, { kind: "terminal" }> => role.kind === "terminal");
        const modules = new Set(validRoles.map((role) => role.moduleIndex));
        const banks = new Set(validRoles.map((role) => role.bank));
        if (validRoles.length !== validation.pinHoles.length || modules.size !== 1 || !banks.has("left") || !banks.has("right")) {
          validation.issues.push({
            code: "chip_must_bridge_center",
            message: `${component.name} 必须跨同一个面包板单元的中央沟槽放置`,
            pins: validation.pinHoles.map((_, index) => index + 1),
            holes: validation.pinHoles
          });
        }
      }

      validation.valid = validation.issues.length === 0;
      return validation;
    },
    getDisplayName() {
      const layout = board.breadboard!;
      return `${layout.terminalRows} rows · ${layout.modules}-in-1 breadboard`;
    }
  };
}

export function getBreadboardColumnRole(board: BoardSize, x: number): BreadboardColumnRole {
  const modules = board.breadboard?.modules ?? 1;
  if (modules === 1) {
    // Two-column center channel: the hole rows closest to the center (x=7 and
    // x=10) are 3 grid units apart, exactly one DIP row spacing, so a chip
    // straddles the channel with both pin rows in the nearest holes.
    if (x === 0) return { kind: "rail", id: "left-red", color: "red" };
    if (x === 1) return { kind: "rail", id: "left-blue", color: "blue" };
    if (x === 2 || x === 15) return { kind: "spacer" };
    if (x >= 3 && x <= 7) return { kind: "terminal", moduleIndex: 0, bank: "left" };
    if (x === 8 || x === 9) return { kind: "channel" };
    if (x >= 10 && x <= 14) return { kind: "terminal", moduleIndex: 0, bank: "right" };
    if (x === 16) return { kind: "rail", id: "right-blue", color: "blue" };
    if (x === 17) return { kind: "rail", id: "right-red", color: "red" };
    return { kind: "spacer" };
  }

  if (x === 0) return { kind: "rail", id: "outer-left", color: "red" };
  if (x === 1) return { kind: "spacer" };
  let cursor = 2;
  for (let moduleIndex = 0; moduleIndex < modules; moduleIndex += 1) {
    const localX = x - cursor;
    if (localX >= 0 && localX < TERMINAL_MODULE_WIDTH) {
      if (localX <= 4) return { kind: "terminal", moduleIndex, bank: "left" };
      if (localX <= 6) return { kind: "channel" };
      return { kind: "terminal", moduleIndex, bank: "right" };
    }
    cursor += TERMINAL_MODULE_WIDTH;
    if (moduleIndex < modules - 1) {
      if (x === cursor) return { kind: "spacer" };
      if (x === cursor + 1) return { kind: "rail", id: `middle-${moduleIndex}-red`, color: "red" };
      if (x === cursor + 2) return { kind: "rail", id: `middle-${moduleIndex}-blue`, color: "blue" };
      if (x === cursor + 3) return { kind: "spacer" };
      cursor += MODULE_BOUNDARY_WIDTH;
    }
  }
  if (x === cursor) return { kind: "spacer" };
  if (x === cursor + 1) return { kind: "rail", id: "outer-right", color: "blue" };
  return { kind: "spacer" };
}

function normalizeBreadboardLayout(board: BoardSize): BreadboardLayout {
  const modules = clampInteger(board.breadboard?.modules ?? 1, 1, 8, 1);
  return {
    modules,
    terminalRows: clampInteger(board.breadboard?.terminalRows ?? board.height, 5, 150, 30),
    powerRailsPerSide: modules === 1 ? 2 : 1
  };
}

function breadboardWidth(modules: number) {
  if (modules === 1) return 18;
  return 2 + modules * TERMINAL_MODULE_WIDTH + (modules - 1) * MODULE_BOUNDARY_WIDTH + 2;
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isRailGapRow(y: number) {
  return y % 6 === 5;
}
