import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  AUTH_ROUTES,
  PUBLIC_ROUTES,
  resolveAuthGate,
  shouldBypassAuth,
} from "@/lib/auth/authGate";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const bypassAuth = shouldBypassAuth({
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    E2E_BYPASS_AUTH: process.env.E2E_BYPASS_AUTH,
  });

  const decision = resolveAuthGate({
    pathname: path,
    hasUser: Boolean(user),
    bypassAuth,
    publicRoutes: PUBLIC_ROUTES,
    authRoutes: AUTH_ROUTES,
  });

  if (decision === "redirect-login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (decision === "redirect-dashboard") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
