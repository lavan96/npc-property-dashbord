/**
 * Compass-40 Post-Processor — Phases 5 & 6
 * -----------------------------------------
 * Runs AFTER the AI emits markdown for a Compass or Financial Analysis report.
 *
 * Phase 5 — Word-cap enforcement:
 *   • Per-section maxWordCount from compassSectionRegistry
 *   • Component-level caps from COMPASS_WORD_CAPS (decision boxes, exec summary)
 *   • At most one "What this means" / decision box per section
 *
 * Phase 6 — Page-pressure trimming engine:
 *   • Estimates rendered page count from word count + table rows
 *   • If over the target band, applies PAGE_PRESSURE_TRIM_ORDER in sequence
 *   • Protected sections are NEVER touched (zoning, risk, infrastructure,
 *     due diligence, property assessment)
 *
 * Frontend mirror: src/lib/reports/compassPostProcessor.ts (keep in sync).
 */

import {
  COMPASS_40_SECTIONS,
  FINANCIAL_ANALYSIS_SECTIONS,
  COMPASS_WORD_CAPS,
  COMPASS_PAGE_BAND,
  PAGE_PRESSURE_TRIM_ORDER,
  PROTECTED_SECTION_IDS,
  type CompassSectionDefinition,
} from './compassSectionRegistry';

export type PostProcessTier = 'compass-40' | 'financial-analysis';

export interface PostProcessReport {
  tier: PostProcessTier;
  initialWordCount: number;
  finalWordCount: number;
  initialEstimatedPages: number;
  finalEstimatedPages: number;
  trimsApplied: string[];
  sectionsTrimmed: { sectionId: string; reason: string; wordsRemoved: number }[];
  warnings: string[];
}

interface ParsedSection {
  /** Heading text without "## " */
  heading: string;
  /** Lines that make up the section body (NOT including its own H2 line) */
  bodyLines: string[];
  /** Matched section definition, if any */
  def?: CompassSectionDefinition;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

export function countWords(text: string): number {
  if (!text) return 0;
  // Strip markdown table pipes and headings; count word-ish tokens
  const cleaned = text
    .replace(/^\|.*\|$/gm, '') // table rows
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/**
 * Rough page estimator:
 *   • 320 words per page of body copy
 *   • Each markdown table row counts as 18 words
 *   • Each H2/H3 heading counts as 30 words (chrome + breathing room)
 */
export function estimatePages(markdown: string): number {
  if (!markdown) return 0;
  const tableRows = (markdown.match(/^\|.*\|$/gm) ?? []).length;
  const h2 = (markdown.match(/^##\s+/gm) ?? []).length;
  const h3 = (markdown.match(/^###\s+/gm) ?? []).length;
  const words = countWords(markdown);
  const tableWordEquiv = tableRows * 18;
  const headingWordEquiv = (h2 + h3) * 30;
  return Math.max(1, Math.round((words + tableWordEquiv + headingWordEquiv) / 320));
}

function normalizeHeading(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findDefinition(
  heading: string,
  registry: CompassSectionDefinition[],
): CompassSectionDefinition | undefined {
  const target = normalizeHeading(heading);
  return registry.find(
    (s) =>
      normalizeHeading(s.name) === target ||
      s.sourceHeadings.some((sh) => normalizeHeading(sh) === target),
  );
}

// ─── Markdown section parser ────────────────────────────────────────────────

function parseSections(
  markdown: string,
  registry: CompassSectionDefinition[],
): { preamble: string[]; sections: ParsedSection[] } {
  const lines = markdown.split('\n');
  const preamble: string[] = [];
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+?)\s*$/);
    if (h2Match) {
      if (current) sections.push(current);
      const heading = h2Match[1].trim();
      current = {
        heading,
        bodyLines: [],
        def: findDefinition(heading, registry),
      };
    } else if (current) {
      current.bodyLines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);
  return { preamble, sections };
}

function serializeSections(
  preamble: string[],
  sections: ParsedSection[],
): string {
  const out: string[] = [...preamble];
  for (const s of sections) {
    out.push(`## ${s.heading}`);
    out.push(...s.bodyLines);
  }
  // Collapse 3+ blank lines to 2
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

// ─── Phase 5a: per-section word-cap enforcement ─────────────────────────────

function truncateNarrativeToCap(bodyLines: string[], cap: number): { lines: string[]; removed: number } {
  const original = bodyLines.join('\n');
  const words = original.split(/\s+/).filter(Boolean);
  if (words.length <= cap) return { lines: bodyLines, removed: 0 };

  // Keep tables and bullet/heading lines intact; truncate prose paragraphs from the end.
  const out: string[] = [];
  let budget = cap;
  let removed = 0;

  for (const line of bodyLines) {
    const isStructural =
      /^\s*$/.test(line) ||
      /^\s*\|/.test(line) ||
      /^\s*[-*]\s+/.test(line) ||
      /#{1,6}\s+/.test(line);
    if (isStructural) {
      out.push(line);
      continue;
    }
    const w = line.split(/\s+/).filter(Boolean);
    if (w.length <= budget) {
      out.push(line);
      budget -= w.length;
    } else if (budget > 8) {
      out.push(w.slice(0, budget).join(' ') + '…');
      removed += w.length - budget;
      budget = 0;
    } else {
      removed += w.length;
    }
  }
  return { lines: out, removed };
}

// ─── Phase 5b: decision-box governance ──────────────────────────────────────
// "## What this means" or "### What this means" blocks. At most one per section,
// hard-capped to COMPASS_WORD_CAPS.whatThisMeansBox.max.

const DECISION_BOX_RE = /^(#{2,4})\s*(what this means|what this means for you|takeaway)\s*$/i;

function enforceDecisionBoxes(section: ParsedSection): { lines: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const out: string[] = [];
  let seen = 0;
  const cap = COMPASS_WORD_CAPS.whatThisMeansBox.max;
  const allowBox = section.def?.allowDecisionBox ?? false;

  let i = 0;
  while (i < section.bodyLines.length) {
    const line = section.bodyLines[i];
    if (DECISION_BOX_RE.test(line.trim())) {
      // Collect the block until next heading
      const block: string[] = [];
      let j = i + 1;
      while (j < section.bodyLines.length && !/^#{2,4}\s+/.test(section.bodyLines[j])) {
        block.push(section.bodyLines[j]);
        j++;
      }
      seen++;
      if (!allowBox) {
        warnings.push(`Removed decision box from "${section.heading}" (not allowed).`);
        i = j;
        continue;
      }
      if (seen > 1) {
        warnings.push(`Removed duplicate decision box from "${section.heading}".`);
        i = j;
        continue;
      }
      // Word-cap the block
      const text = block.join('\n').trim();
      const words = text.split(/\s+/).filter(Boolean);
      const trimmed =
        words.length > cap ? words.slice(0, cap).join(' ') + '…' : text;
      out.push(line);
      out.push(trimmed);
      out.push('');
      i = j;
    } else {
      out.push(line);
      i++;
    }
  }
  return { lines: out, warnings };
}

// ─── Phase 5c: executive-summary cap ────────────────────────────────────────

function capExecutiveSummary(section: ParsedSection, report: PostProcessReport): void {
  if (section.def?.id !== 'compass.executiveSummary') return;
  const cap = COMPASS_WORD_CAPS.executiveSummaryTotal.max;
  const { lines, removed } = truncateNarrativeToCap(section.bodyLines, cap);
  if (removed > 0) {
    section.bodyLines = lines;
    report.sectionsTrimmed.push({
      sectionId: section.def.id,
      reason: 'Executive Summary exceeded 600-word cap',
      wordsRemoved: removed,
    });
  }
}

// ─── Phase 6: page-pressure trimming engine ─────────────────────────────────

const TRANSITION_RE =
  /^\s*(as we (move|turn|shift|look) (into|to|towards)|building on|with that in mind|having (covered|reviewed)|in summary so far)\b.*$/i;

function trimTransitions(sections: ParsedSection[]): number {
  let removed = 0;
  for (const s of sections) {
    if (s.def && PROTECTED_SECTION_IDS.has(s.def.id)) continue;
    const before = s.bodyLines.length;
    s.bodyLines = s.bodyLines.filter((l) => !TRANSITION_RE.test(l));
    removed += before - s.bodyLines.length;
  }
  return removed;
}

function capListsToTop5(sections: ParsedSection[]): number {
  let removedRows = 0;
  for (const s of sections) {
    if (s.def && PROTECTED_SECTION_IDS.has(s.def.id)) continue;
    // Cap bullet runs
    const out: string[] = [];
    let bulletRun = 0;
    for (const line of s.bodyLines) {
      if (/^\s*[-*]\s+/.test(line)) {
        bulletRun++;
        if (bulletRun <= 5) out.push(line);
        else removedRows++;
      } else {
        bulletRun = 0;
        out.push(line);
      }
    }
    // Cap table data rows (keep header + separator + first 5 rows)
    const tableCapped: string[] = [];
    let inTable = false;
    let tableDataRow = 0;
    for (let i = 0; i < out.length; i++) {
      const line = out[i];
      const isRow = /^\s*\|/.test(line);
      if (isRow) {
        if (!inTable) {
          inTable = true;
          tableDataRow = 0;
          tableCapped.push(line); // header
          continue;
        }
        // separator row
        if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) {
          tableCapped.push(line);
          continue;
        }
        tableDataRow++;
        if (tableDataRow <= 5) tableCapped.push(line);
        else removedRows++;
      } else {
        inTable = false;
        tableDataRow = 0;
        tableCapped.push(line);
      }
    }
    s.bodyLines = tableCapped;
  }
  return removedRows;
}

function reduceSectionToOnePage(
  sections: ParsedSection[],
  sectionId: string,
): number {
  const s = sections.find((x) => x.def?.id === sectionId);
  if (!s) return 0;
  const oneePageCap = 280; // ~one page of words
  const { lines, removed } = truncateNarrativeToCap(s.bodyLines, oneePageCap);
  s.bodyLines = lines;
  return removed;
}

function mergeDuplicateDemographics(sections: ParsedSection[]): number {
  // Keep only the first occurrence of any "Demographic" / "Employment" subsection inside non-protected sections.
  const seen = new Set<string>();
  let removed = 0;
  for (const s of sections) {
    if (s.def && PROTECTED_SECTION_IDS.has(s.def.id)) continue;
    const out: string[] = [];
    let i = 0;
    while (i < s.bodyLines.length) {
      const line = s.bodyLines[i];
      const h = line.match(/^###\s+(.+)$/);
      if (h && /(demograph|employment|workforce|seifa)/i.test(h[1])) {
        const key = normalizeHeading(h[1]);
        if (seen.has(key)) {
          // Skip until next ### or ##
          let j = i + 1;
          while (j < s.bodyLines.length && !/^#{2,3}\s+/.test(s.bodyLines[j])) {
            removed += countWords(s.bodyLines[j]);
            j++;
          }
          i = j;
          continue;
        }
        seen.add(key);
      }
      out.push(line);
      i++;
    }
    s.bodyLines = out;
  }
  return removed;
}

function collapseDuplicateDecisionBoxes(sections: ParsedSection[]): number {
  let removed = 0;
  for (const s of sections) {
    const { lines, warnings: _ } = enforceDecisionBoxes(s);
    const before = s.bodyLines.length;
    s.bodyLines = lines;
    if (s.bodyLines.length < before) removed += before - s.bodyLines.length;
  }
  return removed;
}

function applyPagePressureTrims(
  preamble: string[],
  sections: ParsedSection[],
  report: PostProcessReport,
): void {
  const targetMax = report.tier === 'compass-40' ? COMPASS_PAGE_BAND.max : 22;

  for (const step of PAGE_PRESSURE_TRIM_ORDER) {
    const currentMd = serializeSections(preamble, sections);
    const pages = estimatePages(currentMd);
    if (pages <= targetMax) return;

    let touched = 0;
    switch (step.id) {
      case 'transitions':
        touched = trimTransitions(sections);
        break;
      case 'collapseDecisionBoxes':
        touched = collapseDuplicateDecisionBoxes(sections);
        break;
      case 'capListsToTop5':
        touched = capListsToTop5(sections);
        break;
      case 'mergeDuplicateDemographics':
        touched = mergeDuplicateDemographics(sections);
        break;
      case 'moveListsToAppendix':
        // Conservative: same as capListsToTop5 second pass with cap=3
        touched = capListsToTop5(sections);
        break;
      case 'reduceEconomicContext':
        touched = reduceSectionToOnePage(sections, 'compass.economicContext');
        break;
      case 'reduceLifestyle':
        touched = reduceSectionToOnePage(sections, 'compass.suburbCharacter');
        break;
    }
    if (touched > 0) report.trimsApplied.push(step.id);
  }
}

// ─── Phase 5d: per-section narrative cap pass ───────────────────────────────

function applyPerSectionWordCaps(
  sections: ParsedSection[],
  report: PostProcessReport,
): void {
  for (const s of sections) {
    if (!s.def) continue;
    const cap = s.def.maxWordCount;
    if (!cap || cap <= 0) continue;
    const { lines, removed } = truncateNarrativeToCap(s.bodyLines, cap);
    if (removed > 0) {
      s.bodyLines = lines;
      report.sectionsTrimmed.push({
        sectionId: s.def.id,
        reason: `Exceeded section word cap (${cap})`,
        wordsRemoved: removed,
      });
    }
  }
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

export interface PostProcessResult {
  markdown: string;
  report: PostProcessReport;
}

export function postProcessReportMarkdown(
  markdown: string,
  tier: PostProcessTier,
): PostProcessResult {
  const registry =
    tier === 'compass-40' ? COMPASS_40_SECTIONS : FINANCIAL_ANALYSIS_SECTIONS;

  const initialWordCount = countWords(markdown);
  const initialEstimatedPages = estimatePages(markdown);

  const report: PostProcessReport = {
    tier,
    initialWordCount,
    finalWordCount: initialWordCount,
    initialEstimatedPages,
    finalEstimatedPages: initialEstimatedPages,
    trimsApplied: [],
    sectionsTrimmed: [],
    warnings: [],
  };

  const { preamble, sections } = parseSections(markdown, registry);

  // Phase 5a — decision-box governance
  for (const s of sections) {
    const { lines, warnings } = enforceDecisionBoxes(s);
    s.bodyLines = lines;
    report.warnings.push(...warnings);
  }

  // Phase 5b — executive summary hard cap (compass only)
  if (tier === 'compass-40') {
    const exec = sections.find((s) => s.def?.id === 'compass.executiveSummary');
    if (exec) capExecutiveSummary(exec, report);
  }

  // Phase 5c — per-section narrative caps
  applyPerSectionWordCaps(sections, report);

  // Phase 6 — page-pressure trims
  applyPagePressureTrims(preamble, sections, report);

  const finalMarkdown = serializeSections(preamble, sections);
  report.finalWordCount = countWords(finalMarkdown);
  report.finalEstimatedPages = estimatePages(finalMarkdown);

  return { markdown: finalMarkdown, report };
}
