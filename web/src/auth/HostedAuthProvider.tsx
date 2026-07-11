import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { fetchAuthConfig, setAccessTokenProvider, type AuthConfigResponse } from '../api';
import {
  DEFAULT_AUTH0_ROLES_CLAIM,
  preferredUiRole,
  rolesFromClaims,
  type HvyRole,
} from './access';

type AuthState = {
  enabled: boolean;
  serverAuthRequired: boolean;
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
  serverAuthRequired: false,
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

function resolveClientAuthSettings(config: AuthConfigResponse | null): {
  domain: string;
  clientId: string;
  audience: string;
  rolesClaim: string;
  configured: boolean;
} {
  const domain = envValue('VITE_AUTH0_DOMAIN') || config?.domain?.trim() || '';
  const clientId = envValue('VITE_AUTH0_CLIENT_ID') || config?.clientId?.trim() || '';
  const audience = envValue('VITE_AUTH0_AUDIENCE') || config?.audience?.trim() || '';
  const rolesClaim =
    envValue('VITE_AUTH0_ROLES_CLAIM') || config?.rolesClaim?.trim() || DEFAULT_AUTH0_ROLES_CLAIM;
  return {
    domain,
    clientId,
    audience,
    rolesClaim,
    configured: Boolean(domain && clientId),
  };
}

function AuthMisconfigScreen(): ReactNode {
  return (
    <main className="auth-gate">
      <section className="auth-gate__card">
        <strong>Auth0 web client not configured</strong>
        <p>
          The hvyMETL API requires login (<code>authEnabled: true</code>), but the UI has no Auth0
          SPA client ID. Protected API routes return 401 without a Bearer token.
        </p>
        <p>
          On the server, set <code>AUTH0_SPA_CLIENT_ID</code> to your Auth0 SPA application client
          ID (alongside <code>AUTH0_ISSUER_BASE_URL</code> and <code>AUTH0_AUDIENCE</code>). The UI
          loads domain and client ID from <code>GET /api/auth/config</code>.
        </p>
        <p>
          Alternatively, bake <code>VITE_AUTH0_DOMAIN</code>, <code>VITE_AUTH0_CLIENT_ID</code>, and{' '}
          <code>VITE_AUTH0_AUDIENCE</code> into the web build. For production prefer{' '}
          <code>npm run start:ui</code> (static <code>web/dist</code>).
        </p>
        <a href="/terms">Terms and Conditions</a>
      </section>
    </main>
  );
}

function Auth0Bridge({
  children,
  rolesClaim,
  serverAuthRequired,
}: {
  children: ReactNode;
  rolesClaim: string;
  serverAuthRequired: boolean;
}) {
  const {
    error,
    getAccessTokenSilently,
    getIdTokenClaims,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout: auth0Logout,
    user,
  } = useAuth0();
  const [roles, setRoles] = useState<HvyRole[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || isLoading) {
      if (!isAuthenticated) {
        setRoles([]);
        setClaimsLoading(false);
      }
      return;
    }

    let cancelled = false;
    setClaimsLoading(true);
    void getIdTokenClaims()
      .then((claims) => {
        if (cancelled) return;
        const fromIdToken = rolesFromClaims(
          (claims ?? undefined) as Record<string, unknown> | undefined,
          rolesClaim,
        );
        if (fromIdToken.length > 0) {
          setRoles(fromIdToken);
          return;
        }
        setRoles(rolesFromClaims(user as Record<string, unknown> | undefined, rolesClaim));
      })
      .catch(() => {
        if (!cancelled) {
          setRoles(rolesFromClaims(user as Record<string, unknown> | undefined, rolesClaim));
        }
      })
      .finally(() => {
        if (!cancelled) setClaimsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getIdTokenClaims, isAuthenticated, isLoading, rolesClaim, user]);

  useLayoutEffect(() => {
    if (!isAuthenticated) {
      setAccessTokenProvider(undefined);
      return;
    }
    setAccessTokenProvider(() => getAccessTokenSilently());
    return () => setAccessTokenProvider(undefined);
  }, [getAccessTokenSilently, isAuthenticated]);

  const sessionLoading = isLoading || claimsLoading;

  const value: AuthState = {
    enabled: true,
    serverAuthRequired,
    isLoading: sessionLoading,
    isAuthenticated,
    apiReady: !sessionLoading && isAuthenticated,
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
  const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);
  const clientAuth = resolveClientAuthSettings(authConfig);

  useEffect(() => {
    void fetchAuthConfig()
      .then(setAuthConfig)
      .catch(() =>
        setAuthConfig({
          authEnabled: false,
          rolesClaim: DEFAULT_AUTH0_ROLES_CLAIM,
          hostedUrl: 'https://hvymetl.studio',
        }),
      );
  }, []);

  if (authConfig === null) {
    return (
      <main className="auth-gate">
        <section className="auth-gate__card">
          <strong>Loading hvyMETL Studio…</strong>
          <p>Checking authentication configuration.</p>
        </section>
      </main>
    );
  }

  const serverAuthRequired = authConfig.authEnabled;

  if (serverAuthRequired && !clientAuth.configured) {
    return <AuthMisconfigScreen />;
  }

  if (!clientAuth.configured) {
    return (
      <AuthContext.Provider value={{ ...disabledAuthState, serverAuthRequired }}>
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <Auth0Provider
      domain={clientAuth.domain}
      clientId={clientAuth.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        scope: 'openid profile email',
        ...(clientAuth.audience ? { audience: clientAuth.audience } : {}),
      }}
      cacheLocation="localstorage"
      useRefreshTokens
    >
      <Auth0Bridge rolesClaim={clientAuth.rolesClaim} serverAuthRequired={serverAuthRequired}>
        {children}
      </Auth0Bridge>
    </Auth0Provider>
  );
}
