/**
 * useDrag — cross-platform drag-and-drop using Pointer Events.
 *
 * Works on iOS Safari, iPad, Android, and desktop.
 * HTML5 drag-and-drop does NOT work on iOS — this replaces it entirely.
 *
 * Usage:
 *   const { dragHandleProps, isDragging } = useDrag({
 *     id: "task-42",
 *     onDragStart: () => { ... },
 *     onDragEnd: () => { ... },
 *   });
 *
 * Drop zones use the exported `useDropZone` hook.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ---- Global drag state ----
// Stored outside React so all drop zones can read it synchronously.
export interface DragState {
  id: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  ghost: HTMLElement | null;
}

let _activeDrag: DragState | null = null;
const _dragListeners: Set<() => void> = new Set();

function notifyDragListeners() {
  _dragListeners.forEach((fn) => fn());
}

export function getActiveDrag(): DragState | null {
  return _activeDrag;
}

// ---- Ghost element ----
function createGhost(source: HTMLElement): HTMLElement {
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.top}px;
    width: ${rect.width}px;
    opacity: 0.75;
    pointer-events: none;
    z-index: 9999;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    transform: scale(1.02);
    transition: transform 0.1s;
    background: var(--card-surface, #fff);
  `;
  document.body.appendChild(ghost);
  return ghost;
}

// ---- useDrag ----
interface UseDragOptions {
  id: string;
  disabled?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function useDrag({ id, disabled, onDragStart, onDragEnd }: UseDragOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const sourceRef = useRef<HTMLElement | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    // Only start drag on primary button / single touch
    if (e.button !== 0 && e.pointerType === "mouse") return;

    // Capture the source element (the row, not the handle)
    const row = (e.currentTarget as HTMLElement).closest("[data-drag-row]") as HTMLElement | null;
    sourceRef.current = row;
    startPos.current = { x: e.clientX, y: e.clientY };
    moved.current = false;

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startPos.current.x;
      const dy = ev.clientY - startPos.current.y;
      if (!moved.current && Math.sqrt(dx * dx + dy * dy) < 6) return;

      if (!moved.current) {
        // First real movement — start drag
        moved.current = true;
        _activeDrag = {
          id,
          startX: startPos.current.x,
          startY: startPos.current.y,
          currentX: ev.clientX,
          currentY: ev.clientY,
          ghost: row ? createGhost(row) : null,
        };
        setIsDragging(true);
        notifyDragListeners();
        onDragStart?.();
        // Prevent scroll while dragging
        document.body.style.userSelect = "none";
        document.body.style.overflow = "hidden";
      }

      if (_activeDrag) {
        _activeDrag.currentX = ev.clientX;
        _activeDrag.currentY = ev.clientY;
        if (_activeDrag.ghost) {
          const dx2 = ev.clientX - _activeDrag.startX;
          const dy2 = ev.clientY - _activeDrag.startY;
          const rect = (row ?? document.body).getBoundingClientRect();
          _activeDrag.ghost.style.left = `${rect.left + dx2}px`;
          _activeDrag.ghost.style.top = `${rect.top + dy2}px`;
        }
        notifyDragListeners();
      }
    };

    const handleUp = () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleUp);

      if (_activeDrag?.ghost) {
        _activeDrag.ghost.remove();
      }
      _activeDrag = null;
      setIsDragging(false);
      notifyDragListeners();
      onDragEnd?.();
      document.body.style.userSelect = "";
      document.body.style.overflow = "";
    };

    document.addEventListener("pointermove", handleMove, { passive: true });
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleUp);
  }, [id, disabled, onDragStart, onDragEnd]);

  return {
    isDragging,
    dragHandleProps: {
      onPointerDown,
      style: { touchAction: "none", cursor: isDragging ? "grabbing" : "grab" } as React.CSSProperties,
    },
  };
}

// ---- useDropZone ----
interface UseDropZoneOptions {
  /** Called with the dragging item's id when pointer is released over this zone */
  onDrop: (dragId: string) => void;
  /** Optional: only activate when dragging an item matching this predicate */
  accept?: (dragId: string) => boolean;
}

export function useDropZone({ onDrop, accept }: UseDropZoneOptions) {
  const [isOver, setIsOver] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const check = () => {
      if (!_activeDrag || !ref.current) {
        setIsOver(false);
        return;
      }
      if (accept && !accept(_activeDrag.id)) {
        setIsOver(false);
        return;
      }
      const rect = ref.current.getBoundingClientRect();
      const { currentX, currentY } = _activeDrag;
      const over =
        currentX >= rect.left &&
        currentX <= rect.right &&
        currentY >= rect.top &&
        currentY <= rect.bottom;
      setIsOver(over);
    };

    _dragListeners.add(check);
    return () => { _dragListeners.delete(check); };
  }, [accept]);

  // Fire onDrop when pointer is released over this zone
  useEffect(() => {
    const handleUp = () => {
      if (!_activeDrag || !ref.current) return;
      if (accept && !accept(_activeDrag.id)) return;
      const rect = ref.current.getBoundingClientRect();
      const { currentX, currentY, id } = _activeDrag;
      if (
        currentX >= rect.left &&
        currentX <= rect.right &&
        currentY >= rect.top &&
        currentY <= rect.bottom
      ) {
        onDrop(id);
      }
    };
    document.addEventListener("pointerup", handleUp);
    return () => document.removeEventListener("pointerup", handleUp);
  }, [onDrop, accept]);

  return { isOver, dropRef: ref };
}
