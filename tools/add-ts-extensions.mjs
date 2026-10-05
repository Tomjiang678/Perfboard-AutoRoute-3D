// Adds explicit .ts/.tsx extensions to extensionless relative imports in
// apps/web/src so the whole source tree is resolvable by Node's ESM loader
// (used by the node --experimental-strip-types test runner). Vite handles
// explicit extensions fine (allowImportingTsExtensions is enabled).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(process.argv[2] ?? "apps/web/src");
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
}
walk(ROOT);

const IMPORT_RE = /(from\s*|import\s*\(\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/g;

let changed = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  let next = text;
  next = next.replace(IMPORT_RE, (match, prefix, specifier) => {
    if (/\.[A-Za-z0-9]+$/.test(specifier)) return match; // already has an extension
    const targetBase = resolve(dirname(file), specifier);
    for (const ext of [".ts", ".tsx", ".d.ts"]) {
      const candidate = targetBase + ext;
      try {
        if (statSync(candidate).isFile()) {
          return `${prefix}"${specifier}${ext}"`;
        }
      } catch {
        /* keep looking */
      }
    }
    // fall back to an index file
    for (const ext of [".ts", ".tsx"]) {
      try {
        if (statSync(join(targetBase, `index${ext}`)).isFile()) {
          return `${prefix}"${specifier}/index${ext}"`;
        }
      } catch {
        /* keep looking */
      }
    }
    return match;
  });
  if (next !== text) {
    writeFileSync(file, next);
    changed += 1;
    console.log("updated", relative(process.cwd(), file));
  }
}
console.log(`done: ${changed} files updated`);
