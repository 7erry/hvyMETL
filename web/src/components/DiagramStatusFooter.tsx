import type { ReactNode } from 'react';
import { PrivacyPreferencesLink } from '../consent/PrivacyPreferencesLink';
import { useT } from '../i18n/LocaleContext';

type DiagramStatusFooterProps = {
  status?: string;
  legend?: ReactNode;
};

/** App footer: status message on the left, optional diagram legend on the right. */
export function DiagramStatusFooter({ status, legend }: DiagramStatusFooterProps) {
  const t = useT();
  return (
    <footer className="diagram-status-footer">
      <span className="diagram-status-footer__message">{status || t('status.ready')}</span>
      <PrivacyPreferencesLink className="diagram-status-footer__privacy" />
      {legend ? <div className="diagram-status-footer__legend">{legend}</div> : null}
    </footer>
  );
}
