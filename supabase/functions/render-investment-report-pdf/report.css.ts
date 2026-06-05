// Canonical editorial stylesheet for the Premium PDF.
// Targets WeasyPrint paged-media (≥ v61). Self-contained: only depends on
// BRAND/TYPE/SCALE/PAGE tokens. No runtime parameterisation — variants belong
// in markup classes, not in branching CSS.

import { BRAND, TYPE, SCALE, PAGE, withAlpha } from "./report.brand.ts";

export const EDITORIAL_CSS = `
  /* ─────────────────────────────────────────────────────────────────
     Foundation
     ───────────────────────────────────────────────────────────────── */
  @page {
    size: ${PAGE.size};
    margin: ${PAGE.marginTop} ${PAGE.marginRight} ${PAGE.marginBottom} ${PAGE.marginLeft};
    background: ${BRAND.paper};

    @top-left {
      content: string(chapter-eyebrow);
      font-family: ${TYPE.mono};
      font-size: ${SCALE.micro}pt;
      letter-spacing: .22em;
      text-transform: uppercase;
      color: ${BRAND.inkMuted};
    }
    @top-right {
      content: string(chapter-title);
      font-family: ${TYPE.accent};
      font-style: italic;
      font-size: 9pt;
      color: ${BRAND.inkMuted};
    }
    @bottom-left {
      content: "NPC · Investment Intelligence";
      font-family: ${TYPE.mono};
      font-size: ${SCALE.micro}pt;
      letter-spacing: .22em;
      text-transform: uppercase;
      color: ${BRAND.inkMuted};
    }
    @bottom-center {
      content: "";
      border-top: 0.4pt solid ${BRAND.rule};
      width: 18pt; height: 0;
      margin: 0 auto;
    }
    @bottom-right {
      content: counter(page, decimal-leading-zero) " / " counter(pages, decimal-leading-zero);
      font-family: ${TYPE.mono};
      font-size: ${SCALE.micro}pt;
      letter-spacing: .14em;
      color: ${BRAND.ink};
    }
  }

  /* The cover suppresses all running chrome. */
  @page editorial-cover {
    margin: 0;
    background: ${BRAND.navyDeep};
    @top-left    { content: none; }
    @top-right   { content: none; }
    @bottom-left { content: none; }
    @bottom-center { content: none; }
    @bottom-right { content: none; }
  }

  html, body {
    margin: 0;
    padding: 0;
    background: ${BRAND.paper};
    color: ${BRAND.ink};
    font-family: ${TYPE.body};
    font-size: ${SCALE.body}pt;
    line-height: 1.58;
    font-feature-settings: "kern" 1, "liga" 1, "calt" 1, "onum" 1;
    -webkit-font-smoothing: antialiased;
  }

  /* ─────────────────────────────────────────────────────────────────
     Typography
     ───────────────────────────────────────────────────────────────── */
  h1, h2, h3, h4 {
    font-family: ${TYPE.display};
    color: ${BRAND.navyDeep};
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.12;
    margin: 0;
  }
  h1 { font-size: ${SCALE.h1}pt; }
  h2 { font-size: ${SCALE.h2}pt; margin: 28pt 0 12pt; }
  h3 { font-size: ${SCALE.h3}pt; margin: 18pt 0 8pt; color: ${BRAND.ink}; }
  h4 {
    font-family: ${TYPE.mono};
    text-transform: uppercase;
    letter-spacing: .22em;
    font-size: 8.5pt;
    color: ${BRAND.goldDeep};
    margin: 14pt 0 6pt;
  }

  p { margin: 0 0 9pt; orphans: 3; widows: 3; }
  p + p { text-indent: 0; }
  strong { font-weight: 600; color: ${BRAND.ink}; }
  em { font-family: ${TYPE.accent}; font-style: italic; font-size: 1.05em; }

  a { color: ${BRAND.goldDeep}; text-decoration: none; border-bottom: 0.3pt solid ${withAlpha(BRAND.goldDeep, 0.4)}; }

  /* ─────────────────────────────────────────────────────────────────
     Reusable editorial primitives
     ───────────────────────────────────────────────────────────────── */

  /* Eyebrow — mono label above a chapter title */
  .eyebrow {
    font-family: ${TYPE.mono};
    font-size: 8.5pt;
    letter-spacing: .26em;
    text-transform: uppercase;
    color: ${BRAND.goldDeep};
    margin-bottom: 10pt;
  }
  .eyebrow::before { content: "— "; color: ${BRAND.gold}; }

  /* Pull-quote — magazine-style typographic moment */
  .pull-quote {
    font-family: ${TYPE.display};
    font-style: italic;
    font-size: ${SCALE.pullQuote}pt;
    line-height: 1.25;
    color: ${BRAND.navyDeep};
    margin: 22pt 0 22pt 0;
    padding: 0 0 0 14pt;
    border-left: 2pt solid ${BRAND.gold};
    page-break-inside: avoid;
  }
  .pull-quote cite {
    display: block;
    margin-top: 8pt;
    font-family: ${TYPE.mono};
    font-style: normal;
    font-size: 8.5pt;
    letter-spacing: .18em;
    text-transform: uppercase;
    color: ${BRAND.inkMuted};
  }

  /* KPI strip — 2/3/4 hairline-divided cells */
  .kpi-strip {
    display: flex;
    width: 100%;
    border-top: 0.6pt solid ${BRAND.ink};
    border-bottom: 0.6pt solid ${BRAND.ink};
    margin: 18pt 0 22pt;
    page-break-inside: avoid;
  }
  .kpi-strip .kpi {
    flex: 1;
    padding: 12pt 14pt;
    border-right: 0.3pt solid ${BRAND.rule};
  }
  .kpi-strip .kpi:last-child { border-right: 0; }
  .kpi .kpi-label {
    font-family: ${TYPE.mono};
    font-size: 7.5pt;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: ${BRAND.inkMuted};
    margin-bottom: 6pt;
  }
  .kpi .kpi-value {
    font-family: ${TYPE.display};
    font-size: 22pt;
    line-height: 1;
    color: ${BRAND.navyDeep};
    font-feature-settings: "lnum" 1;
  }
  .kpi .kpi-foot {
    margin-top: 4pt;
    font-size: 8.5pt;
    color: ${BRAND.inkMuted};
  }

  /* Two-column body — for editorial copy that benefits from a tighter measure */
  .two-col {
    column-count: 2;
    column-gap: 8mm;
    column-rule: 0.3pt solid ${BRAND.rule};
    margin: 12pt 0;
  }
  .two-col p { break-inside: avoid-column; }

  /* Asymmetric editorial grid (12-col feel via percentage cells) */
  .grid-12 { display: flex; gap: 8mm; align-items: flex-start; margin: 16pt 0; }
  .grid-12 .col-7 { flex: 0 0 58%; }
  .grid-12 .col-5 { flex: 0 0 36%; }
  .grid-12 .col-8 { flex: 0 0 66%; }
  .grid-12 .col-4 { flex: 0 0 30%; }

  /* Sidenote / aside */
  .sidenote {
    background: ${BRAND.paperAlt};
    border-left: 2pt solid ${BRAND.gold};
    padding: 12pt 14pt;
    font-size: 9.5pt;
    line-height: 1.5;
    color: ${BRAND.ink};
    page-break-inside: avoid;
  }
  .sidenote .sidenote-label {
    font-family: ${TYPE.mono};
    font-size: 7.5pt;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: ${BRAND.goldDeep};
    margin-bottom: 4pt;
    display: block;
  }

  /* Ledger table — magazine financial appendix style */
  table.ledger {
    width: 100%;
    border-collapse: collapse;
    margin: 14pt 0;
    font-size: 9.5pt;
    border-top: 1pt solid ${BRAND.ink};
    border-bottom: 1pt solid ${BRAND.ink};
    page-break-inside: avoid;
  }
  table.ledger th {
    font-family: ${TYPE.mono};
    font-size: 7.5pt;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: ${BRAND.inkMuted};
    text-align: left;
    padding: 8pt 10pt 8pt 0;
    border-bottom: 0.6pt solid ${BRAND.ink};
    font-weight: 500;
  }
  table.ledger td {
    padding: 7pt 10pt 7pt 0;
    border-bottom: 0.3pt solid ${withAlpha(BRAND.inkMuted, 0.25)};
    color: ${BRAND.ink};
    font-feature-settings: "tnum" 1, "lnum" 1;
  }
  table.ledger tr:last-child td { border-bottom: 0; }
  table.ledger td.num, table.ledger th.num { text-align: right; }
  table.ledger tr.total td {
    border-top: 0.6pt solid ${BRAND.ink};
    font-weight: 600;
    color: ${BRAND.navyDeep};
  }

  /* Chapter container — sets running header strings via CSS named strings */
  .chapter {
    page-break-before: always;
    string-set: chapter-eyebrow attr(data-eyebrow) " · " attr(data-chapter-no),
                chapter-title attr(data-chapter-title);
  }
  .chapter-header {
    margin-bottom: 22pt;
    padding-bottom: 16pt;
    border-bottom: 0.6pt solid ${BRAND.rule};
  }
  .chapter-header .chapter-no {
    display: block;
    font-family: ${TYPE.mono};
    font-size: 9pt;
    letter-spacing: .26em;
    line-height: 1;
    color: ${BRAND.goldDeep};
    margin: 0 0 20pt 0;
  }
  .chapter-header h1 {
    font-size: ${SCALE.h1}pt;
    line-height: 1.18;
    color: ${BRAND.navyDeep};
    max-width: 150mm;
    margin: 0;
    padding-top: 2pt;
  }
  .chapter-header .chapter-dek {
    margin-top: 14pt;
    font-family: ${TYPE.accent};
    font-style: italic;
    font-size: 14pt;
    line-height: 1.35;
    color: ${BRAND.inkMuted};
    max-width: 140mm;
  }

  /* ─────────────────────────────────────────────────────────────────
     Editorial Cover
     ───────────────────────────────────────────────────────────────── */
  .editorial-cover {
    page: editorial-cover;
    position: relative;
    width: 210mm;
    height: 297mm;
    background: ${BRAND.navyDeep};
    color: ${BRAND.paper};
    overflow: hidden;
    page-break-after: always;
  }
  .editorial-cover .cover-hero {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    opacity: 0.62;
    filter: contrast(1.05) saturate(0.92);
  }
  .editorial-cover .cover-scrim {
    position: absolute; inset: 0;
    background: linear-gradient(180deg,
      ${withAlpha(BRAND.navyDeep, 0.20)} 0%,
      ${withAlpha(BRAND.navyDeep, 0.55)} 55%,
      ${withAlpha(BRAND.navyDeep, 0.92)} 100%);
  }
  .editorial-cover .cover-masthead {
    position: absolute; top: 22mm; left: 22mm; right: 22mm;
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: ${TYPE.mono};
    font-size: 8pt;
    letter-spacing: .32em;
    text-transform: uppercase;
    color: ${BRAND.goldGlow};
  }
  .editorial-cover .cover-masthead .vol {
    font-family: ${TYPE.mono};
    color: ${withAlpha(BRAND.paper, 0.7)};
  }
  .editorial-cover .cover-rule {
    position: absolute; top: 30mm; left: 22mm;
    width: 28mm; height: 0;
    border-top: 1pt solid ${BRAND.gold};
  }
  .editorial-cover .cover-body {
    position: absolute;
    left: 22mm; right: 22mm; bottom: 38mm;
  }
  .editorial-cover .cover-eyebrow {
    font-family: ${TYPE.mono};
    font-size: 9pt;
    letter-spacing: .28em;
    text-transform: uppercase;
    color: ${BRAND.goldGlow};
    margin-bottom: 14mm;
  }
  .editorial-cover h1.cover-title {
    font-family: ${TYPE.display};
    font-weight: 500;
    font-size: ${SCALE.coverTitle}pt;
    line-height: 1.02;
    letter-spacing: -0.015em;
    color: ${BRAND.paper};
    margin: 0;
    max-width: 165mm;
  }
  .editorial-cover .cover-title em {
    font-family: ${TYPE.accent};
    font-style: italic;
    font-weight: 400;
    color: ${BRAND.goldGlow};
  }
  .editorial-cover .cover-meta {
    margin-top: 16mm;
    display: flex;
    gap: 14mm;
    font-family: ${TYPE.mono};
    font-size: 8pt;
    letter-spacing: .18em;
    text-transform: uppercase;
    color: ${withAlpha(BRAND.paper, 0.78)};
  }
  .editorial-cover .cover-meta .lbl {
    display: block;
    color: ${BRAND.goldGlow};
    margin-bottom: 3mm;
    font-size: 7pt;
    letter-spacing: .3em;
  }
  .editorial-cover .cover-meta .val {
    font-family: ${TYPE.body};
    font-size: 10pt;
    letter-spacing: 0;
    text-transform: none;
    color: ${BRAND.paper};
    font-weight: 500;
  }
  .editorial-cover .cover-footer {
    position: absolute; bottom: 14mm; left: 22mm; right: 22mm;
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: ${TYPE.mono};
    font-size: 7.5pt;
    letter-spacing: .26em;
    text-transform: uppercase;
    color: ${withAlpha(BRAND.paper, 0.55)};
  }
`;
