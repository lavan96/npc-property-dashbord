import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
  createdTime: string;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Airtable proxy function called');

    // Get secrets from Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: secrets, error: secretsError } = await supabaseClient
      .from('vault.decrypted_secrets')
      .select('name, decrypted_secret')
      .in('name', ['AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_TABLE_NAME']);

    if (secretsError) {
      console.error('Error fetching secrets:', secretsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch configuration' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!secrets || secrets.length === 0) {
      console.error('No secrets found');
      return new Response(
        JSON.stringify({ error: 'Airtable credentials not configured' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Extract credentials from secrets
    const credentials: Record<string, string> = {};
    secrets.forEach(secret => {
      credentials[secret.name] = secret.decrypted_secret;
    });

    const token = credentials.AIRTABLE_TOKEN;
    const baseId = credentials.AIRTABLE_BASE_ID;
    const tableName = credentials.AIRTABLE_TABLE_NAME;

    if (!token || !baseId || !tableName) {
      console.error('Missing required credentials');
      return new Response(
        JSON.stringify({ error: 'Incomplete Airtable configuration' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse request parameters
    const url = new URL(req.url);
    const pageSize = url.searchParams.get('pageSize') || '100';
    const offset = url.searchParams.get('offset') || '';
    const sortField = url.searchParams.get('sortField') || 'Created';
    const sortDirection = url.searchParams.get('sortDirection') || 'desc';

    // Build Airtable API URL
    const airtableUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
    airtableUrl.searchParams.set('pageSize', pageSize);
    if (offset) {
      airtableUrl.searchParams.set('offset', offset);
    }
    airtableUrl.searchParams.set('sort[0][field]', sortField);
    airtableUrl.searchParams.set('sort[0][direction]', sortDirection);

    console.log('Making request to Airtable:', airtableUrl.toString());

    // Make request to Airtable
    const airtableResponse = await fetch(airtableUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!airtableResponse.ok) {
      console.error('Airtable API error:', airtableResponse.status, await airtableResponse.text());
      return new Response(
        JSON.stringify({ 
          error: `Airtable API error: ${airtableResponse.status}`,
          details: await airtableResponse.text()
        }),
        { 
          status: airtableResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data: AirtableResponse = await airtableResponse.json();
    console.log(`Successfully fetched ${data.records.length} records from Airtable`);

    // Transform the data to match the expected format
    const transformedRecords = data.records.map(record => ({
      id: record.id,
      fields: record.fields,
      createdTime: record.createdTime,
      // Transform to PropertyListing format
      title: record.fields.Property_Title || record.fields.Title || 'Untitled Property',
      price: record.fields.Price || record.fields.Asking_Price || 0,
      location: record.fields.Location || record.fields.Address || 'Location not specified',
      bedrooms: record.fields.Bedrooms || record.fields.Bedroom_Count || 0,
      bathrooms: record.fields.Bathrooms || record.fields.Bathroom_Count || 0,
      propertyType: record.fields.Property_Type || 'Unknown',
      listingDate: record.fields.Listed_Date || record.fields.Date_Listed || record.createdTime,
      status: record.fields.Status || 'Available',
      confidence: record.fields.Confidence_Score || record.fields.Confidence || 85,
      source: record.fields.Source || record.fields.Data_Source || 'Airtable',
      description: record.fields.Description || record.fields.Property_Description || '',
      images: record.fields.Images || record.fields.Property_Images || [],
      agent: record.fields.Agent || record.fields.Listing_Agent || 'Unknown Agent',
      features: record.fields.Features || record.fields.Property_Features || [],
    }));

    return new Response(
      JSON.stringify({
        records: transformedRecords,
        offset: data.offset,
        total: transformedRecords.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error in airtable-proxy:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});