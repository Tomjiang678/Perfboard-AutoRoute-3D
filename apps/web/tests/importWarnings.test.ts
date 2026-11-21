import assert from "node:assert/strict";
import test from "node:test";
import { pruneResolvedBundleWarnings, stripBundleWarnings } from "../src/features/import/importWarnings.ts";
import type { ImportState, ImportWarning } from "../src/types/project.ts";

function warnings(): ImportWarning[] {
  return [
    { fileName: "netlist.txt", message: "缺少交叉引用报告", code: "missing_crossref" },
    { fileName: "cross.txt", message: "缺少网表报告", code: "missing_netlist" },
    { fileName: "x.txt", message: "无法识别", code: "unrecognized_file" },
    { fileName: "x.txt", message: "普通警告" },
    { fileName: "old.txt", message: "缺少交叉引用报告，无法确定元件型号与封装" }
  ];
}

function state(overrides: Partial<ImportState> = {}): ImportState {
  return {
    components: [{ ref: "R1", value: "1k", category: "Device:R", packageName: "", sourceFile: "cross.txt" }],
    nets: [{ name: "1", nodes: [{ ref: "R1", pin: "1", logicalPin: "1" }] }],
    warnings: warnings(),
    ...overrides
  };
}

test("bundle-level warnings are stripped without touching per-file warnings", () => {
  const result = stripBundleWarnings(warnings());
  assert.deepEqual(result.map((warning) => warning.code ?? "none"), ["unrecognized_file", "none"]);
});
test("resolved imports drop stale missing-half warnings", () => {
  const result = pruneResolvedBundleWarnings(state());
  assert.deepEqual(result.warnings.map((warning) => warning.code ?? "none"), ["unrecognized_file", "none"]);
});

test("an incomplete import keeps its missing-half warning", () => {
  const result = pruneResolvedBundleWarnings(state({ components: [] }));
  assert.equal(result.warnings.length, 5);
});
