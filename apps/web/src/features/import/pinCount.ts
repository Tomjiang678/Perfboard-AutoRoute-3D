/**
 * 封装名 → 物理脚数。
 *
 * 只认“封装名里的数字就是引脚数”的系列；TO-220、SOT-23 这类名字里的数字是
 * 封装尺寸，不能当脚数。Multisim 的 `PDIP-P-8` 也要认（KiCad 风格的
 * `DIP-8` 之外多一个 `-P-` 段）。
 */
const LEAD_COUNT_FAMILIES =
  "TSSOP|SSOP|MSOP|QSOP|SOIC|SOP|SOJ|TQFP|LQFP|QFP|PLCC|QFN|DFN|BGA|PDIP|DIP";
const LEAD_COUNT_PATTERN = new RegExp(
  `\\b(?:${LEAD_COUNT_FAMILIES})[-_ ]?(?:P[-_ ]?)?(\\d{1,3})(?!\\d)`,
  "i"
);

const FIXED_PACKAGE_COUNTS: Array<[RegExp, number]> = [
  [/^TO-?3(?:\b|$)/i, 2],
  [/^TO-?(?:92|39|126|220|247|251)\b/i, 3],
  [/^DO-?(?:35|41)\b/i, 2],
  [/^SOD-?(?:123|323)\b/i, 2],
  [/^SOT-?23\b/i, 3],
  [/^SOT-?223\b/i, 4],
  [/^SOT-?89\b/i, 3],
  [/^HC-?49/i, 2]
];

const HEADER_PATTERN = /^(?:HDR|HEADER)[-_ ]?(\d{1,3})X(\d{1,2})/i;
const CONNECTOR_PATTERN = /^(?:CONN|CONNECTOR)[-_ ]?(\d{1,3})X(\d{1,2})/i;
const PIN_HEADER_PATTERN = /^PINHEADER[-_ ]?(\d{1,3})X(\d{1,2})/i;

export function suggestPinCountFromPackage(packageName: string): number | undefined {
  const name = packageName.trim().toUpperCase();
  if (!name || name === "-") {
    return undefined;
  }

  const header = name.match(HEADER_PATTERN) ?? name.match(CONNECTOR_PATTERN) ?? name.match(PIN_HEADER_PATTERN);
  if (header) {
    return clampCount(Number(header[1]) * Number(header[2]));
  }

  for (const [pattern, count] of FIXED_PACKAGE_COUNTS) {
    if (pattern.test(name)) {
      return count;
    }
  }

  const leads = name.match(LEAD_COUNT_PATTERN);
  return leads ? clampCount(Number(leads[1])) : undefined;
}

function clampCount(value: number) {
  return Number.isInteger(value) && value >= 2 && value <= 256 ? value : undefined;
}
