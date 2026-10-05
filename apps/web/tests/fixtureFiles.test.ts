import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseKicadNetlist } from "../src/features/import/kicadNetlistParser.ts";
import { createPlacedComponentsFromParsed } from "../src/features/import/componentMapping.ts";
import { resolveNetEndpoints } from "../src/features/import/netEndpointResolver.ts";
import { autoRouteBoard, validateRoutingResult } from "../src/features/routing/autoRouter.ts";
import { autoPlaceComponents } from "../src/features/layout/autoPlacement.ts";
import { createBreadboardDefinition } from "../src/features/board/breadboard.ts";
import { normalizeBoardDefinition } from "../src/features/board/factory.ts";
import type { BoardSize, ImportState } from "../src/types/project.ts";

function fixturePath(name: string) {
  return new URL(`../../../docs/test-netlists/${name}`, import.meta.url);
}

async function runFixture(board: BoardSize, name: string) {
  const text = await readFile(fixturePath(name), "utf8");
  const bundle = parseKicadNetlist(text, name);
  const importState: ImportState = { components: bundle.components, nets: bundle.nets, warnings: bundle.warnings, pinInfo: bundle.pinInfo };
  const components = createPlacedComponentsFromParsed(importState, [], board.width);
  const endpoints = resolveNetEndpoints(importState, components);
  const placed = autoPlaceComponents(components, { x: 0, y: 0, width: board.width, height: board.height }, board.width, board.height, endpoints, [], undefined, board);
  const finalEndpoints = resolveNetEndpoints(importState, placed.components);
  const routing = autoRouteBoard(board, finalEndpoints, placed.components);
  return { validate: validateRoutingResult(board, routing, finalEndpoints, placed.components), bundle };
}

for (const seed of [1, 2, 3]) {
  test(`fixture-${seed}.net parses and routes cleanly on breadboard`, async () => {
    const board = createBreadboardDefinition(40, 1);
    const { validate, bundle } = await runFixture(board, `fixture-${seed}.net`);
    assert.equal(bundle.warnings.length, 0);
    assert.equal(validate.drc.errors.length, 0);
    const reds = validate.drc.pinStatuses.filter((status) => status.status !== "CONNECTED" && status.status !== "NO_NET_UNUSED");
    assert.equal(reds.length, 0);
  });
}

for (const seed of [1, 2, 3]) {
  test(`fixture-${seed}.net parses and routes cleanly on perfboard`, async () => {
    const board = normalizeBoardDefinition({ kind: "perfboard", width: 40, height: 26 });
    const { validate, bundle } = await runFixture(board, `fixture-${seed}.net`);
    assert.equal(bundle.warnings.length, 0);
    assert.equal(validate.drc.errors.length, 0);
    const reds = validate.drc.pinStatuses.filter((status) => status.status !== "CONNECTED" && status.status !== "NO_NET_UNUSED");
    assert.equal(reds.length, 0);
  });
}
