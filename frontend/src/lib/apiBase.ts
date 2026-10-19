/**
 * Prefer IPv4 loopback over `localhost` — on macOS browsers often resolve
 * localhost to ::1 while Node may only listen on IPv4, causing Failed to fetch.
 */
export function normalizeLocalhostUrl(url: string): string {
  return url
    .replace("://localhost", "://127.0.0.1")
    .replace("://[::1]", "://127.0.0.1");
}

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
  return raw ? normalizeLocalhostUrl(raw.replace(/\/$/, "")) : "";
}

export function getWsBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_WS_URL?.trim() ?? "";
  return raw ? normalizeLocalhostUrl(raw) : "";
}
