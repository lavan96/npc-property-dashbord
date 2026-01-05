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
    const { clearExisting = false, resumeFromId = null, batchSize = 50 } = body;
    
    // Batch size is in pages (100 contacts per page), default 50 pages = 5000 contacts per request
    const maxPagesPerBatch = batchSize;

    console.log(`Starting GHL contact import. Clear existing: ${clearExisting}, Resume from: ${resumeFromId || 'start'}, Max pages: ${maxPagesPerBatch}`);

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

    // Fetch contacts from GHL with pagination - LIMITED to batch size per request
    let batchContacts: GHLContact[] = [];
    let startAfterId: string | null = resumeFromId;
    let pageCount = 0;

    do {
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
      console.log(`Received ${data.contacts?.length || 0} contacts from GHL (page ${pageCount})`);

      if (data.contacts && data.contacts.length > 0) {
        batchContacts = [...batchContacts, ...data.contacts];
        startAfterId = data.meta?.startAfterId || null;
        console.log(`Batch contacts so far: ${batchContacts.length}, Next page ID: ${startAfterId || 'none'}`);
      } else {
        console.log('No more contacts to fetch');
        startAfterId = null;
        break;
      }

      // Stop when we've reached our batch limit
      if (pageCount >= maxPagesPerBatch) {
        console.log(`Reached batch limit of ${maxPagesPerBatch} pages`);
        break;
      }

    } while (startAfterId);

    console.log(`Total contacts fetched in this batch: ${batchContacts.length}`);

    // Insert clients using upsert to handle duplicates
    let importedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process in chunks of 100 for database efficiency
    const dbChunkSize = 100;
    for (let i = 0; i < batchContacts.length; i += dbChunkSize) {
      const chunk = batchContacts.slice(i, i + dbChunkSize);
      
      const clientsToUpsert = chunk.map(contact => ({
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
        console.error(`Error upserting chunk ${Math.floor(i / dbChunkSize) + 1}:`, upsertError);
        errors.push(`Chunk ${Math.floor(i / dbChunkSize) + 1}: ${upsertError.message}`);
        errorCount += chunk.length;
      } else {
        importedCount += upsertedData?.length || chunk.length;
        console.log(`Upserted chunk ${Math.floor(i / dbChunkSize) + 1}: ${upsertedData?.length || chunk.length} clients`);
      }
    }

    const hasMore = !!startAfterId;
    
    console.log(`Batch import complete. Imported: ${importedCount}, Errors: ${errorCount}, Has more: ${hasMore}`);

    return new Response(JSON.stringify({
      success: true,
      message: hasMore 
        ? `Imported ${importedCount} clients. More contacts available...`
        : `Import complete! Imported ${importedCount} clients.`,
      stats: {
        batchImported: importedCount,
        errors: errorCount,
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
