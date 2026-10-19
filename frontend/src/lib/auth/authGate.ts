/**
 * Fail-closed page authentication gate helpers.
 *
 * Production deployments NEVER bypass auth, regardless of E2E_BYPASS_AUTH.
 * Non-production may opt in only with an explicit true/1 value.
 */

export const PUBLIC_ROUTES = ["/", "/forgotPassword", "/resetPassword"] as const;
export const AUTH_ROUTES = ["/login", "/register"] as const;

export type AuthGateDecision =
  | "allow"
  | "redirect-login"
  | "redirect-dashboard";

export type AuthEnv = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  NEXT_PUBLIC_APP_ENV?: string;
  E2E_BYPASS_AUTH?: string;
};

/** True for production deploys (fail-closed security boundary). */
export function isProductionDeployment(env: AuthEnv): boolean {
  const nodeEnv = (env.NODE_ENV ?? "").trim().toLowerCase();
  const vercelEnv = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  const appEnv = (env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();
  return (
    nodeEnv === "production" ||
    vercelEnv === "production" ||
    appEnv === "production"
  );
}

/**
 * Whether middleware may skip the login redirect for unauthenticated users.
 *
 * - Production: always false (even if E2E_BYPASS_AUTH=true/empty/garbage).
 * - Non-production: true only when E2E_BYPASS_AUTH is exactly "true" or "1".
 */
export function shouldBypassAuth(env: AuthEnv): boolean {
  if (isProductionDeployment(env)) {
    return false;
  }
  const raw = (env.E2E_BYPASS_AUTH ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1";
}

export function resolveAuthGate(input: {
  pathname: string;
  hasUser: boolean;
  bypassAuth: boolean;
  publicRoutes?: readonly string[];
  authRoutes?: readonly string[];
}): AuthGateDecision {
  const publicRoutes = input.publicRoutes ?? PUBLIC_ROUTES;
  const authRoutes = input.authRoutes ?? AUTH_ROUTES;
  const path = input.pathname;
  const isPublic = publicRoutes.includes(path);
  const isAuthRoute = authRoutes.includes(path);

  if (isAuthRoute && input.hasUser) {
    return "redirect-dashboard";
  }

  if (!input.bypassAuth && !isPublic && !isAuthRoute && !input.hasUser) {
    return "redirect-login";
  }

  return "allow";
}
