import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { postProcessReportMarkdown, countWords, estimatePages } from '../_shared/compassPostProcessor.ts';
import { runQAValidation } from '../_shared/compassQAValidator.ts';

// ─── Phase 5 — word-cap enforcement ─────────────────────────────────────────

Deno.test('postProcessor: caps executive summary to 600 words', () => {
  const longBody = Array(800).fill('word').join(' ');
  const md = `## Executive Summary\n${longBody}\n\n## Disclaimer\nShort.`;
  const { markdown, report } = postProcessReportMarkdown(md, 'compass-40');
  const execBody = markdown.split('## Disclaimer')[0];
  const w = countWords(execBody);
  assert(w <= 620, `Exec summary should be ≤600 words, got ${w}`);
  assert(report.sectionsTrimmed.some((t) => t.sectionId === 'compass.executiveSummary'));
});

Deno.test('postProcessor: removes decision box from disallowed section', () => {
  const md = `## Property Snapshot — Non-Financial
A property summary.

### What this means
This decision box is forbidden here.`;
  const { markdown, report } = postProcessReportMarkdown(md, 'compass-40');
  assert(!/what this means/i.test(markdown), 'forbidden decision box should be stripped');
  assert(report.warnings.some((w) => /not allowed/i.test(w)));
});

Deno.test('postProcessor: collapses duplicate decision boxes to one', () => {
  const md = `## Executive Summary
Body.

### What this means
First box content here.

### What this means
Second box content here.`;
  const { markdown } = postProcessReportMarkdown(md, 'compass-40');
  const occurrences = (markdown.match(/what this means/gi) ?? []).length;
  assertEquals(occurrences, 1);
});

// ─── Phase 6 — page-pressure trimming ───────────────────────────────────────

Deno.test('postProcessor: caps bullet lists to top 5 under page pressure', () => {
  const bullets = Array(20).fill(0).map((_, i) => `- bullet ${i}`).join('\n');
  // Force page pressure via tables in a protected section (won't be trimmed,
  // but inflates page estimate so capListsToTop5 fires on the non-protected one).
  const tableRows = Array(2000).fill(0).map((_, i) => `| item${i} | val${i} |`).join('\n');
  const md = `## Future Infrastructure & Growth Pipeline
| Project | Status |
|---|---|
${tableRows}

## Suburb Character & Lifestyle
${bullets}`;
  const { markdown } = postProcessReportMarkdown(md, 'compass-40');
  const lifestyleSlice = markdown.split('## Suburb Character')[1] ?? '';
  const bulletCount = (lifestyleSlice.match(/^- bullet/gm) ?? []).length;
  assert(bulletCount <= 5, `bullets should be capped to 5, got ${bulletCount}`);
});

Deno.test('postProcessor: never trims protected sections', () => {
  const padding = Array(15000).fill('w').join(' ');
  const protectedBody = '- transitions\n- routes\n- schools\n- ports\n- roads\n- rail\n- bus\n- ferry\n- airports\n- bridges';
  const md = `## Location Overview\n${padding}\n\n## Future Infrastructure & Growth Pipeline\n${protectedBody}`;
  const { markdown } = postProcessReportMarkdown(md, 'compass-40');
  const protectedSlice = markdown.split('## Future Infrastructure')[1] ?? '';
  const bullets = (protectedSlice.match(/^- /gm) ?? []).length;
  assertEquals(bullets, 10, 'protected section bullets must remain intact');
});

// ─── Phase 7 — QA validator ─────────────────────────────────────────────────

Deno.test('QA validator: flags financial content in Compass', () => {
  const md = `## Executive Summary
Property shows gross yield of 4.5% and LVR of 80%.

## Future Infrastructure & Growth Pipeline
Schools planned.`;
  const { findings } = runQAValidation(md, 'compass-40');
  assert(findings.some((f) => f.rule === 'financial-exclusion'));
});

Deno.test('QA validator: flags duplicate H2 headings', () => {
  const md = `## Executive Summary\nA.\n\n## Executive Summary\nB.`;
  const { findings } = runQAValidation(md, 'compass-40');
  assert(findings.some((f) => f.rule === 'duplicate-h2'));
});

Deno.test('QA validator: flags missing protected section', () => {
  const md = `## Executive Summary\nShort body.`;
  const { findings } = runQAValidation(md, 'compass-40');
  assert(findings.some((f) => f.rule === 'missing-protected-section'));
});

Deno.test('estimatePages: rough sanity for empty and full content', () => {
  assertEquals(estimatePages(''), 0);
  const big = Array(3200).fill('word').join(' ');
  assert(estimatePages(big) >= 9 && estimatePages(big) <= 12);
});
