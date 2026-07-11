import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { setAccessTokenProvider } from '../api';
import {
  DEFAULT_AUTH0_ROLES_CLAIM,
  preferredUiRole,
  rolesFromClaims,
  type HvyRole,
} from './access';

type AuthState = {
  enabled: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  userId: string;
  userName: string;
  userEmail: string;
  roles: HvyRole[];
  isAdmin: boolean;
  canUseDeveloper: boolean;
  canUseManager: boolean;
  preferredRole: 'developer' | 'manager';
  /** True when Bearer tokens are available for protected API routes. */
  apiReady: boolean;
  error?: string;
  login: () => Promise<void>;
  logout: () => void;
};

const disabledAuthState: AuthState = {
  enabled: false,
  isLoading: false,
  isAuthenticated: true,
  userId: 'local-dev',
  userName: 'Local developer',
  userEmail: '',
  roles: ['admin', 'developer', 'manager'],
  isAdmin: true,
  canUseDeveloper: true,
  canUseManager: true,
  preferredRole: 'developer',
  apiReady: true,
  login: async () => undefined,
  logout: () => undefined,
};

const AuthContext = createContext<AuthState>(disabledAuthState);

export function useAccess(): AuthState {
  return useContext(AuthContext);
}

function envValue(key: string): string {
  return String(import.meta.env[key] ?? '').trim();
}

function Auth0Bridge({ children }: { children: ReactNode }) {
  const {
    error,
    getAccessTokenSilently,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout: auth0Logout,
    user,
  } = useAuth0();
  const rolesClaim = envValue('VITE_AUTH0_ROLES_CLAIM') || DEFAULT_AUTH0_ROLES_CLAIM;
  const roles = useMemo(
    () => rolesFromClaims(user as Record<string, unknown> | undefined, rolesClaim),
    [rolesClaim, user],
  );

  useLayoutEffect(() => {
    if (!isAuthenticated) {
      setAccessTokenProvider(undefined);
      return;
    }
    setAccessTokenProvider(() => getAccessTokenSilently());
    return () => setAccessTokenProvider(undefined);
  }, [getAccessTokenSilently, isAuthenticated]);

  const value: AuthState = {
    enabled: true,
    isLoading,
    isAuthenticated,
    apiReady: !isLoading && isAuthenticated,
    userId: typeof user?.sub === 'string' && user.sub.trim() ? user.sub : 'authenticated-user',
    userName: user?.name ?? user?.nickname ?? user?.email ?? 'Authenticated user',
    userEmail: user?.email ?? '',
    roles,
    isAdmin: roles.includes('admin'),
    canUseDeveloper: roles.includes('admin') || roles.includes('developer'),
    canUseManager: roles.includes('admin') || roles.includes('manager'),
    preferredRole: preferredUiRole(roles),
    error: error?.message,
    login: () => loginWithRedirect(),
    logout: () => auth0Logout({ logoutParams: { returnTo: window.location.origin } }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function HostedAuthProvider({ children }: { children: ReactNode }) {
  const domain = envValue('VITE_AUTH0_DOMAIN');
  const clientId = envValue('VITE_AUTH0_CLIENT_ID');
  const audience = envValue('VITE_AUTH0_AUDIENCE');

  if (!domain || !clientId) {
    return <AuthContext.Provider value={disabledAuthState}>{children}</AuthContext.Provider>;
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(audience ? { audience } : {}),
      }}
      cacheLocation="localstorage"
      useRefreshTokens
    >
      <Auth0Bridge>{children}</Auth0Bridge>
    </Auth0Provider>
  );
}
