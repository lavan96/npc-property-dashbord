import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StampDutyBracket {
  threshold: number
  base: number
  rate: number
}

interface StateConfig {
  state: string
  url: string
  scrapePrompt: string
}

const STATE_CONFIGS: StateConfig[] = [
  {
    state: 'NSW',
    url: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty',
    scrapePrompt: 'Extract the stamp duty brackets for property transfer duty in NSW. Include threshold amounts, base amounts, and rates for each bracket.'
  },
  {
    state: 'VIC',
    url: 'https://www.sro.vic.gov.au/duty',
    scrapePrompt: 'Extract the stamp duty brackets for property transfer duty in Victoria. Include threshold amounts, base amounts, and rates for each bracket.'
  },
  {
    state: 'QLD',
    url: 'https://www.qro.qld.gov.au/duties/transfer-duty/',
    scrapePrompt: 'Extract the stamp duty brackets for property transfer duty in Queensland. Include threshold amounts, base amounts, and rates for each bracket.'
  },
  {
    state: 'WA',
    url: 'https://www.wa.gov.au/service/financial-services/taxation/transfer-duty',
    scrapePrompt: 'Extract the stamp duty brackets for property transfer duty in Western Australia. Include threshold amounts, base amounts, and rates for each bracket.'
  },
  {
    state: 'SA',
    url: 'https://www.revenuesa.sa.gov.au/stampduty/property',
    scrapePrompt: 'Extract the stamp duty brackets for property transfer duty in South Australia. Include threshold amounts, base amounts, and rates for each bracket.'
  },
  {
    state: 'TAS',
    url: 'https://www.sro.tas.gov.au/property-transfer-duty',
    scrapePrompt: 'Extract the stamp duty brackets for property transfer duty in Tasmania. Include threshold amounts, base amounts, and rates for each bracket.'
  },
  {
    state: 'NT',
    url: 'https://nt.gov.au/property/land-title-unit/property-transactions/stamp-duty',
    scrapePrompt: 'Extract the stamp duty brackets for property transfer duty in Northern Territory. Include threshold amounts, base amounts, and rates for each bracket.'
  },
  {
    state: 'ACT',
    url: 'https://www.revenue.act.gov.au/duties/conveyance-duty',
    scrapePrompt: 'Extract the stamp duty brackets for property conveyance duty in ACT. Include threshold amounts, base amounts, and rates for each bracket.'
  }
]

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured')
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { states } = await req.json()
    const statesToUpdate = states || STATE_CONFIGS.map(c => c.state)

    console.log(`Updating stamp duty rates for states: ${statesToUpdate.join(', ')}`)

    // Process all states in parallel for faster execution
    const scrapePromises = STATE_CONFIGS
      .filter(c => statesToUpdate.includes(c.state))
      .map(async (stateConfig) => {
        console.log(`Scraping ${stateConfig.state} from ${stateConfig.url}`)

        try {
          // Use Firecrawl API directly to scrape the government website
          const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: stateConfig.url,
              formats: ['markdown'],
            })
          })

          if (!scrapeResponse.ok) {
            const errorText = await scrapeResponse.text()
            throw new Error(`Firecrawl API error (${scrapeResponse.status}): ${errorText}`)
          }

          const scrapeResult = await scrapeResponse.json()
          
          if (!scrapeResult.success) {
            throw new Error(`Failed to scrape ${stateConfig.state}: ${scrapeResult.error || 'Unknown error'}`)
          }

          const markdown = scrapeResult.data?.markdown || ''
          console.log(`Scraped content for ${stateConfig.state}, length: ${markdown.length}`)

          // Parse the markdown content to extract stamp duty brackets
          const brackets = parseStampDutyBrackets(markdown, stateConfig.state)

          if (brackets.length === 0) {
            console.warn(`No brackets found for ${stateConfig.state}, keeping fallback data`)
            return {
              state: stateConfig.state,
              success: false,
              error: 'Could not parse brackets from scraped content',
              dataQuality: 'fallback'
            }
          }

          // Update the cache with live data
          const { error: updateError } = await supabase
            .from('stamp_duty_rates_cache')
            .upsert({
              state: stateConfig.state,
              brackets: brackets,
              data_quality: 'live',
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
              source_url: stateConfig.url,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'state'
            })

          if (updateError) {
            throw updateError
          }

          console.log(`✅ Successfully updated ${stateConfig.state} with ${brackets.length} brackets`)
          return {
            state: stateConfig.state,
            success: true,
            brackets: brackets.length,
            dataQuality: 'live'
          }

        } catch (error) {
          console.error(`Error processing ${stateConfig.state}:`, error)
          return {
            state: stateConfig.state,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            dataQuality: 'fallback'
          }
        }
      })

    // Wait for all scraping operations to complete
    const results = await Promise.all(scrapePromises)

    return new Response(
      JSON.stringify({
        success: true,
        results,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error in update-stamp-duty-rates:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

function parseStampDutyBrackets(markdown: string, state: string): StampDutyBracket[] {
  const brackets: StampDutyBracket[] = []
  
  // This is a simplified parser that looks for common patterns in stamp duty tables
  // In production, you'd want to use more sophisticated parsing or AI-based extraction
  
  // Look for table-like structures with amounts and percentages
  const lines = markdown.split('\n')
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()
    
    // Skip non-relevant lines
    if (!line.includes('$') && !line.includes('%')) continue
    
    // Try to extract numbers from the line
    const amounts = line.match(/\$[\d,]+/g)?.map(a => parseFloat(a.replace(/[$,]/g, ''))) || []
    const percentages = line.match(/\d+\.?\d*%/g)?.map(p => parseFloat(p.replace('%', '')) / 100) || []
    
    if (amounts.length > 0 && percentages.length > 0) {
      // Found a potential bracket
      const threshold = amounts[0] || 0
      const rate = percentages[0] || 0
      
      // Calculate base amount (this is simplified, actual calculation would be more complex)
      let base = 0
      if (brackets.length > 0) {
        const prevBracket = brackets[brackets.length - 1]
        base = prevBracket.base + (threshold - prevBracket.threshold) * prevBracket.rate
      }
      
      brackets.push({ threshold, base, rate })
    }
  }
  
  // Sort brackets by threshold
  brackets.sort((a, b) => a.threshold - b.threshold)
  
  // If we couldn't parse any brackets, return empty array to keep fallback
  return brackets.length >= 2 ? brackets : []
}
