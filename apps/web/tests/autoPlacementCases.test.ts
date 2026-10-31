import assert from "node:assert/strict";
import test from "node:test";
import { autoPlaceComponents, type AutoPlacementProgress } from "../src/features/layout/autoPlacement.ts";
import { resolveNetEndpoints } from "../src/features/import/netEndpointResolver.ts";
import { createBreadboardDefinition } from "../src/features/board/breadboard.ts";
import { createBoardModel, normalizeBoardDefinition } from "../src/features/board/factory.ts";
import { rotateGridOffset } from "../src/features/board/placement.ts";
import { generateCircuit } from "./helpers/netlistFactory.ts";
import { parseKicadNetlist } from "../src/features/import/kicadNetlistParser.ts";
import { createPlacedComponentsFromParsed } from "../src/features/import/componentMapping.ts";
import type { DesignConstraint, ImportState, PlacedComponent } from "../src/types/project.ts";

function pipeline(seed: number, boardWidth: number, boardHeight: number, region: { x: number; y: number; width: number; height: number }, constraints: DesignConstraint[] = [], reportProgress?: (progress: AutoPlacementProgress) => void) {
  const board = createBreadboardDefinition(boardHeight, 1);
  const circuit = generateCircuit(seed);
  const bundle = parseKicadNetlist(circuit.text, `s${seed}.net`);
  const importState: ImportState = { components: bundle.components, nets: bundle.nets, warnings: bundle.warnings, pinInfo: bundle.pinInfo };
  const components = createPlacedComponentsFromParsed(importState, [], boardWidth);
  const endpoints = resolveNetEndpoints(importState, components);
  const placed = autoPlaceComponents(components, region, boardWidth, boardHeight, endpoints, constraints, reportProgress, board);
  return { board, importState, placed, endpoints };
}

test("auto-placement keeps full route evaluations within its fixed budget", () => {
  let fullRouteEvaluations = 0;
  pipeline(1, 18, 40, { x: 0, y: 0, width: 18, height: 40 }, [], (progress) => {
    if (progress.routeEvaluation === "full") fullRouteEvaluations += 1;
  });
  assert.ok(fullRouteEvaluations <= 32, `used ${fullRouteEvaluations} full route evaluations`);
});

function keepout(region: { x: number; y: number; width: number; height: number }): DesignConstraint {
  return {
    id: "keepout-1", kind: "region_keepout", strength: "hard",
    status: "active", enabled: true, sourceText: "", explanation: "keep",
    createdAt: "",
    region,
    blockPlacement: true, blockBottomRouting: true, blockJumpers: false
  };
}

for (let seed = 1; seed <= 6; seed += 1) {
  test(`auto-placement seed ${seed} places every component on valid breadboard holes`, () => {
    const { board, placed } = pipeline(seed, 18, 40, { x: 0, y: 0, width: 18, height: 40 });
    const model = createBoardModel(board);
    assert.equal(placed.warnings.length, 0);
    assert.equal(placed.components.length, 9);
    for (const component of placed.components) {
      const validation = model.validatePlacement(component, {});
      assert.equal(validation.valid, true, `${component.name}: ${validation.issues.map((i) => i.code).join(",")}`);
    }
  });
}

test("auto-placement keeps unplaced components inside the region or reports them", () => {
  const { placed } = pipeline(2, 18, 40, { x: 0, y: 10, width: 18, height: 15 });
  for (const component of placed.components) {
    const inside = component.position[1] >= 10 && component.position[1] < 25;
    const reported = placed.unplaced.includes(component.name);
    assert.ok(inside || reported, `${component.name} at ${component.position} 既不在区域内，也没有被报告为放不下`);
  }
});

test("auto-placement reports every component it could not place", () => {
  const { placed } = pipeline(2, 18, 40, { x: 0, y: 10, width: 18, height: 15 });
  assert.ok(placed.unplaced.length > 0, "这组数据本来就放不下，应当报告 unplaced");
  for (const name of placed.unplaced) {
    const component = placed.components.find((item) => item.name === name);
    assert.ok(component, `${name} 不在结果里`);
    assert.equal(component.mounted, false, `${name} 被报告为放不下，却标记成已放置`);
  }
  for (const component of placed.components.filter((item) => item.mounted)) {
    assert.ok(!placed.unplaced.includes(component.name), `${component.name} 同时出现在已放置和放不下列表里`);
  }
});

test("auto-placement never overlaps two components", () => {
  const { placed } = pipeline(3, 18, 40, { x: 0, y: 0, width: 18, height: 40 });
  const holes = new Set<string>();
  for (const component of placed.components) {
    for (const offset of component.pinOffsets) {
      const hole = `${component.position[0] + offset[0]},${component.position[1] + offset[1]}`;
      assert.ok(!holes.has(hole), `hole ${hole} reused`);
      holes.add(hole);
    }
  }
});

test("DIP chips straddle the center channel after auto-placement", () => {
  const { placed } = pipeline(4, 18, 40, { x: 0, y: 0, width: 18, height: 40 });
  const dips = placed.components.filter((component) => component.kind === "dip");
  assert.equal(dips.length, 2);
  for (const dip of dips) {
    const xs = dip.pinOffsets.map((_, index) => {
      const anchor = dip.pinOffsets[0];
      const offset = dip.pinOffsets[index];
      const [dx, dy] = rotateGridOffset([offset[0] - anchor[0], offset[1] - anchor[1]], dip.rotation);
      return dip.position[0] + dx;
    });
    assert.ok(xs.some((x) => x <= 7) && xs.some((x) => x >= 10), `${dip.name} pins at ${[...new Set(xs)].sort().join(",")}`);
  }
});

test("region keepout blocks placement inside the region", () => {
  const constraint = keepout({ x: 0, y: 10, width: 18, height: 10 });
  const { placed } = pipeline(5, 18, 40, { x: 0, y: 0, width: 18, height: 40 }, [constraint]);
  for (const component of placed.components) {
    const y = component.position[1];
    assert.ok(!(y >= 10 && y < 20), `${component.name} inside keepout at y=${y}`);
  }
});

test("mounted (locked) components keep their positions", () => {
  const board = createBreadboardDefinition(40, 1);
  const circuit = generateCircuit(6);
  const bundle = parseKicadNetlist(circuit.text, "s6.net");
  const importState: ImportState = { components: bundle.components, nets: bundle.nets, warnings: bundle.warnings, pinInfo: bundle.pinInfo };
  const components = createPlacedComponentsFromParsed(importState, [], 18);
  const locked: PlacedComponent = {
    ...components[0],
    position: [3, 5],
    rotation: 0,
    mounted: true
  };
  const rest = components.slice(1);
  const endpoints = resolveNetEndpoints(importState, [locked, ...rest]);
  const placed = autoPlaceComponents([locked, ...rest], { x: 0, y: 0, width: 18, height: 40 }, 18, 40, endpoints, [], undefined, board);
  const placedLocked = placed.components.find((component) => component.id === locked.id);
  assert.deepEqual(placedLocked?.position, [3, 5]);
});

for (let seed = 1; seed <= 4; seed += 1) {
  test(`perfboard auto-placement seed ${seed} keeps all pins on the board`, () => {
    const board = normalizeBoardDefinition({ kind: "perfboard", width: 30, height: 24 });
    const circuit = generateCircuit(seed);
    const bundle = parseKicadNetlist(circuit.text, `p${seed}.net`);
    const importState: ImportState = { components: bundle.components, nets: bundle.nets, warnings: bundle.warnings, pinInfo: bundle.pinInfo };
    const components = createPlacedComponentsFromParsed(importState, [], 30);
    const endpoints = resolveNetEndpoints(importState, components);
    const placed = autoPlaceComponents(components, { x: 0, y: 0, width: 30, height: 24 }, 30, 24, endpoints, [], undefined, board);
    assert.equal(placed.warnings.length, 0);
    for (const component of placed.components) {
      for (const offset of component.pinOffsets) {
        const x = component.position[0] + offset[0];
        const y = component.position[1] + offset[1];
        assert.ok(x >= 0 && x < 30 && y >= 0 && y < 24, `${component.name} pin at ${x},${y}`);
      }
    }
  });
}

test("endpoints stay resolvable after auto-placement", () => {
  const { importState, placed } = pipeline(1, 18, 40, { x: 0, y: 0, width: 18, height: 40 });
  const endpoints = resolveNetEndpoints(importState, placed.components);
  assert.ok(endpoints.length >= 16);
  const refs = new Set(endpoints.map((endpoint) => endpoint.ref));
  assert.ok(refs.has("U1") && refs.has("U2") && refs.has("J1"));
});
