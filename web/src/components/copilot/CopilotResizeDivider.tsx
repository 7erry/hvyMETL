import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  COPILOT_WIDTH_MAX,
  COPILOT_WIDTH_MIN,
} from '../../copilot/types';

type CopilotResizeDividerProps = {
  shellRef: RefObject<HTMLElement | null>;
  width: number;
  onWidthChange: (width: number) => void;
  onDraggingChange: (dragging: boolean) => void;
};

/** Draggable divider between the ERD canvas and Agent Copilot (mirrors left sidebar grip). */
export function CopilotResizeDivider({
  shellRef,
  width,
  onWidthChange,
  onDraggingChange,
}: CopilotResizeDividerProps) {
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const setDragging = useCallback(
    (next: boolean) => {
      dragging.current = next;
      setIsDragging(next);
      onDraggingChange(next);
    },
    [onDraggingChange],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging.current || !shellRef.current) return;
      const rect = shellRef.current.getBoundingClientRect();
      const next = Math.min(COPILOT_WIDTH_MAX, Math.max(COPILOT_WIDTH_MIN, rect.right - event.clientX));
      onWidthChange(next);
    },
    [onWidthChange, shellRef],
  );

  const stopDrag = useCallback(() => {
    setDragging(false);
  }, [setDragging]);

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [setDragging],
  );

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
    };
  }, [onPointerMove, stopDrag]);

  return (
    <div
      className={`workspace-divider workspace-divider--copilot${isDragging ? ' workspace-divider--copilot-dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Agent Copilot"
      aria-valuemin={COPILOT_WIDTH_MIN}
      aria-valuemax={COPILOT_WIDTH_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={startDrag}
      onPointerUp={stopDrag}
      onLostPointerCapture={stopDrag}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') onWidthChange(Math.min(COPILOT_WIDTH_MAX, width + 16));
        if (event.key === 'ArrowRight') onWidthChange(Math.max(COPILOT_WIDTH_MIN, width - 16));
        if (event.key === 'Home') onWidthChange(COPILOT_WIDTH_MIN);
        if (event.key === 'End') onWidthChange(COPILOT_WIDTH_MAX);
      }}
      title="Drag to resize Agent Copilot"
    >
      <span className="workspace-divider__grip" aria-hidden="true" />
    </div>
  );
}
