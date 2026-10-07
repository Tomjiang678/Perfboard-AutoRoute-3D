import assert from "node:assert/strict";
import test from "node:test";
import { createProject } from "../src/features/project/projectFactory.ts";
import { invalidateDrcIfInputsChanged } from "../src/features/project/projectTransitions.ts";
import type { PerfboardProject } from "../src/types/project.ts";

function projectWithDrc(): PerfboardProject {
  const project = createProject("test", { width: 10, height: 10 });
  return {
    ...project,
    routing: {
      ...project.routing,
      warnings: ["route warning", "ERROR INVALID_BOARD_HOLE: old DRC result", "DRC: legacy marker"],
      diagnostics: { failedNetDetails: [] },
      drc: { passed: false, errors: [], warnings: [], pinStatuses: [] }
    }
  };
}

test("component edits invalidate DRC and its legacy warning strings", () => {
  const current = projectWithDrc();
  const next = { ...current, components: [...current.components] };
  const updated = invalidateDrcIfInputsChanged(current, next);

  assert.equal(updated.routing.drc, undefined);
  assert.equal(updated.routing.diagnostics, undefined);
  assert.deepEqual(updated.routing.warnings, ["route warning"]);
});

test("fresh DRC results survive a board edit that recomputed validation", () => {
  const current = projectWithDrc();
  const drc = { ...current.routing.drc!, passed: true };
  const next = {
    ...current,
    board: { ...current.board, width: 12 },
    routing: { ...current.routing, drc }
  };

  assert.equal(invalidateDrcIfInputsChanged(current, next), next);
});

test("unrelated project metadata edits retain the current DRC", () => {
  const current = projectWithDrc();
  const next = { ...current, name: "renamed" };

  assert.equal(invalidateDrcIfInputsChanged(current, next), next);
});
