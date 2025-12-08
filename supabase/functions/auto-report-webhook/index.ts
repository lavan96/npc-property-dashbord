import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ListingData {
  id: string;
  address?: string;
  propertyName?: string;  // OR alternative to address
  property_name?: string; // Snake case variant
  suburb?: string;
  propertyType?: string;
  category?: string;
  price?: number;
  beds?: number;
  baths?: number;
  confidence?: number;
  sourceHost?: string;
  state?: string;
  zipcode?: string;  // Some Airtable records use zipcode instead of postcode
  postcode?: string; // Standard Australian postcode field
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

// Common Australian suburbs with their states and postcodes (fallback lookup)
const SUBURB_LOOKUP: Record<string, { state: string; postcode: string }> = {
  // QLD suburbs
  'GATTON': { state: 'QLD', postcode: '4343' },
  'BRISBANE': { state: 'QLD', postcode: '4000' },
  'GOLD COAST': { state: 'QLD', postcode: '4217' },
  'SURFERS PARADISE': { state: 'QLD', postcode: '4217' },
  'CAIRNS': { state: 'QLD', postcode: '4870' },
  'TOWNSVILLE': { state: 'QLD', postcode: '4810' },
  'TOOWOOMBA': { state: 'QLD', postcode: '4350' },
  'ROCKHAMPTON': { state: 'QLD', postcode: '4700' },
  'MACKAY': { state: 'QLD', postcode: '4740' },
  'BUNDABERG': { state: 'QLD', postcode: '4670' },
  'HERVEY BAY': { state: 'QLD', postcode: '4655' },
  'GLADSTONE': { state: 'QLD', postcode: '4680' },
  'NOOSA': { state: 'QLD', postcode: '4567' },
  'CALOUNDRA': { state: 'QLD', postcode: '4551' },
  'MAROOCHYDORE': { state: 'QLD', postcode: '4558' },
  'IPSWICH': { state: 'QLD', postcode: '4305' },
  'SPRINGFIELD': { state: 'QLD', postcode: '4300' },
  'LOGAN': { state: 'QLD', postcode: '4114' },
  'REDLAND BAY': { state: 'QLD', postcode: '4165' },
  'CABOOLTURE': { state: 'QLD', postcode: '4510' },
  'STRATHPINE': { state: 'QLD', postcode: '4500' },
  'REDCLIFFE': { state: 'QLD', postcode: '4020' },
  'MORETON BAY': { state: 'QLD', postcode: '4508' },
  
  // NSW suburbs
  'SYDNEY': { state: 'NSW', postcode: '2000' },
  'PARRAMATTA': { state: 'NSW', postcode: '2150' },
  'NEWCASTLE': { state: 'NSW', postcode: '2300' },
  'WOLLONGONG': { state: 'NSW', postcode: '2500' },
  'CENTRAL COAST': { state: 'NSW', postcode: '2250' },
  'GOSFORD': { state: 'NSW', postcode: '2250' },
  'PENRITH': { state: 'NSW', postcode: '2750' },
  'LIVERPOOL': { state: 'NSW', postcode: '2170' },
  'CAMPBELLTOWN': { state: 'NSW', postcode: '2560' },
  'BLACKTOWN': { state: 'NSW', postcode: '2148' },
  'CHATSWOOD': { state: 'NSW', postcode: '2067' },
  'MANLY': { state: 'NSW', postcode: '2095' },
  'BONDI': { state: 'NSW', postcode: '2026' },
  'COOGEE': { state: 'NSW', postcode: '2034' },
  'CRONULLA': { state: 'NSW', postcode: '2230' },
  'HURSTVILLE': { state: 'NSW', postcode: '2220' },
  'BANKSTOWN': { state: 'NSW', postcode: '2200' },
  'AUBURN': { state: 'NSW', postcode: '2144' },
  'RYDE': { state: 'NSW', postcode: '2112' },
  'HORNSBY': { state: 'NSW', postcode: '2077' },
  'CASTLE HILL': { state: 'NSW', postcode: '2154' },
  'BAULKHAM HILLS': { state: 'NSW', postcode: '2153' },
  'EPPING': { state: 'NSW', postcode: '2121' },
  'NORTH SYDNEY': { state: 'NSW', postcode: '2060' },
  'MOSMAN': { state: 'NSW', postcode: '2088' },
  'RANDWICK': { state: 'NSW', postcode: '2031' },
  'MAROUBRA': { state: 'NSW', postcode: '2035' },
  'TAMWORTH': { state: 'NSW', postcode: '2340' },
  'DUBBO': { state: 'NSW', postcode: '2830' },
  'WAGGA WAGGA': { state: 'NSW', postcode: '2650' },
  'ALBURY': { state: 'NSW', postcode: '2640' },
  'BATHURST': { state: 'NSW', postcode: '2795' },
  'ORANGE': { state: 'NSW', postcode: '2800' },
  'COFFS HARBOUR': { state: 'NSW', postcode: '2450' },
  'PORT MACQUARIE': { state: 'NSW', postcode: '2444' },
  'LISMORE': { state: 'NSW', postcode: '2480' },
  'BYRON BAY': { state: 'NSW', postcode: '2481' },
  'TWEED HEADS': { state: 'NSW', postcode: '2485' },
  
  // VIC suburbs
  'MELBOURNE': { state: 'VIC', postcode: '3000' },
  'GEELONG': { state: 'VIC', postcode: '3220' },
  'BALLARAT': { state: 'VIC', postcode: '3350' },
  'BENDIGO': { state: 'VIC', postcode: '3550' },
  'SHEPPARTON': { state: 'VIC', postcode: '3630' },
  'MILDURA': { state: 'VIC', postcode: '3500' },
  'WARRNAMBOOL': { state: 'VIC', postcode: '3280' },
  'TRARALGON': { state: 'VIC', postcode: '3844' },
  'FRANKSTON': { state: 'VIC', postcode: '3199' },
  'DANDENONG': { state: 'VIC', postcode: '3175' },
  'BOX HILL': { state: 'VIC', postcode: '3128' },
  'RINGWOOD': { state: 'VIC', postcode: '3134' },
  'DONCASTER': { state: 'VIC', postcode: '3108' },
  'BRUNSWICK': { state: 'VIC', postcode: '3056' },
  'FOOTSCRAY': { state: 'VIC', postcode: '3011' },
  'WERRIBEE': { state: 'VIC', postcode: '3030' },
  'SUNSHINE': { state: 'VIC', postcode: '3020' },
  'ST KILDA': { state: 'VIC', postcode: '3182' },
  'SOUTH YARRA': { state: 'VIC', postcode: '3141' },
  'RICHMOND': { state: 'VIC', postcode: '3121' },
  'COLLINGWOOD': { state: 'VIC', postcode: '3066' },
  'FITZROY': { state: 'VIC', postcode: '3065' },
  'CARLTON': { state: 'VIC', postcode: '3053' },
  'HAWTHORN': { state: 'VIC', postcode: '3122' },
  'MALVERN': { state: 'VIC', postcode: '3144' },
  'BRIGHTON': { state: 'VIC', postcode: '3186' },
  'MORNINGTON': { state: 'VIC', postcode: '3931' },
  
  // WA suburbs
  'PERTH': { state: 'WA', postcode: '6000' },
  'FREMANTLE': { state: 'WA', postcode: '6160' },
  'JOONDALUP': { state: 'WA', postcode: '6027' },
  'ROCKINGHAM': { state: 'WA', postcode: '6168' },
  'MANDURAH': { state: 'WA', postcode: '6210' },
  'BUNBURY': { state: 'WA', postcode: '6230' },
  'GERALDTON': { state: 'WA', postcode: '6530' },
  'KALGOORLIE': { state: 'WA', postcode: '6430' },
  'ALBANY': { state: 'WA', postcode: '6330' },
  'ARMADALE': { state: 'WA', postcode: '6112' },
  'MIDLAND': { state: 'WA', postcode: '6056' },
  'SUBIACO': { state: 'WA', postcode: '6008' },
  'COTTESLOE': { state: 'WA', postcode: '6011' },
  'CLAREMONT': { state: 'WA', postcode: '6010' },
  'SCARBOROUGH': { state: 'WA', postcode: '6019' },
  
  // SA suburbs
  'ADELAIDE': { state: 'SA', postcode: '5000' },
  'GLENELG': { state: 'SA', postcode: '5045' },
  'PORT ADELAIDE': { state: 'SA', postcode: '5015' },
  'MOUNT BARKER': { state: 'SA', postcode: '5251' },
  'MOUNT GAMBIER': { state: 'SA', postcode: '5290' },
  'WHYALLA': { state: 'SA', postcode: '5600' },
  'PORT LINCOLN': { state: 'SA', postcode: '5606' },
  'MURRAY BRIDGE': { state: 'SA', postcode: '5253' },
  'VICTOR HARBOR': { state: 'SA', postcode: '5211' },
  'NORWOOD': { state: 'SA', postcode: '5067' },
  'UNLEY': { state: 'SA', postcode: '5061' },
  'BURNSIDE': { state: 'SA', postcode: '5066' },
  'MODBURY': { state: 'SA', postcode: '5092' },
  'SALISBURY': { state: 'SA', postcode: '5108' },
  'ELIZABETH': { state: 'SA', postcode: '5112' },
  
  // TAS suburbs
  'HOBART': { state: 'TAS', postcode: '7000' },
  'LAUNCESTON': { state: 'TAS', postcode: '7250' },
  'DEVONPORT': { state: 'TAS', postcode: '7310' },
  'BURNIE': { state: 'TAS', postcode: '7320' },
  'KINGSTON': { state: 'TAS', postcode: '7050' },
  'GLENORCHY': { state: 'TAS', postcode: '7010' },
  'SANDY BAY': { state: 'TAS', postcode: '7005' },
  
  // NT suburbs
  'DARWIN': { state: 'NT', postcode: '0800' },
  'PALMERSTON': { state: 'NT', postcode: '0830' },
  'ALICE SPRINGS': { state: 'NT', postcode: '0870' },
  'KATHERINE': { state: 'NT', postcode: '0850' },
  
  // ACT suburbs
  'CANBERRA': { state: 'ACT', postcode: '2600' },
  'BELCONNEN': { state: 'ACT', postcode: '2617' },
  'WODEN': { state: 'ACT', postcode: '2606' },
  'TUGGERANONG': { state: 'ACT', postcode: '2900' },
  'GUNGAHLIN': { state: 'ACT', postcode: '2912' },
  'CIVIC': { state: 'ACT', postcode: '2601' },
  'BRADDON': { state: 'ACT', postcode: '2612' },
  'KINGSTON': { state: 'ACT', postcode: '2604' },
  'MANUKA': { state: 'ACT', postcode: '2603' },
};

// Async function to lookup suburb in schools_directory database
async function lookupSuburbInDatabase(
  supabase: ReturnType<typeof createClient>,
  suburb: string
): Promise<{ state: string; postcode: string } | null> {
  if (!suburb) return null;
  
  const normalizedSuburb = suburb.trim().toUpperCase();
  
  try {
    const { data, error } = await supabase
      .from('schools_directory')
      .select('state, postcode')
      .ilike('suburb', normalizedSuburb)
      .limit(1)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return { state: data.state, postcode: data.postcode };
  } catch {
    return null;
  }
}

// Lookup suburb from static mapping
function lookupSuburbStatic(suburb: string): { state: string; postcode: string } | null {
  if (!suburb) return null;
  const normalizedSuburb = suburb.trim().toUpperCase();
  return SUBURB_LOOKUP[normalizedSuburb] || null;
}

// Extract state from address or suburb text patterns
function extractStateFromText(address?: string, suburb?: string): string | null {
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

// Extract postcode from address text (4 digit number for Australian postcodes)
function extractPostcodeFromText(address?: string): string | null {
  if (!address) return null;
  
  // Australian postcodes are 4 digits, typically at the end of address
  const postcodeMatch = address.match(/\b(\d{4})\b/);
  if (postcodeMatch) {
    const postcode = postcodeMatch[1];
    // Basic validation: Australian postcodes start with 0-7
    if (['0', '1', '2', '3', '4', '5', '6', '7'].includes(postcode[0])) {
      return postcode;
    }
  }
  return null;
}

// Determine state from postcode range
function getStateFromPostcode(postcode: string): string | null {
  if (!postcode || postcode.length !== 4) return null;
  
  const firstDigit = parseInt(postcode[0], 10);
  const postcodeNum = parseInt(postcode, 10);
  
  // NSW: 1000-2599, 2619-2899, 2921-2999
  if (firstDigit === 1 || firstDigit === 2) {
    if (postcodeNum >= 2600 && postcodeNum <= 2618) return 'ACT';
    if (postcodeNum === 2620 || postcodeNum === 2900) return 'ACT'; // Jerrabomberra/Tuggeranong
    return 'NSW';
  }
  
  // VIC: 3000-3999, 8000-8999
  if (firstDigit === 3 || firstDigit === 8) return 'VIC';
  
  // QLD: 4000-4999, 9000-9999
  if (firstDigit === 4 || firstDigit === 9) return 'QLD';
  
  // SA: 5000-5799
  if (firstDigit === 5) return 'SA';
  
  // WA: 6000-6797
  if (firstDigit === 6) return 'WA';
  
  // TAS: 7000-7799
  if (firstDigit === 7) return 'TAS';
  
  // NT: 0800-0899
  if (firstDigit === 0) return 'NT';
  
  return null;
}

// Main function to auto-detect state and postcode
async function autoDetectLocation(
  supabase: ReturnType<typeof createClient>,
  listing: ListingData
): Promise<{ state: string | null; postcode: string | null }> {
  let detectedState = listing.state || null;
  // Check if listing has explicit postcode/zipcode
  let detectedPostcode: string | null = listing.postcode || listing.zipcode || null;
  
  // Priority 1: Use explicit state if provided and valid
  if (detectedState && ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].includes(detectedState.toUpperCase())) {
    detectedState = detectedState.toUpperCase();
    console.log(`[Auto-Detect] Using explicit state from listing: ${detectedState}`);
  } else {
    detectedState = null;
  }
  
  // Priority 2: If we have explicit postcode, derive state from it
  if (!detectedState && detectedPostcode) {
    detectedState = getStateFromPostcode(detectedPostcode);
    if (detectedState) {
      console.log(`[Auto-Detect] Derived state from explicit postcode ${detectedPostcode}: ${detectedState}`);
    }
  }
  
  // Priority 3: Extract from address text
  if (!detectedState) {
    detectedState = extractStateFromText(listing.address, listing.suburb);
    if (detectedState) {
      console.log(`[Auto-Detect] Found state in address/suburb text: ${detectedState}`);
    }
  }
  
  // Priority 4: Extract postcode from address and derive state
  if (!detectedState) {
    const addressPostcode = extractPostcodeFromText(listing.address);
    if (addressPostcode) {
      detectedPostcode = detectedPostcode || addressPostcode;
      detectedState = getStateFromPostcode(addressPostcode);
      console.log(`[Auto-Detect] Derived state from address postcode ${addressPostcode}: ${detectedState}`);
    }
  }
  
  // Priority 4: Lookup suburb in database (schools_directory)
  if (!detectedState && listing.suburb) {
    const dbLookup = await lookupSuburbInDatabase(supabase, listing.suburb);
    if (dbLookup) {
      detectedState = dbLookup.state;
      detectedPostcode = detectedPostcode || dbLookup.postcode;
      console.log(`[Auto-Detect] Found suburb "${listing.suburb}" in database: state=${detectedState}, postcode=${detectedPostcode}`);
    }
  }
  
  // Priority 5: Static suburb lookup
  if (!detectedState && listing.suburb) {
    const staticLookup = lookupSuburbStatic(listing.suburb);
    if (staticLookup) {
      detectedState = staticLookup.state;
      detectedPostcode = detectedPostcode || staticLookup.postcode;
      console.log(`[Auto-Detect] Found suburb "${listing.suburb}" in static lookup: state=${detectedState}, postcode=${detectedPostcode}`);
    }
  }
  
  // Try to get postcode from suburb if we have state but no postcode
  if (detectedState && !detectedPostcode && listing.suburb) {
    const staticLookup = lookupSuburbStatic(listing.suburb);
    if (staticLookup && staticLookup.state === detectedState) {
      detectedPostcode = staticLookup.postcode;
    } else {
      const dbLookup = await lookupSuburbInDatabase(supabase, listing.suburb);
      if (dbLookup && dbLookup.state === detectedState) {
        detectedPostcode = dbLookup.postcode;
      }
    }
  }
  
  if (!detectedState) {
    console.log(`[Auto-Detect] Could not determine state for suburb: ${listing.suburb}`);
  }
  
  return { state: detectedState, postcode: detectedPostcode };
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
  
  // States - use extractStateFromText for synchronous check in criteria evaluation
  if (criteria.states?.length) {
    const listingState = listing.state?.toUpperCase() || extractStateFromText(listing.address, listing.suburb);
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
      // Debug: Log all received fields
      console.log(`[Auto-Report Webhook] Received listing data:`, JSON.stringify(listing, null, 2));
      
      // Auto-detect state and postcode if missing
      const { state: detectedState, postcode: detectedPostcode } = await autoDetectLocation(supabase, listing);
      
      // Update listing with detected values for criteria evaluation and report generation
      const enrichedListing = {
        ...listing,
        state: listing.state || detectedState,
        detectedPostcode: detectedPostcode,
      };
      
      console.log(`[Auto-Report Webhook] Location detection: state=${enrichedListing.state}, postcode=${detectedPostcode}`);
      
      // Construct the best possible address from available data (OR logic: address OR propertyName)
      let listingAddress = '';
      const propertyName = listing.propertyName || listing.property_name;
      
      if (listing.address && listing.address.trim()) {
        // Priority 1: Use street address if available
        listingAddress = listing.address.trim();
        console.log(`[Auto-Report Webhook] Using street address: ${listingAddress}`);
      } else if (propertyName && propertyName.trim()) {
        // Priority 2: Use property name if no street address
        listingAddress = propertyName.trim();
        console.log(`[Auto-Report Webhook] No street address, using property name: ${listingAddress}`);
      } else if (listing.suburb && enrichedListing.state) {
        // Priority 3: Fall back to suburb + state (use detected state)
        listingAddress = `${listing.suburb}, ${enrichedListing.state}`;
        console.log(`[Auto-Report Webhook] No address/propertyName, using suburb/state: ${listingAddress}`);
      } else if (listing.suburb) {
        // Priority 4: Just suburb
        listingAddress = listing.suburb;
        console.log(`[Auto-Report Webhook] No address/propertyName, using suburb only: ${listingAddress}`);
      } else {
        // Last resort
        listingAddress = `Unknown Property (${listing.id})`;
        console.log(`[Auto-Report Webhook] No address data available, using fallback: ${listingAddress}`);
      }
      
      console.log(`[Auto-Report Webhook] Evaluating listing: ${listingAddress}`);

      let matchedSwitch: AutoReportSwitch | null = null;

      // Evaluate against switches (OR logic - first match triggers) using enriched listing with detected state
      for (const switchItem of switches) {
        const criteria = switchItem.criteria as SwitchCriteria;
        if (evaluateCriteria(enrichedListing, criteria)) {
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
        
        // First, create a pending report in the database so we have a reportId
        const { data: newReport, error: createError } = await supabase
          .from('investment_reports')
          .insert({
            property_address: listingAddress,
            property_listing_id: listing.id,
            report_content: '',
            status: 'pending',
            report_scope: 'address'
          })
          .select('id')
          .single();
        
        if (createError || !newReport) {
          throw new Error(`Failed to create report record: ${createError?.message || 'Unknown error'}`);
        }
        
        const createdReportId = newReport.id;
        console.log(`[Auto-Report Webhook] Created pending report with ID: ${createdReportId}`);
        
        // Prepare report generation payload with the reportId and detected location data
        const reportPayload = {
          reportId: createdReportId, // Include reportId so generate-investment-report updates this record
          propertyAddress: listingAddress,
          propertyDetails: {
            queryType: 'address',
            suburb: listing.suburb || null,
            state: enrichedListing.state || null,
            postcode: detectedPostcode || null,
          },
          propertyListingId: listing.id,
          weeklyRent: listing.price ? listing.price : null, // Use price field as weekly rent if available
          landSize: null,
          buildingSize: null,
          propertyType: listing.propertyType || null,
          purchasePrice: null,
          // Include detected location for better report generation
          suburb: listing.suburb || null,
          state: enrichedListing.state || null,
          postcode: detectedPostcode || null,
        };
        
        console.log(`[Auto-Report Webhook] Report payload includes: suburb=${listing.suburb}, state=${enrichedListing.state}, postcode=${detectedPostcode}`);

        // Call generate-investment-report function (fire-and-forget pattern for long operations)
        // Don't await the full response to avoid timeout - the function will update the DB directly
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
        console.log(`[Auto-Report Webhook] Report generation response received, success: ${reportResult.success}`);
        
        // Update log entry with success
        if (logEntry) {
          await supabase
            .from('auto_report_generation_log')
            .update({
              status: 'completed',
              report_id: createdReportId,
              completed_at: new Date().toISOString()
            })
            .eq('id', logEntry.id);
        }

        // Also mark as processed
        await supabase
          .from('auto_report_processed_listings')
          .upsert({
            listing_id: listing.id,
            listing_address: listingAddress,
            report_id: createdReportId,
            switch_id: matchedSwitch.id,
            skipped: false,
            processed_at: new Date().toISOString()
          }, { onConflict: 'listing_id' });

        results.push({
          listingId: listing.id,
          matched: true,
          switchName: matchedSwitch.name,
          reportId: createdReportId
        });

        console.log(`[Auto-Report Webhook] Report generated successfully: ${createdReportId}`);
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
