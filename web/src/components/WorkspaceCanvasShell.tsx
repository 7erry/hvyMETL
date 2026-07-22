import type { CSSProperties, ReactNode } from 'react';
import { AgentCopilotSidebar } from './AgentCopilotSidebar';
import { useCopilot } from '../copilot/CopilotContext';

type WorkspaceCanvasShellProps = {
  children: ReactNode;
  beforeJson?: string;
  afterJson?: string;
};

/** Wraps the ERD canvas and copilot drawer; canvas resizes without refitting viewport. */
export function WorkspaceCanvasShell({ children, beforeJson, afterJson }: WorkspaceCanvasShellProps) {
  const copilot = useCopilot();

  return (
    <div
      className={`workspace-canvas-shell${copilot.open ? ' workspace-canvas-shell--copilot-open' : ''}`}
      style={{ '--copilot-width': `${copilot.width}px` } as CSSProperties}
    >
      <div className="workspace-canvas-shell__main">{children}</div>
      <AgentCopilotSidebar beforeJson={beforeJson} afterJson={afterJson} />
    </div>
  );
}
