import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  limitX: number;
  limitY: number;
}

/**
 * Lets a centered dialog be moved by its header. Offsets are clamped so the
 * whole panel stays inside the viewport; the dialog itself stays centered in
 * layout (the transform only moves it visually).
 */
export function useDialogDrag() {
  const ref = useRef<HTMLElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;

    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;

    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
      limitX: Math.max(0, (window.innerWidth - rect.width) / 2),
      limitY: Math.max(0, (window.innerHeight - rect.height) / 2)
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;

    setOffset({
      x: clamp(state.originX + event.clientX - state.startX, -state.limitX, state.limitX),
      y: clamp(state.originY + event.clientY - state.startY, -state.limitY, state.limitY)
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return {
    ref,
    offset,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
