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
const PDF_BUCKET = "investment-reports";
const EDGE_FUNCTION_TIMEOUT_MS = 1_500_000;
const RENDER_SAFETY_BUFFER_MS = 45_000;
const MAX_RENDER_WAIT_MS = EDGE_FUNCTION_TIMEOUT_MS - RENDER_SAFETY_BUFFER_MS;
// (Hero-image generation is now offloaded to `prepare-report-hero-images`.)
const API2PDF_REQUEST_TIMEOUT_MS = 600_000;
const WEASYPRINT_REQUEST_TIMEOUT_MS = 600_000;

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
  // Navy accents for editorial headings
  navy: "#0A2540",
  navyDeep: "#061A33",
  navyMid: "#1E4A7C",
  navyAccent: "#2E6CB0",
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

// Reusable navy gradient (applied via background-clip:text on headings)
const NAVY_GRADIENT = `linear-gradient(135deg, ${THEME.navyDeep} 0%, ${THEME.navyMid} 50%, ${THEME.navyAccent} 100%)`;

type PdfDesignPreset = "signature" | "editorial_navy" | "minimal_ink" | "high_contrast";
type PdfDensity = "compact" | "balanced" | "spacious";
type PdfChapterStyle = "classic" | "opener_band" | "minimal";
type PdfTableStyle = "classic" | "ledger" | "minimal";
type PdfCoverStyle = "image" | "title_overlay" | "editorial";
type PdfDesignOptions = {
  preset: PdfDesignPreset;
  density: PdfDensity;
  chapterStyle: PdfChapterStyle;
  tableStyle: PdfTableStyle;
  coverStyle: PdfCoverStyle;
  bodyScale: number;
  visualIntensity: number;
  showDropCaps: boolean;
  showSectionNumbers: boolean;
  justifyText: boolean;
};

const DEFAULT_PDF_DESIGN: PdfDesignOptions = {
  preset: "signature",
  density: "balanced",
  chapterStyle: "classic",
  tableStyle: "classic",
  coverStyle: "title_overlay",
  bodyScale: 100,
  visualIntensity: 70,
  showDropCaps: true,
  showSectionNumbers: true,
  justifyText: true,
};

const DESIGN_PALETTES: Record<PdfDesignPreset, { paper: string; paperAlt: string; ink: string; muted: string; accent: string; accentSoft: string; heading: string; heading2: string; cover: string }> = {
  signature: { paper: THEME.paper, paperAlt: THEME.paperAlt, ink: THEME.ink, muted: THEME.inkMuted, accent: THEME.gold, accentSoft: THEME.goldSoft, heading: THEME.navyDeep, heading2: THEME.navyAccent, cover: THEME.bg },
  editorial_navy: { paper: "#F3F0E7", paperAlt: "#E8E1D2", ink: "#111A24", muted: "#5C6570", accent: "#B9923E", accentSoft: "#8B6B23", heading: "#061A33", heading2: "#275F9C", cover: "#061A33" },
  minimal_ink: { paper: "#FAF8F2", paperAlt: "#EFEAE0", ink: "#151515", muted: "#62605A", accent: "#151515", accentSoft: "#4A4740", heading: "#151515", heading2: "#4A4740", cover: "#151515" },
  high_contrast: { paper: "#FFFFFF", paperAlt: "#F0F0F0", ink: "#080808", muted: "#3A3A3A", accent: "#D4A843", accentSoft: "#8A6418", heading: "#000000", heading2: "#2B2B2B", cover: "#000000" },
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizePdfDesign(input: unknown): PdfDesignOptions {
  const raw = typeof input === "object" && input ? input as Record<string, unknown> : {};
  return {
    preset: pick(raw.preset, ["signature", "editorial_navy", "minimal_ink", "high_contrast"] as const, DEFAULT_PDF_DESIGN.preset),
    density: pick(raw.density, ["compact", "balanced", "spacious"] as const, DEFAULT_PDF_DESIGN.density),
    chapterStyle: pick(raw.chapterStyle, ["classic", "opener_band", "minimal"] as const, DEFAULT_PDF_DESIGN.chapterStyle),
    tableStyle: pick(raw.tableStyle, ["classic", "ledger", "minimal"] as const, DEFAULT_PDF_DESIGN.tableStyle),
    coverStyle: pick(raw.coverStyle, ["image", "title_overlay", "editorial"] as const, DEFAULT_PDF_DESIGN.coverStyle),
    bodyScale: clampNumber(raw.bodyScale, 90, 112, DEFAULT_PDF_DESIGN.bodyScale),
    visualIntensity: clampNumber(raw.visualIntensity, 0, 100, DEFAULT_PDF_DESIGN.visualIntensity),
    showDropCaps: raw.showDropCaps !== false,
    showSectionNumbers: raw.showSectionNumbers !== false,
    justifyText: raw.justifyText !== false,
  };
}

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

  // Form 2: <p><strong>Label[:]</strong>[:] rest…</p> + ALL following block siblings
  // (paragraphs, lists, blockquotes, tables) until the next heading, hr,
  // another insight-box, section boundary, or another bold-prefix insight label.
  out = out.replace(
    /<p>\s*<(?:strong|b)>\s*([^<:：]+?)\s*[:：]?\s*<\/(?:strong|b)>\s*[:：]?\s*([\s\S]*?)<\/p>((?:\s*(?:<p>(?!\s*<(?:strong|b)>[^<]+[:：]?\s*<\/(?:strong|b)>)[\s\S]*?<\/p>|<ul>[\s\S]*?<\/ul>|<ol>[\s\S]*?<\/ol>|<blockquote>[\s\S]*?<\/blockquote>))*)(?=\s*(?:<h[1-4][\s>]|<hr|<div\s+class="insight-box"|<section|$))/gi,
    (match, rawLabel, firstRest, restBlocks) => {
      const label = String(rawLabel).trim();
      if (!INSIGHT_LABEL_RE.test(label)) return match;
      const body = String(firstRest).trim();
      const bodyHtml = body ? `<p>${body}</p>` : "";
      return `<div class="insight-box"><div class="insight-label">${esc(label)}</div>${bodyHtml}${restBlocks || ""}</div>`;
    },
  );

  // Form 3: list-item bold-prefix form  →  <li><strong>What This Means:</strong> body…</li>
  // Many narrative bullets in the report use this pattern. Style the <li> as an
  // inline gold callout so it visually matches the .insight-box panels above.
  out = out.replace(
    /<li([^>]*)>\s*<(?:strong|b)>\s*([^<:：]+?)\s*[:：]?\s*<\/(?:strong|b)>\s*[:：]?\s*([\s\S]*?)<\/li>/gi,
    (match, attrs, rawLabel, body) => {
      const label = String(rawLabel).trim();
      if (!INSIGHT_LABEL_RE.test(label)) return match;
      return `<li${attrs} class="insight-li"><span class="insight-label-inline">${esc(label)}</span><span class="insight-li-body">${body}</span></li>`;
    },
  );

  // Form 4: bare label paragraph  →  <p><strong>What This Means:</strong></p><p>body…</p>
  // (Form 2 sometimes fails to catch this when the lookahead does not match.)
  out = out.replace(
    /<p>\s*<(?:strong|b)>\s*([^<:：]+?)\s*[:：]?\s*<\/(?:strong|b)>\s*[:：]?\s*<\/p>\s*(<p>[\s\S]*?<\/p>)/gi,
    (match, rawLabel, bodyPara) => {
      const label = String(rawLabel).trim();
      if (!INSIGHT_LABEL_RE.test(label)) return match;
      return `<div class="insight-box"><div class="insight-label">${esc(label)}</div>${bodyPara}</div>`;
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

// ─────────────────────────────────────────────────────────────
// Premium chart engine — Chart.js v4 via QuickChart's /chart endpoint
// (editorial palette, soft shadows, rounded bars, premium typography)
// ─────────────────────────────────────────────────────────────
const CHART_PALETTE = [
  "#C9962B", // signature gold
  "#3F6E8A", // deep slate-blue
  "#6FA86E", // muted sage
  "#A23A28", // burnt sienna
  "#B07A1F", // amber-bronze
  "#5B4A82", // aubergine
  "#8A6F4A", // walnut
];
const FONT_STACK = "Inter, Helvetica, Arial, sans-serif";
const SERIF_STACK = "Playfair Display, Georgia, serif";
const MAX_AUTO_TABLE_CHARTS = 10;

/** Convert #RRGGBB to rgba(r,g,b,a). */
function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

const chartImageCache = new Map<string, string | null>();

function svgEsc(s: unknown): string {
  return esc(s).replace(/"/g, "&quot;");
}

function compactDataUri(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function datasetValues(dataset: any): number[] {
  return Array.isArray(dataset?.data)
    ? dataset.data.map((v: unknown) => num(v)).filter((v: number | null): v is number => v !== null)
    : [];
}

function formatAxisValue(value: number, mode: "money" | "percent" | "plain"): string {
  if (mode === "percent") return `${value.toFixed(Math.abs(value) < 10 ? 1 : 0)}%`;
  if (mode === "money") {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
    return `$${value.toFixed(0)}`;
  }
  return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toFixed(0);
}

function inferAxisMode(config: any): "money" | "percent" | "plain" {
  const blob = JSON.stringify(config || {}).toLowerCase();
  if (blob.includes("$") || /price|cost|value|rent|income|cash|loan|equity|deposit/.test(blob)) return "money";
  if (blob.includes("%") || /yield|rate|growth|return|roi|lvr|ratio/.test(blob)) return "percent";
  return "plain";
}

/**
 * Standardised editorial chart sizes used across the report.
 * Callers should prefer these over ad-hoc dimensions so all charts read as a
 * coherent family.
 *   TREND_WIDE    — line / multi-series time series
 *   BAR_WIDE      — horizontal-feel bar groups, KPI bar comparisons
 *   DONUT_WIDE    — donut/pie with side legend
 *   COMPACT       — small in-flow visualisations
 */
const CHART_PRESETS = {
  TREND_WIDE:  { width: 760, height: 320 },
  BAR_WIDE:    { width: 760, height: 320 },
  DONUT_WIDE:  { width: 720, height: 320 },
  COMPACT:     { width: 480, height: 260 },
} as const;

/**
 * Render a path approximating a rectangle whose TOP two corners are rounded
 * and bottom corners are square. Editorial bar style.
 */
function topRoundedBarPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function renderSvgChart(config: Record<string, unknown>, width: number, height: number): string {
  const cfg: any = config || {};
  const type = String(cfg.type || "bar").toLowerCase();
  const labels = (cfg.data?.labels || []).map((l: unknown) => String(l ?? ""));
  const datasets = Array.isArray(cfg.data?.datasets) ? cfg.data.datasets : [];
  const axisMode = inferAxisMode(cfg);
  // Editorial palette + thinner rules
  const bg = "#FFFDF8";
  const ink = "#2A2317";
  const muted = "#6B604F";
  const grid = "#CFC1A8";
  const baseline = "#9C8C6A";
  const title = String(cfg.options?.plugins?.title?.text || datasets[0]?.label || "");
  // Reserve title strip + legend strip so plot never collides with labels.
  const titleH  = title ? 26 : 8;
  const legendH = datasets.length > 1 ? 24 : 8;
  const plot = {
    x: 62,
    y: titleH + 8,
    w: Math.max(160, width - 86),
    h: Math.max(80, height - titleH - legendH - 36),
  };

  // Tabular figures + crisp Inter axis font.
  const axisFontStyle  = `font-family="Inter,Arial,sans-serif" font-size="10.5" font-style="normal" letter-spacing="0.02em"`;
  const tabular        = `style="font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1;"`;
  const titleFontStyle = `font-family="Playfair Display,Georgia,serif" font-size="14.5" font-weight="700"`;
  const legendFontStyle = `font-family="Inter,Arial,sans-serif" font-size="10.5"`;

  const titleSvg = title
    ? `<text x="${plot.x}" y="20" ${titleFontStyle} fill="${ink}">${svgEsc(title)}</text>`
    : "";

  // Soft paper background only — no double border frame.
  const frame = `<rect x="0" y="0" width="${width}" height="${height}" rx="6" fill="${bg}"/>`;

  // ── Sparkline ────────────────────────────────────────────────────────────
  if (type === "sparkline") {
    const values = datasetValues(datasets[0]);
    if (values.length < 2) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => {
      const x = 8 + (i / (values.length - 1)) * (width - 16);
      const y = height - 8 - ((v - min) / span) * (height - 16);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const color = String(datasets[0]?.borderColor || THEME.gold);
    const area = `${pts[0]} ${pts.slice(1).join(" ")} ${width - 8},${height - 7} 8,${height - 7}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polygon points="${area}" fill="${withAlpha(color, 0.14)}"/><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  // ── Donut / Pie with side legend (value + %) ─────────────────────────────
  if (type === "doughnut" || type === "pie") {
    const values = datasetValues(datasets[0]);
    const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const ringCx = width * 0.30;
    const ringCy = (titleH + height) / 2 + 4;
    const r = Math.min(width * 0.22, (height - titleH) * 0.36);
    const sw = type === "doughnut" ? Math.max(14, r * 0.42) : r;
    let offset = 25;
    const slices = values.map((v, i) => {
      const pct = Math.max(0, v) / total;
      const dash = `${(pct * 100).toFixed(4)} ${(100 - pct * 100).toFixed(4)}`;
      const color = CHART_PALETTE[i % CHART_PALETTE.length];
      const c = `<circle cx="${ringCx}" cy="${ringCy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-dashoffset="${offset}" pathLength="100" transform="rotate(-90 ${ringCx} ${ringCy})"/>`;
      offset -= pct * 100;
      return c;
    }).join("");
    const legendX = ringCx + r + sw / 2 + 28;
    const lineH = 20;
    const startY = ringCy - (values.length - 1) * lineH / 2 - 6;
    const legend = values.map((v, i) => {
      const pct = ((Math.max(0, v) / total) * 100).toFixed(1);
      const y = startY + i * lineH;
      const valueLabel = `${formatAxisValue(v, axisMode)}  ·  ${pct}%`;
      return `<g transform="translate(${legendX},${y})">
        <rect x="0" y="-8" width="10" height="10" rx="2" fill="${CHART_PALETTE[i % CHART_PALETTE.length]}"/>
        <text x="18" y="0" ${legendFontStyle} fill="${ink}">${svgEsc(labels[i] || "")}</text>
        <text x="18" y="13" ${legendFontStyle} ${tabular} fill="${muted}">${svgEsc(valueLabel)}</text>
      </g>`;
    }).join("");
    const inner = type === "doughnut" ? `<circle cx="${ringCx}" cy="${ringCy}" r="${r - sw / 2 - 1}" fill="${bg}"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${frame}${titleSvg}${slices}${inner}${legend}</svg>`;
  }

  // ── Line / Bar ───────────────────────────────────────────────────────────
  const series = datasets.map((d: any, i: number) => ({
    label: String(d?.label || ""),
    values: datasetValues(d),
    color: String(d?.borderColor || (Array.isArray(d?.backgroundColor) ? d.backgroundColor[0] : d?.backgroundColor) || CHART_PALETTE[i % CHART_PALETTE.length]),
  })).filter((d: any) => d.values.length);
  const all = series.flatMap((s: any) => s.values);
  if (!all.length || !labels.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${frame}</svg>`;
  const rawMin = Math.min(0, ...all), rawMax = Math.max(...all, 1);
  const span = rawMax - rawMin || 1;
  const yOf = (v: number) => plot.y + plot.h - ((v - rawMin) / span) * plot.h;

  // 5 gridlines, hairline 0.5pt, soft alpha
  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const t = i / 4;
    const y = plot.y + t * plot.h;
    const val = rawMax - t * span;
    return `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${y}" y2="${y}" stroke="${grid}" stroke-opacity="0.55" stroke-width="0.5"/>` +
      `<text x="${plot.x - 10}" y="${y + 3.5}" text-anchor="end" ${axisFontStyle} ${tabular} fill="${muted}">${formatAxisValue(val, axisMode)}</text>`;
  }).join("");

  let marks = "";
  if (type === "line") {
    marks = series.map((s: any) => {
      const pts = s.values.map((v: number, i: number) => `${(plot.x + (i / Math.max(1, labels.length - 1)) * plot.w).toFixed(1)},${yOf(v).toFixed(1)}`);
      const area = s.values.length > 1
        ? `<polygon points="${pts[0]} ${pts.slice(1).join(" ")} ${plot.x + plot.w},${yOf(0)} ${plot.x},${yOf(0)}" fill="${withAlpha(s.color, 0.10)}"/>`
        : "";
      const dots = pts.map((p: string) => `<circle cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="2.6" fill="${bg}" stroke="${s.color}" stroke-width="1.6"/>`).join("");
      return `${area}<polyline points="${pts.join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
    }).join("");
  } else {
    const groups = labels.length;
    const groupW = plot.w / groups;
    const innerW = groupW * 0.7;
    const barW = Math.max(6, Math.min(34, innerW / Math.max(1, series.length)));
    const corner = Math.min(3, barW / 2.5);
    marks = labels.map((_, i) => series.map((s: any, si: number) => {
      const v = s.values[i] ?? 0;
      const y = yOf(Math.max(v, 0));
      const zero = yOf(0);
      const x = plot.x + i * groupW + (groupW - barW * series.length) / 2 + si * barW;
      const h = Math.max(1, Math.abs(zero - y));
      return `<path d="${topRoundedBarPath(x, Math.min(y, zero), barW - 1.5, h, corner)}" fill="${s.color}" fill-opacity="0.94"/>`;
    }).join("")).join("");
  }
  const xLabels = labels.map((label, i) => {
    const x = type === "line"
      ? plot.x + (i / Math.max(1, labels.length - 1)) * plot.w
      : plot.x + (i + 0.5) * (plot.w / labels.length);
    return `<text x="${x}" y="${plot.y + plot.h + 18}" text-anchor="middle" ${axisFontStyle} fill="${muted}">${svgEsc(label.length > 14 ? label.slice(0, 12) + "…" : label)}</text>`;
  }).join("");
  const legendY = height - 12;
  const legend = series.length > 1
    ? `<g transform="translate(${plot.x},${legendY})">${series.map((s: any, i: number) => `<g transform="translate(${i * 140},0)"><rect x="0" y="-8" width="10" height="10" rx="2" fill="${s.color}"/><text x="16" y="0" ${legendFontStyle} fill="${ink}">${svgEsc(s.label)}</text></g>`).join("")}</g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${frame}${titleSvg}<g>${gridLines}</g><line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${yOf(0)}" y2="${yOf(0)}" stroke="${baseline}" stroke-width="0.6"/>${marks}${xLabels}${legend}</svg>`;
}


/**
 * Serialize a Chart.js config to a JS (not JSON) string so that function-string
 * values — tick callbacks, datalabels formatters, etc. — appear unquoted in the
 * payload and are evaluated by QuickChart's Node/JSDOM sandbox rather than being
 * treated as inert string literals.
 *
 * Rules:
 *  • String values that look like function/arrow-fn expressions → emitted unquoted
 *  • All other string values → JSON-quoted (safe, handles special chars)
 *  • Objects / arrays → recursed
 *  • Primitives (number, boolean, null) → toString as-is
 */
function isFnStr(s: string): boolean {
  const t = s.trim();
  // function(...){...}  |  (v) => ...  |  v => ...
  return /^function[\s(]/.test(t) || /^\(.*\)\s*=>/.test(t) || /^\w+\s*=>/.test(t);
}
function configToJs(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "boolean" || typeof val === "number") return String(val);
  if (typeof val === "string") return isFnStr(val) ? val : JSON.stringify(val);
  if (Array.isArray(val)) return "[" + val.map(configToJs).join(",") + "]";
  if (typeof val === "object") {
    const pairs = Object.entries(val as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        return `${key}:${configToJs(v)}`;
      });
    return "{" + pairs.join(",") + "}";
  }
  return String(val);
}

/**
 * Render charts as compact inline SVG. This avoids QuickChart/Api2PDF network
 * fan-out inside one Edge Function request, which was the root cause of 504s.
 */
async function chartDataUri(config: Record<string, unknown>, width = 720, height = 340, purpose = "chart"): Promise<string | null> {
  const chartJs = configToJs(config);
  const cacheKey = chartJs + `|${width}x${height}`;
  if (chartImageCache.has(cacheKey)) return chartImageCache.get(cacheKey) ?? null;
  try {
    const uri = compactDataUri(renderSvgChart(config, width, height));
    chartImageCache.set(cacheKey, uri);
    return uri;
  } catch (err) {
    console.warn("[charts] inline SVG render error", { purpose, error: err instanceof Error ? err.message : String(err) });
    chartImageCache.set(cacheKey, null);
    return null;
  }
}


async function quickSparklineUrl(values: number[], color: string = THEME.gold): Promise<string | null> {
  const cfg = {
    type: "sparkline",
    data: {
      datasets: [{
        data: values,
        borderColor: color,
        backgroundColor: withAlpha(color, 0.18),
        fill: true,
        borderWidth: 2.2,
        pointRadius: 0,
        tension: 0.4,
      }],
    },
    options: { plugins: { legend: { display: false } } },
  };
  return chartDataUri(cfg, 260, 60, "sparkline");
}

function parseLooseNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[,$%\s]/g, "")
    .replace(/[a-zA-Z]+/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Detect whether a column header suggests a monetary axis. */
function isMoneyHeader(h: string): boolean {
  return /\$|price|cost|value|rent|income|cash|loan|equity|deposit|repay/i.test(h);
}
function isPctHeader(h: string): boolean {
  return /%|yield|rate|growth|return|roi|lvr|ratio/i.test(h);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return parseLooseNumber(v);
  return null;
}

function projectionRows(fin: any): any[] {
  const p = fin?.projections || fin?.tenYearProjections || fin?.yearByYear || fin?.yearOneToTen;
  if (Array.isArray(p)) return p;
  if (p && typeof p === "object") {
    for (const key of ["moderate", "base", "baseline", "conservative", "optimistic"]) {
      if (Array.isArray(p[key])) return p[key];
    }
    const firstArray = Object.values(p).find((v) => Array.isArray(v));
    if (Array.isArray(firstArray)) return firstArray;
  }
  return [];
}

function pickSeries(rows: any[], keys: string[]): number[] | null {
  const vals = rows.map((row) => {
    for (const key of keys) {
      const picked = num(row?.[key]);
      if (picked !== null) return picked;
    }
    return null;
  });
  return vals.length >= 3 && vals.every((v) => v !== null) ? vals as number[] : null;
}

async function tableToChartHtml(headers: string[], rows: string[][]): Promise<string | null> {
  if (rows.length < 2 || rows.length > 14) return null;
  if (headers.length < 2 || headers.length > 6) return null;

  const labels = rows.map((r) => (r[0] || "").slice(0, 28));
  const numericCols: Array<{ header: string; values: number[] }> = [];
  for (let c = 1; c < headers.length; c++) {
    const vals = rows.map((r) => parseLooseNumber(r[c] || ""));
    if (vals.every((v) => v !== null) && vals.length === rows.length) {
      numericCols.push({ header: headers[c], values: vals as number[] });
    }
  }
  if (numericCols.length === 0) return null;

  const cellBlob = rows.map((r) => r.join(" ")).join(" ");
  const headerBlob = headers.join(" ");
  const looksPct = /%/.test(cellBlob) || isPctHeader(headerBlob);
  const looksMoney = /\$/.test(cellBlob) || isMoneyHeader(headerBlob);
  const singleSeries = numericCols.length === 1;
  const isTimeSeries = labels.every((l) => /^(19|20)\d{2}$|^yr\s*\d+$|^year\s*\d+$/i.test(l.trim()));

  const tickCallback = looksPct
    ? "function(v){return v.toFixed(1)+'%';}"
    : looksMoney
      ? "function(v){return Math.abs(v)>=1000?'$'+(v/1000).toFixed(0)+'k':'$'+v.toFixed(0);}"
      : null;

  const commonFont = { family: FONT_STACK, size: 11 };
  const titleFont = { family: SERIF_STACK, size: 14, weight: "600" };
  const gridColor = "rgba(181, 165, 128, 0.25)";
  const tickColor = "#5F5546";

  let config: Record<string, unknown>;

  // ── Donut: single % series with ≤7 rows ──
  if (singleSeries && rows.length <= 7 && looksPct) {
    config = {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: numericCols[0].values,
          backgroundColor: labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
          borderColor: "#FFFDF8",
          borderWidth: 2,
        }],
      },
      options: {
        cutout: "58%",
        plugins: {
          title: { display: true, text: numericCols[0].header, color: "#2A2317", font: titleFont, padding: { top: 8, bottom: 14 } },
          legend: { position: "right", labels: { color: "#17130D", font: commonFont, boxWidth: 12, padding: 10 } },
          datalabels: {
            color: "#FFFDF8", font: { ...commonFont, weight: "600" },
            formatter: "(v)=>v.toFixed(1)+'%'",
          },
        },
      },
    };
    const uri = await chartDataUri(config, CHART_PRESETS.DONUT_WIDE.width, CHART_PRESETS.DONUT_WIDE.height, `donut:${numericCols[0].header}`);
    if (!uri) return null;
    return `<figure class="auto-chart"><img src="${uri}" alt="Data visualisation"/></figure>`;
  }

  // ── Line: time series ──
  if (isTimeSeries) {
    config = {
      type: "line",
      data: {
        labels,
        datasets: numericCols.map((col, i) => {
          const c = CHART_PALETTE[i % CHART_PALETTE.length];
          return {
            label: col.header,
            data: col.values,
            borderColor: c,
            backgroundColor: i === 0 ? withAlpha(c, 0.18) : withAlpha(c, 0.05),
            borderWidth: 2.4,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: c,
            pointBorderColor: "#FFFDF8",
            pointBorderWidth: 1.5,
            fill: i === 0,
          };
        }),
      },
      options: {
        plugins: {
          legend: numericCols.length > 1
            ? { position: "bottom", labels: { color: "#17130D", font: commonFont, boxWidth: 12, padding: 12, usePointStyle: true } }
            : { display: false },
        },
        scales: {
          x: {
            ticks: { color: tickColor, font: commonFont },
            grid: { color: "transparent" },
            border: { color: "#B5A580" },
          },
          y: {
            ticks: tickCallback
              ? { color: tickColor, font: commonFont, callback: tickCallback }
              : { color: tickColor, font: commonFont },
            grid: { color: gridColor, drawBorder: false },
            border: { display: false },
          },
        },
      },
    };
    const uri = await chartDataUri(config, CHART_PRESETS.TREND_WIDE.width, CHART_PRESETS.TREND_WIDE.height, `line:${numericCols.map((c) => c.header).join(",")}`);
    if (!uri) return null;
    return `<figure class="auto-chart"><img src="${uri}" alt="Trend visualisation"/></figure>`;
  }

  // ── Bar (default) ──
  config = {
    type: "bar",
    data: {
      labels,
      datasets: numericCols.map((col, i) => {
        const c = CHART_PALETTE[i % CHART_PALETTE.length];
        return {
          label: col.header,
          data: col.values,
          backgroundColor: withAlpha(c, 0.92),
          borderColor: c,
          borderWidth: 0,
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 42,
        };
      }),
    },
    options: {
      plugins: {
        legend: numericCols.length > 1
          ? { position: "bottom", labels: { color: "#17130D", font: commonFont, boxWidth: 12, padding: 12, usePointStyle: true } }
          : { display: false },
        datalabels: singleSeries
          ? { anchor: "end", align: "top", color: "#2A2317", font: { ...commonFont, weight: "600" },
              formatter: tickCallback || "(v)=>v" }
          : { display: false },
      },
      scales: {
        x: {
          ticks: { color: tickColor, font: commonFont, maxRotation: 30, minRotation: labels.some((l) => l.length > 10) ? 25 : 0 },
          grid: { color: "transparent" },
          border: { color: "#B5A580" },
        },
        y: {
          ticks: tickCallback
            ? { color: tickColor, font: commonFont, callback: tickCallback }
            : { color: tickColor, font: commonFont },
          grid: { color: gridColor, drawBorder: false },
          border: { display: false },
        },
      },
    },
  };
  const uri = await chartDataUri(config, CHART_PRESETS.BAR_WIDE.width, CHART_PRESETS.BAR_WIDE.height, `bar:${numericCols.map((c) => c.header).join(",")}`);
  if (!uri) return null;
  return `<figure class="auto-chart"><img src="${uri}" alt="Data visualisation"/></figure>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITORIAL PRIMITIVES (Tier 2 — items 5–8)
//   • Pull-quotes, sidenotes, multi-column wrappers          (#5)
//   • Inline SVG heatmaps + score wheels                     (#6)
//   • Custom visualisations: gauge + waterfall + compare      (#7)
//   • Footnotes (CSS Paged Media) + "See p. X" cross-refs    (#8)
//
// All shortcodes live in markdown and survive `marked.parse()` because they
// emit block-level HTML, which GFM passes through verbatim. SVG figures are
// rendered server-side so they print at infinite resolution.
// ─────────────────────────────────────────────────────────────────────────────

const VIZ_GOLD     = "#D4A843";
const VIZ_GOLD_SOFT = "#B8893A";
const VIZ_NAVY     = "#0A2540";
const VIZ_INK      = "#2A2317";
const VIZ_INK_MUTED = "#6B604F";
const VIZ_PAPER    = "#FFFDF8";
const VIZ_PAPER_ALT = "#F7EFD9";
const VIZ_RULE     = "#CFC1A8";
const VIZ_GOOD     = "#4F7A33";
const VIZ_WARN     = "#C58A2E";
const VIZ_RISK     = "#A8401C";

function svgEscape(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Half-circle gauge — KPI score visualiser. */
function renderGaugeSvg(value: number, max = 100, label = "", caption = ""): string {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const pct = v / max;
  const w = 460, h = 260;
  const cx = w / 2, cy = 180, r = 130;
  // Arc geometry: 180° (left -180°) → 0° (right). Sweep `pct` of that.
  const startA = Math.PI;          // left
  const endA   = Math.PI + Math.PI * pct;
  const polarX = (a: number) => cx + r * Math.cos(a);
  const polarY = (a: number) => cy + r * Math.sin(a);
  const largeArc = pct > 0.5 ? 1 : 0;
  const trackPath = `M ${polarX(Math.PI)} ${polarY(Math.PI)} A ${r} ${r} 0 1 1 ${polarX(2 * Math.PI - 0.0001)} ${polarY(2 * Math.PI - 0.0001)}`;
  const valuePath = pct > 0
    ? `M ${polarX(startA)} ${polarY(startA)} A ${r} ${r} 0 ${largeArc} 1 ${polarX(endA)} ${polarY(endA)}`
    : "";
  // Tick marks every 10%
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = Math.PI + (i / 10) * Math.PI;
    const x1 = cx + (r - 10) * Math.cos(a), y1 = cy + (r - 10) * Math.sin(a);
    const x2 = cx + (r + 2)  * Math.cos(a), y2 = cy + (r + 2)  * Math.sin(a);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${VIZ_RULE}" stroke-width="${i % 5 === 0 ? 1.4 : 0.6}"/>`;
  }).join("");
  const band = v / max >= 0.8 ? "Strong"
             : v / max >= 0.65 ? "Solid"
             : v / max >= 0.5 ? "Mixed" : "Cautious";
  const bandColor = v / max >= 0.65 ? VIZ_GOOD : v / max >= 0.5 ? VIZ_WARN : VIZ_RISK;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${VIZ_GOLD_SOFT}"/><stop offset="1" stop-color="${VIZ_GOLD}"/>
      </linearGradient>
    </defs>
    <path d="${trackPath}" stroke="${VIZ_PAPER_ALT}" stroke-width="22" fill="none" stroke-linecap="round"/>
    ${valuePath ? `<path d="${valuePath}" stroke="url(#gauge-fill)" stroke-width="22" fill="none" stroke-linecap="round"/>` : ""}
    <g>${ticks}</g>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="Playfair Display,Georgia,serif" font-weight="800" font-size="62" fill="${VIZ_INK}" style="font-variant-numeric:lining-nums tabular-nums;">${Math.round(v)}</text>
    <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" letter-spacing="2.6" fill="${VIZ_INK_MUTED}">${svgEscape(("/" + max + "  ·  " + band).toUpperCase())}</text>
    <rect x="${cx - 38}" y="${cy + 30}" width="76" height="3" fill="${bandColor}" rx="1.5"/>
    ${label ? `<text x="${cx}" y="42" text-anchor="middle" font-family="Playfair Display,Georgia,serif" font-weight="700" font-size="18" fill="${VIZ_INK}">${svgEscape(label)}</text>` : ""}
    ${caption ? `<text x="${cx}" y="62" text-anchor="middle" font-family="Inter,sans-serif" font-size="9.5" fill="${VIZ_INK_MUTED}" letter-spacing="1.4">${svgEscape(caption.toUpperCase())}</text>` : ""}
  </svg>`;
}

/** Waterfall chart — show cumulative cash-flow build-up (positive + negative bars). */
function renderWaterfallSvg(items: Array<{ label: string; value: number; total?: boolean }>): string {
  if (!items.length) return "";
  const w = 760, h = 360, padL = 70, padR = 24, padT = 30, padB = 70;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  // Compute running totals to find y-range
  let running = 0;
  const bars = items.map((it) => {
    const start = it.total ? 0 : running;
    const end   = it.total ? it.value : running + it.value;
    if (!it.total) running += it.value;
    else running = it.value;
    return { ...it, start, end };
  });
  const allY = bars.flatMap((b) => [b.start, b.end, 0]);
  const yMin = Math.min(...allY), yMax = Math.max(...allY);
  const span = (yMax - yMin) || 1;
  const yOf = (v: number) => padT + plotH - ((v - yMin) / span) * plotH;
  const barW = Math.max(18, Math.min(58, (plotW / bars.length) * 0.62));
  const groupW = plotW / bars.length;
  // Gridlines
  const grid = Array.from({ length: 5 }, (_, i) => {
    const t = i / 4;
    const yv = yMax - t * span;
    const y = padT + t * plotH;
    return `<line x1="${padL}" x2="${w - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${VIZ_RULE}" stroke-opacity="0.5" stroke-width="0.5"/>
      <text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-family="Inter,sans-serif" font-size="9.5" fill="${VIZ_INK_MUTED}" style="font-variant-numeric:tabular-nums;">${formatAxisValue(yv, "money")}</text>`;
  }).join("");
  const zeroY = yOf(0);
  // Bars + connectors
  let connectors = "";
  const rects = bars.map((b, i) => {
    const cx = padL + i * groupW + groupW / 2;
    const x = cx - barW / 2;
    const yTop = yOf(Math.max(b.start, b.end));
    const yBot = yOf(Math.min(b.start, b.end));
    const isUp = b.end >= b.start;
    const color = b.total ? VIZ_NAVY : isUp ? VIZ_GOOD : VIZ_RISK;
    const valTxt = formatAxisValue(b.end - b.start, "money");
    const labelY = yTop - 8;
    if (i < bars.length - 1) {
      const nextStart = bars[i + 1].start;
      connectors += `<line x1="${x + barW}" y1="${yOf(b.end)}" x2="${padL + (i + 1) * groupW + groupW / 2 - barW / 2}" y2="${yOf(nextStart)}" stroke="${VIZ_RULE}" stroke-dasharray="3 3" stroke-width="0.7"/>`;
    }
    return `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW}" height="${Math.max(2, yBot - yTop).toFixed(1)}" fill="${color}" fill-opacity="0.92" rx="2"/>
      <text x="${cx}" y="${labelY.toFixed(1)}" text-anchor="middle" font-family="Inter,sans-serif" font-weight="600" font-size="9.5" fill="${VIZ_INK}" style="font-variant-numeric:tabular-nums;">${svgEscape(valTxt)}</text>
      <text x="${cx}" y="${(h - padB + 16).toFixed(1)}" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" fill="${VIZ_INK_MUTED}">${svgEscape(b.label.length > 16 ? b.label.slice(0, 14) + "…" : b.label)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="${VIZ_PAPER}"/>
    <g>${grid}</g>
    <line x1="${padL}" x2="${w - padR}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="${VIZ_INK_MUTED}" stroke-width="0.8"/>
    ${connectors}
    ${rects}
  </svg>`;
}

/** Heatmap — m×n grid with gold-saturation cells. Useful for suburb growth matrices. */
function renderHeatmapSvg(grid: number[][], rowLabels: string[] = [], colLabels: string[] = [], title = ""): string {
  if (!grid.length || !grid[0]?.length) return "";
  const rows = grid.length, cols = grid[0].length;
  const flat = grid.flat();
  const lo = Math.min(...flat), hi = Math.max(...flat), span = (hi - lo) || 1;
  const padL = 110, padT = title ? 50 : 30, padR = 18, padB = 26;
  const cellW = 56, cellH = 36;
  const w = padL + padR + cols * cellW;
  const h = padT + padB + rows * cellH;
  const colorFor = (v: number) => {
    const t = (v - lo) / span;
    // Interpolate between cream and deep navy via gold midpoint.
    const a = Math.round(0.08 + t * 0.82 * 100) / 100;
    return `rgba(212,168,67,${a.toFixed(2)})`;
  };
  let cells = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = grid[r][c];
      const x = padL + c * cellW, y = padT + r * cellH;
      cells += `<rect x="${x}" y="${y}" width="${cellW - 1}" height="${cellH - 1}" rx="1.5" fill="${colorFor(v)}" stroke="${VIZ_PAPER}" stroke-width="1"/>
        <text x="${x + cellW / 2}" y="${y + cellH / 2 + 3.5}" text-anchor="middle" font-family="Inter,sans-serif" font-size="9.5" font-weight="600" fill="${VIZ_INK}" style="font-variant-numeric:tabular-nums;">${svgEscape(Number.isInteger(v) ? String(v) : v.toFixed(1))}</text>`;
    }
  }
  const rowL = rowLabels.map((lbl, r) => `<text x="${padL - 8}" y="${padT + r * cellH + cellH / 2 + 3.5}" text-anchor="end" font-family="Inter,sans-serif" font-size="9.5" fill="${VIZ_INK_MUTED}">${svgEscape(lbl)}</text>`).join("");
  const colL = colLabels.map((lbl, c) => `<text x="${padL + c * cellW + cellW / 2}" y="${padT - 8}" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" fill="${VIZ_INK_MUTED}" letter-spacing="0.5">${svgEscape(lbl)}</text>`).join("");
  const t = title ? `<text x="${padL}" y="22" font-family="Playfair Display,Georgia,serif" font-weight="700" font-size="14" fill="${VIZ_INK}">${svgEscape(title)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="${w}" height="${h}" rx="6" fill="${VIZ_PAPER}"/>
    ${t}${colL}${rowL}${cells}
  </svg>`;
}

/** Score wheel — radar/polar for multi-dimensional scoring. */
function renderScoreWheelSvg(scores: number[], labels: string[] = [], max = 100): string {
  if (scores.length < 3) return "";
  const w = 460, h = 360, cx = w / 2, cy = h / 2 + 8, R = 130;
  const n = scores.length;
  const angle = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const pt = (i: number, r: number) => `${(cx + r * Math.cos(angle(i))).toFixed(1)},${(cy + r * Math.sin(angle(i))).toFixed(1)}`;
  // Rings
  const rings = [0.25, 0.5, 0.75, 1].map((t) =>
    `<polygon points="${Array.from({ length: n }, (_, i) => pt(i, R * t)).join(" ")}" fill="none" stroke="${VIZ_RULE}" stroke-opacity="${0.4 + t * 0.2}" stroke-width="0.6"/>`,
  ).join("");
  const spokes = Array.from({ length: n }, (_, i) => `<line x1="${cx}" y1="${cy}" x2="${(cx + R * Math.cos(angle(i))).toFixed(1)}" y2="${(cy + R * Math.sin(angle(i))).toFixed(1)}" stroke="${VIZ_RULE}" stroke-width="0.5"/>`).join("");
  const polyPts = scores.map((s, i) => pt(i, R * Math.max(0, Math.min(1, (Number(s) || 0) / max)))).join(" ");
  const dots = scores.map((s, i) => {
    const r = R * Math.max(0, Math.min(1, (Number(s) || 0) / max));
    return `<circle cx="${(cx + r * Math.cos(angle(i))).toFixed(1)}" cy="${(cy + r * Math.sin(angle(i))).toFixed(1)}" r="3" fill="${VIZ_GOLD}" stroke="${VIZ_PAPER}" stroke-width="1"/>`;
  }).join("");
  const lbls = (labels.length ? labels : scores.map((_, i) => `D${i + 1}`)).map((lbl, i) => {
    const a = angle(i);
    const lx = cx + (R + 22) * Math.cos(a);
    const ly = cy + (R + 22) * Math.sin(a);
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
    return `<text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" text-anchor="${anchor}" font-family="Inter,sans-serif" font-size="9.5" fill="${VIZ_INK_MUTED}" letter-spacing="0.4">${svgEscape(lbl.toUpperCase())}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 15).toFixed(1)}" text-anchor="${anchor}" font-family="Playfair Display,Georgia,serif" font-weight="700" font-size="11" fill="${VIZ_INK}" style="font-variant-numeric:tabular-nums;">${Math.round(Number(scores[i]) || 0)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="${w}" height="${h}" rx="6" fill="${VIZ_PAPER}"/>
    ${rings}${spokes}
    <polygon points="${polyPts}" fill="${VIZ_GOLD}" fill-opacity="0.18" stroke="${VIZ_GOLD_SOFT}" stroke-width="1.6" stroke-linejoin="round"/>
    ${dots}${lbls}
  </svg>`;
}

/** Bullet chart — compact KPI with actual / target / range bands (Tufte-style). */
function renderBulletSvg(opts: { value: number; target?: number; max?: number; ranges?: number[]; label?: string; sub?: string }): string {
  const max = opts.max ?? Math.max(opts.value, opts.target ?? 0, ...(opts.ranges || []), 1);
  const w = 520, h = 78;
  const padL = 150, padR = 14, padT = 26, padB = 14;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const xOf = (v: number) => padL + (Math.max(0, Math.min(max, v)) / max) * plotW;
  const ranges = (opts.ranges && opts.ranges.length ? opts.ranges : [max * 0.4, max * 0.7, max]).slice().sort((a, b) => a - b);
  const bands = ranges.map((r, i) => {
    const prev = i === 0 ? 0 : ranges[i - 1];
    const alpha = 0.18 + (i / Math.max(1, ranges.length - 1)) * 0.42;
    return `<rect x="${xOf(prev).toFixed(1)}" y="${padT}" width="${(xOf(r) - xOf(prev)).toFixed(1)}" height="${plotH}" fill="${VIZ_GOLD}" fill-opacity="${alpha.toFixed(2)}"/>`;
  }).join("");
  const barH = plotH * 0.42;
  const barY = padT + (plotH - barH) / 2;
  const bar = `<rect x="${padL}" y="${barY}" width="${(xOf(opts.value) - padL).toFixed(1)}" height="${barH}" fill="${VIZ_INK}" rx="1"/>`;
  const tgt = opts.target != null
    ? `<line x1="${xOf(opts.target).toFixed(1)}" x2="${xOf(opts.target).toFixed(1)}" y1="${padT + 2}" y2="${padT + plotH - 2}" stroke="${VIZ_RISK}" stroke-width="3"/>`
    : "";
  const label = opts.label ? `<text x="${padL - 12}" y="${padT + plotH / 2 - 2}" text-anchor="end" font-family="Playfair Display,Georgia,serif" font-weight="700" font-size="12" fill="${VIZ_INK}">${svgEscape(opts.label)}</text>` : "";
  const sub = opts.sub ? `<text x="${padL - 12}" y="${padT + plotH / 2 + 13}" text-anchor="end" font-family="Inter,sans-serif" font-size="8.5" fill="${VIZ_INK_MUTED}" letter-spacing="0.6">${svgEscape(opts.sub.toUpperCase())}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="${w}" height="${h}" fill="${VIZ_PAPER}" rx="4"/>${bands}${bar}${tgt}${label}${sub}
  </svg>`;
}

/** Marimekko — variable-width stacked bars (composition + magnitude). */
function renderMarimekkoSvg(rows: Array<{ label: string; weight: number; segments: number[] }>, segLabels: string[] = []): string {
  if (!rows.length) return "";
  const w = 760, h = 360, padL = 90, padR = 20, padT = 32, padB = 50;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const totalWeight = rows.reduce((a, r) => a + (r.weight || 0), 0) || 1;
  const palette = [VIZ_GOLD, VIZ_NAVY, VIZ_GOOD, VIZ_WARN, VIZ_RISK, VIZ_INK_MUTED];
  let x = padL;
  const groups = rows.map((row) => {
    const colW = ((row.weight || 0) / totalWeight) * plotW;
    const sum = row.segments.reduce((a, b) => a + b, 0) || 1;
    let y = padT;
    const segs = row.segments.map((v, i) => {
      const segH = (v / sum) * plotH;
      const r = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(colW - 1).toFixed(1)}" height="${segH.toFixed(1)}" fill="${palette[i % palette.length]}" fill-opacity="0.85"/>
        ${segH > 16 ? `<text x="${(x + colW / 2).toFixed(1)}" y="${(y + segH / 2 + 3.5).toFixed(1)}" text-anchor="middle" font-family="Inter,sans-serif" font-weight="700" font-size="10" fill="${VIZ_PAPER}">${Math.round((v / sum) * 100)}%</text>` : ""}`;
      y += segH;
      return r;
    }).join("");
    const lbl = `<text x="${(x + colW / 2).toFixed(1)}" y="${(h - padB + 16).toFixed(1)}" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" fill="${VIZ_INK}">${svgEscape(row.label)}</text>`;
    const x0 = x; x += colW;
    return segs + lbl;
  }).join("");
  const legend = segLabels.map((lbl, i) => {
    const lx = padL + i * 110;
    return `<rect x="${lx}" y="10" width="10" height="10" fill="${palette[i % palette.length]}"/><text x="${lx + 14}" y="19" font-family="Inter,sans-serif" font-size="9" fill="${VIZ_INK_MUTED}" letter-spacing="0.5">${svgEscape(lbl.toUpperCase())}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="${w}" height="${h}" fill="${VIZ_PAPER}" rx="6"/>${legend}${groups}
  </svg>`;
}

/** Micro-map — abstract suburb locator (concentric rings + cardinal markers + pin). */
function renderMicroMapSvg(opts: { suburb: string; state?: string; postcode?: string; neighbours?: string[] }): string {
  const w = 460, h = 320, cx = w / 2, cy = h / 2 + 6;
  const rings = [120, 84, 50].map((r, i) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${i === 2 ? withAlphaHex(VIZ_GOLD, 0.18) : "none"}" stroke="${VIZ_RULE}" stroke-width="0.7" stroke-dasharray="${i === 0 ? "3 4" : "1 2"}"/>`).join("");
  const compass = `
    <text x="${cx}" y="${cy - 128}" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" fill="${VIZ_INK_MUTED}" letter-spacing="2">N</text>
    <text x="${cx}" y="${cy + 138}" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" fill="${VIZ_INK_MUTED}" letter-spacing="2">S</text>
    <text x="${cx + 132}" y="${cy + 4}" text-anchor="start" font-family="Inter,sans-serif" font-size="9" fill="${VIZ_INK_MUTED}" letter-spacing="2">E</text>
    <text x="${cx - 132}" y="${cy + 4}" text-anchor="end" font-family="Inter,sans-serif" font-size="9" fill="${VIZ_INK_MUTED}" letter-spacing="2">W</text>`;
  const neighbours = (opts.neighbours || []).slice(0, 6);
  const nbDots = neighbours.map((nb, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, neighbours.length)) * Math.PI * 2;
    const r = 100;
    const nx = cx + r * Math.cos(a), ny = cy + r * Math.sin(a);
    return `<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="3" fill="${VIZ_INK_MUTED}"/>
      <text x="${(nx + (Math.cos(a) > 0 ? 6 : -6)).toFixed(1)}" y="${(ny + 3.5).toFixed(1)}" text-anchor="${Math.cos(a) > 0.1 ? "start" : Math.cos(a) < -0.1 ? "end" : "middle"}" font-family="Inter,sans-serif" font-size="8.5" fill="${VIZ_INK_MUTED}">${svgEscape(nb)}</text>`;
  }).join("");
  const pin = `
    <path d="M ${cx} ${cy - 18} C ${cx - 14} ${cy - 18} ${cx - 14} ${cy + 2} ${cx} ${cy + 14} C ${cx + 14} ${cy + 2} ${cx + 14} ${cy - 18} ${cx} ${cy - 18} Z" fill="${VIZ_GOLD}" stroke="${VIZ_INK}" stroke-width="1.2"/>
    <circle cx="${cx}" cy="${cy - 8}" r="4.5" fill="${VIZ_PAPER}"/>`;
  const title = `<text x="${cx}" y="28" text-anchor="middle" font-family="Playfair Display,Georgia,serif" font-weight="700" font-size="16" fill="${VIZ_INK}">${svgEscape(opts.suburb)}</text>
    <text x="${cx}" y="44" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" letter-spacing="2.5" fill="${VIZ_INK_MUTED}">${svgEscape([opts.state, opts.postcode].filter(Boolean).join(" · ").toUpperCase())}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="${w}" height="${h}" fill="${VIZ_PAPER}" rx="6"/>${title}${rings}${compass}${nbDots}${pin}
  </svg>`;
}

/** Calendar heatmap — 12-month grid (or arbitrary cells). */
function renderCalendarHeatmapSvg(values: number[], title = "", monthLabels: string[] = []): string {
  if (!values.length) return "";
  const months = monthLabels.length === values.length ? monthLabels : ["J","F","M","A","M","J","J","A","S","O","N","D"].slice(0, values.length);
  const lo = Math.min(...values), hi = Math.max(...values), span = (hi - lo) || 1;
  const cellW = 44, cellH = 44, gap = 4;
  const cols = Math.min(12, values.length);
  const rows = Math.ceil(values.length / cols);
  const padL = 16, padT = title ? 40 : 18, padR = 16, padB = 22;
  const w = padL + padR + cols * (cellW + gap) - gap;
  const h = padT + padB + rows * (cellH + gap) - gap;
  const cells = values.map((v, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const x = padL + c * (cellW + gap), y = padT + r * (cellH + gap);
    const t = (v - lo) / span;
    const fill = `rgba(212,168,67,${(0.12 + t * 0.78).toFixed(2)})`;
    return `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="3" fill="${fill}" stroke="${VIZ_RULE}" stroke-width="0.4"/>
      <text x="${x + cellW / 2}" y="${y + 16}" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" fill="${VIZ_INK_MUTED}" letter-spacing="0.5">${svgEscape(months[i] || "")}</text>
      <text x="${x + cellW / 2}" y="${y + cellH - 10}" text-anchor="middle" font-family="Playfair Display,Georgia,serif" font-weight="700" font-size="12" fill="${VIZ_INK}" style="font-variant-numeric:tabular-nums;">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`;
  }).join("");
  const t = title ? `<text x="${padL}" y="22" font-family="Playfair Display,Georgia,serif" font-weight="700" font-size="14" fill="${VIZ_INK}">${svgEscape(title)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="${w}" height="${h}" fill="${VIZ_PAPER}" rx="6"/>${t}${cells}
  </svg>`;
}

function withAlphaHex(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Wrap an SVG into a print-ready figure with optional caption. */
function vizFigure(svg: string, caption = ""): string {
  return `<figure class="vis-figure">${svg}${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}</figure>`;
}

/**
 * Pre-marked markdown processor: turns editorial shortcodes into block-level
 * HTML so they survive `marked.parse()` untouched.
 *
 * Supported syntax:
 *   ::: pullquote
 *   The quoted line.
 *   :::
 *
 *   ::: sidenote
 *   Aside text.
 *   :::
 *
 *   ::: cols                          (two-column flow)
 *   long paragraph body…
 *   :::
 *
 *   {{gauge: 72 | Investment Score | Weighted composite}}
 *   {{waterfall: Rent +24000, Interest -18000, Tax -3200, Total =2800}}
 *   {{heatmap: 1,2,3 / 4,5,6 / 7,8,9 | rows=A,B,C | cols=X,Y,Z | title=Growth}}
 *   {{wheel: 78,64,82,71,55 | labels=Yield,Growth,Risk,Demand,Infra}}
 *
 *   [[see:#anchor]]                   (cross-reference; resolved to page #)
 *   [^1]                              (footnote call; def below)
 *   [^1]: Footnote definition text.
 */
function applyEditorialMarkdown(md: string): string {
  let out = md;

  // Fenced editorial blocks with optional `key=value` attributes on the opening fence.
  // Examples:
  //   ::: divider stat="78" label="Investment score" eyebrow="Chapter 04"
  //   The chapter title or sub-heading goes here.
  //   :::
  //
  //   ::: quote-page attribution="— RBA, May 2026"
  //   The fully-spread editorial quote sits here.
  //   :::
  out = out.replace(
    /^::: *(pullquote|sidenote|cols|divider|quote-page|stat|dashboard|signature) *([^\n]*)\n([\s\S]*?)\n::: *$/gm,
    (_m, name, attrRaw, body) => {
      const inner = String(body).trim();
      const attrs: Record<string, string> = {};
      String(attrRaw || "").replace(/(\w[\w-]*)\s*=\s*"([^"]*)"/g, (_x, k, v) => {
        attrs[String(k).toLowerCase()] = String(v);
        return "";
      });
      if (name === "pullquote") return `\n<aside class="pull-quote"><p>${inner.replace(/\n+/g, " ")}</p></aside>\n`;
      if (name === "sidenote") return `\n<aside class="sidenote"><p>${inner.replace(/\n+/g, " ")}</p></aside>\n`;
      if (name === "cols") return `\n<div class="two-col">\n\n${inner}\n\n</div>\n`;
      if (name === "stat") {
        // Inline oversized statistic block: ::: stat label="Median yield" unit="%"  → body = "4.8"
        const label = esc(attrs.label || "");
        const unit = esc(attrs.unit || "");
        const sub = esc(attrs.sub || "");
        return `\n<div class="stat-block"><div class="stat-value">${esc(inner)}${unit ? `<span class="stat-unit">${unit}</span>` : ""}</div>${label ? `<div class="stat-label">${label}</div>` : ""}${sub ? `<div class="stat-sub">${sub}</div>` : ""}</div>\n`;
      }
      if (name === "divider") {
        // Full-bleed section divider with oversized stat + label + headline.
        const stat = esc(attrs.stat || "");
        const label = esc(attrs.label || "");
        const eyebrow = esc(attrs.eyebrow || "");
        const headline = esc(inner.replace(/\n+/g, " "));
        return `\n<section class="section-divider">
          ${eyebrow ? `<div class="sd-eyebrow">${eyebrow}</div>` : ""}
          ${stat ? `<div class="sd-stat">${stat}</div>` : ""}
          ${label ? `<div class="sd-label">${label}</div>` : ""}
          ${headline ? `<div class="sd-headline">${headline}</div>` : ""}
        </section>\n`;
      }
      if (name === "quote-page") {
        const attribution = esc(attrs.attribution || "");
        const eyebrow = esc(attrs.eyebrow || "Chapter quote");
        return `\n<section class="quote-page">
          <div class="qp-eyebrow">${eyebrow}</div>
          <blockquote class="qp-body">${esc(inner.replace(/\n+/g, " "))}</blockquote>
          ${attribution ? `<div class="qp-attrib">${attribution}</div>` : ""}
        </section>\n`;
      }
      if (name === "dashboard") {
        // ::: dashboard eyebrow="..." title="..." big="3.2%" bigLabel="Yield" spark="1,2,3,4" peers="Avg 2.8|This 3.2|Top 3.9" map="Suburb,VIC,3000"
        const eyebrow = esc(attrs.eyebrow || "Snapshot");
        const title = esc(attrs.title || inner.split("\n")[0] || "Dashboard");
        const big = esc(attrs.big || "");
        const bigLabel = esc(attrs.biglabel || attrs.big_label || "");
        const sparkVals = (attrs.spark || "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
        const sparkSvg = sparkVals.length >= 2 ? (() => {
          const w = 320, h = 70, lo = Math.min(...sparkVals), hi = Math.max(...sparkVals), span = (hi - lo) || 1;
          const pts = sparkVals.map((v, i) => `${(i / (sparkVals.length - 1)) * w},${h - 4 - ((v - lo) / span) * (h - 12)}`).join(" ");
          return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%"><polyline points="${pts}" fill="none" stroke="${VIZ_GOLD}" stroke-width="2.5"/></svg>`;
        })() : "";
        const peerRows = (attrs.peers || "").split("|").map((p) => p.trim()).filter(Boolean).map((p) => {
          const m = p.match(/^(.+?)\s+([\d.,%$\-]+)$/);
          const label = m ? m[1] : p, val = m ? m[2] : "";
          return `<div class="dash-peer-row"><span>${esc(label)}</span><span>${esc(val)}</span></div>`;
        }).join("");
        let mapSvg = "";
        if (attrs.map) {
          const [sub, st, pc, ...nb] = attrs.map.split(",").map((s) => s.trim());
          mapSvg = renderMicroMapSvg({ suburb: sub, state: st, postcode: pc, neighbours: nb });
        }
        const narrative = inner.split("\n").slice(1).join(" ").trim();
        return `\n<section class="dashboard-page">
          <div class="dp-eyebrow">${eyebrow}</div>
          <h2 class="dp-title">${title}</h2>
          <div class="dp-grid">
            <div class="dp-big-cell">
              <div class="dp-big-value">${big}</div>
              ${bigLabel ? `<div class="dp-big-label">${bigLabel}</div>` : ""}
              ${sparkSvg ? `<div class="dp-spark">${sparkSvg}</div>` : ""}
            </div>
            ${peerRows ? `<div class="dp-peers"><div class="dp-peers-title">Peer benchmark</div>${peerRows}</div>` : ""}
            ${mapSvg ? `<div class="dp-map">${mapSvg}</div>` : ""}
          </div>
          ${narrative ? `<p class="dp-narrative">${esc(narrative)}</p>` : ""}
        </section>\n`;
      }
      if (name === "signature") {
        const name1 = esc(attrs.name || "");
        const role = esc(attrs.role || "");
        const company = esc(attrs.company || "");
        const date = esc(attrs.date || new Date().toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" }));
        const qrUrl = attrs.qr ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&format=svg&qzone=1&data=${encodeURIComponent(attrs.qr)}` : "";
        const body = esc(inner.replace(/\n+/g, " "));
        // SVG ribbon signature placeholder (looks like handwriting).
        const sigSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 80" width="220"><path d="M8 56 C 30 8, 60 78, 90 30 S 150 70, 180 26 S 250 70, 312 22" fill="none" stroke="${VIZ_INK}" stroke-width="2.2" stroke-linecap="round"/><path d="M40 64 L 280 64" stroke="${VIZ_RULE}" stroke-width="0.6"/></svg>`;
        return `\n<section class="signature-page">
          <div class="sg-eyebrow">${esc(attrs.eyebrow || "Personally prepared")}</div>
          <p class="sg-body">${body}</p>
          <div class="sg-row">
            <div class="sg-sig">
              <div class="sg-sig-mark">${sigSvg}</div>
              <div class="sg-sig-name">${name1}</div>
              ${role ? `<div class="sg-sig-role">${role}</div>` : ""}
              ${company ? `<div class="sg-sig-company">${company}</div>` : ""}
              <div class="sg-sig-date">${date}</div>
            </div>
            ${qrUrl ? `<div class="sg-qr"><img src="${qrUrl}" alt="Scan to verify"/><div class="sg-qr-cap">Scan to verify</div></div>` : ""}
          </div>
        </section>\n`;
      }
      return _m;
    },
  );

  // {{bullet: VALUE | target=80 | max=100 | label=… | sub=…}}
  out = out.replace(/\{\{bullet:\s*([^}]+)\}\}/gi, (_m, args) => {
    const parts = String(args).split("|").map((s) => s.trim());
    const value = Number(parts[0]); if (!Number.isFinite(value)) return _m;
    const opts: Record<string, string> = {};
    for (const p of parts.slice(1)) { const m = p.match(/^(target|max|label|sub|ranges)\s*=\s*(.+)$/i); if (m) opts[m[1].toLowerCase()] = m[2]; }
    const ranges = opts.ranges ? opts.ranges.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)) : undefined;
    return vizFigure(renderBulletSvg({ value, target: opts.target ? Number(opts.target) : undefined, max: opts.max ? Number(opts.max) : undefined, label: opts.label, sub: opts.sub, ranges }), opts.label || "");
  });

  // {{marimekko: rowLabel*weight: s1,s2,s3 | rowLabel*weight: s1,s2,s3 | legend=A,B,C}}
  out = out.replace(/\{\{marimekko:\s*([^}]+)\}\}/gi, (_m, args) => {
    const parts = String(args).split("|").map((s) => s.trim());
    let legend: string[] = [];
    const rows = parts.map((p) => {
      const leg = p.match(/^legend\s*=\s*(.+)$/i); if (leg) { legend = leg[1].split(",").map((s) => s.trim()); return null; }
      const m = p.match(/^(.+?)\*([\d.]+)\s*:\s*(.+)$/); if (!m) return null;
      return { label: m[1].trim(), weight: Number(m[2]) || 1, segments: m[3].split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)) };
    }).filter(Boolean) as Array<{ label: string; weight: number; segments: number[] }>;
    if (!rows.length) return _m;
    return vizFigure(renderMarimekkoSvg(rows, legend), "Composition × magnitude");
  });

  // {{micromap: Suburb | state=VIC | postcode=3000 | neighbours=A,B,C}}
  out = out.replace(/\{\{micromap:\s*([^}]+)\}\}/gi, (_m, args) => {
    const parts = String(args).split("|").map((s) => s.trim());
    const suburb = parts[0]; if (!suburb) return _m;
    const opts: Record<string, string> = {};
    for (const p of parts.slice(1)) { const m = p.match(/^(state|postcode|neighbours)\s*=\s*(.+)$/i); if (m) opts[m[1].toLowerCase()] = m[2]; }
    return vizFigure(renderMicroMapSvg({ suburb, state: opts.state, postcode: opts.postcode, neighbours: opts.neighbours ? opts.neighbours.split(",").map((s) => s.trim()) : [] }), `${suburb} locator`);
  });

  // {{calendar: 1,2,3,4,5,6,7,8,9,10,11,12 | title=Sales by month | months=Jan,Feb,…}}
  out = out.replace(/\{\{calendar:\s*([^}]+)\}\}/gi, (_m, args) => {
    const parts = String(args).split("|").map((s) => s.trim());
    const vals = parts[0].split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    if (!vals.length) return _m;
    const opts: Record<string, string> = {};
    for (const p of parts.slice(1)) { const m = p.match(/^(title|months)\s*=\s*(.+)$/i); if (m) opts[m[1].toLowerCase()] = m[2]; }
    const months = opts.months ? opts.months.split(",").map((s) => s.trim()) : [];
    return vizFigure(renderCalendarHeatmapSvg(vals, opts.title || "", months), opts.title || "");
  });

  // {{gauge: VALUE [/ MAX] | LABEL | CAPTION}}
  out = out.replace(/\{\{gauge:\s*([^}]+)\}\}/gi, (_m, args) => {
    const parts = String(args).split("|").map((s) => s.trim());
    const [val, label = "", caption = ""] = parts;
    const [v, max = "100"] = val.split("/").map((s) => s.trim());
    return vizFigure(renderGaugeSvg(Number(v) || 0, Number(max) || 100, label, caption), caption ? "" : label);
  });

  // {{waterfall: Label1 +123, Label2 -45, Total =78}}
  out = out.replace(/\{\{waterfall:\s*([^}]+)\}\}/gi, (_m, args) => {
    const items = String(args).split(/[,;]/).map((seg) => {
      const m = seg.trim().match(/^(.+?)\s*([=+\-])\s*([\d.,$\s-]+)$/);
      if (!m) return null;
      const label = m[1].trim();
      const total = m[2] === "=";
      const value = parseLooseNumber(m[3]) ?? 0;
      return { label, value, total };
    }).filter(Boolean) as Array<{ label: string; value: number; total?: boolean }>;
    if (!items.length) return _m;
    return vizFigure(renderWaterfallSvg(items), "Cash-flow waterfall");
  });

  // {{heatmap: r1c1,r1c2 / r2c1,r2c2 | rows=A,B | cols=X,Y | title=…}}
  out = out.replace(/\{\{heatmap:\s*([^}]+)\}\}/gi, (_m, args) => {
    const parts = String(args).split("|").map((s) => s.trim());
    const grid = parts[0].split("/").map((row) => row.split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n)));
    if (!grid.length || !grid[0].length) return _m;
    const opts: Record<string, string> = {};
    for (const p of parts.slice(1)) {
      const m = p.match(/^(rows|cols|title)\s*=\s*(.+)$/i);
      if (m) opts[m[1].toLowerCase()] = m[2];
    }
    const rowLabels = opts.rows ? opts.rows.split(",").map((s) => s.trim()) : [];
    const colLabels = opts.cols ? opts.cols.split(",").map((s) => s.trim()) : [];
    return vizFigure(renderHeatmapSvg(grid, rowLabels, colLabels, opts.title || ""), opts.title || "");
  });

  // {{wheel: 78,64,82 | labels=Yield,Growth,Risk | max=100 | title=…}}
  out = out.replace(/\{\{wheel:\s*([^}]+)\}\}/gi, (_m, args) => {
    const parts = String(args).split("|").map((s) => s.trim());
    const scores = parts[0].split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n));
    if (scores.length < 3) return _m;
    const opts: Record<string, string> = {};
    for (const p of parts.slice(1)) {
      const m = p.match(/^(labels|max|title)\s*=\s*(.+)$/i);
      if (m) opts[m[1].toLowerCase()] = m[2];
    }
    const labels = opts.labels ? opts.labels.split(",").map((s) => s.trim()) : [];
    return vizFigure(renderScoreWheelSvg(scores, labels, Number(opts.max) || 100), opts.title || "");
  });

  return out;
}

/**
 * Post-marked HTML processor: converts footnote calls/defs into CSS Paged Media
 * footnotes (WeasyPrint native), and turns [[see:#id]] into target-counter xrefs.
 */
function applyFootnotesAndXrefs(html: string): string {
  // 1. Collect footnote defs: [^id]: text  (marked may leave them in <p> or escape ^).
  const defs = new Map<string, string>();
  let out = html.replace(/<p>\s*\[\^([\w-]+)\]\s*:\s*([\s\S]*?)<\/p>/gi, (_m, id, body) => {
    defs.set(String(id), String(body).trim());
    return "";
  });

  // 2. Replace inline calls [^id] with a footnote span (float: footnote in CSS).
  out = out.replace(/\[\^([\w-]+)\]/g, (_m, id) => {
    const body = defs.get(String(id));
    if (!body) return "";
    return `<span class="footnote">${body}</span>`;
  });

  // 3. Cross-references: [[see:#anchor]] or [[see:#anchor|prefix]]
  out = out.replace(/\[\[see:#([\w-]+)(?:\|([^\]]+))?\]\]/g, (_m, id, prefix) => {
    const label = prefix ? String(prefix).trim() : "see p.";
    return `<a class="xref" href="#${id}"><span class="xref-prefix">${esc(label)}</span><span class="xref-page"></span></a>`;
  });

  return out;
}

/** Detect numeric markdown tables in rendered HTML, prepend a chart visualisation. */
async function injectTableCharts(html: string): Promise<string> {
  const tables = Array.from(html.matchAll(/<table[\s\S]*?<\/table>/gi));
  if (tables.length === 0) return html;

  const replacements = new Array<string>(tables.length);
  let chartAttempts = 0;
  const queue = tables.map((match, index) => ({ tbl: match[0], index }));
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const { tbl, index } = queue.shift()!;
    const theadMatch = tbl.match(/<thead[\s\S]*?<\/thead>/i);
    const headerSource = theadMatch?.[0] || tbl.match(/<tr[\s\S]*?<\/tr>/i)?.[0] || "";
    const headers = Array.from(headerSource.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi))
      .map((m) => m[1].replace(/<[^>]+>/g, "").trim());

    const bodySource = tbl.match(/<tbody[\s\S]*?<\/tbody>/i)?.[0] || tbl;
    const allRows = Array.from(bodySource.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi))
      .map((rm) => Array.from(rm[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi))
        .map((c) => c[1].replace(/<[^>]+>/g, "").trim()));
    const dataRows = theadMatch ? allRows : allRows.slice(1);

      const canAddChart = chartAttempts < MAX_AUTO_TABLE_CHARTS;
      const chart = canAddChart ? await tableToChartHtml(headers, dataRows) : null;
      if (chart) chartAttempts += 1;
      replacements[index] = chart ? `<div class="chart-wrap">${chart}${tbl}</div>` : tbl;
    }
  });
  await Promise.all(workers);

  let i = 0;
  return html.replace(/<table[\s\S]*?<\/table>/gi, () => replacements[i++]);
}

async function buildFinancialChartsHtml(fin: any): Promise<string> {
  const rows = projectionRows(fin).slice(0, 10);
  const labels = rows.map((r, i) => String(r?.year ?? r?.label ?? `Year ${i + 1}`).replace(/^year\s*/i, "Yr "));
  const charts: string[] = [];
  const commonFont = { family: FONT_STACK, size: 11 };
  const gridColor = "rgba(181, 165, 128, 0.25)";
  const moneyTick = "function(v){return Math.abs(v)>=1000000?'$'+(v/1000000).toFixed(1)+'m':Math.abs(v)>=1000?'$'+(v/1000).toFixed(0)+'k':'$'+v.toFixed(0);}";

  if (labels.length >= 3) {
    const propertyValue = pickSeries(rows, ["propertyValue", "value", "estimatedValue", "marketValue"]);
    const equity = pickSeries(rows, ["equity", "netEquity"]);
    const loanBalance = pickSeries(rows, ["loanBalance", "debt", "loanAmount"]);
    const datasets = [
      propertyValue && { label: "Property value", data: propertyValue, borderColor: CHART_PALETTE[0], backgroundColor: withAlpha(CHART_PALETTE[0], 0.16), borderWidth: 2.4, tension: 0.38, pointRadius: 2.8, fill: true },
      equity && { label: "Equity", data: equity, borderColor: CHART_PALETTE[2], backgroundColor: withAlpha(CHART_PALETTE[2], 0.06), borderWidth: 2.2, tension: 0.38, pointRadius: 2.8, fill: false },
      loanBalance && { label: "Loan balance", data: loanBalance, borderColor: CHART_PALETTE[1], backgroundColor: withAlpha(CHART_PALETTE[1], 0.04), borderWidth: 2.2, tension: 0.38, pointRadius: 2.8, fill: false },
    ].filter(Boolean);
    if (datasets.length) {
      const uri = await chartDataUri({
        type: "line",
        data: { labels, datasets },
        options: {
          plugins: { legend: { position: "bottom", labels: { color: "#17130D", font: commonFont, boxWidth: 12, padding: 12, usePointStyle: true } } },
          scales: {
            x: { ticks: { color: "#5F5546", font: commonFont }, grid: { color: "transparent" }, border: { color: "#B5A580" } },
            y: { ticks: { color: "#5F5546", font: commonFont, callback: moneyTick }, grid: { color: gridColor, drawBorder: false }, border: { display: false } },
          },
        },
      }, CHART_PRESETS.TREND_WIDE.width, CHART_PRESETS.TREND_WIDE.height, "financial:value-equity-debt");
      if (uri) charts.push(`<div class="chart-wrap financial-chart"><div class="chart-title">10-year value, equity and debt path</div><figure class="auto-chart"><img src="${uri}" alt="10-year value equity and debt chart"/><figcaption>Source: NPC projections, modelled over 10 years.</figcaption></figure></div>`);
    }

    const cashFlow = pickSeries(rows, ["cashFlow", "annualNet", "netCashflow", "annualNetCashflow"]);
    const annualRent = pickSeries(rows, ["annualRent", "rent", "rentalIncome"]);
    if (cashFlow || annualRent) {
      const uri = await chartDataUri({
        type: "bar",
        data: {
          labels,
          datasets: [
            annualRent && { label: "Annual rent", data: annualRent, backgroundColor: withAlpha(CHART_PALETTE[2], 0.88), borderRadius: 6, borderSkipped: false, maxBarThickness: 34 },
            cashFlow && { label: "Net cash flow", data: cashFlow, backgroundColor: withAlpha(CHART_PALETTE[3], 0.86), borderRadius: 6, borderSkipped: false, maxBarThickness: 34 },
          ].filter(Boolean),
        },
        options: {
          plugins: { legend: { position: "bottom", labels: { color: "#17130D", font: commonFont, boxWidth: 12, padding: 12, usePointStyle: true } } },
          scales: {
            x: { ticks: { color: "#5F5546", font: commonFont }, grid: { color: "transparent" }, border: { color: "#B5A580" } },
            y: { ticks: { color: "#5F5546", font: commonFont, callback: moneyTick }, grid: { color: gridColor, drawBorder: false }, border: { display: false } },
          },
        },
      }, CHART_PRESETS.BAR_WIDE.width, CHART_PRESETS.BAR_WIDE.height, "financial:rent-cashflow");
      if (uri) charts.push(`<div class="chart-wrap financial-chart"><div class="chart-title">Rental income versus net cash flow</div><figure class="auto-chart"><img src="${uri}" alt="Rental income and cash flow chart"/><figcaption>Source: NPC projections, modelled over 10 years.</figcaption></figure></div>`);
    }
  }

  const km = fin?.keyMetrics || fin?.key_metrics || {};
  const yieldBars = [
    ["Gross yield", num(km.grossRentalYield)],
    ["Net yield", num(km.netRentalYield)],
    ["Cash-on-cash", num(km.cashOnCashReturn)],
    ["LVR", num(km.lvr)],
  ].filter(([, v]) => v !== null) as Array<[string, number]>;
  if (yieldBars.length >= 2) {
    const uri = await chartDataUri({
      type: "bar",
      data: { labels: yieldBars.map(([label]) => label), datasets: [{ data: yieldBars.map(([, v]) => v), backgroundColor: yieldBars.map((_, i) => withAlpha(CHART_PALETTE[i % CHART_PALETTE.length], 0.9)), borderRadius: 6, borderSkipped: false, maxBarThickness: 46 }] },
      options: {
        plugins: { legend: { display: false }, datalabels: { anchor: "end", align: "top", color: "#2A2317", font: { ...commonFont, weight: "600" }, formatter: "function(v){return v.toFixed(1)+'%';}" } },
        scales: {
          x: { ticks: { color: "#5F5546", font: commonFont }, grid: { color: "transparent" }, border: { color: "#B5A580" } },
          y: { ticks: { color: "#5F5546", font: commonFont, callback: "function(v){return v.toFixed(0)+'%';}" }, grid: { color: gridColor, drawBorder: false }, border: { display: false } },
        },
      },
    }, CHART_PRESETS.BAR_WIDE.width, CHART_PRESETS.BAR_WIDE.height, "financial:yield-bars");
    if (uri) charts.push(`<div class="chart-wrap financial-chart"><div class="chart-title">Yield and leverage profile</div><figure class="auto-chart"><img src="${uri}" alt="Yield and leverage chart"/><figcaption>Source: NPC key-metrics snapshot.</figcaption></figure></div>`);
  }

  return charts.length ? `<section class="body-page financial-charts"><h2 id="ch-financial-visuals">Financial Visuals</h2>${charts.join("")}</section>` : "";
}

// ─────────────────────────────────────────────────────────────
// Infographic block detectors — compare cards + process timelines
// ─────────────────────────────────────────────────────────────
function wrapCompareCards(html: string): string {
  const pairs: Array<[RegExp, RegExp]> = [
    [/strengths?/i, /(?:watch(?:[- ]?outs?)?|risks?|cautions?|concerns?|things?\s+to\s+watch)/i],
    [/pros?/i, /cons?/i],
    [/advantages?/i, /disadvantages?/i],
    [/opportunit(?:y|ies)/i, /threats?/i],
    [/upsides?/i, /downsides?/i],
  ];
  let out = html;
  for (const [a, b] of pairs) {
    const re = new RegExp(
      `<h([34])[^>]*>\\s*(${a.source})\\s*<\\/h\\1>\\s*(<ul[\\s\\S]*?<\\/ul>)\\s*<h\\1[^>]*>\\s*(${b.source})\\s*<\\/h\\1>\\s*(<ul[\\s\\S]*?<\\/ul>)`,
      "gi",
    );
    out = out.replace(re, (_m, _lvl, lTitle, lList, rTitle, rList) =>
      `<div class="compare-card">
        <div class="compare-col compare-pos">
          <div class="compare-head">${esc(String(lTitle).trim())}</div>${lList}
        </div>
        <div class="compare-col compare-neg">
          <div class="compare-head">${esc(String(rTitle).trim())}</div>${rList}
        </div>
      </div>`);
  }
  return out;
}

function wrapProcessTimeline(html: string): string {
  // Match 2+ consecutive "Step N: …" headings with following paragraph(s)
  const re = /(?:<h[34][^>]*>\s*Step\s+\d+\s*[:.\-]?\s*[^<]*<\/h[34]>\s*(?:<p>[\s\S]*?<\/p>\s*)+){2,}/gi;
  return html.replace(re, (block) => {
    const items = Array.from(block.matchAll(/<h[34][^>]*>\s*(Step\s+\d+)\s*[:.\-]?\s*([^<]*)<\/h[34]>\s*((?:<p>[\s\S]*?<\/p>\s*)+)/gi))
      .map((m) =>
        `<li>
          <div class="step-no">${esc(m[1])}</div>
          <div class="step-content">
            <div class="step-title">${esc(m[2].trim())}</div>
            <div class="step-body">${m[3]}</div>
          </div>
        </li>`
      );
    if (items.length < 2) return block;
    return `<ol class="timeline">${items.join("")}</ol>`;
  });
}

// ─────────────────────────────────────────────────────────────
// Projection series → sparklines beside KPI tiles
// ─────────────────────────────────────────────────────────────
function findProjectionSeries(fin: any): { valueSeries?: number[]; cashflowSeries?: number[]; yieldSeries?: number[]; rentSeries?: number[] } {
  const proj = projectionRows(fin);
  if (!Array.isArray(proj) || proj.length < 3) return {};
  const pick = (keys: string[]) => {
    const vals = proj.map((p: any) => {
      for (const k of keys) {
        const n = num(p?.[k]);
        if (n !== null) return n;
      }
      return null;
    });
    return vals.every((v: any) => v !== null) ? (vals as number[]) : undefined;
  };
  return {
    valueSeries: pick(["propertyValue", "value", "price", "estimatedValue"]),
    cashflowSeries: pick(["annualNet", "netCashflow", "cashflow", "annualNetCashflow", "weeklyNet"]),
    yieldSeries: pick(["grossYield", "yield", "rentalYield"]),
    rentSeries: pick(["weeklyRent", "rentPerWeek"]),
  };
}

// ─────────────────────────────────────────────────────────────
// Hero illustration injection (pre-generated assets only — no AI calls here)
// Hero images are produced asynchronously by `prepare-report-hero-images`
// and stored in the `investment-reports` bucket. This renderer is now
// lightweight and never calls the AI gateway.
// ─────────────────────────────────────────────────────────────
function fallbackHeroSvg(chapterTitle: string): string {
  const seed = chapterTitle.split("").reduce((acc, ch) => (acc + ch.charCodeAt(0) * 17) % 997, 31);
  const ridge = Array.from({ length: 9 }, (_, i) => {
    const y = 44 + i * 18 + (seed % (i + 7));
    return `<path d="M-20 ${y} C 140 ${y - 36}, 260 ${y + 38}, 420 ${y - 10} S 700 ${y + 28}, 920 ${y - 18}" fill="none" stroke="#2E6CB0" stroke-opacity="${0.08 + i * 0.02}" stroke-width="1.2"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="315" viewBox="0 0 1200 315">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#061A33"/><stop offset="0.6" stop-color="#0A2540"/><stop offset="1" stop-color="#1E4A7C"/></linearGradient>
      <radialGradient id="glow" cx="78%" cy="22%" r="62%"><stop offset="0" stop-color="#D4A843" stop-opacity="0.30"/><stop offset="1" stop-color="#D4A843" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1200" height="315" fill="url(#bg)"/>
    <rect width="1200" height="315" fill="url(#glow)"/>
    <g opacity="0.95">${ridge}</g>
  </svg>`;
  return compactDataUri(svg);
}

type HeroPlacement = {
  url: string;
  height: "compact" | "standard" | "tall" | "full_bleed";
  width: "content" | "full_bleed";
  fit: "cover" | "contain";
  focal: "top" | "center" | "bottom";
  rounded: boolean;
};

async function loadHeroPlacements(reportId: string): Promise<Record<string, HeroPlacement>> {
  const out: Record<string, HeroPlacement> = {};
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    // 1. Modern placements (per-chapter controls)
    const { data: placements } = await supabase
      .from("report_hero_placements")
      .select(`
        section_key, render_height, render_width, object_fit, focal, rounded,
        library:hero_image_library!report_hero_placements_library_image_id_fkey ( public_url )
      `)
      .eq("report_id", reportId);
    for (const p of (placements || []) as any[]) {
      const url = p?.library?.public_url;
      if (!url || !p.section_key) continue;
      out[p.section_key] = {
        url,
        height: p.render_height || "standard",
        width: p.render_width || "content",
        fit: p.object_fit || "cover",
        focal: p.focal || "center",
        rounded: p.rounded !== false,
      };
    }
    // 2. Legacy fallback for slugs not in placements
    const { data: legacy } = await supabase
      .from("report_visual_assets")
      .select("section_key, public_url")
      .eq("report_id", reportId)
      .eq("status", "ready")
      .eq("include_in_report", true);
    for (const r of (legacy || []) as Array<{ section_key: string; public_url: string }>) {
      if (!r.public_url || out[r.section_key]) continue;
      out[r.section_key] = {
        url: r.public_url,
        height: "standard",
        width: "full_bleed",
        fit: "cover",
        focal: "center",
        rounded: false,
      };
    }
    return out;
  } catch (err) {
    console.warn("[render-investment-report-pdf] hero asset load failed", err);
    return out;
  }
}

function injectHeroImages(
  html: string,
  heroesBySlug: Record<string, HeroPlacement>,
  toc: Array<{ id: string; title: string }>,
): string {
  const idToSlug = new Map<string, string>();
  for (const t of toc) idToSlug.set(t.id, slugify(t.title));

  return html.replace(/<h2 id="(ch-[^"]+)"([^>]*)>([\s\S]*?)<\/h2>/gi, (_m, id, attrs, inner) => {
    const slug = idToSlug.get(id);
    const p = slug ? heroesBySlug[slug] : undefined;
    if (!p) return `<h2 id="${id}"${attrs}>${inner}</h2>`;
    const cls = [
      "chapter-hero",
      `hero-h-${p.height}`,
      `hero-w-${p.width}`,
      `hero-fit-${p.fit}`,
      `hero-focal-${p.focal}`,
      p.rounded ? "hero-rounded" : "hero-flush",
    ].join(" ");
    return `<div class="${cls}"><img src="${p.url}" alt="" crossorigin="anonymous"/></div><h2 id="${id}"${attrs}>${inner}</h2>`;
  });
}

/**
 * Tag each top-level h2 with an id + record TOC entries so we can render a TOC
 * page and use CSS `target-counter()` for page numbers.
 */
function annotateChaptersAndExtractToc(html: string): { html: string; toc: Array<{ id: string; title: string }> } {
  const toc: Array<{ id: string; title: string }> = [];
  const used = new Set<string>();
  // Phase 2 #16/#17 — palette rotated per chapter so thumb-index tabs stagger
  // both vertically (top) and chromatically across the page edge.
  const TAB_HUES = [
    "linear-gradient(180deg,#D4A843,#8a6418)",
    "linear-gradient(180deg,#2E6CB0,#143b73)",
    "linear-gradient(180deg,#7A8C5C,#3d4a2a)",
    "linear-gradient(180deg,#B85C3A,#6b2f1c)",
    "linear-gradient(180deg,#5C4A8C,#2f2454)",
    "linear-gradient(180deg,#3C8C8A,#1f4a48)",
  ];
  let chapterIndex = 0;
  const annotated = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (_m, attrs, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
    let id = `ch-${slugify(text) || `${toc.length + 1}`}`;
    let n = 1;
    while (used.has(id)) id = `ch-${slugify(text) || "section"}-${++n}`;
    used.add(id);
    toc.push({ id, title: text });
    const i = chapterIndex++;
    const topMm = 18 + (i % 8) * 28;          // stagger down the page edge
    const grad = TAB_HUES[i % TAB_HUES.length];
    const thumbTab = `<span class="thumb-tab" style="top:${topMm}mm;background:${grad}" aria-hidden="true">${esc(text)}</span>`;
    const ghostNum = `<span class="ch-ghost" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>`;
    // Insert a tasteful end-of-chapter mark before every chapter except the first.
    // The ::before/::after on the h2 itself can't render outside the chapter's
    // own page, so we emit the closer as a sibling block that lives at the *end*
    // of the previous chapter's flow (paged-media floats it to that page's tail).
    const closer = i > 0
      ? `<div class="chapter-closer" aria-hidden="true"><span class="chapter-closer-rule"></span><span class="chapter-closer-mark">◆</span><span class="chapter-closer-rule"></span></div>`
      : "";
    return `${closer}<h2 id="${id}" data-ch="${i + 1}"${attrs}>${thumbTab}${ghostNum}${inner}</h2>`;
  });
  return { html: annotated, toc };
}

// Phase 1 #1 — wrap any wide table (>5 columns) in a landscape spread so
// dense data tables get the full A4 width instead of crushing into portrait.
function wrapWideTablesLandscape(html: string): string {
  return html.replace(/<table([\s\S]*?)<\/table>/gi, (full) => {
    // Count <th> in the first <tr>; fall back to first row of <td>.
    const firstRow = full.match(/<tr[^>]*>[\s\S]*?<\/tr>/i)?.[0] || "";
    const thCount = (firstRow.match(/<th\b/gi) || []).length;
    const tdCount = (firstRow.match(/<td\b/gi) || []).length;
    const cols = Math.max(thCount, tdCount);
    if (cols < 6) return full;
    return `<div class="landscape-spread"><div class="landscape-inner">${full}</div></div>`;
  });
}

export async function buildHtml(
  report: any,
  brandName: string,
  opts: {
    includeCharts?: boolean;
    includeHeroImages?: boolean;
    includeSparklines?: boolean;
    designOptions?: unknown;
    contact?: Record<string, any>;
    disclaimer?: { is_enabled?: boolean; text?: string; font_size?: string };
  } = {},
): Promise<string> {
  const contact = opts.contact || {};
  const disclaimer = opts.disclaimer || {};
  // Keep report-wide advisor attribution initialized before any generated HTML/CSS
  // fragments so later Phase blocks cannot accidentally hit a temporal-dead-zone.
  const advisorLine = contact.name || contact.advisor || contact.company_name || brandName;
  const includeCharts = opts.includeCharts !== false;
  const includeSparklines = opts.includeSparklines !== false;
  const includeHeroImages = opts.includeHeroImages === true; // opt-in, costs tokens
  const design = normalizePdfDesign(opts.designOptions);
  const palette = DESIGN_PALETTES[design.preset];
  const densityScale = design.density === "compact" ? 0.9 : design.density === "spacious" ? 1.12 : 1;
  const bodyPt = Math.round(98 * (design.bodyScale / 100) * densityScale) / 10;
  const paragraphGap = design.density === "compact" ? ".54em" : design.density === "spacious" ? ".96em" : ".72em";
  const pageMargin = design.density === "compact" ? "18mm 15mm 18mm 15mm" : design.density === "spacious" ? "25mm 21mm 25mm 21mm" : "22mm 18mm 22mm 18mm";
  const intensity = design.visualIntensity / 100;

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
  const md = applyEditorialMarkdown(cleanReportMarkdown(String(report.report_content || ""), address));
  let bodyHtml = marked.parse(md, { gfm: true, breaks: false }) as string;
  bodyHtml = stripBareCitations(bodyHtml);
  // Repair LLM currency artefacts where "$45,872.969" leaks a 3-digit
  // fractional group instead of a thousands separator. Any $-prefixed number
  // ending in exactly ".ddd" (and not followed by another digit) is treated
  // as a stray grouping and the trailing group is reattached with a comma.
  bodyHtml = bodyHtml.replace(/\$(\d{1,3}(?:,\d{3})*)\.(\d{3})(?!\d)/g, "$$$1,$2");
  bodyHtml = applyFootnotesAndXrefs(bodyHtml);
  bodyHtml = wrapCompareCards(bodyHtml);
  bodyHtml = wrapProcessTimeline(bodyHtml);
  bodyHtml = wrapInsightSections(bodyHtml);
  if (includeCharts) {
    bodyHtml = await injectTableCharts(bodyHtml);
    console.log("[charts] embedded table charts", { count: (bodyHtml.match(/class=\"chart-wrap\"/g) || []).length });
  }
  bodyHtml = colourCodeTableCells(bodyHtml);
  bodyHtml = wrapWideTablesLandscape(bodyHtml);
  const { html: bodyAnnotated, toc } = annotateChaptersAndExtractToc(bodyHtml);

  // Hero illustrations per chapter — consumes ONLY pre-generated assets
  // produced by the `prepare-report-hero-images` worker. Missing slugs
  // fall back to the navy/gold SVG banner so the PDF still renders.
  let bodyWithHeroes = bodyAnnotated;
  if (includeHeroImages && toc.length > 0) {
    const heroes = report.id ? await loadHeroPlacements(String(report.id)) : {};
    bodyWithHeroes = injectHeroImages(bodyAnnotated, heroes, toc);
  }

  const sourcesHtml = report.sources_content
    ? marked.parse(String(report.sources_content), { gfm: true }) as string
    : "";
  const financialChartsHtml = includeCharts ? await buildFinancialChartsHtml(fin) : "";

  // KPI tiles (with optional sparklines from projection series)
  const series = includeSparklines ? findProjectionSeries(fin) : {};
  const kpis: Array<{ label: string; value: string; spark?: string }> = [];
  if (km.purchasePrice != null) kpis.push({ label: "Purchase Price", value: fmtMoney(km.purchasePrice), spark: series.valueSeries && series.valueSeries.length >= 3 ? await quickSparklineUrl(series.valueSeries) || undefined : undefined });
  if (km.grossRentalYield != null) kpis.push({ label: "Gross Yield", value: fmtPct(km.grossRentalYield), spark: series.yieldSeries && series.yieldSeries.length >= 3 ? await quickSparklineUrl(series.yieldSeries, THEME.success) || undefined : undefined });
  if (km.netRentalYield != null) kpis.push({ label: "Net Yield", value: fmtPct(km.netRentalYield) });
  if (km.weeklyNet != null) kpis.push({ label: "Weekly Cash Flow", value: fmtMoney(km.weeklyNet), spark: series.cashflowSeries && series.cashflowSeries.length >= 3 ? await quickSparklineUrl(series.cashflowSeries, THEME.success) || undefined : undefined });
  if (km.lvr != null) kpis.push({ label: "LVR", value: fmtPct(km.lvr, 1) });
  if (km.weeklyRent != null) kpis.push({ label: "Weekly Rent", value: fmtMoney(km.weeklyRent), spark: series.rentSeries && series.rentSeries.length >= 3 ? await quickSparklineUrl(series.rentSeries) || undefined : undefined });

  const scoreOverall =
    score?.overall_score ?? score?.overallScore ?? score?.score ?? null;
  const scoreBand =
    score?.band ?? score?.grade ?? (typeof scoreOverall === "number"
      ? scoreOverall >= 80 ? "Strong" : scoreOverall >= 65 ? "Solid" : scoreOverall >= 50 ? "Mixed" : "Cautious"
      : null);

  const kpiTiles = kpis
    .map((k) => `<div class="kpi">
      <div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-value">${esc(k.value)}</div>
      ${k.spark ? `<div class="kpi-spark"><img src="${k.spark}" alt=""/></div>` : ""}
    </div>`)
    .join("");

  // ── Executive Summary (replaces Snapshot + Finance Visuals section) ──
  const suburbLabel = loc?.suburb && loc?.state
    ? `${loc.suburb}, ${loc.state}`
    : address;
  const priceTxt = km.purchasePrice != null ? fmtMoney(km.purchasePrice) : null;
  const yieldTxt = km.grossRentalYield != null ? fmtPct(km.grossRentalYield) : null;
  const rentTxt = km.weeklyRent != null ? fmtMoney(km.weeklyRent) : null;
  const cashflowTxt = km.weeklyNet != null ? fmtMoney(km.weeklyNet) : null;
  const lvrTxt = km.lvr != null ? fmtPct(km.lvr, 1) : null;
  const scoreTxt = scoreOverall != null ? `${Math.round(Number(scoreOverall))}/100${scoreBand ? ` (${scoreBand})` : ""}` : null;

  const para1Parts: string[] = [];
  const locFrag = suburbLabel && suburbLabel !== address ? `, located in <strong>${esc(suburbLabel)}</strong>` : "";
  para1Parts.push(`This report presents an independent investment analysis of <strong>${esc(address)}</strong>${locFrag}.`);
  if (priceTxt) {
    const lvrFrag = lvrTxt ? ` at an LVR of <strong>${lvrTxt}</strong>` : "";
    const rentFrag = rentTxt ? `, with an assessed market rent of <strong>${rentTxt}/week</strong>` : "";
    const yieldFrag = yieldTxt ? ` (gross yield <strong>${yieldTxt}</strong>)` : "";
    para1Parts.push(`Modelled on a purchase price of <strong>${priceTxt}</strong>${lvrFrag}${rentFrag}${yieldFrag}.`);
  }
  para1Parts.push(`Findings draw on local market conditions, demographics, infrastructure, lending policy, and forward-looking cash-flow projections to give a holistic view of suitability for a long-term investment strategy.`);

  const para2Parts: string[] = [];
  if (scoreTxt) {
    para2Parts.push(`The property carries an overall investment score of <strong>${scoreTxt}</strong>, reflecting the weighted balance of location quality, financial performance, growth drivers, and risk indicators discussed in the chapters that follow.`);
  } else {
    para2Parts.push(`The chapters that follow examine the weighted balance of location quality, financial performance, growth drivers, and risk indicators that underpin our assessment.`);
  }
  if (cashflowTxt) para2Parts.push(`Indicative weekly cash flow tracks at <strong>${cashflowTxt}</strong> after holding costs, providing a baseline for the comparative scenarios and sensitivity tables that follow.`);
  para2Parts.push(`Use this summary as orientation: detailed evidence, calculations, charts, and source attributions for every claim are set out across the remaining sections of the report.`);

  // Editor's Note — auto-generated, one-paragraph foreword that lifts 2-3 real
  // figures from the report. Pure presentation, no AI call.
  const editorsNoteBits: string[] = [];
  if (priceTxt && rentTxt) editorsNoteBits.push(`at <strong>${priceTxt}</strong> with assessed rent of <strong>${rentTxt}/wk</strong>`);
  else if (priceTxt) editorsNoteBits.push(`at <strong>${priceTxt}</strong>`);
  if (yieldTxt) editorsNoteBits.push(`gross yield <strong>${yieldTxt}</strong>`);
  if (scoreTxt) editorsNoteBits.push(`investment score <strong>${scoreTxt}</strong>`);
  const editorsNoteHtml = `
    <aside class="editors-note">
      <div class="en-eyebrow">Editor's Note</div>
      <p class="en-body">${esc(suburbLabel)} continues to sit inside our active research universe${
        editorsNoteBits.length ? ` — this dossier captures the subject ${editorsNoteBits.join(", ")}` : ""
      }. The pages that follow set out the location case, the financials, and the residual risks in equal measure, so you can weigh the opportunity on its merits rather than its narrative.</p>
      <div class="en-sig">— ${esc(String(advisorLine))}, ${esc(generated)}</div>
    </aside>
  `;

  const executiveSummaryHtml = `
    <h2 id="ch-executive-summary" data-ch="1">Executive Summary</h2>
    ${editorsNoteHtml}
    <p>${para1Parts.filter(Boolean).join(" ")}</p>
    <p>${para2Parts.filter(Boolean).join(" ")}</p>
  `;

  // Executive Summary is the first chapter — register it in the TOC and shift
  // every subsequent chapter's data-ch index up by one so the page numerals
  // line up with the TOC ordering.
  if (!toc.some((t) => t.id === "ch-executive-summary")) {
    toc.unshift({ id: "ch-executive-summary", title: "Executive Summary" });
    bodyWithHeroes = bodyWithHeroes.replace(/<h2([^>]*?)\sdata-ch="(\d+)"/gi, (_m, attrs, n) => {
      return `<h2${attrs} data-ch="${Number(n) + 1}"`;
    });
  }

  // Parse address tail for cover meta (Suburb, STATE Postcode).
  const addrTail = address.split(",").map((s: string) => s.trim()).filter(Boolean);
  const coverLocation = loc?.suburb && loc?.state
    ? `${loc.suburb}, ${loc.state}`
    : addrTail.length >= 2
      ? addrTail.slice(-2).join(", ")
      : address;

  // Foil-stamp overlay: radial gold highlight + diagonal sheen + subtle noise.
  // Pure SVG so it scales infinitely and prints crisp.
  const foilOverlaySvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 210 297' preserveAspectRatio='xMidYMid slice'>
      <defs>
        <radialGradient id='hl' cx='28%' cy='18%' r='62%'>
          <stop offset='0%' stop-color='#f3d98a' stop-opacity='0.55'/>
          <stop offset='42%' stop-color='#b88a2c' stop-opacity='0.18'/>
          <stop offset='100%' stop-color='#000' stop-opacity='0'/>
        </radialGradient>
        <linearGradient id='sheen' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='#fff' stop-opacity='0'/>
          <stop offset='48%' stop-color='#fff' stop-opacity='0.10'/>
          <stop offset='52%' stop-color='#fff' stop-opacity='0.18'/>
          <stop offset='56%' stop-color='#fff' stop-opacity='0'/>
        </linearGradient>
        <filter id='nz'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' seed='5'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0'/></filter>
      </defs>
      <rect width='210' height='297' fill='url(%23hl)'/>
      <rect width='210' height='297' fill='url(%23sheen)'/>
      <rect width='210' height='297' filter='url(%23nz)'/>
    </svg>`)}`;
  const coverHtml = design.coverStyle === "image"
    ? `<section class="cover cover-clean">
        <img class="cover-bg" src="https://npc-property-dashbord.lovable.app/templates/npc-portfolio-cover-new.jpg" alt="" />
        <div class="cover-foil" style="background-image:url('${foilOverlaySvg}')"></div>
      </section>`
    : `<section class="cover cover-${design.coverStyle}">
        <img class="cover-bg" src="https://npc-property-dashbord.lovable.app/templates/npc-portfolio-cover-new.jpg" alt="" />
        <div class="cover-scrim"></div>
        <div class="cover-foil" style="background-image:url('${foilOverlaySvg}')"></div>
        <div class="cover-masthead">${esc(String(brandName).toUpperCase())}</div>
        <div class="cover-copy">
          <div class="cover-kicker">Investment Report · ${esc(generated)}</div>
          <h1>${esc(address)}</h1>
          <div class="cover-rule"></div>
          <div class="cover-meta">${esc(coverLocation)}</div>
          <div class="cover-prepared">Prepared by <strong>${esc(String(advisorLine))}</strong></div>
        </div>
        <div class="cover-edition">VOL. ${new Date().getFullYear()} · ED. ${String(new Date().getMonth() + 1).padStart(2, "0")}</div>
      </section>`;

  const designOverrideStyles = `
    /* ── Front-end controlled WeasyPrint design layer ─────────────────── */
    @page { margin: ${pageMargin}; background: ${palette.paper}; }
    @page :left  { margin: ${pageMargin}; }
    @page :right { margin: ${pageMargin}; }
    html, body {
      background: ${palette.paper};
      color: ${palette.ink};
      font-size: ${bodyPt}pt;
      line-height: ${design.density === "compact" ? "1.48" : design.density === "spacious" ? "1.72" : "1.6"};
    }
    p { margin-bottom: ${paragraphGap}; text-align: ${design.justifyText ? "justify" : "left"}; }
    strong, em, i, td { color: ${palette.ink}; }
    a, a.contact-link, a.ext-link { color: ${palette.accentSoft}; border-bottom-color: ${palette.accentSoft}; }
    h1, h2, h3 {
      background: linear-gradient(135deg, ${palette.heading} 0%, ${palette.heading2} 62%, ${palette.accent} 100%);
      -webkit-background-clip: text; background-clip: text;
    }
    h2 { border-bottom-color: ${palette.accent}; padding-bottom: ${design.density === "spacious" ? "14pt" : "9pt"}; }
    h2::before { ${design.showSectionNumbers ? `color: ${palette.accent}; -webkit-text-fill-color: ${palette.accent};` : "content: none; display: none;"} }
    h2 + p::first-letter { ${design.showDropCaps ? `color: ${palette.accent};` : "font-size: inherit; float: none; padding: 0; color: inherit; font-family: inherit; font-weight: inherit;"} }
    h3 { border-left-color: ${palette.accent}; }
    h4, .insight-box .insight-label, li.insight-li .insight-label-inline { color: ${palette.accentSoft}; }
    ul li::before { background: ${palette.accent}; }
    blockquote, .insight-box, li.insight-li, .stat-block, aside.pull-quote, aside.sidenote {
      background: ${palette.paperAlt};
      border-color: ${palette.accent};
      box-shadow: inset 0 0 0 ${Math.max(0.25, intensity * 0.8)}pt ${withAlpha(palette.accent, 0.13)};
    }
    .cover { background: ${palette.cover}; }
    .cover-scrim {
      position: absolute; inset: 0;
      background: linear-gradient(115deg, ${withAlpha(palette.cover, 0.95)} 0%, ${withAlpha(palette.cover, 0.85)} 42%, ${withAlpha(palette.cover, 0.25)} 100%);
    }
    .cover-copy {
      position: absolute; left: 18mm; right: 18mm; bottom: ${design.coverStyle === "editorial" ? "34mm" : "26mm"};
      color: ${THEME.text}; z-index: 2;
    }
    .cover-copy h1 {
      max-width: ${design.coverStyle === "editorial" ? "150mm" : "128mm"};
      font-size: ${design.coverStyle === "editorial" ? "44pt" : "34pt"};
      line-height: 1.05; margin: 0;
      color: ${THEME.text}; -webkit-text-fill-color: ${THEME.text}; background: none;
      text-shadow: 0 1.5pt 10pt rgba(0,0,0,${0.22 + intensity * 0.32});
    }
    .cover-kicker, .cover-meta {
      font-family: 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .22em;
      color: ${palette.accent}; font-weight: 700;
    }
    .cover-kicker { font-size: 8.2pt; margin-bottom: 10mm; }
    .cover-meta { font-size: 8.5pt; margin-top: 8mm; color: ${THEME.muted}; }
    .cover-editorial .cover-copy { top: 34mm; bottom: auto; }
    .cover-editorial .cover-copy::after {
      content: ""; display: block; width: ${40 + intensity * 40}mm; height: 1pt; background: ${palette.accent}; margin-top: 13mm;
    }
    ${design.chapterStyle === "opener_band" ? `
      h2 {
        margin: 0 -8mm 12pt; padding: 15pt 10mm 13pt;
        background: linear-gradient(110deg, ${palette.heading} 0%, ${palette.heading2} 100%);
        color: ${THEME.text}; -webkit-text-fill-color: ${THEME.text}; border: 0;
      }
      h2::before { color: ${palette.accent}; -webkit-text-fill-color: ${palette.accent}; }
    ` : ""}
    ${design.chapterStyle === "minimal" ? `
      h2 { font-size: 22pt; border-bottom: 0.35pt solid ${palette.muted}; background: none; color: ${palette.heading}; -webkit-text-fill-color: ${palette.heading}; }
      h2::before { font-size: 12pt; margin-right: 12pt; }
      h3 { background: none; color: ${palette.heading}; -webkit-text-fill-color: ${palette.heading}; border-left-width: 1pt; }
    ` : ""}
    ${design.tableStyle === "ledger" ? `
      table { background: ${palette.paper}; border-top: 1pt solid ${palette.ink}; border-bottom: 1pt solid ${palette.ink}; }
      th { background: transparent; color: ${palette.ink}; border-bottom: 1pt solid ${palette.ink}; }
      tr:nth-child(even) td { background: transparent; }
      td { border-bottom: 0.35pt solid ${withAlpha(palette.muted, 0.4)}; }
    ` : ""}
    ${design.tableStyle === "minimal" ? `
      table { background: transparent; font-size: 8.2pt; }
      th { background: ${palette.paperAlt}; color: ${palette.ink}; }
      th, td { border-bottom: 0.25pt solid ${withAlpha(palette.muted, 0.33)}; padding: 4.2pt 5.5pt; }
      tr:nth-child(even) td { background: transparent; }
    ` : ""}
    figure.vis-figure, figure.auto-chart {
      background: ${palette.paperAlt}; border-color: ${withAlpha(palette.accent, 0.4)};
      padding: ${12 + Math.round(intensity * 8)}pt ${14 + Math.round(intensity * 7)}pt ${9 + Math.round(intensity * 4)}pt;
    }
  `;

  const styles = `
    /* ── Paged-media foundation ──────────────────────────────────────── */
    @page {
      size: A4;
      margin: 22mm 18mm 22mm 18mm;
      background: ${THEME.paper};
      @top-left {
        content: string(chapter);
        font-family: 'Inter', sans-serif;
        font-size: 7.5pt; color: ${THEME.inkMuted};
        letter-spacing: .14em; text-transform: uppercase;
        font-variant-numeric: oldstyle-nums proportional-nums;
      }
      @top-right {
        content: "${esc(address)}";
        font-family: 'Cormorant Garamond', serif;
        font-style: italic; font-size: 9pt; color: ${THEME.inkMuted};
      }
      @bottom-left {
        content: "${esc(brandName)}";
        font-family: 'Inter', sans-serif;
        font-size: 7.5pt; color: ${THEME.inkMuted};
        letter-spacing: .14em; text-transform: uppercase;
      }
      @bottom-center {
        content: "";
        border-top: 0.3pt solid ${THEME.rule};
        width: 24pt; height: 0;
        margin: 0 auto;
      }
      @bottom-right {
        content: counter(page) " · " counter(pages);
        font-family: 'Playfair Display', serif;
        font-style: italic; font-size: 9pt; color: ${THEME.ink};
        font-variant-numeric: oldstyle-nums proportional-nums;
      }
    }
    /* Slightly asymmetric gutter for a real bound-document feel. */
    @page :left  { margin-left: 16mm; margin-right: 20mm; }
    @page :right { margin-left: 20mm; margin-right: 16mm; }

    @page cover {
      margin: 0;
      background: ${THEME.bg};
      @top-left { content: none; } @top-right { content: none; }
      @bottom-left { content: none; } @bottom-right { content: none; }
      @bottom-center { content: none; }
    }
    @page disclaimer-page {
      margin: 0;
      background: #141414;
      @top-left { content: none; } @top-right { content: none; }
      @bottom-left { content: none; } @bottom-right { content: none; }
      @bottom-center { content: none; }
    }
    @page toc {
      @top-left { content: "Contents"; }
      @top-right { content: none; }
    }
    /* Chapter opener — first page of each chapter suppresses the running header. */
    @page chapter-opener {
      @top-left { content: none; }
      @top-right { content: none; }
    }
    /* CSS Paged Media footnotes (WeasyPrint native). The @footnote area sits
       above the bottom margin box, divided by a hairline rule. */
    @page {
      @footnote {
        border-top: 0.5pt solid ${THEME.rule};
        padding-top: 4pt;
        margin-top: 6pt;
        font-size: 7.8pt;
        line-height: 1.45;
        color: ${THEME.inkMuted};
        font-family: 'Inter', 'Helvetica', sans-serif;
      }
    }

    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: ${THEME.paper};
      color: ${THEME.ink};
      font-family: 'Inter', 'Helvetica', sans-serif;
      font-size: 9.8pt;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      /* OpenType: kerning, ligatures, contextual alternates. */
      font-feature-settings: "kern" 1, "liga" 1, "calt" 1, "ss01" 1;
      font-variant-numeric: oldstyle-nums proportional-nums;
      text-rendering: geometricPrecision;
    }

    body { counter-reset: section; }

    h1, h2, h3 {
      font-family: 'Playfair Display', 'Georgia', serif;
      margin: 0 0 .45em; page-break-after: avoid; break-after: avoid;
      background: ${NAVY_GRADIENT};
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      color: transparent;
      hyphens: manual;
      font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "swsh" 1;
    }
    h4 { font-family: 'Playfair Display', 'Georgia', serif; color: ${THEME.navy}; margin: 0 0 .45em; page-break-after: avoid; break-after: avoid; }
    h1 { font-size: 36pt; font-weight: 800; line-height: 1.08; letter-spacing: -0.01em; bookmark-level: 1; bookmark-label: content(text); }
    h2 {
      counter-increment: section;
      string-set: chapter content(text);
      font-family: 'Playfair Display', 'Georgia', serif;
      font-size: 40pt; font-weight: 700; letter-spacing: -0.012em; line-height: 1.04;
      margin: 0 0 24pt;
      padding: 96pt 0 22pt 0;
      border-bottom: none;
      display: block;
      position: relative;
      /* Each chapter starts on a fresh page — editorial polish. */
      break-before: page;
      page-break-before: always;
      bookmark-level: 1;
      bookmark-label: content(text);
      bookmark-state: open;
      page: chapter-opener;
      /* Gold underline rule sits below the title, not the eyebrow. */
    }
    /* The very first h2 of the body should not force an extra blank page after the TOC. */
    section.body-page:first-of-type > h2:first-child { break-before: auto; page-break-before: auto; }

    /* Editorial chapter opener: huge ghosted gold numeral, mono eyebrow above title,
       gold hairline beneath. Replaces the old inline ::before numeral. */
    h2::before {
      content: "CHAPTER " counter(section, decimal-leading-zero);
      display: block;
      position: absolute;
      top: 50pt; left: 0;
      font-family: 'IBM Plex Mono', 'SFMono-Regular', monospace;
      font-weight: 500; font-style: normal;
      font-size: 9pt;
      letter-spacing: 0.22em;
      color: ${THEME.gold};
      -webkit-text-fill-color: ${THEME.gold};
      background: none;
      -webkit-background-clip: initial;
      background-clip: initial;
      margin: 0; padding: 0;
      font-variant-numeric: lining-nums tabular-nums;
    }
    h2::after {
      content: counter(section, decimal-leading-zero);
      position: absolute;
      top: 18pt; right: -6pt;
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: 700; font-style: italic;
      font-size: 180pt;
      line-height: 1;
      color: transparent;
      -webkit-text-fill-color: transparent;
      -webkit-text-stroke: 1.1pt ${THEME.gold};
      opacity: 0.32;
      letter-spacing: -0.04em;
      pointer-events: none;
      z-index: 0;
    }
    h2 > * { position: relative; z-index: 1; }
    /* Gold hairline that sits *under* the title (not the eyebrow). */
    h2 + p, h2 + .insight, h2 + .compare-card, h2 + figure, h2 + ul, h2 + ol, h2 + .standfirst {
      border-top: 1.4pt solid ${THEME.gold};
      padding-top: 14pt;
      margin-top: 28pt;
    }
    /* Editorial drop cap on the first paragraph of each chapter. */
    h2 + p::first-letter {
      font-family: 'Playfair Display', Georgia, serif;
      font-weight: 700;
      font-size: 54pt;
      line-height: 0.86;
      float: left;
      padding: 4pt 8pt 0 0;
      color: ${THEME.gold};
      -webkit-text-fill-color: ${THEME.gold};
      background: none;
      -webkit-background-clip: initial;
    }
    /* Tasteful end-of-chapter mark: a centred gold lozenge before the next h2. */
    h2:not(:first-of-type)::before { /* keep eyebrow; mark is handled separately below */ }
    h3 {
      font-size: 17pt; font-weight: 600; margin-top: 18pt;
      padding-left: 10pt;
      border-left: 2.5pt solid ${THEME.gold};
      bookmark-level: 2; bookmark-label: content(text);
    }
    h4 {
      font-family: 'Inter', sans-serif;
      font-size: 10pt; font-weight: 700;
      color: ${THEME.goldSoft};
      text-transform: uppercase; letter-spacing: .15em;
      margin-top: 14pt;
      bookmark-level: 3; bookmark-label: content(text);
    }
    p {
      margin: 0 0 .72em;
      orphans: 3; widows: 3;
      hyphens: auto;
      -webkit-hyphens: auto;
      hyphenate-limit-chars: 8 4 4;
      text-align: justify;
      text-justify: inter-word;
    }
    a { color: ${THEME.goldSoft}; text-decoration: none; }
    strong { color: ${THEME.ink}; font-weight: 700; }
    em, i { color: ${THEME.ink}; font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 1.05em; }

    /* Drop-cap on the first paragraph after each chapter title — editorial signature. */
    h2 + p::first-letter {
      font-family: 'Playfair Display', serif;
      font-weight: 800;
      font-size: 3.6em;
      line-height: 0.85;
      float: left;
      padding: 4pt 8pt 0 0;
      color: ${THEME.gold};
      font-feature-settings: "kern" 1, "dlig" 1;
    }

    h2 + p {
      font-family: 'Inter', 'Helvetica', sans-serif;
      font-size: 9.8pt; line-height: 1.6;
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
      font-size: 10.5pt; font-weight: 700;
      color: ${THEME.goldSoft};
      text-transform: uppercase; letter-spacing: .16em;
      margin: 0 0 8pt;
      display: flex; align-items: center; gap: 10pt;
    }
    .insight-box .insight-label::before {
      content: ""; display: inline-block;
      width: 18pt; height: 1.2pt; background: ${THEME.gold};
    }
    .insight-box p:last-child,
    .insight-box ul:last-child,
    .insight-box ol:last-child { margin-bottom: 0; }
    .insight-box p,
    .insight-box li { font-size: 9.8pt; line-height: 1.55; }

    /* Inline list-item callout (Form 3): "What This Means:" inside a <li> */
    li.insight-li {
      list-style: none;
      padding: 10pt 14pt 9pt 14pt;
      margin: 8pt 0;
      background: ${THEME.paperAlt};
      border-left: 3pt solid ${THEME.gold};
      border-radius: 2pt;
      border-bottom: none !important;
      box-shadow: inset 0 0 0 0.5pt ${THEME.rule};
      page-break-inside: avoid;
    }
    li.insight-li::before { display: none !important; content: none !important; }
    li.insight-li .insight-label-inline {
      display: inline-block;
      font-family: 'Inter', sans-serif;
      font-size: 8.5pt; font-weight: 700;
      color: ${THEME.goldSoft};
      text-transform: uppercase; letter-spacing: .14em;
      margin-right: 8pt;
    }
    li.insight-li .insight-li-body {
      font-size: 9.8pt; line-height: 1.55; color: ${THEME.ink};
    }

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
    ol > li { counter-increment: ol; }
    ol > li::before {
      content: counter(ol, decimal-leading-zero);
      position: absolute; left: 0; top: 3pt;
      font-family: 'Playfair Display', serif;
      font-weight: 700; font-size: 9pt;
      color: ${THEME.goldSoft};
    }
    .toc ol, .toc ol > li { counter-reset: none; counter-increment: none; }
    .toc ol > li::before { content: none !important; display: none !important; }

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
      table-layout: auto;
      font-variant-numeric: tabular-nums lining-nums;
      font-feature-settings: "tnum" 1, "lnum" 1, "kern" 1;
    }
    tr { page-break-inside: avoid; page-break-after: auto; }
    tr:nth-child(even) td { background: ${THEME.paperAlt}; }
    th, td {
      border-bottom: 0.5pt solid ${THEME.rule};
      padding: 5.5pt 7pt;
      text-align: left; vertical-align: top;
      word-break: normal; overflow-wrap: break-word;
      hyphens: auto;
    }
    th {
      background: ${THEME.ink}; color: ${THEME.gold};
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      text-transform: uppercase; letter-spacing: .08em;
      font-size: 7pt; border-bottom: none;
    }
    td { color: ${THEME.ink}; }
    /* Numeric columns: right-align cells whose content reads numeric. */
    td.num, th.num, td:last-child, th:last-child { text-align: right; font-variant-numeric: tabular-nums lining-nums; }
    td:first-child, th:first-child {
      font-weight: 600;
      width: 1%;
      white-space: nowrap;
      text-align: left;
    }
    /* Allow long first-column labels (>22 chars) to wrap naturally instead of being broken mid-word */
    td:first-child { white-space: normal; min-width: 80pt; max-width: 180pt; }
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
    /* ── Cover (standard NPC cover image, full-bleed) ── */
    .cover {
      page: cover;
      page-break-after: always;
      width: 210mm; height: 297mm;
      margin: 0; padding: 0;
      position: relative;
      background: #0a0a0a;
      overflow: hidden;
    }
    .cover img.cover-bg {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }

    /* ── Disclaimer / Contact closing page ── */
    .disclaimer-page {
      page: disclaimer-page;
      page-break-before: always;
      width: 210mm; height: 297mm;
      margin: 0; padding: 22mm 20mm 20mm;
      background: #141414;
      color: #BF9B50;
      position: relative;
      font-family: 'Inter', sans-serif;
    }
    .disclaimer-page .company-main { font-size: 28pt; font-weight: 800; letter-spacing: .02em; color: #BF9B50; line-height: 1.05; }
    .disclaimer-page .company-sub { font-size: 16pt; font-weight: 400; color: #BF9B50; margin-top: 4pt; }
    .disclaimer-page .contact-heading { margin-top: 18mm; font-size: 14pt; font-weight: 700; color: #BF9B50; letter-spacing: .04em; }
    .disclaimer-page .contact-list { margin-top: 12pt; display: block; }
    .disclaimer-page .contact-row { display: flex; align-items: baseline; gap: 14pt; padding: 5pt 0; border-bottom: 0.4pt solid rgba(191,155,80,0.18); }
    .disclaimer-page .contact-row:last-child { border-bottom: none; }
    .disclaimer-page .contact-row .label { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; color: #BF9B50; min-width: 70pt; }
    .disclaimer-page .contact-row .value { font-size: 10pt; font-weight: 400; color: #E8D7A8; word-break: break-word; }
    .disclaimer-page .disclaimer-body {
      position: absolute;
      left: 20mm; right: 20mm; bottom: 20mm;
      font-size: 8.5pt;
      line-height: 1.55;
      color: #999999;
      font-weight: 400;
    }
    .disclaimer-page .disclaimer-body p { margin: 0 0 6pt; }

    /* ── Table of Contents (real page numbers via target-counter) ── */
    .toc { page: toc; page-break-after: always; padding-top: 6mm; }
    .toc h1 { bookmark-level: 1; bookmark-label: "Contents"; }
    .toc .toc-eyebrow { font-family: 'Inter', sans-serif; font-size: 8pt; color: ${THEME.goldSoft}; letter-spacing: .25em; text-transform: uppercase; margin-bottom: 4mm; }
    .toc h1 { font-family: 'Playfair Display', serif; font-size: 38pt; font-weight: 800; margin: 0 0 12mm; letter-spacing: -0.01em; }
    .toc ol { counter-reset: tocnum; list-style: none; padding: 0; margin: 0; }
    .toc ol li {
      counter-increment: tocnum;
      padding: 9pt 0; border-bottom: 0.5pt dotted ${THEME.rule};
      font-family: 'Inter', sans-serif; font-size: 11pt;
      color: ${THEME.ink};
      page-break-inside: avoid;
    }
    .toc ol li a {
      color: ${THEME.ink}; text-decoration: none;
      display: grid;
      grid-template-columns: 46pt 1fr auto 40pt;
      align-items: baseline;
      column-gap: 10pt;
    }
    .toc ol li a::before {
      content: counter(tocnum, decimal-leading-zero);
      font-family: 'Playfair Display', serif;
      font-style: italic; font-weight: 500;
      color: ${THEME.goldSoft}; font-size: 13pt;
      text-align: left;
      font-variant-numeric: lining-nums tabular-nums;
    }
    .toc ol li .title { font-family: 'Playfair Display', serif; font-weight: 600; font-size: 14pt; min-width: 0; overflow-wrap: break-word; }
    .toc ol li .dots { border-bottom: 0.5pt dotted ${THEME.rule}; min-width: 30pt; height: 0; transform: translateY(-3pt); }
    /* WeasyPrint: real cross-referenced page numbers — resolved at paginate time. */
    .toc ol li a::after {
      content: target-counter(attr(href), page);
      font-family: 'Playfair Display', serif;
      font-weight: 700; color: ${THEME.ink}; font-size: 12pt;
      text-align: right;
      font-variant-numeric: lining-nums tabular-nums;
    }

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
    .kpi-value {
      font-family: 'Playfair Display', serif;
      font-weight: 700; font-size: 19pt;
      color: ${THEME.ink}; line-height: 1;
      font-variant-numeric: lining-nums tabular-nums;
      font-feature-settings: "lnum" 1, "tnum" 1, "kern" 1;
    }

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

    /* ── Premium auto-injected charts ── */
    .chart-wrap {
      margin: 16pt 0 20pt;
      padding: 12pt 14pt 10pt;
      background: #FFFDF8;
      border: 0.4pt solid ${THEME.rule};
      border-radius: 3pt;
      box-shadow: 0 1pt 0 rgba(40,28,10,0.03);
      page-break-inside: avoid;
    }
    .auto-chart { margin: 0; text-align: center; page-break-inside: avoid; }
    .auto-chart img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
    .auto-chart figcaption {
      margin-top: 6pt;
      font-family: 'Inter', sans-serif;
      font-size: 7.6pt;
      letter-spacing: .08em;
      color: ${THEME.inkMuted};
      text-align: center;
    }
    .chart-wrap > table {
      margin-top: 12pt; font-size: 8.2pt;
      border-top: 0.5pt solid ${THEME.rule};
    }
    .chart-wrap > table th { background: transparent; color: ${THEME.inkMuted}; font-size: 7.5pt; letter-spacing: .12em; }
    .financial-charts { page-break-after: auto; }
    .financial-chart { margin-bottom: 14pt; }
    .chart-title {
      font-family: 'Playfair Display', 'Georgia', serif;
      font-size: 12.5pt;
      font-weight: 700;
      color: ${THEME.ink};
      margin: 0 0 6pt;
      padding-bottom: 4pt;
      border-bottom: 0.4pt solid ${THEME.rule};
    }

    /* ── KPI sparklines ── */
    .kpi-spark { margin-top: 8pt; height: 28pt; opacity: 0.95; }
    .kpi-spark img { width: 100%; height: 100%; object-fit: contain; display: block; }

    /* ── Compare cards (Strengths/Watch, Pros/Cons) ── */
    .compare-card {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12pt;
      margin: 16pt 0;
      page-break-inside: avoid;
    }
    .compare-col {
      padding: 13pt 15pt 11pt;
      border-radius: 3pt;
      border: 0.5pt solid ${THEME.rule};
      background: #FFFDF8;
    }
    .compare-pos { background: linear-gradient(180deg, #ECF4E1 0%, #F4F8EC 100%); border-left: 3pt solid ${THEME.good}; }
    .compare-neg { background: linear-gradient(180deg, #F5E0D9 0%, #F9EBE5 100%); border-left: 3pt solid ${THEME.risk}; }
    .compare-head {
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .18em;
      font-size: 7.5pt;
      margin-bottom: 8pt;
      padding-bottom: 5pt;
      border-bottom: 0.5pt solid ${THEME.rule};
    }
    .compare-pos .compare-head { color: ${THEME.good}; }
    .compare-neg .compare-head { color: ${THEME.risk}; }
    .compare-col ul { margin: 0; padding: 0; }
    .compare-col li { padding-left: 16pt; border-bottom: 0.25pt dotted ${THEME.rule}; font-size: 9pt; }
    .compare-pos li::before { background: ${THEME.good}; }
    .compare-neg li::before { background: ${THEME.risk}; }

    /* ── Process timeline ── */
    ol.timeline {
      counter-reset: none;
      list-style: none;
      padding: 0;
      margin: 16pt 0;
    }
    ol.timeline li {
      display: grid;
      grid-template-columns: 64pt 1fr;
      gap: 14pt;
      padding: 12pt 0;
      border-bottom: 0.5pt solid ${THEME.rule};
      page-break-inside: avoid;
      counter-increment: none;
    }
    ol.timeline li::before { content: none; }
    ol.timeline .step-no {
      font-family: 'Playfair Display', serif;
      font-weight: 800;
      font-style: italic;
      color: ${THEME.goldSoft};
      font-size: 15pt;
      line-height: 1.1;
      padding-top: 2pt;
      border-right: 1.5pt solid ${THEME.gold};
      padding-right: 10pt;
    }
    ol.timeline .step-title {
      font-family: 'Playfair Display', serif;
      font-weight: 700;
      font-size: 12.5pt;
      margin-bottom: 4pt;
      color: ${THEME.ink};
    }
    ol.timeline .step-body { font-size: 9.5pt; }
    ol.timeline .step-body p { margin-bottom: 4pt; }

    /* ── Chapter hero illustrations (placement-driven) ── */
    .chapter-hero {
      margin: 18pt 0 16pt;
      page-break-inside: avoid;
      page-break-after: avoid;
      position: relative;
      overflow: hidden;
    }
    .chapter-hero img {
      display: block;
      width: 100%;
      height: 100%;
    }
    .chapter-hero.hero-rounded { border-radius: 8pt; }
    .chapter-hero.hero-flush { border-radius: 0; }

    /* width modes */
    .chapter-hero.hero-w-content { width: auto; }
    .chapter-hero.hero-w-bleed { margin-left: -17mm; margin-right: -17mm; width: 210mm; border-radius: 0; }

    /* height modes — fixed pt heights so image always fills the frame */
    .chapter-hero.hero-h-compact  { height: 110pt; }
    .chapter-hero.hero-h-standard { height: 170pt; }
    .chapter-hero.hero-h-tall     { height: 260pt; }
    .chapter-hero.hero-h-full {
      height: 257mm;
      margin: 0 -17mm;
      width: 210mm;
      border-radius: 0;
      page-break-before: always;
      page-break-after: always;
    }

    /* fit + focal */
    .chapter-hero.hero-fit-cover img   { object-fit: cover; }
    .chapter-hero.hero-fit-contain img { object-fit: contain; background: ${THEME.paperAlt}; }
    .chapter-hero.hero-focal-top img    { object-position: center top; }
    .chapter-hero.hero-focal-center img { object-position: center center; }
    .chapter-hero.hero-focal-bottom img { object-position: center bottom; }

    /* ──────────────────────────────────────────────────────────────────
       Editorial primitives (Tier 2 — pull-quotes, sidenotes, columns,
       custom SVG visualisations, footnotes + cross-references)
       ────────────────────────────────────────────────────────────────── */

    /* Pull-quote — full-bleed editorial highlight. */
    aside.pull-quote {
      margin: 22pt -8mm 22pt -8mm;
      padding: 18pt 28pt 16pt 60pt;
      background: linear-gradient(180deg, ${THEME.paperAlt} 0%, ${THEME.paper} 100%);
      border-top: 0.5pt solid ${THEME.rule};
      border-bottom: 0.5pt solid ${THEME.rule};
      position: relative;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    aside.pull-quote::before {
      content: "\\201C";
      position: absolute; left: 18pt; top: 4pt;
      font-family: 'Playfair Display', serif;
      font-weight: 800; font-size: 72pt; line-height: 1;
      color: ${THEME.gold};
    }
    aside.pull-quote p {
      margin: 0;
      font-family: 'Cormorant Garamond', 'Playfair Display', serif;
      font-style: italic; font-weight: 500;
      font-size: 18pt; line-height: 1.35;
      color: ${THEME.ink};
      text-align: left; hyphens: none;
      font-feature-settings: "kern" 1, "liga" 1, "dlig" 1;
    }

    /* Side-note — hangs in the right margin (gutter) for editorial commentary. */
    aside.sidenote {
      float: right;
      width: 38mm;
      margin: 4pt -12mm 8pt 12pt;
      padding: 9pt 10pt 8pt;
      background: ${THEME.paperAlt};
      border-left: 2pt solid ${THEME.goldSoft};
      font-family: 'Inter', sans-serif;
      font-size: 8.2pt;
      line-height: 1.5;
      color: ${THEME.inkMuted};
      page-break-inside: avoid;
      break-inside: avoid;
    }
    aside.sidenote p { margin: 0; }
    aside.sidenote::before {
      content: "NOTE";
      display: block;
      font-weight: 700; font-size: 7pt;
      letter-spacing: .18em;
      color: ${THEME.goldSoft};
      margin-bottom: 4pt;
    }

    /* Two-column flow — multi-column body for dense narrative sections. */
    .two-col {
      column-count: 2;
      column-gap: 14pt;
      column-rule: 0.4pt solid ${THEME.rule};
      orphans: 3; widows: 3;
      margin: 12pt 0;
    }
    .two-col h3, .two-col h4 { column-span: all; }
    .two-col p { margin-top: 0; }

    /* ── Custom SVG visualisations (gauge, waterfall, heatmap, wheel) ── */
    figure.vis-figure {
      margin: 16pt 0 20pt;
      padding: 14pt 16pt 10pt;
      background: ${THEME.paper};
      border: 0.4pt solid ${THEME.rule};
      border-radius: 4pt;
      box-shadow: 0 1pt 0 rgba(40,28,10,0.04);
      page-break-inside: avoid;
      break-inside: avoid;
      text-align: center;
    }
    figure.vis-figure svg {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    figure.vis-figure figcaption {
      margin-top: 8pt;
      font-family: 'Inter', sans-serif;
      font-size: 7.8pt;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: ${THEME.inkMuted};
    }

    /* ── Footnotes (CSS Paged Media — WeasyPrint) ── */
    span.footnote {
      float: footnote;
      font-family: 'Inter', sans-serif;
      font-size: 7.8pt; line-height: 1.45;
      color: ${THEME.inkMuted};
    }
    ::footnote-call {
      content: counter(footnote);
      font-family: 'Playfair Display', serif;
      font-weight: 700;
      color: ${THEME.gold};
      vertical-align: super;
      font-size: 0.72em;
      line-height: 0;
      margin-left: 1pt;
    }
    ::footnote-marker {
      content: counter(footnote) ". ";
      font-family: 'Playfair Display', serif;
      font-weight: 700;
      color: ${THEME.gold};
      font-size: 8pt;
    }

    /* ── Cross-references — "see p. X" auto-resolved by WeasyPrint ── */
    a.xref {
      color: ${THEME.goldSoft};
      text-decoration: none;
      font-family: 'Inter', sans-serif;
      font-style: italic;
      font-size: 0.94em;
      white-space: nowrap;
    }
    a.xref .xref-prefix { margin-right: 3pt; }
    a.xref .xref-page::before {
      content: " " target-counter(attr(href), page);
      font-weight: 600;
      font-style: normal;
      color: ${THEME.ink};
      font-variant-numeric: lining-nums tabular-nums;
    }

    /* ──────────────────────────────────────────────────────────────────
       Tier 3 — Section dividers, quote pages, oversized stat blocks
       ────────────────────────────────────────────────────────────────── */
    @page section-divider-page {
      margin: 0;
      background: ${THEME.bg};
      @top-left { content: none; } @top-right { content: none; }
      @bottom-left { content: none; } @bottom-right { content: none; }
      @bottom-center { content: none; }
    }
    @page quote-page {
      margin: 0;
      background: ${THEME.paperAlt};
      @top-left { content: none; } @top-right { content: none; }
      @bottom-left { content: none; } @bottom-right { content: none; }
      @bottom-center { content: none; }
    }
    section.section-divider {
      page: section-divider-page;
      break-before: page; page-break-before: always;
      break-after: page;  page-break-after: always;
      width: 210mm; min-height: 297mm;
      margin: 0 -20mm; padding: 38mm 24mm;
      background:
        radial-gradient(120% 80% at 80% 10%, rgba(212,168,67,0.20) 0%, rgba(212,168,67,0) 60%),
        radial-gradient(80% 60% at 10% 90%, rgba(46,108,176,0.18) 0%, rgba(46,108,176,0) 65%),
        linear-gradient(170deg, ${THEME.bg} 0%, #1a1409 100%);
      color: ${THEME.text};
      display: block;
      position: relative;
    }
    section.section-divider .sd-eyebrow {
      font-family: 'Inter', sans-serif;
      text-transform: uppercase;
      letter-spacing: .26em;
      font-size: 9pt; font-weight: 600;
      color: ${THEME.gold};
      margin-bottom: 28mm;
    }
    section.section-divider .sd-stat {
      font-family: 'Playfair Display', 'Fraunces', serif;
      font-weight: 800;
      font-size: 220pt;
      line-height: 0.9;
      letter-spacing: -0.04em;
      background: linear-gradient(135deg, ${THEME.gold} 0%, ${THEME.goldSoft} 60%, #8a6418 100%);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent; color: transparent;
      font-variant-numeric: lining-nums proportional-nums;
      margin: 0;
    }
    section.section-divider .sd-label {
      font-family: 'Cormorant Garamond', serif;
      font-style: italic;
      font-size: 18pt;
      color: ${THEME.muted};
      margin-top: 6pt;
      max-width: 120mm;
    }
    section.section-divider .sd-headline {
      font-family: 'Playfair Display', serif;
      font-weight: 400;
      font-size: 32pt;
      line-height: 1.15;
      color: ${THEME.text};
      margin-top: 24mm;
      max-width: 150mm;
      border-top: 0.5pt solid rgba(212,168,67,0.35);
      padding-top: 14pt;
    }

    section.quote-page {
      page: quote-page;
      break-before: page; page-break-before: always;
      break-after: page;  page-break-after: always;
      width: 210mm; min-height: 297mm;
      margin: 0 -20mm; padding: 60mm 32mm;
      background: ${THEME.paperAlt};
      color: ${THEME.ink};
      display: block;
      position: relative;
    }
    section.quote-page::before {
      content: "\\201C";
      position: absolute; top: 32mm; left: 28mm;
      font-family: 'Playfair Display', serif;
      font-weight: 800; font-size: 360pt; line-height: 0.8;
      color: ${THEME.gold}; opacity: 0.18;
    }
    section.quote-page .qp-eyebrow {
      font-family: 'Inter', sans-serif;
      text-transform: uppercase;
      letter-spacing: .24em;
      font-size: 8.5pt; font-weight: 600;
      color: ${THEME.goldSoft};
      margin-bottom: 14mm;
      position: relative;
    }
    section.quote-page blockquote.qp-body {
      font-family: 'Cormorant Garamond', 'Playfair Display', serif;
      font-style: italic; font-weight: 500;
      font-size: 38pt; line-height: 1.18;
      color: ${THEME.ink};
      margin: 0; padding: 0;
      max-width: 140mm;
      position: relative;
      hyphens: none;
      font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "swsh" 1;
    }
    section.quote-page .qp-attrib {
      font-family: 'Inter', sans-serif;
      font-size: 10pt; font-weight: 600;
      letter-spacing: .14em; text-transform: uppercase;
      color: ${THEME.inkMuted};
      margin-top: 18mm;
      position: relative;
    }

    /* Inline oversized statistic block (smaller cousin of section-divider). */
    .stat-block {
      margin: 18pt 0 22pt;
      padding: 16pt 20pt;
      background: linear-gradient(180deg, ${THEME.paperAlt} 0%, ${THEME.paper} 100%);
      border-left: 4pt solid ${THEME.gold};
      page-break-inside: avoid; break-inside: avoid;
    }
    .stat-block .stat-value {
      font-family: 'Playfair Display', serif;
      font-weight: 800; font-size: 64pt; line-height: 1;
      color: ${THEME.navy};
      font-variant-numeric: lining-nums proportional-nums;
      letter-spacing: -0.02em;
    }
    .stat-block .stat-value .stat-unit {
      font-size: 0.45em; font-weight: 500; color: ${THEME.goldSoft};
      margin-left: 6pt; vertical-align: 0.4em;
    }
    .stat-block .stat-label {
      font-family: 'Inter', sans-serif;
      font-size: 9pt; font-weight: 600;
      text-transform: uppercase; letter-spacing: .18em;
      color: ${THEME.inkMuted};
      margin-top: 4pt;
    }
    .stat-block .stat-sub {
      font-family: 'Cormorant Garamond', serif;
      font-style: italic; font-size: 11pt; color: ${THEME.inkMuted};
      margin-top: 2pt;
    }

    /* ──────────────────────────────────────────────────────────────────
       Tier 3 #10 — Print-quality image treatments
       SVG filter primitives defined once in the body, classes opt-in.
       ────────────────────────────────────────────────────────────────── */
    .chapter-hero.hero-treatment-grain img,
    .chapter-hero.hero-treatment-duotone img {
      /* WeasyPrint resolves filter URLs to in-document <defs>. */
    }
    .chapter-hero.hero-treatment-grain img    { filter: url(#npc-grain); }
    .chapter-hero.hero-treatment-duotone img  { filter: url(#npc-duotone-gold); }
    .chapter-hero.hero-treatment-warm img     { filter: sepia(0.18) saturate(1.08) contrast(1.03); }

    /* Auto-numbered figure captions: "FIGURE 04 — Caption…" */
    body { counter-reset: section figure footnote; }
    figure.auto-chart, figure.vis-figure { counter-increment: figure; }
    figure.auto-chart figcaption::before,
    figure.vis-figure figcaption::before {
      content: "Figure " counter(figure, decimal-leading-zero) " — ";
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: ${THEME.gold};
      margin-right: 4pt;
    }
    figure figcaption .photo-credit {
      display: block;
      font-family: 'Cormorant Garamond', serif;
      font-style: italic;
      font-size: 7.5pt;
      color: ${THEME.inkMuted};
      margin-top: 2pt;
    }

    /* External / contact links — visible affordance in interactive PDF viewers. */
    a.contact-link, a.ext-link {
      color: ${THEME.gold};
      text-decoration: none;
      border-bottom: 0.4pt dotted ${THEME.goldSoft};
    }
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
           ${toc.map((t) => `<li><a href="#${t.id}"><span class="title">${esc(t.title)}</span><span class="dots"></span></a></li>`).join("")}
         </ol>
       </section>`
    : "";

  // PDF metadata — surfaced in Acrobat properties + search indexing.
  const docTitle = `${address} — Investment Report`;
  const docAuthor = String(contact.company_name || brandName || "NPC Property");
  const docDescription = `Comprehensive investment analysis for ${address}.`;
  const locKeywords = [loc?.suburb, loc?.state, loc?.postcode].filter(Boolean).join(", ");
  const docKeywords = [
    "investment property",
    "Australian real estate",
    locKeywords,
    docAuthor,
    "Compass report",
  ].filter(Boolean).join(", ");
  const docCreated = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<title>${esc(docTitle)}</title>
<meta name="author" content="${esc(docAuthor)}" />
<meta name="description" content="${esc(docDescription)}" />
<meta name="keywords" content="${esc(docKeywords)}" />
<meta name="subject" content="${esc(`Investment Report — ${address}`)}" />
<meta name="generator" content="NPC Premium PDF (WeasyPrint)" />
<meta name="dcterms.created" content="${esc(docCreated)}" />
<meta name="dcterms.creator" content="${esc(docAuthor)}" />
<!-- Fonts bundled in the WeasyPrint container at /usr/share/fonts/truetype/premium.
     Kept as fallback for the Api2PDF/headless-Chrome render path. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap">
<style>${styles}
${designOverrideStyles}
${(() => {
  // ── Premium Layer (Phase 1+2) — wins specificity over all earlier rules.
  // Watermark generated as a tiled SVG data URI: ultra-light diagonal brand
  // string repeated across every page background.
  const wmText = String(contact.company_name || brandName || "NPC").toUpperCase();
  const wmSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='560' height='560' viewBox='0 0 560 560'>
      <g transform='rotate(-32 280 280)' font-family='Inter, sans-serif' font-size='13' font-weight='700'
         letter-spacing='6' fill='${palette.ink}' fill-opacity='0.035'>
        <text x='-40' y='90'>${wmText}</text>
        <text x='80'  y='250'>${wmText}</text>
        <text x='-40' y='410'>${wmText}</text>
        <text x='80'  y='570'>${wmText}</text>
      </g>
    </svg>`)}`;
  return `
    /* ── Phase 1+2 Premium Layer ─────────────────────────────────────── */

    /* Tiled watermark on every body page (cover/disclaimer/divider exempt). */
    @page { background: ${palette.paper} url('${wmSvg}') repeat; background-size: 280px 280px; }
    @page cover, @page disclaimer-page, @page section-divider-page, @page quote-page { background-image: none; }

    /* Wider outer margin → real marginalia rail. */
    @page :left  { margin: 24mm 14mm 22mm 26mm; }
    @page :right { margin: 24mm 26mm 22mm 14mm; }

    /* Thumb-index tabs — rendered as DOM spans inside each h2, positioned into
       the wide outer margin, with per-chapter top offset + colour rotation set
       inline by the annotator. Mirrors a printed annual-report thumb index. */
    .thumb-tab {
      position: absolute;
      right: -28mm;
      width: 22mm;
      padding: 6pt 5pt 6pt 7pt;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      font-family: 'Inter', sans-serif;
      font-size: 7pt; font-weight: 800;
      letter-spacing: .26em; text-transform: uppercase;
      color: #fff;
      border-radius: 2pt 0 0 2pt;
      box-shadow: -0.5pt 0.5pt 2pt rgba(0,0,0,0.18);
      -webkit-text-fill-color: #fff;
      background: ${palette.accent}; /* overridden inline per chapter */
      max-height: 50mm;
      overflow: hidden;
      z-index: 4;
    }
    /* Ghost chapter numeral now also rendered via DOM span so we can show the
       *real* chapter index from the annotator (not relying on CSS counter, which
       resets per @page chapter-opener flow). */
    .ch-ghost {
      position: absolute;
      right: -8mm; top: -32mm;
      font-family: 'Playfair Display', 'Fraunces', serif;
      font-weight: 800; font-style: italic;
      font-size: 220pt; line-height: 1;
      color: ${withAlpha(palette.accent, 0.07)};
      -webkit-text-fill-color: ${withAlpha(palette.accent, 0.07)};
      background: none;
      pointer-events: none; z-index: 0;
      letter-spacing: -0.05em;
      font-variant-numeric: lining-nums;
    }

    /* The new editorial opener (mono eyebrow ::before + ghosted-outline ::after
       numeral defined upstream) replaces the legacy .ch-ghost DOM span. Hide it
       so we don't render two ghost numerals on top of each other. */
    .ch-ghost { display: none !important; }
    h2 { position: relative; overflow: visible; z-index: 1; }
    h2 + p { position: relative; z-index: 2; }

    /* End-of-chapter ornament — fills the inevitable tail whitespace with a
       quiet editorial sign-off instead of dead cream. Sits at the bottom of
       the previous chapter's last page; the next h2 still forces a fresh page. */
    .chapter-closer {
      display: flex;
      align-items: center;
      gap: 12pt;
      margin: 36pt auto 0;
      padding: 0;
      width: 60%;
      break-after: page;        /* push the next h2 onto its own opener page */
      page-break-after: always;
      break-inside: avoid;
    }
    .chapter-closer-rule {
      flex: 1;
      height: 0.5pt;
      background: linear-gradient(90deg, transparent 0%, ${THEME.gold} 50%, transparent 100%);
      opacity: 0.6;
    }
    .chapter-closer-mark {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 10pt;
      color: ${THEME.gold};
      letter-spacing: 0;
      line-height: 1;
    }
    /* The first chapter has no preceding closer, so its opener still works. */

    /* Real initial-letter drop cap (WeasyPrint supports this; degrades to ::first-letter). */
    ${design.showDropCaps ? `
    h2 + p::first-letter {
      -webkit-initial-letter: 3 2;
      initial-letter: 3 2;
      font-family: 'Playfair Display', 'Fraunces', serif;
      font-weight: 800;
      color: ${palette.accent};
      margin-right: 6pt;
      padding-right: 3pt;
      font-feature-settings: "kern" 1, "dlig" 1, "swsh" 1;
      line-height: 0.82;
    }
    ` : ""}

    /* ── Foil-stamp cover ── */
    .cover-foil {
      position: absolute; inset: 0; z-index: 1;
      background-size: cover; background-position: center;
      mix-blend-mode: screen;
      pointer-events: none;
    }
    .cover-masthead {
      position: absolute; left: 0; right: 0; top: 22mm;
      text-align: center; z-index: 3;
      font-family: 'Inter', sans-serif;
      font-size: 9pt; font-weight: 800;
      letter-spacing: .42em;
      color: ${palette.accent};
      text-shadow: 0 0 14pt rgba(0,0,0,0.6);
    }
    .cover-masthead::before, .cover-masthead::after {
      content: ""; display: inline-block;
      width: 28mm; height: 0.5pt;
      background: ${palette.accent};
      vertical-align: middle;
      margin: 0 8mm;
      opacity: 0.7;
    }
    .cover-rule {
      width: 36mm; height: 1pt;
      background: linear-gradient(90deg, ${palette.accent} 0%, ${withAlpha(palette.accent, 0)} 100%);
      margin: 8mm 0 8mm;
    }
    .cover-prepared {
      font-family: 'Cormorant Garamond', serif;
      font-style: italic; font-size: 11pt;
      color: rgba(255,255,255,0.78);
      margin-top: 6mm; letter-spacing: 0;
      text-transform: none;
    }
    .cover-prepared strong {
      font-style: normal; font-weight: 600;
      color: ${palette.accent}; letter-spacing: .04em;
    }
    .cover-edition {
      position: absolute; right: 18mm; bottom: 14mm; z-index: 3;
      font-family: 'Inter', sans-serif;
      font-size: 7pt; font-weight: 700;
      letter-spacing: .32em;
      color: ${palette.accent}; opacity: 0.85;
    }

    /* Cover scrim deepened so masthead + foil pop against any background. */
    .cover-scrim {
      background: linear-gradient(160deg,
        rgba(0,0,0,0.75) 0%,
        rgba(0,0,0,0.55) 38%,
        rgba(0,0,0,0.20) 72%,
        rgba(0,0,0,0.62) 100%) !important;
    }

    /* ── Editor's Note (intro card) ── */
    .editors-note {
      margin: 0 0 22pt;
      padding: 16pt 22pt 14pt;
      background: ${palette.paperAlt};
      border-top: 0.5pt solid ${palette.accent};
      border-bottom: 0.5pt solid ${palette.accent};
      page-break-inside: avoid; break-inside: avoid;
      position: relative;
    }
    .editors-note .en-eyebrow {
      font-family: 'Inter', sans-serif;
      font-size: 7.5pt; font-weight: 800;
      text-transform: uppercase; letter-spacing: .26em;
      color: ${palette.accent};
      margin-bottom: 8pt;
    }
    .editors-note .en-body {
      font-family: 'Cormorant Garamond', serif;
      font-style: italic;
      font-size: 13pt; line-height: 1.5;
      color: ${palette.ink};
      margin: 0;
    }
    .editors-note .en-sig {
      margin-top: 10pt;
      font-family: 'Playfair Display', serif;
      font-size: 10pt; font-style: italic;
      color: ${palette.heading2};
    }

    /* Stronger pull-quote / blockquote treatment. */
    blockquote {
      border-left-width: 4pt !important;
      padding-left: 44pt !important;
    }
    blockquote::before {
      font-size: 64pt !important; top: -4pt !important;
      color: ${withAlpha(palette.accent, 0.55)} !important;
    }

    /* Tight widows/orphans across the board (Phase 1 #4). */
    p, li, td, th { widows: 3; orphans: 3; }
    h2, h3, h4 { break-after: avoid-page; page-break-after: avoid; }
    h2 + p, h3 + p { break-before: avoid-page; }
    figure, .insight-box, .stat-block, table, .kpi, .score-card,
    blockquote, aside.pull-quote, aside.sidenote {
      break-inside: avoid-page; page-break-inside: avoid;
      box-decoration-break: clone; -webkit-box-decoration-break: clone;
    }

    /* OpenType: small-caps for eyebrow labels everywhere. */
    .toc-eyebrow, .insight-label, .insight-label-inline,
    .kpi-label, .stat-label, .cover-kicker, .cover-meta,
    .sd-eyebrow, .qp-eyebrow, .en-eyebrow {
      font-feature-settings: "smcp" 1, "c2sc" 1, "kern" 1;
      font-variant-caps: all-small-caps;
    }

    /* Tabular figures on every number-heavy surface. */
    table, .kpi-value, .stat-value, .score-card,
    .cover-edition, .cover-meta {
      font-variant-numeric: tabular-nums lining-nums;
      font-feature-settings: "tnum" 1, "lnum" 1, "kern" 1;
    }

    /* Hanging punctuation for body paragraphs. */
    p, blockquote, li { hanging-punctuation: first last; }

    /* TOC chapter dots: aligned leader dots with real page nums. */
    .toc ol li a { font-feature-settings: "tnum" 1, "lnum" 1; }

    /* ── Phase 1 #8 — Sidenote floats into outer margin rail ── */
    aside.sidenote {
      float: right;
      clear: right;
      width: 38mm;
      margin: 0 -30mm 8pt 10pt;
      padding: 8pt 10pt;
      font-family: 'Cormorant Garamond', serif;
      font-style: italic;
      font-size: 8.4pt;
      line-height: 1.45;
      color: ${palette.ink};
      background: ${palette.paperAlt};
      border-left: 2pt solid ${palette.accent};
      shape-outside: margin-box;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    aside.sidenote::before {
      content: "";
      display: block;
      width: 18pt; height: 0.5pt;
      background: ${palette.accent};
      margin-bottom: 4pt;
    }
    aside.sidenote p { margin: 0 0 4pt; font-size: inherit; }

    /* ── Phase 1 #1 — Auto-landscape spread for wide tables ── */
    @page landscape-table-page {
      size: A4 landscape;
      margin: 18mm 16mm 16mm 16mm;
      background: ${palette.paper};
      @top-left { content: string(chapter); }
      @top-right { content: "${esc(address)}"; font-style: italic; }
      @bottom-right { content: counter(page) " · " counter(pages); }
    }
    .landscape-spread {
      page: landscape-table-page;
      break-before: page; page-break-before: always;
      break-after: page;  page-break-after: always;
      margin: 0; padding: 0;
    }
    .landscape-spread .landscape-inner { width: 100%; }
    .landscape-spread table {
      width: 100% !important;
      font-size: 9pt;
      page-break-inside: auto;
    }
    .landscape-spread table th,
    .landscape-spread table td { padding: 6pt 8pt; }
    .landscape-spread::before {
      content: "Detailed data spread";
      display: block;
      font-family: 'Inter', sans-serif;
      font-size: 7.5pt; font-weight: 700;
      letter-spacing: .28em; text-transform: uppercase;
      color: ${palette.accent};
      margin-bottom: 8pt;
    }

    /* ── Phase 2 #7 — Chapter opener typographic spread (no-hero fallback).
       Every chapter opener page gets a hairline gold rule under the running
       header area and extra top padding so the title breathes. */
    h2[data-ch] {
      padding-top: 22pt;
      border-top: 0.5pt solid ${withAlpha(palette.accent, 0.45)};
      margin-top: 0;
    }
    h2[data-ch]::before {
      ${design.showSectionNumbers ? `` : `content: none;`}
    }

    /* ── Phase 4 — Pull-quote / quote-page full-bleed editorial spread ── */
    .quote-page {
      break-before: page; page-break-before: always;
      break-after: page;  page-break-after: always;
      page: chapter-opener-page;
      min-height: 240mm;
      display: flex; flex-direction: column; justify-content: center;
      padding: 40mm 28mm;
      background: ${palette.paperAlt};
      position: relative;
    }
    .quote-page .qp-eyebrow {
      font-family: 'Inter', sans-serif;
      font-size: 8pt; font-weight: 800;
      letter-spacing: .32em; text-transform: uppercase;
      color: ${palette.accent};
      margin-bottom: 18pt;
    }
    .quote-page .qp-body {
      font-family: 'Cormorant Garamond', serif;
      font-style: italic; font-weight: 500;
      font-size: 38pt; line-height: 1.18;
      color: ${palette.heading2};
      margin: 0; padding: 0; border: 0;
      letter-spacing: -0.01em;
      hanging-punctuation: first last;
    }
    .quote-page .qp-body::before { content: "\\201C"; font-size: 1em; color: ${palette.accent}; margin-right: .05em; }
    .quote-page .qp-body::after  { content: "\\201D"; color: ${palette.accent}; margin-left: .05em; }
    .quote-page .qp-attrib {
      margin-top: 22pt;
      font-family: 'Inter', sans-serif;
      font-size: 9.5pt; letter-spacing: .12em; text-transform: uppercase;
      color: ${palette.heading3};
    }

    /* ── Phase 4 — Data dashboard full-page spread ── */
    .dashboard-page {
      break-before: page; page-break-before: always;
      break-after: page;  page-break-after: always;
      page: chapter-opener-page;
      padding: 26mm 22mm;
      background: ${palette.paper};
    }
    .dashboard-page .dp-eyebrow {
      font-family: 'Inter', sans-serif;
      font-size: 8pt; font-weight: 800; letter-spacing: .32em; text-transform: uppercase;
      color: ${palette.accent}; margin-bottom: 6pt;
    }
    .dashboard-page .dp-title {
      font-family: 'Playfair Display', serif; font-weight: 700;
      font-size: 28pt; line-height: 1.1; color: ${palette.heading2};
      margin: 0 0 18pt; border: 0; padding: 0;
    }
    .dashboard-page .dp-title::before { content: none !important; }
    .dashboard-page .dp-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      grid-template-rows: auto auto;
      gap: 12pt;
      margin-bottom: 14pt;
    }
    .dashboard-page .dp-big-cell {
      grid-row: span 2;
      padding: 18pt 20pt;
      background: ${palette.paperAlt};
      border-top: 2pt solid ${palette.accent};
      display: flex; flex-direction: column; justify-content: space-between;
      min-height: 130mm;
    }
    .dashboard-page .dp-big-value {
      font-family: 'Playfair Display', serif; font-weight: 800;
      font-size: 120pt; line-height: 0.95; color: ${palette.heading2};
      font-variant-numeric: lining-nums tabular-nums;
      letter-spacing: -0.03em;
    }
    .dashboard-page .dp-big-label {
      font-family: 'Inter', sans-serif;
      font-size: 10pt; font-weight: 700; letter-spacing: .22em; text-transform: uppercase;
      color: ${palette.heading3}; margin-top: 8pt;
    }
    .dashboard-page .dp-spark { margin-top: auto; }
    .dashboard-page .dp-peers {
      padding: 14pt 16pt; background: ${palette.paperAlt};
      border-left: 2pt solid ${palette.accent};
    }
    .dashboard-page .dp-peers-title {
      font-family: 'Inter', sans-serif; font-size: 8pt; font-weight: 800;
      letter-spacing: .22em; text-transform: uppercase; color: ${palette.accent};
      margin-bottom: 8pt;
    }
    .dashboard-page .dp-peer-row {
      display: flex; justify-content: space-between;
      padding: 5pt 0; border-bottom: 0.4pt solid ${withAlpha(palette.accent, 0.25)};
      font-family: 'Inter', sans-serif; font-size: 10pt; color: ${palette.ink};
      font-variant-numeric: tabular-nums lining-nums;
    }
    .dashboard-page .dp-peer-row:last-child { border-bottom: 0; }
    .dashboard-page .dp-map { padding: 8pt; background: ${palette.paperAlt}; }
    .dashboard-page .dp-narrative {
      font-family: 'Cormorant Garamond', serif; font-style: italic;
      font-size: 13pt; line-height: 1.5; color: ${palette.ink};
      margin: 18pt 0 0; padding-top: 12pt;
      border-top: 0.5pt solid ${palette.accent};
    }

    /* ── Phase 4 — Signature page (personalised sign-off + QR) ── */
    .signature-page {
      break-before: page; page-break-before: always;
      break-after: page;  page-break-after: always;
      page: chapter-opener-page;
      padding: 50mm 28mm;
      background: ${palette.paper};
      min-height: 240mm;
    }
    .signature-page .sg-eyebrow {
      font-family: 'Inter', sans-serif; font-size: 8pt; font-weight: 800;
      letter-spacing: .32em; text-transform: uppercase; color: ${palette.accent};
      margin-bottom: 24pt;
    }
    .signature-page .sg-body {
      font-family: 'Cormorant Garamond', serif; font-style: italic;
      font-size: 18pt; line-height: 1.45; color: ${palette.heading2};
      margin: 0 0 40pt; max-width: 130mm;
    }
    .signature-page .sg-row {
      display: flex; justify-content: space-between; align-items: flex-end;
      gap: 20pt; padding-top: 18pt;
      border-top: 0.5pt solid ${palette.accent};
    }
    .signature-page .sg-sig-mark { margin-bottom: 6pt; }
    .signature-page .sg-sig-name {
      font-family: 'Playfair Display', serif; font-weight: 700;
      font-size: 14pt; color: ${palette.heading2};
    }
    .signature-page .sg-sig-role,
    .signature-page .sg-sig-company,
    .signature-page .sg-sig-date {
      font-family: 'Inter', sans-serif; font-size: 9.5pt;
      color: ${palette.heading3}; margin-top: 2pt;
    }
    .signature-page .sg-sig-date {
      font-size: 8pt; letter-spacing: .2em; text-transform: uppercase;
      color: ${palette.accent}; margin-top: 6pt;
    }
    .signature-page .sg-qr {
      text-align: center;
    }
    .signature-page .sg-qr img { width: 100pt; height: 100pt; }
    .signature-page .sg-qr-cap {
      font-family: 'Inter', sans-serif; font-size: 7.5pt;
      letter-spacing: .22em; text-transform: uppercase;
      color: ${palette.heading3}; margin-top: 6pt;
    }

    /* ── Phase 3 — Visualisation figure container (bullet/marimekko/map/calendar) ── */
    .vis-figure {
      margin: 14pt 0 16pt;
      padding: 10pt; background: ${palette.paper};
      border: 0.4pt solid ${withAlpha(palette.accent, 0.35)};
      page-break-inside: avoid; break-inside: avoid;
    }
    .vis-figure figcaption {
      margin-top: 8pt; padding-top: 6pt;
      border-top: 0.4pt solid ${withAlpha(palette.accent, 0.25)};
      font-family: 'Inter', sans-serif; font-size: 8pt;
      letter-spacing: .2em; text-transform: uppercase;
      color: ${palette.heading3}; text-align: center;
    }

    /* ════════════════════════════════════════════════════════════════════
       EDITORIAL PREMIUM LAYER v3 — final-pass override
       Blends Ref-A magazine editorial (Playfair display, mono eyebrows,
       generous negative space) with Ref-B warm brochure (cream paper,
       calm two-column copy, photo-led), in our brand palette.
       Loaded last so it wins specificity over all earlier rules.
       ════════════════════════════════════════════════════════════════════ */

    :root {
      --ed-ink:        #0F0F10;
      --ed-ink-soft:   #4A4438;
      --ed-paper:      #FAF7F1;
      --ed-paper-2:    #F1ECDF;
      --ed-rule:       #D8CBB6;
      --ed-gold:       #D4A843;
      --ed-gold-deep:  #8A6418;
      --ed-navy:       #14233A;
      --ed-navy-deep:  #061A33;
    }

    body {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 10.5pt; line-height: 1.55;
      color: var(--ed-ink); background: var(--ed-paper);
      font-feature-settings: "kern" 1, "liga" 1, "calt" 1, "ss01" 1;
      -webkit-font-smoothing: antialiased;
    }
    p { hyphens: auto; orphans: 3; widows: 3; }

    h1, h2, h3, .display, .cover-title {
      font-family: 'Playfair Display', 'Fraunces', Georgia, serif !important;
      font-weight: 700 !important;
      color: var(--ed-navy-deep);
      letter-spacing: -0.012em; line-height: 1.08;
      font-feature-settings: "lnum" 1, "kern" 1, "dlig" 1;
      background: none !important;
      -webkit-text-fill-color: var(--ed-navy-deep);
    }
    h1 { font-size: 36pt; }
    h2 { font-size: 26pt; margin-top: 0; }
    h3 { font-size: 15pt; }

    .eyebrow, .toc-eyebrow,
    .insight-label, .insight-label-inline,
    .kpi-label, .stat-label,
    .cover-kicker, .cover-meta,
    .sd-eyebrow, .qp-eyebrow, .en-eyebrow,
    .compare-head, .chart-title-eyebrow,
    .npc-view-label {
      font-family: 'IBM Plex Mono', ui-monospace, monospace !important;
      font-variant-caps: normal !important;
      font-feature-settings: "lnum" 1, "tnum" 1 !important;
      font-weight: 500 !important;
      text-transform: uppercase; letter-spacing: 0.18em;
      font-size: 7.6pt; color: var(--ed-gold-deep) !important;
    }
    .eyebrow::before, .en-eyebrow::before,
    .sd-eyebrow::before, .qp-eyebrow::before {
      content: "— "; color: var(--ed-gold); margin-right: 2pt;
    }

    @page {
      background: var(--ed-paper);
      background-image: none !important;
      @top-left {
        content: string(chapter);
        font-family: 'IBM Plex Mono', monospace;
        font-size: 7.6pt; font-weight: 500;
        text-transform: uppercase; letter-spacing: 0.22em;
        color: var(--ed-ink-soft);
      }
      @top-right {
        content: "${esc(address)}";
        font-family: 'IBM Plex Mono', monospace;
        font-size: 7.6pt; font-weight: 400;
        color: var(--ed-ink-soft);
        font-style: normal; letter-spacing: 0.08em;
      }
      @bottom-left {
        content: "${esc(brandName)}";
        font-family: 'IBM Plex Mono', monospace;
        font-size: 7.4pt; font-weight: 500;
        text-transform: uppercase; letter-spacing: 0.22em;
        color: var(--ed-ink-soft);
      }
      @bottom-center { content: ""; border-top: none; }
      @bottom-right {
        content: counter(page, decimal-leading-zero) "  /  " counter(pages, decimal-leading-zero);
        font-family: 'IBM Plex Mono', monospace;
        font-size: 8pt; font-weight: 600;
        color: var(--ed-ink);
        font-style: normal; letter-spacing: 0.08em;
        font-variant-numeric: lining-nums tabular-nums;
      }
    }

    @page cover { background: var(--ed-navy-deep); }
    .cover { background: var(--ed-navy-deep) !important; }
    .cover .cover-scrim {
      background: linear-gradient(180deg,
        rgba(6,26,51,0.20) 0%,
        rgba(6,26,51,0.30) 55%,
        rgba(6,26,51,0.88) 100%) !important;
    }
    .cover-masthead {
      font-family: 'IBM Plex Mono', monospace !important;
      font-weight: 500 !important;
      letter-spacing: 0.32em !important;
      font-size: 8pt !important;
      color: var(--ed-gold) !important;
      text-shadow: none !important; top: 18mm !important;
    }
    .cover-masthead::before, .cover-masthead::after {
      width: 14mm !important; background: var(--ed-gold) !important;
      opacity: 0.55 !important; margin: 0 6mm !important;
    }
    .cover-kicker {
      font-family: 'IBM Plex Mono', monospace !important;
      text-transform: uppercase !important;
      letter-spacing: 0.22em !important;
      font-size: 8pt !important; color: var(--ed-gold) !important;
      font-weight: 500 !important;
    }
    .cover-title {
      font-family: 'Playfair Display', serif !important;
      font-weight: 600 !important; font-style: normal;
      font-size: 48pt !important; line-height: 1.04 !important;
      letter-spacing: -0.018em !important;
      color: #FAF7F1 !important;
      -webkit-text-fill-color: #FAF7F1 !important;
      background: none !important; max-width: 84%;
    }
    .cover-title em, .cover-title i {
      font-style: italic; color: var(--ed-gold) !important;
      -webkit-text-fill-color: var(--ed-gold) !important;
    }
    .cover-rule {
      width: 28mm !important; height: 0.6pt !important;
      background: var(--ed-gold) !important;
      margin: 7mm 0 7mm !important; opacity: 0.85;
    }
    .cover-meta {
      font-family: 'IBM Plex Mono', monospace !important;
      letter-spacing: 0.14em !important; font-size: 9pt !important;
      text-transform: uppercase !important;
      color: rgba(250,247,241,0.82) !important;
    }
    .cover-prepared {
      font-family: 'Inter', sans-serif !important;
      font-style: normal !important; font-size: 9.5pt !important;
      color: rgba(250,247,241,0.7) !important;
    }
    .cover-prepared strong {
      color: var(--ed-gold) !important;
      font-weight: 600 !important; letter-spacing: 0.02em !important;
    }
    .cover-edition {
      font-family: 'IBM Plex Mono', monospace !important;
      font-weight: 500 !important; font-size: 7.4pt !important;
      letter-spacing: 0.24em !important;
      color: rgba(250,247,241,0.55) !important; opacity: 1 !important;
    }
    .cover-foil { opacity: 0.18 !important; mix-blend-mode: soft-light !important; }

    .ch-ghost { display: none !important; }
    .thumb-tab { display: none !important; }

    .kpi {
      background: transparent !important; border: 0 !important;
      border-top: 0.6pt solid var(--ed-gold) !important;
      border-radius: 0 !important; padding: 10pt 0 4pt !important;
    }
    .kpi-label {
      font-family: 'IBM Plex Mono', monospace !important;
      font-size: 7.2pt !important; letter-spacing: 0.18em !important;
      color: var(--ed-ink-soft) !important; font-weight: 500 !important;
    }
    .kpi-value {
      font-family: 'Playfair Display', serif !important;
      font-weight: 600 !important; font-size: 24pt !important;
      color: var(--ed-navy-deep) !important; letter-spacing: -0.01em;
    }
    .score-card {
      background: var(--ed-paper-2) !important; border: 0 !important;
      border-left: 2.5pt solid var(--ed-gold) !important;
      padding: 18pt 22pt !important;
    }
    .score-card .ring {
      background: conic-gradient(var(--ed-gold) 0%, var(--ed-gold) var(--p,0%), rgba(20,35,58,0.08) var(--p,0%)) !important;
      color: var(--ed-navy-deep) !important;
    }
    .score-card .ring::after { background: var(--ed-paper-2) !important; }
    .score-card .band {
      font-family: 'IBM Plex Mono', monospace !important;
      color: var(--ed-gold-deep) !important;
      letter-spacing: 0.22em !important; font-weight: 500 !important;
    }

    .compare-col {
      background: transparent !important; border: 0 !important;
      border-top: 0.6pt solid var(--ed-rule) !important;
      border-radius: 0 !important; padding: 12pt 0 0 !important;
    }
    .compare-pos, .compare-neg { border-left: 0 !important; }
    .compare-head {
      font-family: 'IBM Plex Mono', monospace !important;
      font-weight: 500 !important; letter-spacing: 0.22em !important;
      font-size: 7.6pt !important;
    }

    table {
      border-collapse: collapse !important; width: 100%;
      font-feature-settings: "tnum" 1, "lnum" 1;
    }
    table th {
      background: transparent !important;
      color: var(--ed-ink-soft) !important;
      font-family: 'IBM Plex Mono', monospace !important;
      font-size: 7.4pt !important; font-weight: 500 !important;
      letter-spacing: 0.18em !important; text-transform: uppercase !important;
      border-bottom: 0.6pt solid var(--ed-ink) !important;
      padding: 8pt 6pt !important; text-align: left;
    }
    table td {
      border-bottom: 0.3pt solid var(--ed-rule) !important;
      padding: 7pt 6pt !important; font-size: 9.6pt !important;
    }
    table tbody tr:nth-child(even) td { background: transparent !important; }

    blockquote, aside.pull-quote {
      font-family: 'Playfair Display', serif !important;
      font-style: italic !important;
      font-size: 18pt !important; line-height: 1.35 !important;
      color: var(--ed-navy-deep) !important;
      border-left: 2pt solid var(--ed-gold) !important;
      padding: 4pt 0 4pt 22pt !important; margin: 18pt 0 !important;
      background: transparent !important;
    }
    blockquote::before { content: none !important; }

    .editors-note {
      background: var(--ed-paper-2) !important;
      border-top: 0.6pt solid var(--ed-gold) !important;
      border-bottom: 0 !important; padding: 18pt 22pt !important;
    }
    .editors-note .en-body {
      font-family: 'Playfair Display', serif !important;
      font-style: italic !important;
      font-size: 14pt !important; line-height: 1.5 !important;
      color: var(--ed-navy-deep) !important;
    }

    .chapter-hero { border-radius: 0 !important; box-shadow: none !important; }
    .chapter-hero.hero-w-bleed {
      margin-left: -18mm !important; margin-right: -18mm !important;
      width: 210mm !important;
    }
    figure.auto-chart figcaption,
    figure.vis-figure figcaption,
    .chapter-hero figcaption {
      font-family: 'IBM Plex Mono', monospace !important;
      font-size: 7.4pt !important; letter-spacing: 0.18em !important;
      text-transform: uppercase !important;
      color: var(--ed-ink-soft) !important; text-align: left !important;
    }
    figure.auto-chart figcaption::before,
    figure.vis-figure figcaption::before {
      color: var(--ed-gold) !important;
      font-family: 'IBM Plex Mono', monospace !important;
      font-weight: 600 !important;
    }
    .chart-wrap, .vis-figure {
      background: transparent !important; border: 0 !important;
      border-top: 0.4pt solid var(--ed-rule) !important;
      box-shadow: none !important;
      padding: 14pt 0 6pt !important; border-radius: 0 !important;
    }

    /* ── Drop caps: disabled per editorial decision. Reset every prior rule. ── */
    h2 + p::first-letter,
    h2 + .standfirst::first-letter,
    .chapter > p:first-of-type::first-letter,
    p::first-letter {
      -webkit-initial-letter: normal !important;
      initial-letter: normal !important;
      float: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      color: inherit !important;
      -webkit-text-fill-color: inherit !important;
      line-height: inherit !important;
      padding: 0 !important;
      margin: 0 !important;
      background: none !important;
    }

    /* ── Chapter headings: balance multi-line wraps and tighten leading so
         a long title never orphans a single word onto its own line. ── */
    h2, h2[data-ch] {
      font-size: 22pt !important;
      line-height: 1.12 !important;
      letter-spacing: -0.015em !important;
      text-wrap: balance;
      -webkit-hyphens: manual !important;
      hyphens: manual !important;
      word-break: normal !important;
      overflow-wrap: normal !important;
      max-width: 100%;
      padding-right: 6mm;
    }
  `;
})()}</style>
</head>
<body>

<!-- ── Tier 3 #10 — SVG filter primitives for hero treatments (grain + duotone). ── -->
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">
  <defs>
    <filter id="npc-grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" seed="7"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0"/>
      <feComposite in2="SourceGraphic" operator="in" result="grain"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="grain"/></feMerge>
    </filter>
    <filter id="npc-duotone-gold" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0"/>
      <feComponentTransfer>
        <feFuncR type="table" tableValues="0.05 0.83"/>
        <feFuncG type="table" tableValues="0.07 0.66"/>
        <feFuncB type="table" tableValues="0.10 0.26"/>
      </feComponentTransfer>
    </filter>
  </defs>
</svg>

<!-- ── Cover (front-end controlled WeasyPrint design) ── -->
${coverHtml}


${tocHtml}

<!-- ── Executive Summary (replaces Snapshot + Finance Visuals) ── -->
<section class="body-page">
  ${executiveSummaryHtml}
</section>

<!-- ── Body (markdown) ── -->

<section class="body-page">
  ${bodyWithHeroes}
</section>

${
    sourcesHtml
      ? `<section class="body-page">${sourcesHtml}</section>`
      : ""
  }

<!-- ── Contact + Disclaimer closing page (matches all other NPC reports) ── -->
${(() => {
  const companyRaw = String(contact.company_name || brandName || "Property Consulting").toUpperCase();
  const parts = companyRaw.split(" ");
  const mainCompany = parts.length >= 2 ? parts.slice(0, -1).join(" ") : parts[0];
  const subCompany = parts.length >= 2 ? parts[parts.length - 1] : "";
  const rows: Array<[string, any]> = [
    ["Website", contact.website],
    ["Email", contact.email],
    ["Phone", contact.phone],
    ["Address", contact.address],
    ["ABN", contact.abn],
  ];
  const linkifyValue = (label: string, value: string): string => {
    const v = String(value).trim();
    if (label === "Email" && /^[^@\s]+@[^@\s]+$/.test(v)) {
      return `<a class="contact-link" href="mailto:${esc(v)}">${esc(v)}</a>`;
    }
    if (label === "Phone") {
      const tel = v.replace(/[^\d+]/g, "");
      return tel ? `<a class="contact-link" href="tel:${esc(tel)}">${esc(v)}</a>` : esc(v);
    }
    if (label === "Website") {
      const href = /^https?:\/\//i.test(v) ? v : `https://${v}`;
      return `<a class="contact-link" href="${esc(href)}">${esc(v)}</a>`;
    }
    return esc(v);
  };
  const rowsHtml = rows
    .filter(([, v]) => v)
    .map(([l, v]) => `<div class="contact-row"><div class="label">${esc(l)}</div><div class="value">${linkifyValue(String(l), String(v))}</div></div>`)
    .join("");
  const discText = disclaimer.is_enabled !== false && disclaimer.text
    ? String(disclaimer.text)
    : "This report is provided for general informational purposes only and does not constitute financial, taxation, legal, or investment advice. All figures, projections, and market commentary are derived from publicly available data and reasonable assumptions at the time of writing, and may change. Recipients should seek independent professional advice before making any investment decisions.";
  const discParas = discText
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`) 
    .join("");
  return `<section class="disclaimer-page">
    <div class="company-main">${esc(mainCompany)}</div>
    ${subCompany ? `<div class="company-sub">${esc(subCompany)}</div>` : ""}
    <div class="contact-heading">CONTACT US</div>
    <div class="contact-list">${rowsHtml}</div>
    <div class="disclaimer-body">${discParas}</div>
  </section>`;
})()}

<!-- TOC page numbers are resolved natively by WeasyPrint via CSS target-counter().
     The legacy JS estimator has been removed — Chrome/Api2PDF fallback will simply
     show blank pages in the TOC, which is acceptable since WeasyPrint is now primary. -->

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
        format: "A4",
        width: "210mm",
        height: "297mm",
        displayHeaderFooter: false,
        scale: 1,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        // Fonts (Google) + optional GPT-image hero images need a moment to settle.
        delay: 2500,
        puppeteerWaitForMethod: "WaitForNetworkIdle0",
        puppeteerWaitForValue: "load",
      },

    };

  let lastStatus = 0;
  let lastBody = "";
  let lastError = "";
  const startedAt = Date.now();
  for (const endpoint of [
    "https://v2.api2pdf.com/chrome/html",
    "https://v2.api2pdf.com/chrome/pdf/html",
    "https://v2018.api2pdf.com/chrome/html",
    "https://v2018.api2pdf.com/chrome/pdf/html",
  ]) {
    const remaining = MAX_RENDER_WAIT_MS - (Date.now() - startedAt);
    if (remaining <= 5_000) break;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(API2PDF_REQUEST_TIMEOUT_MS, remaining));
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: API2PDF_KEY,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn("[render-investment-report-pdf] Api2PDF request failed", { endpoint, error: lastError });
      break;
    } finally {
      clearTimeout(timeout);
    }

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



/**
 * Render via self-hosted WeasyPrint microservice.
 * Returns raw PDF bytes — the caller uploads to Supabase storage and
 * returns a signed URL so behaviour matches the legacy Api2PDF path.
 */
async function callWeasyPrint(html: string): Promise<Uint8Array> {
  const serviceUrl = (Deno.env.get("WEASYPRINT_SERVICE_URL") || "").trim().replace(/\/$/, "");
  const serviceToken = (Deno.env.get("WEASYPRINT_SERVICE_TOKEN") || Deno.env.get("WEASYPRINT_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
  if (!serviceUrl || !serviceToken) {
    throw new Error("WeasyPrint service not configured");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEASYPRINT_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${serviceUrl}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceToken}`,
        Accept: "application/pdf",
      },
      body: JSON.stringify({
        html,
        pdf_variant: "pdf/a-2b",   // Phase 1 #21 — archival, accessible PDF
        tagged: true,
        optimize_images: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const hint =
        res.status === 401
          ? " (token mismatch — the WEASYPRINT_SERVICE_TOKEN secret in Supabase does not equal the token deployed on the Cloud Run service; update one side to match the other)"
          : "";
      throw new Error(`WeasyPrint render failed (${res.status})${hint}: ${errBody.slice(0, 400)}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadPdfAndSign(
  supabase: ReturnType<typeof createClient>,
  bytes: Uint8Array,
  fileName: string,
): Promise<string> {
  const path = `generated/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${fileName}`;
  const { error: upErr } = await supabase.storage.from(PDF_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
    cacheControl: "3600",
  });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);
  const { data: signed, error: signErr } = await supabase
    .storage
    .from(PDF_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
  if (signErr || !signed?.signedUrl) {
    // Fall back to public URL if the bucket is public.
    const { data: pub } = supabase.storage.from(PDF_BUCKET).getPublicUrl(path);
    if (pub?.publicUrl) return pub.publicUrl;
    throw new Error(`signed URL failed: ${signErr?.message || "unknown"}`);
  }
  return signed.signedUrl;
}


if (import.meta.main) Deno.serve(async (req) => {
  const corsHeaders = createCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const WEASYPRINT_SERVICE_URL = (Deno.env.get("WEASYPRINT_SERVICE_URL") || "").trim();
    const WEASYPRINT_SERVICE_TOKEN = (Deno.env.get("WEASYPRINT_SERVICE_TOKEN") || Deno.env.get("WEASYPRINT_API_KEY") || "").trim().replace(/^["']|["']$/g, "");
    const weasyConfigured = Boolean(WEASYPRINT_SERVICE_URL && WEASYPRINT_SERVICE_TOKEN);
    if (!weasyConfigured && !API2PDF_KEY) {
      throw new Error("No PDF renderer configured (set WEASYPRINT_SERVICE_URL+WEASYPRINT_SERVICE_TOKEN or API2PDF_API_KEY)");
    }

    // Reset module-scoped chart cache each invocation to prevent
    // unbounded growth across warm restarts (root cause of recent OOMs).
    chartImageCache.clear();

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json();

    const { error: authError } = await verifyAuth(supabase, req.headers, body);
    if (authError) return createUnauthorizedResponse(authError, corsHeaders);

    const { reportId, includeCharts, includeHeroImages, includeSparklines, designOptions } = body;
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
    let contact: Record<string, any> = {};
    let disclaimer: { is_enabled?: boolean; text?: string; font_size?: string } = {};
    try {
      const { data: settingsRows } = await supabase
        .from("global_report_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["contact_details", "professional_disclaimer"]);
      for (const row of (settingsRows as any[]) || []) {
        if (row.setting_key === "contact_details" && row.setting_value) {
          contact = row.setting_value;
          if (contact.company_name) brandName = contact.company_name;
        } else if (row.setting_key === "professional_disclaimer" && row.setting_value) {
          disclaimer = row.setting_value;
        }
      }
    } catch { /* optional */ }


    const html = await buildHtml(report, brandName, {
      includeCharts: includeCharts !== false,
      includeSparklines: includeSparklines !== false,
      includeHeroImages: includeHeroImages === true,
      designOptions,
      contact,
      disclaimer,
    });
    const safeAddr = String(report.property_address || "report")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(0, 60);
    const fileName = `investment-report-${safeAddr}.pdf`;

    // Prefer self-hosted WeasyPrint (superior typography). If it is configured
    // but fails, fail loudly instead of silently returning another Chrome/Api2PDF
    // PDF that looks identical to the old renderer.
    let fileUrl: string | null = null;
    let renderer: "weasyprint" | "api2pdf" = "api2pdf";
    if (weasyConfigured) {
      try {
        const pdfBytes = await callWeasyPrint(html);
        fileUrl = await uploadPdfAndSign(supabase, pdfBytes, fileName);
        renderer = "weasyprint";
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[render-investment-report-pdf] WeasyPrint failed; Chrome fallback disabled", err);
        throw new Error(`WeasyPrint render failed; Chrome fallback disabled to avoid stale-looking PDFs. ${message}`);
      }
    }
    if (!fileUrl) {
      fileUrl = await callApi2Pdf(html, fileName);
      renderer = "api2pdf";
    }

    return new Response(JSON.stringify({ fileUrl, fileName, renderer }), {
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
