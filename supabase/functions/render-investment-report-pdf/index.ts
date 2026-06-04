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
const WEASYPRINT_SERVICE_URL = (Deno.env.get("WEASYPRINT_SERVICE_URL") || "").trim().replace(/\/$/, "");
const WEASYPRINT_SERVICE_TOKEN = (Deno.env.get("WEASYPRINT_SERVICE_TOKEN") || "").trim();
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

  // Fenced editorial blocks: ::: name … :::
  out = out.replace(/^::: *(pullquote|sidenote|cols) *\n([\s\S]*?)\n::: *$/gm, (_m, name, body) => {
    const inner = String(body).trim();
    if (name === "pullquote") return `\n<aside class="pull-quote"><p>${inner.replace(/\n+/g, " ")}</p></aside>\n`;
    if (name === "sidenote") return `\n<aside class="sidenote"><p>${inner.replace(/\n+/g, " ")}</p></aside>\n`;
    if (name === "cols") return `\n<div class="two-col">\n\n${inner}\n\n</div>\n`;
    return _m;
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
  const annotated = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (_m, attrs, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
    let id = `ch-${slugify(text) || `${toc.length + 1}`}`;
    let n = 1;
    while (used.has(id)) id = `ch-${slugify(text) || "section"}-${++n}`;
    used.add(id);
    toc.push({ id, title: text });
    return `<h2 id="${id}"${attrs}>${inner}</h2>`;
  });
  return { html: annotated, toc };
}

export async function buildHtml(
  report: any,
  brandName: string,
  opts: {
    includeCharts?: boolean;
    includeHeroImages?: boolean;
    includeSparklines?: boolean;
    contact?: Record<string, any>;
    disclaimer?: { is_enabled?: boolean; text?: string; font_size?: string };
  } = {},
): Promise<string> {
  const contact = opts.contact || {};
  const disclaimer = opts.disclaimer || {};
  const includeCharts = opts.includeCharts !== false;
  const includeSparklines = opts.includeSparklines !== false;
  const includeHeroImages = opts.includeHeroImages === true; // opt-in, costs tokens

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
  bodyHtml = applyFootnotesAndXrefs(bodyHtml);
  bodyHtml = wrapCompareCards(bodyHtml);
  bodyHtml = wrapProcessTimeline(bodyHtml);
  bodyHtml = wrapInsightSections(bodyHtml);
  if (includeCharts) {
    bodyHtml = await injectTableCharts(bodyHtml);
    console.log("[charts] embedded table charts", { count: (bodyHtml.match(/class=\"chart-wrap\"/g) || []).length });
  }
  bodyHtml = colourCodeTableCells(bodyHtml);
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

  const executiveSummaryHtml = `
    <h2 id="ch-executive-summary">Executive Summary</h2>
    <p>${para1Parts.filter(Boolean).join(" ")}</p>
    <p>${para2Parts.filter(Boolean).join(" ")}</p>
  `;

  // Parse address tail for cover meta (Suburb, STATE Postcode).
  const addrTail = address.split(",").map((s: string) => s.trim()).filter(Boolean);
  const coverLocation = loc?.suburb && loc?.state
    ? `${loc.suburb}, ${loc.state}`
    : addrTail.length >= 2
      ? addrTail.slice(-2).join(", ")
      : address;

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
      font-size: 28pt; font-weight: 700; letter-spacing: -0.005em;
      margin-top: 0;
      padding-bottom: 10pt;
      padding-top: 6pt;
      border-bottom: 0.5pt solid ${THEME.rule};
      display: block;
      /* Each chapter starts on a fresh page — editorial polish. */
      break-before: page;
      page-break-before: always;
      bookmark-level: 1;
      bookmark-label: content(text);
      bookmark-state: open;
      page: chapter-opener;
    }
    /* The very first h2 of the body should not force an extra blank page after the TOC. */
    section.body-page:first-of-type > h2:first-child { break-before: auto; page-break-before: auto; }

    h2::before {
      content: counter(section, decimal-leading-zero);
      font-family: 'Playfair Display', serif;
      font-weight: 500; font-style: italic;
      font-size: 18pt;
      -webkit-text-fill-color: ${THEME.gold};
      color: ${THEME.gold};
      letter-spacing: .04em;
      margin-right: 28pt;
      padding-right: 6pt;
      font-variant-numeric: lining-nums tabular-nums;
    }
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

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<title>${esc(address)} — Investment Report</title>
<!-- Fonts bundled in the WeasyPrint container at /usr/share/fonts/truetype/premium.
     Kept as fallback for the Api2PDF/headless-Chrome render path. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&display=swap">
<style>${styles}</style>
</head>
<body>

<!-- ── Cover (standard NPC cover image) ── -->
<section class="cover">
  <img class="cover-bg" src="https://npc-property-dashbord.lovable.app/templates/npc-portfolio-cover-new.jpg" alt="" />
</section>

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
  const rowsHtml = rows
    .filter(([, v]) => v)
    .map(([l, v]) => `<div class="contact-row"><div class="label">${esc(l)}</div><div class="value">${esc(v)}</div></div>`)
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

/**
 * Render via self-hosted WeasyPrint microservice.
 * Returns raw PDF bytes — the caller uploads to Supabase storage and
 * returns a signed URL so behaviour matches the legacy Api2PDF path.
 */
async function callWeasyPrint(html: string): Promise<Uint8Array> {
  if (!WEASYPRINT_SERVICE_URL || !WEASYPRINT_SERVICE_TOKEN) {
    throw new Error("WeasyPrint service not configured");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEASYPRINT_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${WEASYPRINT_SERVICE_URL}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WEASYPRINT_SERVICE_TOKEN}`,
        Accept: "application/pdf",
      },
      body: JSON.stringify({ html }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`WeasyPrint render failed (${res.status}): ${errBody.slice(0, 400)}`);
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

  throw new Error(
    `Api2PDF failed (${lastStatus}): ${lastError || lastBody.slice(0, 400)}`,
  );
}

if (import.meta.main) Deno.serve(async (req) => {
  const corsHeaders = createCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    const { reportId, includeCharts, includeHeroImages, includeSparklines } = body;
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
      contact,
      disclaimer,
    });
    const safeAddr = String(report.property_address || "report")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .slice(0, 60);
    const fileName = `investment-report-${safeAddr}.pdf`;

    // Prefer self-hosted WeasyPrint (superior typography); fall back to Api2PDF.
    let fileUrl: string | null = null;
    let renderer: "weasyprint" | "api2pdf" = "api2pdf";
    if (weasyConfigured) {
      try {
        const pdfBytes = await callWeasyPrint(html);
        fileUrl = await uploadPdfAndSign(supabase, pdfBytes, fileName);
        renderer = "weasyprint";
      } catch (err) {
        console.warn("[render-investment-report-pdf] WeasyPrint failed, falling back to Api2PDF", err);
        if (!API2PDF_KEY) throw err;
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
