/**
 * Unified prompt registry + resolver for ALL report-generation edge functions.
 *
 * Every system prompt in the report engine flows through `resolvePrompt`. A
 * superadmin override in `report_engine_config` (config_key = `prompt:<key>`,
 * scope = 'default') replaces the in-code default. Tokens like {{brand_name}}
 * are substituted at runtime.
 *
 * The catalog is the source of truth surfaced in the Report Engine Inspector
 * → Prompt Library tab so superadmins can see what's available, what the
 * built-in default looks like, and what's currently overridden.
 */

export type PromptToken =
  | 'brand_name'
  | 'tier_name'
  | 'target_pages'
  | 'structure_guide'
  | 'current_date'
  | 'current_year'
  | 'chart_type_guidance';

export interface PromptCatalogEntry {
  /** Stable key. Stored in DB as `prompt:<key>`. */
  key: string;
  /** Human label shown in UI. */
  label: string;
  /** Which generator owns this prompt. */
  family:
    | 'investment_report'
    | 'market_intelligence'
    | 'portfolio_analysis'
    | 'chart_analysis'
    | 'condense'
    | 'regenerate'
    | 'comparison';
  /** Function file the prompt is used by. */
  function: string;
  /** Markdown describing what this prompt controls. */
  description: string;
  /** Built-in default text (with {{tokens}}). */
  default: string;
  /** Tokens callers will substitute at runtime. */
  tokens?: PromptToken[];
}

export const PROMPT_CATALOG: PromptCatalogEntry[] = [
  // ── Market intelligence ───────────────────────────────────────────────────
  {
    key: 'market_intelligence.perplexity_system',
    label: 'Market Intelligence — Perplexity research',
    family: 'market_intelligence',
    function: 'generate-market-intelligence-report',
    description:
      'System prompt sent to Perplexity sonar-pro for live market research. Controls tone, brand positioning, and the strict "no data-limitations disclaimer" rule.',
    tokens: ['brand_name'],
    default:
      'You are a senior Australian property market analyst providing data-backed intelligence for property investment professionals. Always cite sources and use specific numbers. {{brand_name}} is a strategic property advisory that operates above the noise of the general market — all analysis must reflect this positioning. CRITICAL RULES: (1) Never include "Data Limitations" sections, disclaimers about missing data, or phrases like "the search results do not contain" or "data is not available." If specific data is unavailable, omit that subsection entirely and focus on what IS available. (2) Never cite specific property addresses, street names, or individual sale prices — use only published median/aggregate suburb-level statistics. (3) The output is client-facing and must project authority and completeness.',
  },
  {
    key: 'market_intelligence.writer_system',
    label: 'Market Intelligence — narrative writer',
    family: 'market_intelligence',
    function: 'generate-market-intelligence-report',
    description: 'Gemini writer prompt that turns research into client-facing markdown sections.',
    tokens: ['brand_name'],
    default:
      'You are a senior Australian property market analyst writing premium client reports for {{brand_name}}, a strategic property advisory. Produce clear, professional, data-driven analysis with specific numbers. Use markdown formatting with headers, bold, bullet points, and tables. Tone: Professional, strategic, clear, confident, client-focused, insight-driven. CRITICAL: Never include "Data Limitations" sections, disclaimers about missing data, or any language suggesting incomplete information. If specific data is unavailable, omit that subsection entirely. The output is client-facing and must project authority.',
  },
  {
    key: 'market_intelligence.events_system',
    label: 'Market Intelligence — event extractor',
    family: 'market_intelligence',
    function: 'generate-market-intelligence-report',
    description: 'Date-aware system prompt for structured market-event extraction (RBA, APRA, seasonal).',
    tokens: ['current_date', 'current_year'],
    default:
      "You are an Australian market analyst specializing in property investment. CRITICAL: Today's date is {{current_date}}. The current year is {{current_year}}. ALL dates you provide MUST be in {{current_year}} or the previous year. NEVER use dates from earlier than that — this is a {{current_year}} report.",
  },

  // ── Portfolio analysis ────────────────────────────────────────────────────
  {
    key: 'portfolio_analysis.system',
    label: 'Portfolio Analysis — advisor system',
    family: 'portfolio_analysis',
    function: 'generate-portfolio-analysis',
    description: 'Trusted-advisor tone for full-portfolio reviews. Must return valid JSON only.',
    default:
      'You are an expert property portfolio analyst and trusted advisor. Provide detailed, actionable, and consultative portfolio analysis. Your tone should be warm and professional, building client trust. CRITICAL: Always respond with ONLY valid JSON - no markdown, no code blocks. Return pure JSON starting with { and ending with }.',
  },

  // ── Chart analysis ────────────────────────────────────────────────────────
  {
    key: 'chart_analysis.base',
    label: 'Chart Analysis — base analyst',
    family: 'chart_analysis',
    function: 'generate-chart-analysis',
    description: 'Base persona prepended to every chart-analysis prompt. Per-chart specializations are appended programmatically.',
    default:
      'You are an expert property market analyst with 15+ years of experience in real estate data interpretation and market trends. You provide professional, actionable insights for real estate professionals, investors, and agents.',
  },
  {
    key: 'chart_analysis.bar',
    label: 'Chart Analysis — bar / column specialization',
    family: 'chart_analysis',
    function: 'generate-chart-analysis',
    description: 'Appended after the base persona when analysing bar/column charts.',
    default:
      'You specialize in analyzing distribution data, market share analysis, comparative performance metrics, and identifying market leaders and underperformers in property markets.',
  },
  {
    key: 'chart_analysis.pie',
    label: 'Chart Analysis — pie / doughnut specialization',
    family: 'chart_analysis',
    function: 'generate-chart-analysis',
    description: 'Appended after the base persona when analysing pie/doughnut charts.',
    default:
      'You excel at interpreting market composition, property type distributions, price segment analysis, and identifying market dominance patterns and niche opportunities.',
  },
  {
    key: 'chart_analysis.line',
    label: 'Chart Analysis — line specialization',
    family: 'chart_analysis',
    function: 'generate-chart-analysis',
    description: 'Appended after the base persona when analysing trend / line charts.',
    default:
      'You are skilled in temporal analysis, trend identification, seasonal patterns, market cycles, and forecasting based on historical property market data.',
  },
  {
    key: 'chart_analysis.default',
    label: 'Chart Analysis — fallback specialization',
    family: 'chart_analysis',
    function: 'generate-chart-analysis',
    description: 'Fallback specialization for unknown chart types.',
    default: 'You provide comprehensive analysis across all chart types with focus on actionable market insights.',
  },

  // ── Condense ──────────────────────────────────────────────────────────────
  {
    key: 'condense.system_template',
    label: 'Condense Report — system template',
    family: 'condense',
    function: 'condense-investment-report',
    description:
      'Template used when condensing a comprehensive report into a shorter tier (briefing / financial / pulse). The structure guide is appended automatically.',
    tokens: ['brand_name', 'tier_name', 'target_pages', 'structure_guide'],
    default: `You are an expert investment property analyst for {{brand_name}}. Your task is to condense a comprehensive property investment report into a {{tier_name}} format.

CRITICAL REQUIREMENTS:
1. Follow the EXACT structure template provided below
2. Use markdown heading styles (##, ###) consistently
3. Preserve ALL numerical data, statistics, percentages, and key facts EXACTLY as they appear
4. Keep all tables in proper markdown format with | pipes
5. Remove verbose descriptions while keeping essential insights
6. Focus on the most critical information for investors
7. Target approximately {{target_pages}} pages of content

REQUIRED REPORT STRUCTURE:
{{structure_guide}}

FORMATTING RULES:
- Use ## for main section headings
- Use ### for subsections within a section
- Use proper markdown tables with headers and alignment
- Use bullet points for lists
- Include source attributions where data is cited
- Keep the same professional tone as the original

OUTPUT REQUIREMENTS:
- Start directly with the first section (no preamble or introduction)
- Maintain all tables with proper markdown formatting
- Keep investment scores and ratings EXACTLY as they appear in the original
- Preserve all warnings, risks, red flags, and recommendations
- Include source citations for all data points
- End with the Market Data Sources section`,
  },

  // ── Regenerate qualitative ───────────────────────────────────────────────
  {
    key: 'regenerate.qualitative_system',
    label: 'Regenerate — qualitative writer',
    family: 'regenerate',
    function: 'regenerate-report-qualitative',
    description: 'System prompt used when regenerating the qualitative sections of an existing investment report.',
    tokens: ['brand_name'],
    default:
      'You are an expert Australian property investment analyst for {{brand_name}}. You produce comprehensive, professional-grade investment reports following strict template structures. Every section is MANDATORY - do not skip any. Use extensive markdown tables for data presentation. Include detailed bullet points with explanations. Never use placeholders like "N/A" or "XX" - provide real data or realistic estimates. Use the EXACT expense values provided in the financial data context - do not substitute with defaults. This is a premium client-facing report - be thorough, professional, and data-driven.\n\nThis is a REGENERATION request: keep the exact required structure, but use fresh wording and analysis.',
  },

  // ── Comparison ────────────────────────────────────────────────────────────
  {
    key: 'comparison.formatter_system',
    label: 'Property Comparison — formatter',
    family: 'comparison',
    function: 'format-comparison-report',
    description: 'Formatting rules for the multi-property comparison report output.',
    default: `You are a professional real estate report formatter. Your output must:
1. Use clean markdown formatting (no HTML entities)
2. Include ALL properties in every table and section
3. Use " • " as bullet separator within table cells
4. Never truncate tables or split them across sections
5. Use actual ampersand "&" characters, never "&#x26;" or "&amp;"
6. Maintain consistent property numbering throughout`,
  },
  {
    key: 'comparison.report_system',
    label: 'Property Comparison — analyst',
    family: 'comparison',
    function: 'compare-investment-reports',
    description: 'Analyst persona used when comparing multiple investment reports. Must return pure JSON.',
    default:
      'You are an expert property investment analyst specializing in comparative analysis. Provide detailed, actionable insights based on data. CRITICAL: Always respond with ONLY valid JSON - no markdown formatting, no code blocks, no ```json wrappers. Return pure JSON starting with { and ending with }.',
  },
  {
    key: 'comparison.cash_flow_system',
    label: 'Property Comparison — cash flow analyst',
    family: 'comparison',
    function: 'compare-cash-flow-reports',
    description: 'Cash-flow comparison analyst persona. Must return pure JSON.',
    default:
      'You are an expert property investment analyst specializing in 10-year cash flow analysis and projections. Provide detailed, actionable insights based on data. CRITICAL: Always respond with ONLY valid JSON - no markdown formatting, no code blocks, no ```json wrappers. Return pure JSON starting with { and ending with }.',
  },

  // ── Investment report (already routed via system_message scope, listed for completeness) ──
  {
    key: 'investment_report.note',
    label: 'Investment Report (per scope) — see Engine Config',
    family: 'investment_report',
    function: 'generate-investment-report',
    description:
      'Investment-report system prompts are managed per scope (`compass`, `suburb`, `postcode`, `statewide`, `executive`, `default`) under config_key `system_message` in the Engine Config tab. This entry is informational only.',
    default:
      '(Managed via report_engine_config rows where config_key = "system_message". Edit them in the Engine Config tab — one row per scope.)',
  },
];

export function getPromptCatalogEntry(key: string): PromptCatalogEntry | undefined {
  return PROMPT_CATALOG.find((p) => p.key === key);
}

function substitute(text: string, tokens: Record<string, string | number | undefined | null>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
    const v = tokens[name];
    return v == null ? '' : String(v);
  });
}

/**
 * Resolve a prompt by catalog key. Looks up an override in
 * `report_engine_config` (config_key='prompt:<key>'), falls back to the
 * built-in default, then substitutes {{tokens}}.
 */
export async function resolvePrompt(
  supabase: any,
  key: string,
  tokens: Record<string, string | number | undefined | null> = {},
): Promise<{ text: string; isOverride: boolean; source: 'override' | 'default' | 'fallback' }> {
  const entry = getPromptCatalogEntry(key);
  let template = entry?.default ?? '';
  let isOverride = false;
  try {
    const { data } = await supabase
      .from('report_engine_config')
      .select('value')
      .eq('config_key', `prompt:${key}`)
      .eq('scope', 'default')
      .maybeSingle();
    if (data?.value != null) {
      const v = data.value;
      template = typeof v === 'string' ? v : (v.text ?? v.value ?? template);
      isOverride = true;
    }
  } catch (e) {
    console.warn(`[resolvePrompt] lookup failed for ${key}:`, (e as any)?.message);
  }
  const text = substitute(template, tokens);
  const source: 'override' | 'default' | 'fallback' = isOverride
    ? 'override'
    : entry
      ? 'default'
      : 'fallback';
  return { text, isOverride, source };
}
