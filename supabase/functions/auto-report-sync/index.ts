import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
  createdTime: string;
}

interface SwitchCriteria {
  propertyTypes?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  bedsMin?: number | null;
  bedsMax?: number | null;
  bathsMin?: number | null;
  bathsMax?: number | null;
  states?: string[];
  categories?: string[];
  confidenceMin?: number | null;
  hasPrice?: boolean | null;
  sourceHosts?: string[];
}

interface ListingData {
  id: string;
  address?: string;
  suburb?: string;
  propertyType?: string;
  category?: string;
  price?: number;
  beds?: number;
  baths?: number;
  confidence?: number;
  sourceHost?: string;
  state?: string;
}

// Extract state from address or suburb
function extractState(address?: string, suburb?: string): string | null {
  const text = `${address || ''} ${suburb || ''}`.toUpperCase();
  const states = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
  
  for (const state of states) {
    const regex = new RegExp(`\\b${state}\\b`);
    if (regex.test(text)) return state;
  }
  
  const stateNames: Record<string, string> = {
    'NEW SOUTH WALES': 'NSW', 'VICTORIA': 'VIC', 'QUEENSLAND': 'QLD',
    'WESTERN AUSTRALIA': 'WA', 'SOUTH AUSTRALIA': 'SA', 'TASMANIA': 'TAS',
    'AUSTRALIAN CAPITAL TERRITORY': 'ACT', 'NORTHERN TERRITORY': 'NT',
  };
  
  for (const [fullName, abbrev] of Object.entries(stateNames)) {
    if (text.includes(fullName)) return abbrev;
  }
  
  return null;
}

// Evaluate if a listing matches a switch's criteria
function evaluateCriteria(listing: ListingData, criteria: SwitchCriteria): boolean {
  if (criteria.propertyTypes?.length) {
    if (!listing.propertyType || !criteria.propertyTypes.includes(listing.propertyType)) return false;
  }
  if (criteria.priceMin != null && (!listing.price || listing.price < criteria.priceMin)) return false;
  if (criteria.priceMax != null && (!listing.price || listing.price > criteria.priceMax)) return false;
  if (criteria.bedsMin != null && (listing.beds == null || listing.beds < criteria.bedsMin)) return false;
  if (criteria.bedsMax != null && (listing.beds == null || listing.beds > criteria.bedsMax)) return false;
  if (criteria.bathsMin != null && (listing.baths == null || listing.baths < criteria.bathsMin)) return false;
  if (criteria.bathsMax != null && (listing.baths == null || listing.baths > criteria.bathsMax)) return false;
  
  if (criteria.states?.length) {
    const listingState = listing.state || extractState(listing.address, listing.suburb);
    if (!listingState || !criteria.states.includes(listingState)) return false;
  }
  if (criteria.categories?.length) {
    if (!listing.category || !criteria.categories.includes(listing.category)) return false;
  }
  if (criteria.confidenceMin != null && (listing.confidence == null || listing.confidence < criteria.confidenceMin)) return false;
  if (criteria.hasPrice === true && !listing.price) return false;
  if (criteria.sourceHosts?.length) {
    if (!listing.sourceHost) return false;
    const normalizedHost = listing.sourceHost.toLowerCase();
    if (!criteria.sourceHosts.some(host => normalizedHost.includes(host.toLowerCase()))) return false;
  }
  
  return true;
}

// Transform Airtable record to listing data
function transformRecord(record: AirtableRecord): ListingData {
  const f = record.fields;
  
  // Log first record's field names for debugging
  console.log(`[Auto-Report Sync] Record ${record.id} field names:`, Object.keys(f));
  console.log(`[Auto-Report Sync] Record ${record.id} sample fields:`, {
    'Address': f['Address'],
    'address': f['address'],
    'Full Address': f['Full Address'],
    'Property Address': f['Property Address'],
  });
  
  // Try multiple possible field names for address
  const address = f['Address'] || f['address'] || f['Full Address'] || f['Property Address'] || f['full_address'] || f['property_address'];
  
  return {
    id: record.id,
    address: address,
    suburb: f['Suburb'] || f['suburb'],
    propertyType: f['Property Type'] || f['propertyType'] || f['property_type'],
    category: f['Category'] || f['category'],
    price: f['Price'] || f['price'],
    beds: f['Beds'] || f['beds'] || f['Bedrooms'] || f['bedrooms'],
    baths: f['Baths'] || f['baths'] || f['Bathrooms'] || f['bathrooms'],
    confidence: f['Confidence'] || f['confidence'],
    sourceHost: f['Source Host'] || f['sourceHost'] || f['source_host'],
    state: f['State'] || f['state'],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const airtableToken = Deno.env.get('AIRTABLE_TOKEN');
    const airtableBaseId = Deno.env.get('AIRTABLE_BASE_ID');
    const airtableTableName = Deno.env.get('AIRTABLE_TABLE_NAME') || 'Property Listings';
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for options
    let maxRecords = 50;
    let dryRun = false;
    try {
      const body = await req.json();
      maxRecords = body.maxRecords || 50;
      dryRun = body.dryRun || false;
    } catch {
      // No body or invalid JSON - use defaults
    }

    console.log(`[Auto-Report Sync] Starting sync (maxRecords: ${maxRecords}, dryRun: ${dryRun})`);

    // Check master switch
    const { data: masterSettings } = await supabase
      .from('auto_report_master_settings')
      .select('is_enabled')
      .single();
    
    if (!masterSettings?.is_enabled) {
      return new Response(
        JSON.stringify({ success: true, message: 'Master switch is disabled', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get enabled switches (OR logic - any match triggers report)
    // If no switches are enabled, process ALL listings (master switch controls overall automation)
    const { data: switches } = await supabase
      .from('auto_report_switches')
      .select('*')
      .eq('is_enabled', true);
    
    const enabledSwitches = switches || [];
    const processAllListings = enabledSwitches.length === 0;
    
    console.log(`[Auto-Report Sync] Mode: ${processAllListings ? 'Process ALL listings (no sub-switches enabled)' : `Filter by ${enabledSwitches.length} enabled switch(es)`}`);

    // Get already processed listing IDs
    const { data: processedListings } = await supabase
      .from('auto_report_processed_listings')
      .select('listing_id');
    
    const processedIds = new Set((processedListings || []).map(p => p.listing_id));

    // Fetch recent records from Airtable
    if (!airtableToken || !airtableBaseId) {
      return new Response(
        JSON.stringify({ error: 'Airtable credentials not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch most recent records sorted by Created field
    const airtableUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(airtableTableName)}?maxRecords=${maxRecords}&sort[0][field]=Created&sort[0][direction]=desc`;
    
    const airtableResponse = await fetch(airtableUrl, {
      headers: { 'Authorization': `Bearer ${airtableToken}` },
    });

    if (!airtableResponse.ok) {
      const errorText = await airtableResponse.text();
      throw new Error(`Airtable API error: ${errorText}`);
    }

    const airtableData = await airtableResponse.json();
    const records: AirtableRecord[] = airtableData.records || [];

    console.log(`[Auto-Report Sync] Fetched ${records.length} records from Airtable`);

    const results: Array<{
      listingId: string;
      address: string;
      status: 'generated' | 'skipped' | 'already_processed' | 'no_match' | 'error';
      switchName?: string;
      reportId?: string;
      error?: string;
    }> = [];

    for (const record of records) {
      const listing = transformRecord(record);
      const address = listing.address || `Record ${record.id}`;

      // Skip if already processed
      if (processedIds.has(record.id)) {
        results.push({ listingId: record.id, address, status: 'already_processed' });
        continue;
      }

      // Find matching switch (OR logic - first match triggers)
      // If no switches enabled, process all listings automatically
      let matchedSwitch: any = null;
      let shouldProcess = processAllListings; // Process all if no switches enabled
      
      if (!processAllListings) {
        // Check against enabled switches
        for (const sw of enabledSwitches) {
          if (evaluateCriteria(listing, sw.criteria as SwitchCriteria)) {
            matchedSwitch = sw;
            shouldProcess = true;
            break; // One report per listing
          }
        }
      }

      if (!shouldProcess) {
        // Record as processed but skipped (no match)
        if (!dryRun) {
          await supabase.from('auto_report_processed_listings').insert({
            listing_id: record.id,
            listing_address: address,
            skipped: true,
            skip_reason: 'No matching switch criteria'
          });
        }
        results.push({ listingId: record.id, address, status: 'no_match' });
        continue;
      }

      const switchName = matchedSwitch?.name || 'Master Switch (All Listings)';
      const switchId = matchedSwitch?.id || null;

      if (dryRun) {
        results.push({ listingId: record.id, address, status: 'generated', switchName });
        continue;
      }

      // Generate report
      try {
        // First, create a pending report record in the database
        const { data: reportRecord, error: reportError } = await supabase
          .from('investment_reports')
          .insert({
            property_address: address,
            property_listing_id: record.id,
            report_content: '',
            status: 'pending',
            report_scope: 'address'
          })
          .select()
          .single();

        if (reportError || !reportRecord) {
          throw new Error(`Failed to create report record: ${reportError?.message}`);
        }

        const reportId = reportRecord.id;
        console.log(`[Auto-Report Sync] Created report record: ${reportId} for ${address}`);

        // Log the attempt
        const { data: logEntry } = await supabase
          .from('auto_report_generation_log')
          .insert({
            listing_id: record.id,
            listing_address: address,
            switch_id: switchId,
            switch_name: switchName,
            status: 'processing',
            report_id: reportId
          })
          .select()
          .single();

        // Fire-and-forget: Start report generation without waiting for completion
        // The generate-investment-report function will update the report status when done
        fetch(`${supabaseUrl}/functions/v1/generate-investment-report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            reportId: reportId,
            propertyAddress: address,
            propertyDetails: {
              queryType: 'address',
              propertyListingId: record.id,
              propertyType: listing.propertyType,
              price: listing.price, // Required for investment scoring
              purchasePrice: listing.price,
              weeklyRent: listing.estimatedRent || listing.weeklyRent || 0, // Required for scoring
              beds: listing.bedrooms,
              baths: listing.bathrooms,
            },
          }),
        }).catch(err => {
          console.error(`[Auto-Report Sync] Background report generation error for ${reportId}:`, err);
        });

        // Mark as processed immediately - report will be generated in background
        await supabase.from('auto_report_processed_listings').insert({
          listing_id: record.id,
          listing_address: address,
          switch_id: switchId,
          report_id: reportId,
          skipped: false
        });

        // Update log - mark as processing (report generation is async)
        if (logEntry) {
          await supabase.from('auto_report_generation_log')
            .update({ status: 'processing', report_id: reportId })
            .eq('id', logEntry.id);
        }

        console.log(`[Auto-Report Sync] Queued report ${reportId} for ${address} (generating in background)`);

        results.push({
          listingId: record.id,
          address,
          status: 'generated',
          switchName,
          reportId: reportId
        });

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        
        await supabase.from('auto_report_processed_listings').insert({
          listing_id: record.id,
          listing_address: address,
          skipped: true,
          skip_reason: `Error: ${errorMsg}`
        });

        results.push({ listingId: record.id, address, status: 'error', error: errorMsg });
      }
    }

    const summary = {
      total: records.length,
      generated: results.filter(r => r.status === 'generated').length,
      skipped: results.filter(r => r.status === 'skipped' || r.status === 'no_match').length,
      alreadyProcessed: results.filter(r => r.status === 'already_processed').length,
      errors: results.filter(r => r.status === 'error').length,
    };

    console.log(`[Auto-Report Sync] Complete:`, summary);

    return new Response(
      JSON.stringify({ success: true, dryRun, summary, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Auto-Report Sync] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
