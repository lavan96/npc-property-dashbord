// Premium investment report PDF renderer.
// Pipeline: fetch report row → build hybrid HTML (marketing cover + editorial body)
// → POST to Api2PDF WeasyPrint endpoint → return hosted FileUrl.
//
// Side-by-side with the legacy jsPDF (PixelPerfectPDFGenerator) renderer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { marked } from "https://esm.sh/marked@12.0.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-session-token, x-finance-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API2PDF_KEY = Deno.env.get("API2PDF_API_KEY")!;

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

function buildHtml(report: any, brandName: string): string {
  const address = report.property_address || "Property";
  const generated = new Date(report.created_at || Date.now()).toLocaleDateString(
    "en-AU",
    { day: "numeric", month: "long", year: "numeric" },
  );

  const fin = report.financial_calculations || {};
  const km = fin.keyMetrics || fin.key_metrics || {};
  const score = report.investment_score || {};
  const loc = report.location_intelligence || {};

  // Render markdown body. Strip front-matter style code fences if any.
  const md = String(report.report_content || "");
  const bodyHtml = marked.parse(md, { gfm: true, breaks: false }) as string;
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

  const styles = `
    @page {
      size: A4;
      margin: 18mm 16mm 20mm 16mm;
      @bottom-left { content: "${esc(brandName)}"; font-family: 'Inter', sans-serif; font-size: 8pt; color: ${THEME.muted}; }
      @bottom-right { content: counter(page) " / " counter(pages); font-family: 'Inter', sans-serif; font-size: 8pt; color: ${THEME.muted}; }
      @top-right { content: "${esc(address)}"; font-family: 'Inter', sans-serif; font-size: 8pt; color: ${THEME.muted}; }
    }
    @page cover {
      margin: 0;
      @top-right { content: none; }
      @bottom-left { content: none; }
      @bottom-right { content: none; }
    }
    @page divider {
      margin: 0;
      @top-right { content: none; }
      @bottom-left { content: none; }
      @bottom-right { content: none; }
    }
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@300;400;500;600;700&display=swap');

    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: ${THEME.bg};
      color: ${THEME.text};
      font-family: 'Inter', 'Helvetica', sans-serif;
      font-size: 10pt;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1, h2, h3, h4 { font-family: 'Fraunces', 'Georgia', serif; font-weight: 600; color: ${THEME.text}; margin: 0 0 .5em; }
    h1 { font-size: 26pt; line-height: 1.15; letter-spacing: -0.01em; }
    h2 { font-size: 16pt; color: ${THEME.gold}; border-bottom: 1px solid ${THEME.border}; padding-bottom: 6pt; margin-top: 18pt; }
    h3 { font-size: 12pt; color: ${THEME.text}; margin-top: 14pt; }
    h4 { font-size: 10.5pt; color: ${THEME.gold}; margin-top: 10pt; }
    p { margin: 0 0 .7em; }
    a { color: ${THEME.gold}; text-decoration: none; }
    strong { color: ${THEME.text}; }
    em { color: ${THEME.muted}; }
    ul, ol { margin: 0 0 .8em 1.2em; padding: 0; }
    li { margin-bottom: 4pt; }
    blockquote {
      margin: 12pt 0; padding: 10pt 14pt;
      background: ${THEME.surfaceAlt};
      border-left: 3px solid ${THEME.gold};
      color: ${THEME.muted};
      font-style: italic;
    }
    code {
      background: ${THEME.surfaceAlt};
      padding: 1pt 4pt;
      border-radius: 3pt;
      font-size: 9pt;
      color: ${THEME.gold};
    }
    table {
      width: 100%; border-collapse: collapse; margin: 10pt 0 14pt;
      font-size: 9pt;
      background: ${THEME.surface};
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid ${THEME.border};
      padding: 6pt 8pt;
      text-align: left;
      vertical-align: top;
    }
    th { background: ${THEME.surfaceAlt}; color: ${THEME.gold}; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; font-size: 8pt; }
    hr { border: 0; border-top: 1px solid ${THEME.border}; margin: 18pt 0; }

    /* ── Cover ── */
    .cover {
      page: cover;
      page-break-after: always;
      width: 210mm; height: 297mm;
      background:
        radial-gradient(ellipse at top right, rgba(212,168,67,0.18) 0%, transparent 55%),
        radial-gradient(ellipse at bottom left, rgba(212,168,67,0.08) 0%, transparent 60%),
        linear-gradient(180deg, #0a0a0a 0%, #141414 100%);
      color: ${THEME.text};
      padding: 28mm 22mm;
      position: relative;
    }
    .cover .brand {
      font-family: 'Inter'; font-weight: 700;
      letter-spacing: .35em;
      font-size: 9pt;
      color: ${THEME.gold};
      text-transform: uppercase;
    }
    .cover .rule {
      width: 80pt; height: 2pt; background: ${THEME.gold};
      margin: 10mm 0 14mm;
    }
    .cover .eyebrow {
      font-size: 9pt; letter-spacing: .25em; text-transform: uppercase;
      color: ${THEME.muted}; margin-bottom: 6mm;
    }
    .cover h1 {
      font-size: 38pt; line-height: 1.1;
      max-width: 150mm;
    }
    .cover .address {
      margin-top: 8mm;
      font-size: 14pt; color: ${THEME.gold};
      font-family: 'Fraunces', serif;
    }
    .cover .meta {
      position: absolute; left: 22mm; bottom: 22mm; right: 22mm;
      display: flex; justify-content: space-between; align-items: flex-end;
      font-size: 9pt; color: ${THEME.muted};
      border-top: 1px solid ${THEME.border};
      padding-top: 6mm;
    }
    .cover .meta .label { display: block; text-transform: uppercase; letter-spacing: .15em; font-size: 7.5pt; color: ${THEME.muted}; margin-bottom: 2pt; }
    .cover .meta .value { color: ${THEME.text}; font-size: 10.5pt; }

    /* ── Snapshot KPI grid ── */
    .snapshot {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8pt;
      margin: 8pt 0 14pt;
    }
    .kpi {
      background: ${THEME.surface};
      border: 1px solid ${THEME.border};
      border-left: 2.5pt solid ${THEME.gold};
      padding: 9pt 11pt;
      page-break-inside: avoid;
    }
    .kpi-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .12em; color: ${THEME.muted}; margin-bottom: 3pt; }
    .kpi-value { font-family: 'Fraunces', serif; font-size: 14pt; color: ${THEME.text}; }

    .score-card {
      background: ${THEME.surface};
      border: 1px solid ${THEME.border};
      padding: 14pt 16pt;
      margin: 8pt 0 14pt;
      display: flex; align-items: center; gap: 16pt;
      page-break-inside: avoid;
    }
    .score-card .ring {
      width: 70pt; height: 70pt; border-radius: 50%;
      background: conic-gradient(${THEME.gold} 0%, ${THEME.gold} var(--p, 0%), ${THEME.surfaceAlt} var(--p, 0%));
      display: flex; align-items: center; justify-content: center;
      font-family: 'Fraunces', serif; font-size: 22pt; color: ${THEME.text};
      position: relative;
    }
    .score-card .ring::after {
      content: ""; position: absolute; inset: 6pt; border-radius: 50%; background: ${THEME.surface};
    }
    .score-card .ring span { position: relative; z-index: 1; }
    .score-card .meta { flex: 1; }
    .score-card .band { color: ${THEME.gold}; text-transform: uppercase; letter-spacing: .15em; font-size: 9pt; }

    /* ── Section divider page ── */
    .divider {
      page: divider;
      page-break-before: always;
      page-break-after: always;
      width: 210mm; height: 297mm;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1408 100%);
      display: flex; flex-direction: column; justify-content: center;
      padding: 0 30mm;
    }
    .divider .num { color: ${THEME.gold}; font-family: 'Fraunces', serif; font-size: 64pt; line-height: 1; }
    .divider .ttl { font-family: 'Fraunces', serif; font-size: 28pt; color: ${THEME.text}; margin-top: 8mm; }
    .divider .ln { width: 60mm; height: 1.5pt; background: ${THEME.gold}; margin-top: 12mm; }

    .body-page { page-break-before: always; }
    .body-page:first-of-type { page-break-before: avoid; }

    .disclaimer {
      margin-top: 24pt;
      padding: 12pt 14pt;
      border: 1px solid ${THEME.border};
      background: ${THEME.surfaceAlt};
      font-size: 8pt;
      color: ${THEME.muted};
      page-break-inside: avoid;
    }
    .disclaimer h4 { margin-top: 0; color: ${THEME.muted}; }
  `;

  const scoreCard = scoreOverall != null
    ? `<div class="score-card">
         <div class="ring" style="--p:${Math.max(0, Math.min(100, Number(scoreOverall)))}%"><span>${esc(Math.round(Number(scoreOverall)))}</span></div>
         <div class="meta">
           <div class="band">${esc(scoreBand || "Investment Score")}</div>
           <h3 style="margin:4pt 0 2pt">Overall Investment Score</h3>
           <p style="margin:0;color:${THEME.muted};font-size:9pt">A weighted blend of yield, growth, demographic strength, infrastructure, and risk factors specific to this property and suburb.</p>
         </div>
       </div>`
    : "";

  const suburb = loc?.suburb || loc?.locality || "";
  const state = loc?.state || "";

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
      <span class="value">${esc([suburb, state].filter(Boolean).join(", ") || "—")}</span>
    </div>
    <div style="text-align:right">
      <span class="label">Report Type</span>
      <span class="value">Investment Analysis</span>
    </div>
  </div>
</section>

<!-- ── Snapshot ── -->
<section class="body-page">
  <h2>Snapshot</h2>
  ${kpiTiles ? `<div class="snapshot">${kpiTiles}</div>` : ""}
  ${scoreCard}
</section>

<!-- ── Divider ── -->
<section class="divider">
  <div class="num">01</div>
  <div class="ttl">The Analysis</div>
  <div class="ln"></div>
</section>

<!-- ── Body (markdown) ── -->
<section class="body-page">
  ${bodyHtml}
</section>

${
    sourcesHtml
      ? `<section class="divider">
           <div class="num">02</div>
           <div class="ttl">Sources &amp; References</div>
           <div class="ln"></div>
         </section>
         <section class="body-page">${sourcesHtml}</section>`
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
  // Api2PDF V2 — Headless Chrome HTML→PDF endpoint.
  // (Api2PDF does not expose a WeasyPrint endpoint; Chrome renders our CSS
  // — including web fonts, gradients and conic-gradient — with high fidelity.)
  const res = await fetch("https://v2.api2pdf.com/chrome/pdf/html", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: API2PDF_KEY,
    },
    body: JSON.stringify({
      html,
      fileName,
      inline: false,
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
    }),
  });

  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }

  if (!res.ok || !json?.Success || !json?.FileUrl) {
    throw new Error(
      `Api2PDF failed (${res.status}): ${json?.Error || text.slice(0, 400)}`,
    );
  }
  return json.FileUrl as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!API2PDF_KEY) throw new Error("API2PDF_API_KEY is not configured");

    const { reportId } = await req.json();
    if (!reportId || typeof reportId !== "string") {
      return new Response(JSON.stringify({ error: "reportId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

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

    // Best-effort brand name from global report settings; fall back gracefully.
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
