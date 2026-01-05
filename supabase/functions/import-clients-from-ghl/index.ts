import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

interface GHLContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  dateAdded: string;
  customFields?: Array<{
    id: string;
    value: string;
  }>;
  tags?: string[];
}

interface GHLContactsResponse {
  contacts: GHLContact[];
  meta: {
    total: number;
    nextPageUrl: string | null;
    startAfterId: string | null;
    startAfter: number | null;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOHIGHLEVEL_API_KEY');
    const locationId = Deno.env.get('GOHIGHLEVEL_LOCATION_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiKey || !locationId) {
      console.error('GHL credentials not configured');
      return new Response(JSON.stringify({ 
        error: 'GoHighLevel credentials not configured',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not configured');
      return new Response(JSON.stringify({ 
        error: 'Supabase credentials not configured',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { clearExisting = false, resumeFromId = null, maxPages = 10 } = body;

    console.log(`Starting GHL contact import. Clear existing: ${clearExisting}, Resume from: ${resumeFromId || 'start'}, Max pages: ${maxPages}`);

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json',
    };

    // Clear existing clients ONLY if requested AND this is the first batch (no resumeFromId)
    if (clearExisting && !resumeFromId) {
      console.log('Clearing existing client data...');
      
      // Delete in order due to foreign key constraints
      await supabase.from('client_tag_assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_scores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_activities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_reminders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_files').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_liabilities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_assets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_income').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_employment').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_properties').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_import_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      console.log('Existing client data cleared');
    }

    // Process contacts page by page - SAVE IMMEDIATELY after each page
    let startAfterId: string | null = resumeFromId;
    let pageCount = 0;
    let totalImported = 0;
    let totalErrors = 0;
    const errors: string[] = [];
    let totalFromApi = 0;

    while (pageCount < maxPages) {
      pageCount++;
      let url = `${GHL_API_BASE}/contacts/?locationId=${locationId}&limit=100`;
      
      if (startAfterId) {
        url += `&startAfterId=${startAfterId}`;
      }

      console.log(`Fetching GHL contacts page ${pageCount}: ${url}`);

      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`GHL API error: ${response.status} - ${errorText}`);
        throw new Error(`GHL API error: ${response.status} - ${errorText}`);
      }

      const data: GHLContactsResponse = await response.json();
      const contacts = data.contacts || [];
      
      // Capture total from first page only if starting fresh
      if (pageCount === 1 && !resumeFromId && data.meta?.total) {
        totalFromApi = data.meta.total;
        console.log(`GHL reports total contacts: ${totalFromApi}`);
      }

      console.log(`Received ${contacts.length} contacts from GHL (page ${pageCount})`);

      if (contacts.length === 0) {
        console.log('No more contacts to fetch');
        startAfterId = null;
        break;
      }

      // IMMEDIATELY save this page to DB
      const clientsToUpsert = contacts.map(contact => ({
        primary_first_name: contact.firstName || 'Unknown',
        primary_surname: contact.lastName || 'Unknown',
        primary_email: contact.email || null,
        primary_mobile: contact.phone || null,
        current_address: [contact.address1, contact.city, contact.state, contact.postalCode]
          .filter(Boolean)
          .join(', ') || null,
        country: contact.country || 'Australia',
        ghl_contact_id: contact.id,
        ghl_sync_status: 'synced',
        ghl_last_synced_at: new Date().toISOString(),
      }));

      const { data: upsertedData, error: upsertError } = await supabase
        .from('clients')
        .upsert(clientsToUpsert, { 
          onConflict: 'ghl_contact_id',
          ignoreDuplicates: false 
        })
        .select('id');

      if (upsertError) {
        console.error(`Error upserting page ${pageCount}:`, upsertError);
        errors.push(`Page ${pageCount}: ${upsertError.message}`);
        totalErrors += contacts.length;
      } else {
        const savedCount = upsertedData?.length || contacts.length;
        totalImported += savedCount;
        console.log(`Saved page ${pageCount}: ${savedCount} clients (total: ${totalImported})`);
      }

      // FIX: Use the LAST contact ID from this batch for proper pagination
      // The GHL API meta.startAfterId is unreliable - use the actual last contact ID
      const lastContact = contacts[contacts.length - 1];
      startAfterId = lastContact?.id || null;
      
      // If we got fewer than 100 contacts, we've reached the end
      if (contacts.length < 100) {
        console.log(`Received ${contacts.length} contacts (less than 100), reached end of data`);
        startAfterId = null;
        break;
      }

      console.log(`Next page will start after ID: ${startAfterId}`);
    }

    const hasMore = !!startAfterId;
    
    console.log(`Batch complete. Imported: ${totalImported}, Errors: ${totalErrors}, Has more: ${hasMore}, Next ID: ${startAfterId || 'none'}`);

    return new Response(JSON.stringify({
      success: true,
      message: hasMore 
        ? `Imported ${totalImported} clients. More contacts available...`
        : `Import complete! Imported ${totalImported} clients.`,
      stats: {
        imported: totalImported,
        errors: totalErrors,
        totalFromApi,
        pagesProcessed: pageCount,
      },
      hasMore,
      nextResumeId: startAfterId,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in import-clients-from-ghl:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
