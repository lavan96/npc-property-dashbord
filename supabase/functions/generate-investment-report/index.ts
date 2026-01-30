import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';

// ============================================================================
// REPORT SECTION DEFINITIONS - SYNCED WITH DATABASE TEMPLATE STRUCTURE
// ============================================================================
// These section definitions match the "Investor Compass Structure v2" template
// stored in report_structure_templates table. They serve as:
// 1. Fallback when template parsing fails
// 2. Validation reference for dynamic parsing
// 3. Performance tuning (maxTokens, requiredKeywords)
// ============================================================================

interface ReportSectionDefinition {
  id: string;
  name: string;
  sections: string[];  // H2 headings from template that belong to this group
  maxTokens: number;
  minContentLength: number;
  requiredKeywords: string[];
}

// FALLBACK HARDCODED SECTIONS - Matches database template "Investor Compass Structure v2"
// These 12 groups contain all 26 H2 sections from the template, logically grouped for generation
const DEFAULT_REPORT_SECTIONS: ReportSectionDefinition[] = [
  {
    id: 'section0',
    name: 'Executive Summary',
    sections: ['Executive Summary'],
    maxTokens: 2500,
    minContentLength: 2500,
    requiredKeywords: ['investment', 'property', 'recommendation', 'score'],
  },
  {
    id: 'section1',
    name: 'Location Overview',
    sections: ['Location Overview'],
    maxTokens: 2500,
    minContentLength: 2500,
    requiredKeywords: ['suburb', 'community', 'transport', 'lifestyle'],
  },
  {
    id: 'section2',
    name: 'Market & Economics',
    sections: ['Current Market Performance', 'Current Economic Context'],
    maxTokens: 2500,
    minContentLength: 2500,
    requiredKeywords: ['market', 'cash rate', 'inflation', 'growth'],
  },
  {
    id: 'section3',
    name: 'Demographics & Demand',
    sections: ['Demographics & Demand Drivers'],
    maxTokens: 2500,
    minContentLength: 2500,
    requiredKeywords: ['population', 'income', 'employment', 'household'],
  },
  {
    id: 'section4',
    name: 'Education & Healthcare',
    sections: ['Schools & Education', 'Healthcare & Shopping'],
    maxTokens: 2500,
    minContentLength: 2500,
    requiredKeywords: ['school', 'education', 'hospital', 'healthcare'],
  },
  {
    id: 'section5',
    name: 'Recreation & Transport',
    sections: ['Recreational Amenities', 'Transport & Accessibility'],
    maxTokens: 2500,
    minContentLength: 2500,
    requiredKeywords: ['recreation', 'park', 'transport', 'commute'],
  },
  {
    id: 'section6',
    name: 'Environment & Safety',
    sections: ['Environmental Risks & Climate', 'Crime & Safety'],
    maxTokens: 4000,
    minContentLength: 3500,
    requiredKeywords: ['flood', 'bushfire', 'crime', 'safety'],
  },
  {
    id: 'section7',
    name: 'Property & Zoning',
    // Updated: Strategic Assessment, Top 3 Opportunities, and Top 3 Risks now under Property-Level Information
    sections: ['Property-Level Information', 'Strategic Assessment', 'Capital Appreciation Potential', 'Leveraged Equity Accumulation', 'Sustained Employment Growth', 'Structural Cashflow Deficit', 'Interest Rate Sensitivity', 'Environmental Risk'],
    maxTokens: 5000,
    minContentLength: 4500,
    requiredKeywords: ['property', 'zoning', 'land', 'strategic', 'opportunity', 'risk'],
  },
  {
    id: 'section8',
    name: 'Costs & Rental',
    sections: ['Purchase & Ongoing Costs (Annual)', 'Rental Assessment & Yield Calculation'],
    maxTokens: 2500,
    minContentLength: 2500,
    requiredKeywords: ['purchase', 'stamp duty', 'rent', 'yield'],
  },
  {
    id: 'section9',
    name: 'Loan & Sensitivity',
    sections: ['Loan Structure & Repayment Analysis', 'Sensitivity Analysis'],
    maxTokens: 2500,
    minContentLength: 2500,
    requiredKeywords: ['loan', 'repayment', 'cashflow', 'sensitivity'],
  },
  {
    id: 'section10',
    name: 'Projections & SWOT',
    // Removed: Top 3 Opportunities (moved to Property-Level Information)
    sections: ['10-Year Investment Projections', 'Investment Score Analysis', 'SWOT Analysis Summary'],
    maxTokens: 3000,
    minContentLength: 3000,
    requiredKeywords: ['projection', 'swot', 'score'],
  },
  {
    id: 'section11',
    name: 'Risks & Recommendations',
    // Removed: Top 3 Risks (moved to Property-Level Information)
    sections: ['Investment Recommendations', 'Final Conclusion', 'PROFESSIONAL DISCLAIMER'],
    maxTokens: 4000,
    minContentLength: 3000,
    requiredKeywords: ['recommendation', 'conclusion'],
  }
];

// Dynamic sections - populated from database template at runtime
let REPORT_SECTIONS: ReportSectionDefinition[] = [...DEFAULT_REPORT_SECTIONS];

// ============================================================================
// DYNAMIC TEMPLATE PARSING
// ============================================================================
// Extracts H2 section headings from database template and groups them
// into generation sections while preserving the template's order
// ============================================================================

interface ParsedTemplateStructure {
  headings: string[];
  sections: ReportSectionDefinition[];
  templateName: string;
  templateId: string;
}

/**
 * Parses the template content to extract H2 headings and create section definitions
 * Falls back to DEFAULT_REPORT_SECTIONS if parsing fails
 */
function parseTemplateStructure(
  templateContent: string,
  templateName: string = 'Unknown',
  templateId: string = ''
): ParsedTemplateStructure {
  try {
    // Extract all H2 headings (## Heading)
    const h2Pattern = /^## ([^\n]+)/gm;
    const headings: string[] = [];
    let match;
    
    while ((match = h2Pattern.exec(templateContent)) !== null) {
      const heading = match[1].trim();
      // Skip empty or very short headings
      if (heading.length > 2) {
        headings.push(heading);
      }
    }
    
    console.log(`📋 Parsed ${headings.length} H2 headings from template "${templateName}"`);
    
    if (headings.length < 5) {
      console.log('⚠️ Too few headings found, using default sections');
      return {
        headings: [],
        sections: DEFAULT_REPORT_SECTIONS,
        templateName,
        templateId
      };
    }
    
    // Group headings into logical sections based on keywords and order
    const sections = groupHeadingsIntoSections(headings);
    
    console.log(`✓ Created ${sections.length} generation sections from template`);
    sections.forEach((s, i) => {
      console.log(`  Section ${i}: ${s.name} → [${s.sections.join(', ')}]`);
    });
    
    return {
      headings,
      sections,
      templateName,
      templateId
    };
  } catch (error) {
    console.error('⚠️ Template parsing error:', error);
    return {
      headings: [],
      sections: DEFAULT_REPORT_SECTIONS,
      templateName,
      templateId
    };
  }
}

/**
 * Groups extracted headings into logical generation sections
 * Maintains order from template while grouping related topics
 */
function groupHeadingsIntoSections(headings: string[]): ReportSectionDefinition[] {
  // Keyword mapping for section grouping
  const sectionKeywordMap: Record<string, { keywords: string[], name: string, requiredKeywords: string[], maxTokens: number, minContentLength: number }> = {
    'executive': {
      keywords: ['executive', 'summary', 'overview report'],
      name: 'Executive Summary',
      requiredKeywords: ['investment', 'property', 'recommendation', 'score'],
      maxTokens: 2500,
      minContentLength: 2500
    },
    'location': {
      keywords: ['location', 'suburb character'],
      name: 'Location Overview',
      requiredKeywords: ['suburb', 'community', 'lifestyle'],
      maxTokens: 2500,
      minContentLength: 2500
    },
    'market': {
      keywords: ['market', 'economic', 'economy'],
      name: 'Market & Economics',
      requiredKeywords: ['market', 'cash rate', 'growth'],
      maxTokens: 2500,
      minContentLength: 2500
    },
    'demographics': {
      keywords: ['demographic', 'demand', 'population'],
      name: 'Demographics & Demand',
      requiredKeywords: ['population', 'income', 'employment'],
      maxTokens: 2500,
      minContentLength: 2500
    },
    'education': {
      keywords: ['school', 'education', 'healthcare', 'hospital', 'shopping'],
      name: 'Education & Healthcare',
      requiredKeywords: ['school', 'education', 'healthcare'],
      maxTokens: 2500,
      minContentLength: 2500
    },
    'recreation': {
      keywords: ['recreation', 'transport', 'accessibility', 'amenities', 'commute'],
      name: 'Recreation & Transport',
      requiredKeywords: ['recreation', 'transport', 'commute'],
      maxTokens: 2500,
      minContentLength: 2500
    },
    'environment': {
      keywords: ['environment', 'climate', 'crime', 'safety', 'flood', 'bushfire', 'risk'],
      name: 'Environment & Safety',
      requiredKeywords: ['flood', 'crime', 'safety'],
      maxTokens: 4000,
      minContentLength: 3500
    },
    'property': {
      // Updated: Property section now includes Strategic Assessment, Opportunities, and Risks subsections
      keywords: ['property-level', 'property level', 'zoning', 'land size', 'building', 'strategic assessment', 'capital appreciation', 'leveraged equity', 'employment growth', 'cashflow deficit', 'interest rate sensitivity', 'environmental risk'],
      name: 'Property & Zoning',
      requiredKeywords: ['property', 'zoning', 'strategic', 'opportunity', 'risk'],
      maxTokens: 5000,
      minContentLength: 4500
    },
    'costs': {
      keywords: ['purchase', 'ongoing costs', 'rental', 'yield', 'stamp duty'],
      name: 'Costs & Rental',
      requiredKeywords: ['purchase', 'rent', 'yield'],
      maxTokens: 2500,
      minContentLength: 2500
    },
    'loan': {
      keywords: ['loan', 'repayment', 'sensitivity', 'cashflow', 'mortgage'],
      name: 'Loan & Sensitivity',
      requiredKeywords: ['loan', 'repayment', 'cashflow'],
      maxTokens: 2500,
      minContentLength: 2500
    },
    'projections': {
      // Removed: Top 3 Opportunities (now under Property section)
      keywords: ['projection', 'swot', 'investment score', '10-year', 'ten year'],
      name: 'Projections & SWOT',
      requiredKeywords: ['projection', 'swot'],
      maxTokens: 3000,
      minContentLength: 3000
    },
    'recommendations': {
      // Removed: Top 3 Risks (now under Property section)
      keywords: ['recommendation', 'conclusion', 'final', 'suitability'],
      name: 'Risks & Recommendations',
      requiredKeywords: ['recommendation', 'conclusion'],
      maxTokens: 4000,
      minContentLength: 3000
    }
  };
  
  // Group headings by matching keywords
  const groups: Record<string, string[]> = {};
  const usedHeadings = new Set<string>();
  
  // First pass: assign headings to groups based on keyword matches
  for (const heading of headings) {
    const headingLower = heading.toLowerCase();
    
    for (const [groupKey, config] of Object.entries(sectionKeywordMap)) {
      if (config.keywords.some(kw => headingLower.includes(kw))) {
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(heading);
        usedHeadings.add(heading);
        break; // Assign to first matching group
      }
    }
  }
  
  // Second pass: assign unmatched headings to nearest logical group
  for (const heading of headings) {
    if (!usedHeadings.has(heading)) {
      // Default unmatched headings to 'recommendations' section
      if (!groups['recommendations']) {
        groups['recommendations'] = [];
      }
      groups['recommendations'].push(heading);
      console.log(`  Unmatched heading "${heading}" → recommendations`);
    }
  }
  
  // Build final section definitions in correct order
  const orderedKeys = ['executive', 'location', 'market', 'demographics', 'education', 'recreation', 'environment', 'property', 'costs', 'loan', 'projections', 'recommendations'];
  const sections: ReportSectionDefinition[] = [];
  
  for (let i = 0; i < orderedKeys.length; i++) {
    const key = orderedKeys[i];
    const config = sectionKeywordMap[key];
    const groupHeadings = groups[key] || [];
    
    // Only include section if it has headings OR use fallback from defaults
    if (groupHeadings.length > 0) {
      sections.push({
        id: `section${i}`,
        name: config.name,
        sections: groupHeadings,
        maxTokens: config.maxTokens,
        minContentLength: config.minContentLength,
        requiredKeywords: config.requiredKeywords
      });
    } else {
      // Use fallback from defaults if no headings matched
      const defaultSection = DEFAULT_REPORT_SECTIONS.find(s => s.id === `section${i}`);
      if (defaultSection) {
        sections.push(defaultSection);
      }
    }
  }
  
  return sections;
}

// Section validation helper - ensures content meets minimum requirements
function validateSectionContent(
  sectionDef: typeof REPORT_SECTIONS[0],
  content: string
): { isValid: boolean; issues: string[]; score: number } {
  const issues: string[] = [];
  let score = 100;
  
  // Check minimum content length
  const contentLength = content?.length || 0;
  if (contentLength < sectionDef.minContentLength) {
    issues.push(`Content too short: ${contentLength} chars (min: ${sectionDef.minContentLength})`);
    score -= 30;
  }
  
  // Check for required keywords (case-insensitive)
  const contentLower = (content || '').toLowerCase();
  const missingKeywords = (sectionDef.requiredKeywords || []).filter(
    kw => !contentLower.includes(kw.toLowerCase())
  );
  
  if (missingKeywords.length > 0) {
    issues.push(`Missing content areas: ${missingKeywords.join(', ')}`);
    score -= missingKeywords.length * 10;
  }
  
  // Check for structural elements (headings, tables)
  const headingCount = (content?.match(/^#{1,3}\s+/gm) || []).length;
  if (headingCount < 3) {
    issues.push(`Insufficient structure: only ${headingCount} headings found`);
    score -= 15;
  }
  
  // Check for data presentation (tables with |)
  const hasDataTables = content?.includes('|') && content?.includes('---');
  if (!hasDataTables && sectionDef.id !== 'section4') {
    issues.push('No data tables found');
    score -= 10;
  }
  
  return {
    isValid: score >= 60, // Threshold for acceptable content
    issues,
    score: Math.max(0, score)
  };
}

// ============================================================================
// ROBUSTNESS INFRASTRUCTURE - Circuit Breaker, Retry with Jitter, Timeouts
// ============================================================================

// Circuit breaker state for tracking failed services
const circuitBreaker = new Map<string, { failures: number; lastFailure: number; isOpen: boolean }>();
const CIRCUIT_BREAKER_THRESHOLD = 2; // Open after 2 failures
const CIRCUIT_BREAKER_RESET_MS = 30000; // Reset after 30 seconds

function isCircuitOpen(serviceName: string): boolean {
  const state = circuitBreaker.get(serviceName);
  if (!state) return false;
  
  // Check if circuit should reset
  if (state.isOpen && Date.now() - state.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
    state.isOpen = false;
    state.failures = 0;
    return false;
  }
  
  return state.isOpen;
}

function recordServiceFailure(serviceName: string): void {
  const state = circuitBreaker.get(serviceName) || { failures: 0, lastFailure: 0, isOpen: false };
  state.failures++;
  state.lastFailure = Date.now();
  
  if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.isOpen = true;
    console.log(`🔴 Circuit breaker OPEN for ${serviceName} after ${state.failures} failures`);
  }
  
  circuitBreaker.set(serviceName, state);
}

function recordServiceSuccess(serviceName: string): void {
  circuitBreaker.delete(serviceName);
}

// Helper function to add jitter to prevent thundering herd
function getRetryDelayWithJitter(attempt: number, baseDelayMs: number = 2000): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 1000; // 0-1000ms random jitter
  return Math.min(exponentialDelay + jitter, 15000); // Cap at 15 seconds
}

// Helper function to fetch with timeout and circuit breaker
async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeoutMs: number = 90000,
  serviceName?: string
): Promise<Response> {
  // Check circuit breaker
  if (serviceName && isCircuitOpen(serviceName)) {
    throw new Error(`Circuit breaker open for ${serviceName}, skipping request`);
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`⏱️ Request timeout after ${timeoutMs}ms, aborting...`);
    controller.abort();
  }, timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (serviceName && response.ok) {
      recordServiceSuccess(serviceName);
    }
    
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (serviceName) {
      recordServiceFailure(serviceName);
    }
    
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  }
}

// Wrapper for parallel API calls with graceful degradation
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  serviceName: string;
}

async function fetchServiceWithFallback<T>(
  serviceName: string,
  fetchFn: () => Promise<T | null>,
  fallbackValue: T | null = null
): Promise<ServiceResult<T>> {
  if (isCircuitOpen(serviceName)) {
    console.log(`⏭️ Skipping ${serviceName} (circuit breaker open)`);
    return { success: false, error: 'Circuit breaker open', serviceName, data: fallbackValue || undefined };
  }
  
  try {
    const startTime = Date.now();
    const result = await fetchFn();
    const duration = Date.now() - startTime;
    
    if (result) {
      console.log(`✓ ${serviceName} completed in ${duration}ms`);
      recordServiceSuccess(serviceName);
      return { success: true, data: result, serviceName };
    } else {
      console.log(`⚠️ ${serviceName} returned no data (${duration}ms)`);
      return { success: false, error: 'No data returned', serviceName, data: fallbackValue || undefined };
    }
  } catch (error: any) {
    console.log(`❌ ${serviceName} failed:`, error?.message || 'Unknown error');
    recordServiceFailure(serviceName);
    return { success: false, error: error?.message, serviceName, data: fallbackValue || undefined };
  }
}

// Helper function to generate a single section via API with retry logic
async function generateReportSection(
  sectionDef: typeof REPORT_SECTIONS[0],
  basePrompt: string,
  systemMessage: string,
  perplexityApiKey: string,
  previousSections: string,
  propertyAddress: string,
  enhancedData: any,
  maxRetries: number = 2
): Promise<{ content: string; citations: any[]; error?: string }> {
  // For section10 (Projections & SWOT), inject explicit investment score data
  let investmentScoreContext = '';
  if (sectionDef.id === 'section10' && enhancedData?.investmentScore) {
    const score = enhancedData.investmentScore;
    console.log('📊 Injecting investment score data into section10 (Projections & SWOT):', {
      totalScore: score.totalScore,
      grade: score.grade,
      recommendation: score.recommendation
    });
    
    investmentScoreContext = `
**INVESTMENT SCORE DATA (USE THESE EXACT VALUES):**
- Total Investment Score: ${score.totalScore}/100
- Investment Grade: ${score.grade}
- Recommendation: ${score.recommendation}
- Growth Score: ${score.breakdown?.growthScore?.score || 'N/A'}/100 (Weight: ${score.breakdown?.growthScore?.weight || 40}%)
- Location Score: ${score.breakdown?.locationScore?.score || 'N/A'}/100 (Weight: ${score.breakdown?.locationScore?.weight || 25}%)
- Yield Score: ${score.breakdown?.yieldScore?.score || 'N/A'}/100 (Weight: ${score.breakdown?.yieldScore?.weight || 15}%)
- Demand Score: ${score.breakdown?.demandScore?.score || 'N/A'}/100 (Weight: ${score.breakdown?.demandScore?.weight || 15}%)
- Risk Score: ${score.breakdown?.riskScore?.score || 'N/A'}/100 (Weight: ${score.breakdown?.riskScore?.weight || 5}%)
${score.strengths?.length ? `- Strengths: ${score.strengths.join(', ')}` : ''}
${score.weaknesses?.length ? `- Weaknesses: ${score.weaknesses.join(', ')}` : ''}
${score.opportunities?.length ? `- Opportunities: ${score.opportunities.join(', ')}` : ''}
${score.risks?.length ? `- Risks: ${score.risks.join(', ')}` : ''}

**CRITICAL: You MUST include the Investment Score Analysis section with the EXACT values above. Do NOT skip this section or use placeholder values.**

`;
  }

  const sectionPrompt = `${basePrompt}

---
**SECTION GENERATION TASK:**
You are generating ONLY the following sections of a comprehensive investment report:
${sectionDef.sections.map(s => `- ${s}`).join('\n')}

${investmentScoreContext}${previousSections ? `**CONTEXT FROM PREVIOUS SECTIONS (for consistency, DO NOT repeat this content):**
${previousSections.substring(0, 4000)}...
` : ''}

**CRITICAL INSTRUCTIONS:**
1. Generate ONLY the sections listed above - no introduction, no conclusion beyond what's specified
2. Follow the exact markdown formatting with proper headings (# for main sections)
3. Include all required tables with complete data (no placeholders like "XX" or "N/A")
4. Use proper horizontal rules (---) between sections
5. Each section must meet minimum word counts as specified in the template
6. Be thorough and data-driven - this is a premium client-facing report
7. Start immediately with the first section heading - no preamble
${sectionDef.id === 'section10' ? '8. MUST include the Investment Score Analysis section with the exact score values provided above' : ''}

Generate the ${sectionDef.name} sections now:`;

  // Retry loop with improved backoff and jitter
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📝 Generating section: ${sectionDef.name}... (attempt ${attempt}/${maxRetries})`);
      
      const response = await fetchWithTimeout('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${perplexityApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          max_tokens: sectionDef.maxTokens,
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: sectionPrompt }
          ]
        }),
      }, 150000, 'perplexity-api'); // 150 second timeout per section, with circuit breaker tracking

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Section ${sectionDef.id} API error (attempt ${attempt}):`, response.status, errorText);
        
        // If rate limited or server error, wait and retry with jitter
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
          const waitTime = getRetryDelayWithJitter(attempt, response.status === 429 ? 5000 : 3000);
          console.log(`⏳ Waiting ${(waitTime/1000).toFixed(1)}s before retry (with jitter)...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        return { content: '', citations: [], error: `API error ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const citations = data.citations || [];
      
      console.log(`✓ Section ${sectionDef.name} generated: ${content.length} chars`);
      
      return { content, citations };
    } catch (error: any) {
      console.error(`❌ Error generating section ${sectionDef.id} (attempt ${attempt}):`, error?.message);
      
      // Retry on timeout or network errors with jitter
      if (attempt < maxRetries) {
        const waitTime = getRetryDelayWithJitter(attempt, 2000);
        console.log(`⏳ Waiting ${(waitTime/1000).toFixed(1)}s before retry (with jitter)...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      return { content: '', citations: [], error: error?.message };
    }
  }
  
  return { content: '', citations: [], error: 'Max retries exceeded' };
}

// Helper function to update report status to failed
async function markReportFailed(reportId: string | null, errorMessage: string): Promise<void> {
  if (!reportId) return;
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && supabaseKey) {
      const client = createClient(supabaseUrl, supabaseKey);
      await client
        .from('investment_reports')
        .update({ 
          status: 'failed',
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);
      
      // Also update auto_report_generation_log if this was an auto-generated report
      await client
        .from('auto_report_generation_log')
        .update({
          status: 'failed',
          error_message: `Report generation failed: ${errorMessage}`,
          completed_at: new Date().toISOString()
        })
        .eq('report_id', reportId);
      
      console.log(`✓ Marked report ${reportId} as failed: ${errorMessage}`);
    }
  } catch (updateError) {
    console.error('Error updating report status to failed:', updateError);
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = createCorsHeaders(origin);

  console.log('Investment report function invoked with method:', req.method);
  
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting investment report generation...');
    
    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
      console.log('Request body parsed successfully');
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // SECURITY: Verify authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { error: authError, userId } = await verifyAuth(supabase, req.headers, requestBody);
    if (authError) {
      console.log('[generate-investment-report] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }
    console.log('[generate-investment-report] Authenticated user:', userId);
    
    let { reportId, propertyAddress, propertyDetails, continueFrom, singleSection } = requestBody;
    const reportScope = propertyDetails?.queryType || 'address'; // Get scope from request
    
    // Flag to indicate if we're continuing from existing content
    const isContinuation = continueFrom === true;
    // Flag for chunked mode - generate one section per call to avoid platform timeouts
    const isSingleSectionMode = singleSection === true;
    console.log('Continuation mode:', isContinuation, '| Single-section mode:', isSingleSectionMode);
    
    // UNIFIED DOCUMENT CONTENT: Accept both scrapedContent (URL scrape) AND pdfContent (PDF upload)
    // This ensures consistent content injection regardless of the input source
    const scrapedContent = propertyDetails?.scrapedContent || null;
    const pdfContent = propertyDetails?.pdfContent || null;
    const documentContent = scrapedContent || pdfContent || null; // Unified content variable
    
    const sourceUrl = propertyDetails?.sourceUrl || null;
    const fromUrlScrape = propertyDetails?.fromUrlScrape || false;
    const fromPdfUpload = propertyDetails?.fromPdfUpload || false;
    const contentSource = fromUrlScrape ? 'URL Scrape' : (fromPdfUpload ? 'PDF Upload' : 'Manual Entry');
    
    console.log('=== REPORT GENERATION REQUEST ===');
    console.log('Report ID:', reportId);
    console.log('Property address:', propertyAddress);
    console.log('Report scope:', reportScope);
    console.log('Content source:', contentSource);
    console.log('From URL scrape:', fromUrlScrape);
    console.log('From PDF upload:', fromPdfUpload);
    console.log('Scraped content available:', !!scrapedContent, scrapedContent ? `(${scrapedContent.length} chars)` : '');
    console.log('PDF content available:', !!pdfContent, pdfContent ? `(${pdfContent.length} chars)` : '');
    console.log('Unified document content available:', !!documentContent, documentContent ? `(${documentContent.length} chars)` : '');
    console.log('Source URL:', sourceUrl);
    
    // Log all property details for debugging
    if (propertyDetails) {
      console.log('Property details received:');
      console.log('  - Price:', propertyDetails.price);
      console.log('  - Beds:', propertyDetails.beds);
      console.log('  - Baths:', propertyDetails.baths);
      console.log('  - Car spaces:', propertyDetails.carSpaces);
      console.log('  - Land size:', propertyDetails.landSizeSqm);
      console.log('  - Build size:', propertyDetails.buildSizeSqm);
      console.log('  - Property type:', propertyDetails.propertyType);
      console.log('  - Postcode:', propertyDetails.postcode);
      console.log('  - State:', propertyDetails.state);
      console.log('  - Suburb:', propertyDetails.suburb);
      console.log('  - Weekly rent:', propertyDetails.weeklyRent);
      console.log('  - Is new build:', propertyDetails.isNewBuild);
    }
    
    // If reportId is provided but no propertyAddress, fetch it from the existing report (for retries)
    if (reportId && !propertyAddress) {
      console.log('Fetching property address from existing report for retry...');
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseKey) {
        const client = createClient(supabaseUrl, supabaseKey);
        const { data: existingReport, error: fetchError } = await client
          .from('investment_reports')
          .select('property_address')
          .eq('id', reportId)
          .single();
        
        if (fetchError || !existingReport?.property_address) {
          console.error('Failed to fetch property address for retry:', fetchError);
          await markReportFailed(reportId, 'Could not find existing report for retry');
          return new Response(JSON.stringify({ 
            error: 'Could not find existing report for retry',
            success: false 
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        propertyAddress = existingReport.property_address;
        console.log('Fetched property address from existing report:', propertyAddress);
      }
    }
    
    if (!propertyAddress) {
      console.error('Property address is missing');
      await markReportFailed(reportId, 'Property address is required');
      return new Response(JSON.stringify({ 
        error: 'Property address is required',
        success: false 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client for database updates
    let supabaseClient = null;
    let existingManualOverrides = null;
    
    // Get pre-generation overrides from request (passed from frontend)
    const frontendManualOverrides = propertyDetails?.manualOverrides || null;
    if (frontendManualOverrides && Object.keys(frontendManualOverrides).length > 0) {
      console.log('📝 Received pre-generation overrides from frontend:', Object.keys(frontendManualOverrides).length, 'fields');
      console.log('  Override keys:', Object.keys(frontendManualOverrides).join(', '));
    }
    
    // Variables for continuation mode
    let existingReportContent = '';
    let completedSectionIndices: number[] = [];
    
    if (reportId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseKey) {
        supabaseClient = createClient(supabaseUrl, supabaseKey);
        
        // Fetch existing report data (including content for continuation)
        const { data: existingReport } = await supabaseClient
          .from('investment_reports')
          .select('manual_overrides, report_content, property_address, last_completed_section')
          .eq('id', reportId)
          .single();
        
        if (existingReport?.manual_overrides) {
          existingManualOverrides = existingReport.manual_overrides;
          console.log('📝 Fetched existing manual overrides from DB:', Object.keys(existingManualOverrides).length, 'fields');
        }
        
        // If continuing, use the stored last_completed_section index for reliable resume
        if (isContinuation && existingReport?.report_content) {
          const lastCompletedSection = existingReport.last_completed_section || 0;
          
          console.log('🔄 CONTINUATION MODE: Checking section progress');
          console.log('   Existing content length:', existingReport.report_content.length, 'chars');
          console.log('   Last completed section (from DB):', lastCompletedSection);
          
          // CRITICAL FIX: Only use existing content for TRUE resume (last_completed_section > 0)
          // If last_completed_section is 0, this is a FRESH REGENERATION - do NOT prepend old content
          if (lastCompletedSection > 0) {
            existingReportContent = existingReport.report_content;
            console.log('   ✓ RESUME mode: Using existing content as base');
            
            // Build completed section indices from the stored value
            // All sections from 0 to lastCompletedSection-1 are complete (0-indexed section IDs)
            // If lastCompletedSection = 5, then sections 0,1,2,3,4 are complete
            for (let idx = 0; idx < lastCompletedSection; idx++) {
              completedSectionIndices.push(idx);
            }
            
            console.log(`   Completed sections: ${completedSectionIndices.length}/${REPORT_SECTIONS.length}`);
            console.log(`   Will resume from section: ${lastCompletedSection} (${REPORT_SECTIONS[lastCompletedSection]?.name || 'END'})`);
          } else {
            // Fresh regeneration: last_completed_section was reset to 0
            // Do NOT use existing content - start completely fresh
            existingReportContent = '';
            console.log('   🔄 FRESH REGENERATION mode: Starting from scratch (last_completed_section=0)');
            console.log('   Old content will be discarded, generating all sections fresh');
          }
          
          // Use property address from existing report if not provided
          if (!propertyAddress && existingReport.property_address) {
            propertyAddress = existingReport.property_address;
            console.log('   Using property address from existing report:', propertyAddress);
          }
        }
        
        // Update status to processing
        await supabaseClient
          .from('investment_reports')
          .update({ status: 'processing' })
          .eq('id', reportId);
        
        console.log('Updated report status to processing');
      }
    }
    
    // Merge overrides: frontend takes precedence over existing DB overrides
    const mergedOverrides = {
      ...(existingManualOverrides || {}),
      ...(frontendManualOverrides || {})
    };
    const hasOverrides = Object.keys(mergedOverrides).length > 0;
    if (hasOverrides) {
      console.log('🔀 Merged overrides total:', Object.keys(mergedOverrides).length, 'fields');
    }
    
    // ============================================================================
    // CRITICAL: Define effective values ONCE at the top and use consistently
    // These values respect the override hierarchy and are used throughout
    // ============================================================================
    const effectivePurchasePrice = mergedOverrides.purchasePrice || propertyDetails?.price || 0;
    const effectiveWeeklyRent = mergedOverrides.weeklyRent || propertyDetails?.weeklyRent || 0;
    const effectiveLvr = mergedOverrides.loanToValueRatio || propertyDetails?.loanToValueRatio || 80;
    
    // CRITICAL: Deposit value handling - check both mergedOverrides and propertyDetails
    // Parse as number since frontend may send as string
    const rawDepositValue = mergedOverrides.depositValue ?? propertyDetails?.depositValue ?? null;
    const parsedDepositValue = rawDepositValue !== null ? parseFloat(String(rawDepositValue)) : NaN;
    const effectiveDepositValue = !isNaN(parsedDepositValue) && parsedDepositValue > 0 
      ? parsedDepositValue 
      : (effectivePurchasePrice * ((100 - effectiveLvr) / 100));
    
    console.log('📦 Deposit Value Debug:');
    console.log(`  Raw from mergedOverrides: ${mergedOverrides.depositValue}`);
    console.log(`  Raw from propertyDetails: ${propertyDetails?.depositValue}`);
    console.log(`  Parsed value: ${parsedDepositValue}`);
    console.log(`  Effective deposit: $${effectiveDepositValue?.toLocaleString()}`);
    
    const effectiveInterestRate = mergedOverrides.interestRate || propertyDetails?.interestRate || 6.5;
    const effectiveLoanTerm = mergedOverrides.loanTermYears || propertyDetails?.loanTermYears || 30;
    const effectiveIsFirstHomeBuyer = mergedOverrides.isFirstHomeBuyer || false;
    const effectiveIsNewBuild = mergedOverrides.buildType === 'new_build' || propertyDetails?.isNewBuild || false;
    const effectiveLandSizeSqm = mergedOverrides.landSizeSqm || propertyDetails?.landSizeSqm || null;
    const effectiveBuildSizeSqm = mergedOverrides.buildSizeSqm || propertyDetails?.buildSizeSqm || null;
    const effectiveBeds = mergedOverrides.bedrooms || propertyDetails?.beds || 3;
    const effectiveBaths = mergedOverrides.bathrooms || propertyDetails?.baths || 2;
    
    // Zoning effective values
    const effectiveZoningCode = mergedOverrides.zoningCode || null;
    const effectiveZoningDescription = mergedOverrides.zoningDescription || null;
    const effectivePermittedUses = mergedOverrides.permittedUses || null;
    const effectiveDevelopmentPotential = mergedOverrides.developmentPotential || null;
    const effectiveZoningOverlays = mergedOverrides.zoningOverlays || null;
    const effectiveMinimumLotSize = mergedOverrides.minimumLotSize || null;
    const effectiveMaximumHeight = mergedOverrides.maximumHeight || null;
    const effectiveFloorSpaceRatio = mergedOverrides.floorSpaceRatio || null;
    const hasZoningData = effectiveZoningCode || effectiveZoningDescription || effectivePermittedUses || effectiveDevelopmentPotential;
    
    console.log('📊 EFFECTIVE VALUES (after merging overrides):');
    console.log(`  Purchase Price: $${effectivePurchasePrice?.toLocaleString()} ${mergedOverrides.purchasePrice ? '(OVERRIDE)' : '(from property)'}`);
    console.log(`  Weekly Rent: $${effectiveWeeklyRent} ${mergedOverrides.weeklyRent ? '(OVERRIDE)' : '(from property)'}`);
    console.log(`  LVR: ${effectiveLvr}% ${mergedOverrides.loanToValueRatio ? '(OVERRIDE)' : '(default)'}`);
    console.log(`  Interest Rate: ${effectiveInterestRate}% ${mergedOverrides.interestRate ? '(OVERRIDE)' : '(default)'}`);
    console.log(`  Is New Build: ${effectiveIsNewBuild}`);

    // Check for Perplexity API key
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
    console.log('Perplexity API key configured:', !!perplexityApiKey);
    
    if (!perplexityApiKey) {
      console.error('Perplexity API key not found in environment');
      const errorMsg = 'Perplexity API key not configured. Please set PERPLEXITY_API_KEY in Supabase secrets.';
      await markReportFailed(reportId, errorMsg);
      return new Response(JSON.stringify({ 
        error: errorMsg,
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine analysis mode and format input query
    let analysisMode = 'address'; // Default mode
    let formattedInput = propertyAddress;
    let detectedSuburb = null;
    let detectedPostcode = null;
    let detectedState = null;
    
    // Extract postcode and state from input
    const postcodeMatch = propertyAddress.match(/\b(\d{4})\b/);
    const stateMatch = propertyAddress.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT|Western Australia|New South Wales|Victoria|Queensland|South Australia|Tasmania|Northern Territory|Australian Capital Territory)\b/i);
    
    if (postcodeMatch) {
      detectedPostcode = postcodeMatch[1];
    }
    if (stateMatch) {
      const stateInput = stateMatch[1].toUpperCase();
      // Convert full state names to abbreviations
      const stateMap: Record<string, string> = {
        'WESTERN AUSTRALIA': 'WA',
        'NEW SOUTH WALES': 'NSW',
        'VICTORIA': 'VIC',
        'QUEENSLAND': 'QLD',
        'SOUTH AUSTRALIA': 'SA',
        'TASMANIA': 'TAS',
        'NORTHERN TERRITORY': 'NT',
        'AUSTRALIAN CAPITAL TERRITORY': 'ACT'
      };
      detectedState = stateMap[stateInput] || stateInput;
    }
    
    // Detect analysis mode
    if (/^\d{4}$/.test(propertyAddress.trim()) || /postcode\s+\d{4}/i.test(propertyAddress)) {
      // Pure postcode mode
      analysisMode = 'postcode';
      const postcode = postcodeMatch ? postcodeMatch[1] : propertyAddress.trim();
      // Require state for postcode to avoid ambiguity
      if (!detectedState) {
        console.warn('⚠️ Postcode provided without state, defaulting to NSW');
        detectedState = 'NSW';
      }
      formattedInput = `Postcode ${postcode}, ${detectedState}, Australia`;
    } else if (propertyAddress.match(/^[A-Za-z\s]+(?:,\s*(?:\d{4}|NSW|VIC|QLD|WA|SA|TAS|NT|ACT))+/i)) {
      // Suburb mode: Suburb name followed by postcode and/or state
      // Examples: "Bondi, 2026, NSW" or "Bondi NSW 2026" or "Bondi, NSW"
      analysisMode = 'suburb';
      const parts = propertyAddress.split(',').map(p => p.trim());
      detectedSuburb = parts[0];
      
      // Require both postcode and state for suburb to avoid ambiguity
      if (!detectedPostcode || !detectedState) {
        console.warn('⚠️ Suburb provided without complete postcode/state information');
        if (!detectedState) {
          detectedState = 'NSW'; // Default fallback
        }
      }
      
      formattedInput = `${detectedSuburb}${detectedPostcode ? ', ' + detectedPostcode : ''}${detectedState ? ', ' + detectedState : ''}, Australia`;
      console.log('Suburb analysis mode detected:', { suburb: detectedSuburb, postcode: detectedPostcode, state: detectedState });
    } else if (/(western australia|wa|new south wales|nsw|victoria|vic|queensland|qld|south australia|sa|tasmania|tas|northern territory|nt|australian capital territory|act)$/i.test(propertyAddress.trim())) {
      // State-wide mode: ends with just a state name
      analysisMode = 'state';
      formattedInput = propertyAddress;
    } else {
      // Default to address mode
      analysisMode = 'address';
    }

    console.log('Analysis mode:', analysisMode);
    console.log('Formatted input:', formattedInput);
    console.log('Analysis details:', { suburb: detectedSuburb, postcode: detectedPostcode, state: detectedState });

    // Fetch enhanced data from multiple sources
    console.log('Fetching enhanced data from multiple APIs...');
    
    interface EnhancedData {
      demographics?: any;
      economics?: any;
      financials?: any;
      locationIntelligence?: any;
      investmentScore?: any;
      domainData?: any;
      riskAssessment?: any;
      seifaData?: any;
      crimeStatistics?: any;
      employmentData?: any;
      climateData?: any;
      schoolData?: any;
    }
    
    let enhancedData: EnhancedData = {};
    
    // Declare suburb/state/postcode OUTSIDE try block so they're accessible in reportContent
    let postcode = detectedPostcode;
    let state = detectedState || 'NSW';
    let suburb = detectedSuburb;
    
    try {
      // Use detected values from earlier, or extract from formatted input
      
      // If not detected earlier, try to extract from formatted input
      if (!postcode) {
        const postcodeMatch = formattedInput.match(/\b(\d{4})\b/);
        postcode = postcodeMatch ? postcodeMatch[1] : null;
      }
      if (!state || state === 'NSW') {
        const stateMatch = formattedInput.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/i);
        if (stateMatch) state = stateMatch[1].toUpperCase();
      }
      if (!suburb) {
        // Extract suburb from address (everything between street and state/postcode)
        const suburbMatch = formattedInput.match(/,\s*([A-Za-z\s]+)(?:,|\s+(?:NSW|VIC|QLD|WA|SA|TAS|NT|ACT))/i);
        suburb = suburbMatch ? suburbMatch[1].trim().toLowerCase().replace(/\s+/g, '-') : null;
      } else {
        // Convert suburb to URL-friendly format if not already
        suburb = suburb.toLowerCase().replace(/\s+/g, '-');
      }
      
      console.log('Using for API calls:', { suburb, postcode, state });

      // ============================================================================
      // PHASE 1: PARALLEL INDEPENDENT DATA FETCHING
      // These services don't depend on each other, so fetch them all simultaneously
      // ============================================================================
      console.log('🚀 Starting PARALLEL data fetch (Phase 1)...');
      const phase1StartTime = Date.now();
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      };

      // Define all Phase 1 fetch promises
      const phase1Promises = [
        // 1. Domain market data
        (suburb && state) ? fetchServiceWithFallback('domain-data-service', async () => {
          const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/domain-data-service`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
              suburb, state, postcode,
              propertyCategory: propertyDetails?.propertyType?.toLowerCase() === 'unit' ? 'unit' : 'house'
            })
          }, 30000, 'domain-data-service');
          if (response.ok) {
            const data = await response.json();
            return data.success ? data.data : null;
          }
          return null;
        }) : Promise.resolve({ success: false, serviceName: 'domain-data-service', error: 'Missing suburb/state' }),

        // 2. ABS demographic data
        postcode ? fetchServiceWithFallback('abs-data-service', async () => {
          const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/abs-data-service`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ postcode, state })
          }, 30000, 'abs-data-service');
          if (response.ok) {
            const data = await response.json();
            return data.success ? data.data : null;
          }
          return null;
        }) : Promise.resolve({ success: false, serviceName: 'abs-data-service', error: 'Missing postcode' }),

        // 3. RBA economic data
        fetchServiceWithFallback('rba-data-service', async () => {
          const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/rba-data-service`, {
            method: 'POST',
            headers
          }, 20000, 'rba-data-service');
          if (response.ok) {
            const data = await response.json();
            return data.data || null;
          }
          return null;
        }),

        // 4. SEIFA socioeconomic data
        postcode ? fetchServiceWithFallback('abs-seifa-service', async () => {
          const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/abs-seifa-service`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ postcode, state })
          }, 25000, 'abs-seifa-service');
          if (response.ok) {
            const data = await response.json();
            return data.success ? data.data : null;
          }
          return null;
        }) : Promise.resolve({ success: false, serviceName: 'abs-seifa-service', error: 'Missing postcode' }),

        // 5. Crime statistics
        (suburb && state) ? fetchServiceWithFallback('crime-statistics-service', async () => {
          const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/crime-statistics-service`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ suburb, state, postcode })
          }, 30000, 'crime-statistics-service');
          if (response.ok) {
            const data = await response.json();
            return data.success ? data.data : null;
          }
          return null;
        }) : Promise.resolve({ success: false, serviceName: 'crime-statistics-service', error: 'Missing suburb/state' }),

        // 6. Employment data
        state ? fetchServiceWithFallback('abs-employment-service', async () => {
          const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/abs-employment-service`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ suburb, state, postcode })
          }, 25000, 'abs-employment-service');
          if (response.ok) {
            const data = await response.json();
            return data.success ? data.data : null;
          }
          return null;
        }) : Promise.resolve({ success: false, serviceName: 'abs-employment-service', error: 'Missing state' }),

        // 7. Climate data
        state ? fetchServiceWithFallback('climate-data-service', async () => {
          const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/climate-data-service`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ suburb, state, postcode })
          }, 25000, 'climate-data-service');
          if (response.ok) {
            const data = await response.json();
            return data.success ? data.data : null;
          }
          return null;
        }) : Promise.resolve({ success: false, serviceName: 'climate-data-service', error: 'Missing state' }),
      ];

      // Execute all Phase 1 fetches in parallel
      const phase1Results = await Promise.allSettled(phase1Promises);
      const phase1Duration = Date.now() - phase1StartTime;
      
      // Process Phase 1 results
      let successCount = 0;
      let failCount = 0;
      
      phase1Results.forEach((result, index) => {
        const serviceNames = ['domain', 'demographics', 'economics', 'seifaData', 'crimeStatistics', 'employmentData', 'climateData'];
        const serviceName = serviceNames[index];
        
        if (result.status === 'fulfilled' && result.value.success && result.value.data) {
          enhancedData = { ...enhancedData, [serviceName === 'domain' ? 'domainData' : serviceName]: result.value.data };
          successCount++;
        } else {
          failCount++;
          const reason = result.status === 'rejected' 
            ? result.reason?.message 
            : (result.value as ServiceResult<any>).error;
          if (reason && !reason.includes('Missing')) {
            console.log(`  ⚠️ ${serviceName}: ${reason}`);
          }
        }
      });
      
      console.log(`✓ Phase 1 complete in ${phase1Duration}ms: ${successCount} succeeded, ${failCount} skipped/failed`);

      // ============================================================================
      // PHASE 2: SEQUENTIAL DEPENDENT DATA FETCHING
      // These services depend on Phase 1 results or each other
      // ============================================================================
      console.log('🔄 Starting Phase 2 (dependent services)...');

      // Fetch risk assessment data (can use coordinates from location intelligence)
      if (postcode && state) {
        try {
          const riskResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/risk-assessment-service`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
              suburb: suburb || 'unknown',
              state: state,
              postcode: postcode
            })
          }, 25000, 'risk-assessment-service');
          
          if (riskResponse.ok) {
            const riskData = await riskResponse.json();
            if (riskData.success && riskData.data) {
              enhancedData = { ...enhancedData, riskAssessment: riskData.data };
              console.log('✓ Risk assessment data fetched');
            }
          }
        } catch (error: any) {
          console.log('⚠️ Risk assessment skipped:', error?.message?.substring(0, 50));
        }
      }

      // NOTE: ABS demographics and RBA economics are now fetched in Phase 1 parallel block above

      // Fetch rent from cache if not provided
      let weeklyRent = propertyDetails?.weeklyRent;
      let rentSource = 'user_input';
      
      if (!weeklyRent && suburb && state) {
        try {
          console.log('📊 Weekly rent not provided, fetching from SQM Research cache...');
          const rentResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sqm-rent-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              suburb: suburb.replace(/-/g, ' '),
              state: state,
              postcode: postcode || '',
              propertyType: propertyDetails?.propertyType?.toLowerCase() || 'house',
              bedrooms: propertyDetails?.bedrooms || 3
            })
          });
          
          if (rentResponse.ok) {
            const rentData = await rentResponse.json();
            if (rentData.success && rentData.data?.medianWeeklyRent) {
              weeklyRent = rentData.data.medianWeeklyRent;
              rentSource = rentData.source === 'cache' ? 'sqm_cache' : 'sqm_scraped';
              console.log(`✓ Median weekly rent from ${rentSource}: $${weeklyRent}`);
            } else {
              console.log('⚠️ No rent data available from SQM Research');
            }
          }
        } catch (error: any) {
          console.log('⚠️ SQM rent lookup failed:', error?.message || 'Unknown error');
        }
      }
      
      // Calculate financial projections if property details available
      // Use effective values defined at the top (which already include overrides)
      if (effectivePurchasePrice > 0) {
        try {
          // Use effective values that were defined at the top (already include overrides)
          const calcWeeklyRent = effectiveWeeklyRent || weeklyRent || 0;
          
          console.log('📊 Financial calculator inputs (using top-level effective values):');
          console.log(`  Property Value: $${effectivePurchasePrice.toLocaleString()}`);
          console.log(`  Deposit: $${effectiveDepositValue.toLocaleString()} (LVR: ${effectiveLvr}%)`);
          console.log(`  Interest Rate: ${effectiveInterestRate}%`);
          console.log(`  Loan Term: ${effectiveLoanTerm} years`);
          console.log(`  Weekly Rent: $${calcWeeklyRent}`);
          console.log(`  First Home Buyer: ${effectiveIsFirstHomeBuyer}`);
          console.log(`  New Build: ${effectiveIsNewBuild}`);
          
          const financialResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/financial-calculator-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              propertyValue: effectivePurchasePrice,
              deposit: effectiveDepositValue,
              interestRate: effectiveInterestRate,
              loanTerm: effectiveLoanTerm,
              weeklyRent: calcWeeklyRent,
              weeklyRentSource: rentSource,
              state: state,
              propertyType: propertyDetails?.propertyType || 'house',
              isFirstHomeBuyer: effectiveIsFirstHomeBuyer,
              isNewBuild: effectiveIsNewBuild
            })
          });
          
          if (financialResponse.ok) {
            const financialData = await financialResponse.json();
            
            // Merge manual overrides with fresh financial calculations
            if (hasOverrides) {
              console.log('🔀 Merging manual overrides with fresh financial calculations');
              
              // Create a deep copy of financial data
              const mergedFinancials = JSON.parse(JSON.stringify(financialData.data));
              
              // Map flat override keys to nested structure
              const overrideMapping: Record<string, string> = {
                'purchasePrice': 'initialCosts.propertyValue',
                'stampDuty': 'initialCosts.stampDuty',
                'depositValue': 'initialCosts.deposit',
                'loanToValueRatio': 'keyMetrics.lvr',
                'interestRate': 'loanDetails.interestRate',
                'weeklyRent': 'income.weeklyRent',
                'councilRates': 'annualCosts.councilRates',
                'waterRates': 'annualCosts.waterRates',
                'bodyCorporateFees': 'annualCosts.strataFees',
                'buildingLandlordInsurance': 'annualCosts.landlordInsurance',
                'propertyManagementFees': 'annualCosts.propertyManagementPercent',
                'solicitorFees': 'initialCosts.legalFees',
                'repairsMaintenance': 'annualCosts.maintenance',
                'lettingFees': 'annualCosts.lettingFees',
                'capitalGrowth': 'assumptions.capitalGrowth',
                'buildPrice': 'initialCosts.buildPrice',
                'landPrice': 'initialCosts.landPrice',
                'landSizeSqm': 'propertySpecs.landSizeSqm',
                'buildSizeSqm': 'propertySpecs.buildSizeSqm',
                'landTax': 'annualCosts.landTax',
                'depreciation': 'taxBenefits.depreciation',
                'taxRate': 'taxBenefits.marginalTaxRate',
                'occupancyRate': 'assumptions.occupancyWeeks',
                'cpiGrowthRate': 'assumptions.cpiGrowth',
                'loanType': 'loanDetails.loanType',
                'loanAmount': 'loanDetails.loanAmount',
                'interestOnlyPeriodYears': 'loanDetails.interestOnlyPeriod'
              };
              
              // Apply overrides to the nested structure
              for (const [flatKey, overrideValue] of Object.entries(mergedOverrides)) {
                const nestedPath = overrideMapping[flatKey];
                if (nestedPath) {
                  const keys = nestedPath.split('.');
                  let current = mergedFinancials;
                  
                  // Navigate to the nested location
                  for (let i = 0; i < keys.length - 1; i++) {
                    if (!current[keys[i]]) {
                      current[keys[i]] = {};
                    }
                    current = current[keys[i]];
                  }
                  
                  // Set the overridden value
                  current[keys[keys.length - 1]] = overrideValue;
                  console.log(`  ✓ Override applied: ${flatKey} → ${nestedPath} = ${overrideValue}`);
                }
              }
              
              enhancedData = { 
                ...enhancedData, 
                financials: mergedFinancials
              };
              console.log('✓ Manual overrides applied to financial calculations');
            } else {
              enhancedData = { ...enhancedData, financials: financialData.data };
            }
            
            console.log('Financial calculations completed successfully');
            
            // Run validation on financial calculations - USE EFFECTIVE VALUES
            try {
              const validationResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/financial-validation-service`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
                },
                body: JSON.stringify({
                  propertyValue: effectivePurchasePrice,
                  weeklyRent: effectiveWeeklyRent || weeklyRent,
                  stampDuty: financialData.data.initialCosts.stampDuty,
                  councilRates: financialData.data.annualCosts.councilRates,
                  annualCosts: financialData.data.annualCosts,
                  state: state,
                  propertyType: propertyDetails?.propertyType || 'house'
                })
              });
              
              if (validationResponse.ok) {
                const validationData = await validationResponse.json();
                enhancedData = { ...enhancedData, validation: validationData.data };
                console.log('✓ Financial validation completed:', {
                  qualityScore: validationData.data.qualityScore,
                  flagCount: validationData.data.flags.length
                });
                
                // Log any critical validation errors
                const criticalFlags = validationData.data.flags.filter((f: any) => f.severity === 'critical');
                if (criticalFlags.length > 0) {
                  console.warn('⚠️ CRITICAL validation issues detected:', criticalFlags);
                }
              }
            } catch (validationError: any) {
              console.warn('⚠️ Validation service failed (non-blocking):', validationError?.message);
            }
          }
        } catch (error: any) {
          console.log('Financial calculations failed:', error?.message || 'Unknown error');
        }
      }

      // Fetch location intelligence data
      try {
        console.log('Fetching location intelligence for:', formattedInput);
        const locationResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/location-intelligence-service`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            address: formattedInput,
            postcode: postcode,
            state: state
          })
        });
        
        if (locationResponse.ok) {
          const locationData = await locationResponse.json();
          
          if (locationData.success && locationData.data) {
            enhancedData = { ...enhancedData, locationIntelligence: locationData.data };
            console.log('✓ Location intelligence data fetched successfully');
            
            if (locationData.usingMockData) {
              console.warn('⚠️ Using mock location data:', locationData.message);
            }
          } else {
            console.warn('⚠️ Location intelligence returned no data');
          }
        } else {
          const errorText = await locationResponse.text();
          console.error('❌ Location intelligence API error:', locationResponse.status, errorText);
        }
      } catch (error: any) {
        console.error('❌ Location intelligence fetch failed:', error?.message || 'Unknown error');
      }

      // Calculate investment score - USE EFFECTIVE VALUES
      if (effectivePurchasePrice > 0) {
        try {
          console.log('📊 Investment scoring inputs (using effective values):');
          console.log(`  Price: $${effectivePurchasePrice.toLocaleString()}`);
          console.log(`  Weekly Rent: $${effectiveWeeklyRent}`);
          
          const scoreResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/investment-scoring-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              property: {
                price: effectivePurchasePrice,
                weeklyRent: effectiveWeeklyRent || 0,
                propertyType: propertyDetails?.propertyType || 'house',
                bedrooms: effectiveBeds,
                bathrooms: effectiveBaths
              },
              demographics: enhancedData.demographics,
              locationIntelligence: enhancedData.locationIntelligence,
              financials: enhancedData.financials
            })
          });
          
          if (scoreResponse.ok) {
            const scoreData = await scoreResponse.json();
            enhancedData = { ...enhancedData, investmentScore: scoreData.data };
            console.log('✓ Investment score calculated successfully using effective values');
          } else {
            // Log the actual error response to diagnose scoring failures
            const errorText = await scoreResponse.text();
            console.error('❌ Investment scoring service returned error:', scoreResponse.status, errorText);
          }
        } catch (error: any) {
          console.log('Investment score calculation failed:', error?.message || 'Unknown error');
        }
      }

      // NOTE: SEIFA, Crime, Employment, and Climate data are now fetched in Phase 1 parallel block above

      // Fetch school data
      if (suburb && state && postcode) {
        try {
          console.log('Fetching school data for:', suburb, state, postcode);
          
          // Extract coordinates from location intelligence if available
          const latitude = enhancedData.locationIntelligence?.coordinates?.lat;
          const longitude = enhancedData.locationIntelligence?.coordinates?.lng;
          
          const schoolResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/school-data-service`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
            },
            body: JSON.stringify({ 
              suburb: suburb,
              state: state,
              postcode: postcode,
              latitude: latitude || undefined,
              longitude: longitude || undefined
            })
          });
          
          if (schoolResponse.ok) {
            const schoolData = await schoolResponse.json();
            if (schoolData.success && schoolData.data) {
              enhancedData = { ...enhancedData, schoolData: schoolData.data };
              console.log('✓ School data fetched successfully');
              console.log(`  Found ${schoolData.data.summary?.totalSchools || 0} schools in ${postcode}`);
            }
          }
        } catch (error: any) {
          console.log('School data fetch failed:', error?.message || 'Unknown error');
        }
      }


    } catch (error: any) {
      console.log('Enhanced data fetch failed, proceeding with basic analysis:', error?.message || 'Unknown error');
    }

    // ============================================================================
    // DATA AVAILABILITY SUMMARY - Graceful Degradation Report
    // ============================================================================
    const dataAvailability = {
      demographics: !!enhancedData.demographics,
      economics: !!enhancedData.economics,
      financials: !!enhancedData.financials,
      locationIntelligence: !!enhancedData.locationIntelligence,
      investmentScore: !!enhancedData.investmentScore,
      domainData: !!enhancedData.domainData,
      riskAssessment: !!enhancedData.riskAssessment,
      seifaData: !!enhancedData.seifaData,
      crimeStatistics: !!enhancedData.crimeStatistics,
      employmentData: !!enhancedData.employmentData,
      climateData: !!enhancedData.climateData,
      schoolData: !!enhancedData.schoolData
    };
    
    const availableServices = Object.entries(dataAvailability).filter(([_, v]) => v).map(([k]) => k);
    const unavailableServices = Object.entries(dataAvailability).filter(([_, v]) => !v).map(([k]) => k);
    
    console.log('\n📊 === DATA AVAILABILITY SUMMARY ===');
    console.log(`✅ Available (${availableServices.length}): ${availableServices.join(', ') || 'None'}`);
    console.log(`⚠️ Unavailable (${unavailableServices.length}): ${unavailableServices.join(', ') || 'None'}`);
    console.log(`📈 Data completeness: ${Math.round((availableServices.length / 12) * 100)}%`);
    
    // Circuit breaker status
    if (circuitBreaker.size > 0) {
      console.log('🔴 Circuit breakers active:', Array.from(circuitBreaker.keys()).join(', '));
    }
    console.log('=================================\n');

    // Build year context string for suburb analysis
    let yearContextString = '';
    if (propertyDetails?.dataYearType === 'single' && propertyDetails?.dataYear) {
      yearContextString = `\n\n**CRITICAL DATA YEAR REQUIREMENT:**
Focus the analysis on data from the year ${propertyDetails.dataYear}. All statistics, market data, demographics, and trends should be sourced from or reference ${propertyDetails.dataYear} data where available. Clearly indicate when data from ${propertyDetails.dataYear} is used vs. when more recent or older data is substituted.`;
      console.log('📅 Single year context:', propertyDetails.dataYear);
    } else if (propertyDetails?.dataYearType === 'range' && propertyDetails?.dataYearStart && propertyDetails?.dataYearEnd) {
      yearContextString = `\n\n**CRITICAL DATA YEAR RANGE REQUIREMENT:**
Analyze trends and data spanning from ${propertyDetails.dataYearStart} to ${propertyDetails.dataYearEnd}. 
- Include year-over-year comparisons across this period
- Show growth/decline trends from ${propertyDetails.dataYearStart} to ${propertyDetails.dataYearEnd}
- Compare early period (${propertyDetails.dataYearStart}-${Math.floor((propertyDetails.dataYearStart + propertyDetails.dataYearEnd) / 2)}) vs. recent period (${Math.ceil((propertyDetails.dataYearStart + propertyDetails.dataYearEnd) / 2)}-${propertyDetails.dataYearEnd})
- Clearly label data sources with their respective years
- Highlight significant changes or inflection points within the ${propertyDetails.dataYearEnd - propertyDetails.dataYearStart + 1}-year period`;
      console.log('📅 Year range context:', propertyDetails.dataYearStart, '-', propertyDetails.dataYearEnd);
    }

    // Create enhanced prompt with additional data
    // Suburb-specific prompt for suburb investment analysis
    const suburbPrompt = `You are an expert Australian suburb analyst creating comprehensive suburb investment snapshots.
Your goal is to generate a professional suburb-level investment analysis report.

**SUBURB TO ANALYZE: ${formattedInput}**
${yearContextString}

${propertyDetails ? `Context: ${propertyDetails.propertyType || 'Property'} analysis in this suburb${propertyDetails.landSizeSqm ? `, typical land size: ${propertyDetails.landSizeSqm}m²` : ''}${propertyDetails.buildSizeSqm ? `, typical build size: ${propertyDetails.buildSizeSqm}m²` : ''}` : ''}

**CRITICAL - MANDATORY SUBURB REPORT STRUCTURE:**

Follow this exact structure for suburb-level analysis:

# REPORT TITLE
Suburb Investment Snapshot: [SUBURB NAME], [STATE]

# 1. Location & Profile
- Suburb overview and character
- Distance to CBD/major employment centers (e.g., "12km north of Sydney CBD")
- Statistical areas: SA2, SA3, SA4, LGA
- Suburb type (beachside, urban, suburban, regional)
- Lifestyle description
- Key attractions and features
- Development status and trends

# 2. Property Market Data
**Current Market Snapshot (use most recent data):**

| Property Type | Median Price | Median Rent (Weekly) | Gross Yield | Annual Growth |
|--------------|--------------|---------------------|-------------|---------------|
| Houses | $XXX,XXX | $XXX | X.XX% | +/-X.X% |
| Units | $XXX,XXX | $XXX | X.XX% | +/-X.X% |

**Market Activity:**
| Metric | Houses | Units |
|--------|---------|-------|
| Sales Volume (12 months) | XX | XX |
| Days on Market | XX | XX |
| Stock on Market | XX | XX |
| Vacancy Rate | X.X% | X.X% |

# 3. Market Performance
**5-Year Price Growth:**
| Property Type | 1-Year | 3-Year | 5-Year | Peak Growth Period |
|--------------|--------|--------|--------|-------------------|
| Houses | +/-X.X% | +/-XX.X% | +/-XX.X% | [period] |
| Units | +/-X.X% | +/-XX.X% | +/-XX.X% | [period] |

**Rental Growth History:**
| Property Type | 1-Year | 3-Year | 5-Year |
|--------------|--------|--------|--------|
| Houses | +/-X.X% | +/-XX.X% | +/-XX.X% |
| Units | +/-X.X% | +/-XX.X% | +/-XX.X% |

[Include market cycle analysis and trends]

# 4. Demographics
**Population Statistics:**
| Metric | Value | State Average | National Average |
|--------|-------|---------------|------------------|
| Total Population | XX,XXX | - | - |
| Population Density | XX per km² | XX per km² | XX per km² |
| Population Growth (5yr) | +/-X.X% | +/-X.X% | +/-X.X% |
| Median Age | XX years | XX years | XX years |
| Families with Children | XX.X% | XX.X% | XX.X% |
| Couples without Children | XX.X% | XX.X% | XX.X% |
| Single Occupants | XX.X% | XX.X% | XX.X% |

**Income & Employment:**
| Metric | Value | State Average |
|--------|-------|---------------|
| Median Household Income | $X,XXX/week | $X,XXX/week |
| Median Annual Income | $XX,XXX | $XX,XXX |
| Employment Rate | XX.X% | XX.X% |
| Unemployment Rate | X.X% | X.X% |
| SEIFA Index (IRSAD) | XXX (Decile X) | - |

**Top Industries:**
1. [Industry] - XX.X%
2. [Industry] - XX.X%
3. [Industry] - XX.X%
4. [Industry] - XX.X%
5. [Industry] - XX.X%

# 5. Infrastructure & Amenities
**Education:**
| School Name | Type | Level | Distance | Rating/ICSEA |
|------------|------|-------|----------|--------------|

**Transport:**
| Mode | Details | Access Score |
|------|---------|--------------|
| Train Stations | [names] (XXkm) | XX/100 |
| Bus Routes | XX routes | XX/100 |
| Major Roads | [list] | - |
| CBD Commute | XX mins by [mode] | - |
| Walk Score | XX/100 | - |

**Shopping & Services:**
| Facility Type | Nearest | Distance | Details |
|--------------|---------|----------|---------|
| Shopping Center | [name] | XXkm | [description] |
| Supermarkets | [names] | XXkm | - |
| Cafes/Restaurants | XX+ venues | within XXkm | - |

**Healthcare:**
| Facility | Name | Distance |
|----------|------|----------|
| Hospital | [name] | XXkm |
| Medical Centers | XX facilities | within XXkm |

**Recreation:**
| Facility Type | Count | Details |
|--------------|-------|---------|
| Parks | XX | [names] |
| Beaches | XX | [names] |
| Sports Facilities | XX | [types] |

# 6. Investment Insights
**Market Strengths:**
- [Key advantages for investors]
- [Growth drivers]
- [Demand factors]

**Considerations:**
- [Risks or challenges]
- [Market competition]
- [Supply dynamics]

**Buyer Profile:**
[Who typically buys here and why]

**Rental Demand:**
[Who rents here, typical lease terms, vacancy patterns]

**Capital Growth Outlook:**
[Short and medium term price expectations with reasoning]

**Rental Yield Outlook:**
[Income potential and rental growth expectations]

# 7. Environmental & Risk Factors
| Risk Type | Assessment | Details |
|-----------|-----------|---------|
| Flood Risk | [Low/Medium/High] | [explanation] |
| Bushfire Risk | [Low/Medium/High] | [explanation] |
| Coastal Erosion | [Low/Medium/High] | [explanation if applicable] |
| Climate Risks | [assessment] | [heatwaves, storms, etc.] |

# 8. Crime & Safety
| Metric | Value | Comparison to State |
|--------|-------|-------------------|
| Crime Rate per 100k | XXX | [above/below average] |
| Safety Score | XX/100 | - |
| Trend (3-year) | [Improving/Stable/Worsening] | - |

**Crime Breakdown:**
| Category | Percentage | Trend |
|----------|-----------|-------|

[Include safety commentary]

---

**DATA QUALITY REQUIREMENTS:**
- Use live data where available from ABS, Domain, CoreLogic, state authorities
- Clearly mark estimated or inferred data points
- Include data sources and "as of" dates for all statistics
- Prioritize recent data (last 12 months preferred)

**OUTPUT STYLE:**
- Use markdown tables extensively for data presentation
- Include horizontal rulers (---) between major sections
- Professional, data-driven language
- Specific numbers, percentages, dollar amounts
- Actionable insights for investors
- No code blocks or JSON formatting

Produce a comprehensive suburb investment snapshot following the structure above with specific Australian market data.`;

    // STRICT REFERENCE TEMPLATE - Based on the Naidu Property Consulting Services Investment Report format
    // This template enforces the exact structure, length, content, and sources matching the reference PDF
    
    // ============================================================================
    // STANDARDIZED PROPERTY TYPE - Consistent terminology throughout report
    // ============================================================================
    const rawPropertyType = propertyDetails?.propertyType?.toLowerCase() || '';
    const isStrataProperty = rawPropertyType.includes('unit') || rawPropertyType.includes('apartment') || 
                            rawPropertyType.includes('flat') || rawPropertyType.includes('townhouse') ||
                            rawPropertyType.includes('villa') || rawPropertyType.includes('studio');
    const standardizedPropertyType = isStrataProperty 
      ? (rawPropertyType.includes('apartment') ? 'Apartment' : 
         rawPropertyType.includes('townhouse') ? 'Townhouse' :
         rawPropertyType.includes('villa') ? 'Villa' :
         rawPropertyType.includes('studio') ? 'Studio Apartment' : 'Unit')
      : (rawPropertyType.includes('house') ? 'House' :
         rawPropertyType.includes('duplex') ? 'Duplex' :
         rawPropertyType || 'Residential Property');
    
    console.log(`🏠 Property Type Standardization: "${rawPropertyType}" → "${standardizedPropertyType}" (isStrata: ${isStrataProperty})`);
    
    // ============================================================================
    // PRE-CALCULATED YIELD VALUES - Recalculated using OVERRIDDEN expense values
    // These values MUST be used exactly in the report, not recalculated by AI
    // ============================================================================
    const effectiveOccupancyRate = mergedOverrides.occupancyRate || 52; // weeks per year
    const annualRentIncome = effectiveWeeklyRent * effectiveOccupancyRate;
    
    // Calculate Gross Yield from overridden values
    const preCalculatedGrossYield = effectivePurchasePrice > 0 
      ? ((annualRentIncome / effectivePurchasePrice) * 100).toFixed(2)
      : enhancedData.financials?.keyMetrics?.grossRentalYield || '0.00';
    
    // CRITICAL FIX: Recalculate Net Yield using OVERRIDDEN expense values
    // Net Yield = (Annual Rent - Total Annual Costs) / Purchase Price * 100
    // Extract effective annual costs from merged overrides (use ?? to respect explicit 0)
    const effectiveCouncilRates = mergedOverrides.councilRates ?? enhancedData.financials?.annualCosts?.councilRates ?? 2500;
    const effectiveWaterRates = mergedOverrides.waterRates ?? enhancedData.financials?.annualCosts?.waterRates ?? 1000;
    const effectiveStrataFees = mergedOverrides.bodyCorporateFees ?? enhancedData.financials?.annualCosts?.strataFees ?? 0;
    const effectiveLandlordInsurance = mergedOverrides.buildingLandlordInsurance ?? enhancedData.financials?.annualCosts?.landlordInsurance ?? 1800;
    const effectiveMaintenance = mergedOverrides.repairsMaintenance ?? enhancedData.financials?.annualCosts?.maintenance ?? 1500;
    const effectiveLandTax = mergedOverrides.landTax ?? enhancedData.financials?.annualCosts?.landTax ?? 0;
    const effectivePmPercent = mergedOverrides.propertyManagementFees ?? enhancedData.financials?.annualCosts?.propertyManagementPercent ?? 8;
    const effectivePmDollar = Math.round(annualRentIncome * (effectivePmPercent / 100));
    
    // Total annual costs for net yield calculation (excluding land tax per standard practice)
    const totalAnnualCostsForNetYield = effectiveCouncilRates + effectiveWaterRates + effectiveStrataFees + 
      effectiveLandlordInsurance + effectiveMaintenance + effectivePmDollar;
    
    const preCalculatedNetYield = effectivePurchasePrice > 0
      ? (((annualRentIncome - totalAnnualCostsForNetYield) / effectivePurchasePrice) * 100).toFixed(2)
      : enhancedData.financials?.keyMetrics?.netRentalYield || '0.00';
    
    console.log(`📊 Pre-calculated Yields: Gross=${preCalculatedGrossYield}%, Net=${preCalculatedNetYield}%`);
    console.log(`📊 Net Yield Calculation: ($${annualRentIncome} rent - $${totalAnnualCostsForNetYield} costs) / $${effectivePurchasePrice} = ${preCalculatedNetYield}%`);
    console.log(`📊 Annual Costs Breakdown: Council=$${effectiveCouncilRates}, Water=$${effectiveWaterRates}, Strata=$${effectiveStrataFees}, Insurance=$${effectiveLandlordInsurance}, Maintenance=$${effectiveMaintenance}, PM=$${effectivePmDollar}`);
    console.log(`📅 Occupancy: ${effectiveOccupancyRate} weeks/year (${((effectiveOccupancyRate/52)*100).toFixed(0)}%)`);
    console.log(`📊 Land Tax Override: $${effectiveLandTax} (will be injected into prompt)`);
    const propertyPrompt = `You are an expert Australian property investment analyst for Naidu Property Consulting Services.
Your role is to produce comprehensive, professional-grade investment reports following the EXACT structure, length, and format of our reference template.

**CRITICAL CALCULATION RULES:**
1. OCCUPANCY ASSUMPTION: Use 100% occupancy rate (52 weeks per year) for ALL rental income calculations unless explicitly overridden. This is industry standard for investment analysis.
2. YIELD VALUES: Use the pre-calculated yield values provided below EXACTLY - do NOT recalculate or estimate yields.
3. PROPERTY TYPE: Use the standardized property type "${standardizedPropertyType}" consistently throughout the report - never switch terminology.

**PRE-CALCULATED FINANCIAL VALUES (USE THESE EXACTLY - DO NOT RECALCULATE):**
- Gross Rental Yield: ${preCalculatedGrossYield}%
- Net Rental Yield: ${preCalculatedNetYield}%
- Annual Rental Income: $${annualRentIncome.toLocaleString()} (based on ${effectiveOccupancyRate} weeks @ $${effectiveWeeklyRent}/week)
- Occupancy Rate: ${effectiveOccupancyRate} weeks per year (${((effectiveOccupancyRate/52)*100).toFixed(0)}% occupancy)

**PRE-CALCULATED ANNUAL COSTS (USE THESE EXACTLY - DO NOT SUBSTITUTE WITH DEFAULTS):**
- Council Rates: $${effectiveCouncilRates.toLocaleString()}/year
- Water Rates: $${effectiveWaterRates.toLocaleString()}/year
- Strata/Body Corporate: $${effectiveStrataFees.toLocaleString()}/year
- Landlord Insurance: $${effectiveLandlordInsurance.toLocaleString()}/year
- Repairs & Maintenance: $${effectiveMaintenance.toLocaleString()}/year
- Property Management: $${effectivePmDollar.toLocaleString()}/year (${effectivePmPercent}% of rent)
- Land Tax: $${effectiveLandTax.toLocaleString()}/year
- Total Annual Costs (excl. Land Tax): $${totalAnnualCostsForNetYield.toLocaleString()}/year

**PROPERTY ADDRESS TO ANALYZE: ${formattedInput}**

${propertyDetails ? `**Property Details Provided:**
- Price: $${propertyDetails.price?.toLocaleString() || 'Not specified'}
- Weekly Rent: $${propertyDetails.weeklyRent || 'Not specified'}
- Property Type: ${standardizedPropertyType}
- Bedrooms: ${propertyDetails.beds || 'Not specified'}
- Bathrooms: ${propertyDetails.baths || 'Not specified'}
${propertyDetails.landSizeSqm ? `- Land Size: ${propertyDetails.landSizeSqm}m²` : ''}
${propertyDetails.buildSizeSqm ? `- Building Size: ${propertyDetails.buildSizeSqm}m²` : ''}
${propertyDetails.carSpaces ? `- Car Spaces: ${propertyDetails.carSpaces}` : ''}
${propertyDetails.isNewBuild ? `- New Build: Yes` : ''}
${isStrataProperty ? `- Strata Property: Yes (body corporate/strata fees apply)` : ''}` : ''}

---

# ═══════════════════════════════════════════════════════════════════════════════
# MANDATORY REPORT STRUCTURE - 38-PAGE REFERENCE TEMPLATE
# YOU MUST FOLLOW THIS EXACT STRUCTURE, LENGTH, AND FORMAT
# ═══════════════════════════════════════════════════════════════════════════════

---

# Investment Report: [Property Address], [STATE] [POSTCODE]

---

# Executive Summary

**REQUIRED CONTENT (Minimum 400 words for this section):**

This executive summary provides a high-level overview of the investment opportunity at ${formattedInput}.

**Property Snapshot:**

| Attribute | Value |
|-----------|-------|
| Property Address | ${formattedInput} |
| Property Type | ${standardizedPropertyType} |
| Purchase Price | $${effectivePurchasePrice?.toLocaleString() || 'X,XXX,XXX'} |
| Estimated Weekly Rent | $${effectiveWeeklyRent || 'XXX'} |
| Gross Rental Yield | ${preCalculatedGrossYield}% |
| Net Rental Yield | ${preCalculatedNetYield}% |

**Investment Highlights:**

1. **Location Strength:** [Summarize key location advantages - proximity to CBD, transport, schools]
2. **Market Position:** [Current market conditions and growth prospects]
3. **Income Potential:** [Rental yield assessment and demand drivers]
4. **Growth Outlook:** [Capital growth expectations based on market data]

**Key Findings:**

- **Strengths:** [List 2-3 key property/location strengths]
- **Considerations:** [List 2-3 areas requiring investor attention]
- **Overall Assessment:** [Brief investment suitability statement]

**Investment Recommendation:**

Based on our comprehensive analysis, this property is [suitable/moderately suitable/requires careful consideration] for investors seeking [capital growth/rental income/balanced returns]. The investment is best suited for [investor profile description].

**Report Structure:**

This report contains detailed analysis across the following sections:
1. Location Overview & Market Performance
2. Demographics & Economic Context
3. Schools, Healthcare & Infrastructure
4. Environmental Risks & Safety Assessment
5. Property-Level Financial Analysis
6. 10-Year Investment Projections
7. SWOT Analysis & Recommendations

---

# Location Overview

**REQUIRED OPENING LINE:** "This investment report analyzes: [FULL PROPERTY ADDRESS]"

**CONTENT REQUIREMENTS (Minimum 500 words for this section):**

[Suburb name] is a [description] community located [XX] kilometres [direction] of [City]'s CBD[citation], positioned within the [District] region of [Metro Area]. The suburb is distinguished by its [key characteristics][citation].

**Geographic Classification:**
- Local Government Area (LGA): [Name] Council
- Statistical Areas: [Suburb] falls within the broader [Area] Statistical Area Level 2 (SA2)

**Suburb Character & Lifestyle:**

[Suburb] presents [description of blend/character]. The suburb features [specific details about streets, properties, land parcels][citation]. A diversity level of [XX.X]% reflects the [description of composition][citation].

The suburb's lifestyle is characterised by:
- **Family-oriented infrastructure:** [Specific facility name] features [detailed list of amenities - courts, fields, parks with exact counts][citation]. [Playground name] offers [specific features including water play, trampolines, shade structures][citation]
- **Parks and green spaces:** [Park 1], [Park 2], and [Park 3] provide [specific amenities][citation]
- **Shopping and dining:** [Shopping centre] and [Secondary centre] host [stores, dining options]. Nearby dining precincts in [Area 1], [Area 2], and [Area 3] offer [cuisine types][citation]

**Employment hubs:**
[Business Park 1] and [Business Park 2] provide significant local job opportunities[citation].

**Public Transport Access:**

A major infrastructure advancement occurred with the opening of [Station Name] in [Year], located at [specific location][citation]. This development has dramatically improved accessibility, providing commuters with access to the [Line Name] through [Connection Station]. The station includes [facilities - car park, bus connections] serving [list of destinations][citation].

**Commute Performance:**
| Metric | Value |
|--------|-------|
| CBD Commute | ${enhancedData.locationIntelligence?.commute?.durationMinutes || 'XX'} minutes via public transit (${enhancedData.locationIntelligence?.commute?.distanceKm || 'XX'} km distance) |
| Public Transport Quality Score | ${enhancedData.locationIntelligence?.transport?.qualityScore || 'XX'}/100 |

The suburb benefits from excellent service frequency, with peak hour services operating at [XX] services per hour and off-peak services at [XX] services per hour across multiple transport modes[citation].

**Population & Development Trends:**

[Suburb] is experiencing [description of growth]. The suburb's future prospects are described as [assessment], with planned infrastructure and residential developments set to [impact]. Population growth is being driven by [factors][citation].

---

# Current Market Performance

| Metric | Value | Data Source |
|--------|-------|-------------|
| Walk Score | ${enhancedData.locationIntelligence?.walkScore || 'XX'}/100 | Location Intelligence Data |
| Public Transport Score | ${enhancedData.locationIntelligence?.transport?.qualityScore || 'XX'}/100 | Location Intelligence Data |

**Market Commentary (150+ words required):**

[Suburb]'s [exceptionally high/moderate/etc.] walk score of [XX]/100 reflects [assessment of pedestrian accessibility]. The [XX]/100 public transport score demonstrates [connectivity assessment]. These metrics underscore the suburb's appeal to [target demographics].

Current market conditions are influenced by the National House Price Growth Rate of [X.X]% (as of [Date]), with [Suburb] positioned to benefit from [demand drivers]. The suburb's inventory includes [property mix description][citation].

---

# Current Economic Context

| Metric | Value | Period |
|--------|-------|--------|
| Cash Rate | ${enhancedData.economics?.cashRate?.current || '4.35'}% | Current |
| Annual Inflation | ${enhancedData.economics?.inflation?.annual || '3.4'}% | Current |
| GDP Growth | ${enhancedData.economics?.indicators?.gdpGrowth || '2.1'}% | Current |
| National Unemployment | ${enhancedData.economics?.indicators?.unemploymentRate || '3.9'}% | Current |
| National House Price Growth | ${enhancedData.economics?.indicators?.housePriceGrowth || '4.2'}% | Current |

The Australian economy is operating at a [growth rate description], with inflation at [X.X]% and the Reserve Bank of Australia maintaining the cash rate at [X.XX]%. The national unemployment rate of [X.X]% indicates [labor market assessment]. These macroeconomic conditions create [environment description] for property values and rental demand in [suburb type] markets like [Suburb].

---

# Demographics & Demand Drivers

**Population & Employment Statistics:**

| Metric | Value | Data Source |
|--------|-------|-------------|
| Labor Force Size | ${enhancedData.demographics?.employment?.laborForce || 'XX,XXX'} | ABS Employment Data |
| Employment Rate | ${enhancedData.demographics?.employment?.employmentRate || 'XX.X'}% | ABS (2025) |
| Unemployment Rate | ${enhancedData.demographics?.income?.unemploymentRate || 'X.X'}% | ABS (2025) |
| Participation Rate | ${enhancedData.demographics?.employment?.laborForceParticipation || 'XX.X'}% | ABS (2025) |
| Median Weekly Income | $${enhancedData.demographics?.income?.medianWeeklyIncome || 'X,XXX'} | ABS (2025) |
| Median Annual Income | $${enhancedData.demographics?.income?.medianHouseholdIncome || 'XX,XXX'} | ABS (2025) |
| Annual Income Growth (last 12 months) | +${enhancedData.demographics?.income?.incomeGrowth || 'X.X'}% | ABS (2025) |

**Socioeconomic Profile (SEIFA Indices):**

| Index | Score | Decile | Rating |
|-------|-------|--------|--------|
| IRSAD | ${enhancedData.seifaData?.irsad?.score || 'XXX'} | ${enhancedData.seifaData?.irsad?.decile || 'X'}/10 | ${enhancedData.seifaData?.irsad?.rating || 'Moderate Advantage'} |
| IRSD | ${enhancedData.seifaData?.irsd?.score || 'XXX'} | ${enhancedData.seifaData?.irsd?.decile || 'X'}/10 | ${enhancedData.seifaData?.irsd?.rating || 'Moderate Disadvantage'} |
| IER | ${enhancedData.seifaData?.ier?.score || 'XXX'} | ${enhancedData.seifaData?.ier?.decile || 'X'}/10 | ${enhancedData.seifaData?.ier?.rating || 'Moderate Education/Occupation'} |
| IEO | ${enhancedData.seifaData?.ieo?.score || 'XXX'} | ${enhancedData.seifaData?.ieo?.decile || 'X'}/10 | ${enhancedData.seifaData?.ieo?.rating || 'Moderate Economic Resources'} |

[Suburb] demonstrates [socioeconomic assessment], positioning the area at [comparative level] across income, education, and occupation dimensions. The IRSAD score of [XXX] (Decile [X]/10) indicates [interpretation]. This socioeconomic profile supports [demand implications].

**Employment & Industry Breakdown:**

| Industry | Workforce % | Growth Rate |
|----------|-------------|-------------|
| Professional Services | ${enhancedData.employmentData?.industries?.[0]?.percentage || 'XX.X'}% | +${enhancedData.employmentData?.industries?.[0]?.growth || 'X.X'}% |
| Healthcare & Social Assistance | ${enhancedData.employmentData?.industries?.[1]?.percentage || 'XX.X'}% | +${enhancedData.employmentData?.industries?.[1]?.growth || 'X.X'}% |
| Retail Trade | ${enhancedData.employmentData?.industries?.[2]?.percentage || 'XX.X'}% | +${enhancedData.employmentData?.industries?.[2]?.growth || 'X.X'}% |
| Education & Training | ${enhancedData.employmentData?.industries?.[3]?.percentage || 'XX.X'}% | +${enhancedData.employmentData?.industries?.[3]?.growth || 'X.X'}% |
| Construction | ${enhancedData.employmentData?.industries?.[4]?.percentage || 'XX.X'}% | +${enhancedData.employmentData?.industries?.[4]?.growth || 'X.X'}% |

**Job Growth Trends:**

| Time Period | Growth Rate | Data Source |
|-------------|-------------|-------------|
| Annual Growth | +${enhancedData.employmentData?.annualGrowth || 'X.X'}% | ABS (2025) |
| 3-Year Growth | +${enhancedData.employmentData?.threeYearGrowth || 'X.X'}% | ABS (2025) |
| 5-Year Growth | +${enhancedData.employmentData?.fiveYearGrowth || 'XX.X'}% | ABS (2025) |

Employment growth has been [assessment], with [XX.X]% cumulative growth over five years. [Leading industry] leads job creation at [X.X]% annual growth, followed by [secondary industry] at [X.X]%. This employment dynamism reflects structural shifts toward [sector types], directly supporting rental demand from workers employed at [nearby employment hubs][citation].

**Demand Drivers (150+ words required):**

The combination of [employment factor], [income factor], and [unemployment factor] creates robust demand for both owner-occupied and rental properties. Population growth is being driven by [demographic groups] attracted to the suburb's [appeal factors]. The suburb attracts [target demographics description].

---

# Schools & Education

**Education Infrastructure Summary:**

| Metric | Value | Data Source |
|--------|-------|-------------|
| Total Schools in Postcode | ${enhancedData.schoolData?.summary?.totalSchools || 'XX'} | Google Places API |
| Average School Rating | ${enhancedData.schoolData?.summary?.averageRating || 'X.X'}/5 stars | Google Places API |
| Education Quality | ${enhancedData.schoolData?.summary?.qualityAssessment || 'Average'} (National Standard) | School Data Analysis |

**Nearest School:**

| School Name | Distance | Type |
|-------------|----------|------|
| ${enhancedData.schoolData?.nearestSchool?.name || '[School Name]'} | ${enhancedData.schoolData?.nearestSchool?.distance || 'X.XX'} km | ${enhancedData.schoolData?.nearestSchool?.type || 'Early Learning'} |

**Top-Rated Schools in Local Area:**

| School Name | Distance | Type |
|-------------|----------|------|
${enhancedData.schoolData?.topSchools?.slice(0, 5).map((s: any) => `| ${s.name} | ${s.distance} km | ${s.type} |`).join('\n') || '| [School 1] | Nearby | Government |'}

**Education Facilities (Extended List):**

| School Name | Distance | Type |
|-------------|----------|------|
${enhancedData.schoolData?.allSchools?.slice(0, 7).map((s: any) => `| ${s.name} | ${s.distance} km | ${s.type} |`).join('\n') || '| [School 1] | X.XX km | Government |'}

**Secondary Education:**

[Secondary school name], the nearest secondary facility, is located [X.X] km distant and rated [X]/5 stars. [Additional schools] provide additional secondary options in the immediate vicinity.

**Education Profile (100+ words required):**

[Suburb] benefits from comprehensive educational coverage with [XX] schools across all levels within the postcode. A diverse range of government and private institutions serve the area, with early learning facilities rated highly (averaging [X.X]/5 stars), making the suburb particularly attractive to families with young children. The availability of quality schools directly supports property demand from families and contributes to capital growth expectations in family-oriented suburbs.

---

# Healthcare & Shopping

**Healthcare Facilities:**

| Category | Facilities Count | Nearest Facility |
|----------|-----------------|------------------|
| Healthcare | ${enhancedData.locationIntelligence?.healthcare?.facilitiesWithin5km || 'XX'} | ${enhancedData.locationIntelligence?.healthcare?.nearestFacility || '[Medical Centre Name]'} |

[Suburb]'s healthcare infrastructure includes [XX] facilities within 5 km, with [Primary facility] as the primary provider just [X.XX] km away. The area benefits from proximity to [hospital description][citation].

**Shopping & Dining Facilities:**

| Category | Facilities Count | Nearest Facility |
|----------|-----------------|------------------|
| Shopping | ${enhancedData.locationIntelligence?.lifestyle?.shoppingCenters || 'XX'} | ${enhancedData.locationIntelligence?.lifestyle?.nearestShopping || '[Shopping Centre]'} |
| Restaurants & Cafes | XX | Multiple Precincts |

[Shopping centre] serves as the central shopping hub, located [X.XX] km away, offering [stores - supermarkets, specialty stores, dining options][citation]. [Secondary shopping description]. Nearby dining precincts in [Area 1], [Area 2], and [Area 3] extend culinary choices[citation].

---

# Recreational Amenities

**Recreation & Parks:**

| Category | Facilities Count | Nearest Facility | Distance |
|----------|-----------------|------------------|----------|
| Parks & Recreation | ${enhancedData.locationIntelligence?.lifestyle?.parks || 'XX'} | ${enhancedData.locationIntelligence?.lifestyle?.nearestPark || '[Reserve Name]'} | ${enhancedData.locationIntelligence?.lifestyle?.nearestParkDistance || 'X.X'} km |

[Nearest park/reserve] is [location description] at just [X.X] km distance, providing immediate access to local parks and recreational facilities. This [proximity level] to green space enhances the property's appeal for families and health-conscious residents.

**Major Recreational Complexes:**

The [Sports Complex Name] is a premier recreational hub featuring:
- [XX] indoor courts
- [XX] outdoor fields (including [XX] all-weather synthetic fields)
- [XX] netball courts
- [XX] tennis courts
- [XX] cricket pitches
- Dog park
- Walking tracks

[Playground name] at [Complex] offers inclusive recreational amenities with water play areas, trampolines, slides, sandpit, balancing beams, swings, musical instruments, climbing ropes, covered shade areas, and barbecue facilities[citation].

Additional parks include [Park 1] and [Park 2], both offering picnic areas, walking paths, and playgrounds. [Regional Park] provides expansive green spaces, bushwalking trails, and wildlife observation opportunities[citation].

**Amenity Summary:**

[Suburb] delivers exceptional recreational access with [XX] major parks and recreation facilities, including world-class sporting complexes and accessible playgrounds. The immediate proximity of [Reserve] ([X.X] km) to the subject property provides superior outdoor recreation without vehicle dependency.

---

# Transport & Accessibility

**Public Transport Network:**

| Metric | Value | Details |
|--------|-------|---------|
| Walk Score | ${enhancedData.locationIntelligence?.walkScore || 'XX'}/100 | ${enhancedData.locationIntelligence?.walkScore >= 70 ? 'Excellent' : 'Moderate'} pedestrian accessibility |
| Public Transport Score | ${enhancedData.locationIntelligence?.transport?.qualityScore || 'XX'}/100 | ${enhancedData.locationIntelligence?.transport?.qualityScore >= 70 ? 'Excellent' : 'Moderate'} service coverage and frequency |
| CBD Commute Time | ${enhancedData.locationIntelligence?.commute?.durationMinutes || 'XX'} minutes | Via public transit (${enhancedData.locationIntelligence?.commute?.distanceKm || 'XX'} km) |
| Nearest Station | ${enhancedData.locationIntelligence?.transport?.nearestStation || '[Station Name]'} | [Location details] |
| Station Opening | [Year] | Multi-storey car park included |

**Service Frequency & Routes:**
- Peak Hour Service: ${enhancedData.locationIntelligence?.transport?.serviceFrequency?.peak || 'XX'} services/hour
- Off-Peak Service: ${enhancedData.locationIntelligence?.transport?.serviceFrequency?.offPeak || 'XX'} services/hour
- Transport Types: ${enhancedData.locationIntelligence?.transport?.transportTypes?.join(', ') || 'Train, Bus, Light Rail'}
- Primary Lines: [Line names]
- Bus Connections: Services to [destinations list]

**Accessibility Features:**
- Wheelchair accessible facilities
- Lift availability at major stations
- Tactile paving for visually impaired users
- Multiple stop locations within 1 km radius

**Transport Advantages (100+ words required):**

The opening of [Station] in [Year] fundamentally transformed the suburb's transport profile. Direct access to the [Line Name] provides express connectivity to [Major hub] and beyond, with frequent peak-hour services ensuring reliable commuting for professionals. Bus integration provides comprehensive coverage of surrounding business districts and educational centers. The walk score of [XX]/100 indicates residents can accomplish most daily tasks on foot, reducing transport dependency and vehicle ownership costs.

---

# Environmental Risks & Climate

**Climate Profile:**

| Metric | Value | Data Source |
|--------|-------|-------------|
| Climate Zone | ${enhancedData.climateData?.climateZone || 'Temperate'} | Bureau of Meteorology |
| Annual Average Temperature | ${enhancedData.climateData?.temperature?.annual || 'XX.X'}°C | BoM |
| Summer Temperature | ${enhancedData.climateData?.temperature?.summer || 'XX.X'}°C | BoM |
| Winter Temperature | ${enhancedData.climateData?.temperature?.winter || 'XX.X'}°C | BoM |
| Annual Rainfall | ${enhancedData.climateData?.rainfall?.annual || 'X,XXX'} mm | BoM |
| Humidity | ${enhancedData.climateData?.humidity?.annual || 'XX'}% | BoM |

**Extreme Weather Risk Assessment:**

| Risk Type | Assessment | Details |
|-----------|------------|---------|
| Heatwaves | ${enhancedData.riskAssessment?.heatwaveRisk?.level || 'Moderate to High'} | ${enhancedData.riskAssessment?.heatwaveRisk?.description || 'Typical for region; increasing frequency due to climate change'} |
| Bushfire | ${enhancedData.riskAssessment?.bushfireRisk?.level || 'High'} | ${enhancedData.riskAssessment?.bushfireRisk?.description || 'Requires verification with state Rural Fire Service for specific property rating'} |
| Flooding | ${enhancedData.riskAssessment?.floodRisk?.level || 'Moderate'} | ${enhancedData.riskAssessment?.floodRisk?.description || 'General flood information available through council and AFRIP'} |
| Storms | ${enhancedData.riskAssessment?.stormRisk?.level || 'Moderate'} | Thunderstorms and severe weather typical in summer months |
| Cyclones | ${enhancedData.riskAssessment?.cycloneRisk?.level || 'Low'} | Not applicable to inland locations |

**Climate Risk Commentary (150+ words required):**

[Suburb] experiences a [climate zone] climate with [rainfall level] rainfall ([X,XXX] mm annually), concentrated in the [peak months] period. Heatwaves represent a [risk level] risk, consistent with [region description], with potential for increasing frequency due to climate change. Bushfire risk is rated as [level] for [State], though specific property-level risk assessment requires verification with the [State] Rural Fire Service (RFS). Flooding risk is [level]; property-specific flood assessment requires property coordinates and consultation with [Council] or AFRIP.

Long-term climate considerations include potential increases in cooling costs during summer months, possible insurance premium adjustments reflecting bushfire risk, and maintenance implications for properties in high-risk bushfire zones. These factors should be incorporated into long-term ownership cost projections and risk management strategies.

---

# Crime & Safety

**Crime Statistics:**

| Metric | Value | Comparison |
|--------|-------|------------|
| Overall Crime Rating | ${enhancedData.crimeStatistics?.overallRating || 'Medium'} | ${enhancedData.crimeStatistics?.comparedToStateAverage || 'X% higher/lower than state average'} |
| Rate per 100,000 people | ${enhancedData.crimeStatistics?.ratePer100k || 'X,XXX'} | Latest 12 months |
| Safety Score | ${enhancedData.crimeStatistics?.safetyScore || 'XX'}/100 | - |
| Year-on-Year Change | ${enhancedData.crimeStatistics?.yoyChange || '-X.X'}% | - |
| 3-Year Trend | ${enhancedData.crimeStatistics?.threeYearTrend || '-X.X'}% | [Improving/Stable/Worsening] |

**Crime Profile Analysis:**

| Offence Category | Incidents | Percentage |
|-----------------|-----------|------------|
| Property Offences | ${enhancedData.crimeStatistics?.breakdown?.property?.incidents || 'X,XXX'} | ${enhancedData.crimeStatistics?.breakdown?.property?.percentage || 'XX'}% |
| Violent Offences | ${enhancedData.crimeStatistics?.breakdown?.violent?.incidents || 'XXX'} | ${enhancedData.crimeStatistics?.breakdown?.violent?.percentage || 'XX'}% |
| Drug Offences | ${enhancedData.crimeStatistics?.breakdown?.drug?.incidents || 'XXX'} | ${enhancedData.crimeStatistics?.breakdown?.drug?.percentage || 'XX'}% |
| Public Order Offences | ${enhancedData.crimeStatistics?.breakdown?.publicOrder?.incidents || 'X,XXX'} | ${enhancedData.crimeStatistics?.breakdown?.publicOrder?.percentage || 'XX'}% |

[Suburb]'s crime profile reflects typical suburban characteristics, with property offences ([XX]%) representing the largest category, primarily comprising theft, break-and-enter, and motor vehicle theft incidents. Violent offences account for [XX]% of incidents, [comparison to property crimes]. The overall crime rate of [X,XXX] per 100,000 population is approximately [X]% [higher/lower] than the [State] state average; however, the critical positive indicator is the 3-year [direction] trend of [X.X]%, indicating [interpretation].

The year-on-year change of [X.X]% suggests [trend assessment]. The safety score of [XX]/100 positions [Suburb] as a [safety assessment] suburb, consistent with [suburb type] areas. For investment purposes, the [declining/stable/increasing] crime trend is [significance assessment].

**Data Source:** [State] Bureau of Crime Statistics and Research (BOCSAR), [URL]

---

# Property-Level Information

**Property Address:** ${formattedInput}

**Property Characteristics:**

Based on ${documentContent ? 'the provided property listing data' : 'location intelligence and comparable market evidence'} for [Street] properties in [Suburb], ${documentContent ? 'this property exhibits' : 'typical residential properties in this location exhibit'} the following profile:

| Property Characteristic | ${documentContent ? 'Value' : 'Estimated Value'} |
|------------------------|-------|
| Property Type | ${standardizedPropertyType} |
| Land Size | ${effectiveLandSizeSqm ? effectiveLandSizeSqm + ' m²' : 'Estimated XXX-XXX m² (typical for suburb)'} |
| Bedrooms | ${effectiveBeds || 'X (typical for property type)'} |
| Bathrooms | ${effectiveBaths || 'X-X (typical modern standard)'} |
| Parking | ${propertyDetails?.carSpaces || 'X-X spaces'} |
| Year Built | ${propertyDetails?.yearBuilt || 'Estimated XXXX-XXXX'} |
| Condition | ${propertyDetails?.condition || 'Good to excellent'} |
${isStrataProperty ? `| Strata Type | ${standardizedPropertyType} within strata scheme |` : ''}

**${documentContent ? 'Property Price' : 'Estimated Property Value'}:** $${effectivePurchasePrice?.toLocaleString() || 'X,XXX,XXX'} AUD

This valuation reflects typical [Suburb] [property type] prices for [configuration description] on [land description]. The ${documentContent ? 'price' : 'estimate'} is based on the suburb's positioning as [suburb characteristics], and [infrastructure/transport factors].

**Property Position Relative to Market:**

[Suburb] [property type] at this specification typically command [premium/discount] pricing relative to [comparison suburbs] due to [factors]. Properties on [Street] benefit from [specific advantages].

---

# Zoning & Planning Analysis

${hasZoningData ? `**Zoning Classification:**

| Zoning Attribute | Details |
|-----------------|---------|
| Zoning Code | ${effectiveZoningCode || 'Not specified'} |
| Category | ${effectiveZoningDescription || 'Not specified'} |
| Permitted Uses | ${effectivePermittedUses ? effectivePermittedUses.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Standard residential uses'} |
| Development Potential | ${effectiveDevelopmentPotential ? effectiveDevelopmentPotential.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Subject to council approval'} |
| Planning Overlays | ${effectiveZoningOverlays ? effectiveZoningOverlays.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'No significant overlays identified'} |
| Heritage Status | [Confirm heritage overlay status with local council] |
| Conservation Areas | [Identify any environmental conservation restrictions] |

**Development Controls:**

| Control | Value | Investment Implication |
|---------|-------|------------------------|
| Minimum Lot Size | ${effectiveMinimumLotSize ? effectiveMinimumLotSize + ' m²' : 'Refer to LEP'} | [Assess subdivision feasibility] |
| Maximum Building Height | ${effectiveMaximumHeight ? effectiveMaximumHeight + ' m' : 'Refer to LEP'} | [Multi-storey development potential] |
| Floor Space Ratio (FSR) | ${effectiveFloorSpaceRatio ? effectiveFloorSpaceRatio + ':1' : 'Refer to LEP'} | [Maximum buildable area ratio] |
| Site Coverage | [XX]% | [Permissible building footprint] |
| Setbacks (Front) | [X]m | [Building positioning constraints] |
| Setbacks (Side/Rear) | [X]m / [X]m | [Side and rear boundary requirements] |
| Landscaping Requirements | [XX]% minimum | [Green space allocation] |

**Local Environmental Plan (LEP) Analysis:**

The property falls under the [Council Name] Local Environmental Plan [Year]. Key considerations:

- **Principal Permitted Uses:** Dwelling houses, secondary dwellings (granny flats), home occupations, home businesses
- **Uses Requiring Consent:** Dual occupancy, attached dwellings, boarding houses, child care centres
- **Prohibited Uses:** Commercial retail, industrial, intensive agriculture

**Development Control Plan (DCP) Requirements:**

- **Dwelling Design:** Character requirements, articulation, façade treatment
- **Landscaping:** Deep soil zones, tree retention, canopy coverage targets
- **Parking:** Minimum [X] off-street spaces per dwelling
- **Stormwater:** On-site detention requirements, water sensitive urban design
- **Private Open Space:** Minimum [XX]m² principal private open space

**Strategic Planning Context:**

- **Growth Corridor Status:** [Is the area within a designated growth corridor?]
- **Urban Renewal Precinct:** [Proximity to renewal areas with potential upzoning]
- **State Significant Development:** [Any state-level planning schemes affecting the area]
- **Future Rezoning Potential:** [Analysis of strategic planning documents for potential uplift]

**Zoning Investment Implications:**

The ${effectiveZoningCode || 'residential'} zoning ${effectiveDevelopmentPotential && effectiveDevelopmentPotential !== 'none' ? 'provides potential for ' + effectiveDevelopmentPotential.replace(/_/g, ' ') + ', which could enhance long-term investment value through development upside' : 'is typical for the area and supports standard residential use, with limited immediate development potential'}. ${effectiveZoningOverlays && effectiveZoningOverlays !== 'none' ? 'The ' + effectiveZoningOverlays.replace(/_/g, ' ') + ' overlay may impact development options and should be factored into renovation or development plans. Additional consultant reports may be required for development applications.' : 'No significant planning overlays were identified that would restrict standard residential development.'}

${effectivePermittedUses && (effectivePermittedUses.includes('dual') || effectivePermittedUses.includes('secondary') || effectivePermittedUses.includes('multi')) ? `**Value-Add Development Opportunities:**

1. **Secondary Dwelling (Granny Flat):** Subject to lot size requirements, a secondary dwelling up to 60m² could provide rental income of approximately $[XXX]/week
2. **Dual Occupancy Conversion:** If lot size permits, conversion to dual occupancy could increase property value by 30-50%
3. **Subdivision Potential:** [Assess whether lot size supports Torrens title or strata subdivision]

These development options require detailed feasibility analysis and council pre-lodgement consultation.` : ''}

**Planning Risk Assessment:**

| Risk Factor | Assessment | Mitigation Strategy |
|-------------|------------|---------------------|
| Rezoning Risk | Low/Medium/High | Monitor council strategic planning updates |
| Heritage Overlay | [Confirm with council] | Obtain heritage impact assessment if required |
| Bushfire Prone Land | [BAL rating if applicable] | Comply with AS3959 construction standards |
| Flood Affectation | [Check flood maps] | Obtain flood certificate, confirm habitable floor levels |

**Recommendation:** Verify all zoning information with the [Council Name] planning portal before proceeding with any development applications. Obtain a Section 10.7 (formerly Section 149) Planning Certificate for comprehensive zoning confirmation.` : `**Zoning Information:**

Specific zoning data was not provided for this property. For comprehensive investment analysis, verify the following with the local council:

**Planning Certificate Requirements (Section 10.7):**

| Certificate Type | Information Provided |
|-----------------|---------------------|
| Section 10.7(2) | Basic zoning classification |
| Section 10.7(2)+(5) | Comprehensive: all planning restrictions, overlays, development contributions |

**Key Zoning Verification Items:**

1. **Current Zoning Classification:** Confirm zone code (e.g., R2, R3, R4 for residential)
2. **Permitted Land Uses:** Primary and secondary dwelling entitlements
3. **Development Controls:** Height limits, FSR, setbacks, minimum lot size
4. **Planning Overlays:** Heritage, conservation, bushfire, flood, acoustic

**Future Planning Considerations:**

- Review council's Local Strategic Planning Statement (LSPS)
- Check Housing Strategy for density targets
- Identify proximity to nominated urban renewal precincts
- Monitor state government planning initiatives (e.g., transit-oriented development, housing policy changes)

**Development Potential Assessment:**

- **Secondary Dwelling:** Check minimum lot size requirements (typically 450m²)
- **Dual Occupancy:** Assess zoning permissions and lot size requirements
- **Subdivision:** Review minimum lot sizes for new allotments
- **Multi-Unit Development:** Confirm if R3/R4 rezoning potential exists

**Note:** Zoning can significantly impact both development potential and long-term investment value. Strategic rezoning can deliver substantial capital uplift. We strongly recommend obtaining a Section 10.7(2)+(5) Planning Certificate and reviewing the council's strategic planning documents before finalising investment decisions.`}

---

# Purchase & Ongoing Costs (Annual)

**Assumptions:**
- Property Price: $${effectivePurchasePrice?.toLocaleString() || (enhancedData.financials?.initialCosts?.propertyValue?.toLocaleString()) || 'X,XXX,XXX'} AUD
- Deposit: ${100 - effectiveLvr}% = $${effectiveDepositValue?.toLocaleString() || enhancedData.financials?.initialCosts?.deposit?.toLocaleString() || 'XXX,XXX'}
- Loan Amount: $${enhancedData.financials?.initialCosts?.loanAmount?.toLocaleString() || 'X,XXX,XXX'}
- Loan Term: ${effectiveLoanTerm} years
- Interest Rate: ${effectiveInterestRate}%

**Purchase Costs:**

| Cost Category | Amount (AUD) | Calculation Method |
|---------------|--------------|-------------------|
| Property Price | $${effectivePurchasePrice?.toLocaleString() || (enhancedData.financials?.initialCosts?.propertyValue?.toLocaleString()) || 'X,XXX,XXX'} | Reference value |
| Stamp Duty | $${enhancedData.financials?.initialCosts?.stampDuty?.toLocaleString() || 'XX,XXX'} | [State]: [X.XX]% on $[X.XXm] (approximate marginal rate) |
| Legal Fees | $${enhancedData.financials?.initialCosts?.legalFees?.toLocaleString() || '1,200'} | Typical conveyancing costs |
| Building Inspection | $600 | Standard pre-purchase inspection |
| Total Acquisition Cost | $${enhancedData.financials?.initialCosts?.totalUpfront?.toLocaleString() || 'X,XXX,XXX'} | Property + all purchase costs |

**Annual Ongoing Costs:**

| Cost Category | Amount (AUD) | Calculation Method |
|---------------|--------------|-------------------|
| Council Rates | $${enhancedData.financials?.annualCosts?.councilRates?.toLocaleString() || 'X,XXX'} | Local council rates notice |
| Water Rates | $${enhancedData.financials?.annualCosts?.waterRates?.toLocaleString() || 'XXX'} | Estimated based on local water authority |
| Property Management Fee | $${effectivePmDollar?.toLocaleString() || enhancedData.financials?.annualCosts?.propertyManagement?.toLocaleString() || 'X,XXX'} | ${effectivePmPercent}% × annual rent |
| Property Insurance | $${effectiveLandlordInsurance?.toLocaleString() || enhancedData.financials?.annualCosts?.landlordInsurance?.toLocaleString() || '1,200'} | Typical comprehensive home insurance |
| Maintenance | $${effectiveMaintenance?.toLocaleString() || '0'} | User-specified maintenance cost |
| Land Tax | $${effectiveLandTax?.toLocaleString() || enhancedData.financials?.annualCosts?.landTax?.toLocaleString() || '0'} | State land tax (pre-calculated) |
| **Total Annual Costs** | **$${(totalAnnualCostsForNetYield + effectiveLandTax)?.toLocaleString() || enhancedData.financials?.annualCosts?.totalAnnual?.toLocaleString() || 'X,XXX'}** | Sum of ALL ongoing costs |

**Land Tax Calculation (Information Only):**

[State] Land Tax applies to investment properties with aggregated land value exceeding $[threshold]. For a property at $[price] with standard land value allocation (~[XX]% = $[value]), land tax would be approximately: [calculation]. However, for comparative purposes, if threshold exceeded: [X.X]% marginal rate applies to amount over threshold.

Note: Land tax is highly property-specific and depends on aggregated landholding. Recommend consultation with [State] Revenue for accurate calculation.

---

# Rental Assessment & Yield Calculation

**Comparable Rental Evidence:**

| Property Type | Estimated Weekly Rent | Annual Rental Income |
|--------------|----------------------|---------------------|
| ${effectiveBeds || 'X'}-Bed ${standardizedPropertyType} | $${effectiveWeeklyRent || (enhancedData.financials?.income?.weeklyRent) || 'XXX'} - $${(effectiveWeeklyRent || enhancedData.financials?.income?.weeklyRent || 0) + 50 || 'XXX'} | $${annualRentIncome.toLocaleString() || 'XX,XXX'} - $${(annualRentIncome + (50 * effectiveOccupancyRate)).toLocaleString() || 'XX,XXX'} |

**Selected Rental Assumption:** $${effectiveWeeklyRent || enhancedData.financials?.income?.weeklyRent || 'XXX'}/week × ${effectiveOccupancyRate} weeks = $${annualRentIncome.toLocaleString() || 'XX,XXX'} annually (${effectiveOccupancyRate === 52 ? '100% occupancy' : `${((effectiveOccupancyRate/52)*100).toFixed(0)}% occupancy`})

**IMPORTANT: All calculations use ${effectiveOccupancyRate} weeks/year occupancy (${((effectiveOccupancyRate/52)*100).toFixed(0)}%). Do NOT interpret this as ${effectiveOccupancyRate}% occupancy - it is ${effectiveOccupancyRate} WEEKS per year.**

**Gross Rental Yield Calculation (USE THESE EXACT VALUES):**

| Metric | Calculation | Value |
|--------|-------------|-------|
| Annual Rental Income | $${effectiveWeeklyRent || enhancedData.financials?.income?.weeklyRent || 'XXX'} × ${effectiveOccupancyRate} weeks | $${annualRentIncome.toLocaleString() || 'XX,XXX'} |
| Property Price | Reference value | $${effectivePurchasePrice?.toLocaleString() || (enhancedData.financials?.initialCosts?.propertyValue?.toLocaleString()) || 'X,XXX,XXX'} |
| **Gross Rental Yield** | **Pre-calculated (DO NOT recalculate)** | **${preCalculatedGrossYield}%** |

**Net Rental Yield Calculation (USE THESE EXACT VALUES):**

| Metric | Calculation | Value |
|--------|-------------|-------|
| Annual Income | $${effectiveWeeklyRent || enhancedData.financials?.income?.weeklyRent || 'XXX'} × ${effectiveOccupancyRate} weeks | $${annualRentIncome.toLocaleString() || 'XX,XXX'} |
| Annual Expenses | Property Mgmt + Maintenance + Rates + Insurance | $${enhancedData.financials?.annualCosts?.totalAnnualExcludingLandTax?.toLocaleString() || 'X,XXX'} |
| Net Annual Return | Income - Expenses | $${(annualRentIncome - (enhancedData.financials?.annualCosts?.totalAnnualExcludingLandTax || 0)).toLocaleString() || 'XX,XXX'} |
| **Net Rental Yield** | **Pre-calculated (DO NOT recalculate)** | **${preCalculatedNetYield}%** |

**Yield Comparison to Benchmarks:**

| Benchmark | Gross Yield | Net Yield | Comparison |
|-----------|-------------|-----------|------------|
| This Property | ${preCalculatedGrossYield}% | ${preCalculatedNetYield}% | - |
| ${suburb || 'Suburb'} Median | [X.XX]% | [X.XX]% | [Above/Below] |
| LGA Average | [X.XX]% | [X.XX]% | [Above/Below] |
| ${state || 'State'} Average | [X.XX]% | [X.XX]% | [Above/Below] |
| National Average | 4.2% | 2.8% | [Above/Below] |

**Yield Commentary:**

The gross rental yield of ${preCalculatedGrossYield}% and net yield of ${preCalculatedNetYield}% reflect typical [Suburb] residential rental returns. These yields are [comparison to other areas]. The [modest/strong] rental yield positioning suggests this property is primarily suitable for investors prioritizing [capital growth/rental income], typical of [suburb characteristics].

---

# Loan Structure & Repayment Analysis

**Loan Assumptions:**
- Loan Amount: $${enhancedData.financials?.initialCosts?.loanAmount?.toLocaleString() || 'X,XXX,XXX'}
- Interest Rate: ${enhancedData.financials?.loanDetails?.interestRate || 6.5}%
- Loan Term: 30 years
- Repayment: Annual calculations

**Principal & Interest Loan (P&I):**

Monthly repayment formula: M = P[r(1+r)^n]/[(1+r)^n-1]

Where:
- P = $${enhancedData.financials?.initialCosts?.loanAmount?.toLocaleString() || 'X,XXX,XXX'}
- r = ${enhancedData.financials?.loanDetails?.interestRate || 6.5}%/12 = ${((enhancedData.financials?.loanDetails?.interestRate || 6.5) / 12 / 100).toFixed(6)} (monthly)
- n = 360 months

| Item | Amount (Annual) | Amount (Monthly) |
|------|-----------------|------------------|
| Principal & Interest Repayment | $${(enhancedData.financials?.loanDetails?.monthlyPayment ? enhancedData.financials.loanDetails.monthlyPayment * 12 : 0).toLocaleString() || 'XX,XXX'} | $${enhancedData.financials?.loanDetails?.monthlyPayment?.toLocaleString() || 'X,XXX'} |
| Interest Paid (Year 1) | $${(enhancedData.financials?.loanDetails?.interestOnlyPayment ? enhancedData.financials.loanDetails.interestOnlyPayment * 12 : 0).toLocaleString() || 'XX,XXX'} | $${enhancedData.financials?.loanDetails?.interestOnlyPayment?.toLocaleString() || 'X,XXX'} |
| Principal Repaid (Year 1) | $${((enhancedData.financials?.loanDetails?.monthlyPayment || 0) * 12 - (enhancedData.financials?.loanDetails?.interestOnlyPayment || 0) * 12).toLocaleString() || 'X,XXX'} | $${((enhancedData.financials?.loanDetails?.monthlyPayment || 0) - (enhancedData.financials?.loanDetails?.interestOnlyPayment || 0)).toLocaleString() || 'XXX'} |

Note: Blended calculation for annual presentation; actual P&I repayments decline monthly as principal portion increases.

**Interest-Only Loan (First 5 Years):**

| Item | Amount (Annual) | Amount (Monthly) |
|------|-----------------|------------------|
| Interest-Only Repayment | $${(enhancedData.financials?.loanDetails?.interestOnlyPayment ? enhancedData.financials.loanDetails.interestOnlyPayment * 12 : 0).toLocaleString() || 'XX,XXX'} | $${enhancedData.financials?.loanDetails?.interestOnlyPayment?.toLocaleString() || 'X,XXX'} |

---

# Cashflow Analysis

**Cashflow Analysis - Principal & Interest Scenario (Year 1):**

| Item | Amount (AUD) |
|------|--------------|
| Gross Rental Income (${effectiveOccupancyRate} weeks @ $${effectiveWeeklyRent}/wk) | $${annualRentIncome.toLocaleString() || 'XX,XXX'} |
| Less: P&I Loan Repayment | ($${(enhancedData.financials?.loanDetails?.monthlyPayment ? enhancedData.financials.loanDetails.monthlyPayment * 12 : 0).toLocaleString() || 'XX,XXX'}) |
| Less: Council Rates | ($${effectiveCouncilRates?.toLocaleString() || enhancedData.financials?.annualCosts?.councilRates?.toLocaleString() || 'X,XXX'}) |
| Less: Water Rates | ($${effectiveWaterRates?.toLocaleString() || enhancedData.financials?.annualCosts?.waterRates?.toLocaleString() || 'XXX'}) |
| Less: Property Management (${effectivePmPercent}%) | ($${effectivePmDollar?.toLocaleString() || enhancedData.financials?.annualCosts?.propertyManagement?.toLocaleString() || 'X,XXX'}) |
| Less: Insurance | ($${effectiveLandlordInsurance?.toLocaleString() || enhancedData.financials?.annualCosts?.landlordInsurance?.toLocaleString() || '1,200'}) |
| Less: Maintenance | ($${effectiveMaintenance?.toLocaleString() || '0'}) |
${isStrataProperty ? `| Less: Body Corporate/Strata | ($${effectiveStrataFees?.toLocaleString() || enhancedData.financials?.annualCosts?.bodyCorporate?.toLocaleString() || mergedOverrides.bodyCorporateFees?.toLocaleString() || '3,000'}) |` : ''}
| **Net Cashflow Before Tax** | **($${Math.abs(enhancedData.financials?.keyMetrics?.annualNet || 0).toLocaleString() || 'XX,XXX'})** |

**Cashflow Analysis - Interest-Only Scenario (Year 1):**

| Item | Amount (AUD) |
|------|--------------|
| Gross Rental Income (${effectiveOccupancyRate} weeks @ $${effectiveWeeklyRent}/wk) | $${annualRentIncome.toLocaleString() || 'XX,XXX'} |
| Less: Interest-Only Repayment | ($${(enhancedData.financials?.loanDetails?.interestOnlyPayment ? enhancedData.financials.loanDetails.interestOnlyPayment * 12 : 0).toLocaleString() || 'XX,XXX'}) |
| Less: Council Rates | ($${effectiveCouncilRates?.toLocaleString() || enhancedData.financials?.annualCosts?.councilRates?.toLocaleString() || 'X,XXX'}) |
| Less: Water Rates | ($${effectiveWaterRates?.toLocaleString() || enhancedData.financials?.annualCosts?.waterRates?.toLocaleString() || 'XXX'}) |
| Less: Property Management (${effectivePmPercent}%) | ($${effectivePmDollar?.toLocaleString() || enhancedData.financials?.annualCosts?.propertyManagement?.toLocaleString() || 'X,XXX'}) |
| Less: Insurance | ($${effectiveLandlordInsurance?.toLocaleString() || enhancedData.financials?.annualCosts?.landlordInsurance?.toLocaleString() || '1,200'}) |
| Less: Maintenance | ($${effectiveMaintenance?.toLocaleString() || '0'}) |
${isStrataProperty ? `| Less: Body Corporate/Strata | ($${effectiveStrataFees?.toLocaleString() || enhancedData.financials?.annualCosts?.bodyCorporate?.toLocaleString() || mergedOverrides.bodyCorporateFees?.toLocaleString() || '3,000'}) |` : ''}
| **Net Cashflow Before Tax** | **($${Math.abs((enhancedData.financials?.keyMetrics?.annualNet || 0) - ((enhancedData.financials?.loanDetails?.monthlyPayment || 0) - (enhancedData.financials?.loanDetails?.interestOnlyPayment || 0)) * 12).toLocaleString() || 'XX,XXX'})** |

**IMPORTANT NOTE:** Gross Rental Income assumes ${effectiveOccupancyRate} weeks per year occupancy (${((effectiveOccupancyRate/52)*100).toFixed(0)}%), which is industry standard for investment analysis.

**Cashflow Commentary (150+ words required):**

Both P&I and Interest-Only loan structures produce negative cash flow in Year 1, with the property requiring approximately $[XX,XXX] annually (P&I) or $[XX,XXX] annually (IO) in additional investor capital. This negative cashflow is typical for established suburbs where rental yields lag loan serviceability costs. The investor must be positioned to cover this annual shortfall, or alternatively, factor capital growth appreciation as the primary return driver.

The P&I scenario provides superior long-term economics as principal repayment builds equity, while the Interest-Only scenario maximizes tax deductibility of interest expense during the IO period but offers no principal reduction.

---

# Sensitivity Analysis

**Impact of Interest Rate Variations on Annual Cashflow (P&I Scenario):**

| Scenario | Interest Rate | Annual Loan Repayment | Annual Cashflow |
|----------|---------------|----------------------|-----------------|
| Stress Case | ${(enhancedData.financials?.loanDetails?.interestRate || 6.5) + 1}% (+1.0%) | $${(enhancedData.financials?.sensitivityAnalysis?.interestRateUp?.monthlyPayment ? enhancedData.financials.sensitivityAnalysis.interestRateUp.monthlyPayment * 12 : 0).toLocaleString() || 'XX,XXX'} | ($${Math.abs(enhancedData.financials?.sensitivityAnalysis?.interestRateUp?.annualNet || 0).toLocaleString() || 'XX,XXX'}) |
| Base Case | ${enhancedData.financials?.loanDetails?.interestRate || 6.5}% | $${(enhancedData.financials?.loanDetails?.monthlyPayment ? enhancedData.financials.loanDetails.monthlyPayment * 12 : 0).toLocaleString() || 'XX,XXX'} | ($${Math.abs(enhancedData.financials?.keyMetrics?.annualNet || 0).toLocaleString() || 'XX,XXX'}) |
| Improvement Case | ${(enhancedData.financials?.loanDetails?.interestRate || 6.5) - 1}% (-1.0%) | $${(enhancedData.financials?.sensitivityAnalysis?.interestRateDown?.monthlyPayment ? enhancedData.financials.sensitivityAnalysis.interestRateDown.monthlyPayment * 12 : 0).toLocaleString() || 'XX,XXX'} | ($${Math.abs(enhancedData.financials?.sensitivityAnalysis?.interestRateDown?.annualNet || 0).toLocaleString() || 'XX,XXX'}) |

**Sensitivity Commentary (150+ words required):**

A 1% increase in interest rate (to [X.X]%) would increase annual loan repayments by $[X,XXX], pushing negative cashflow to approximately ($[XX,XXX]), requiring significantly higher investor capital contributions. Conversely, a 1% decrease in rates (to [X.X]%) would reduce annual repayments to $[XX,XXX], improving the negative cashflow position to ($[XX,XXX]).

This sensitivity analysis demonstrates that the property's cashflow profile is interest-rate sensitive. In a rising-rate environment, negative cashflow pressures intensify, requiring investors to have substantial capital reserves. The property is fundamentally a capital growth play, not a cashflow-positive investment, making it unsuitable for investors dependent on rental income to service debt.

---

# 10-Year Investment Projections

**Projection Assumptions:**
- Conservative Scenario: 2% annual price growth, 2% annual rent growth
- Base Case Scenario: 4% annual price growth, 3% annual rent growth
- Optimistic Scenario: 6% annual price growth, 4% annual rent growth

**Property Value Projections (AUD):**

| Year | Conservative (2%) | Base Case (4%) | Optimistic (6%) |
|------|-------------------|----------------|-----------------|
| 0 | $${effectivePurchasePrice?.toLocaleString() || (enhancedData.financials?.initialCosts?.propertyValue?.toLocaleString()) || 'X,XXX,XXX'} | $${effectivePurchasePrice?.toLocaleString() || (enhancedData.financials?.initialCosts?.propertyValue?.toLocaleString()) || 'X,XXX,XXX'} | $${effectivePurchasePrice?.toLocaleString() || (enhancedData.financials?.initialCosts?.propertyValue?.toLocaleString()) || 'X,XXX,XXX'} |
${enhancedData.financials?.projections?.conservative ? enhancedData.financials.projections.conservative.slice(0, 10).map((p: any, i: number) => 
`| ${i + 1} | $${p.propertyValue?.toLocaleString() || 'X,XXX,XXX'} | $${enhancedData.financials?.projections?.moderate?.[i]?.propertyValue?.toLocaleString() || 'X,XXX,XXX'} | $${enhancedData.financials?.projections?.optimistic?.[i]?.propertyValue?.toLocaleString() || 'X,XXX,XXX'} |`
).join('\n') : '| 1-10 | [Calculate based on growth rates] | [Calculate based on growth rates] | [Calculate based on growth rates] |'}

**Rental Income Projections (Annual - AUD):**

| Year | Conservative (2%) | Base Case (3%) | Optimistic (4%) |
|------|-------------------|----------------|-----------------|
${enhancedData.financials?.projections?.conservative ? enhancedData.financials.projections.conservative.slice(0, 10).map((p: any, i: number) => 
`| ${i + 1} | $${p.annualRent?.toLocaleString() || 'XX,XXX'} | $${enhancedData.financials?.projections?.moderate?.[i]?.annualRent?.toLocaleString() || 'XX,XXX'} | $${enhancedData.financials?.projections?.optimistic?.[i]?.annualRent?.toLocaleString() || 'XX,XXX'} |`
).join('\n') : '| 1-10 | [Calculate based on rent growth] | [Calculate based on rent growth] | [Calculate based on rent growth] |'}

**Cumulative Cashflow Projections (10 Years - AUD):**

Cashflow = Annual Rental Income - Annual Operating Costs - Annual Loan Repayments

**Annual Operating Costs (excluding loan repayment):** $${enhancedData.financials?.annualCosts?.totalAnnualExcludingLandTax?.toLocaleString() || 'X,XXX'}
**Annual P&I Repayment:** $${(enhancedData.financials?.loanDetails?.monthlyPayment ? enhancedData.financials.loanDetails.monthlyPayment * 12 : 0).toLocaleString() || 'XX,XXX'} (Year 1, declining as principal portion increases)

| Year | Conservative (2%) | Base Case (3%) | Optimistic (4%) |
|------|-------------------|----------------|-----------------|
${enhancedData.financials?.projections?.conservative ? enhancedData.financials.projections.conservative.slice(0, 10).map((p: any, i: number) => 
`| ${i + 1} | ($${Math.abs(p.cashFlow || 0).toLocaleString()}) | ($${Math.abs(enhancedData.financials?.projections?.moderate?.[i]?.cashFlow || 0).toLocaleString()}) | ($${Math.abs(enhancedData.financials?.projections?.optimistic?.[i]?.cashFlow || 0).toLocaleString()}) |`
).join('\n') : '| 1-10 | [Calculate] | [Calculate] | [Calculate] |'}
| **10-Year Total** | **($${Math.abs(enhancedData.financials?.projections?.conservative?.reduce((sum: number, p: any) => sum + (p.cashFlow || 0), 0) || 0).toLocaleString() || 'XXX,XXX'})** | **($${Math.abs(enhancedData.financials?.projections?.moderate?.reduce((sum: number, p: any) => sum + (p.cashFlow || 0), 0) || 0).toLocaleString() || 'XXX,XXX'})** | **($${Math.abs(enhancedData.financials?.projections?.optimistic?.reduce((sum: number, p: any) => sum + (p.cashFlow || 0), 0) || 0).toLocaleString() || 'XXX,XXX'})** |

**Projected Loan-to-Value Ratio (LVR) - Year 10:**

Loan Balance at Year 10: Approximately $[XXX,XXX] (declining from initial $${enhancedData.financials?.initialCosts?.loanAmount?.toLocaleString() || 'X,XXX,XXX'})

| Scenario | Year 10 Property Value | Loan Balance | LVR |
|----------|------------------------|--------------|-----|
| Conservative (2%) | $${enhancedData.financials?.projections?.conservative?.[9]?.propertyValue?.toLocaleString() || 'X,XXX,XXX'} | $${enhancedData.financials?.projections?.conservative?.[9]?.loanBalance?.toLocaleString() || 'XXX,XXX'} | ${enhancedData.financials?.projections?.conservative?.[9]?.lvr || 'XX'}% |
| Base Case (4%) | $${enhancedData.financials?.projections?.moderate?.[9]?.propertyValue?.toLocaleString() || 'X,XXX,XXX'} | $${enhancedData.financials?.projections?.moderate?.[9]?.loanBalance?.toLocaleString() || 'XXX,XXX'} | ${enhancedData.financials?.projections?.moderate?.[9]?.lvr || 'XX'}% |
| Optimistic (6%) | $${enhancedData.financials?.projections?.optimistic?.[9]?.propertyValue?.toLocaleString() || 'X,XXX,XXX'} | $${enhancedData.financials?.projections?.optimistic?.[9]?.loanBalance?.toLocaleString() || 'XXX,XXX'} | ${enhancedData.financials?.projections?.optimistic?.[9]?.lvr || 'XX'}% |

**10-Year Projection Commentary (200+ words required):**

The conservative scenario (2% growth) produces a Year 10 Property Value of $[X,XXX,XXX] representing cumulative Capital Growth of [XX]%. The LVR declines to [XX]% through principal repayment, though the property remains [leverage assessment].

The base case scenario (4% growth) delivers Year 10 value of $[X,XXX,XXX], producing substantial capital appreciation of $[XXX,XXX] ([XX.X]%). LVR declines to [XX]%, reflecting healthy equity accumulation through both property appreciation and loan reduction.

The optimistic scenario (6% growth) projects Year 10 value of $[X,XXX,XXX], with capital gains of $[X,XXX,XXX] ([XX.X]%). LVR declines to [XX]%, indicating strong equity position and reduced leverage.

**Cumulative Cashflow:** All scenarios produce negative cumulative cashflow over the 10-year period, ranging from ($[XXX,XXX]) in the conservative case to ($[XXX,XXX]) in the optimistic case. This negative cashflow is offset by capital appreciation, making the investment viable only for investors capable of sustaining annual shortfalls and targeting long-term wealth accumulation through capital growth rather than rental income.

**Critical Insight:** This property is fundamentally structured as a Capital Growth investment, with [X]% annual property appreciation expectations, with rental income insufficient to cover debt servicing costs.

---

# Investment Score Analysis

**CRITICAL NOTE:** ${documentContent ? 'Analysis based on provided property data and market research.' : 'Insufficient comparable market data and recent sales analysis specific to this property may prevent calculation of a precise investment score. The following analysis is based on suburb-level characteristics and general market positioning.'}

**Investment Grade:** ${enhancedData.investmentScore?.grade || 'B'} (${documentContent ? 'Based on property analysis' : 'Based on suburb fundamentals - requires property-specific assessment'})

**Total Score:** ${enhancedData.investmentScore?.totalScore || 'XX'}/100

**Recommendation:** ${enhancedData.investmentScore?.recommendation || 'HOLD'} ${documentContent ? '' : 'with caution pending property-specific verification'}

**Score Breakdown:**

| Component | Weight (%) | Score (/100) |
|-----------|------------|--------------|
| Growth Score | 30% | ${enhancedData.investmentScore?.breakdown?.growthScore?.score || 'XX'} |
| Location Score | 25% | ${enhancedData.investmentScore?.breakdown?.locationScore?.score || 'XX'} |
| Yield Score | 20% | ${enhancedData.investmentScore?.breakdown?.yieldScore?.score || 'XX'} |
| Demand Score | 15% | ${enhancedData.investmentScore?.breakdown?.demandScore?.score || 'XX'} |
| Risk Score | 10% | ${enhancedData.investmentScore?.breakdown?.riskScore?.score || 'XX'} |

---

# SWOT Analysis

**Strengths (Minimum 10 bullet points required, each with 2-3 sentence explanation):**

- **Exceptional location:** Walk score of [XX]/100 provides pedestrian accessibility without car dependency. This reduces transport costs and enhances lifestyle convenience for residents.
- **Metro connectivity:** [Metro Line] opened [Year], fundamentally improving transport profile and CBD commute time to [XX] minutes. This infrastructure investment typically drives long-term capital growth.
- **Education infrastructure:** [XX] schools within postcode, with multiple highly-rated early learning facilities ([X.X] stars), supporting family demand. Quality schools are a primary driver of family property purchases.
- **Employment dynamics:** Strong job growth (+[X.X]% annually, +[XX.X]% over 5 years) across professional services, healthcare, and education sectors. Employment growth directly correlates with housing demand.
- **Population growth drivers:** Family-friendly positioning, quality schools, modern recreational facilities, and improved transport creating sustained rental and owner-occupier demand.
- **Demographic alignment:** Employment rate [XX.X]%, unemployment [X.X]%, median income $[XX,XXX], supporting strong renter and buyer demand.
- **Safety trends:** Crime [declining/stable] [X.X]% over 3 years despite moderate overall crime rating. Improving safety metrics support capital appreciation.
- **Proximity to green space:** [Reserve/Park] immediately adjacent ([X.X] km) to subject property. Green space proximity enhances property values and lifestyle appeal.
- **Established suburb:** Mature residential area with well-maintained properties and established community infrastructure. Established suburbs typically offer more stable capital growth.
- **[Additional strength based on property specifics]**

**Weaknesses (Minimum 10 bullet points required, each with 2-3 sentence explanation):**

- **Weak rental yield:** Gross yield [X.XX]%, net yield [X.XX]% insufficient to cover loan serviceability; requires investor capital support. This is typical for growth-focused suburbs but requires careful financial planning.
- **Negative cashflow:** Year 1 cashflow negative $[XX,XXX] (P&I) or ($[XX,XXX]) (IO), with cumulative 10-year shortfalls of ($[XXX,XXX]) to ($[XXX,XXX]). Investors must have stable income to sustain this commitment.
- **Interest rate sensitivity:** [X]% rate rise increases annual cashflow deficit by $[X,XXX]; vulnerable in tightening rate environment. Rising rates could strain investor cash reserves.
- **Environmental risks:** [High/Moderate] bushfire risk rating requires verification; flood risk assessment pending property-specific analysis. Environmental risks may impact insurance costs.
- **Market valuation:** Estimated $[X,XXX,XXX] price point reflects premium positioning relative to [comparison] suburbs; capitalizes growth expectations. Premium pricing reduces margin for error.
- **Leverage structure:** 20% deposit requires $[X,XXX,XXX] loan financing; LVR declines [slowly/moderately] over 10-year period. High leverage amplifies both gains and losses.
- **Rent growth constraints:** Rental income growing [X-X]% annually insufficient to improve cashflow economics; persistent shortfall across projections.
- **Premium pricing:** High purchase price relative to rental income suggests limited margin for economic downturns or rental market compression.
- **Demand concentration:** Market appeal primarily to families; reduces buyer base diversity and increases exposure to family-formation demographic shifts.
- **[Additional weakness based on property specifics]**

**Opportunities (Minimum 10 bullet points required, each with 2-3 sentence explanation):**

- **Capital appreciation:** Base case [X]% annual growth produces $[XXX,XXX] capital gains over 10 years; optimistic case delivers $[X,XXX,XXX] gains. Leverage amplifies returns on investor equity.
- **Debt reduction:** Principal repayment over 30-year term builds equity; loan balance declining $[XXX,XXX] over 10 years creates wealth accumulation. This is forced savings discipline.
- **Rental income growth:** Conservative [X-X]% annual rent increases provide inflation hedge; Year 10 rental income reaching $[XX,XXX]-$[XX,XXX] annually.
- **Interest rate improvement:** Current [X.XX]% rate provides potential for downward movement; 1% decline improves cashflow by $[X,XXX] annually.
- **Infrastructure development:** Planned residential and commercial developments in [Suburb] region support continued population growth and property appreciation.
- **Employment expansion:** Continued job growth in healthcare (+[X.X]%), professional services (+[X.X]%), and education creates sustained demand for rental properties.
- **Family lifecycle demand:** Strong family positioning attracts growing cohort of families seeking suburban education and lifestyle amenities.
- **Leverage amplification:** Capital appreciation on $[X.XX]m asset magnified through 80% financing; [X]% price growth on fully-leveraged position produces enhanced returns relative to deposit.
- **Tax deductibility:** Interest expense on investment property fully tax-deductible, improving after-tax cashflow position for investors in higher tax brackets.
- **Equity release optionality:** Accumulated equity over 10 years ($[XXX]k-$[XXX]k depending on growth scenario) enables future capital access for portfolio expansion.

**Threats (Minimum 10 bullet points required, each with 2-3 sentence explanation):**

- **Interest rate increases:** [X]%+ rates creating ($[XX,XXX]) annual cashflow deficit. Rising rates reduce affordability and may suppress property values.
- **Rental market softening:** Oversupply in [Suburb] rental market could compress yields below [X.XX]%; downward rent pressure prevents cashflow improvement.
- **Economic recession:** Economic downturn could suppress both capital growth and rental demand; [X]% growth vulnerable if growth turns negative.
- **Property price correction:** Outer suburbs exposed to correction risk if interest rates remain elevated; premium valuation relative to yield vulnerable to repricing.
- **Bushfire risk:** High bushfire rating may increase insurance costs, trigger evacuation requirements, or result in property damage requiring major repairs.
- **Flood risk:** Pending flood assessment could reveal constraints on insurability, lender appetite, or future development rights.
- **Family demographic shift:** Aging population or migration patterns could reduce demand from family cohorts, decreasing rental pool and owner-occupier competition.
- **Transport demand saturation:** Metro line usage may not meet projections; reduced commuter demand could moderate capital growth expectations.
- **Regulatory changes:** Negative gearing restrictions, capital gains tax changes, or rental price controls could impact investment economics.
- **Concentration risk:** Portfolio overly exposed to [region] family suburbs; lacks geographic diversification of capital.

**SWOT Analysis Summary (200+ words required):**

This is a summary of the Strengths, Weaknesses, Opportunities, and Threats analyzed above. Investors should consider these factors holistically when making their investment decision.

---

**Note: The following Strategic Assessment, Investment Opportunities, and Investment Risks are detailed subsections of Property-Level Information above. They provide property-specific strategic analysis.**

### Strategic Assessment

The [Property Address] investment presents a growth-focused opportunity suitable for investors with long-term capital, capacity to absorb negative cashflow, and confidence in [X-X]% annual [City] property appreciation. The property is structurally unsuitable for income-focused investors or those dependent on rental cashflow.

Location fundamentals are [exceptional/strong/moderate] - the walk score of [XX]/100, proximity to [Transport line], comprehensive schools and recreational facilities, and strong employment growth create sustained demand drivers. Demographic tailwinds are supportive, with low unemployment ([X.X]%), strong wage growth (+[X.X]% annually), and [suburb type] positioning.

Financial structure is inherently cashflow-negative, requiring approximately $[XX,XXX]-$[XX,XXX] annual investor capital support throughout the 10-year projection period. This structure only works if investors target $[XXX,XXX]-$[X,XXX,XXX]+ capital appreciation offsetting annual shortfalls. Risk profile is [elevated/moderate], particularly regarding interest rate sensitivity (1% increase adds $[X,XXX] annual cashflow pressure) and [unverified/verified] environmental hazards.

**Investment suitability:**

Best suited to investors who (1) have secure employment supporting annual $[XX]k+ cashflow contributions, (2) seek wealth accumulation through capital appreciation rather than income generation, (3) possess long-term 10+ year investment horizon, (4) can tolerate leverage and interest rate sensitivity, and (5) believe in [X]%+ annual appreciation through multiple economic cycles.

### Capital Appreciation Potential - $${Math.round((enhancedData.financials?.projections?.moderate?.[9]?.propertyValue || 0) - (effectivePurchasePrice || enhancedData.financials?.initialCosts?.propertyValue || 0)).toLocaleString() || 'XXX,XXX'} to $${Math.round((enhancedData.financials?.projections?.optimistic?.[9]?.propertyValue || 0) - (effectivePurchasePrice || enhancedData.financials?.initialCosts?.propertyValue || 0)).toLocaleString() || 'X,XXX,XXX'} (10-Year Projection)

Base case scenario projects Property Value of $[X,XXX,XXX] at Year 10, representing capital gains of $[XXX,XXX] ([XX.X]% total return). Optimistic scenario delivers $[X,XXX,XXX] value with gains of $[X,XXX,XXX] ([XX.X]% return). These projections assume [X-X]% annual appreciation, consistent with historical [City] metropolitan trends and supported by [Suburb]'s improving infrastructure, employment growth, and population inflows. Leverage amplifies returns: $[XXX,XXX] equity deployed generates $[XXX,XXX]+ appreciation, producing [X.X]x to [X.X]x return on equity invested. This capital appreciation fundamentally underwrites the investment case and offsets negative cashflow across projection period.

### Leveraged Equity Accumulation Through Debt Reduction

Over 10 years, principal repayment reduces loan balance from $[X,XXX,XXX] to approximately $[XXX,XXX], building equity of $[XXX,XXX] independent of property appreciation. Combined with capital appreciation, total wealth accumulation reaches $[XXX,XXX]-$[X,XXX,XXX] across projection scenarios. This debt reduction is automatic and inevitable, creating forced savings discipline. Accumulated equity provides optionality for future portfolio expansion, home renovation, or accessing capital during market stress periods.

### Sustained Employment Growth Driving Rental Demand (+[X.X]% annually, +[XX.X]% over 5 years)

Strong local job growth across professional services (+[X.X]%), healthcare (+[X.X]%), and education (+[X.X]%) creates sustained demand for rental properties from employed professionals. Labor force participation rate of [XX.X]% and unemployment rate of [X.X]% indicate tight labor market supporting wage growth and rental affordability. Median income of $[XX,XXX] annually positions renters comfortably within serviceability parameters for $[XXX]/week rental commitments. Continued population growth driven by employment expansion supports rental demand resilience, reducing vacancy risk and providing uplift potential as rents normalize toward market levels.

### Structural Cashflow Deficit Requiring Ongoing Investor Capital Support

The property generates negative cashflow of ($[XX,XXX]) annually under base assumptions, with cumulative 10-year shortfalls of ($[XXX,XXX]). This structure requires investors to contribute approximately $[X,XXX] monthly (P&I scenario) or $[X,XXX] monthly (IO scenario) in addition to deposit capital. Investors with insufficient liquid capital, unstable employment, or income constraints cannot sustain this commitment. Life events (job loss, income reduction, health crisis) that impact investor capital capacity create forced-sale risk or default risk. The property is unsuitable for self-funding through rental income and represents a capital commitment, not an income stream.

### Interest Rate Sensitivity and Debt Serviceability Pressure

Loan repayments at current [X.X]% rate absorb [XX]% of gross rental income before accounting for property management, rates, insurance, and maintenance. A 1% rate increase (to [X.X]%) increases annual repayments by $[X,XXX], pushing negative cashflow to ($[XX,XXX])-a [XX]% increase in annual capital requirement. RBA maintains potential for further rate increases if inflation remains sticky; even modest tightening creates material cashflow deterioration. Investors with limited capital buffers face refinancing stress or forced sale risk if rates spike. Conversely, rate reductions provide primary cashflow improvement pathway; any base case reliance on rate cuts represents uncontrollable external dependency.

### Environmental Risk: [High/Moderate] Bushfire Rating and Unverified Flood Risk

[State] experiences regular bushfire seasons, and [Suburb] is rated [LEVEL] for bushfire risk. Specific property-level risk assessment requires verification with [State] Rural Fire Service (RFS); properties in extreme fire risk zones face insurance unavailability or extreme premium escalation. Flood risk is currently [verified/unverified] and requires property coordinates for accurate assessment; potential flooding exposure could impact insurability, lender appetite, or development constraints. Combined environmental risks create tail-risk exposure: (1) insurance premium spikes reducing net yields further, (2) uninsurable property becoming unmarketable, (3) damage events creating unexpected capital calls for repairs, or (4) regulatory evacuation requirements constraining usage or rental marketability. Hazard verification is essential precondition to purchase commitment.

---

# Investment Recommendations

**Short-term Actions (Prior to Purchase):**

- Engage professional valuer to obtain formal property valuation for [Property Address]; assess whether ${documentContent ? 'the listed price' : 'estimated reference price'} of $[X,XXX,XXX] accurately reflects current market conditions and property-specific features
- Conduct environmental hazard verification through [State] RFS for bushfire risk assessment and AFRIP for flood risk mapping; make fire/flood insurance availability and cost confirmation conditional to purchase commitment
- Obtain local real estate agent market analysis including recent 12-month comparable sales data, rental market evidence, and suburb price forecasts from licensed agents familiar with [Street/Area]
- Verify financial serviceability with mortgage broker or bank; confirm loan approval capacity at current [X.X]% rate AND at stressed [X.X]% rate (RBA upside scenario)
- Confirm liquid capital reserves capable of supporting ($[XX,XXX]) annual negative cashflow over minimum 10-year investment period; calculate capacity to sustain scenario with [X.X]%+ rates producing ($[XX,XXX]) annual shortfalls

**Before proceeding with purchase commitment, conduct:**

- Professional property appraisal to verify ${documentContent ? 'listed' : 'estimated'} $[X,XXX,XXX] valuation
- [State] RFS property risk assessment to confirm bushfire risk rating and evacuation zone status
- AFRIP flood mapping using property coordinates to assess flooding exposure
- Local council rates search to verify exact annual council and water charges
- Rental market assessment through local real estate agents to validate $[XXX]/week rental estimate
- Comparative sales analysis through licensed real estate agent or valuer for recent 12-month transactions
- Pest and building inspection to assess structural condition and maintenance requirements
- Lender pre-approval to confirm serviceability assessment and loan terms at current interest rates
- Model personal tax position with accountant to quantify benefit of negative gearing deductions and capital gains tax treatment on projected appreciation

**Long-term Strategy (Ownership & Wealth Maximization):**

- Adopt minimum 10-year hold strategy to allow capital appreciation projections to materialize and debt reduction to accumulate meaningful equity; short-term trading exposes property to transaction costs and market timing risk
- Refinance to interest-only loan after 5-7 years of principal repayment if equity position permits; interest-only structure optimizes tax deductibility and preserves capital for portfolio expansion or alternative investments
- Target rental income optimization through property maintenance and positioning; monitor rent market annually and reset tenancy at market rates to capture upward rent growth ([X-X]% annually); under-market rents represent lost opportunity cost
- Maintain comprehensive property insurance including home and landlord liability; given [LEVEL] bushfire risk rating, confirm policy includes fire damage coverage and evacuation expense reimbursement
- Monitor local infrastructure developments including [Transport] extensions, school expansions, and commercial developments; infrastructure improvements provide capital appreciation catalysts
- Build equity buffer through principal repayment; accumulated equity after 10 years ($[XXX,XXX]-$[XXX,XXX] range across growth scenarios) provides optionality for portfolio expansion or capital access without forced sales

**Key Considerations for Monitoring:**

- Interest rate movements: [X]% increase/decrease materially impacts annual cashflow by ±$[X,XXX]. Rising rate environment creates refinancing stress; rate cuts provide primary improvement pathway
- Employment market durability: Strong local job growth (+[X.X]% annually) underpins rental demand; economic downturn reducing local employment would compress rents and weaken capital growth assumptions
- Rental market supply/demand balance: Monitor new residential development pipeline in [Suburb]; oversupply of rental properties could suppress rent growth and compress gross yields below [X.XX]% projection
- [City] property market valuations: [Suburb]'s premium positioning assumes sustained metropolitan appreciation; prolonged period of stagnant or negative capital growth would invalidate investment thesis
- Climate hazard events: Track bushfire season intensity and flooding occurrences; severe fire/flood events trigger insurance premium escalation or coverage restrictions affecting ongoing costs and marketability
- Family demographic trends: [Suburb]'s appeal targets family cohorts; demographic aging or migration patterns reducing family-formation rates would reduce demand drivers
- Leverage and debt serviceability: Annual negative cashflow of $[XX,XXX] represents [XX]% of estimated deposit annually; confirm capacity to sustain this cost indefinitely remains intact through employment stability

---

# Investment Suitability Screening

**This investment is APPROPRIATE for investors who:**

- Possess 10+ year investment horizon and patience for long-term wealth accumulation
- Have stable employment supporting minimum $[XX,XXX]+ annual cashflow contributions
- Seek capital appreciation ([X-X]%) over rental income generation
- Can absorb 1-2% annual portfolio volatility and extended flat-growth periods
- Have confidence in [City] metropolitan property market sustainability
- Maintain sufficient liquid reserves ($[XXX,XXX] deposit + $[XX,XXX]+ annual reserves minimum)
- Are comfortable with 80% leverage and interest rate sensitivity
- Accept environmental hazard exposure (bushfire, flood) pending verification

**This investment is NOT APPROPRIATE for investors who:**

- Require immediate positive cashflow or rental income to service costs
- Have unstable employment or insufficient capital reserves
- Seek quick returns (3-5 year timeframes); capital appreciation requires minimum 10-year hold
- Cannot afford $[XX,XXX]+ annual capital contributions
- Are sensitive to interest rate increases or economic downturns
- Require 100% equity financing or cannot access 80% LVR
- Are risk-averse regarding leverage, environmental hazards, or market volatility

---

# Final Conclusion

**Investment Thesis Summary:**

[Property Address] represents a structured capital growth opportunity for investors capable of sustaining negative cashflow and confident in [City] metropolitan property appreciation over a 10+ year investment horizon. The property offers [exceptional/strong/moderate] location fundamentals (walk score [XX]/100, metro accessibility, quality schools, strong employment growth) and demographic tailwinds supporting rental demand and capital appreciation.

However, the investment exhibits significant financial constraints: Negative annual cashflow of ($[XX,XXX]) to ($[XX,XXX]), depending on loan structure, requires investor capital support throughout the projection period. The property is fundamentally unsuitable for income-focused investors or those dependent on rental income. Return generation depends entirely on achieving [X-X]% annual property appreciation; rental income ($[XX,XXX] annually) covers only [XX]% of debt serviceability costs.

Risk profile is [elevated/moderate] due to interest rate sensitivity ([X]% rate change impacts annual cashflow by $[X,XXX]), [unverified/verified] environmental hazards ([level] bushfire risk, [level] flood risk), and leverage exposure (80% LVR). The investment requires investors to maintain strict financial discipline, verify environmental hazards prior to purchase, and commit to long-term ownership even through periods of market stagnation.

**Valuation Assessment:**

${documentContent ? 'The listed' : 'Estimated'} property price of $[X,XXX,XXX] reflects market [premium/standard] positioning for [suburb type] with [infrastructure/amenity factors]. Price appears [reasonable/premium/discounted] relative to [Suburb] benchmarks but provides [limited/adequate] margin for economic downturns or extended periods of below-trend property growth.

**Overall Recommendation:**

**QUALIFIED ${enhancedData.investmentScore?.recommendation || 'HOLD'} with Contingencies**

This property warrants serious consideration for investors who (1) verify environmental hazards as acceptable, (2) confirm financial capacity to sustain negative cashflow, (3) achieve mortgage pre-approval at serviceability-acceptable terms, and (4) obtain professional valuation confirming price point aligns with current market conditions. The investment is suitable for disciplined, long-term capital accumulators with strong employment stability and confidence in [City] metropolitan property markets. Investors prioritizing immediate returns or requiring rental income should pursue alternative investments with superior yield profiles.

**Report Completion Date:** ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}

**Data Currency:** ${new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}

**Analyst Disclaimer:**

This report synthesizes publicly available data and ${documentContent ? 'provided property listing information' : 'generic suburb-level analysis'}. It does not constitute financial advice, property valuation, or legal guidance. Investors must conduct independent verification of all material facts, obtain professional appraisals, and consult with licensed real estate agents, valuers, accountants, and financial advisors prior to making investment commitments.

---

# ═══════════════════════════════════════════════════════════════════════════════
# ABSOLUTE FORMATTING REQUIREMENTS - FOLLOW EXACTLY
# ═══════════════════════════════════════════════════════════════════════════════

1. **38+ PAGE REPORT**: This MUST be a comprehensive report equivalent to 38+ printed pages (12,000-15,000 words minimum)
2. **EVERY SECTION REQUIRED**: Include ALL sections exactly as specified above - do not skip any
3. **SUBSTANTIAL CONTENT**: Each section must meet the minimum word counts specified in parentheses
4. **TABLE FORMAT**: Use markdown tables EXACTLY as shown with proper column alignment
5. **NO PLACEHOLDERS**: NEVER use "N/A", "TBD", "data unavailable", or "XX" placeholders - use real data or realistic estimates
6. **ALL 10 YEARS**: Projection tables MUST include all 10 years of data
7. **DOLLAR AMOUNTS**: All amounts in AUD with $ symbol and proper comma formatting
8. **CITATIONS**: Include [citation] markers where data is sourced from external references
9. **HORIZONTAL RULES**: Use --- between ALL major sections for visual separation
10. **PROFESSIONAL LANGUAGE**: Data-driven, specific, actionable insights throughout
11. **EXPENSE VALUES**: Use the EXACT expense values provided in PRE-CALCULATED ANNUAL COSTS section - do not substitute with defaults
12. **COMPLETE SWOT**: Minimum 10 detailed bullet points per SWOT category with 2-3 sentence explanations each
13. **TOP 3 SECTIONS**: Each of Top 3 Opportunities and Top 3 Risks must be 150+ words with specific dollar amounts`;

    // Select the appropriate prompt based on report scope
    let prompt = reportScope === 'suburb' ? suburbPrompt : propertyPrompt;
    
    // If document content is available (from URL scrape OR PDF upload), prepend it to the prompt for context
    if (documentContent) {
      const contentSourceLabel = fromPdfUpload ? 'PDF Document' : (sourceUrl || 'Property Listing');
      console.log(`📄 Injecting ${fromPdfUpload ? 'PDF' : 'scraped'} property listing content into prompt...`);
      console.log(`   Content source: ${contentSourceLabel}`);
      console.log(`   Content length: ${documentContent.length} characters`);
      
      // Build a summary of extracted property details
      const extractedDetailsSummary: string[] = [];
      if (propertyDetails?.price) extractedDetailsSummary.push(`Price: $${propertyDetails.price.toLocaleString()}`);
      if (propertyDetails?.beds) extractedDetailsSummary.push(`Bedrooms: ${propertyDetails.beds}`);
      if (propertyDetails?.baths) extractedDetailsSummary.push(`Bathrooms: ${propertyDetails.baths}`);
      if (propertyDetails?.carSpaces) extractedDetailsSummary.push(`Car Spaces: ${propertyDetails.carSpaces}`);
      if (propertyDetails?.landSizeSqm) extractedDetailsSummary.push(`Land Size: ${propertyDetails.landSizeSqm} sqm`);
      if (propertyDetails?.buildSizeSqm) extractedDetailsSummary.push(`Building Size: ${propertyDetails.buildSizeSqm} sqm`);
      if (propertyDetails?.propertyType) extractedDetailsSummary.push(`Property Type: ${propertyDetails.propertyType}`);
      if (propertyDetails?.suburb) extractedDetailsSummary.push(`Suburb: ${propertyDetails.suburb}`);
      if (propertyDetails?.postcode) extractedDetailsSummary.push(`Postcode: ${propertyDetails.postcode}`);
      if (propertyDetails?.state) extractedDetailsSummary.push(`State: ${propertyDetails.state}`);
      if (propertyDetails?.weeklyRent) extractedDetailsSummary.push(`Weekly Rent: $${propertyDetails.weeklyRent}`);
      if (propertyDetails?.isNewBuild) extractedDetailsSummary.push(`New Build: Yes`);
      if (propertyDetails?.landPrice) extractedDetailsSummary.push(`Land Price: $${propertyDetails.landPrice.toLocaleString()}`);
      if (propertyDetails?.buildPrice) extractedDetailsSummary.push(`Build Price: $${propertyDetails.buildPrice.toLocaleString()}`);
      
      const extractedDetailsText = extractedDetailsSummary.length > 0 
        ? `\n\n**EXTRACTED PROPERTY SPECIFICATIONS:**\n${extractedDetailsSummary.join('\n')}\n`
        : '';
      
      // Use different instructions based on content source
      const sourceSpecificInstructions = fromPdfUpload 
        ? `**CRITICAL INSTRUCTIONS FOR PDF-UPLOADED LISTINGS:**
1. The above content was extracted from a property listing PDF document
2. This is the PRIMARY source of truth for this property's specifications and features
3. Extract and use the EXACT property specifications from the document (bedrooms, bathrooms, land size, price)
4. Use the property address exactly as shown in the document
5. Include all relevant property features, upgrades, and selling points mentioned in the document
6. If a price is mentioned (guide, asking, or range), use it for financial calculations
7. Note any specific renovations, improvements, or unique characteristics
8. Consider the property description when assessing investment potential
9. Verify the suburb/postcode from the document for accurate location analysis
10. For new builds: Use the land + build package price for total property value`
        : `**CRITICAL INSTRUCTIONS FOR URL-SCRAPED LISTINGS:**
1. The above scraped content is the PRIMARY source of truth for this property
2. Extract and use the EXACT property specifications from the listing (bedrooms, bathrooms, land size, price)
3. Use the property address exactly as shown in the listing
4. Include all relevant property features, upgrades, and selling points mentioned in the listing
5. If a price is mentioned (guide, asking, or range), use it for financial calculations
6. Note any specific renovations, improvements, or unique characteristics
7. Consider the property description when assessing investment potential
8. Verify the suburb/postcode from the listing for accurate location analysis`;
      
      const documentContextSection = `
---
**PROPERTY LISTING DATA (SOURCE: ${contentSourceLabel})**

The following is the full content ${fromPdfUpload ? 'extracted from the property listing PDF' : 'scraped from the property listing'}. Use this as PRIMARY context for the property details, features, description, and any specific information mentioned in the listing:

${documentContent}
${extractedDetailsText}
---

${sourceSpecificInstructions}

---

`;
      prompt = documentContextSection + prompt;
      console.log(`✓ ${fromPdfUpload ? 'PDF' : 'Scraped'} content injected with extracted details. New prompt length:`, prompt.length);
    } else {
      console.log('ℹ️ No document content available - generating report from property address and web search only');
    }

    // ========== MANUAL OVERRIDES INJECTION ==========
    // Inject pre-generation overrides from the frontend into the prompt
    const manualOverrides = propertyDetails?.manualOverrides;
    if (manualOverrides && Object.keys(manualOverrides).length > 0) {
      console.log('📝 Injecting manual overrides into prompt...');
      const overrideLines: string[] = [];
      
      // Build Type
      if (manualOverrides.buildType) {
        overrideLines.push(`Build Type: ${manualOverrides.buildType === 'new_build' ? 'New Build (House & Land Package)' : 'Existing Property'}`);
      }
      
      // Property Values
      if (manualOverrides.purchasePrice) overrideLines.push(`Purchase Price: $${manualOverrides.purchasePrice.toLocaleString()}`);
      if (manualOverrides.landPrice) overrideLines.push(`Land Price: $${manualOverrides.landPrice.toLocaleString()}`);
      if (manualOverrides.buildPrice) overrideLines.push(`Build Price: $${manualOverrides.buildPrice.toLocaleString()}`);
      if (manualOverrides.weeklyRent) overrideLines.push(`Weekly Rent: $${manualOverrides.weeklyRent}`);
      if (manualOverrides.depositValue) overrideLines.push(`Deposit: $${manualOverrides.depositValue.toLocaleString()}`);
      
      // Loan Settings
      if (manualOverrides.loanToValueRatio) overrideLines.push(`Loan-to-Value Ratio (LVR): ${manualOverrides.loanToValueRatio}%`);
      if (manualOverrides.interestRate) overrideLines.push(`Interest Rate: ${manualOverrides.interestRate}%`);
      if (manualOverrides.loanType) overrideLines.push(`Loan Type: ${manualOverrides.loanType === 'interest_only' ? 'Interest Only' : 'Principal & Interest'}`);
      if (manualOverrides.loanTermYears) overrideLines.push(`Loan Term: ${manualOverrides.loanTermYears} years`);
      if (manualOverrides.loanAmount) overrideLines.push(`Loan Amount: $${manualOverrides.loanAmount.toLocaleString()}`);
      if (manualOverrides.interestOnlyPeriodYears) overrideLines.push(`Interest-Only Period: ${manualOverrides.interestOnlyPeriodYears} years`);
      if (manualOverrides.repaymentFrequency) overrideLines.push(`Repayment Frequency: ${manualOverrides.repaymentFrequency}`);
      if (manualOverrides.extraRepaymentPerMonth) overrideLines.push(`Extra Repayment/Month: $${manualOverrides.extraRepaymentPerMonth}`);
      if (manualOverrides.offsetBalance) overrideLines.push(`Offset Balance: $${manualOverrides.offsetBalance.toLocaleString()}`);
      
      // Growth Assumptions
      if (manualOverrides.capitalGrowth) overrideLines.push(`Capital Growth Rate: ${manualOverrides.capitalGrowth}% p.a.`);
      if (manualOverrides.cpiGrowthRate) overrideLines.push(`CPI Growth Rate: ${manualOverrides.cpiGrowthRate}% p.a.`);
      
      // Acquisition Costs
      if (manualOverrides.stampDuty) overrideLines.push(`Stamp Duty: $${manualOverrides.stampDuty.toLocaleString()}`);
      if (manualOverrides.solicitorFees) overrideLines.push(`Solicitor Fees: $${manualOverrides.solicitorFees.toLocaleString()}`);
      if (manualOverrides.agentFee) overrideLines.push(`Agent Fee/Commission: $${manualOverrides.agentFee.toLocaleString()}`);
      if (manualOverrides.isFirstHomeBuyer) overrideLines.push(`First Home Buyer: Yes (apply stamp duty concessions)`);
      
      // Annual Expenses
      if (manualOverrides.bodyCorporateFees) overrideLines.push(`Body Corporate/Strata Fees: $${manualOverrides.bodyCorporateFees.toLocaleString()} p.a.`);
      if (manualOverrides.strataAdminFund) overrideLines.push(`Strata Admin Fund: $${manualOverrides.strataAdminFund.toLocaleString()} p.a.`);
      if (manualOverrides.strataSinkingFund) overrideLines.push(`Strata Sinking Fund: $${manualOverrides.strataSinkingFund.toLocaleString()} p.a.`);
      if (manualOverrides.strataSpecialLevies) overrideLines.push(`Strata Special Levies: $${manualOverrides.strataSpecialLevies.toLocaleString()} p.a.`);
      if (manualOverrides.landTax) overrideLines.push(`Land Tax: $${manualOverrides.landTax.toLocaleString()} p.a.`);
      if (manualOverrides.councilRates) overrideLines.push(`Council Rates: $${manualOverrides.councilRates.toLocaleString()} p.a.`);
      if (manualOverrides.waterRates) overrideLines.push(`Water Rates: $${manualOverrides.waterRates.toLocaleString()} p.a.`);
      if (manualOverrides.buildingLandlordInsurance) overrideLines.push(`Building/Landlord Insurance: $${manualOverrides.buildingLandlordInsurance.toLocaleString()} p.a.`);
      if (manualOverrides.propertyManagementFees) overrideLines.push(`Property Management Fees: ${manualOverrides.propertyManagementFees}%`);
      if (manualOverrides.repairsMaintenance) overrideLines.push(`Repairs & Maintenance: $${manualOverrides.repairsMaintenance.toLocaleString()} p.a.`);
      if (manualOverrides.lettingFees) overrideLines.push(`Letting Fees: $${manualOverrides.lettingFees.toLocaleString()} p.a.`);
      
      // Cash Flow Analysis
      if (manualOverrides.depreciation) overrideLines.push(`Depreciation: $${manualOverrides.depreciation.toLocaleString()} p.a.`);
      if (manualOverrides.taxRate) overrideLines.push(`Marginal Tax Rate: ${manualOverrides.taxRate}%`);
      // CLARIFIED: Occupancy rate is in WEEKS per year, NOT percentage
      if (manualOverrides.occupancyRate) overrideLines.push(`Occupancy Rate: ${manualOverrides.occupancyRate} WEEKS per year (equals ${((manualOverrides.occupancyRate/52)*100).toFixed(0)}% annual occupancy - DO NOT confuse with ${manualOverrides.occupancyRate}%)`);
      if (manualOverrides.marketValueNow) overrideLines.push(`Current Market Value: $${manualOverrides.marketValueNow.toLocaleString()}`);
      
      // Property Specs
      if (manualOverrides.landSizeSqm) overrideLines.push(`Land Size: ${manualOverrides.landSizeSqm} sqm`);
      if (manualOverrides.buildSizeSqm) overrideLines.push(`Build Size: ${manualOverrides.buildSizeSqm} sqm`);
      
      // New Build Specifics
      if (manualOverrides.buildType === 'new_build') {
        if (manualOverrides.constructionDurationMonths) overrideLines.push(`Construction Duration: ${manualOverrides.constructionDurationMonths} months`);
        if (manualOverrides.constructionYear) overrideLines.push(`Construction Year: ${manualOverrides.constructionYear}`);
        
        // Construction Stage Percentages
        const stagePercentages: string[] = [];
        if (manualOverrides.stageDepositPercent) stagePercentages.push(`Deposit: ${manualOverrides.stageDepositPercent}%`);
        if (manualOverrides.stageSlabPercent) stagePercentages.push(`Slab: ${manualOverrides.stageSlabPercent}%`);
        if (manualOverrides.stageFramePercent) stagePercentages.push(`Frame: ${manualOverrides.stageFramePercent}%`);
        if (manualOverrides.stageLockupPercent) stagePercentages.push(`Lockup: ${manualOverrides.stageLockupPercent}%`);
        if (manualOverrides.stageFixingPercent) stagePercentages.push(`Fixing: ${manualOverrides.stageFixingPercent}%`);
        if (manualOverrides.stageCompletionPercent) stagePercentages.push(`Completion: ${manualOverrides.stageCompletionPercent}%`);
        if (stagePercentages.length > 0) {
          overrideLines.push(`Construction Stage Payment Schedule: ${stagePercentages.join(', ')}`);
        }
        
        // Construction Schedule Preset Mode
        if (manualOverrides.schedulePreset) {
          const presetDescriptions: Record<string, string> = {
            'rapid': 'Rapid Front-Load (accelerated early stages)',
            'even': 'Even Distribution (equal monthly spread)',
            'custom': 'Custom Timing (user-defined month positions)'
          };
          overrideLines.push(`Construction Schedule Mode: ${presetDescriptions[manualOverrides.schedulePreset] || manualOverrides.schedulePreset}`);
        }
        
        // Custom Stage Months (when custom schedule preset is used)
        if (manualOverrides.schedulePreset === 'custom' && manualOverrides.customStageMonths) {
          const stageNames = ['Deposit', 'Slab', 'Frame', 'Lockup', 'Fixing', 'Completion'];
          const stageTiming: string[] = [];
          for (const [index, month] of Object.entries(manualOverrides.customStageMonths)) {
            const stageName = stageNames[parseInt(index)] || `Stage ${index}`;
            stageTiming.push(`${stageName}: Month ${month}`);
          }
          if (stageTiming.length > 0) {
            overrideLines.push(`Custom Stage Timing: ${stageTiming.join(', ')}`);
          }
        }
      }
      
      if (overrideLines.length > 0) {
        const overridesSection = `
---
**PRE-GENERATION MANUAL OVERRIDES (USE THESE VALUES EXACTLY):**

The following values have been manually specified by the user. Use these EXACT values in your calculations and report - do NOT estimate or override these with AI-fetched data:

${overrideLines.join('\n')}

**IMPORTANT:** These manual overrides take precedence over any data fetched from external sources. Apply them directly to all financial calculations, projections, and cost analyses.

---

`;
        prompt = overridesSection + prompt;
        console.log(`✓ Manual overrides injected (${overrideLines.length} values). New prompt length:`, prompt.length);
      }
      
      // If capital growth was NOT manually overridden, instruct Perplexity to dynamically research it
      if (!manualOverrides.capitalGrowth) {
        const capitalGrowthResearchInstruction = `
---
**CAPITAL GROWTH RATE - REQUIRED RESEARCH:**

The capital growth rate was NOT provided by the user. You MUST:
1. Research and fetch the historical capital growth rate for this specific suburb/area
2. Use reliable sources like CoreLogic, PropTrack, Domain, or local council data
3. Calculate an appropriate capital growth projection based on:
   - Historical 5-10 year median price trends for the suburb
   - Current market conditions and growth trajectory
   - Comparison to broader metropolitan/regional averages
4. Cite the source and timeframe of your capital growth data
5. Use this researched value in ALL financial calculations and 10-year projections

DO NOT default to 0% or any arbitrary value. The capital growth rate is critical for accurate investment analysis.

---

`;
        prompt = capitalGrowthResearchInstruction + prompt;
        console.log('✓ Capital growth research instruction injected (no manual override provided)');
      }
    } else {
      console.log('ℹ️ No manual overrides provided');
      
      // When no overrides at all, still instruct Perplexity to research capital growth
      const capitalGrowthResearchInstruction = `
---
**CAPITAL GROWTH RATE - REQUIRED RESEARCH:**

No capital growth rate was provided. You MUST research and determine an appropriate capital growth rate for this property's suburb/area:
1. Fetch historical capital growth data from CoreLogic, PropTrack, Domain, or similar reliable sources
2. Analyze 5-10 year median price trends for the suburb
3. Consider current market conditions and growth trajectory
4. Use this researched value in ALL financial calculations and 10-year projections
5. Cite your source and the timeframe of the data

DO NOT default to 0% or any arbitrary value. The capital growth rate is critical for accurate investment analysis.

---

`;
      prompt = capitalGrowthResearchInstruction + prompt;
      console.log('✓ Capital growth research instruction injected (no overrides provided)');
    }

    // ========== DIRECT TEMPLATE INJECTION (Hard Enforced) ==========
    // Fetch AI structure template directly from database - bypasses RAG similarity search
    let templateContext = '';
    try {
      console.log('🔍 Fetching AI structure template directly from database...');
      
      // Map frontend tier names to database tier names
      // Frontend sends 'briefing' but database stores 'executive'
      const rawTier = propertyDetails?.reportTier || 'compass';
      const tierMapping: Record<string, string> = {
        'briefing': 'executive',  // Executive Briefing tier mapping
        'compass': 'compass',     // Investor Compass
        'snapshot': 'snapshot',   // Suburb Snapshot
        'executive': 'executive', // Direct match (in case already mapped)
      };
      const reportTier = tierMapping[rawTier] || rawTier;
      const reportCategory = reportScope === 'suburb' ? 'suburb_snapshot' : 'investment';
      
      console.log(`📋 Tier mapping: "${rawTier}" → "${reportTier}"`);
      
      // Query report_structure_templates directly for the matching template
      const templateClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      // First try to find a template matching the specific tier and category
      let { data: templates, error: templateError } = await templateClient
        .from('report_structure_templates')
        .select('id, name, parsed_content, report_tier, report_category')
        .eq('template_type', 'ai_structure')
        .eq('is_active', true)
        .order('priority', { ascending: false });
      
      if (templateError) {
        console.log('⚠️ Template query error:', templateError.message);
      } else if (templates && templates.length > 0) {
        // Find best matching template: exact match > tier match > category match > any active
        let selectedTemplate = templates.find(t => 
          t.report_tier === reportTier && t.report_category === reportCategory
        ) || templates.find(t => 
          t.report_tier === reportTier && !t.report_category
        ) || templates.find(t => 
          !t.report_tier && t.report_category === reportCategory
        ) || templates.find(t => 
          !t.report_tier && !t.report_category
        ) || templates[0]; // Fallback to highest priority
        
        if (selectedTemplate?.parsed_content) {
          templateContext = selectedTemplate.parsed_content;
          console.log(`✓ Template loaded: "${selectedTemplate.name}"`);
          console.log(`  Tier: ${selectedTemplate.report_tier || 'any'}, Category: ${selectedTemplate.report_category || 'any'}`);
          console.log(`  Content size: ${templateContext.length} chars`);
          
          // ========== DYNAMIC SECTION PARSING ==========
          // Parse the template to extract section headings and update REPORT_SECTIONS
          console.log('\n📋 Parsing template structure...');
          const parsedStructure = parseTemplateStructure(
            templateContext,
            selectedTemplate.name,
            selectedTemplate.id
          );
          
          if (parsedStructure.sections.length > 0) {
            // Update the global REPORT_SECTIONS with dynamically parsed sections
            REPORT_SECTIONS = parsedStructure.sections;
            console.log(`✓ REPORT_SECTIONS updated with ${REPORT_SECTIONS.length} sections from template`);
            console.log(`  Template headings found: ${parsedStructure.headings.length}`);
          } else {
            console.log('⚠️ Template parsing returned no sections, using DEFAULT_REPORT_SECTIONS');
            REPORT_SECTIONS = [...DEFAULT_REPORT_SECTIONS];
          }
          // ========== END DYNAMIC SECTION PARSING ==========
          
        } else {
          console.log('⚠️ Template found but parsed_content is empty');
          console.log('  Using DEFAULT_REPORT_SECTIONS as fallback');
          REPORT_SECTIONS = [...DEFAULT_REPORT_SECTIONS];
        }
      } else {
        console.log('ℹ️ No active AI structure templates found in database');
        console.log('  Using DEFAULT_REPORT_SECTIONS as fallback');
        REPORT_SECTIONS = [...DEFAULT_REPORT_SECTIONS];
      }
    } catch (templateError: any) {
      console.log('⚠️ Template fetch failed (non-critical):', templateError?.message || 'Unknown error');
      console.log('  Using DEFAULT_REPORT_SECTIONS as fallback');
      REPORT_SECTIONS = [...DEFAULT_REPORT_SECTIONS];
    }

    // Inject template context into prompt if available
    if (templateContext) {
      const templateSection = `
---
**REFERENCE TEMPLATE STRUCTURE (Follow this structure closely):**

The following is extracted from your reference templates. Use this structure and formatting as a guide for generating the report:

${templateContext}

---

`;
      prompt = templateSection + prompt;
      console.log('✓ Template context injected into prompt. New length:', prompt.length);
    }
    // ========== END RAG TEMPLATE CONTEXT INJECTION ==========
    
    const systemMessage = reportScope === 'suburb' 
      ? 'You are an expert Australian suburb analyst with deep knowledge of property markets, demographics, infrastructure, and investment potential across Australian suburbs. Your role is to provide comprehensive, data-driven suburb-level analysis that helps investors understand market dynamics, growth potential, and investment opportunities in specific suburbs. Always include specific numbers, percentages, and statistics in your analysis. Focus on suburb-wide trends, amenities, and characteristics rather than individual properties.'
      : 'You are an expert Australian property investment analyst for Naidu Property Consulting Services. You produce comprehensive, professional-grade investment reports following strict template structures. Every section is MANDATORY - do not skip any. Use extensive markdown tables for data presentation. Include detailed bullet points with explanations. Never use placeholders like "N/A" or "XX" - provide real data or realistic estimates. Use the EXACT expense values provided in the PRE-CALCULATED ANNUAL COSTS section - do not substitute with defaults. This is a premium client-facing report - be thorough, professional, and data-driven.';

    console.log('=== MULTI-SECTION REPORT GENERATION ===');
    console.log('Report scope:', reportScope);
    console.log('Base prompt length:', prompt.length);
    console.log('Document content included:', !!documentContent);
    console.log('Template context included:', !!templateContext);
    console.log('Content source:', contentSource);
    console.log('Continuation mode:', isContinuation);
    console.log('Completed sections to skip:', completedSectionIndices);
    console.log('Generating report in', REPORT_SECTIONS.length, 'sections...');

    // Generate report in multiple sections
    let combinedContent = '';
    let allCitations: any[] = [];
    let generationErrors: string[] = [];
    
    // Handle continuation mode: start with existing content if available
    if (isContinuation && existingReportContent && existingReportContent.length > 0) {
      combinedContent = existingReportContent;
      console.log('🔄 Starting from existing content:', combinedContent.length, 'chars');
      
      // Ensure content ends with proper separator for appending new sections
      if (!combinedContent.trim().endsWith('---')) {
        combinedContent = combinedContent.trim() + '\n\n---\n\n';
      }
    } else {
      // Fresh generation: Add report header
      const reportHeader = `# NAIDU PROPERTY CONSULTING SERVICES

YOUR DEDICATED PROPERTY PARTNER

# Investment Report: ${formattedInput}

---

`;
      combinedContent = reportHeader;
    }

    // Track section quality for final validation
    const sectionResults: Array<{ id: string; name: string; content: string; valid: boolean; score: number; attempts: number }> = [];
    
    for (let i = 0; i < REPORT_SECTIONS.length; i++) {
      const sectionDef = REPORT_SECTIONS[i];
      
      // CONTINUATION MODE: Skip already-completed sections
      if (isContinuation && completedSectionIndices.includes(i)) {
        console.log(`\n⏭️ Skipping section ${i + 1}/${REPORT_SECTIONS.length}: ${sectionDef.name} (already complete)`);
        sectionResults.push({
          id: sectionDef.id,
          name: sectionDef.name,
          content: '[Retained from previous generation]',
          valid: true,
          score: 100,
          attempts: 0
        });
        continue;
      }
      
      console.log(`\n📄 Generating section ${i + 1}/${REPORT_SECTIONS.length}: ${sectionDef.name}`);
      
      // Pass context from previous sections for consistency
      const previousContext = combinedContent.length > 500 ? combinedContent.substring(combinedContent.length - 2000) : '';
      
      // === SECTION GENERATION WITH VALIDATION AND RETRY ===
      let bestContent = '';
      let bestScore = 0;
      let sectionAttempts = 0;
      const maxSectionAttempts = 2; // Retry once if content is insufficient
      
      for (let attempt = 1; attempt <= maxSectionAttempts; attempt++) {
        sectionAttempts = attempt;
        
        const result = await generateReportSection(
          sectionDef,
          prompt,
          systemMessage,
          perplexityApiKey,
          previousContext,
          formattedInput,
          enhancedData
        );
        
        if (result.error) {
          console.error(`⚠️ Section ${sectionDef.name} attempt ${attempt} failed:`, result.error);
          if (attempt === maxSectionAttempts) {
            generationErrors.push(`${sectionDef.name}: ${result.error}`);
          }
          continue;
        }
        
        if (result.content) {
          // Clean the content
          let cleanContent = result.content
            .replace(/^(Here|I will|Let me|Now|The following).*?:\s*/im, '')
            .replace(/^(Certainly|Sure|Of course).*?\n/im, '')
            .trim();
          
          // Validate section content
          const validation = validateSectionContent(sectionDef, cleanContent);
          console.log(`📊 Section ${sectionDef.name} validation (attempt ${attempt}):`, {
            contentLength: cleanContent.length,
            minRequired: sectionDef.minContentLength,
            score: validation.score,
            isValid: validation.isValid,
            issues: validation.issues.length > 0 ? validation.issues : 'None'
          });
          
          // Keep the best attempt
          if (validation.score > bestScore) {
            bestContent = cleanContent;
            bestScore = validation.score;
            allCitations = [...allCitations, ...result.citations];
          }
          
          // If valid, no need to retry
          if (validation.isValid) {
            console.log(`✓ Section ${sectionDef.name} passed validation with score ${validation.score}`);
            break;
          } else if (attempt < maxSectionAttempts) {
            console.log(`⚠️ Section ${sectionDef.name} below threshold (score: ${validation.score}), retrying...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
          }
        }
      }
      // === END SECTION GENERATION WITH VALIDATION ===
      
      // Use best content from all attempts
      if (bestContent) {
        combinedContent += bestContent + '\n\n---\n\n';
        
        sectionResults.push({
          id: sectionDef.id,
          name: sectionDef.name,
          content: bestContent,
          valid: bestScore >= 60,
          score: bestScore,
          attempts: sectionAttempts
        });
        
        // === PROGRESSIVE SAVE: Save after each section ===
        // CRITICAL: Save last_completed_section for reliable resume functionality
        if (reportId && supabaseClient) {
          try {
            const completedSectionIndex = i + 1; // Section i is now complete (0-indexed to 1-indexed)
            console.log(`💾 Progressive save after section ${completedSectionIndex}/${REPORT_SECTIONS.length}...`);
            
            // Build progressive update payload
            const progressiveUpdatePayload: any = {
              report_content: combinedContent,
              last_completed_section: completedSectionIndex,
              updated_at: new Date().toISOString()
            };
            
            // CRITICAL: Save enhanced data (including investment_score) on FIRST section completion
            // This ensures scores are persisted early, even if chunked generation is interrupted
            if (completedSectionIndex === 1 && enhancedData) {
              console.log('📊 First section complete - saving enhanced data to DB...');
              if (enhancedData.investmentScore) {
                progressiveUpdatePayload.investment_score = enhancedData.investmentScore;
                console.log('  ✓ Saving investment_score:', enhancedData.investmentScore?.grade, enhancedData.investmentScore?.totalScore);
              }
              if (enhancedData.financials) {
                progressiveUpdatePayload.financial_calculations = enhancedData.financials;
                console.log('  ✓ Saving financial_calculations');
              }
              if (enhancedData.demographics) {
                progressiveUpdatePayload.demographics_data = enhancedData.demographics;
                console.log('  ✓ Saving demographics_data');
              }
              if (enhancedData.economics) {
                progressiveUpdatePayload.economic_data = enhancedData.economics;
                console.log('  ✓ Saving economic_data');
              }
              if (enhancedData.locationIntelligence) {
                progressiveUpdatePayload.location_intelligence = enhancedData.locationIntelligence;
                console.log('  ✓ Saving location_intelligence');
              }
              // CRITICAL: Save investment_score in progressive updates to prevent data loss in chunked mode
              if (enhancedData.investmentScore) {
                progressiveUpdatePayload.investment_score = enhancedData.investmentScore;
                console.log('  ✓ Saving investment_score');
              }
            }
            
            await supabaseClient
              .from('investment_reports')
              .update(progressiveUpdatePayload)
              .eq('id', reportId);
            console.log(`✓ Progress saved: ${combinedContent.length} chars, last_completed_section=${completedSectionIndex}`);
            
            // === SINGLE-SECTION MODE: Return immediately after saving one section ===
            // This allows the frontend to call again for the next section, avoiding platform timeouts
            if (isSingleSectionMode) {
              const isFullyComplete = completedSectionIndex >= REPORT_SECTIONS.length;
              console.log(`🔧 Single-section mode: Completed section ${completedSectionIndex}/${REPORT_SECTIONS.length}`);
              
              if (!isFullyComplete) {
                // Return immediately - UI will call again for next section
                return new Response(JSON.stringify({
                  success: true,
                  message: `Section ${completedSectionIndex}/${REPORT_SECTIONS.length} completed`,
                  sectionCompleted: completedSectionIndex,
                  totalSections: REPORT_SECTIONS.length,
                  isComplete: false,
                  contentLength: combinedContent.length
                }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
              // If all sections complete, continue to post-processing below
              console.log('✅ All sections complete in single-section mode, proceeding to finalization...');
            }
            // === END SINGLE-SECTION MODE ===
          } catch (saveError: any) {
            console.warn(`⚠️ Progressive save failed (non-blocking):`, saveError?.message);
          }
        }
        // === END PROGRESSIVE SAVE ===
      } else {
        // No content generated for this section at all - still save progress
        sectionResults.push({
          id: sectionDef.id,
          name: sectionDef.name,
          content: '',
          valid: false,
          score: 0,
          attempts: sectionAttempts
        });
        
        // === PROGRESSIVE SAVE ON FAILURE: Save current state even if section failed ===
        // This allows continuation from last successful section
        // Note: last_completed_section is NOT incremented on failure (keeps last good value)
        if (reportId && supabaseClient && combinedContent.length > 0) {
          try {
            console.log(`💾 Progressive save after section ${i + 1} failure (preserving progress)...`);
            await supabaseClient
              .from('investment_reports')
              .update({
                report_content: combinedContent,
                // Don't update last_completed_section - it should stay at the last successfully completed section
                updated_at: new Date().toISOString(),
                error_message: `Section ${sectionDef.name} failed to generate after ${sectionAttempts} attempts`
              })
              .eq('id', reportId);
            console.log(`✓ Progress preserved: ${combinedContent.length} chars before failed section (last_completed_section unchanged)`);
          } catch (saveError: any) {
            console.warn(`⚠️ Failed section save error (non-blocking):`, saveError?.message);
          }
        }
      }
      
      // Adaptive delay between sections to avoid rate limiting
      // Use jitter to prevent thundering herd
      if (i < REPORT_SECTIONS.length - 1) {
        const baseDelay = 500;
        const jitter = Math.random() * 500; // 0-500ms jitter
        await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
      }
    }
    
    // === FINAL VALIDATION SUMMARY ===
    const totalScore = sectionResults.reduce((sum, s) => sum + s.score, 0);
    const avgScore = Math.round(totalScore / sectionResults.length);
    const invalidSections = sectionResults.filter(s => !s.valid);
    
    console.log('\n📊 === REPORT GENERATION QUALITY SUMMARY ===');
    console.log(`Total content length: ${combinedContent.length} chars`);
    console.log(`Average section score: ${avgScore}/100`);
    console.log(`Sections passed: ${sectionResults.filter(s => s.valid).length}/${sectionResults.length}`);
    
    if (invalidSections.length > 0) {
      console.log('⚠️ Sections with quality issues:');
      invalidSections.forEach(s => {
        console.log(`  - ${s.name}: score ${s.score}, ${s.content.length} chars, ${s.attempts} attempts`);
      });
    }
    
    // Store quality metadata for debugging
    const qualityMetadata = {
      generatedAt: new Date().toISOString(),
      totalContentLength: combinedContent.length,
      averageScore: avgScore,
      sectionScores: sectionResults.map(s => ({ id: s.id, name: s.name, score: s.score, valid: s.valid, attempts: s.attempts })),
      invalidSectionCount: invalidSections.length,
      errorsEncountered: generationErrors.length
    };
    console.log('📋 Quality metadata:', JSON.stringify(qualityMetadata));
    // === END FINAL VALIDATION ===

    // Enhanced content validation with stricter minimum threshold
    const MINIMUM_TOTAL_CONTENT = 45000; // Based on analysis of good reports (50k+ chars)
    
    if (combinedContent.length < 5000) {
      const errorMsg = `Report generation produced insufficient content (${combinedContent.length} chars). Errors: ${generationErrors.join('; ')}`;
      console.error('❌', errorMsg);
      await markReportFailed(reportId, errorMsg);
      return new Response(JSON.stringify({ 
        error: errorMsg,
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Warn if content is below ideal threshold but still usable
    if (combinedContent.length < MINIMUM_TOTAL_CONTENT) {
      console.warn(`⚠️ Report content (${combinedContent.length} chars) is below ideal threshold (${MINIMUM_TOTAL_CONTENT} chars)`);
      console.warn(`   This may result in fewer pages. Average score: ${avgScore}/100`);
      // Add a validation flag for low content
      generationErrors.push(`Content below ideal threshold: ${combinedContent.length} chars (recommended: ${MINIMUM_TOTAL_CONTENT}+)`);
    }

    console.log(`\n✓ Multi-section generation complete`);
    console.log(`  Total content length: ${combinedContent.length} chars`);
    console.log(`  Total citations: ${allCitations.length}`);
    console.log(`  Sections with errors: ${generationErrors.length}`);
    console.log(`  Quality assessment: ${avgScore >= 70 ? '✅ Good' : avgScore >= 50 ? '⚠️ Acceptable' : '❌ Below Standard'}`);


    let reportContent = combinedContent;
    
    // ========== DEDUPLICATE HEADERS ==========
    // The AI sometimes generates duplicate company headers and report titles
    // This removes all occurrences except the first one
    console.log('🧹 Deduplicating headers from report content...');
    
    // Helper function to remove duplicate header patterns
    const deduplicateHeaders = (content: string): string => {
      // Patterns to deduplicate (keep only first occurrence)
      const headerPatterns = [
        // Company name header (with # or without)
        /^#?\s*NAIDU PROPERTY CONSULTING SERVICES\s*$/gim,
        // Company slogan
        /^YOUR DEDICATED PROPERTY PARTNER\s*$/gim,
        // Investment Report title (with # or without, captures the address)
        /^#?\s*Investment Report:\s*.+$/gim,
      ];
      
      let result = content;
      
      for (const pattern of headerPatterns) {
        // Find all matches
        const matches = result.match(pattern);
        if (matches && matches.length > 1) {
          console.log(`  Found ${matches.length} occurrences of pattern, keeping first only`);
          // Keep only the first occurrence by replacing subsequent ones
          let count = 0;
          result = result.replace(pattern, (match) => {
            count++;
            return count === 1 ? match : '';
          });
        }
      }
      
      // Clean up excessive newlines and separators left after removal
      result = result
        .replace(/\n{4,}/g, '\n\n\n') // Max 3 consecutive newlines
        .replace(/(\n---\s*){2,}/g, '\n---\n') // Remove duplicate separators
        .replace(/^\s*---\s*\n\s*---/gm, '---') // Clean adjacent separators
        .trim();
      
      return result;
    };
    
    const beforeDedup = reportContent.length;
    reportContent = deduplicateHeaders(reportContent);
    const afterDedup = reportContent.length;
    console.log(`✓ Header deduplication complete: ${beforeDedup} → ${afterDedup} chars (removed ${beforeDedup - afterDedup} chars)`);
    // ========== END DEDUPLICATE HEADERS ==========
    
    // Filter out reasoning sections from Sonar Deep Research model
    // Remove content between reasoning markers and thinking blocks
    reportContent = reportContent
      .replace(/```thinking[\s\S]*?```/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/\*\*Reasoning:\*\*[\s\S]*?(?=\*\*|$)/gi, '')
      .replace(/\*\*Analysis:\*\*[\s\S]*?(?=\*\*|$)/gi, '')
      .replace(/\*\*Thought process:\*\*[\s\S]*?(?=\*\*|$)/gi, '')
      .replace(/Let me analyze[\s\S]*?(?=\n\n|\*\*|$)/gi, '')
      .replace(/I need to[\s\S]*?(?=\n\n|\*\*|$)/gi, '')
      .replace(/First, I'll[\s\S]*?(?=\n\n|\*\*|$)/gi, '')
      .replace(/To provide[\s\S]*?(?=\n\n|\*\*|$)/gi, '')
      .trim();

    // ========== POST-PROCESSING SANITIZATION ==========
    // Fix HTML entities that may have been introduced during generation
    reportContent = reportContent
      // Fix common HTML entities
      .replace(/&#x26;/g, '&')
      .replace(/&#x27;/g, "'")
      .replace(/&#x22;/g, '"')
      .replace(/&#x3C;/g, '<')
      .replace(/&#x3E;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      // Fix erroneous semicolons in text
      .replace(/(\w);(\s)/g, '$1,$2')
      // Remove stray page numbers appearing as standalone lines
      .replace(/^\d{1,3}\s*$/gm, '')
      // Remove pagination artifacts like "Page X of Y"
      .replace(/^Page\s+\d+\s*(of\s+\d+)?\s*$/gim, '')
      // Remove empty methodology sections (heading with no content before next heading)
      .replace(/#{2,3}\s*Methodology\s*Notes?\s*\n+(?=#{1,3}\s|\n*$)/gi, '')
      // Clean up excessive whitespace left after removals
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/(\n---\s*){2,}/g, '\n---\n')
      .trim();
    console.log('✓ Post-processing sanitization complete');
    // ========== END POST-PROCESSING SANITIZATION ==========


    // Extract citations and sources from the response
    const citations = allCitations;
    const searchResults: any[] = [];
    
    // Format sources section
    let sourcesContent = '';
    if (citations.length > 0 || searchResults.length > 0) {
      sourcesContent = '\n\n## SOURCES & REFERENCES\n\n';
      
      if (citations.length > 0) {
        sourcesContent += '### Citations:\n';
        // Deduplicate citations
        const uniqueCitations = [...new Set(citations.map((c: any) => c.url || c.title || c))];
        uniqueCitations.forEach((citation: any, index: number) => {
          sourcesContent += `${index + 1}. ${citation}\n`;
        });
        sourcesContent += '\n';
      }
      
      if (searchResults.length > 0) {
        sourcesContent += '### Additional Sources:\n';
        searchResults.forEach((result: any, index: number) => {
          const title = result.title || 'Source';
          const url = result.url || '';
          sourcesContent += `${index + 1}. [${title}](${url})\n`;
        });
      }
    }

    console.log('Report generated successfully, content length:', reportContent.length);
    console.log('Citations found:', citations.length);

    // Validate report structure against schema
    console.log('🔍 Validating report structure...');
    let schemaValidationFlags: any[] = [];
    
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
      
      if (supabaseUrl && supabaseAnonKey) {
        const schemaValidatorClient = createClient(supabaseUrl, supabaseAnonKey);
        
        const { data: schemaValidation, error: schemaError } = await schemaValidatorClient.functions.invoke(
          'report-schema-validator',
          {
            body: { reportContent }
          }
        );
        
        if (schemaError) {
          console.error('Schema validation error:', schemaError);
        } else if (schemaValidation) {
          console.log('✓ Schema validation complete');
          console.log('Schema valid:', schemaValidation.valid);
          console.log('Schema issues found:', schemaValidation.issues?.length || 0);
          
          // Convert schema issues to validation flags
          if (schemaValidation.issues && schemaValidation.issues.length > 0) {
            schemaValidationFlags = schemaValidation.issues.map((issue: any) => ({
              type: 'schema',
              severity: issue.severity || 'medium',
              field: issue.section || 'structure',
              message: issue.message,
              value: issue.details || null
            }));
          }
        }
      }
    } catch (validationError) {
      console.error('Error during schema validation:', validationError);
      // Continue without blocking report generation
    }

    // Update database if reportId provided
    if (reportId && supabaseClient) {
      console.log('Updating report in database with ID:', reportId);
      
      // Prepare property specs from property details
      const propertySpecs = {
        land_size_sqm: propertyDetails?.landSize || null,
        building_size_sqm: propertyDetails?.buildingSize || null,
        bedrooms: propertyDetails?.beds || null,
        bathrooms: propertyDetails?.baths || null,
        parking: propertyDetails?.parking || null,
        year_built: propertyDetails?.yearBuilt || null,
        property_type: standardizedPropertyType || propertyDetails?.propertyType || 'Residential Property',
        zoning: propertyDetails?.zoning || null,
        council_area: propertyDetails?.councilArea || null
      };
      
      // Prepare data sources tracking
      const dataSources = {
        demographics: enhancedData.demographics ? {
          source: 'abs',
          confidence: enhancedData.demographics.data_quality === 'live' ? 1.0 : 0.6,
          timestamp: new Date().toISOString()
        } : null,
        financials: enhancedData.financials ? {
          source: 'calculated',
          confidence: 1.0,
          timestamp: new Date().toISOString()
        } : null,
        marketData: enhancedData.domainData ? {
          source: 'domain',
          confidence: 0.9,
          timestamp: new Date().toISOString()
        } : null,
        locationIntelligence: enhancedData.locationIntelligence ? {
          source: 'google_maps',
          confidence: 0.95,
          timestamp: new Date().toISOString()
        } : null
      };
      
      // Combine financial validation flags with schema validation flags
      const allValidationFlags = [
        ...(enhancedData.validation?.flags || []),
        ...schemaValidationFlags,
        // Add quality-based validation flags
        ...(avgScore < 70 ? [{
          type: 'quality',
          severity: 'warning',
          field: 'content_quality',
          message: `Report quality score (${avgScore}/100) below optimal threshold`,
          value: { avgScore, invalidSections: invalidSections.length }
        }] : []),
        ...(combinedContent.length < 45000 ? [{
          type: 'quality',
          severity: 'info',
          field: 'content_length',
          message: `Report content length (${combinedContent.length} chars) may result in fewer pages`,
          value: { actual: combinedContent.length, recommended: 45000 }
        }] : [])
      ];
      
      // Prepare update object with quality metadata
      const updateData: any = {
        report_content: reportContent,
        sources_content: sourcesContent,
        demographics_data: enhancedData.demographics || null,
        economic_data: enhancedData.economics || null,
        financial_calculations: enhancedData.financials || null,
        investment_score: enhancedData.investmentScore || null,
        location_intelligence: enhancedData.locationIntelligence || null,
        property_specs: propertySpecs,
        validation_flags: allValidationFlags,
        calculation_version: '1.0.0',
        data_sources: {
          ...dataSources,
          // Add generation quality metadata
          _generationQuality: qualityMetadata
        },
        report_scope: reportScope,
        status: 'completed'
      };
      
      // Build initial manual overrides from extracted property data
      // This applies to ALL input methods (manual, URL scrape, PDF upload)
      const extractedOverrides: any = {};
      
      if (propertyDetails?.price) extractedOverrides.purchasePrice = propertyDetails.price;
      if (propertyDetails?.weeklyRent) extractedOverrides.weeklyRent = propertyDetails.weeklyRent;
      if (propertyDetails?.landSizeSqm) extractedOverrides.landSizeSqm = propertyDetails.landSizeSqm;
      if (propertyDetails?.buildSizeSqm) extractedOverrides.buildSizeSqm = propertyDetails.buildSizeSqm;
      if (propertyDetails?.landPrice) extractedOverrides.landPrice = propertyDetails.landPrice;
      if (propertyDetails?.buildPrice) extractedOverrides.buildPrice = propertyDetails.buildPrice;
      if (propertyDetails?.beds) extractedOverrides.bedrooms = propertyDetails.beds;
      if (propertyDetails?.baths) extractedOverrides.bathrooms = propertyDetails.baths;
      if (propertyDetails?.carSpaces) extractedOverrides.carSpaces = propertyDetails.carSpaces;
      if (propertyDetails?.isNewBuild !== undefined) extractedOverrides.isNewBuild = propertyDetails.isNewBuild;
      if (propertyDetails?.buildType) extractedOverrides.buildType = propertyDetails.buildType;
      
      // Merge all overrides: extracted < existing DB < frontend (priority order)
      // Frontend overrides (mergedOverrides already contains frontend + existing DB)
      // Now add extracted overrides as fallback
      const finalOverrides = { ...extractedOverrides, ...mergedOverrides };
      
      if (Object.keys(finalOverrides).length > 0) {
        updateData.manual_overrides = finalOverrides;
        console.log('✓ Final manual_overrides saved:', Object.keys(finalOverrides).length, 'fields');
        console.log('  Fields:', Object.keys(finalOverrides).join(', '));
      }
      
      const { error: updateError } = await supabaseClient
        .from('investment_reports')
        .update(updateData)
        .eq('id', reportId);

      if (updateError) {
        console.error('Error updating report:', updateError);
        throw new Error(`Failed to save report: ${updateError.message}`);
      }
      
      console.log('Report successfully updated in database with validation and property specs');
      
      // Add success notification
      try {
        await supabaseClient
          .from('notifications')
          .insert({
            type: 'report_generation_completed',
            title: 'Report Generated',
            message: `Investment report for ${propertyAddress} is ready to view`,
            report_id: reportId,
            entity_id: reportId,
            read: false
          });
        console.log('✓ Success notification created');
      } catch (notifError) {
        console.error('Failed to create notification:', notifError);
        // Don't throw - notification failure shouldn't block report completion
      }
      
      // Log data quality score
      if (enhancedData.validation) {
        console.log('📊 Report Quality Score:', enhancedData.validation.qualityScore, '/100');
      }
    }

    console.log('Report generation complete, returning response');

    // Return successful response
    const responseData = { 
      reportContent,
      sourcesContent,
      propertyAddress,
      success: true,
      enhancedData: {
        locationIntelligence: enhancedData.locationIntelligence,
        investmentScore: enhancedData.investmentScore,
        financials: enhancedData.financials,
        demographics: enhancedData.demographics,
        economics: enhancedData.economics,
        schoolData: enhancedData.schoolData
      }
    };

    console.log('Returning successful response');
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error('Error in generate-investment-report function:', error);
    console.error('Error stack:', error?.stack);
    
    // Update report status to failed if reportId provided
    if (requestBody?.reportId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (supabaseUrl && supabaseKey) {
          const supabaseClient = createClient(supabaseUrl, supabaseKey);
          await supabaseClient
            .from('investment_reports')
            .update({ 
              status: 'failed',
              error_message: error?.message || 'An unexpected error occurred'
            })
            .eq('id', requestBody.reportId);
          
          // Add failure notification
          await supabaseClient
            .from('notifications')
            .insert({
              type: 'report_generation_failed',
              title: 'Report Generation Failed',
              message: `Failed to generate report: ${error?.message || 'Unknown error'}`,
              report_id: requestBody.reportId,
              entity_id: requestBody.reportId,
              read: false
            });
          
          console.log('Updated report status to failed');
        }
      } catch (updateError) {
        console.error('Error updating report status to failed:', updateError);
      }
    }
    
    const errorResponse = { 
      error: error?.message || 'An unexpected error occurred',
      success: false,
      timestamp: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});