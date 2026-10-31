import assert from "node:assert/strict";
import test from "node:test";
import {
  adapterFitsChip,
  adapterOccupiedCells,
  adapterPinOffsets,
  centeredChipPinOffsets,
  componentBoardPinOffsets,
  componentsOverlap,
  defaultAdapterForChip,
  normalizeAdapterSpec,
  requiredAdapterPins,
  normalizeAdapter
} from "../src/features/project/adapter.ts";
import { componentPinHoles, pinGridPosition } from "../src/features/board/placement.ts";
import { componentLibrary } from "../src/features/project/componentLibrary.ts";
import type { AdapterSpec, PlacedComponent } from "../src/types/project.ts";

function dipComponent(pinCount: number, rowSpacing = 3): PlacedComponent {
  const pinsPerSide = pinCount / 2;
  const pinOffsets: Array<[number, number]> = [];
  for (let column = 0; column < pinsPerSide; column += 1) pinOffsets.push([column, 0]);
  for (let column = pinsPerSide - 1; column >= 0; column -= 1) pinOffsets.push([column, rowSpacing]);
  return {
    id: "U1",
    kind: "dip",
    label: "U1",
    name: "U1",
    value: "74HC00",
    pinCount,
    leadSpacing: 1,
    rowSpacing,
    sameSidePitch: 1,
    pinOffsets,
    position: [10, 20],
    rotation: 0,
    mounted: false
  };
}

const ADAPTER_16: AdapterSpec = { pinCount: 16, width: 7, height: 10, rowSpacing: 5 };

test("默认转接板按 0.6\" 宽体 SOP 转 DIP 件取值", () => {
  const eight = defaultAdapterForChip(8, 3);
  // 8 脚：4+4 排针，两列 6 格（15.24mm），外形 7×6 格（17.8×15.2mm，实物 19×14mm）
  assert.deepEqual(eight, { pinCount: 8, rowSpacing: 6, width: 7, height: 6 });

  const fourteen = defaultAdapterForChip(14, 3);
  assert.deepEqual(fourteen, { pinCount: 14, rowSpacing: 6, width: 7, height: 9 });

  const sixteen = defaultAdapterForChip(16, 3);
  assert.deepEqual(sixteen, { pinCount: 16, rowSpacing: 6, width: 7, height: 10 });

  // 芯片比 6 格排距还宽时（例如 0.9" = 9 格），间距和宽度跟着芯片走
  assert.deepEqual(defaultAdapterForChip(16, 9), { pinCount: 16, rowSpacing: 9, width: 10, height: 10 });
  assert.ok(adapterFitsChip(eight, 8));
});

test("转接板脚数必须与芯片完全一致：14 脚不能配 8 脚或 16 脚", () => {
  const eight = { pinCount: 8, width: 6, height: 4, rowSpacing: 3 };
  assert.equal(adapterFitsChip(eight, 14), false);
  // 以前 16 脚能插 14 脚芯片，现在多一脚也不行
  assert.equal(adapterFitsChip(ADAPTER_16, 14), false);
  assert.equal(adapterFitsChip({ ...ADAPTER_16, pinCount: 14 }, 14), true);

  const tooSmall = normalizeAdapter(eight, { pinCount: 14, rowSpacing: 3 });
  assert.equal(tooSmall.adapter.pinCount, 14);
  // 脚数改成 14 之后每列 7 针，原来 4 孔的高度也放不下
  assert.ok(tooSmall.issues.some((issue) => issue.includes("高度")));

  const tooLarge = normalizeAdapter(ADAPTER_16, { pinCount: 14, rowSpacing: 3 });
  assert.equal(tooLarge.adapter.pinCount, 14);
});

test("单独生成转接板不受芯片限制：选多少脚就是多少脚", () => {
  assert.deepEqual(
    normalizeAdapterSpec({ pinCount: 16, width: 7, height: 10, rowSpacing: 6 }),
    { pinCount: 16, rowSpacing: 6, width: 7, height: 10 }
  );
  assert.equal(normalizeAdapterSpec({ pinCount: 8 }).pinCount, 8);
  assert.equal(normalizeAdapterSpec({ pinCount: 64 }).pinCount, 64);
});

test("两列间距不能小于芯片自身，宽高都不能比芯片还小", () => {
  const tooNarrow = normalizeAdapter(
    { pinCount: 16, width: 3, height: 4, rowSpacing: 1 },
    { pinCount: 14, rowSpacing: 3 }
  );
  assert.equal(tooNarrow.adapter.pinCount, 14);
  assert.equal(tooNarrow.adapter.rowSpacing, 3);
  assert.equal(tooNarrow.adapter.width, 4);
  assert.equal(tooNarrow.adapter.height, 7);
  assert.ok(tooNarrow.issues.some((issue) => issue.includes("两列间距")));
  assert.ok(tooNarrow.issues.some((issue) => issue.includes("宽度")));
  assert.ok(tooNarrow.issues.some((issue) => issue.includes("高度")));
});

test("脚数一律跟芯片走，输入什么都会被拉回来", () => {
  const odd = normalizeAdapter(
    { pinCount: 15, width: 2, height: 1, rowSpacing: 3 },
    { pinCount: 8, rowSpacing: 1 }
  );
  assert.equal(odd.adapter.pinCount, 8);
  assert.equal(odd.adapter.width, 4);
  assert.equal(odd.adapter.height, 4);
  assert.ok(odd.issues.some((issue) => issue.includes("宽度")));
  assert.ok(odd.issues.some((issue) => issue.includes("高度")));

  assert.equal(requiredAdapterPins(13), 14);
  assert.equal(requiredAdapterPins(1), 2);
  assert.equal(requiredAdapterPins(8), 8);
});

test("排针按 DIP 编号排列，和芯片同一坐标系", () => {
  const offsets = adapterPinOffsets(ADAPTER_16);
  assert.equal(offsets.length, 16);
  // 第一列沿 y 往下，第二列从下往上
  assert.deepEqual(offsets[0], [0, 0]);
  assert.deepEqual(offsets[7], [0, 7]);
  assert.deepEqual(offsets[8], [5, 7]);
  assert.deepEqual(offsets[15], [5, 0]);
});

test("插上转接板后，芯片在板上占用的脚位变成排针孔", () => {
  const chip = dipComponent(16);
  const plain = componentBoardPinOffsets(chip);
  assert.deepEqual(plain, chip.pinOffsets);
  assert.deepEqual(pinGridPosition(chip, 1), [10, 20]);

  const withAdapter: PlacedComponent = { ...chip, adapter: ADAPTER_16 };
  const boardPins = componentBoardPinOffsets(withAdapter);
  assert.equal(boardPins.length, 16);
  // 锚点是转接板第 1 脚，芯片第 1 脚落在它上面
  assert.deepEqual(pinGridPosition(withAdapter, 1), [10, 20]);
  assert.deepEqual(pinGridPosition(withAdapter, 8), [10, 27]);
  assert.deepEqual(pinGridPosition(withAdapter, 9), [15, 27]);
  assert.deepEqual(pinGridPosition(withAdapter, 14), [15, 22]);

  // 16 脚芯片 + 16 脚转接板：板上占的孔就是 16 个排针
  assert.equal(componentPinHoles(withAdapter).length, 16);
});

test("转接板随元件旋转，脚位一起转", () => {
  const chip = dipComponent(16);
  const rotated: PlacedComponent = { ...chip, adapter: ADAPTER_16, rotation: Math.PI / 2 };
  // 原偏移 [0,7]（第 8 脚）旋转 90° 后是 [7,0]
  assert.deepEqual(pinGridPosition(rotated, 8), [17, 20]);
  // 原偏移 [5,7]（第 9 脚）旋转 90° 后是 [7,-5]
  assert.deepEqual(pinGridPosition(rotated, 9), [17, 15]);
});

test("转接板占的孔就是它的排针，数量和芯片脚数一致", () => {
  const chip = dipComponent(16);
  const withAdapter: PlacedComponent = { ...chip, adapter: ADAPTER_16 };
  const holes = componentPinHoles(withAdapter).map(([x, y]) => `${x},${y}`);
  assert.equal(holes.length, 16);
  assert.equal(new Set(holes).size, 16);
  // 第 15、16 脚也在占用列表里
  assert.ok(holes.includes("15,21"));
  assert.equal(chip.pinOffsets.length, 16);
});

test("元件库里有转接板条目，脚位就是它的排针", () => {
  const entry = componentLibrary.find((component) => component.kind === "adapter");
  assert.ok(entry, "元件库缺少转接板");
  assert.ok(entry.adapter);
  assert.equal(entry.pinCount, entry.adapter.pinCount);
  assert.deepEqual(entry.pinOffsets, adapterPinOffsets(entry.adapter));
});

test("转接板按整块板面占位，别的元件不能压上去", () => {
  const chip: PlacedComponent = { ...dipComponent(16), adapter: ADAPTER_16, position: [10, 20] };
  const cells = adapterOccupiedCells(chip);
  assert.ok(cells.size > 0);
  assert.ok(cells.has("10,20"));

  const twoPin = (position: [number, number]): PlacedComponent => ({
    id: "R1",
    kind: "resistor",
    label: "R1",
    name: "R1",
    value: "",
    leadSpacing: 3,
    rowSpacing: 0,
    sameSidePitch: 1,
    pinOffsets: [[0, 0], [3, 0]],
    position,
    rotation: 0,
    mounted: false
  });

  // 落在板面中间 → 碰撞
  assert.equal(componentsOverlap(chip, twoPin([11, 24])), true);
  // 落在板外 → 不碰撞
  assert.equal(componentsOverlap(chip, twoPin([40, 40])), false);
  // 反向也要成立（普通元件先放，之后芯片插过来）
  assert.equal(componentsOverlap(twoPin([11, 24]), chip), true);
});

test("芯片本体居中摆在转接板上，而不是靠 pin1 对齐", () => {
  const chip = dipComponent(16);
  const withAdapter: PlacedComponent = { ...chip, adapter: ADAPTER_16 };
  const centered = centeredChipPinOffsets(withAdapter);
  const center = (offsets: Array<[number, number]>) => {
    const xs = offsets.map(([x]) => x);
    const ys = offsets.map(([, y]) => y);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  };
  const chipCenter = center(centered);
  const adapterCenter = center(adapterPinOffsets(ADAPTER_16));
  assert.deepEqual(chipCenter, adapterCenter);
  // 电气脚位不受居中影响
  assert.deepEqual(componentBoardPinOffsets(withAdapter), adapterPinOffsets(ADAPTER_16));
});
