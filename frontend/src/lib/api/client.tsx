import { getApiBaseUrl } from '@/lib/apiBase';
import { createClient } from '@/lib/supabase/client';

// this fetch api client fetches data sending authorisation header with token, 

export async function apiFetch(path: string, options: RequestInit = {}) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
  });

   if (res.status === 204) {
    return null;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}