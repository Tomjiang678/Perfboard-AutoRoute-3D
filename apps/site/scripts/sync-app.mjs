import { cp, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copies the built app (`apps/web/dist`) into the site's output as `/app/`, so
 * one deployable folder serves both the marketing pages and the tool itself.
 * Run automatically by `npm run build`.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const source = path.resolve(siteRoot, "..", "web", "dist");
const target = path.join(siteRoot, "dist", "app");

async function readable(file) {
  try {
    await access(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

if (!(await readable(path.join(source, "index.html")))) {
  console.warn("[sync-app] 没有找到 apps/web/dist/index.html，跳过嵌入。");
  console.warn("[sync-app] 先构建应用：cd apps/web && npm run build");
} else {
  await cp(source, target, { recursive: true });
  console.log(`[sync-app] 已复制 ${path.relative(siteRoot, source)} → dist/app`);
}
