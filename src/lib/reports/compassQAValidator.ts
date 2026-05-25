/**
 * Compass-40 QA Validator — Phase 7
 * ----------------------------------
 * Runs structural QA on a generated report's markdown. Used by:
 *   • condense-investment-report (returns assertions in response)
 *   • Deno tests (compassPostProcessor_test.ts)
 *   • Frontend QA panel (mirror in src/lib/reports/)
 *
 * Checks:
 *   1. Page band: Compass 38–42, Financial 18–22
 *   2. Financial content exclusion from Compass (no yield/LVR/cashflow tables)
 *   3. Suburb-narrative exclusion from Financial Analysis
 *   4. Duplicate H2 heading detection
 *   5. Duplicate decision-box detection per section
 *   6. Protected sections present
 *   7. Per-section word-cap compliance
 */

import {
  COMPASS_40_SECTIONS,
  FINANCIAL_ANALYSIS_SECTIONS,
  COMPASS_PAGE_BAND,
  PROTECTED_SECTION_IDS,
  type CompassSectionDefinition,
} from './compassSectionRegistry';
import { countWords, estimatePages } from './compassPostProcessor';

export type QASeverity = 'error' | 'warning' | 'info';

export interface QAFinding {
  rule: string;
  severity: QASeverity;
  message: string;
  sectionId?: string;
}

export interface QAReport {
  tier: 'compass-40' | 'financial-analysis';
  estimatedPages: number;
  wordCount: number;
  passed: boolean;
  findings: QAFinding[];
}

const FINANCIAL_KEYWORDS = [
  /\bgross yield\b/i,
  /\bnet yield\b/i,
  /\bLVR\b/,
  /\bLMI\b/,
  /\bP&I\b/,
  /\bweekly rent\b/i,
  /\b10-year (cashflow|projection)/i,
  /\bsensitivity analysis\b/i,
  /\bafter[- ]tax cashflow\b/i,
  /\bdepreciation schedule\b/i,
];

const SUBURB_KEYWORDS = [
  /\bSEIFA\b/,
  /\bschool catchment\b/i,
  /\bcrime statistics\b/i,
  /\bflood (zone|risk)\b/i,
  /\bbushfire\b/i,
  /\bdemograph/i,
  /\binfrastructure pipeline\b/i,
  /\bzoning overlay\b/i,
];

function parseH2(markdown: string): string[] {
  const matches = markdown.match(/^##\s+(.+?)\s*$/gm) ?? [];
  return matches.map((m) => m.replace(/^##\s+/, '').trim());
}

function normalize(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findDef(heading: string, registry: CompassSectionDefinition[]) {
  const target = normalize(heading);
  return registry.find(
    (s) =>
      normalize(s.name) === target ||
      s.sourceHeadings.some((sh) => normalize(sh) === target),
  );
}

function splitBySections(markdown: string): { heading: string; body: string }[] {
  const lines = markdown.split('\n');
  const out: { heading: string; body: string }[] = [];
  let current: { heading: string; body: string } | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (current) out.push(current);
      current = { heading: m[1].trim(), body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) out.push(current);
  return out;
}

export function runQAValidation(
  markdown: string,
  tier: 'compass-40' | 'financial-analysis',
): QAReport {
  const findings: QAFinding[] = [];
  const registry =
    tier === 'compass-40' ? COMPASS_40_SECTIONS : FINANCIAL_ANALYSIS_SECTIONS;
  const wordCount = countWords(markdown);
  const estimatedPages = estimatePages(markdown);

  // Rule 1 — page band
  const band =
    tier === 'compass-40' ? COMPASS_PAGE_BAND : { min: 18, max: 22 };
  if (estimatedPages < band.min) {
    findings.push({
      rule: 'page-band',
      severity: 'warning',
      message: `Estimated ${estimatedPages} pages, below target min ${band.min}.`,
    });
  } else if (estimatedPages > band.max) {
    findings.push({
      rule: 'page-band',
      severity: 'error',
      message: `Estimated ${estimatedPages} pages, exceeds target max ${band.max}.`,
    });
  }

  // Rule 2 — financial exclusion (Compass only)
  if (tier === 'compass-40') {
    for (const pat of FINANCIAL_KEYWORDS) {
      if (pat.test(markdown)) {
        findings.push({
          rule: 'financial-exclusion',
          severity: 'error',
          message: `Compass contains financial content matching ${pat}. Move to Financial Analysis Report.`,
        });
      }
    }
  }

  // Rule 3 — suburb-narrative exclusion (Financial only)
  if (tier === 'financial-analysis') {
    for (const pat of SUBURB_KEYWORDS) {
      if (pat.test(markdown)) {
        findings.push({
          rule: 'suburb-exclusion',
          severity: 'warning',
          message: `Financial report contains suburb-narrative content matching ${pat}.`,
        });
      }
    }
  }

  // Rule 4 — duplicate H2 headings
  const h2s = parseH2(markdown);
  const seen = new Map<string, number>();
  for (const h of h2s) {
    const k = normalize(h);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, count] of seen) {
    if (count > 1) {
      findings.push({
        rule: 'duplicate-h2',
        severity: 'error',
        message: `Heading "${k}" appears ${count} times.`,
      });
    }
  }

  // Rules 5–7 — per-section checks
  const sections = splitBySections(markdown);
  for (const sec of sections) {
    const def = findDef(sec.heading, registry);
    if (!def) continue;

    // 5 — duplicate decision boxes
    const boxCount = (sec.body.match(/^#{2,4}\s*(what this means|takeaway)/gim) ?? []).length;
    if (boxCount > 1) {
      findings.push({
        rule: 'duplicate-decision-box',
        severity: 'error',
        sectionId: def.id,
        message: `Section "${sec.heading}" has ${boxCount} decision boxes (max 1).`,
      });
    }
    if (boxCount > 0 && !def.allowDecisionBox) {
      findings.push({
        rule: 'forbidden-decision-box',
        severity: 'error',
        sectionId: def.id,
        message: `Section "${sec.heading}" has a decision box but allowDecisionBox=false.`,
      });
    }

    // 7 — per-section word cap
    const w = countWords(sec.body);
    if (def.maxWordCount > 0 && w > def.maxWordCount * 1.1) {
      findings.push({
        rule: 'word-cap',
        severity: 'warning',
        sectionId: def.id,
        message: `Section "${sec.heading}" has ${w} words, over cap ${def.maxWordCount}.`,
      });
    }
  }

  // 6 — Protected sections must be present (Compass only)
  if (tier === 'compass-40') {
    const presentDefs = new Set(
      sections.map((s) => findDef(s.heading, registry)?.id).filter(Boolean),
    );
    for (const protectedId of PROTECTED_SECTION_IDS) {
      if (!presentDefs.has(protectedId)) {
        findings.push({
          rule: 'missing-protected-section',
          severity: 'error',
          sectionId: protectedId,
          message: `Required Protected section "${protectedId}" missing from Compass report.`,
        });
      }
    }
  }

  const passed = findings.every((f) => f.severity !== 'error');
  return { tier, estimatedPages, wordCount, passed, findings };
}
