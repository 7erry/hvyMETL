import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, type RefObject } from 'react';

type DiagramCanvasFitViewProps = {
  /** Refit when node count or layout mode changes. */
  fitKey: string | number;
  padding?: number;
  containerRef: RefObject<HTMLElement | null>;
};

/** Keeps the React Flow viewport fitted when the canvas resizes or content changes. */
export function DiagramCanvasFitView({
  fitKey,
  padding = 0.12,
  containerRef,
}: DiagramCanvasFitViewProps) {
  const { fitView } = useReactFlow();
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fitViewRef.current({ padding, duration: 120 });
    }, 60);
    return () => clearTimeout(timer);
  }, [fitKey, padding]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const refit = () => {
      void fitViewRef.current({ padding, duration: 0 });
    };

    const observer = new ResizeObserver(() => {
      refit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, padding]);

  return null;
}
