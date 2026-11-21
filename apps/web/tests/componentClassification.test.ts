import assert from "node:assert/strict";
import test from "node:test";
import { classifyParsedComponent } from "../src/features/import/componentMapping.ts";
import type { ParsedComponent } from "../src/types/project.ts";

function part(ref: string, value: string, category: string, pinCount: number): ParsedComponent {
  return { ref, value, category, packageName: "", sourceFile: "x", pinCount };
}

test("a real connector stays a normal header", () => {
  const result = classifyParsedComponent(part("J1", "Conn_01x04", "Connector:Conn_01x04", 4));
  assert.equal(result.kind, "pin_header");
  assert.equal(result.placeholder, undefined);
});

test("a relay mislabeled as a connector becomes a warning placeholder", () => {
  const result = classifyParsedComponent(part("K1", "G5V-1", "Connector:Conn_01x05", 5));
  assert.equal(result.kind, "pin_header");
  assert.equal(result.placeholder, true);
  assert.match(result.fallbackReason ?? "", /更像 RLY/);
});

test("a transistor mislabeled as a connector becomes a warning placeholder", () => {
  const result = classifyParsedComponent(part("U2", "BC547", "Connector:Conn_01x03", 3));
  assert.equal(result.kind, "pin_header");
  assert.equal(result.placeholder, true);
  assert.match(result.fallbackReason ?? "", /更像 DIP3/);
});
