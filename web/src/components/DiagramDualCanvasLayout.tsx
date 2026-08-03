import type { ReactNode } from 'react';
import type { DiagramViewMode } from '../diagramViewMode';
import { ResizableHorizontalSplit } from './ResizableHorizontalSplit';
import { ResizableVerticalSplit } from './ResizableVerticalSplit';

type DiagramDualCanvasLayoutProps = {
  mode: DiagramViewMode;
  sqlPane: ReactNode;
  mongoPane: ReactNode;
  dualSplitBottomHeight: number;
  onDualSplitBottomHeightChange: (height: number) => void;
  dualSplitLeftWidth: number;
  onDualSplitLeftWidthChange: (width: number) => void;
};

function DiagramPane({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="diagram-pane">
      <div className="diagram-pane__header">
        <span className="diagram-pane__label">{label}</span>
      </div>
      <div className="diagram-pane__body">{children}</div>
    </div>
  );
}

/** Renders SQL and MongoDB canvases in stacked or side-by-side split layouts. */
export function DiagramDualCanvasLayout({
  mode,
  sqlPane,
  mongoPane,
  dualSplitBottomHeight,
  onDualSplitBottomHeightChange,
  dualSplitLeftWidth,
  onDualSplitLeftWidthChange,
}: DiagramDualCanvasLayoutProps) {
  const sql = <DiagramPane label="Before · SQL">{sqlPane}</DiagramPane>;
  const mongo = <DiagramPane label="After · MongoDB">{mongoPane}</DiagramPane>;

  if (mode === 'split-vertical') {
    return (
      <ResizableHorizontalSplit
        leftWidth={dualSplitLeftWidth}
        onLeftWidthChange={onDualSplitLeftWidthChange}
        left={sql}
        right={mongo}
      />
    );
  }

  return (
    <ResizableVerticalSplit
      bottomHeight={dualSplitBottomHeight}
      onBottomHeightChange={onDualSplitBottomHeightChange}
      top={sql}
      bottom={mongo}
    />
  );
}
