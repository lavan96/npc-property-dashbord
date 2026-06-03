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
const EDGE_FUNCTION_TIMEOUT_MS = 1_500_000;
const RENDER_SAFETY_BUFFER_MS = 45_000;
const MAX_RENDER_WAIT_MS = EDGE_FUNCTION_TIMEOUT_MS - RENDER_SAFETY_BUFFER_MS;
// (Hero-image generation is now offloaded to `prepare-report-hero-images`.)
const API2PDF_REQUEST_TIMEOUT_MS = 600_000;

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

function renderSvgChart(config: Record<string, unknown>, width: number, height: number): string {
  const cfg: any = config || {};
  const type = String(cfg.type || "bar").toLowerCase();
  const labels = (cfg.data?.labels || []).map((l: unknown) => String(l ?? ""));
  const datasets = Array.isArray(cfg.data?.datasets) ? cfg.data.datasets : [];
  const axisMode = inferAxisMode(cfg);
  const bg = "#FFFDF8";
  const ink = "#2A2317";
  const muted = "#6B604F";
  const grid = "#D8CBB6";
  const plot = { x: 58, y: 28, w: Math.max(120, width - 86), h: Math.max(80, height - 86) };
  const title = String(cfg.options?.plugins?.title?.text || datasets[0]?.label || "");

  const defs = `<defs><filter id="softShadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#281C0A" flood-opacity="0.16"/></filter></defs>`;
  const frame = `<rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="${bg}"/><rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="8" fill="none" stroke="#E4D8C4"/>`;

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
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polygon points="${area}" fill="${withAlpha(color, 0.14)}"/><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  if (type === "doughnut" || type === "pie") {
    const values = datasetValues(datasets[0]);
    const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const cx = width * 0.38, cy = height * 0.52, r = Math.min(width, height) * 0.28;
    const sw = type === "doughnut" ? r * 0.38 : r;
    let offset = 25;
    const circles = values.map((v, i) => {
      const pct = Math.max(0, v) / total;
      const dash = `${(pct * 100).toFixed(4)} ${(100 - pct * 100).toFixed(4)}`;
      const color = CHART_PALETTE[i % CHART_PALETTE.length];
      const c = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-dashoffset="${offset}" pathLength="100" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset -= pct * 100;
      return c;
    }).join("");
    const legend = labels.map((label, i) => `<g transform="translate(${width * 0.68},${54 + i * 24})"><rect width="12" height="12" rx="2" fill="${CHART_PALETTE[i % CHART_PALETTE.length]}"/><text x="20" y="10" font-family="Inter,Arial" font-size="12" fill="${muted}">${svgEsc(label)} · ${formatAxisValue(values[i] || 0, axisMode)}</text></g>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}${frame}${title ? `<text x="28" y="32" font-family="Georgia" font-size="17" font-weight="700" fill="${ink}">${svgEsc(title)}</text>` : ""}<g filter="url(#softShadow)">${circles}</g>${type === "doughnut" ? `<circle cx="${cx}" cy="${cy}" r="${r - sw / 2 - 2}" fill="${bg}"/>` : ""}${legend}</svg>`;
  }

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
  const gridLines = Array.from({ length: 4 }, (_, i) => {
    const t = i / 3;
    const y = plot.y + t * plot.h;
    const val = rawMax - t * span;
    return `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${y}" y2="${y}" stroke="${grid}" stroke-opacity="0.72" stroke-width="1"/><text x="${plot.x - 10}" y="${y + 4}" text-anchor="end" font-family="Inter,Arial" font-size="10" fill="${muted}">${formatAxisValue(val, axisMode)}</text>`;
  }).join("");

  let marks = "";
  if (type === "line") {
    marks = series.map((s: any) => {
      const pts = s.values.map((v: number, i: number) => `${(plot.x + (i / Math.max(1, labels.length - 1)) * plot.w).toFixed(1)},${yOf(v).toFixed(1)}`);
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><g>${pts.map((p: string) => `<circle cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="3.3" fill="${s.color}" stroke="${bg}" stroke-width="1.4"/>`).join("")}</g>`;
    }).join("");
  } else {
    const groups = labels.length;
    const groupW = plot.w / groups;
    const barW = Math.max(8, Math.min(42, (groupW * 0.72) / Math.max(1, series.length)));
    marks = labels.map((_, i) => series.map((s: any, si: number) => {
      const v = s.values[i] ?? 0;
      const y = yOf(Math.max(v, 0));
      const zero = yOf(0);
      const x = plot.x + i * groupW + (groupW - barW * series.length) / 2 + si * barW;
      const h = Math.max(1, Math.abs(zero - y));
      return `<rect x="${x.toFixed(1)}" y="${Math.min(y, zero).toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${s.color}" opacity="0.92" filter="url(#softShadow)"/>`;
    }).join("")).join("");
  }
  const xLabels = labels.map((label, i) => {
    const x = plot.x + (i + 0.5) * (plot.w / labels.length);
    return `<text x="${x}" y="${plot.y + plot.h + 22}" text-anchor="middle" font-family="Inter,Arial" font-size="10" fill="${muted}">${svgEsc(label.length > 14 ? label.slice(0, 12) + "…" : label)}</text>`;
  }).join("");
  const legend = series.length > 1 ? `<g transform="translate(${plot.x},${height - 20})">${series.map((s: any, i: number) => `<g transform="translate(${i * 132},0)"><rect width="11" height="11" rx="2" fill="${s.color}"/><text x="17" y="10" font-family="Inter,Arial" font-size="10" fill="${muted}">${svgEsc(s.label)}</text></g>`).join("")}</g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}${frame}${title ? `<text x="28" y="32" font-family="Georgia" font-size="17" font-weight="700" fill="${ink}">${svgEsc(title)}</text>` : ""}<g>${gridLines}</g><line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${yOf(0)}" y2="${yOf(0)}" stroke="#B5A580"/>${marks}${xLabels}${legend}</svg>`;
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
    const uri = await chartDataUri(config, 780, 380, `donut:${numericCols[0].header}`);
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
    const uri = await chartDataUri(config, 820, 360, `line:${numericCols.map((c) => c.header).join(",")}`);
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
  const uri = await chartDataUri(config, 820, 380, `bar:${numericCols.map((c) => c.header).join(",")}`);
  if (!uri) return null;
  return `<figure class="auto-chart"><img src="${uri}" alt="Data visualisation"/></figure>`;
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
      if (canAddChart) chartAttempts += 1;
      const chart = canAddChart ? await tableToChartHtml(headers, dataRows) : null;
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
      }, 820, 370, "financial:value-equity-debt");
      if (uri) charts.push(`<div class="chart-wrap financial-chart"><div class="chart-title">10-year value, equity and debt path</div><figure class="auto-chart"><img src="${uri}" alt="10-year value equity and debt chart"/></figure></div>`);
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
      }, 820, 370, "financial:rent-cashflow");
      if (uri) charts.push(`<div class="chart-wrap financial-chart"><div class="chart-title">Rental income versus net cash flow</div><figure class="auto-chart"><img src="${uri}" alt="Rental income and cash flow chart"/></figure></div>`);
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
    }, 820, 340, "financial:yield-bars");
    if (uri) charts.push(`<div class="chart-wrap financial-chart"><div class="chart-title">Yield and leverage profile</div><figure class="auto-chart"><img src="${uri}" alt="Yield and leverage chart"/></figure></div>`);
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

async function loadReadyHeroImages(reportId: string): Promise<Record<string, string>> {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data } = await supabase
      .from("report_visual_assets")
      .select("section_key, public_url, include_in_report")
      .eq("report_id", reportId)
      .eq("status", "ready")
      .eq("include_in_report", true);
    const out: Record<string, string> = {};
    for (const r of (data || []) as Array<{ section_key: string; public_url: string }>) {
      if (r.public_url) out[r.section_key] = r.public_url;
    }
    return out;
  } catch (err) {
    console.warn("[render-investment-report-pdf] hero asset load failed", err);
    return {};
  }
}

function injectHeroImages(
  html: string,
  heroesBySlug: Record<string, string>,
  toc: Array<{ id: string; title: string }>,
): string {
  const idToSlug = new Map<string, string>();
  for (const t of toc) idToSlug.set(t.id, slugify(t.title));

  return html.replace(/<h2 id="(ch-[^"]+)"([^>]*)>([\s\S]*?)<\/h2>/gi, (_m, id, attrs, inner) => {
    const slug = idToSlug.get(id);
    const url = slug ? heroesBySlug[slug] : undefined;
    // Only render the chapter hero when an asset is both ready AND selected
    // for inclusion. Deselected chapters render the heading on its own.
    if (!url) return `<h2 id="${id}"${attrs}>${inner}</h2>`;
    return `<div class="chapter-hero"><img src="${url}" alt="" crossorigin="anonymous"/></div><h2 id="${id}"${attrs}>${inner}</h2>`;
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

export async function buildHtml(
  report: any,
  brandName: string,
  opts: { includeCharts?: boolean; includeHeroImages?: boolean; includeSparklines?: boolean } = {},
): Promise<string> {
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
  const md = cleanReportMarkdown(String(report.report_content || ""), address);
  let bodyHtml = marked.parse(md, { gfm: true, breaks: false }) as string;
  bodyHtml = stripBareCitations(bodyHtml);
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
    const heroes = report.id ? await loadReadyHeroImages(String(report.id)) : {};
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
    : (addrTailForSummary(address) || address);
  const priceTxt = km.purchasePrice != null ? fmtMoney(km.purchasePrice) : null;
  const yieldTxt = km.grossRentalYield != null ? fmtPct(km.grossRentalYield) : null;
  const rentTxt = km.weeklyRent != null ? fmtMoney(km.weeklyRent) : null;
  const cashflowTxt = km.weeklyNet != null ? fmtMoney(km.weeklyNet) : null;
  const lvrTxt = km.lvr != null ? fmtPct(km.lvr, 1) : null;
  const scoreTxt = scoreOverall != null ? `${Math.round(Number(scoreOverall))}/100${scoreBand ? ` (${scoreBand})` : ""}` : null;

  const para1Parts: string[] = [];
  para1Parts.push(`This report presents an independent investment analysis of <strong>${esc(address)}</strong>${suburbLabel && suburbLabel !== address ? `, located in <strong>${esc(suburbLabel)}</strong>` : ""}.`);
  if (priceTxt) para1Parts.push(`Modelled on a purchase price of <strong>${priceTxt}</strong>${lvrTxt ? ` at an LVR of <strong>${lvrTxt}</strong>` : ""}${rentTxt ? `, with an assessed market rent of <strong>${rentTxt}/week</strong>` : ""}${yieldTxt ? ` (gross yield <strong>${yieldTxt}</strong>)` : ""}.` : "");
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

    h1, h2, h3 {
      font-family: 'Playfair Display', 'Georgia', serif;
      margin: 0 0 .45em; page-break-after: avoid;
      background: ${NAVY_GRADIENT};
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      color: transparent;
    }
    h4 { font-family: 'Playfair Display', 'Georgia', serif; color: ${THEME.navy}; margin: 0 0 .45em; page-break-after: avoid; }
    h1 { font-size: 36pt; font-weight: 800; line-height: 1.08; letter-spacing: -0.01em; }
    h2 {
      counter-increment: section;
      string-set: chapter content();
      font-size: 28pt; font-weight: 700; letter-spacing: -0.005em;
      margin-top: 24pt;
      padding-bottom: 10pt;
      border-bottom: 0.5pt solid ${THEME.rule};
      display: block;
      page-break-before: auto;
    }
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
    }
    h3 {
      font-size: 17pt; font-weight: 600; margin-top: 18pt;
      padding-left: 10pt;
      border-left: 2.5pt solid ${THEME.gold};
    }
    h4 {
      font-family: 'Inter', sans-serif;
      font-size: 10pt; font-weight: 700;
      color: ${THEME.goldSoft};
      text-transform: uppercase; letter-spacing: .15em;
      margin-top: 14pt;
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
      display: flex; align-items: baseline; gap: 14pt;
      padding: 9pt 0; border-bottom: 0.5pt dotted ${THEME.rule};
      font-family: 'Inter', sans-serif; font-size: 11pt;
      color: ${THEME.ink};
    }
    .toc ol li::before {
      content: counter(tocnum, decimal-leading-zero);
      font-family: 'Playfair Display', serif;
      font-style: italic; font-weight: 500;
      color: ${THEME.goldSoft}; font-size: 13pt;
      width: 42pt; flex-shrink: 0;
    }
    .toc ol li .title { flex: 1; font-family: 'Playfair Display', serif; font-weight: 600; font-size: 14pt; padding-left: 4pt; }
    .toc ol li .dots { flex: 0 1 auto; border-bottom: 0.5pt dotted ${THEME.rule}; min-width: 30pt; margin: 0 8pt 3pt; height: 0; align-self: flex-end; }
    .toc ol li .page {
      font-family: 'Playfair Display', serif;
      font-weight: 700; color: ${THEME.ink}; font-size: 12pt;
      min-width: 28pt; text-align: right;
    }
    .toc ol li a { color: ${THEME.ink}; text-decoration: none; display: contents; }

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

    /* ── Premium auto-injected charts ── */
    .chart-wrap {
      margin: 18pt 0 22pt;
      padding: 14pt 14pt 10pt;
      background: linear-gradient(180deg, #FFFDF8 0%, #FAF4E4 100%);
      border: 0.5pt solid ${THEME.rule};
      border-radius: 4pt;
      box-shadow: 0 1pt 0 rgba(40,28,10,0.04), 0 6pt 16pt -8pt rgba(40,28,10,0.18);
      page-break-inside: avoid;
    }
    .auto-chart { margin: 0 0 8pt; text-align: center; page-break-inside: avoid; }
    .auto-chart img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
    .chart-wrap > table {
      margin-top: 10pt; font-size: 8.2pt;
      border-top: 0.5pt solid ${THEME.rule};
    }
    .chart-wrap > table th { background: transparent; color: ${THEME.inkMuted}; font-size: 7.5pt; letter-spacing: .12em; }
    .financial-charts { page-break-after: auto; }
    .financial-chart { margin-bottom: 14pt; }
    .chart-title {
      font-family: 'Playfair Display', 'Georgia', serif;
      font-size: 13.5pt;
      font-weight: 700;
      color: ${THEME.ink};
      margin: 0 0 8pt;
      padding-bottom: 5pt;
      border-bottom: 0.5pt solid ${THEME.rule};
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

    /* ── Chapter hero illustrations ── */
    .chapter-hero {
      margin: 18pt -17mm 16pt;
      page-break-inside: avoid;
      page-break-after: avoid;
      position: relative;
    }
    .chapter-hero img {
      width: 210mm;
      height: 55mm;
      object-fit: cover;
      display: block;
    }
    .chapter-hero::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, rgba(247,242,232,0.0) 60%, rgba(247,242,232,0.55) 100%);
      pointer-events: none;
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
           ${toc.map((t) => `<li><a href="#${t.id}"><span class="title">${esc(t.title)}</span><span class="dots"></span><span class="page"></span></a></li>`).join("")}
         </ol>
       </section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<title>${esc(address)} — Investment Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700;800&display=swap">
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
${financialChartsHtml}

<section class="body-page">
  ${bodyWithHeroes}
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

<script>
  // Estimate page number for each TOC entry by measuring chapter offset.
  // Headless Chrome doesn't support CSS target-counter, so we approximate.
  (function () {
    try {
      // A4 printable height at 96dpi minus top/bottom margins (20mm each).
      // 297mm - 40mm = 257mm => 257 * 3.7795 ≈ 971px
      var PAGE_PX = 971;
      // Cover (1) + TOC pages (estimated by toc section height).
      var tocSection = document.querySelector('.toc');
      var tocPages = tocSection ? Math.max(1, Math.ceil(tocSection.getBoundingClientRect().height / PAGE_PX)) : 1;
      var bodyStartOffset = 1 + tocPages; // pages BEFORE body content (cover + toc)
      // Body content starts after the cover+toc sections in the DOM.
      // We measure each h2's offsetTop relative to the first body h2.
      var firstBody = document.querySelector('section.body-page h2');
      if (!firstBody) return;
      var firstTop = firstBody.getBoundingClientRect().top + window.scrollY;
      document.querySelectorAll('.toc ol li a').forEach(function (a) {
        var href = a.getAttribute('href') || '';
        if (!href.startsWith('#')) return;
        var target = document.getElementById(href.slice(1));
        var pageSpan = a.querySelector('.page');
        if (!target || !pageSpan) return;
        var top = target.getBoundingClientRect().top + window.scrollY;
        var relative = Math.max(0, top - firstTop);
        var pageWithinBody = Math.floor(relative / PAGE_PX) + 1;
        pageSpan.textContent = String(bodyStartOffset + pageWithinBody);
      });
    } catch (e) {
      console.error('[toc-pagenum]', e);
    }
  })();
</script>

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

if (import.meta.main) Deno.serve(async (req) => {
  const corsHeaders = createCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!API2PDF_KEY) throw new Error("API2PDF_API_KEY is not configured");

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
    try {
      const { data: settings } = await supabase
        .from("global_report_settings")
        .select("contact_details")
        .maybeSingle();
      const cd = (settings as any)?.contact_details;
      if (cd?.company_name) brandName = cd.company_name;
    } catch { /* optional */ }

    const html = await buildHtml(report, brandName, {
      includeCharts: includeCharts !== false,
      includeSparklines: includeSparklines !== false,
      includeHeroImages: includeHeroImages === true,
    });
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
