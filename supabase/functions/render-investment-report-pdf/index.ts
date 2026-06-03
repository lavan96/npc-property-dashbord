// Premium investment report PDF renderer.
// Pipeline: fetch report row → build hybrid HTML (marketing cover + editorial body)
// → POST to Api2PDF Headless Chrome HTML endpoint → return hosted FileUrl.
//
// Side-by-side with the legacy jsPDF (PixelPerfectPDFGenerator) renderer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { marked } from "https://esm.sh/marked@12.0.2";
import { createCorsHeaders, createUnauthorizedResponse, verifyAuth } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API2PDF_KEY = (Deno.env.get("API2PDF_API_KEY") || "").trim();

// Dark-gold theme tokens mirrored from the app.
const THEME = {
  bg: "#0D0D0D",
  surface: "#161616",
  surfaceAlt: "#1C1C1C",
  border: "#2A2A2A",
  text: "#F3EFE6",
  muted: "#9C9486",
  gold: "#D4A843",
  goldSoft: "#B8902F",
  success: "#6FBF73",
  paper: "#F7F2E8",
  paperAlt: "#EEE5D6",
  ink: "#17130D",
  inkMuted: "#5F5546",
  rule: "#D8CBB6",
  // Rating pill palette
  good: "#3F8A4F",
  goodBg: "#E2EFD9",
  warn: "#B07A1F",
  warnBg: "#F5E6C6",
  risk: "#A23A28",
  riskBg: "#F1D6CF",
  neutralBg: "#E6E0D2",
  neutralInk: "#4A4030",
};

function fmtMoney(v: unknown): string {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtPct(v: unknown, digits = 2): string {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Aggressively strip leftover branding boilerplate and duplicated report titles
 * that the AI generator tends to bake into the markdown. Runs anywhere in the
 * document, not just at the top.
 */
function cleanReportMarkdown(markdown: string, address: string): string {
  const addressPattern = escapeRegExp(address).replace(/\s+/g, "\\s+");
  let out = markdown;

  // Remove company-branding blocks wherever they appear.
  out = out.replace(
    /^\s*#{0,3}\s*NAIDU PROPERTY CONSULTING(\s+SERVICES)?\s*\n+/gim,
    "",
  );
  out = out.replace(/^\s*#{0,3}\s*YOUR DEDICATED PROPERTY PARTNER\s*\n+/gim, "");
  // Duplicate "Investment Report: <address>" titles inside the body.
  out = out.replace(
    new RegExp(`^\\s*#{0,3}\\s*Investment Report:\\s*${addressPattern}\\s*\\n+`, "gim"),
    "",
  );

  // Strip raw citation placeholders the model leaves behind.
  out = out.replace(/\[\s*citation\s*\]/gi, "");
  out = out.replace(/\[\s*sources?\s*\]/gi, "");
  out = out.replace(/\[\s*ref(?:erence)?\s*\]/gi, "");

  // Normalise everything to h2 so chapter numbering is consistent.
  out = out.replace(/^\s*#\s+/gm, "## ");

  // Collapse 3+ blank lines down to 2.
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}

const INSIGHT_LABEL_RE =
  /^(what\s+this\s+means|why\s+it\s+matters|why\s+it'?s\s+important|takeaway|takeaways|key\s+takeaway|the\s+takeaway|watch|what\s+to\s+watch|things?\s+to\s+watch|bottom\s+line|so\s+what|implication|implications|key\s+insight|insight|in\s+plain\s+english|npc\s+view|our\s+view|the\s+bottom\s+line)$/i;

/**
 * Wrap narrative subsections into a styled callout box. Supports both:
 *   1. h3/h4 heading form  →  ### What This Means
 *   2. Inline bold-prefix form  →  **What This Means:** body…
 */
function wrapInsightSections(html: string): string {
  // Form 1: h3 / h4 heading captures content until next h1–h4
  let out = html.replace(
    /<h([34])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[1-4][\s>]|<section|$)/gi,
    (match, _lvl, rawTitle, content) => {
      const title = String(rawTitle).replace(/<[^>]+>/g, "").trim().replace(/[:\-—]\s*$/, "");
      if (!INSIGHT_LABEL_RE.test(title)) return match;
      return `<div class="insight-box"><div class="insight-label">${esc(title)}</div>${content}</div>`;
    },
  );

  // Form 2: <p><strong>Label:</strong> rest…</p> [+ following <p> siblings until next heading/table/list]
  out = out.replace(
    /<p>\s*<(?:strong|b)>([^<]+?)[:：]\s*<\/(?:strong|b)>\s*([\s\S]*?)<\/p>((?:\s*<p>[\s\S]*?<\/p>)*?)(?=\s*(?:<h[1-4][\s>]|<table|<ul|<ol|<hr|<div\s+class="insight-box"|<section|$))/gi,
    (match, rawLabel, firstRest, restPs) => {
      const label = String(rawLabel).trim();
      if (!INSIGHT_LABEL_RE.test(label)) return match;
      return `<div class="insight-box"><div class="insight-label">${esc(label)}</div><p>${firstRest}</p>${restPs || ""}</div>`;
    },
  );

  return out;
}

/**
 * Colour-code rating-style cells (Strong / Moderate / High / Low / etc.) by
 * wrapping their text in a tinted pill.
 */
const RATING_MAP: Array<{ test: RegExp; cls: string }> = [
  { test: /^(strong|very\s+strong|excellent|high\s+confidence|low\s+risk|low|stable|positive|good|established|mature)$/i, cls: "pill-good" },
  { test: /^(moderate(?:[\u2013\u2014-]\s*strong)?|medium|developing|early\s+to\s+developing|catching\s+up|emerging|fair|mixed|within\s+your\s+control)$/i, cls: "pill-warn" },
  { test: /^(weak|low\s+demand|high(?:\s+risk)?|very\s+high|elevated|cautious|poor|undersupplied|oversupplied|medium[\u2013\u2014-]high|high[\u2013\u2014-]very\s+high)$/i, cls: "pill-risk" },
];

function colourCodeTableCells(html: string): string {
  return html.replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (match, attrs, inner) => {
    const plain = String(inner).replace(/<[^>]+>/g, "").trim();
    if (!plain || plain.length > 28) return match;
    for (const rule of RATING_MAP) {
      if (rule.test.test(plain)) {
        return `<td${attrs}><span class="pill ${rule.cls}">${esc(plain)}</span></td>`;
      }
    }
    return match;
  });
}

/** Strip trailing "[1]" / "[12]" citation markers that leak into prose. */
function stripBareCitations(html: string): string {
  return html.replace(/\[\s*\d{1,3}\s*\](?=[\s.,;:!?)]|<)/g, "");
}

/**
 * Tag each top-level h2 with an id + record TOC entries so we can render a TOC
 * page and use CSS `target-counter()` for page numbers.
 */
function annotateChaptersAndExtractToc(html: string): { html: string; toc: Array<{ id: string; title: string }> } {
  const toc: Array<{ id: string; title: string }> = [];
  const used = new Set<string>();
  const annotated = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (_m, attrs, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, "").trim();
    let id = `ch-${slugify(text) || `${toc.length + 1}`}`;
    let n = 1;
    while (used.has(id)) id = `ch-${slugify(text) || "section"}-${++n}`;
    used.add(id);
    toc.push({ id, title: text });
    return `<h2 id="${id}"${attrs}>${inner}</h2>`;
  });
  return { html: annotated, toc };
}

export function buildHtml(report: any, brandName: string): string {
  const address = report.property_address || "Property";
  const generated = new Date(report.created_at || Date.now()).toLocaleDateString(
    "en-AU",
    { day: "numeric", month: "long", year: "numeric" },
  );

  const fin = report.financial_calculations || {};
  const km = fin.keyMetrics || fin.key_metrics || {};
  const score = report.investment_score || {};
  const loc = report.location_intelligence || {};

  // Render + post-process markdown body.
  const md = cleanReportMarkdown(String(report.report_content || ""), address);
  let bodyHtml = marked.parse(md, { gfm: true, breaks: false }) as string;
  bodyHtml = stripBareCitations(bodyHtml);
  bodyHtml = wrapInsightSections(bodyHtml);
  bodyHtml = colourCodeTableCells(bodyHtml);
  const { html: bodyAnnotated, toc } = annotateChaptersAndExtractToc(bodyHtml);

  const sourcesHtml = report.sources_content
    ? marked.parse(String(report.sources_content), { gfm: true }) as string
    : "";

  // KPI tiles
  const kpis: Array<{ label: string; value: string }> = [];
  if (km.purchasePrice != null) kpis.push({ label: "Purchase Price", value: fmtMoney(km.purchasePrice) });
  if (km.grossRentalYield != null) kpis.push({ label: "Gross Yield", value: fmtPct(km.grossRentalYield) });
  if (km.netRentalYield != null) kpis.push({ label: "Net Yield", value: fmtPct(km.netRentalYield) });
  if (km.weeklyNet != null) kpis.push({ label: "Weekly Cash Flow", value: fmtMoney(km.weeklyNet) });
  if (km.lvr != null) kpis.push({ label: "LVR", value: fmtPct(km.lvr, 1) });
  if (km.weeklyRent != null) kpis.push({ label: "Weekly Rent", value: fmtMoney(km.weeklyRent) });

  const scoreOverall =
    score?.overall_score ?? score?.overallScore ?? score?.score ?? null;
  const scoreBand =
    score?.band ?? score?.grade ?? (typeof scoreOverall === "number"
      ? scoreOverall >= 80 ? "Strong" : scoreOverall >= 65 ? "Solid" : scoreOverall >= 50 ? "Mixed" : "Cautious"
      : null);

  const kpiTiles = kpis
    .map(
      (k) => `<div class="kpi"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div></div>`,
    )
    .join("");

  // Parse address tail for cover meta (Suburb, STATE Postcode).
  const addrTail = address.split(",").map((s: string) => s.trim()).filter(Boolean);
  const coverLocation = loc?.suburb && loc?.state
    ? `${loc.suburb}, ${loc.state}`
    : addrTail.length >= 2
      ? addrTail.slice(-2).join(", ")
      : address;

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700;800;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap');
    @page {
      size: A4;
      margin: 20mm 17mm 20mm 17mm;
      background: ${THEME.paper};
      @top-left { content: string(chapter); font-family: 'Inter', sans-serif; font-size: 7.5pt; color: ${THEME.inkMuted}; letter-spacing: .14em; text-transform: uppercase; }
      @top-right { content: "${esc(address)}"; font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 8.5pt; color: ${THEME.inkMuted}; }
      @bottom-left { content: "${esc(brandName)}"; font-family: 'Inter', sans-serif; font-size: 7.5pt; color: ${THEME.inkMuted}; letter-spacing: .14em; text-transform: uppercase; }
      @bottom-right { content: counter(page) " / " counter(pages); font-family: 'Inter', sans-serif; font-size: 7.5pt; color: ${THEME.inkMuted}; }
    }
    @page cover {
      margin: 0;
      background: ${THEME.bg};
      @top-left { content: none; } @top-right { content: none; }
      @bottom-left { content: none; } @bottom-right { content: none; }
    }
    @page toc {
      @top-left { content: "Contents"; }
    }

    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: ${THEME.paper};
      color: ${THEME.ink};
      font-family: 'Inter', 'Helvetica', sans-serif;
      font-size: 9.8pt;
      line-height: 1.58;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body { counter-reset: section; }

    h1, h2, h3, h4 { font-family: 'Playfair Display', 'Georgia', serif; color: ${THEME.ink}; margin: 0 0 .45em; page-break-after: avoid; }
    h1 { font-size: 30pt; font-weight: 800; line-height: 1.08; letter-spacing: -0.01em; }
    h2 {
      counter-increment: section;
      string-set: chapter content();
      font-size: 22pt; font-weight: 700; letter-spacing: -0.005em;
      margin-top: 22pt;
      padding-bottom: 8pt;
      border-bottom: 0.5pt solid ${THEME.rule};
      display: flex; align-items: baseline; gap: 10pt;
      page-break-before: auto;
    }
    h2::before {
      content: counter(section, decimal-leading-zero);
      font-family: 'Playfair Display', serif;
      font-weight: 500; font-style: italic;
      font-size: 14pt; color: ${THEME.goldSoft};
      letter-spacing: .04em; flex-shrink: 0;
    }
    h3 {
      font-size: 14pt; font-weight: 600; margin-top: 16pt;
      padding-left: 10pt;
      border-left: 2.5pt solid ${THEME.gold};
    }
    h4 {
      font-family: 'Inter', sans-serif;
      font-size: 8.5pt; font-weight: 700;
      color: ${THEME.goldSoft};
      text-transform: uppercase; letter-spacing: .15em;
      margin-top: 12pt;
    }
    p { margin: 0 0 .72em; orphans: 3; widows: 3; }
    a { color: ${THEME.goldSoft}; text-decoration: none; }
    strong { color: ${THEME.ink}; font-weight: 700; }
    em { color: ${THEME.inkMuted}; font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 1.05em; }

    h2 + p {
      font-family: 'Inter', 'Helvetica', sans-serif;
      font-size: 9.8pt; line-height: 1.58;
      color: ${THEME.ink}; margin-bottom: .72em;
    }

    .insight-box {
      margin: 14pt 0;
      padding: 12pt 16pt 10pt;
      background: ${THEME.paperAlt};
      border-left: 3pt solid ${THEME.gold};
      border-radius: 2pt;
      box-shadow: inset 0 0 0 0.5pt ${THEME.rule};
      page-break-inside: avoid;
    }
    .insight-box .insight-label {
      font-family: 'Inter', sans-serif;
      font-size: 7.5pt; font-weight: 700;
      color: ${THEME.goldSoft};
      text-transform: uppercase; letter-spacing: .18em;
      margin: 0 0 6pt;
      display: flex; align-items: center; gap: 8pt;
    }
    .insight-box .insight-label::before {
      content: ""; display: inline-block;
      width: 14pt; height: 1pt; background: ${THEME.gold};
    }
    .insight-box p:last-child { margin-bottom: 0; }
    .insight-box p { font-size: 9.5pt; }

    ul, ol { margin: 4pt 0 .9em 0; padding: 0; list-style: none; }
    li {
      position: relative;
      padding: 3pt 0 3pt 18pt;
      margin-bottom: 1pt;
      border-bottom: 0.25pt dotted ${THEME.rule};
    }
    ul li::before {
      content: "";
      position: absolute; left: 0; top: 10pt;
      width: 5pt; height: 5pt;
      background: ${THEME.gold};
      transform: rotate(45deg);
    }
    ol { counter-reset: ol; }
    ol li { counter-increment: ol; }
    ol li::before {
      content: counter(ol, decimal-leading-zero);
      position: absolute; left: 0; top: 3pt;
      font-family: 'Playfair Display', serif;
      font-weight: 700; font-size: 9pt;
      color: ${THEME.goldSoft};
    }

    blockquote {
      margin: 14pt 0;
      padding: 14pt 18pt 14pt 38pt;
      background: ${THEME.paperAlt};
      border-left: 3pt solid ${THEME.gold};
      color: ${THEME.ink};
      font-family: 'Cormorant Garamond', serif;
      font-size: 13.5pt; font-style: italic;
      line-height: 1.45; position: relative;
      page-break-inside: avoid;
    }
    blockquote::before {
      content: "\\201C";
      font-family: 'Playfair Display', serif;
      font-style: normal; font-weight: 800;
      font-size: 48pt; line-height: 1;
      color: ${THEME.gold};
      position: absolute; left: 10pt; top: 6pt;
    }

    code { background: ${THEME.paperAlt}; padding: 1pt 4pt; border-radius: 2pt; font-size: 8.5pt; color: ${THEME.goldSoft}; }

    table {
      width: 100%; border-collapse: collapse; margin: 10pt 0 14pt;
      font-size: 8.5pt; background: #FFFDF8;
      page-break-inside: auto;
    }
    tr { page-break-inside: avoid; page-break-after: auto; }
    tr:nth-child(even) td { background: ${THEME.paperAlt}; }
    th, td {
      border-bottom: 0.5pt solid ${THEME.rule};
      padding: 5.5pt 7pt;
      text-align: left; vertical-align: top;
    }
    th {
      background: ${THEME.ink}; color: ${THEME.gold};
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      text-transform: uppercase; letter-spacing: .08em;
      font-size: 7pt; border-bottom: none;
    }
    td { color: ${THEME.ink}; overflow-wrap: anywhere; }
    td:first-child { font-weight: 600; }
    hr { border: 0; border-top: 0.5pt solid ${THEME.rule}; margin: 18pt 0; }

    /* Rating pills */
    .pill {
      display: inline-block;
      padding: 2pt 7pt;
      border-radius: 999pt;
      font-family: 'Inter', sans-serif;
      font-weight: 600; font-size: 7.5pt;
      letter-spacing: .04em;
      line-height: 1.1;
      white-space: nowrap;
    }
    .pill-good { background: ${THEME.goodBg}; color: ${THEME.good}; }
    .pill-warn { background: ${THEME.warnBg}; color: ${THEME.warn}; }
    .pill-risk { background: ${THEME.riskBg}; color: ${THEME.risk}; }
    .pill-neutral { background: ${THEME.neutralBg}; color: ${THEME.neutralInk}; }

    /* ── Cover ── */
    .cover {
      page: cover;
      page-break-after: always;
      width: 210mm; height: 297mm;
      background:
        radial-gradient(ellipse at top right, rgba(212,168,67,0.20) 0%, transparent 55%),
        radial-gradient(ellipse at bottom left, rgba(212,168,67,0.10) 0%, transparent 60%),
        linear-gradient(180deg, #0a0a0a 0%, #141414 100%);
      color: ${THEME.text};
      padding: 28mm 22mm;
      position: relative;
    }
    .cover .brand { font-family: 'Inter'; font-weight: 700; letter-spacing: .35em; font-size: 9pt; color: ${THEME.gold}; text-transform: uppercase; }
    .cover .rule { width: 80pt; height: 2pt; background: ${THEME.gold}; margin: 10mm 0 14mm; }
    .cover .eyebrow { font-size: 9pt; letter-spacing: .25em; text-transform: uppercase; color: ${THEME.muted}; margin-bottom: 6mm; }
    .cover h1 { font-family: 'Playfair Display', serif; font-weight: 800; font-size: 44pt; line-height: 1.05; max-width: 155mm; color: ${THEME.text}; letter-spacing: -0.015em; }
    .cover .address { margin-top: 9mm; font-size: 15pt; color: ${THEME.gold}; font-family: 'Cormorant Garamond', serif; font-style: italic; }
    .cover .meta { position: absolute; left: 22mm; bottom: 22mm; right: 22mm; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9pt; color: ${THEME.muted}; border-top: 1px solid ${THEME.border}; padding-top: 6mm; }
    .cover .meta .label { display: block; text-transform: uppercase; letter-spacing: .15em; font-size: 7.5pt; color: ${THEME.muted}; margin-bottom: 2pt; }
    .cover .meta .value { color: ${THEME.text}; font-size: 10.5pt; font-family: 'Cormorant Garamond', serif; font-style: italic; }

    /* ── Table of Contents ── */
    .toc { page: toc; page-break-after: always; padding-top: 6mm; }
    .toc .toc-eyebrow { font-family: 'Inter', sans-serif; font-size: 8pt; color: ${THEME.goldSoft}; letter-spacing: .25em; text-transform: uppercase; margin-bottom: 4mm; }
    .toc h1 { font-family: 'Playfair Display', serif; font-size: 38pt; font-weight: 800; margin: 0 0 12mm; letter-spacing: -0.01em; }
    .toc ol { counter-reset: tocnum; list-style: none; padding: 0; margin: 0; }
    .toc ol li {
      counter-increment: tocnum;
      display: flex; align-items: baseline; gap: 8pt;
      padding: 7pt 0; border-bottom: 0.5pt dotted ${THEME.rule};
      font-family: 'Inter', sans-serif; font-size: 10.5pt;
      color: ${THEME.ink};
    }
    .toc ol li::before {
      content: counter(tocnum, decimal-leading-zero);
      font-family: 'Playfair Display', serif;
      font-style: italic; font-weight: 500;
      color: ${THEME.goldSoft}; font-size: 11pt;
      width: 28pt; flex-shrink: 0;
    }
    .toc ol li .title { flex: 1; font-family: 'Playfair Display', serif; font-weight: 600; font-size: 13pt; }
    .toc ol li .dots { flex: 0 1 auto; border-bottom: 0.5pt dotted ${THEME.rule}; min-width: 30pt; margin: 0 6pt 3pt; height: 0; align-self: flex-end; }
    .toc ol li .page {
      font-family: 'Playfair Display', serif;
      font-weight: 700; color: ${THEME.ink}; font-size: 11pt;
      width: 22pt; text-align: right;
    }
    .toc ol li a { color: ${THEME.ink}; text-decoration: none; display: contents; }
    .toc ol li a .page::after { content: target-counter(attr(href), page); }

    /* ── Snapshot KPI grid ── */
    .snapshot {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 9pt;
      margin: 10pt 0 16pt;
    }
    .kpi {
      background: linear-gradient(180deg, #FFFDF8 0%, #FBF6EA 100%);
      border: 0.5pt solid ${THEME.rule};
      border-top: 2pt solid ${THEME.gold};
      padding: 12pt 13pt 13pt;
      page-break-inside: avoid;
      position: relative;
    }
    .kpi-label { font-family: 'Inter', sans-serif; font-size: 7pt; text-transform: uppercase; letter-spacing: .14em; color: ${THEME.inkMuted}; margin-bottom: 6pt; font-weight: 600; }
    .kpi-value { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 19pt; color: ${THEME.ink}; line-height: 1; }

    .score-card {
      background: linear-gradient(135deg, #FFFDF8 0%, #F4ECD8 100%);
      border: 0.5pt solid ${THEME.rule};
      padding: 18pt 20pt;
      margin: 12pt 0 18pt;
      display: flex; align-items: center; gap: 20pt;
      page-break-inside: avoid;
    }
    .score-card .ring {
      width: 86pt; height: 86pt; border-radius: 50%;
      background: conic-gradient(${THEME.gold} 0%, ${THEME.gold} var(--p, 0%), ${THEME.paperAlt} var(--p, 0%));
      display: flex; align-items: center; justify-content: center;
      font-family: 'Playfair Display', serif; font-weight: 800; font-size: 26pt; color: ${THEME.ink};
      position: relative; flex-shrink: 0;
    }
    .score-card .ring::after { content: ""; position: absolute; inset: 7pt; border-radius: 50%; background: #FFFDF8; }
    .score-card .ring span { position: relative; z-index: 1; }
    .score-card .meta { flex: 1; }
    .score-card .band { color: ${THEME.goldSoft}; text-transform: uppercase; letter-spacing: .18em; font-size: 8.5pt; font-weight: 700; font-family: 'Inter', sans-serif; }
    .score-card h3 { border: none; padding: 0; font-size: 16pt; margin: 4pt 0 4pt; }

    .body-page { page-break-before: auto; }

    .disclaimer {
      margin-top: 28pt;
      padding: 14pt 16pt;
      border: 0.5pt solid ${THEME.rule};
      background: ${THEME.paperAlt};
      font-size: 8pt;
      color: ${THEME.inkMuted};
      page-break-inside: avoid;
    }
    .disclaimer h4 { margin-top: 0; color: ${THEME.inkMuted}; }
  `;

  const scoreCard = scoreOverall != null
    ? `<div class="score-card">
         <div class="ring" style="--p:${Math.max(0, Math.min(100, Number(scoreOverall)))}%"><span>${esc(Math.round(Number(scoreOverall)))}</span></div>
         <div class="meta">
           <div class="band">${esc(scoreBand || "Investment Score")}</div>
           <h3 style="margin:4pt 0 2pt">Overall Investment Score</h3>
            <p style="margin:0;color:${THEME.inkMuted};font-size:9pt">A weighted blend of yield, growth, demographic strength, infrastructure, and risk factors specific to this property and suburb.</p>
         </div>
       </div>`
    : "";

  const tocHtml = toc.length > 0
    ? `<section class="toc">
         <div class="toc-eyebrow">${esc(brandName)} · Investment Report</div>
         <h1>Contents</h1>
         <ol>
           ${toc.map((t) => `<li><a href="#${t.id}"><span class="title">${esc(t.title)}</span><span class="dots"></span><span class="page"></span></a></li>`).join("")}
         </ol>
       </section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<title>${esc(address)} — Investment Report</title>
<style>${styles}</style>
</head>
<body>

<!-- ── Cover ── -->
<section class="cover">
  <div class="brand">${esc(brandName)}</div>
  <div class="rule"></div>
  <div class="eyebrow">Property Investment Analysis</div>
  <h1>An evidence-based view of this investment opportunity.</h1>
  <div class="address">${esc(address)}</div>
  <div class="meta">
    <div>
      <span class="label">Prepared</span>
      <span class="value">${esc(generated)}</span>
    </div>
    <div>
      <span class="label">Location</span>
      <span class="value">${esc(coverLocation)}</span>
    </div>
    <div style="text-align:right">
      <span class="label">Report Type</span>
      <span class="value">Investment Analysis</span>
    </div>
  </div>
</section>

${tocHtml}

<!-- ── Snapshot ── -->
<section class="body-page">
  <h2 id="ch-snapshot">Snapshot</h2>
  ${kpiTiles ? `<div class="snapshot">${kpiTiles}</div>` : ""}
  ${scoreCard}
</section>

<!-- ── Body (markdown) ── -->
<section class="body-page">
  ${bodyAnnotated}
</section>

${
    sourcesHtml
      ? `<section class="body-page">${sourcesHtml}</section>`
      : ""
  }

<section class="body-page">
  <div class="disclaimer">
    <h4>Important Notice</h4>
    <p>This report is provided for general informational purposes only and does not constitute financial, taxation, legal, or investment advice. All figures, projections, and market commentary are derived from publicly available data and reasonable assumptions at the time of writing, and may change. Recipients should seek independent professional advice before making any investment decisions.</p>
  </div>
</section>

</body>
</html>`;
}

async function callApi2Pdf(html: string, fileName: string): Promise<string> {
  const payload = {
      html,
      fileName,
      inline: false,
      inlinePdf: false,
      options: {
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        scale: 1,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
      },
    };

  let lastStatus = 0;
  let lastBody = "";
  let lastError = "";
  for (const endpoint of [
    "https://v2.api2pdf.com/chrome/html",
    "https://v2.api2pdf.com/chrome/pdf/html",
    "https://v2018.api2pdf.com/chrome/html",
    "https://v2018.api2pdf.com/chrome/pdf/html",
  ]) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: API2PDF_KEY,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }

    lastStatus = res.status;
    lastBody = text;
    lastError = json?.Error || json?.error || "";
    console.log("[render-investment-report-pdf] Api2PDF attempt", {
      endpoint,
      status: res.status,
      success: json?.Success ?? json?.success ?? false,
      hasFileUrl: Boolean(json?.FileUrl || json?.fileUrl || json?.pdf),
      error: lastError || undefined,
    });

    const success = json?.Success === true || json?.success === true;
    const fileUrl = json?.FileUrl || json?.fileUrl || json?.pdf;
    if (res.ok && success && fileUrl) return fileUrl as string;

    if (res.status !== 404) break;
  }

  throw new Error(
    `Api2PDF failed (${lastStatus}): ${lastError || lastBody.slice(0, 400)}`,
  );
}

if (import.meta.main) Deno.serve(async (req) => {
  const corsHeaders = createCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!API2PDF_KEY) throw new Error("API2PDF_API_KEY is not configured");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json();

    const { error: authError } = await verifyAuth(supabase, req.headers, body);
    if (authError) return createUnauthorizedResponse(authError, corsHeaders);

    const { reportId } = body;
    if (!reportId || typeof reportId !== "string") {
      return new Response(JSON.stringify({ error: "reportId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: report, error } = await supabase
      .from("investment_reports")
      .select(
        "id, property_address, report_content, sources_content, created_at, financial_calculations, investment_score, location_intelligence",
      )
      .eq("id", reportId)
      .maybeSingle();

    if (error || !report) {
      return new Response(JSON.stringify({ error: error?.message || "Report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let brandName = "Investment Report";
    try {
      const { data: settings } = await supabase
        .from("global_report_settings")
        .select("contact_details")
        .maybeSingle();
      const cd = (settings as any)?.contact_details;
      if (cd?.company_name) brandName = cd.company_name;
    } catch { /* optional */ }

    const html = buildHtml(report, brandName);
    const safeAddr = String(report.property_address || "report")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(0, 60);
    const fileName = `investment-report-${safeAddr}.pdf`;

    const fileUrl = await callApi2Pdf(html, fileName);

    return new Response(JSON.stringify({ fileUrl, fileName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[render-investment-report-pdf]", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
