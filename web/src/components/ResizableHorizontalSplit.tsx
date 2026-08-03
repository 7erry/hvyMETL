import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

type ResizableHorizontalSplitProps = {
  leftWidth: number;
  onLeftWidthChange: (width: number) => void;
  minLeft?: number;
  minRight?: number;
  left: ReactNode;
  right: ReactNode;
};

/** Horizontal split with a draggable divider between left and right panes. */
export function ResizableHorizontalSplit({
  leftWidth,
  onLeftWidthChange,
  minLeft = 280,
  minRight = 280,
  left,
  right,
}: ResizableHorizontalSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const clampLeft = useCallback(
    (width: number) => {
      const container = containerRef.current;
      if (!container) return width;
      const maxLeft = Math.max(minLeft, container.clientWidth - minRight);
      return Math.min(maxLeft, Math.max(minLeft, width));
    },
    [minLeft, minRight],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = clampLeft(event.clientX - rect.left);
      onLeftWidthChange(next);
    },
    [clampLeft, onLeftWidthChange],
  );

  const stopDrag = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
  }, []);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragging.current = true;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, []);

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
      ref={containerRef}
      className={`workspace-split-horizontal${isDragging ? ' workspace-split-horizontal--dragging' : ''}`}
    >
      <div className="workspace-split-horizontal__left" style={{ width: leftWidth }}>
        {left}
      </div>
      <div
        className="workspace-divider workspace-divider--horizontal-inner"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize SQL and MongoDB panels"
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerUp={stopDrag}
        onLostPointerCapture={stopDrag}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onLeftWidthChange(clampLeft(leftWidth - 16));
          if (event.key === 'ArrowRight') onLeftWidthChange(clampLeft(leftWidth + 16));
        }}
        title="Drag to resize"
      >
        <span className="workspace-divider__grip" aria-hidden="true" />
      </div>
      <div className="workspace-split-horizontal__right">{right}</div>
    </div>
  );
}
