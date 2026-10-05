import type { PlacementRegion } from "../autoPlacement.ts";
import type { BoardKind } from "../../../types/project.ts";

interface PlacementRegionFieldsProps {
  boardWidth: number;
  boardHeight: number;
  boardKind: BoardKind;
  disabled: boolean;
  values: PlacementRegion;
  onChange: {
    setX: (value: number) => void;
    setY: (value: number) => void;
    setWidth: (value: number) => void;
    setHeight: (value: number) => void;
  };
}

export function PlacementRegionFields({ boardWidth, boardHeight, boardKind, disabled, values, onChange }: PlacementRegionFieldsProps) {
  if (boardKind === "breadboard") {
    // Breadboard width is fixed; only the row range of the region is configurable.
    return (
      <div className="field-grid">
        <NumberField label="起点 Y" min={0} max={boardHeight - 1} value={values.y} disabled={disabled} onChange={onChange.setY} />
        <NumberField label="区域高" min={1} max={boardHeight} value={values.height} disabled={disabled} onChange={onChange.setHeight} />
      </div>
    );
  }

  return (
    <div className="field-grid">
      <NumberField label="起点 X" min={0} max={boardWidth - 1} value={values.x} disabled={disabled} onChange={onChange.setX} />
      <NumberField label="起点 Y" min={0} max={boardHeight - 1} value={values.y} disabled={disabled} onChange={onChange.setY} />
      <NumberField label="区域宽" min={1} max={boardWidth} value={values.width} disabled={disabled} onChange={onChange.setWidth} />
      <NumberField label="区域高" min={1} max={boardHeight} value={values.height} disabled={disabled} onChange={onChange.setHeight} />
    </div>
  );
}

function NumberField({ label, min, max, value, disabled, onChange }: {
  label: string;
  min: number;
  max: number;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(toNumber(event.target.value))}
      />
    </label>
  );
}

function toNumber(value: string) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, Math.round(next)) : 0;
}

