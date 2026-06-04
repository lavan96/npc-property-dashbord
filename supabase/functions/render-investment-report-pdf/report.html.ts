// Pure HTML builders for the editorial Premium PDF.
// Each function returns a string of semantic HTML that the EDITORIAL_CSS
// stylesheet knows how to render. No styling lives here.

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type CoverProps = {
  address: string;        // full street address
  locality: string;       // "Suburb, STATE Postcode"
  reportTitle: string;    // e.g. "Property Compass"
  reportType?: string;    // eyebrow line
  preparedFor: string;    // client name(s)
  preparedBy: string;     // advisor line
  generatedOn: string;    // formatted date string
  heroImageUrl?: string;  // optional full-bleed background
};

export function renderEditorialCover(p: CoverProps): string {
  const yr = new Date().getFullYear();
  const ed = String(new Date().getMonth() + 1).padStart(2, "0");
  const heroBg = p.heroImageUrl
    ? `<div class="cover-hero" style="background-image:url('${esc(p.heroImageUrl)}')"></div>`
    : "";

  // Italicise the locality fragment for a magazine-style mark on the title
  const titleHtml = p.address.includes(",")
    ? (() => {
        const head = p.address.split(",")[0]!.trim();
        const tail = p.address.slice(head.length + 1).trim();
        return `${esc(head)}<br/><em>${esc(tail)}</em>`;
      })()
    : esc(p.address);

  return `
    <section class="editorial-cover">
      ${heroBg}
      <div class="cover-scrim"></div>

      <div class="cover-masthead">
        <span>NPC · Investment Intelligence</span>
        <span class="vol">VOL. ${yr} · ED. ${ed}</span>
      </div>
      <div class="cover-rule"></div>

      <div class="cover-body">
        <div class="cover-eyebrow">— ${esc(p.reportType || p.reportTitle)}</div>
        <h1 class="cover-title">${titleHtml}</h1>

        <div class="cover-meta">
          <div>
            <span class="lbl">Prepared for</span>
            <span class="val">${esc(p.preparedFor)}</span>
          </div>
          <div>
            <span class="lbl">Prepared by</span>
            <span class="val">${esc(p.preparedBy)}</span>
          </div>
          <div>
            <span class="lbl">Issued</span>
            <span class="val">${esc(p.generatedOn)}</span>
          </div>
        </div>
      </div>

      <div class="cover-footer">
        <span>Confidential · Strategic Advisory</span>
        <span>Rendered via WeasyPrint</span>
      </div>
    </section>
  `;
}

export type ChapterHeaderProps = {
  number: string;       // "01"
  eyebrow: string;      // "Section · Executive Summary"
  title: string;
  dek?: string;         // optional standfirst
};

export function renderChapterHeader(p: ChapterHeaderProps): string {
  return `
    <header class="chapter-header">
      <div class="chapter-no">CHAPTER ${esc(p.number)}</div>
      <h1>${esc(p.title)}</h1>
      ${p.dek ? `<div class="chapter-dek">${esc(p.dek)}</div>` : ""}
    </header>
  `;
}

export function openChapter(eyebrow: string, chapterNo: string, chapterTitle: string): string {
  return `<section class="chapter" data-eyebrow="${esc(eyebrow)}" data-chapter-no="${esc(chapterNo)}" data-chapter-title="${esc(chapterTitle)}">`;
}
export function closeChapter(): string { return `</section>`; }

export type KpiCell = { label: string; value: string; foot?: string };
export function renderKpiStrip(cells: KpiCell[]): string {
  if (!cells.length) return "";
  return `
    <div class="kpi-strip">
      ${cells.map((c) => `
        <div class="kpi">
          <div class="kpi-label">${esc(c.label)}</div>
          <div class="kpi-value">${esc(c.value)}</div>
          ${c.foot ? `<div class="kpi-foot">${esc(c.foot)}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

export function renderPullQuote(text: string, attribution?: string): string {
  return `
    <blockquote class="pull-quote">
      ${esc(text)}
      ${attribution ? `<cite>${esc(attribution)}</cite>` : ""}
    </blockquote>
  `;
}

export function renderSidenote(label: string, body: string): string {
  return `
    <aside class="sidenote">
      <span class="sidenote-label">${esc(label)}</span>
      ${body}
    </aside>
  `;
}

export function renderTwoCol(bodyHtml: string): string {
  return `<div class="two-col">${bodyHtml}</div>`;
}

export type GridCol = { span: 4 | 5 | 7 | 8; html: string };
export function renderGrid12(cols: GridCol[]): string {
  return `<div class="grid-12">${cols.map((c) => `<div class="col-${c.span}">${c.html}</div>`).join("")}</div>`;
}

export type LedgerColumn = { key: string; label: string; align?: "left" | "right" };
export type LedgerRow = Record<string, string> & { __total?: boolean };
export function renderLedgerTable(cols: LedgerColumn[], rows: LedgerRow[]): string {
  if (!rows.length) return "";
  const head = cols.map((c) => `<th class="${c.align === "right" ? "num" : ""}">${esc(c.label)}</th>`).join("");
  const body = rows.map((r) => {
    const cells = cols.map((c) => `<td class="${c.align === "right" ? "num" : ""}">${esc(r[c.key] ?? "")}</td>`).join("");
    return `<tr class="${r.__total ? "total" : ""}">${cells}</tr>`;
  }).join("");
  return `<table class="ledger"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderEyebrow(label: string): string {
  return `<div class="eyebrow">${esc(label)}</div>`;
}
