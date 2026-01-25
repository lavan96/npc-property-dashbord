import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// CDR DATA HOLDER ENDPOINTS
// Each bank has specific API version requirements
// ============================================
const CDR_LENDERS: Record<string, { name: string; baseUrl: string; logo?: string; productVersion: string; detailVersion: string }> = {
  macquarie: {
    name: "Macquarie Bank",
    baseUrl: "https://api.macquariebank.io/cds-au/v1",
    logo: "https://www.macquarie.com/favicon.ico",
    productVersion: "3",
    detailVersion: "4" // Macquarie works with v4
  },
  boq: {
    name: "Bank of Queensland",
    baseUrl: "https://secure.api.boq.com.au/cds-au/v1",
    logo: "https://www.boq.com.au/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  amp: {
    name: "AMP",
    baseUrl: "https://api.cdr-api.amp.com.au/cds-au/v1",
    logo: "https://www.amp.com.au/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  bendigo: {
    name: "Bendigo Bank",
    baseUrl: "https://api.cdr.bendigobank.com.au/cds-au/v1",
    logo: "https://www.bendigobank.com.au/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  bankwest: {
    name: "Bankwest",
    baseUrl: "https://open-api.bankwest.com.au/bwpublic/cds-au/v1",
    logo: "https://www.bankwest.com.au/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  westpac: {
    name: "Westpac",
    baseUrl: "https://digital-api.westpac.com.au/cds-au/v1",
    logo: "https://www.westpac.com.au/etc/designs/westpac/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  banksa: {
    name: "BankSA",
    baseUrl: "https://digital-api.westpac.com.au/cds-au/v1",
    logo: "https://www.banksa.com.au/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  stgeorge: {
    name: "St.George",
    baseUrl: "https://digital-api.westpac.com.au/cds-au/v1",
    logo: "https://www.stgeorge.com.au/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  cba: {
    name: "Commonwealth Bank",
    baseUrl: "https://api.commbank.com.au/public/cds-au/v1",
    logo: "https://www.commbank.com.au/etc/designs/default/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  nab: {
    name: "NAB",
    baseUrl: "https://openbank.api.nab.com.au/cds-au/v1",
    logo: "https://www.nab.com.au/etc/designs/nab/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  anz: {
    name: "ANZ",
    baseUrl: "https://api.anz/cds-au/v1",
    logo: "https://www.anz.com.au/etc/designs/commons/images/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  ing: {
    name: "ING",
    baseUrl: "https://openbanking.api.ing.com.au/cds-au/v1",
    logo: "https://www.ing.com.au/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  suncorp: {
    name: "Suncorp",
    baseUrl: "https://id-ob.suncorpbank.com.au/cds-au/v1",
    logo: "https://www.suncorp.com.au/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  hsbc: {
    name: "HSBC Australia",
    baseUrl: "https://ob.hsbc.com.au/cds-au/v1",
    logo: "https://www.hsbc.com.au/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  },
  ubank: {
    name: "UBank",
    baseUrl: "https://ob.ubank.com.au/cds-au/v1",
    logo: "https://www.ubank.com.au/favicon.ico",
    productVersion: "3",
    detailVersion: "4"
  }
};

interface LendingRate {
  lenderId: string;
  lenderName: string;
  productId: string;
  productName: string;
  rate: number;
  comparisonRate: number | null;
  rateType: 'FIXED' | 'VARIABLE';
  loanPurpose: 'OWNER_OCCUPIED' | 'INVESTMENT';
  repaymentType: 'PRINCIPAL_AND_INTEREST' | 'INTEREST_ONLY';
  lvrMin: number | null;
  lvrMax: number | null;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  features: string[];
  lastUpdated: string;
}

interface CacheEntry {
  lenderId: string;
  rates: LendingRate[];
  fetchedAt: string;
  expiresAt: string;
}

async function fetchProductDetail(
  lenderId: string,
  baseUrl: string,
  product: any,
  detailVersion: string
): Promise<LendingRate[]> {
  const rates: LendingRate[] = [];
  
  try {
    // Try multiple API versions if needed
    const versionsToTry = [detailVersion, '3', '2', '1'];
    let detailData = null;
    
    for (const version of versionsToTry) {
      try {
        const detailResponse = await fetch(
          `${baseUrl}/banking/products/${product.productId}`,
          {
            headers: {
              'x-v': version,
              'x-min-v': '1',
              'Accept': 'application/json',
            },
          }
        );

        if (detailResponse.ok) {
          detailData = await detailResponse.json();
          break;
        }
        
        // If 406, try next version
        if (detailResponse.status === 406) {
          continue;
        }
        
        // For other errors, log and break
        if (!detailResponse.ok) {
          console.warn(`[CDR] Product detail ${product.productId} returned ${detailResponse.status}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!detailData) {
      return rates;
    }

    const productDetail = detailData?.data;

    if (!productDetail?.lendingRates || productDetail.lendingRates.length === 0) {
      return rates;
    }

    // Extract lending rates
    for (const lendingRate of productDetail.lendingRates) {
      const rateValue = parseFloat(lendingRate.rate) * 100; // Convert to percentage
      
      // Only include if rate is valid (between 0.1% and 20%)
      if (rateValue > 0.1 && rateValue < 20) {
        const rate: LendingRate = {
          lenderId,
          lenderName: CDR_LENDERS[lenderId]?.name || lenderId,
          productId: product.productId,
          productName: product.name || product.productId,
          rate: rateValue,
          comparisonRate: lendingRate.comparisonRate 
            ? parseFloat(lendingRate.comparisonRate) * 100 
            : null,
          rateType: lendingRate.lendingRateType?.includes('FIXED') ? 'FIXED' : 'VARIABLE',
          loanPurpose: lendingRate.loanPurpose === 'INVESTMENT' ? 'INVESTMENT' : 'OWNER_OCCUPIED',
          repaymentType: lendingRate.repaymentType === 'INTEREST_ONLY' 
            ? 'INTEREST_ONLY' 
            : 'PRINCIPAL_AND_INTEREST',
          lvrMin: lendingRate.additionalInfo?.lvrMin || null,
          lvrMax: lendingRate.additionalInfo?.lvrMax || null,
          minLoanAmount: productDetail.constraints?.minLimit || null,
          maxLoanAmount: productDetail.constraints?.maxLimit || null,
          features: productDetail.features?.map((f: any) => f.featureType) || [],
          lastUpdated: new Date().toISOString(),
        };
        rates.push(rate);
      }
    }
  } catch (e) {
    console.warn(`[CDR] Error fetching product detail ${product.productId}:`, e);
  }
  
  return rates;
}

async function fetchLenderProducts(lenderId: string, config: { baseUrl: string; productVersion: string; detailVersion: string }): Promise<LendingRate[]> {
  const allRates: LendingRate[] = [];
  const { baseUrl, productVersion, detailVersion } = config;
  
  try {
    console.log(`[CDR] Fetching products from ${lenderId}: ${baseUrl}`);
    
    // Fetch residential mortgages with version fallback
    let products: any[] = [];
    const versionsToTry = [productVersion, '3', '2', '1'];
    
    for (const version of versionsToTry) {
      try {
        const response = await fetch(
          `${baseUrl}/banking/products?product-category=RESIDENTIAL_MORTGAGES&page-size=100`,
          {
            headers: {
              'x-v': version,
              'x-min-v': '1',
              'Accept': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          products = data?.data?.products || [];
          console.log(`[CDR] Found ${products.length} products from ${lenderId} (v${version})`);
          break;
        }
        
        if (response.status === 406) {
          console.log(`[CDR] Version ${version} not supported by ${lenderId}, trying next...`);
          continue;
        }
        
        console.warn(`[CDR] Failed to fetch from ${lenderId}: ${response.status}`);
        break;
      } catch (e) {
        console.error(`[CDR] Error fetching products from ${lenderId}:`, e);
        break;
      }
    }

    if (products.length === 0) {
      return allRates;
    }

    // Fetch detailed info for each product (limit to top 15 for performance)
    const productsToFetch = products.slice(0, 15);
    
    // Fetch all product details in parallel and collect rates
    const rateArrays = await Promise.all(
      productsToFetch.map((product: any) => fetchProductDetail(lenderId, baseUrl, product, detailVersion))
    );
    
    // Flatten all rate arrays into one
    for (const rates of rateArrays) {
      allRates.push(...rates);
    }

    console.log(`[CDR] Collected ${allRates.length} total rates from ${lenderId}`);
    
  } catch (error) {
    console.error(`[CDR] Error fetching from ${lenderId}:`, error);
  }

  return allRates;
}

async function getCachedRates(supabase: any, lenderId: string): Promise<CacheEntry | null> {
  const { data, error } = await supabase
    .from('bank_lending_rates_cache')
    .select('*')
    .eq('lender_id', lenderId)
    .single();

  if (error || !data) return null;

  // Check if cache is still valid (24 hours)
  const expiresAt = new Date(data.expires_at);
  if (expiresAt < new Date()) return null;

  return {
    lenderId: data.lender_id,
    rates: data.rates as LendingRate[],
    fetchedAt: data.fetched_at,
    expiresAt: data.expires_at,
  };
}

async function setCachedRates(supabase: any, lenderId: string, rates: LendingRate[]): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  console.log(`[CDR] Caching ${rates.length} rates for ${lenderId}`);

  const { error } = await supabase
    .from('bank_lending_rates_cache')
    .upsert({
      lender_id: lenderId,
      lender_name: CDR_LENDERS[lenderId]?.name || lenderId,
      rates,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'lender_id' });

  if (error) {
    console.error(`[CDR] Failed to cache rates for ${lenderId}:`, error);
    return false;
  }
  
  console.log(`[CDR] Successfully cached rates for ${lenderId}`);
  return true;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Verify authentication
    const body = await req.json().catch(() => ({}));
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[cdr-lending-rates-service] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log(`[cdr-lending-rates-service] Authenticated user: ${userId}`);

    // Support both GET query params and POST body
    const url = new URL(req.url);
    let action = url.searchParams.get('action') || 'list';
    let lenderId = url.searchParams.get('lender');
    let loanPurpose = url.searchParams.get('purpose') as 'OWNER_OCCUPIED' | 'INVESTMENT' | null;
    let repaymentType = url.searchParams.get('repayment') as 'PRINCIPAL_AND_INTEREST' | 'INTEREST_ONLY' | null;
    let lvr = url.searchParams.get('lvr') ? parseFloat(url.searchParams.get('lvr')!) : null;
    let forceRefresh = url.searchParams.get('refresh') === 'true';

    // Parse POST body if present (body already parsed for auth, reuse it)
    if (req.method === 'POST' && body && typeof body === 'object') {
      if (body.action) action = body.action;
      if (body.lender) lenderId = body.lender;
      if (body.purpose) loanPurpose = body.purpose;
      if (body.repayment) repaymentType = body.repayment;
      if (body.lvr !== undefined) lvr = parseFloat(body.lvr);
      if (body.refresh) forceRefresh = body.refresh === true || body.refresh === 'true';
    }

    console.log(`[CDR] Action: ${action}, Lender: ${lenderId}, Purpose: ${loanPurpose}, LVR: ${lvr}`);

    // Action: List available lenders
    if (action === 'lenders') {
      const lenders = Object.entries(CDR_LENDERS).map(([id, info]) => ({
        id,
        name: info.name,
        logo: info.logo,
      }));

      return new Response(
        JSON.stringify({ success: true, data: lenders }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Get rates for specific lender
    if (action === 'rates' && lenderId) {
      const lenderConfig = CDR_LENDERS[lenderId];
      if (!lenderConfig) {
        return new Response(
          JSON.stringify({ success: false, error: "Unknown lender" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check cache first
      let rates: LendingRate[] = [];
      let fromCache = false;
      
      if (!forceRefresh) {
        const cached = await getCachedRates(supabase, lenderId);
        if (cached && cached.rates.length > 0) {
          console.log(`[CDR] Using cached rates for ${lenderId} (${cached.rates.length} rates)`);
          rates = cached.rates;
          fromCache = true;
        }
      }

      // Fetch fresh if no cache
      if (rates.length === 0) {
        console.log(`[CDR] Fetching fresh rates for ${lenderId}`);
        rates = await fetchLenderProducts(lenderId, {
          baseUrl: lenderConfig.baseUrl,
          productVersion: lenderConfig.productVersion,
          detailVersion: lenderConfig.detailVersion,
        });
        if (rates.length > 0) {
          await setCachedRates(supabase, lenderId, rates);
        } else {
          console.warn(`[CDR] No rates found for ${lenderId}`);
        }
      }

      // Apply filters
      let filteredRates = rates;
      if (loanPurpose) {
        filteredRates = filteredRates.filter(r => r.loanPurpose === loanPurpose);
      }
      if (repaymentType) {
        filteredRates = filteredRates.filter(r => r.repaymentType === repaymentType);
      }
      if (lvr !== null) {
        filteredRates = filteredRates.filter(r => 
          (!r.lvrMin || lvr >= r.lvrMin) && (!r.lvrMax || lvr <= r.lvrMax)
        );
      }

      // Sort by rate
      filteredRates.sort((a, b) => a.rate - b.rate);

      return new Response(
        JSON.stringify({ 
          success: true, 
          data: filteredRates,
          lender: { id: lenderId, name: lenderConfig.name },
          cached: fromCache,
          totalRates: rates.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Get best rates across all lenders
    if (action === 'best-rates') {
      const allRates: LendingRate[] = [];

      // Check cache for all lenders
      for (const [id, config] of Object.entries(CDR_LENDERS)) {
        const cached = await getCachedRates(supabase, id);
        if (cached && cached.rates.length > 0) {
          allRates.push(...cached.rates);
        }
      }

      console.log(`[CDR] Found ${allRates.length} total cached rates across all lenders`);

      // Apply filters
      let filteredRates = allRates;
      if (loanPurpose) {
        filteredRates = filteredRates.filter(r => r.loanPurpose === loanPurpose);
      }
      if (repaymentType) {
        filteredRates = filteredRates.filter(r => r.repaymentType === repaymentType);
      }
      if (lvr !== null) {
        filteredRates = filteredRates.filter(r => 
          (!r.lvrMin || lvr >= r.lvrMin) && (!r.lvrMax || lvr <= r.lvrMax)
        );
      }

      // Sort by rate and get top 10
      filteredRates.sort((a, b) => a.rate - b.rate);
      const topRates = filteredRates.slice(0, 10);

      return new Response(
        JSON.stringify({ 
          success: true, 
          data: topRates,
          totalLenders: Object.keys(CDR_LENDERS).length,
          totalCachedRates: allRates.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Refresh all lender caches
    if (action === 'refresh-all') {
      const results: { lenderId: string; lenderName: string; success: boolean; rateCount: number; cached: boolean }[] = [];

      console.log(`[CDR] Starting refresh-all for ${Object.keys(CDR_LENDERS).length} lenders`);

      for (const [id, config] of Object.entries(CDR_LENDERS)) {
        try {
          const rates = await fetchLenderProducts(id, {
            baseUrl: config.baseUrl,
            productVersion: config.productVersion,
            detailVersion: config.detailVersion,
          });
          let cached = false;
          
          if (rates.length > 0) {
            cached = await setCachedRates(supabase, id, rates);
          }
          
          results.push({ 
            lenderId: id, 
            lenderName: config.name,
            success: rates.length > 0, 
            rateCount: rates.length,
            cached 
          });
          
          console.log(`[CDR] Refresh ${id}: ${rates.length} rates, cached: ${cached}`);
        } catch (error) {
          console.error(`[CDR] Failed to refresh ${id}:`, error);
          results.push({ 
            lenderId: id, 
            lenderName: config.name,
            success: false, 
            rateCount: 0,
            cached: false 
          });
        }
      }

      const successCount = results.filter(r => r.success && r.rateCount > 0).length;
      const totalRates = results.reduce((sum, r) => sum + r.rateCount, 0);
      
      console.log(`[CDR] Refresh complete: ${successCount}/${results.length} lenders, ${totalRates} total rates`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          data: results,
          summary: {
            totalLenders: results.length,
            successfulLenders: successCount,
            totalRates
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: List all cached rates summary
    const { data: cachedData } = await supabase
      .from('bank_lending_rates_cache')
      .select('lender_id, lender_name, fetched_at, expires_at, rates')
      .order('lender_name');

    const summary = (cachedData || []).map((entry: any) => ({
      lenderId: entry.lender_id,
      lenderName: entry.lender_name,
      rateCount: entry.rates?.length || 0,
      fetchedAt: entry.fetched_at,
      expiresAt: entry.expires_at,
      lowestRate: entry.rates?.length > 0 
        ? Math.min(...entry.rates.map((r: LendingRate) => r.rate))
        : null,
    }));

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: summary,
        availableLenders: Object.keys(CDR_LENDERS).length,
        cachedLenders: summary.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[CDR] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
