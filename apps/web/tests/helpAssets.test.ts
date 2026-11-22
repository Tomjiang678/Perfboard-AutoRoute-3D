import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import test from "node:test";

const expected = [
  "01-workspace.png",
  "03-mapping.png",
  "04-library.png",
  "05-manual.png",
  "06-auto-place.png",
  "07-routing.png",
  "08-ai-constraints.png",
  "09-package-editor.png",
  "10-pin-highlight.png",
  "10-pin-axis.png",
  "11-settings.png"
];

test("every help chapter has a real screenshot asset", async () => {
  const dir = new URL("../public/help/", import.meta.url);
  const files = new Set(await readdir(dir));
  for (const name of expected) {
    assert.equal(files.has(name), true, `${name} is missing`);
    const info = await stat(new URL(name, dir));
    assert.ok(info.size > 20_000, `${name} is too small to be a real screenshot`);
  }
});
