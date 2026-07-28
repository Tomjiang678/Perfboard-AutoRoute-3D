#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pinLibraryOverridesPath = path.join(repoRoot, "apps", "web", "src", "features", "import", "pinLibraryOverrides.json");
const importBehaviorPath = path.join(repoRoot, "apps", "web", "src", "features", "import", "importBehaviorData.json");

main();

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.type) {
      printHelp();
      process.exit(args.help ? 0 : 1);
    }

    const value = readInputJson(args);
    const changed = applyJson(args, value);
    if (!changed) {
      console.log("没有变化：相同规则或映射已经存在。");
      return;
    }

    console.log("已写入。");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--type") {
      args.type = argv[index + 1];
      index += 1;
    } else if (arg === "--json") {
      args.json = argv[index + 1];
      index += 1;
    } else if (arg === "--file") {
      args.file = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--clipboard") {
      args.clipboard = true;
    } else if (arg === "--name") {
      args.name = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`用法：
  node tools/add-import-json.mjs --type pin-model --json "{...}"
  node tools/add-import-json.mjs --type pin-template --name dual_opamp_8 --file template.json
  node tools/add-import-json.mjs --type ignored-rule --clipboard
  node tools/add-import-json.mjs --type simple-rule --json "{...}"

类型：
  pin-model      追加或替换 apps/web/src/features/import/pinLibraryOverrides.json 里的 devicePinModels
  pin-template   写入 pinLibraryOverrides.json 里的 pinModelTemplates，必须带 --name
  ignored-rule   追加 importBehaviorData.json 里的 ignoredComponentRules
  simple-rule    追加 importBehaviorData.json 里的 simplePinResolverRules

输入来源三选一：--json、--file、--clipboard。JSON 可以是单个对象，也可以是对象数组。`);
}

function readInputJson(args) {
  const sources = [args.json !== undefined, args.file !== undefined, args.clipboard === true].filter(Boolean).length;
  if (sources !== 1) {
    throw new Error("必须且只能选择一个输入来源：--json、--file、--clipboard。");
  }

  const text = (args.json ?? (args.file ? fs.readFileSync(args.file, "utf8") : readClipboard())).replace(/^\uFEFF/, "");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function readClipboard() {
  if (process.platform !== "win32") {
    throw new Error("当前只实现了 Windows 剪贴板读取；其他平台请用 --json 或 --file。");
  }
  return execFileSync("powershell.exe", ["-NoProfile", "-Command", "Get-Clipboard -Raw"], {
    encoding: "utf8"
  });
}

function applyJson(args, value) {
  if (args.type === "pin-model") {
    return appendPinModels(asArray(value));
  }
  if (args.type === "pin-template") {
    if (!args.name) {
      throw new Error("--type pin-template 必须同时提供 --name。");
    }
    return setPinTemplate(args.name, value);
  }
  if (args.type === "ignored-rule") {
    return appendBehaviorRules("ignoredComponentRules", asArray(value));
  }
  if (args.type === "simple-rule") {
    return appendBehaviorRules("simplePinResolverRules", asArray(value));
  }

  throw new Error(`未知类型：${args.type}`);
}

function appendPinModels(models) {
  const library = readJson(pinLibraryOverridesPath);
  library.devicePinModels = library.devicePinModels ?? [];
  let changed = false;
  for (const model of models) {
    validateObject(model, "pin-model");
    if (!model.match) {
      throw new Error("pin-model 必须包含 match 字段。");
    }
    const index = library.devicePinModels.findIndex((existing) => existing.match === model.match);
    if (index >= 0) {
      if (stableStringify(library.devicePinModels[index]) === stableStringify(model)) {
        continue;
      }
      library.devicePinModels[index] = model;
    } else {
      library.devicePinModels.push(model);
    }
    changed = true;
  }
  if (changed) {
    writeJson(pinLibraryOverridesPath, library);
    console.log(`已更新 ${path.relative(repoRoot, pinLibraryOverridesPath)}`);
  }
  return changed;
}

function setPinTemplate(name, template) {
  validateObject(template, "pin-template");
  const library = readJson(pinLibraryOverridesPath);
  library.pinModelTemplates = library.pinModelTemplates ?? {};
  if (stableStringify(library.pinModelTemplates[name]) === stableStringify(template)) {
    return false;
  }
  library.pinModelTemplates[name] = template;
  writeJson(pinLibraryOverridesPath, library);
  console.log(`已更新 ${path.relative(repoRoot, pinLibraryOverridesPath)}`);
  return true;
}

function appendBehaviorRules(key, rules) {
  const behavior = readJson(importBehaviorPath);
  behavior[key] = behavior[key] ?? [];
  let changed = false;
  const existing = new Set(behavior[key].map(stableStringify));
  for (const rule of rules) {
    validateObject(rule, key);
    const serialized = stableStringify(rule);
    if (existing.has(serialized)) {
      continue;
    }
    behavior[key].push(rule);
    existing.add(serialized);
    changed = true;
  }
  if (changed) {
    writeJson(importBehaviorPath, behavior);
    console.log(`已更新 ${path.relative(repoRoot, importBehaviorPath)}`);
  }
  return changed;
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function validateObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是 JSON 对象。`);
  }
}

function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
