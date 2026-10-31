import type { AdapterSpec, PlacedComponent } from "../../types/project.ts";
import type { GridPoint } from "../board/types.ts";

/** 与 board/placement 的 rotateGridOffset 同规则；放这里避免 adapter ↔ placement 循环引用。 */
function rotateOffset([x, y]: GridPoint, rotation: number): GridPoint {
  const quarterTurns = ((Math.round(rotation / (Math.PI / 2)) % 4) + 4) % 4;
  if (quarterTurns === 1) return [y, -x];
  if (quarterTurns === 2) return [-x, -y];
  if (quarterTurns === 3) return [-y, x];
  return [x, y];
}

export const MIN_ADAPTER_PINS = 2;
export const MAX_ADAPTER_PINS = 64;
/** 转接板至少要比芯片宽出这些孔，否则排针插不进芯片的两侧 */
export const MIN_ADAPTER_MARGIN = 1;

export interface AdapterValidation {
  /** 经过取整、钳制后的可用规格；参数非法时给出最接近的合法值 */
  adapter: AdapterSpec;
  /** 用户需要知道的修正（为空表示传入规格本来就合法） */
  issues: string[];
}

function toEvenAtLeast(value: number, minimum: number) {
  const rounded = Math.max(minimum, Math.round(Number.isFinite(value) ? value : minimum));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * 一颗芯片能配的转接板脚数。
 *
 * 规则（唯一定义处）：**转接板脚数必须等于芯片脚数**，不再允许“14 脚芯片配 16 脚板”。
 * 其他模块一律调用本函数，不要自己写比较或 `>=` 判断。
 */
export function requiredAdapterPins(chipPinCount: number) {
  const rounded = Math.round(Number(chipPinCount));
  const safe = Number.isFinite(rounded) ? rounded : MIN_ADAPTER_PINS;
  return Math.min(MAX_ADAPTER_PINS, toEvenAtLeast(safe, MIN_ADAPTER_PINS));
}

/**
 * 常用转接板尺寸（现场产品口径，1 格 = 2.54mm）：
 *
 * - 芯片侧是 SOP/SOIC，脚距 1.27mm（半格），所以必须靠转接板才能插到洞洞板上；
 * - 排针侧是标准 DIP：脚距 2.54mm（1 格），两列相距 **15.24mm（6 格，0.6"）**；
 * - 实物参考：SOP-8 → DIP-8 转接板 19 × 14 mm、排距 600mil（Alphatronic）；
 *   另有 0.3" 紧凑款 10.92 × 10.16 mm（Siqma），这里取常见的 0.6" 宽体。
 *
 * 所以默认值取：宽 7 格（17.78mm，容下 6 格排距 + 两侧各半格），
 * 高 = 每列针数 + 2 格（8 脚 6 格≈15.2mm，14 脚 9 格≈22.9mm，16 脚 10 格≈25.4mm）。
 */
export const ADAPTER_PRESET_ROW_SPACING = 6;
export const ADAPTER_PRESET_WIDTH = 7;

/** 每列针数 → 板高（格）。0.6" 宽体件的常见长度。 */
function presetHeight(pinsPerSide: number) {
  return pinsPerSide + 2;
}

/**
 * 一颗芯片默认配多大的转接板：脚数等于芯片脚数（取偶），
 * 两列间距 6 格（15.24mm，0.6"），外形按常用件取整。
 * 芯片本身排距更宽时（例如 0.6" 的宽体 DIP 已经是 6 格），间距与宽度跟着芯片走。
 */
export function defaultAdapterForChip(chipPinCount: number, chipRowSpacing: number): AdapterSpec {
  const pinCount = requiredAdapterPins(chipPinCount);
  const pinsPerSide = pinCount / 2;
  const chipRow = Math.max(0, Math.round(Number.isFinite(chipRowSpacing) ? chipRowSpacing : 0));
  const rowSpacing = Math.max(ADAPTER_PRESET_ROW_SPACING, chipRow);
  return {
    pinCount,
    rowSpacing,
    width: Math.max(ADAPTER_PRESET_WIDTH, rowSpacing + 1),
    height: presetHeight(pinsPerSide)
  };
}

/** 描述插在转接板上的芯片，用来算转接板的最小尺寸。 */
export interface AdapterChipProfile {
  pinCount: number;
  rowSpacing: number;
}

/** 芯片当前的转接板资料，供约束执行时当作默认值。 */
export function chipProfileOf(component: Pick<PlacedComponent, "pinOffsets" | "rowSpacing">): AdapterChipProfile {
  return {
    pinCount: Math.max(2, component.pinOffsets.length),
    rowSpacing: Math.max(1, Math.round(component.rowSpacing || 1))
  };
}

/** 允许通过指令调整的转接板字段；脚数不在此列（永远跟随芯片）。 */
const ADAPTER_REQUEST_FIELDS = ["width", "height", "rowSpacing"] as const;
type AdapterRequest = Partial<Pick<AdapterSpec, (typeof ADAPTER_REQUEST_FIELDS)[number]>>;

/**
 * 把一条“请求规格”（缺省字段用芯片默认值补齐）解析成最终转接板。
 * 传 null 表示摘掉转接板。
 *
 * 脚数完全由芯片决定：请求里的 pinCount（历史数据可能带）不参与计算。
 */
export function adapterFromRequest(requested: AdapterRequest | null, chip: AdapterChipProfile): AdapterSpec | undefined {
  // 只有显式 null 才表示“摘掉转接板”；缺失字段按默认规格处理
  if (requested === null) return undefined;
  const source = requested ?? {};
  const base = defaultAdapterForChip(chip.pinCount, chip.rowSpacing);
  const overrides: Partial<AdapterSpec> = {};
  for (const field of ADAPTER_REQUEST_FIELDS) {
    const value = source[field];
    if (value !== undefined) overrides[field] = value;
  }
  return normalizeAdapter({ ...base, ...overrides }, chip).adapter;
}

/** 单独放一块转接板（还没装芯片）时用：只做基本范围约束，不和任何芯片比较。 */
export function normalizeAdapterSpec(spec: Partial<AdapterSpec>): AdapterSpec {
  const pinCount = Math.min(MAX_ADAPTER_PINS, toEvenAtLeast(Number(spec.pinCount), MIN_ADAPTER_PINS));
  const rowSpacing = Math.max(1, Math.round(Number(spec.rowSpacing) || 1));
  const width = Math.max(rowSpacing + 1, Math.round(Number(spec.width) || 2));
  const height = Math.max(Math.ceil(pinCount / 2), Math.round(Number(spec.height) || 2));
  return { pinCount, rowSpacing, width, height };
}

/**
 * 把用户输入的规格整理成可用的转接板。硬约束（都会写进 issues）：
 *  - 脚数必须等于芯片脚数（多了少了都会被拉回来）；
 *  - 两列间距不小于芯片自身的两列跨度，芯片的两排脚才塞得进去；
 *  - 外形宽度不小于「两列间距 + 1」，也不小于芯片自身宽度；
 *  - 外形高度不小于每列针数。
 */
export function normalizeAdapter(spec: AdapterSpec, chip: AdapterChipProfile): AdapterValidation {
  const issues: string[] = [];
  const chipPinCount = Math.max(2, Math.round(Number(chip.pinCount) || 2));
  const chipRowSpacing = Math.max(1, Math.round(Number(chip.rowSpacing) || 1));
  const pinCount = requiredAdapterPins(chipPinCount);

  if (chipPinCount > MAX_ADAPTER_PINS) {
    issues.push(`芯片有 ${chipPinCount} 脚，超过转接板上限 ${MAX_ADAPTER_PINS} 脚，已按上限处理`);
  }

  const pinsPerSide = pinCount / 2;
  let rowSpacing = Math.round(Number(spec.rowSpacing));
  if (!Number.isFinite(rowSpacing) || rowSpacing < chipRowSpacing) {
    issues.push(`两列间距不能小于芯片的 ${chipRowSpacing} 孔，已调整`);
    rowSpacing = chipRowSpacing;
  }

  const minWidth = Math.max(rowSpacing + 1, chipRowSpacing + 1);
  let width = Math.round(Number(spec.width));
  if (!Number.isFinite(width) || width < minWidth) {
    issues.push(`外形宽度不能比芯片还窄，至少 ${minWidth} 孔，已调整`);
    width = minWidth;
  }

  const minHeight = Math.max(pinsPerSide, Math.ceil(chipPinCount / 2));
  let height = Math.round(Number(spec.height));
  if (!Number.isFinite(height) || height < minHeight) {
    issues.push(`外形高度放不下每列 ${pinsPerSide} 个排针，至少 ${minHeight} 孔，已调整`);
    height = minHeight;
  }

  return { adapter: { pinCount, width, height, rowSpacing }, issues };
}

/**
 * 排针在转接板内的坐标，按 DIP 编号：
 * 两列沿 x 分开（x = 0 与 x = rowSpacing），每列沿 y 排开 ——
 * 与芯片自己的 pinOffsets 同一坐标系，插上去才不会差 90°。
 */
export function adapterPinOffsets(adapter: AdapterSpec): GridPoint[] {
  const pinsPerSide = Math.max(1, Math.round(adapter.pinCount / 2));
  const rowSpacing = Math.max(1, Math.round(adapter.rowSpacing));
  const offsets: GridPoint[] = [];
  for (let index = 0; index < pinsPerSide; index += 1) {
    offsets.push([0, index]);
  }
  for (let index = pinsPerSide - 1; index >= 0; index -= 1) {
    offsets.push([rowSpacing, index]);
  }
  return offsets;
}

/** 转接板脚数必须与芯片一致，多一腳少一脚都装不上。 */
export function adapterFitsChip(adapter: AdapterSpec, chipPinCount: number) {
  return adapter.pinCount === requiredAdapterPins(chipPinCount);
}

/** 元件在板上实际占用的脚位数量：插了转接板就是转接板排针（脚数已与芯片一致）。 */
export function componentBoardPinCount(
  component: Pick<PlacedComponent, "pinOffsets" | "adapter">
): number {
  return component.adapter ? component.adapter.pinCount : component.pinOffsets.length;
}

/**
 * 元件在洞洞板上实际占用的脚位：
 * 普通元件是它自己的引脚，插在转接板上的芯片则换成转接板的排针。
 * 芯片第 i 脚接转接板第 i 脚。
 */
export function componentBoardPinOffsets(
  component: Pick<PlacedComponent, "pinOffsets" | "adapter">
): GridPoint[] {
  return component.adapter ? adapterPinOffsets(component.adapter) : component.pinOffsets;
}

/** 转接板自身占用的矩形（相对元件锚点），供绘制与占位检查使用。 */
export function adapterFootprint(adapter: AdapterSpec) {
  return { width: adapter.width, height: adapter.height };
}

/** 元件库里的转接板条目：脚位就是它的排针，外形决定它在板上占多大地方。 */
export function createAdapterDefinition(adapter: AdapterSpec) {
  return {
    kind: "adapter" as const,
    label: "ADP",
    title: `转接板 ${adapter.pinCount} 脚`,
    pinCount: adapter.pinCount,
    leadSpacing: 1,
    rowSpacing: adapter.rowSpacing,
    sameSidePitch: 1,
    pinOffsets: adapterPinOffsets(adapter),
    adapter
  };
}

/** 把芯片放到转接板上时，判断落点是否在转接板外形范围内。 */
export function adapterContainsPoint(adapterPosition: GridPoint, adapter: AdapterSpec, point: GridPoint) {
  return (
    point[0] >= adapterPosition[0] &&
    point[0] < adapterPosition[0] + adapter.width &&
    point[1] >= adapterPosition[1] &&
    point[1] < adapterPosition[1] + adapter.height
  );
}

/**
 * 芯片插在转接板上时，本体要摆在排针范围的正中：
 * 把芯片自己的脚位整体平移，使其包围盒中心与转接板排针中心重合。
 * 只影响绘制，电气脚位仍然走 componentBoardPinOffsets。
 */
export function centeredChipPinOffsets(
  component: Pick<PlacedComponent, "pinOffsets" | "adapter">
): GridPoint[] {
  if (!component.adapter || component.pinOffsets.length === 0) return component.pinOffsets;
  const adapterCenter = pinBoxCenter(adapterPinOffsets(component.adapter));
  const chipCenter = pinBoxCenter(component.pinOffsets);
  const dx = adapterCenter[0] - chipCenter[0];
  const dy = adapterCenter[1] - chipCenter[1];
  return component.pinOffsets.map(([x, y]) => [x + dx, y + dy] as GridPoint);
}

function pinBoxCenter(offsets: GridPoint[]): GridPoint {
  const xs = offsets.map(([x]) => x);
  const ys = offsets.map(([, y]) => y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

type OccupancySource = Pick<PlacedComponent, "position" | "rotation" | "pinOffsets" | "adapter">;

/**
 * 转接板在板面上占的格子（含芯片本体）。
 * 板面以排针为中心、宽高取 max(设定值, 排针跨度 + 2)，随元件旋转。
 */
export function adapterOccupiedCells(component: OccupancySource): Set<string> {
  const cells = new Set<string>();
  if (!component.adapter) return cells;

  const offsets = adapterPinOffsets(component.adapter);
  const xs = offsets.map(([x]) => x);
  const ys = offsets.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(component.adapter.width, maxX - minX + 2);
  const height = Math.max(component.adapter.height, maxY - minY + 2);
  const left = (minX + maxX) / 2 - width / 2;
  const top = (minY + maxY) / 2 - height / 2;

  for (let x = Math.floor(left); x < Math.ceil(left + width); x += 1) {
    for (let y = Math.floor(top); y < Math.ceil(top + height); y += 1) {
      const [rx, ry] = rotateOffset([x, y], component.rotation);
      cells.add(`${component.position[0] + rx},${component.position[1] + ry}`);
    }
  }
  return cells;
}

/** 普通元件占自己的引脚孔；插在转接板上的元件占整块板面。 */
export function componentOccupiedCells(component: OccupancySource): Set<string> {
  if (component.adapter) return adapterOccupiedCells(component);
  const cells = new Set<string>();
  const anchor = component.pinOffsets[0] ?? [0, 0];
  for (const [x, y] of component.pinOffsets) {
    const [rx, ry] = rotateOffset([x - anchor[0], y - anchor[1]], component.rotation);
    cells.add(`${component.position[0] + rx},${component.position[1] + ry}`);
  }
  return cells;
}

/** 两个元件是否在板面上抢到同一格（转接板板面按整块算）。 */
export function componentsOverlap(a: OccupancySource, b: OccupancySource): boolean {
  const first = componentOccupiedCells(a);
  if (first.size === 0) return false;
  for (const cell of componentOccupiedCells(b)) {
    if (first.has(cell)) return true;
  }
  return false;
}
