import type { ReactNode } from 'react';

const DEFAULT_STATUS =
  'Ready — session persists on refresh. Broad database support via DDL import.';

type DiagramStatusFooterProps = {
  status?: string;
  legend?: ReactNode;
};

/** App footer: status message on the left, optional diagram legend on the right. */
export function DiagramStatusFooter({ status, legend }: DiagramStatusFooterProps) {
  return (
    <footer className="diagram-status-footer">
      <span className="diagram-status-footer__message">{status || DEFAULT_STATUS}</span>
      {legend ? <div className="diagram-status-footer__legend">{legend}</div> : null}
    </footer>
  );
}
