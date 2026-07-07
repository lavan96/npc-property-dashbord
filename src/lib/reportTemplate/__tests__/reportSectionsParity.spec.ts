/**
 * Mechanical KEEP IN SYNC guard for the report-section chunker: the client
 * implementation (`src/lib/reportTemplate/reportSections.ts`) and the edge
 * mirror (`supabase/functions/_shared/reportSections.ts`) must produce
 * identical output for the same inputs, the same way
 * `resolveTemplateParity.spec.ts` pins the resolver pair.
 */
import { describe, expect, it } from 'vitest';
import * as client from '../reportSections';
// eslint-disable-next-line no-restricted-imports -- intentional cross-tree import to pin edge parity
import * as edge from '../../../../supabase/functions/_shared/reportSections';
import { extractStructureHeadings, selectStructureTemplate, slugifySectionId } from '../cascadeMap';

const STRUCTURE_MD = `# Executive Summary

# 5. Infrastructure & Amenities

## Demographics and Economics

# Risk and Recommendations
`;

const REPORT_FIXTURES: string[] = [
  '',
  'Just prose, no headings at all.',
  `# 1. Executive Summary

This **property** offers a *compelling* case [1].

- Yield 4.8%
- Vacancy < 1%

{{bars: Yield 7.4 | max=10}}

---

# 5. Infrastructure and Amenities

| Asset | Distance |
|-------|----------|
| Station | 400m |

## Demographics & Economics

Median age 34. See [ABS](https://abs.gov.au).

# 2. Risk & Recommendations

1. Diversify
2. Insure
`,
  `Preamble that is long enough to be captured as an overview section of the report.

## Summary

First.

## Summary

Second (duplicate heading).
`,
  `### Deep heading only\n\nBody under a level-3 heading.`,
];

describe('reportSections client/edge parity', () => {
  const headings = extractStructureHeadings(STRUCTURE_MD);

  it('chunks every fixture identically with and without structure headings', () => {
    for (const fixture of REPORT_FIXTURES) {
      expect(edge.chunkReportContent(fixture)).toEqual(client.chunkReportContent(fixture));
      expect(edge.chunkReportContent(fixture, { structureHeadings: headings }))
        .toEqual(client.chunkReportContent(fixture, { structureHeadings: headings }));
      expect(edge.chunkReportContent(fixture, { structureHeadings: headings, maxHighlights: 2 }))
        .toEqual(client.chunkReportContent(fixture, { structureHeadings: headings, maxHighlights: 2 }));
    }
  });

  it('passes object content through identically', () => {
    const obj = { alpha: { title: 'A', body: 'B' } };
    expect(edge.chunkReportContent(obj)).toEqual(client.chunkReportContent(obj));
  });

  it('mirrors markdownToPlainText and stripHeadingNumbering', () => {
    const samples = [
      '- **Bold** item\n2. _second_\n\n| a | b |\n|---|---|\n| 1 | 2 |',
      '> quote [12]\n\n```\ncode\n```\n\n{{timeline: a}}',
    ];
    for (const sample of samples) {
      expect(edge.markdownToPlainText(sample)).toBe(client.markdownToPlainText(sample));
    }
    for (const heading of ['5. Foo', 'Section 2: Bar', '7.2 Baz', 'Plain']) {
      expect(edge.stripHeadingNumbering(heading)).toBe(client.stripHeadingNumbering(heading));
    }
  });

  it('mirrors the cascadeMap helpers it duplicates (slugify, headings, selection)', () => {
    for (const value of ['5. Infrastructure & Amenities', 'Risk / Recommendations', '', '  Weird  __ chars  ']) {
      expect(edge.slugifySectionId(value)).toBe(slugifySectionId(value));
    }
    expect(edge.extractStructureHeadings(STRUCTURE_MD)).toEqual(extractStructureHeadings(STRUCTURE_MD));

    const rows = [
      { id: 'a', report_tier: 'compass', report_category: 'investment', priority: 1 },
      { id: 'b', report_tier: 'compass', report_category: null, priority: 5 },
      { id: 'c', report_tier: null, report_category: null, priority: 9 },
    ];
    for (const opts of [
      { tier: 'compass', category: 'investment' },
      { tier: 'compass', category: null },
      { tier: null, category: 'other' },
      {},
    ]) {
      expect(edge.selectStructureTemplate(rows as any, opts as any)?.id)
        .toBe(selectStructureTemplate(rows as any, opts as any)?.id);
    }
  });
});
