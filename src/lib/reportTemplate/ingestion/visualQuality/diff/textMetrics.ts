/**
 * Phase 4 — Visual diff harness: text coverage metric.
 *
 * Pure: compares expected source text (Docling / OCR / DOM textContent) to
 * the text the rendered template actually contains, and returns a 0..1
 * `textCoverageScore`. Tokenisation is whitespace-based after aggressive
 * normalisation so spacing/punctuation drift doesn't dominate the signal.
 */

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\p{L}\p{N}\s']+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenise(text: string): string[] {
  const n = normalise(text);
  if (!n) return [];
  return n.split(' ').filter(Boolean);
}

/** Multiset of tokens → count map. */
function toMultiset(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const tok of tokens) m.set(tok, (m.get(tok) ?? 0) + 1);
  return m;
}

export interface TextCoverageResult {
  /** 0..1 — share of expected tokens that survived to the rendered output. */
  textCoverageScore: number;
  /** Token count in the expected source for this page. */
  expectedTokenCount: number;
  /** Token count produced by the renderer for this page. */
  renderedTokenCount: number;
  /** Distinct expected tokens that did not appear in the rendered output. */
  missingTokens: string[];
}

/**
 * Bag-of-words coverage: for each expected token, take min(expected, rendered)
 * occurrences — that's how many copies survived. Divide by the expected
 * token count.
 *
 * - Returns score `1` when there is no expected text (nothing to preserve).
 * - Returns score `0` when the renderer produced nothing but expected did.
 * - Top 20 missing tokens (by expected frequency) are surfaced for UX.
 */
export function measureTextCoverage(expected: string, rendered: string): TextCoverageResult {
  const eTokens = tokenise(expected);
  const rTokens = tokenise(rendered);
  if (eTokens.length === 0) {
    return {
      textCoverageScore: 1,
      expectedTokenCount: 0,
      renderedTokenCount: rTokens.length,
      missingTokens: [],
    };
  }
  const eBag = toMultiset(eTokens);
  const rBag = toMultiset(rTokens);

  let survived = 0;
  const missing: Array<{ tok: string; count: number }> = [];
  for (const [tok, eCount] of eBag) {
    const rCount = rBag.get(tok) ?? 0;
    const kept = Math.min(eCount, rCount);
    survived += kept;
    const lost = eCount - kept;
    if (lost > 0) missing.push({ tok, count: lost });
  }
  missing.sort((a, b) => b.count - a.count);

  return {
    textCoverageScore: Math.max(0, Math.min(1, survived / eTokens.length)),
    expectedTokenCount: eTokens.length,
    renderedTokenCount: rTokens.length,
    missingTokens: missing.slice(0, 20).map((m) => m.tok),
  };
}
