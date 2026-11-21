import type { ImportWarning, NetNode, ParsedComponent, ParsedNet } from "../../../types/project.ts";
import { isProtelNetlist } from "../protelNetlist.ts";
import { isMultisimPowerCategory, translateMultisimCategory } from "./multisimCategory.ts";

export interface MultisimFileInput {
  name: string;
  text: string;
}

export interface MultisimParseResult {
  components: ParsedComponent[];
  nets: ParsedNet[];
  warnings: ImportWarning[];
  /** Refs Multisim treats as power symbols; their netlist nodes are not parts. */
  powerRefs: string[];
}

/** Fixed-width report: columns are separated by two or more spaces (or tabs). */
const COLUMN_GAP = /\t+|\s{2,}/;
const DIVIDER = /^-{5,}\s*$/;
const REF_PATTERN = /^([A-Za-z]+[0-9]+)([A-Z])?$/;
const MAX_COLUMNS = 8;

/**
 * Cross-reference report: a "RefDes" header plus a run of dashed dividers.
 * The visible header text is often mojibake (`_uc…`), so only the token
 * "RefDes" is trusted — everything else is positional.
 */
export function isMultisimCrossRef(text: string) {
  return /^\s*RefDes\b/m.test(text) && /^-{5,}\s*$/m.test(text);
}

/**
 * Netlist report: four columns (net, sheet, refdes, logical pin) and no
 * S-expression / Protel markers. Cells are counted rather than matched by
 * header text because the header is unreadable in real exports.
 */
export function isMultisimNetlist(text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("(") || isProtelNetlist(text) || isMultisimCrossRef(text)) {
    return false;
  }

  let rows = 0;
  for (const line of trimmed.split(/\r?\n/)) {
    if (DIVIDER.test(line.trim())) continue;
    const columns = splitColumns(line);
    if (columns.length < 4) continue;
    if (!parseMultisimRef(columns[2] ?? "") || !columns[3]) continue;
    rows += 1;
  }
  return rows >= 2;
}

export function isMultisimFile(text: string) {
  return isMultisimCrossRef(text) || isMultisimNetlist(text);
}

/** `U1A` → base ref `U1` + unit `A`; unrelated tokens (mojibake, headers) → undefined. */
export function parseMultisimRef(raw: string): { ref: string; unit?: string } | undefined {
  const match = raw.trim().match(REF_PATTERN);
  if (!match) return undefined;
  return { ref: match[1].toUpperCase(), unit: match[2]?.toUpperCase() };
}

/**
 * Parses the Multisim files of one import as a bundle: the netlist supplies
 * connectivity, the cross-reference supplies part identity. Power symbols are
 * dropped from both (they are nets, not parts), and rows without a valid
 * refdes are reported instead of becoming phantom components.
 */
export function parseMultisimFiles(files: MultisimFileInput[]): MultisimParseResult {
  const components = new Map<string, ParsedComponent>();
  const powerRefs = new Set<string>();
  const nets = new Map<string, ParsedNet>();
  const warnings: ImportWarning[] = [];
  let sawCrossRef = false;
  let sawNetlist = false;
  let sawUnknown = false;

  for (const file of files) {
    if (isMultisimCrossRef(file.text)) {
      sawCrossRef = true;
      parseCrossRef(file, components, powerRefs);
    } else if (isMultisimNetlist(file.text)) {
      sawNetlist = true;
      parseNetlist(file, nets);
    } else {
      sawUnknown = true;
      warnings.push({ fileName: file.name, message: "无法识别的 Multisim 报告（需要网表或交叉引用报告）", code: "unrecognized_file" });
    }
  }

  if (sawCrossRef && components.size === 0) {
    warnings.push({ fileName: files[0]?.name ?? "", message: "交叉引用报告里没有可用的元件行" });
  }
  if (!sawCrossRef) {
    warnings.push({ fileName: files[0]?.name ?? "", message: "缺少交叉引用报告，无法确定元件型号与封装", code: "missing_crossref" });
  }
  if (!sawNetlist) {
    warnings.push({ fileName: files[0]?.name ?? "", message: "缺少网表报告，无法确定连接关系", code: "missing_netlist" });
  }

  const knownRefs = new Set(components.keys());
  const missingRefs = new Set<string>();

  for (const net of nets.values()) {
    net.nodes = net.nodes.filter((node) => {
      if (powerRefs.has(node.ref)) return false;
      if (knownRefs.size === 0) return true;
      if (!knownRefs.has(node.ref)) {
        missingRefs.add(node.ref);
        return false;
      }
      return true;
    });
  }
  for (const [name, net] of nets) {
    if (net.nodes.length === 0) nets.delete(name);
  }

  if (missingRefs.size > 0) {
    warnings.push({
      fileName: files[0]?.name ?? "",
      message: `网络引用了元件表中不存在的位号：${[...missingRefs].sort().join(", ")}`
    });
  }
  if (sawUnknown && !sawCrossRef && !sawNetlist) {
    return { components: [], nets: [], warnings, powerRefs: [...powerRefs] };
  }

  return {
    components: [...components.values()],
    nets: [...nets.values()],
    warnings,
    powerRefs: [...powerRefs]
  };
}

function parseCrossRef(
  file: MultisimFileInput,
  components: Map<string, ParsedComponent>,
  powerRefs: Set<string>
) {
  for (const line of file.text.split(/\r?\n/)) {
    const columns = splitColumns(line);
    if (columns.length < 3) continue;
    if (columns[0].toLowerCase() === "refdes") continue;

    const category = columns[2] ?? "";
    if (isMultisimPowerCategory(category) || columns[0] === "0") {
      powerRefs.add(columns[0].toUpperCase());
      continue;
    }

    const parsed = parseMultisimRef(columns[0]);
    if (!parsed) continue;

    components.set(parsed.ref, {
      ref: parsed.ref,
      value: columns[1] ?? "",
      category: translateMultisimCategory(category),
      packageName: normalizePackage(columns[3] ?? ""),
      sourceFile: file.name,
      format: "multisim"
    });
  }
}

function parseNetlist(file: MultisimFileInput, nets: Map<string, ParsedNet>) {
  for (const line of file.text.split(/\r?\n/)) {
    const columns = splitColumns(line);
    if (columns.length < 4) continue;

    const parsed = parseMultisimRef(columns[2] ?? "");
    const pin = (columns[3] ?? "").trim();
    if (!parsed || !pin) continue;

    const name = columns[0];
    const net = nets.get(name) ?? { name, nodes: [], sourceFile: file.name };
    if (!net.nodes.some((node) => node.ref === parsed.ref && (node.unit ?? "") === (parsed.unit ?? "") && node.pin === pin)) {
      net.nodes.push({
        ref: parsed.ref,
        pin,
        logicalPin: pin,
        unit: parsed.unit,
        sourceFile: file.name
      } satisfies NetNode);
    }
    nets.set(name, net);
  }
}

function splitColumns(line: string) {
  return line
    .trim()
    .split(COLUMN_GAP)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_COLUMNS);
}

function normalizePackage(raw: string) {
  const value = raw.trim();
  return value === "-" ? "" : value;
}
