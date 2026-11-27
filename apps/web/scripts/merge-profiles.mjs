/**
 * 把服务器上收集到的 submissions.jsonl 合并成 builtin 映射库。
 *
 *   node --experimental-strip-types apps/web/scripts/merge-profiles.mjs \
 *     --in submissions.jsonl \
 *     --out apps/web/src/features/import/multisim/multisimProfiles.json \
 *     --min-confirmations 2
 *
 * 合并逻辑复用前端同一份 mergeSubmissions（不重新实现），
 * 输出格式就是 library.ts 读取的 { schemaVersion, generatedAt, profiles }。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { mergeSubmissions } from "../src/features/import/multisim/mergeSubmissions.ts";

function parseArgs(argv) {
  const args = { in: "", out: "", minConfirmations: 2 };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--in") { args.in = value; index += 1; }
    else if (key === "--out") { args.out = value; index += 1; }
    else if (key === "--min-confirmations") { args.minConfirmations = Number(value); index += 1; }
  }
  if (!args.in || !args.out) {
    console.error("用法: --in <submissions.jsonl> --out <multisimProfiles.json> [--min-confirmations N]");
    process.exit(1);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const lines = readFileSync(args.in, "utf8").split("\n").filter((line) => line.trim().length > 0);
const submissions = [];
for (const line of lines) {
  try {
    submissions.push(JSON.parse(line));
  } catch {
    // 坏行直接跳过
  }
}

const result = mergeSubmissions(submissions, { minConfirmations: args.minConfirmations });

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  profiles: result.profiles
};

writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  submissions: result.stats.submissions,
  invalid: result.stats.invalid,
  identities: result.stats.identities,
  verified: result.stats.verified,
  candidates: result.stats.candidates,
  conflicts: result.stats.conflicts,
  written: result.profiles.length
}, null, 2));
