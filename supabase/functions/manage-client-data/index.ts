import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';
import { checkPermission } from '../_shared/permissions.ts';

type TableName = 'clients' | 'client_properties' | 'client_income' | 'client_expenses' |
                 'client_assets' | 'client_liabilities' | 'client_employment' |
                 'client_notes' | 'client_files' | 'client_activities' | 'client_additional_contacts' |
                 'report_qa_messages' | 'report_qa_conversations' | 'portfolio_reviews' | 'client_scores' |
                 'client_income_sources' | 'client_deals' | 'deal_stages' | 'build_progress_payments' | 'builder_invoices' |
                 'portfolio_analysis_reports' | 'client_reminders' | 'lead_source_attributions' | 'client_portal_report_requests';

type Operation = 'create' | 'update' | 'delete' | 'upsert' | 'bulkDelete';

interface RequestBody {
  operation: Operation;
  table: TableName;
  clientId?: string; // Optional for report_qa tables
  recordId?: string;
  data?: Record<string, any> | Record<string, any>[]; // Allow array for batch inserts
  session_token?: string;
}

const ALLOWED_TABLES: TableName[] = [
  'clients',
  'client_properties',
  'client_income',
  'client_expenses',
  'client_assets',
  'client_liabilities',
  'client_employment',
  'client_notes',
  'client_files',
  'client_activities',
  'client_additional_contacts',
  'report_qa_messages',
  'report_qa_conversations',
  'portfolio_reviews',
  'client_scores',
  'client_income_sources',
  'client_deals',
  'deal_stages',
  'build_progress_payments',
  'builder_invoices',
  'portfolio_analysis_reports',
  'client_reminders',
  'portal_configuration',
  'lead_source_attributions',
  'client_portal_reports',
  'client_portal_report_requests',
];

// Map employment_type to income source_type and default shading
const EMPLOYMENT_TO_INCOME_MAP: Record<string, { sourceType: string; defaultShading: number }> = {
  permanent: { sourceType: 'payg_fulltime', defaultShading: 1.0 },
  part_time: { sourceType: 'payg_parttime', defaultShading: 1.0 },
  casual: { sourceType: 'casual', defaultShading: 0.8 },
  contract: { sourceType: 'contract', defaultShading: 0.8 },
  self_employed: { sourceType: 'self_employed', defaultShading: 0.8 },
};

function convertToAnnual(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly': return amount * 52;
    case 'fortnightly': return amount * 26;
    case 'monthly': return amount * 12;
    default: return amount;
  }
}

/**
 * Syncs an employment record to its linked income source.
 * Creates the income source if it doesn't exist, updates if it does.
 */
async function syncEmploymentToIncomeSource(supabase: any, employment: any, clientId: string) {
  const mapping = EMPLOYMENT_TO_INCOME_MAP[employment.employment_type] || { sourceType: 'payg_fulltime', defaultShading: 1.0 };
  const grossAnnual = employment.gross_annual_salary || convertToAnnual(employment.salary_amount || 0, employment.salary_frequency || 'annual');

  const incomeData = {
    client_id: clientId,
    employment_id: employment.id,
    contact_type: employment.contact_type || 'primary',
    additional_contact_id: employment.additional_contact_id || null,
    source_category: 'employment',
    source_type: mapping.sourceType,
    source_name: employment.employer_name || '',
    gross_annual_amount: grossAnnual,
    input_amount: employment.salary_amount || 0,
    input_frequency: employment.salary_frequency || 'annual',
    bonus: employment.bonus || 0,
    commission: employment.commission || 0,
    overtime_essential: employment.overtime_essential || 0,
    overtime_non_essential: employment.overtime_non_essential || 0,
    allowance: employment.allowance || 0,
    other_taxable_income: employment.other_taxable_income || 0,
    default_shading_rate: mapping.defaultShading,
    is_active: employment.is_current !== false,
  };

  // Check if a linked income source already exists
  const { data: existing } = await supabase
    .from('client_income_sources')
    .select('id')
    .eq('employment_id', employment.id)
    .maybeSingle();

  if (existing) {
    // Update existing
    await supabase
      .from('client_income_sources')
      .update(incomeData)
      .eq('id', existing.id);
    console.log(`Updated linked income source ${existing.id} for employment ${employment.id}`);
  } else {
    // Create new
    const { data: created } = await supabase
      .from('client_income_sources')
      .insert(incomeData)
      .select('id')
      .single();
    console.log(`Created linked income source ${created?.id} for employment ${employment.id}`);
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();

    // Validate authentication (JWT first, then session token)
    const { error: authError, userId, username } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('Auth failed for manage-client-data:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    console.log(`Authenticated user ${userId} (${username}) performing ${body.operation} on ${body.table}`);

    const authMethod = (await verifyAuth(supabase, req.headers, body)).authMethod;

    const { operation, table, clientId, recordId, data } = body;

    // ── Server-side permission check ──
    // Verify the user has the required module-level permission for this operation
    const permCheck = await checkPermission(supabase, userId!, table, operation, authMethod);
    if (!permCheck.allowed) {
      console.log(`[manage-client-data] Permission denied for user ${userId} on ${table}.${operation}: ${permCheck.reason}`);
      return new Response(
        JSON.stringify({ error: permCheck.reason || 'Permission denied', permissionDenied: true }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate table name
    if (!ALLOWED_TABLES.includes(table)) {
      return new Response(
        JSON.stringify({ error: `Invalid table: ${table}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate operation
    if (!['create', 'update', 'delete', 'upsert', 'bulkDelete'].includes(operation)) {
      return new Response(
        JSON.stringify({ error: `Invalid operation: ${operation}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tables that don't require clientId
    const STANDALONE_TABLES = ['clients', 'report_qa_messages', 'report_qa_conversations', 'deal_stages', 'build_progress_payments', 'builder_invoices', 'portal_configuration', 'client_portal_report_requests', 'client_reminders'];
    
    // Validate clientId for client-related tables only
    if (!STANDALONE_TABLES.includes(table) && !clientId) {
      return new Response(
        JSON.stringify({ error: 'clientId is required for related tables' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result: any;
    let error: any;

    switch (operation) {
      case 'create': {
        if (!data) {
          return new Response(
            JSON.stringify({ error: 'data is required for create operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Handle batch inserts (array) or single inserts
        const isArray = Array.isArray(data);
        let insertData: Record<string, any> | Record<string, any>[];
        
        if (STANDALONE_TABLES.includes(table)) {
          // For standalone tables, use data as-is
          insertData = data;
        } else {
          // For client-related tables, add client_id
          insertData = isArray 
            ? data.map((item: Record<string, any>) => ({ ...item, client_id: clientId }))
            : { ...data, client_id: clientId };
        }

        // Use .select() without .single() to handle both array and single inserts
        const { data: inserted, error: insertError } = await supabase
          .from(table)
          .insert(insertData)
          .select();

        result = isArray ? inserted : inserted?.[0];
        error = insertError;

        // Update last_note_at on the client when a note is created
        if (!error && table === 'client_notes' && clientId) {
          await supabase
            .from('clients')
            .update({ last_note_at: new Date().toISOString() })
            .eq('id', clientId);
        }

        // Auto-create linked income source when employment is created
        if (!error && table === 'client_employment' && result && clientId) {
          try {
            await syncEmploymentToIncomeSource(supabase, result, clientId);
          } catch (syncError) {
            console.warn('Failed to sync employment to income source:', syncError);
          }
        }

        // ── Portal Notification: Report published to client ──
        if (!error && table === 'client_portal_reports' && clientId && result) {
          try {
            const reportTitle = (isArray ? result[0] : result)?.report_title || 'New Report';
            const clientVisibleNotes = (isArray ? result[0] : result)?.client_visible_notes;
            const notifTitle = 'New Report Available';
            const notifMessage = `Your advisor has published "${reportTitle}" to your portal.${clientVisibleNotes ? ' Note: ' + clientVisibleNotes : ''}`;
            
            await supabase.from('client_portal_notifications').insert({
              client_id: clientId,
              title: notifTitle,
              message: notifMessage,
              type: 'info',
              category: 'document',
              action_url: '/client/reports',
            });
            console.log(`[manage-client-data] Portal notification created for report publish to client ${clientId}`);

            // Send email notification
            const { resolveClientEmailInfo, sendPortalNotificationEmail } = await import('../_shared/portal-notification-email.ts');
            const emailInfo = await resolveClientEmailInfo(supabase, clientId);
            if (emailInfo) {
              await sendPortalNotificationEmail({
                to: emailInfo.email,
                clientFirstName: emailInfo.firstName,
                title: notifTitle,
                message: notifMessage,
                type: 'info',
                category: 'document',
                actionUrl: '/client/reports',
                companyName: emailInfo.companyName,
              });
            }
          } catch (notifErr) {
            console.warn('[manage-client-data] Failed to create portal notification for report:', notifErr);
          }
        }
        break;
      }

      case 'update': {
        if (!recordId && table !== 'clients') {
          return new Response(
            JSON.stringify({ error: 'recordId is required for update operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!data) {
          return new Response(
            JSON.stringify({ error: 'data is required for update operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // For clients table, use clientId as the record ID
        const idToUpdate = table === 'clients' ? clientId : recordId;

        const { data: updated, error: updateError } = await supabase
          .from(table)
          .update(data)
          .eq('id', idToUpdate)
          .select()
          .single();

        result = updated;
        error = updateError;

        // Auto-sync linked income source when employment is updated
        if (!error && table === 'client_employment' && result && clientId) {
          try {
            await syncEmploymentToIncomeSource(supabase, result, clientId);
          } catch (syncError) {
            console.warn('Failed to sync employment to income source:', syncError);
          }
        }

        // ── Portal Notification: Report request status updated ──
        if (!error && table === 'client_portal_report_requests' && result) {
          try {
            const status = (data as Record<string, any>).status;
            const reqClientId = result.client_id;
            if (status && reqClientId && ['completed', 'in_progress', 'declined'].includes(status)) {
              const typeLabel = (result.request_type || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
              const statusMessages: Record<string, { title: string; message: string; type: string }> = {
                completed: {
                  title: 'Report Request Completed',
                  message: `Your ${typeLabel} request has been completed. Check your Reports page for the new document.`,
                  type: 'success',
                },
                in_progress: {
                  title: 'Report Request In Progress',
                  message: `Your ${typeLabel} request is now being worked on by our team.`,
                  type: 'info',
                },
                declined: {
                  title: 'Report Request Update',
                  message: `Your ${typeLabel} request has been reviewed. Please contact your advisor for more details.`,
                  type: 'warning',
                },
              };
              const msg = statusMessages[status];
              if (msg) {
                await supabase.from('client_portal_notifications').insert({
                  client_id: reqClientId,
                  title: msg.title,
                  message: msg.message,
                  type: msg.type,
                  category: 'document',
                  action_url: '/client/reports',
                });
                console.log(`[manage-client-data] Portal notification created for report request status: ${status}`);

                // Send email notification
                const { resolveClientEmailInfo, sendPortalNotificationEmail } = await import('../_shared/portal-notification-email.ts');
                const emailInfo = await resolveClientEmailInfo(supabase, reqClientId);
                if (emailInfo) {
                  await sendPortalNotificationEmail({
                    to: emailInfo.email,
                    clientFirstName: emailInfo.firstName,
                    title: msg.title,
                    message: msg.message,
                    type: msg.type,
                    category: 'document',
                    actionUrl: '/client/reports',
                    companyName: emailInfo.companyName,
                  });
                }
              }
            }
          } catch (notifErr) {
            console.warn('[manage-client-data] Failed to create portal notification for report request:', notifErr);
          }
        }
        break;
      }

      case 'delete': {
        if (!recordId && table !== 'clients') {
          return new Response(
            JSON.stringify({ error: 'recordId is required for delete operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // For clients table, use clientId as the record ID
        const idToDelete = table === 'clients' ? clientId : recordId;

        // When deleting employment, the linked income source is auto-deleted via ON DELETE CASCADE on employment_id FK

        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .eq('id', idToDelete);

        result = { deleted: true, id: idToDelete };
        error = deleteError;
        break;
      }

      case 'upsert': {
        if (!data) {
          return new Response(
            JSON.stringify({ error: 'data is required for upsert operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // For client-related tables, add client_id
        const upsertData = STANDALONE_TABLES.includes(table)
          ? { ...data as Record<string, any> }
          : { ...data as Record<string, any>, client_id: clientId };

        // Use appropriate conflict target
        const conflictTarget = STANDALONE_TABLES.includes(table) ? 'id' : 'client_id';

        // Upsert using the appropriate conflict target
        const { data: upserted, error: upsertError } = await supabase
          .from(table)
          .upsert(upsertData, { onConflict: conflictTarget })
          .select()
          .single();

        result = upserted;
        error = upsertError;
        break;
      }

      case 'bulkDelete': {
        // Delete ALL records for a given client_id in the specified table
        if (!clientId) {
          return new Response(
            JSON.stringify({ error: 'clientId is required for bulkDelete operation' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Only allow bulkDelete on client-related tables (not standalone)
        if (STANDALONE_TABLES.includes(table)) {
          return new Response(
            JSON.stringify({ error: `bulkDelete is not supported for ${table}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: bulkDeleted, error: bulkDeleteError } = await supabase
          .from(table)
          .delete()
          .eq('client_id', clientId)
          .select('id');

        result = { deleted: true, count: bulkDeleted?.length || 0 };
        error = bulkDeleteError;
        console.log(`bulkDelete on ${table} for client ${clientId}: removed ${bulkDeleted?.length || 0} records`);
        break;
      }
    }

    if (error) {
      console.error(`Error in ${operation} on ${table}:`, error);
      return new Response(
        JSON.stringify({ error: `Failed to ${operation} record`, details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the activity (only for client-related tables)
    if (clientId && !['report_qa_messages', 'report_qa_conversations'].includes(table)) {
      try {
        await supabase.from('client_activities').insert({
          client_id: clientId,
          activity_type: `${table}_${operation}`,
          title: `${operation.charAt(0).toUpperCase() + operation.slice(1)}d ${table.replace('client_', '').replace('_', ' ')}`,
          description: `Record ${operation}d via secure API`,
          created_by: userId,
          metadata: { table, operation, recordId: recordId || result?.id },
        });
      } catch (logError) {
        console.warn('Failed to log activity:', logError);
        // Don't fail the main operation due to logging failure
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        operation, 
        table, 
        result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('manage-client-data error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
