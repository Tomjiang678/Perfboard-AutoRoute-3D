import { pinBend } from "../model/pinBend.ts";
import type { UserPackageBendDirection, UserPackageDraft, UserPackageShape } from "../model/types.ts";

interface PackageEditorInspectorProps {
  draft: UserPackageDraft;
  selectedShape?: UserPackageShape;
  onUpdate: (id: string, patch: Partial<Omit<UserPackageShape, "id" | "kind">>) => void;
  onSelect: (id: string) => void;
}

export function PackageEditorInspector({ draft, selectedShape, onUpdate, onSelect }: PackageEditorInspectorProps) {
  const pins = draft.shapes.filter((shape): shape is Extract<UserPackageShape, { kind: "pin" }> => shape.kind === "pin");
  const selectedPin = selectedShape?.kind === "pin" ? selectedShape : undefined;
  const selectedBend = selectedPin ? pinBend(selectedPin) : undefined;

  return (
    <aside className="user-package-inspector">
      {selectedShape?.kind === "cuboid" && (
        <ShapeFields
          title="长方体"
          fields={[
            field("中心 X", selectedShape.center[0], 0, 29, 0.5, (value) => onUpdate(selectedShape.id, { center: [value, selectedShape.center[1]] })),
            field("中心 Z", selectedShape.center[1], 0, 19, 0.5, (value) => onUpdate(selectedShape.id, { center: [selectedShape.center[0], value] })),
            field("长", selectedShape.length, 0.5, 14, 0.1, (value) => onUpdate(selectedShape.id, { length: value })),
            field("宽", selectedShape.width, 0.5, 14, 0.1, (value) => onUpdate(selectedShape.id, { width: value })),
            field("角度", selectedShape.angle, 0, 360, 1, (value) => onUpdate(selectedShape.id, { angle: value }), "°"),
            field("高度 Y", selectedShape.height, 0.2, 12, 0.1, (value) => onUpdate(selectedShape.id, { height: value }))
          ]}
          color={selectedShape.color}
          onColor={(color) => onUpdate(selectedShape.id, { color })}
        />
      )}

      {selectedShape?.kind === "cylinder" && (
        <ShapeFields
          title="圆柱体"
          fields={[
            field("中心 X", selectedShape.center[0], 0, 29, 0.5, (value) => onUpdate(selectedShape.id, { center: [value, selectedShape.center[1]] })),
            field("中心 Z", selectedShape.center[1], 0, 19, 0.5, (value) => onUpdate(selectedShape.id, { center: [selectedShape.center[0], value] })),
            field("半径", selectedShape.radius, 0.2, 8, 0.1, (value) => onUpdate(selectedShape.id, { radius: value })),
            field("高度 Y", selectedShape.height, 0.2, 12, 0.1, (value) => onUpdate(selectedShape.id, { height: value }))
          ]}
          color={selectedShape.color}
          onColor={(color) => onUpdate(selectedShape.id, { color })}
        />
      )}

      {selectedPin && (
        <section className="user-package-fields">
          <h3>引脚</h3>
          <div className="user-package-readout">
            <span>孔位</span>
            <strong>{displayHole(selectedPin.hole)}</strong>
          </div>
          <label className="user-package-slider">
            <span>活动范围</span>
            <input
              type="number"
              min="0"
              max="20"
              step="1"
              value={selectedBend?.range ?? 0}
              onChange={(event) => onUpdate(selectedPin.id, {
                bendRange: Math.max(0, Math.min(20, Math.round(Number(event.target.value) || 0)))
              })}
            />
            <output>{selectedBend?.range ?? 0}</output>
          </label>
          <label className="user-package-slider">
            <span>活动方向</span>
            <select
              value={selectedBend?.direction ?? "+z"}
              onChange={(event) => onUpdate(selectedPin.id, {
                bendDirection: event.target.value as UserPackageBendDirection
              })}
            >
              <option value="+x">+X</option>
              <option value="-x">-X</option>
              <option value="+z">+Z</option>
              <option value="-z">-Z</option>
            </select>
          </label>
        </section>
      )}

      {!selectedShape && <div className="user-package-inspector-empty" />}

      {pins.length > 0 && (
        <section className="user-package-pin-list">
          <h3>引脚位置</h3>
          {pins.map((pin, index) => (
            <button
              className={pin.id === selectedShape?.id ? "user-package-pin-row active" : "user-package-pin-row"}
              type="button"
              key={pin.id}
              onClick={() => onSelect(pin.id)}
            >
              <span>Pin {index + 1}</span>
              <small>{displayHole(pin.hole)}</small>
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}

interface Field {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

function field(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
  unit = ""
): Field {
  return { label, value, min, max, step, unit, onChange };
}

function ShapeFields({
  title,
  fields,
  color,
  onColor
}: {
  title: string;
  fields: Field[];
  color: string;
  onColor: (color: string) => void;
}) {
  return (
    <section className="user-package-fields">
      <h3>{title}</h3>
      {fields.map((item) => (
        <label className="user-package-slider" key={item.label}>
          <span>{item.label}</span>
          <input
            type="range"
            min={item.min}
            max={item.max}
            step={item.step}
            value={item.value}
            onChange={(event) => item.onChange(Number(event.target.value))}
          />
          <output>{round(item.value)}{item.unit}</output>
        </label>
      ))}
      <label className="user-package-color">
        <span>颜色</span>
        <input type="color" value={color} onChange={(event) => onColor(event.target.value)} />
      </label>
    </section>
  );
}

function round(value: number) {
  return Number(value.toFixed(1));
}

/** Internal holes are 0-based; the board labels and pin list are 1-based. */
function displayHole([x, z]: [number, number]) {
  return `${x + 1}, ${z + 1}`;
}
