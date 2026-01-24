import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { User } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthContext {
  hasToken: boolean;
  token?: string;
  supabaseUser?: User | null;
  customUser?: {
    id?: string | null;
    username?: string | null;
    role?: string | null;
    email?: string | null;
  } | null;
  errors: string[];
}

export interface AuthOptions {
  token?: string;
  logTag?: string;
  checkSupabase?: boolean;
  checkCustom?: boolean;
  logMissing?: boolean;
}

const BEARER_PREFIX = "Bearer ";

function extractHeaderToken(req: Request): string | undefined {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) {
    return undefined;
  }
  return header.startsWith(BEARER_PREFIX)
    ? header.slice(BEARER_PREFIX.length).trim()
    : header.trim();
}

export async function getAuthContext(req: Request, options: AuthOptions = {}): Promise<AuthContext> {
  const token = options.token ?? extractHeaderToken(req);
  const hasToken = Boolean(token);
  const errors: string[] = [];

  if (!hasToken && options.logTag && options.logMissing !== false) {
    console.warn(`[auth:${options.logTag}] missing auth token`);
  }

  const context: AuthContext = { hasToken, token, errors };

  if (!hasToken) {
    return context;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  if (options.checkSupabase !== false) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (supabaseUrl && anonKey) {
      const supabase = createClient(supabaseUrl, anonKey);
      const { data, error } = await supabase.auth.getUser(token!);
      if (error) {
        errors.push(`supabase-auth:${error.message}`);
      }
      context.supabaseUser = data?.user ?? null;
    } else {
      errors.push("supabase-auth:missing-anon-key");
    }
  }

  if (options.checkCustom !== false) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceKey) {
      const service = createClient(supabaseUrl, serviceKey);
      const { data, error } = await service
        .from("user_sessions")
        .select("custom_users(id, username, role, email)")
        .eq("session_token", token!)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (error) {
        errors.push(`custom-session:${error.message}`);
      }
      context.customUser = data?.custom_users ?? null;
    } else {
      errors.push("custom-session:missing-service-key");
    }
  }

  if (options.logTag && !context.supabaseUser && !context.customUser) {
    console.warn(`[auth:${options.logTag}] token provided but no user resolved`);
  }

  return context;
}
