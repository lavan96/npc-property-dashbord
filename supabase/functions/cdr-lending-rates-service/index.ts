import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// CDR DATA HOLDER ENDPOINTS (Public APIs)
// ============================================
const CDR_LENDERS: Record<string, { name: string; baseUrl: string; logo?: string }> = {
  cba: {
    name: "Commonwealth Bank",
    baseUrl: "https://api.commbank.com.au/public/cds-au/v1",
    logo: "https://www.commbank.com.au/etc/designs/default/favicon.ico"
  },
  anz: {
    name: "ANZ",
    baseUrl: "https://api.anz/cds-au/v1",
    logo: "https://www.anz.com.au/etc/designs/commons/images/favicon.ico"
  },
  nab: {
    name: "NAB",
    baseUrl: "https://openbank.api.nab.com.au/cds-au/v1",
    logo: "https://www.nab.com.au/etc/designs/nab/favicon.ico"
  },
  westpac: {
    name: "Westpac",
    baseUrl: "https://digital-api.westpac.com.au/cds-au/v1",
    logo: "https://www.westpac.com.au/etc/designs/westpac/favicon.ico"
  },
  macquarie: {
    name: "Macquarie Bank",
    baseUrl: "https://api.macquariebank.io/cds-au/v1",
    logo: "https://www.macquarie.com/favicon.ico"
  },
  ing: {
    name: "ING",
    baseUrl: "https://openbanking.api.ing.com.au/cds-au/v1",
    logo: "https://www.ing.com.au/favicon.ico"
  },
  bankwest: {
    name: "Bankwest",
    baseUrl: "https://open-api.bankwest.com.au/cds-au/v1",
    logo: "https://www.bankwest.com.au/favicon.ico"
  },
  suncorp: {
    name: "Suncorp",
    baseUrl: "https://id-ob.suncorpbank.com.au/cds-au/v1",
    logo: "https://www.suncorp.com.au/favicon.ico"
  },
  bendigo: {
    name: "Bendigo Bank",
    baseUrl: "https://api.bendigobank.com.au/cds-au/v1",
    logo: "https://www.bendigobank.com.au/favicon.ico"
  },
  amp: {
    name: "AMP",
    baseUrl: "https://api.cdr-api.amp.com.au/cds-au/v1",
    logo: "https://www.amp.com.au/favicon.ico"
  },
  banksa: {
    name: "BankSA",
    baseUrl: "https://digital-api.banksa.com.au/cds-au/v1",
    logo: "https://www.banksa.com.au/favicon.ico"
  },
  stgeorge: {
    name: "St.George",
    baseUrl: "https://digital-api.stgeorge.com.au/cds-au/v1",
    logo: "https://www.stgeorge.com.au/favicon.ico"
  },
  boq: {
    name: "Bank of Queensland",
    baseUrl: "https://secure.boq.com.au/cds-au/v1",
    logo: "https://www.boq.com.au/favicon.ico"
  },
  hsbc: {
    name: "HSBC Australia",
    baseUrl: "https://api.hsbc.com.au/cds-au/v1",
    logo: "https://www.hsbc.com.au/favicon.ico"
  },
  ubank: {
    name: "UBank",
    baseUrl: "https://openbank.api.nab.com.au/ubank/cds-au/v1",
    logo: "https://www.ubank.com.au/favicon.ico"
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

async function fetchLenderProducts(lenderId: string, baseUrl: string): Promise<LendingRate[]> {
  const rates: LendingRate[] = [];
  
  try {
    console.log(`[CDR] Fetching products from ${lenderId}: ${baseUrl}`);
    
    // Fetch residential mortgages
    const response = await fetch(
      `${baseUrl}/banking/products?product-category=RESIDENTIAL_MORTGAGES&page-size=100`,
      {
        headers: {
          'x-v': '3',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.warn(`[CDR] Failed to fetch from ${lenderId}: ${response.status}`);
      return rates;
    }

    const data = await response.json();
    const products = data?.data?.products || [];

    console.log(`[CDR] Found ${products.length} products from ${lenderId}`);

    // Fetch detailed info for each product (limit to top 10 for performance)
    const productPromises = products.slice(0, 10).map(async (product: any) => {
      try {
        const detailResponse = await fetch(
          `${baseUrl}/banking/products/${product.productId}`,
          {
            headers: {
              'x-v': '3',
              'Accept': 'application/json',
            },
          }
        );

        if (!detailResponse.ok) return null;

        const detailData = await detailResponse.json();
        const productDetail = detailData?.data;

        if (!productDetail?.lendingRates) return null;

        // Extract lending rates
        for (const lendingRate of productDetail.lendingRates) {
          const rate: LendingRate = {
            lenderId,
            lenderName: CDR_LENDERS[lenderId]?.name || lenderId,
            productId: product.productId,
            productName: product.name || product.productId,
            rate: parseFloat(lendingRate.rate) * 100, // Convert to percentage
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

          // Only include if rate is valid
          if (rate.rate > 0 && rate.rate < 20) {
            rates.push(rate);
          }
        }
      } catch (e) {
        console.warn(`[CDR] Error fetching product detail ${product.productId}:`, e);
      }
      return null;
    });

    await Promise.all(productPromises);
  } catch (error) {
    console.error(`[CDR] Error fetching from ${lenderId}:`, error);
  }

  return rates;
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

async function setCachedRates(supabase: any, lenderId: string, rates: LendingRate[]): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  await supabase
    .from('bank_lending_rates_cache')
    .upsert({
      lender_id: lenderId,
      lender_name: CDR_LENDERS[lenderId]?.name || lenderId,
      rates,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }, { onConflict: 'lender_id' });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'list';
    const lenderId = url.searchParams.get('lender');
    const loanPurpose = url.searchParams.get('purpose') as 'OWNER_OCCUPIED' | 'INVESTMENT' | null;
    const repaymentType = url.searchParams.get('repayment') as 'PRINCIPAL_AND_INTEREST' | 'INTEREST_ONLY' | null;
    const lvr = url.searchParams.get('lvr') ? parseFloat(url.searchParams.get('lvr')!) : null;
    const forceRefresh = url.searchParams.get('refresh') === 'true';

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
      if (!forceRefresh) {
        const cached = await getCachedRates(supabase, lenderId);
        if (cached) {
          console.log(`[CDR] Using cached rates for ${lenderId}`);
          rates = cached.rates;
        }
      }

      // Fetch fresh if no cache
      if (rates.length === 0) {
        console.log(`[CDR] Fetching fresh rates for ${lenderId}`);
        rates = await fetchLenderProducts(lenderId, lenderConfig.baseUrl);
        if (rates.length > 0) {
          await setCachedRates(supabase, lenderId, rates);
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
          cached: rates.length > 0,
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
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Refresh all lender caches
    if (action === 'refresh-all') {
      const results: { lenderId: string; success: boolean; rateCount: number }[] = [];

      for (const [id, config] of Object.entries(CDR_LENDERS)) {
        try {
          const rates = await fetchLenderProducts(id, config.baseUrl);
          if (rates.length > 0) {
            await setCachedRates(supabase, id, rates);
          }
          results.push({ lenderId: id, success: true, rateCount: rates.length });
        } catch (error) {
          console.error(`[CDR] Failed to refresh ${id}:`, error);
          results.push({ lenderId: id, success: false, rateCount: 0 });
        }
      }

      return new Response(
        JSON.stringify({ success: true, data: results }),
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
