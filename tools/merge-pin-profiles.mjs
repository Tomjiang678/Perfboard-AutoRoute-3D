#!/usr/bin/env node
/**
 * Merge user-submitted pin profiles into the built-in library.
 *
 *   node tools/merge-pin-profiles.mjs --in submissions/ [--out <json>] [--report <md>]
 *
 * Identical submissions are counted, conflicting ones are reported and never
 * merged automatically. Only identities with at least `--min-confirmations`
 * independent submissions land in the built-in file.
 */
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { mergeSubmissions } from "../apps/web/src/features/import/multisim/mergeSubmissions.ts";

const DEFAULT_OUT = path.join(
  import.meta.dirname,
  "..",
  "apps",
  "web",
  "src",
  "features",
  "import",
  "multisim",
  "multisimProfiles.json"
);
const DEFAULT_REPORT = path.join(process.cwd(), "pin-profile-report.md");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`用法: node tools/merge-pin-profiles.mjs --in <目录或文件> [--in ...] [选项]

选项:
  --out <path>               输出内置库 JSON（默认 ${DEFAULT_OUT}）
  --report <path>            冲突/候选报告（默认 ${DEFAULT_REPORT}）
  --min-confirmations <n>    至少几份独立提交才进内置库（默认 2）
  --help                     显示帮助`);
    return;
  }

  if (args.inputs.length === 0) {
    throw new Error("缺少 --in 输入路径");
  }

  const files = await collectFiles(args.inputs);
  if (files.length === 0) {
    throw new Error(`输入路径里没有 .json/.jsonl 文件：${args.inputs.join(", ")}`);
  }

  const submissions = [];
  let unreadable = 0;
  for (const file of files) {
    try {
      submissions.push(...await readSubmissions(file));
    } catch {
      unreadable += 1;
    }
  }

  const result = mergeSubmissions(submissions, { minConfirmations: args.minConfirmations });
  const library = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    profiles: result.profiles
  };

  await writeFile(args.out, `${JSON.stringify(library, null, 2)}\n`, "utf8");
  await writeFile(args.report, buildReport(result, files, unreadable), "utf8");

  console.log(`文件 ${files.length} 个，提交 ${submissions.length} 条（读取失败 ${unreadable}）`);
  console.log(`内置库 ${result.profiles.length} 个型号 → ${args.out}`);
  console.log(`候选 ${result.stats.candidates}，冲突 ${result.stats.conflicts}，无效 ${result.stats.invalid}`);
  console.log(`报告 → ${args.report}`);
}

function parseArgs(argv) {
  const args = { inputs: [], out: DEFAULT_OUT, report: DEFAULT_REPORT, minConfirmations: 2, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--in") {
      args.inputs.push(requireValue(argv, (index += 1), "--in"));
    } else if (arg === "--out") {
      args.out = path.resolve(requireValue(argv, (index += 1), "--out"));
    } else if (arg === "--report") {
      args.report = path.resolve(requireValue(argv, (index += 1), "--report"));
    } else if (arg === "--min-confirmations") {
      args.minConfirmations = Math.max(1, Number(requireValue(argv, (index += 1), "--min-confirmations")));
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} 需要一个值`);
  }
  return value;
}

async function collectFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    const target = path.resolve(input);
    const info = await stat(target);
    if (info.isDirectory()) {
      await walk(target, files);
    } else {
      files.push(target);
    }
  }
  return files;
}

async function walk(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(target, files);
    } else if (/\.(json|jsonl)$/i.test(entry.name)) {
      files.push(target);
    }
  }
}

async function readSubmissions(file) {
  const text = await readFile(file, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    return normalize(JSON.parse(trimmed));
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return normalize(JSON.parse(line));
        } catch {
          return [];
        }
      });
  }
}

function normalize(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    if (Array.isArray(value.submissions)) return value.submissions;
    if (Array.isArray(value.profiles)) return value.profiles;
    return [value];
  }
  return [];
}

function buildReport(result, files, unreadable) {
  const lines = [
    "# Pin profile merge report",
    "",
    `- 输入文件：${files.length}`,
    `- 有效提交：${result.stats.submissions}`,
    `- 无效提交：${result.stats.invalid}`,
    `- 读取失败文件：${unreadable}`,
    `- 型号数：${result.stats.identities}`,
    `- 已入库：${result.stats.verified}`,
    `- 候选（未达确认数）：${result.stats.candidates}`,
    `- 冲突：${result.stats.conflicts}`,
    ""
  ];

  lines.push("## 冲突", "");
  if (result.conflicts.length === 0) {
    lines.push("无。", "");
  } else {
    for (const conflict of result.conflicts) {
      lines.push(`### ${conflict.identity.value} · ${conflict.identity.package || "-"}`, "");
      for (const variant of conflict.variants) {
        const pins = variant.pins
          .filter((pin) => pin.logical)
          .map((pin) => `${pin.unit ? `${pin.unit}:` : ""}${pin.logical}=${pin.physical}`)
          .join(", ");
        lines.push(`- ${variant.submissions} 份 · ${variant.pinCount} 脚 · ${pins || "无映射"}`, "");
      }
    }
  }

  lines.push("## 候选", "");
  if (result.candidates.length === 0) {
    lines.push("无。", "");
  } else {
    for (const candidate of result.candidates) {
      lines.push(`- ${candidate.identity.value} · ${candidate.identity.package || "-"} · ${candidate.submissions} 份`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
