import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { HostedAuthProvider } from './auth/HostedAuthProvider';
import { CookieConsentBanner } from './consent/CookieConsentBanner';
import { CookieConsentProvider } from './consent/CookieConsentContext';
import './prismSetup';
import './theme.css';
import 'jsoncrack-react/style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CookieConsentProvider>
      <HostedAuthProvider>
        <App />
      </HostedAuthProvider>
      <CookieConsentBanner />
    </CookieConsentProvider>
  </StrictMode>,
);
