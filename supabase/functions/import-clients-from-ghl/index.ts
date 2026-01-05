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
    const { clearExisting = false } = body;

    console.log(`Starting GHL contact import. Clear existing: ${clearExisting}`);

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json',
    };

    // Clear existing clients if requested
    if (clearExisting) {
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

    // Fetch ALL contacts from GHL with pagination (no limit)
    let allContacts: GHLContact[] = [];
    let startAfterId: string | null = null;
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
        allContacts = [...allContacts, ...data.contacts];
        startAfterId = data.meta?.startAfterId || null;
        console.log(`Total contacts so far: ${allContacts.length}, Next page ID: ${startAfterId || 'none'}`);
      } else {
        console.log('No more contacts to fetch');
        break;
      }

      // Safety: prevent infinite loops (max 1000 pages = 100,000 contacts)
      if (pageCount >= 1000) {
        console.log('Reached maximum page limit (1000 pages)');
        break;
      }

    } while (startAfterId)

    console.log(`Total contacts fetched from GHL: ${allContacts.length}`);

    // Get existing GHL contact IDs to avoid duplicates
    const { data: existingClients } = await supabase
      .from('clients')
      .select('ghl_contact_id')
      .not('ghl_contact_id', 'is', null);

    const existingGhlIds = new Set(existingClients?.map(c => c.ghl_contact_id) || []);

    // Filter out existing contacts
    const newContacts = allContacts.filter(c => !existingGhlIds.has(c.id));
    console.log(`New contacts to import: ${newContacts.length} (${allContacts.length - newContacts.length} already exist)`);

    // Insert new clients
    let importedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const contact of newContacts) {
      try {
        const clientData = {
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
        };

        const { error: insertError } = await supabase
          .from('clients')
          .insert(clientData);

        if (insertError) {
          console.error(`Failed to insert contact ${contact.id}:`, insertError);
          errors.push(`${contact.firstName} ${contact.lastName}: ${insertError.message}`);
          errorCount++;
        } else {
          importedCount++;
        }
      } catch (err) {
        console.error(`Error processing contact ${contact.id}:`, err);
        errors.push(`${contact.firstName} ${contact.lastName}: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`Import complete. Imported: ${importedCount}, Errors: ${errorCount}`);

    return new Response(JSON.stringify({
      success: true,
      message: `Imported ${importedCount} clients from GoHighLevel`,
      stats: {
        totalFetched: allContacts.length,
        alreadyExisted: allContacts.length - newContacts.length,
        imported: importedCount,
        errors: errorCount,
      },
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
