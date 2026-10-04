export const DEFAULT_PIN_HEADER_ROWS = 1;
export const DEFAULT_PIN_HEADER_COLUMNS = 4;
export const MAX_PIN_HEADER_DIMENSION = 64;
export const MAX_PIN_HEADER_PINS = 512;

export function createPinHeaderDefinition(rows: number, columns: number, pitch = 1) {
  const normalizedRows = normalizeDimension(rows);
  const normalizedColumns = normalizeDimension(columns);
  const pinCount = normalizedRows * normalizedColumns;
  return {
    kind: "pin_header" as const,
    label: "HDR",
    title: `排针 ${normalizedRows}×${normalizedColumns}（${pinCount} 脚）`,
    pinCount,
    leadSpacing: pitch,
    rowSpacing: normalizedRows > 1 ? pitch : 0,
    sameSidePitch: pitch,
    pinHeaderRows: normalizedRows,
    pinHeaderColumns: normalizedColumns,
    pinOffsets: createPinHeaderOffsets(normalizedRows, normalizedColumns, pitch)
  };
}

export function createPinHeaderOffsets(rows: number, columns: number, pitch = 1): Array<[number, number]> {
  const offsets: Array<[number, number]> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      offsets.push([column * pitch, row * pitch]);
    }
  }
  return offsets;
}

function normalizeDimension(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
}
