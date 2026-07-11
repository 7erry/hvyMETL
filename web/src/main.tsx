import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { HostedAuthProvider } from './auth/HostedAuthProvider';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HostedAuthProvider>
      <App />
    </HostedAuthProvider>
  </StrictMode>,
);
