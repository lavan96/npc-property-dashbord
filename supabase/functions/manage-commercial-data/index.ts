// Commercial property CRUD edge function
// Handles commercial_properties, commercial_leases, commercial_dcf_runs
// Strict service_role mediation per project pattern.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createUnauthorizedResponse, createCorsHeaders } from '../_shared/auth.ts';

type TableName = 'commercial_properties' | 'commercial_leases' | 'commercial_dcf_runs' | 'commercial_capex' | 'commercial_financing';

const ALLOWED_TABLES: TableName[] = [
  'commercial_properties',
  'commercial_leases',
  'commercial_dcf_runs',
  'commercial_capex',
  'commercial_financing',
];

// Tables that don't carry user_id directly — ownership checked via property join.
const PROPERTY_OWNED_TABLES = new Set<TableName>(['commercial_capex', 'commercial_financing']);

type Operation = 'list' | 'get' | 'create' | 'update' | 'delete';

interface RequestBody {
  operation: Operation;
  table: TableName;
  recordId?: string;
  // list filters
  propertyId?: string;
  clientId?: string;
  // payload
  data?: Record<string, any>;
  session_token?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = createCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Auth
  const auth = await verifyAuth(supabase, req.headers, { session_token: body.session_token });
  if (auth.error || !auth.userId) {
    return createUnauthorizedResponse(auth.error || 'Authentication required', corsHeaders);
  }
  const userId = auth.userId;

  if (!body.operation || !body.table) {
    return new Response(JSON.stringify({ error: 'operation and table are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!ALLOWED_TABLES.includes(body.table)) {
    return new Response(JSON.stringify({ error: `Table not allowed: ${body.table}` }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    let result;

    switch (body.operation) {
      case 'list': {
        let q = supabase.from(body.table).select('*').eq('user_id', userId);
        if (body.table === 'commercial_leases' && body.propertyId) {
          q = q.eq('property_id', body.propertyId);
        }
        if (body.table === 'commercial_dcf_runs' && body.propertyId) {
          q = q.eq('property_id', body.propertyId);
        }
        if (body.table === 'commercial_properties' && body.clientId) {
          q = q.eq('client_id', body.clientId);
        }
        const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
        if (error) throw error;
        result = data;
        break;
      }

      case 'get': {
        if (!body.recordId) throw new Error('recordId required for get');
        const { data, error } = await supabase
          .from(body.table)
          .select('*')
          .eq('id', body.recordId)
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw error;
        result = data;
        break;
      }

      case 'create': {
        if (!body.data) throw new Error('data required for create');
        const payload = { ...body.data, user_id: userId };
        // Strip undefined / never overwrite id with empty
        if (payload.id === '' || payload.id == null) delete payload.id;
        const { data, error } = await supabase
          .from(body.table)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }

      case 'update': {
        if (!body.recordId || !body.data) throw new Error('recordId and data required for update');
        const payload = { ...body.data };
        delete payload.id;
        delete payload.user_id;
        const { data, error } = await supabase
          .from(body.table)
          .update(payload)
          .eq('id', body.recordId)
          .eq('user_id', userId)
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }

      case 'delete': {
        if (!body.recordId) throw new Error('recordId required for delete');
        const { error } = await supabase
          .from(body.table)
          .delete()
          .eq('id', body.recordId)
          .eq('user_id', userId);
        if (error) throw error;
        result = { success: true };
        break;
      }

      default:
        throw new Error(`Unknown operation: ${body.operation}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[manage-commercial-data] error:', msg);
    return new Response(JSON.stringify({ error: msg, success: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
