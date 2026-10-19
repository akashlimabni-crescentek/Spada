import { createClient } from "@/lib/supabase/client";
import { getApiBaseUrl } from "@/lib/apiBase";

type FetchWsTicketOptions = {
  signal?: AbortSignal;
};

/**
 * Exchange the Supabase access token for a short-lived WS ticket.
 * Backend: POST /api/v1/ws/ticket (requires Authorization Bearer).
 */
export async function fetchWsTicket(options: FetchWsTicketOptions = {}): Promise<string> {
  const apiBase = getApiBaseUrl();
  if (!apiBase) {
    throw new Error("NEXT_PUBLIC_API_URL is not set");
  }

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/v1/ws/ticket`, {
      method: "POST",
      // Fastify rejects empty bodies when Content-Type is application/json.
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: options.signal,
    });
  } catch (err) {
    if (options.signal?.aborted) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `WS ticket request failed (${apiBase}/api/v1/ws/ticket): ${message}`
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Failed to get WS ticket: ${res.status}${detail ? ` ${detail}` : ""}`
    );
  }

  const data = (await res.json()) as { ticket?: string };
  if (!data.ticket) throw new Error("WS ticket response missing ticket");
  return data.ticket;
}
