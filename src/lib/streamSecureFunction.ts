/**
 * Streaming variant of invokeSecureFunction.
 *
 * Opens a POST to a Supabase Edge Function that returns a Server-Sent-Events
 * response, resolves auth the same way invokeSecureFunction does, and yields
 * parsed JSON event objects. Supports AbortController for user cancellation.
 *
 * The remote function is expected to write one `data: <json>\n\n` block per
 * event and (optionally) `event: <name>` lines. Events without an `event:`
 * label default to `type: 'message'`.
 */
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";

const ACCESS_TOKEN_KEY = "supabase_access_token";

function readToken(key: string): string | null {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  } catch {
    return null;
  }
}

export interface StreamEvent {
  event: string;
  data: any;
}

export interface StreamOptions {
  signal?: AbortSignal;
}

/**
 * Async iterator over SSE events from an edge function.
 * Throws on non-2xx responses. Aborts cleanly when the signal fires.
 */
export async function* streamSecureFunction(
  functionName: string,
  body: Record<string, any>,
  options: StreamOptions = {},
): AsyncGenerator<StreamEvent, void, unknown> {
  // WP-11B/C cookie-only: authenticate via the HttpOnly session cookie
  // (`credentials: 'include'`) plus the access-token JWT Bearer. No raw session
  // token is read from storage or sent in the body/headers.
  let accessToken = readToken(ACCESS_TOKEN_KEY);
  if (!accessToken) {
    try {
      accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? null;
    } catch {
      /* best-effort */
    }
  }
  const bearerToken = accessToken || SUPABASE_ANON_KEY;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${bearerToken}`,
    },
    credentials: "include",
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    let msg = `Stream request failed: ${response.status}`;
    try {
      const txt = await response.text();
      msg += ` ${txt.slice(0, 400)}`;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawBlock = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const lines = rawBlock.split("\n");
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        const dataStr = dataLines.join("\n");
        if (dataStr === "[DONE]") return;
        try {
          yield { event: eventName, data: JSON.parse(dataStr) };
        } catch {
          yield { event: eventName, data: dataStr };
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
}
