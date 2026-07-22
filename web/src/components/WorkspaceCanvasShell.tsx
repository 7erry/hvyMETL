import { useRef, useState, type ReactNode } from 'react';
import { AgentCopilotSidebar } from './AgentCopilotSidebar';
import { CopilotResizeDivider } from './copilot/CopilotResizeDivider';
import { useCopilot } from '../copilot/CopilotContext';

type WorkspaceCanvasShellProps = {
  children: ReactNode;
  beforeJson?: string;
  afterJson?: string;
};

/** Wraps the ERD canvas and copilot drawer; canvas resizes without refitting viewport. */
export function WorkspaceCanvasShell({ children, beforeJson, afterJson }: WorkspaceCanvasShellProps) {
  const copilot = useCopilot();
  const shellRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      ref={shellRef}
      className={[
        'workspace-canvas-shell',
        copilot.open ? 'workspace-canvas-shell--copilot-open' : '',
        isDragging ? 'workspace-canvas-shell--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="workspace-canvas-shell__main">{children}</div>
      {copilot.open ? (
        <>
          <CopilotResizeDivider
            shellRef={shellRef}
            width={copilot.width}
            onWidthChange={copilot.setWidth}
            onDraggingChange={setIsDragging}
          />
          <AgentCopilotSidebar beforeJson={beforeJson} afterJson={afterJson} />
        </>
      ) : (
        <AgentCopilotSidebar beforeJson={beforeJson} afterJson={afterJson} />
      )}
    </div>
  );
}
