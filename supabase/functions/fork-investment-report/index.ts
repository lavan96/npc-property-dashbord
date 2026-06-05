/**
 * fork-investment-report
 * ----------------------
 * Takes a completed composite Investment Report and deterministically produces
 * two derived client-facing reports:
 *
 *   - 'financial'      → Client Investment Feasibility & Financial Performance
 *   - 'due_diligence'  → Property & Location Due Diligence
 *
 * The forks are real `investment_reports` rows linked back to the composite
 * via `derived_from_report_id`. No new LLM calls are made; routing is
 * data-driven via reportSplitRegistry. Idempotent — re-running refreshes
 * existing child rows instead of duplicating them.
 *
 * Request:
 *   { composite_report_id: string; force?: boolean }
 *
 * Response:
 *   { ok: true, financial: { id, ... }, due_diligence: { id, ... } }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuth, createCorsHeaders, createUnauthorizedResponse } from '../_shared/auth.ts';
import {
  routeCompositeSection,
  normaliseStructuralHeading,
  FIN_LENS_PREAMBLE,
  PLDD_LENS_PREAMBLE,
  FIN_FOOTER_DISCLAIMER,
  PLDD_FOOTER_DISCLAIMER,
  FIN_REPORT_TITLE,
  FIN_REPORT_SUBTITLE,
  PLDD_REPORT_TITLE,
  PLDD_REPORT_SUBTITLE,
  FIN_SECTION_ORDER,
  PLDD_SECTION_ORDER,
  type ForkVariant,
  type SplitRoute,
} from '../_shared/reportSplitRegistry.ts';
import { scoreFinancial, scorePropertyFundamentals } from '../_shared/investmentScoreEngine.ts';

interface ParsedSection {
  rawHeading: string;
  normalisedHeading: string;
  body: string;
}

/** Split markdown into H2-anchored sections, preserving anything before the first H2 as a preamble. */
function splitIntoSections(markdown: string): { preamble: string; sections: ParsedSection[] } {
  const lines = (markdown || '').split('\n');
  const sections: ParsedSection[] = [];
  let preambleLines: string[] = [];
  let current: ParsedSection | null = null;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      if (current) sections.push(current);
      current = {
        rawHeading: h2[1],
        normalisedHeading: normaliseStructuralHeading(h2[1]),
        body: '',
      };
    } else if (current) {
      current.body += line + '\n';
    } else {
      preambleLines.push(line);
    }
  }
  if (current) sections.push(current);
  return { preamble: preambleLines.join('\n').trim(), sections };
}

function buildLensIntro(variant: ForkVariant, rule: SplitRoute['rule']): string {
  if (rule === 'verbatim') return '';
  if (variant === 'financial' && rule === 'financial_lens') return FIN_LENS_PREAMBLE + '\n\n';
  if (variant === 'due_diligence' && rule === 'property_lens') return PLDD_LENS_PREAMBLE + '\n\n';
  return '';
}

function summariseBody(body: string, maxWords = 200): string {
  const words = body.trim().split(/\s+/);
  if (words.length <= maxWords) return body;
  return words.slice(0, maxWords).join(' ') + '\n\n_…full detail in the companion report._';
}

interface AssembledSection {
  ordinal: number;
  heading: string;
  body: string;
}

function assembleForVariant(
  variant: ForkVariant,
  parsed: ParsedSection[],
): AssembledSection[] {
  const buckets: AssembledSection[] = [];
  const usedOrdinals = new Set<number>();
  let fallbackOrdinal = 100;

  for (const section of parsed) {
    const { route } = routeCompositeSection(section.normalisedHeading);
    if (!route) continue;

    const isTargeted =
      route.target === 'both' ||
      route.target === variant;
    if (!isTargeted) continue;
    if (route.rule === 'drop') continue;

    const newHeading =
      variant === 'financial'
        ? route.newHeadingFinancial || section.normalisedHeading
        : route.newHeadingDueDiligence || section.normalisedHeading;

    let ordinal =
      variant === 'financial'
        ? route.ordinalFinancial
        : route.ordinalDueDiligence;
    if (!ordinal || usedOrdinals.has(ordinal)) {
      ordinal = ordinal && !usedOrdinals.has(ordinal) ? ordinal : fallbackOrdinal++;
    }
    usedOrdinals.add(ordinal);

    const lensIntro = buildLensIntro(variant, route.rule);
    const body = route.rule === 'summarise_only'
      ? summariseBody(section.body)
      : section.body;

    buckets.push({ ordinal, heading: newHeading, body: lensIntro + body.trim() + '\n' });
  }

  // De-duplicate consecutive identical headings, keeping the richer body
  const dedupedMap = new Map<string, AssembledSection>();
  for (const s of buckets) {
    const existing = dedupedMap.get(s.heading);
    if (!existing) dedupedMap.set(s.heading, s);
    else if (s.body.length > existing.body.length) dedupedMap.set(s.heading, s);
  }
  return Array.from(dedupedMap.values()).sort((a, b) => a.ordinal - b.ordinal);
}

function renderVariantMarkdown(
  variant: ForkVariant,
  propertyAddress: string,
  sections: AssembledSection[],
): string {
  const title = variant === 'financial' ? FIN_REPORT_TITLE : PLDD_REPORT_TITLE;
  const subtitle = variant === 'financial' ? FIN_REPORT_SUBTITLE : PLDD_REPORT_SUBTITLE;
  const footer = variant === 'financial' ? FIN_FOOTER_DISCLAIMER : PLDD_FOOTER_DISCLAIMER;

  const cover = `# ${title}\n\n_${subtitle}_\n\n**Property:** ${propertyAddress}\n\n**Generated:** ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}\n\n---\n\n`;

  const body = sections
    .map((s) => `## ${s.heading}\n\n${s.body.trim()}\n`)
    .join('\n');

  const disclaimer = `\n\n---\n\n## Disclaimer\n\n${footer}\n`;

  return cover + body + disclaimer;
}

async function loadComposite(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('investment_reports')
    .select('id, property_address, property_listing_id, client_property_id, generated_by, report_content, financial_calculations, demographics_data, economic_data, location_intelligence, property_specs, manual_overrides, status, report_variant, sources_content')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load composite: ${error.message}`);
  if (!data) throw new Error(`Composite report ${id} not found`);
  if (data.report_variant !== 'composite') {
    throw new Error(`Report ${id} is not a composite (variant=${data.report_variant})`);
  }
  if (data.status !== 'completed') {
    throw new Error(`Composite report ${id} is not yet completed (status=${data.status})`);
  }
  return data;
}

async function findExistingFork(supabase: any, parentId: string, variant: ForkVariant) {
  const { data } = await supabase
    .from('investment_reports')
    .select('id')
    .eq('derived_from_report_id', parentId)
    .eq('report_variant', variant)
    .maybeSingle();
  return data?.id || null;
}

async function upsertFork(
  supabase: any,
  parent: any,
  variant: ForkVariant,
  reportContent: string,
  scoreInputRaw: any,
  force: boolean,
) {
  const score = variant === 'financial'
    ? scoreFinancial(scoreInputRaw)
    : scorePropertyFundamentals(scoreInputRaw);

  const existingId = await findExistingFork(supabase, parent.id, variant);
  const sourcesContent = parent.sources_content || null;

  const sharedFields = {
    report_content: reportContent,
    sources_content: sourcesContent,
    investment_score: score,
    financial_calculations: parent.financial_calculations,
    demographics_data: parent.demographics_data,
    economic_data: parent.economic_data,
    location_intelligence: parent.location_intelligence,
    property_specs: parent.property_specs,
    manual_overrides: parent.manual_overrides,
    variant_generated_at: new Date().toISOString(),
    status: 'completed',
  };

  if (existingId && !force) {
    const { data, error } = await supabase
      .from('investment_reports')
      .update(sharedFields)
      .eq('id', existingId)
      .select('id, report_variant, derived_from_report_id, variant_generated_at')
      .maybeSingle();
    if (error) throw new Error(`Failed to refresh ${variant} fork: ${error.message}`);
    return { ...data, refreshed: true };
  }

  // Force or new: delete-then-insert so the existing row isn't orphaned
  if (existingId && force) {
    await supabase.from('investment_reports').delete().eq('id', existingId);
  }

  const { data, error } = await supabase
    .from('investment_reports')
    .insert({
      property_address: parent.property_address,
      property_listing_id: parent.property_listing_id,
      client_property_id: parent.client_property_id,
      generated_by: parent.generated_by,
      report_variant: variant,
      derived_from_report_id: parent.id,
      ...sharedFields,
    })
    .select('id, report_variant, derived_from_report_id, variant_generated_at')
    .maybeSingle();
  if (error) throw new Error(`Failed to insert ${variant} fork: ${error.message}`);
  return { ...data, created: true };
}

Deno.serve(async (req) => {
  const corsHeaders = createCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));

    const { error: authError, userId, authMethod } = await verifyAuth(supabase, req.headers, body);
    if (authError) {
      console.log('[fork-investment-report] Auth failed:', authError);
      return createUnauthorizedResponse(authError, corsHeaders);
    }

    const compositeId = body.composite_report_id || body.compositeReportId || body.reportId;
    const force = body.force === true;
    if (!compositeId) {
      return new Response(JSON.stringify({ error: 'composite_report_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[fork-investment-report] Authenticated fork request', {
      userId: userId?.substring?.(0, 8) || userId,
      authMethod,
      compositeId,
      force,
    });

    const parent = await loadComposite(supabase, compositeId);

    const { sections } = splitIntoSections(parent.report_content || '');
    if (sections.length === 0) {
      return new Response(JSON.stringify({ error: 'Composite has no H2 sections to fork' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build deterministic per-variant markdown
    const financialSections = assembleForVariant('financial', sections);
    const dueDiligenceSections = assembleForVariant('due_diligence', sections);

    const financialMd = renderVariantMarkdown('financial', parent.property_address, financialSections);
    const dueDiligenceMd = renderVariantMarkdown('due_diligence', parent.property_address, dueDiligenceSections);

    // Build the scoring input raw from parent's stored JSON
    const scoreInputRaw = {
      property: {
        price: parent.financial_calculations?.purchasePrice || parent.property_specs?.price || 0,
        weeklyRent: parent.financial_calculations?.weeklyRent || parent.property_specs?.weeklyRent || 0,
        propertyType: parent.property_specs?.propertyType || 'house',
      },
      demographics: parent.demographics_data || {},
      locationIntelligence: parent.location_intelligence || {},
      financials: parent.financial_calculations || {},
      state: parent.property_specs?.state || parent.demographics_data?.state,
    };

    const [financial, due_diligence] = await Promise.all([
      upsertFork(supabase, parent, 'financial', financialMd, scoreInputRaw, force),
      upsertFork(supabase, parent, 'due_diligence', dueDiligenceMd, scoreInputRaw, force),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        composite_report_id: parent.id,
        financial,
        due_diligence,
        section_counts: {
          composite: sections.length,
          financial: financialSections.length,
          due_diligence: dueDiligenceSections.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[fork-investment-report]', err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
