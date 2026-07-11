import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

const MOBILE_STACK_QUERY = '(max-width: 768px)';

function useStackedLayout(): boolean {
  const [stacked, setStacked] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_STACK_QUERY).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_STACK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setStacked(event.matches);
    media.addEventListener('change', onChange);
    setStacked(media.matches);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return stacked;
}

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
  const stacked = useStackedLayout();
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
    if (stacked || event.button !== 0) return;
    dragging.current = true;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [stacked]);

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
      className={`workspace-split${isDragging ? ' workspace-split--dragging' : ''}${stacked ? ' workspace-split--stacked' : ''}`}
    >
      <aside className="workspace-sidebar" style={stacked ? undefined : { width: sidebarWidth }}>
        {sidebar}
      </aside>
      {stacked ? null : (
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
      )}
      <div className="workspace-main">{main}</div>
    </div>
  );
}
