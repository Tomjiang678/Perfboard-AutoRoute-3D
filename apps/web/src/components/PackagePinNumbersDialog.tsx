import { useState } from "react";
import { X } from "lucide-react";
import type { LibraryComponentDefinition } from "../features/project/componentLibrary.ts";
import { PackagePinPreview3D } from "./PackagePinPreview3D.tsx";
import { useDialogDrag } from "./useDialogDrag.ts";

interface PackagePinNumbersDialogProps {
  definition: LibraryComponentDefinition;
  onConfirm: (pinOffsets: Array<[number, number]>) => void;
  onCancel: () => void;
}

export function PackagePinNumbersDialog({ definition, onConfirm, onCancel }: PackagePinNumbersDialogProps) {
  const drag = useDialogDrag();
  const offsets = definition.pinOffsets;
  const pinCount = offsets.length;
  const [numbers, setNumbers] = useState<number[]>(() => Array.from({ length: pinCount }, (_, index) => index + 1));
  const [selected, setSelected] = useState(0);

  function assign(number: number) {
    setNumbers((current) => {
      const next = [...current];
      const target = next.indexOf(number);
      if (target < 0) return current;
      [next[selected], next[target]] = [next[target], next[selected]];
      return next;
    });
  }

  function save() {
    const ordered = new Array<[number, number]>(pinCount);
    offsets.forEach((offset, index) => {
      ordered[numbers[index] - 1] = offset;
    });
    onConfirm(ordered);
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog pin-number-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="引脚编号"
        ref={drag.ref}
        style={{ transform: `translate3d(${drag.offset.x}px, ${drag.offset.y}px, 0)` }}
      >
        <div
          className="dialog-header draggable"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
        >
          <h2>引脚编号</h2>
          <button className="icon-button" type="button" onClick={onCancel} title="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="pin-number-body">
          <PackagePinPreview3D
            definition={definition}
            numbers={numbers}
            selected={selected}
            onSelect={setSelected}
          />

          <div className="pin-number-pad">
            {numbers.map((number) => (
              <button
                key={number}
                type="button"
                className={numbers[selected] === number ? "pin-number-button active" : "pin-number-button"}
                onClick={() => assign(number)}
              >
                {number}
              </button>
            ))}
          </div>

          <div className="pin-number-footer">
            <span>引脚 {selected + 1} 当前编号 {numbers[selected]}</span>
            <div className="pin-number-actions">
              <button className="tool-button" type="button" onClick={onCancel}>取消</button>
              <button className="tool-button primary" type="button" onClick={save}>保存编号</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
