import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

type ResizableVerticalSplitProps = {
  bottomHeight: number;
  onBottomHeightChange: (height: number) => void;
  minBottom?: number;
  minTop?: number;
  top: ReactNode;
  bottom: ReactNode;
};

/** Vertical split with a draggable divider between top and bottom panes. */
export function ResizableVerticalSplit({
  bottomHeight,
  onBottomHeightChange,
  minBottom = 160,
  minTop = 200,
  top,
  bottom,
}: ResizableVerticalSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const clampBottom = useCallback(
    (height: number) => {
      const container = containerRef.current;
      if (!container) return height;
      const maxBottom = Math.max(minBottom, container.clientHeight - minTop);
      return Math.min(maxBottom, Math.max(minBottom, height));
    },
    [minBottom, minTop],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = clampBottom(rect.bottom - event.clientY);
      onBottomHeightChange(next);
    },
    [clampBottom, onBottomHeightChange],
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
      className={`workspace-split-vertical${isDragging ? ' workspace-split-vertical--dragging' : ''}`}
    >
      <div className="workspace-split-vertical__top">{top}</div>
      <div
        className="workspace-divider workspace-divider--vertical"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panels"
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerUp={stopDrag}
        onLostPointerCapture={stopDrag}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') onBottomHeightChange(clampBottom(bottomHeight + 16));
          if (event.key === 'ArrowDown') onBottomHeightChange(clampBottom(bottomHeight - 16));
        }}
        title="Drag to resize"
      >
        <span className="workspace-divider__grip workspace-divider__grip--horizontal" aria-hidden="true" />
      </div>
      <div className="workspace-split-vertical__bottom" style={{ height: bottomHeight }}>
        {bottom}
      </div>
    </div>
  );
}
