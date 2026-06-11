import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

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
  maxWidth = 560,
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

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDrag);
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
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={(event) => {
          dragging.current = true;
          setIsDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onSidebarWidthChange(Math.max(minWidth, sidebarWidth - 16));
          if (event.key === 'ArrowRight') onSidebarWidthChange(Math.min(maxWidth, sidebarWidth + 16));
        }}
      />
      <div className="workspace-main">{main}</div>
    </div>
  );
}
