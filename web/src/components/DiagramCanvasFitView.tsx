import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, type RefObject } from 'react';

type DiagramCanvasFitViewProps = {
  /** Refit when node count or layout mode changes. */
  fitKey: string | number;
  padding?: number;
  containerRef: RefObject<HTMLElement | null>;
};

/** Keeps the React Flow viewport fitted when content changes; skips refit on container resize to avoid flicker when copilot drawer toggles. */
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

  return null;
}
