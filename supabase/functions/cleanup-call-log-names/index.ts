import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse, createForbiddenResponse } from '../_shared/auth.ts';

/**
 * Smart capitalization for names - handles edge cases like:
 * - All uppercase or all lowercase names
 * - Special prefixes: Mc, Mac, O'
 * - Hyphenated names
 * - Already properly capitalized names (left unchanged)
 */
function smartCapitalize(name: string | null | undefined): string {
  if (!name) return '';
  
  // Handle already properly capitalized names
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) {
    return name;
  }
  
  return name
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((part) => {
      // Keep separators as-is
      if (/^(\s+|-|')$/.test(part)) return part;
      
      // Handle special prefixes like Mc, Mac, O'
      if (part.startsWith('mc') && part.length > 2) {
        return 'Mc' + part.charAt(2).toUpperCase() + part.slice(3);
      }
      if (part.startsWith('mac') && part.length > 3) {
        return 'Mac' + part.charAt(3).toUpperCase() + part.slice(4);
      }
      
      // Standard capitalization
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

/**
 * Format a full name from first and last name parts
 */
function formatFullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const first = smartCapitalize(firstName);
  const last = smartCapitalize(lastName);
  return [first, last].filter(Boolean).join(' ');
}

/**
 * Fetch customer from GHL by phone number
 */
async function fetchCustomerFromGoHighLevel(
  phoneNumber: string,
  ghlApiKey: string,
  ghlLocationId: string
): Promise<{ name: string | null; contactId: string | null; firstName: string | null; lastName: string | null }> {
  if (!phoneNumber) {
    return { name: null, contactId: null, firstName: null, lastName: null };
  }

  try {
    // Clean up phone number
    let cleanedPhone = phoneNumber.replace(/\s+/g, '').replace(/[^\\d+]/g, '');
    
    const searchUrl = `https://services.leadconnectorhq.com/contacts/?locationId=${ghlLocationId}&query=${encodeURIComponent(cleanedPhone)}&limit=1`;
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ghlApiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
    });

    if (!response.ok) {
      console.log('[Cleanup] GHL API error:', response.status);
      return { name: null, contactId: null, firstName: null, lastName: null };
    }

    const data = await response.json();

    if (data.contacts && data.contacts.length > 0) {
      // Find the contact that matches the phone number
      const matchingContact = data.contacts.find((c: any) => {
        const contactPhone = (c.phone || '').replace(/\s+/g, '').replace(/[^\\d+]/g, '');
        return contactPhone === cleanedPhone || contactPhone.endsWith(cleanedPhone.slice(-9));
      }) || data.contacts[0];
      
      return { 
        name: matchingContact.name || null,
        contactId: matchingContact.id || null,
        firstName: matchingContact.firstName || null,
        lastName: matchingContact.lastName || null,
      };
    }
  } catch (error) {
    console.error('[Cleanup] GHL error:', error);
  }

  return { name: null, contactId: null, firstName: null, lastName: null };
}

/**
 * Fetch customer from GHL by contact ID
 */
async function fetchCustomerFromGoHighLevelById(
  contactId: string,
  ghlApiKey: string
): Promise<{ name: string | null; firstName: string | null; lastName: string | null }> {
  if (!contactId) {
    return { name: null, firstName: null, lastName: null };
  }

  try {
    const response = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ghlApiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      },
    });

    if (!response.ok) {
      console.log('[Cleanup] GHL API error fetching by ID:', response.status);
      return { name: null, firstName: null, lastName: null };
    }

    const data = await response.json();
    const contact = data.contact || data;
    
    if (contact) {
      return { 
        name: contact.name || null,
        firstName: contact.firstName || null,
        lastName: contact.lastName || null,
      };
    }
  } catch (error) {
    console.error('[Cleanup] GHL error fetching by ID:', error);
  }

  return { name: null, firstName: null, lastName: null };
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify authentication and admin role
    const body = await req.json().catch(() => ({}));
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[cleanup-call-log-names] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    
    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['superadmin', 'admin'])
      .single();

    if (roleError || !roleData) {
      console.warn(`User ${userId} attempted to cleanup call logs without admin role.`);
      return createForbiddenResponse('Forbidden: Admin access required', corsHeaders);
    }
    
    console.log(`[cleanup-call-log-names] Admin user ${userId} starting cleanup`);

    const ghlApiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    const ghlLocationId = Deno.env.get('GOHIGHLEVEL_LOCATION_ID');
    
    if (!ghlApiKey || !ghlLocationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'GHL API credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get batch parameters
    const batchSize = body.batchSize || 50;
    const offset = body.offset || 0;
    const forceUpdate = body.forceUpdate || false; // If true, update even if name exists

    console.log(`[cleanup-call-log-names] Processing batch: offset=${offset}, size=${batchSize}, forceUpdate=${forceUpdate}`);

    // Fetch call logs that need updating
    let query = supabase
      .from('vapi_call_logs')
      .select('id, phone_number, customer_name, ghl_contact_id')
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1);
    
    // If not forcing update, only get records with missing/problematic names
    if (!forceUpdate) {
      query = query.or('customer_name.is.null,customer_name.eq.,ghl_contact_id.is.null');
    }

    const { data: callLogs, error: fetchError } = await query;

    if (fetchError) {
      console.error('[cleanup-call-log-names] Error fetching call logs:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!callLogs || callLogs.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No call logs to process',
          processed: 0,
          updated: 0,
          hasMore: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[cleanup-call-log-names] Found ${callLogs.length} call logs to process`);

    let updated = 0;
    let skipped = 0;
    const results: Array<{ id: string; status: string; name?: string }> = [];

    for (const call of callLogs) {
      try {
        let newName: string | null = null;
        let newGhlContactId: string | null = call.ghl_contact_id;

        // Priority 1: If we have GHL contact ID, fetch directly
        if (call.ghl_contact_id) {
          const ghlResult = await fetchCustomerFromGoHighLevelById(call.ghl_contact_id, ghlApiKey);
          if (ghlResult.firstName || ghlResult.lastName) {
            newName = formatFullName(ghlResult.firstName, ghlResult.lastName);
          } else if (ghlResult.name) {
            newName = smartCapitalize(ghlResult.name);
          }
        }

        // Priority 2: Search by phone number if no name yet
        if (!newName && call.phone_number) {
          const ghlResult = await fetchCustomerFromGoHighLevel(call.phone_number, ghlApiKey, ghlLocationId);
          if (ghlResult.firstName || ghlResult.lastName) {
            newName = formatFullName(ghlResult.firstName, ghlResult.lastName);
          } else if (ghlResult.name) {
            newName = smartCapitalize(ghlResult.name);
          }
          if (ghlResult.contactId) {
            newGhlContactId = ghlResult.contactId;
          }
        }

        // Priority 3: If we have existing name but no GHL match, just capitalize it
        if (!newName && call.customer_name) {
          newName = smartCapitalize(call.customer_name);
        }

        // Update if we have a new name or GHL contact ID
        if (newName || newGhlContactId !== call.ghl_contact_id) {
          const updateData: Record<string, any> = {};
          if (newName) updateData.customer_name = newName;
          if (newGhlContactId) updateData.ghl_contact_id = newGhlContactId;

          const { error: updateError } = await supabase
            .from('vapi_call_logs')
            .update(updateData)
            .eq('id', call.id);

          if (updateError) {
            console.error(`[cleanup-call-log-names] Error updating call ${call.id}:`, updateError);
            results.push({ id: call.id, status: 'error' });
          } else {
            updated++;
            results.push({ id: call.id, status: 'updated', name: newName || undefined });
            console.log(`[cleanup-call-log-names] Updated call ${call.id}: ${newName}`);
          }
        } else {
          skipped++;
          results.push({ id: call.id, status: 'skipped' });
        }

        // Add a small delay to avoid rate limiting GHL API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`[cleanup-call-log-names] Error processing call ${call.id}:`, error);
        results.push({ id: call.id, status: 'error' });
      }
    }

    // Check if there are more records to process
    const { count } = await supabase
      .from('vapi_call_logs')
      .select('id', { count: 'exact', head: true });

    const hasMore = offset + batchSize < (count || 0);
    const nextOffset = hasMore ? offset + batchSize : null;

    console.log(`[cleanup-call-log-names] Batch complete: updated=${updated}, skipped=${skipped}, hasMore=${hasMore}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${callLogs.length} call logs`,
        processed: callLogs.length,
        updated,
        skipped,
        hasMore,
        nextOffset,
        totalRecords: count,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[cleanup-call-log-names] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
