import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

interface AutoReportSwitch {
  id: string;
  name: string;
  is_enabled: boolean;
  priority: number;
  criteria: SwitchCriteria;
}

// Extract state from address or suburb
function extractState(address?: string, suburb?: string): string | null {
  const text = `${address || ''} ${suburb || ''}`.toUpperCase();
  const states = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
  
  for (const state of states) {
    // Check for state abbreviation with word boundaries
    const regex = new RegExp(`\\b${state}\\b`);
    if (regex.test(text)) {
      return state;
    }
  }
  
  // Check for full state names
  const stateNames: Record<string, string> = {
    'NEW SOUTH WALES': 'NSW',
    'VICTORIA': 'VIC',
    'QUEENSLAND': 'QLD',
    'WESTERN AUSTRALIA': 'WA',
    'SOUTH AUSTRALIA': 'SA',
    'TASMANIA': 'TAS',
    'AUSTRALIAN CAPITAL TERRITORY': 'ACT',
    'NORTHERN TERRITORY': 'NT',
  };
  
  for (const [fullName, abbrev] of Object.entries(stateNames)) {
    if (text.includes(fullName)) {
      return abbrev;
    }
  }
  
  return null;
}

// Evaluate if a listing matches a switch's criteria
function evaluateCriteria(listing: ListingData, criteria: SwitchCriteria): boolean {
  // Property Types
  if (criteria.propertyTypes?.length) {
    if (!listing.propertyType || !criteria.propertyTypes.includes(listing.propertyType)) {
      return false;
    }
  }
  
  // Price Range
  if (criteria.priceMin !== null && criteria.priceMin !== undefined) {
    if (!listing.price || listing.price < criteria.priceMin) {
      return false;
    }
  }
  if (criteria.priceMax !== null && criteria.priceMax !== undefined) {
    if (!listing.price || listing.price > criteria.priceMax) {
      return false;
    }
  }
  
  // Bedrooms
  if (criteria.bedsMin !== null && criteria.bedsMin !== undefined) {
    if (listing.beds === undefined || listing.beds === null || listing.beds < criteria.bedsMin) {
      return false;
    }
  }
  if (criteria.bedsMax !== null && criteria.bedsMax !== undefined) {
    if (listing.beds === undefined || listing.beds === null || listing.beds > criteria.bedsMax) {
      return false;
    }
  }
  
  // Bathrooms
  if (criteria.bathsMin !== null && criteria.bathsMin !== undefined) {
    if (listing.baths === undefined || listing.baths === null || listing.baths < criteria.bathsMin) {
      return false;
    }
  }
  if (criteria.bathsMax !== null && criteria.bathsMax !== undefined) {
    if (listing.baths === undefined || listing.baths === null || listing.baths > criteria.bathsMax) {
      return false;
    }
  }
  
  // States
  if (criteria.states?.length) {
    const listingState = listing.state || extractState(listing.address, listing.suburb);
    if (!listingState || !criteria.states.includes(listingState)) {
      return false;
    }
  }
  
  // Categories
  if (criteria.categories?.length) {
    if (!listing.category || !criteria.categories.includes(listing.category)) {
      return false;
    }
  }
  
  // Confidence Score
  if (criteria.confidenceMin !== null && criteria.confidenceMin !== undefined) {
    if (listing.confidence === undefined || listing.confidence === null || listing.confidence < criteria.confidenceMin) {
      return false;
    }
  }
  
  // Has Price
  if (criteria.hasPrice === true) {
    if (!listing.price) {
      return false;
    }
  } else if (criteria.hasPrice === false) {
    // No price required - always passes
  }
  
  // Source Hosts
  if (criteria.sourceHosts?.length) {
    if (!listing.sourceHost) {
      return false;
    }
    const normalizedHost = listing.sourceHost.toLowerCase();
    const matchesHost = criteria.sourceHosts.some(host => 
      normalizedHost.includes(host.toLowerCase())
    );
    if (!matchesHost) {
      return false;
    }
  }
  
  return true;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    
    // Support both single listing and batch
    const listings: ListingData[] = Array.isArray(body.listings) ? body.listings : [body.listing || body];
    
    if (!listings.length || !listings[0].id) {
      return new Response(
        JSON.stringify({ error: 'No valid listing data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Auto-Report Webhook] Processing ${listings.length} listing(s)`);

    // Check master switch
    const { data: masterSettings, error: masterError } = await supabase
      .from('auto_report_master_settings')
      .select('is_enabled')
      .single();
    
    if (masterError || !masterSettings?.is_enabled) {
      console.log('[Auto-Report Webhook] Master switch is OFF - skipping');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Master switch is disabled',
          processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get enabled switches (OR logic - any match triggers report)
    const { data: switches, error: switchError } = await supabase
      .from('auto_report_switches')
      .select('*')
      .eq('is_enabled', true);
    

    console.log(`[Auto-Report Webhook] Found ${switches.length} enabled switch(es)`);

    const results: Array<{ listingId: string; matched: boolean; switchName?: string; reportId?: string; error?: string }> = [];

    // Process each listing
    for (const listing of listings) {
      const listingAddress = listing.address || `Listing ${listing.id}`;
      console.log(`[Auto-Report Webhook] Evaluating listing: ${listingAddress}`);

      let matchedSwitch: AutoReportSwitch | null = null;

      // Evaluate against switches (OR logic - first match triggers)
      for (const switchItem of switches) {
        const criteria = switchItem.criteria as SwitchCriteria;
        if (evaluateCriteria(listing, criteria)) {
          matchedSwitch = switchItem;
          console.log(`[Auto-Report Webhook] Matched switch: ${switchItem.name}`);
          break; // One report per listing - first match triggers
        }
      }

      if (!matchedSwitch) {
        console.log(`[Auto-Report Webhook] No switch matched for listing ${listing.id}`);
        results.push({ listingId: listing.id, matched: false });
        continue;
      }

      // Create log entry
      const { data: logEntry, error: logError } = await supabase
        .from('auto_report_generation_log')
        .insert({
          listing_id: listing.id,
          listing_address: listingAddress,
          switch_id: matchedSwitch.id,
          switch_name: matchedSwitch.name,
          status: 'processing'
        })
        .select()
        .single();

      if (logError) {
        console.error(`[Auto-Report Webhook] Failed to create log entry: ${logError.message}`);
      }

      // Trigger report generation
      try {
        console.log(`[Auto-Report Webhook] Triggering report generation for ${listingAddress}`);
        
        // Prepare report generation payload
        const reportPayload = {
          queryType: 'address',
          address: listingAddress,
          propertyListingId: listing.id,
          weeklyRent: null, // Can be extracted from listing if available
          landSize: null,
          buildingSize: null,
          propertyType: listing.propertyType || null,
          purchasePrice: listing.price || null,
        };

        // Call generate-investment-report function
        const reportResponse = await fetch(`${supabaseUrl}/functions/v1/generate-investment-report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(reportPayload),
        });

        if (!reportResponse.ok) {
          const errorText = await reportResponse.text();
          throw new Error(`Report generation failed: ${errorText}`);
        }

        const reportResult = await reportResponse.json();
        
        // Update log entry with success
        if (logEntry) {
          await supabase
            .from('auto_report_generation_log')
            .update({
              status: 'completed',
              report_id: reportResult.reportId,
              completed_at: new Date().toISOString()
            })
            .eq('id', logEntry.id);
        }

        results.push({
          listingId: listing.id,
          matched: true,
          switchName: matchedSwitch.name,
          reportId: reportResult.reportId
        });

        console.log(`[Auto-Report Webhook] Report generated successfully: ${reportResult.reportId}`);
      } catch (genError) {
        const errorMessage = genError instanceof Error ? genError.message : 'Unknown error';
        console.error(`[Auto-Report Webhook] Report generation error: ${errorMessage}`);
        
        // Update log entry with failure
        if (logEntry) {
          await supabase
            .from('auto_report_generation_log')
            .update({
              status: 'failed',
              error_message: errorMessage,
              completed_at: new Date().toISOString()
            })
            .eq('id', logEntry.id);
        }

        results.push({
          listingId: listing.id,
          matched: true,
          switchName: matchedSwitch.name,
          error: errorMessage
        });
      }
    }

    const successCount = results.filter(r => r.reportId).length;
    const failedCount = results.filter(r => r.error).length;
    const skippedCount = results.filter(r => !r.matched).length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: listings.length,
        generated: successCount,
        failed: failedCount,
        skipped: skippedCount,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Auto-Report Webhook] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
