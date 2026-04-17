/**
 * Shared helper for emitting Finance Portal notifications.
 * Service-role only — call from edge functions that already have an authenticated context.
 *
 * Sends a notification to ALL portal users assigned to the given client.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

export interface FinancePortalNotificationInput {
  client_id: string;
  notification_type: string;
  title: string;
  body?: string;
  link_path?: string;
  metadata?: Record<string, any>;
  /** If provided, do NOT notify this portal user (avoid notifying the actor). */
  exclude_portal_user_id?: string;
}

export async function notifyFinancePortalAssignees(
  input: FinancePortalNotificationInput
): Promise<{ inserted: number; error?: string }> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find all active portal users assigned to this client
    const { data: assignments, error: aErr } = await supabase
      .from('finance_portal_client_assignments')
      .select('finance_user_id, finance_portal_users!inner(id, is_active, revoked_at)')
      .eq('client_id', input.client_id);

    if (aErr) return { inserted: 0, error: aErr.message };

    const recipients = (assignments || [])
      .map((a: any) => a.finance_user_id as string)
      .filter((uid: string) => !!uid && uid !== input.exclude_portal_user_id);

    if (recipients.length === 0) return { inserted: 0 };

    const rows = recipients.map(portal_user_id => ({
      portal_user_id,
      client_id: input.client_id,
      notification_type: input.notification_type,
      title: input.title,
      body: input.body || null,
      link_path: input.link_path || null,
      metadata: input.metadata || {},
    }));

    const { error: iErr } = await supabase
      .from('finance_portal_notifications')
      .insert(rows);

    if (iErr) return { inserted: 0, error: iErr.message };
    return { inserted: rows.length };
  } catch (err: any) {
    return { inserted: 0, error: err.message || 'notification failed' };
  }
}
