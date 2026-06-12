import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

type ResizableSplitProps = {
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  sidebar: ReactNode;
  main: ReactNode;
};

/** Horizontal split with a draggable divider between sidebar and main content. */
export function ResizableSplit({
  sidebarWidth,
  onSidebarWidthChange,
  minWidth = 260,
  maxWidth = 640,
  sidebar,
  main,
}: ResizableSplitProps) {
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!dragging.current) return;
      const next = Math.min(maxWidth, Math.max(minWidth, event.clientX));
      onSidebarWidthChange(next);
    },
    [maxWidth, minWidth, onSidebarWidthChange],
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
    <div className={`workspace-split${isDragging ? ' workspace-split--dragging' : ''}`}>
      <aside className="workspace-sidebar" style={{ width: sidebarWidth }}>
        {sidebar}
      </aside>
      <div
        className="workspace-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerUp={stopDrag}
        onLostPointerCapture={stopDrag}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onSidebarWidthChange(Math.max(minWidth, sidebarWidth - 16));
          if (event.key === 'ArrowRight') onSidebarWidthChange(Math.min(maxWidth, sidebarWidth + 16));
          if (event.key === 'Home') onSidebarWidthChange(minWidth);
          if (event.key === 'End') onSidebarWidthChange(maxWidth);
        }}
        title="Drag to resize sidebar"
      >
        <span className="workspace-divider__grip" aria-hidden="true" />
      </div>
      <div className="workspace-main">{main}</div>
    </div>
  );
}
