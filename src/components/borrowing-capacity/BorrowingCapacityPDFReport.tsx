/**
 * Borrowing Capacity Snapshot PDF Report
 * 
 * Generates a branded jsPDF report with:
 * - Cover page
 * - Client summary header with assessment date
 * - Executive summary (KPIs with gold-accented boxes)
 * - Capacity utilisation gauge bar
 * - Key assumptions callout box
 * - Income analysis with shading
 * - Expenses & liabilities breakdown
 * - Capacity breakdown
 * - Enhanced recommendations & warnings
 * - Standardised disclaimer/contact page
 */

import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { fetchGlobalReportSettings } from '@/hooks/useGlobalReportSettings';
import { drawJsPDFDisclaimerPage } from '@/utils/pdfDisclaimerPage';
import { fetchLatestBorrowingCapacity } from '@/lib/fetchLatestBorrowingCapacity';
import { format } from 'date-fns';
import { smartCapitalize } from '@/utils/nameFormatting';

// ─── Design tokens ───────────────────────────────────────────────────────────
const GOLD = { r: 191, g: 155, b: 80 };
const GOLD_LIGHT = { r: 245, g: 235, b: 210 };
const NAVY = { r: 13, g: 38, b: 77 };
const DARK_BG = { r: 20, g: 20, b: 20 };
const WHITE = { r: 255, g: 255, b: 255 };
const GRAY = { r: 128, g: 128, b: 128 };
const LIGHT_GRAY = { r: 248, g: 248, b: 248 };
const ALT_ROW = { r: 252, g: 252, b: 252 };
const GREEN = { r: 22, g: 163, b: 74 };
const GREEN_LIGHT = { r: 220, g: 252, b: 231 };
const RED = { r: 239, g: 68, b: 68 };
const RED_LIGHT = { r: 254, g: 226, b: 226 };
const AMBER = { r: 245, g: 158, b: 11 };
const AMBER_LIGHT = { r: 255, g: 243, b: 205 };
const BODY_TEXT = { r: 55, g: 55, b: 55 };

type RGB = { r: number; g: number; b: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: number) => {
  const abs = Math.abs(v);
  const s = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `-$${s}` : `$${s}`;
};

/** Round a number to 2 decimal places safely */
const round2 = (v: number): number => Math.round(v * 100) / 100;

const bandColor = (band: string): RGB => {
  if (band === 'green') return GREEN;
  if (band === 'amber') return AMBER;
  return RED;
};

const bandLabel = (band: string): string => {
  if (band === 'green') return 'STRONG';
  if (band === 'amber') return 'MODERATE';
  return 'LIMITED';
};

/** Convert snake_case / kebab-case to Title Case */
const formatLabel = (s: string): string =>
  s.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function setColor(doc: jsPDF, c: RGB) {
  doc.setTextColor(c.r, c.g, c.b);
}

function setFill(doc: jsPDF, c: RGB) {
  doc.setFillColor(c.r, c.g, c.b);
}

function setDraw(doc: jsPDF, c: RGB) {
  doc.setDrawColor(c.r, c.g, c.b);
}

// ─── Page management ─────────────────────────────────────────────────────────
const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 15;

let totalPages = 0; // Will be set after generation for "Page X of Y"

function addFooter(doc: jsPDF, pageNum: number) {
  doc.setFontSize(7);
  setColor(doc, GRAY);
  doc.setFont('helvetica', 'normal');
  doc.text('Borrowing Capacity Snapshot  |  Confidential', MARGIN, FOOTER_Y);
  doc.text(`Page ${pageNum}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' });
  // Gold line
  setFill(doc, GOLD);
  doc.rect(MARGIN, FOOTER_Y - 4, CONTENT_W, 0.4, 'F');
}

function checkPageBreak(doc: jsPDF, y: number, needed: number, pageNum: { value: number }): number {
  if (y + needed > PAGE_H - 25) {
    addFooter(doc, pageNum.value);
    doc.addPage();
    pageNum.value++;
    return 30;
  }
  return y;
}

// ─── Section header (enhanced with full gold accent bar) ─────────────────────
function drawSectionHeader(doc: jsPDF, title: string, y: number): number {
  // Gold accent bar
  setFill(doc, GOLD);
  doc.rect(MARGIN, y, 3, 12, 'F');
  // Title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  setColor(doc, NAVY);
  doc.text(title, MARGIN + 8, y + 9);
  // Subtle underline
  setFill(doc, { r: 230, g: 230, b: 230 });
  doc.rect(MARGIN, y + 14, CONTENT_W, 0.3, 'F');
  return y + 22;
}

// ─── Enhanced table row helper with text wrapping ────────────────────────────
const ROW_HEIGHT = 10;
const MIN_ROW_HEIGHT = 10;
const LINE_H = 4;

/**
 * Draw a table row with automatic text wrapping for the first column.
 * Returns the new y position after the row.
 */
function drawTableRow(
  doc: jsPDF,
  y: number,
  cols: { text: string; x: number; align?: 'left' | 'right'; bold?: boolean; color?: RGB; maxWidth?: number }[],
  bg?: RGB
): number {
  // Calculate actual row height based on first column text wrapping
  let rowH = MIN_ROW_HEIGHT;
  let wrappedLines: string[] | null = null;

  if (cols.length > 0 && cols[0].maxWidth) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', cols[0].bold ? 'bold' : 'normal');
    wrappedLines = doc.splitTextToSize(cols[0].text, cols[0].maxWidth);
    if (wrappedLines.length > 1) {
      rowH = Math.max(MIN_ROW_HEIGHT, wrappedLines.length * LINE_H + 6);
    }
  }

  if (bg) {
    setFill(doc, bg);
    doc.rect(MARGIN, y - 5, CONTENT_W, rowH, 'F');
  }
  doc.setFontSize(8.5);
  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci];
    doc.setFont('helvetica', col.bold ? 'bold' : 'normal');
    setColor(doc, col.color || BODY_TEXT);
    if (ci === 0 && wrappedLines && wrappedLines.length > 1) {
      doc.text(wrappedLines, col.x, y + 1);
    } else {
      doc.text(col.text, col.x, y + 1, { align: col.align || 'left' });
    }
  }
  return y + rowH + 1;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT FUNCTION
// ═════════════════════════════════════════════════════════════════════════════

export interface BorrowingCapacityExportData {
  clientId: string;
  clientName: string;
  assessment: any;
  incomeSources?: any[];
  liabilities?: any[];
  expenses?: any[];
  properties?: any[];
  client?: any;
}

export async function generateBorrowingCapacityPDF(data: BorrowingCapacityExportData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageNum = { value: 1 };
  const a = data.assessment;

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1: COVER — standard NPC template image (no overlay text)
  // ════════════════════════════════════════════════════════════════════════════
  try {
    const coverImageUrl = '/templates/npc-cashflow-cover.jpg';
    const coverResponse = await fetch(coverImageUrl);
    if (coverResponse.ok) {
      const coverBlob = await coverResponse.blob();
      const coverDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(coverBlob);
      });
      doc.addImage(coverDataUrl, 'JPEG', 0, 0, PAGE_W, PAGE_H);
    } else {
      throw new Error('Cover image not found');
    }
  } catch (e) {
    // Fallback: simple dark branded cover
    setFill(doc, DARK_BG);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
    const goldColor = { r: 201, g: 165, b: 90 };
    setFill(doc, goldColor);
    doc.rect(0, 0, PAGE_W, 8, 'F');
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    setColor(doc, goldColor);
    doc.text('NAIDU PROPERTY', PAGE_W / 2, 100, { align: 'center' });
    doc.text('CONSULTING SERVICES', PAGE_W / 2, 115, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('YOUR DEDICATED PROPERTY PARTNER', PAGE_W / 2, 135, { align: 'center' });
    setFill(doc, goldColor);
    doc.rect(0, PAGE_H - 8, PAGE_W, 8, 'F');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2: EXECUTIVE SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  doc.addPage();
  pageNum.value++;
  let y = 25;

  // ── Client Summary Header ──────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  setColor(doc, NAVY);
  const displayName = smartCapitalize(data.clientName);
  doc.text(displayName, MARGIN, y + 5);

  // Assessment date on the right
  const assessmentDate = a.created_at
    ? format(new Date(a.created_at), 'dd MMMM yyyy')
    : format(new Date(), 'dd MMMM yyyy');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY);
  doc.text(`Assessment Date: ${assessmentDate}`, PAGE_W - MARGIN, y + 5, { align: 'right' });

  // Gold divider below client header
  y += 12;
  setFill(doc, GOLD);
  doc.rect(MARGIN, y, CONTENT_W, 0.8, 'F');
  y += 10;

  y = drawSectionHeader(doc, 'Executive Summary', y);

  // ── Executive Summary Narrative ────────────────────────────────────────────
  {
    const capacity = a.borrowing_capacity || 0;
    const band = a.serviceability_band || 'red';
    const surplus = a.monthly_surplus || 0;
    const dti = a.dti_ratio || 0;
    const proposedLoan = a.proposed_loan_amount || 0;
    const assessRate = round2(a.assessment_rate || a.interest_rate_used || 0);
    const bandWord = band === 'green' ? 'strong' : band === 'amber' ? 'moderate' : 'limited';

    let narrative = `Based on the financial information provided, ${displayName} has an estimated maximum borrowing capacity of ${fmt(capacity)}. `;
    narrative += `This assessment was conducted using an assessment rate of ${assessRate.toFixed(2)}% over a ${a.loan_term_years || 30}-year loan term, `;
    narrative += `resulting in a monthly surplus of ${fmt(surplus)} and a debt-to-income ratio of ${dti.toFixed(1)}x. `;
    narrative += `The overall serviceability position is assessed as ${bandWord}.`;

    if (proposedLoan > 0) {
      const util = Math.round((proposedLoan / (capacity || 1)) * 100);
      const withinCapacity = proposedLoan <= capacity;
      narrative += ` The proposed loan of ${fmt(proposedLoan)} represents ${util}% utilisation of the available capacity and ${withinCapacity ? 'falls within' : 'exceeds'} the assessed borrowing limit.`;
    }

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    setColor(doc, BODY_TEXT);
    const narrativeLines: string[] = doc.splitTextToSize(narrative, CONTENT_W - 4);
    doc.text(narrativeLines, MARGIN + 2, y);
    y += narrativeLines.length * 4 + 8;
  }

  // ── KPI Boxes (with gold left-border accent) ───────────────────────────────
  const boxW = (CONTENT_W - 10) / 3;
  const boxH = 38;

  // Box 1: Borrowing Capacity
  setFill(doc, LIGHT_GRAY);
  doc.roundedRect(MARGIN, y, boxW, boxH, 2, 2, 'F');
  setFill(doc, GOLD);
  doc.rect(MARGIN, y + 2, 2.5, boxH - 4, 'F'); // gold left accent
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY);
  doc.text('BORROWING CAPACITY', MARGIN + 8, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  setColor(doc, NAVY);
  doc.text(fmt(a.borrowing_capacity || 0), MARGIN + 8, y + 23);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY);
  doc.text('Estimate', MARGIN + 8, y + 30);

  // Box 2: Monthly Surplus
  const b2x = MARGIN + boxW + 5;
  const surplusColor = (a.monthly_surplus || 0) >= 0 ? GREEN : RED;
  setFill(doc, LIGHT_GRAY);
  doc.roundedRect(b2x, y, boxW, boxH, 2, 2, 'F');
  setFill(doc, surplusColor);
  doc.rect(b2x, y + 2, 2.5, boxH - 4, 'F'); // colored left accent
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY);
  doc.text('MONTHLY SURPLUS', b2x + 8, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  setColor(doc, surplusColor);
  doc.text(fmt(a.monthly_surplus || 0), b2x + 8, y + 23);

  // Box 3: Serviceability Band
  const b3x = MARGIN + (boxW + 5) * 2;
  const bc = bandColor(a.serviceability_band || 'red');
  setFill(doc, LIGHT_GRAY);
  doc.roundedRect(b3x, y, boxW, boxH, 2, 2, 'F');
  setFill(doc, bc);
  doc.rect(b3x, y + 2, 2.5, boxH - 4, 'F'); // colored left accent
  doc.setFontSize(7);
  setColor(doc, GRAY);
  doc.setFont('helvetica', 'normal');
  doc.text('SERVICEABILITY', b3x + 8, y + 10);
  // Badge
  const bl = bandLabel(a.serviceability_band || 'red');
  const badgeW = doc.getTextWidth(bl) + 12;
  setFill(doc, bc);
  doc.roundedRect(b3x + 8, y + 15, badgeW > 32 ? badgeW : 32, 10, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  setColor(doc, WHITE);
  doc.text(bl, b3x + 14, y + 22);

  y += boxH + 10;

  // ── Capacity Utilisation Gauge Bar ─────────────────────────────────────────
  const proposedLoan = a.proposed_loan_amount || 0;
  const borrowingCap = a.borrowing_capacity || 0;
  if (proposedLoan > 0 && borrowingCap > 0) {
    const utilPct = Math.min((proposedLoan / borrowingCap) * 100, 120);
    const barW = CONTENT_W - 60;
    const barH = 6;
    const barX = MARGIN;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    setColor(doc, NAVY);
    doc.text('Capacity Utilisation', barX, y);
    doc.setFont('helvetica', 'normal');
    setColor(doc, GRAY);
    doc.text(`${fmt(proposedLoan)} of ${fmt(borrowingCap)}`, barX + barW + 5, y);
    y += 5;

    // Background track
    setFill(doc, { r: 230, g: 230, b: 230 });
    doc.roundedRect(barX, y, barW, barH, 2, 2, 'F');

    // Filled portion
    const fillW = Math.min((utilPct / 100) * barW, barW);
    const gaugeColor = utilPct <= 70 ? GREEN : utilPct <= 90 ? AMBER : RED;
    setFill(doc, gaugeColor);
    doc.roundedRect(barX, y, fillW, barH, 2, 2, 'F');

    // Percentage label
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    setColor(doc, gaugeColor);
    doc.text(`${Math.round(utilPct)}%`, barX + barW + 5, y + 5);

    y += barH + 8;
  }

  // ── Secondary Metrics Row ──────────────────────────────────────────────────
  const metricColW = CONTENT_W / 3;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY);

  doc.text('DTI Ratio:', MARGIN, y);
  const dtiVal = a.dti_ratio || 0;
  const dtiColor = dtiVal < 6 ? GREEN : dtiVal < 8 ? AMBER : RED;
  doc.setFont('helvetica', 'bold');
  setColor(doc, dtiColor);
  doc.text(`${dtiVal.toFixed(1)}x`, MARGIN + 22, y);

  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY);
  doc.text('Stress Tested:', MARGIN + metricColW, y);
  doc.setFont('helvetica', 'bold');
  setColor(doc, NAVY);
  doc.text(fmt(a.stress_tested_capacity || 0), MARGIN + metricColW + 30, y);

  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY);
  doc.text('Assessment Rate:', MARGIN + metricColW * 2, y);
  doc.setFont('helvetica', 'bold');
  setColor(doc, NAVY);
  doc.text(`${round2(a.assessment_rate || a.interest_rate_used || 0).toFixed(2)}%`, MARGIN + metricColW * 2 + 35, y);

  y += 10;

  // ── Key Assumptions Callout Box ────────────────────────────────────────────
  const loanTerm = a.loan_term_years || 30;
  const bufferRate = a.buffer_rate ?? 3.0;
  const bufferIncluded = bufferRate > 0;
  const assessmentRate = round2(a.assessment_rate || a.interest_rate_used || 0);
  const expMethod = a.expense_method || 'hem';
  const expMethodLabel = expMethod === 'hem' ? 'HEM Benchmark' : expMethod === 'declared' ? 'Declared Expenses' : 'Hybrid';
  const selectedLender = (a.assumptions as any)?.selectedLenderName || null;
  const bufferLabel = bufferIncluded ? 'Included' : 'Excluded';

  setFill(doc, GOLD_LIGHT);
  setDraw(doc, GOLD);
  doc.setLineWidth(0.3);
  const assumptionsBoxH = selectedLender ? 34 : 28;
  doc.roundedRect(MARGIN, y, CONTENT_W, assumptionsBoxH, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  setColor(doc, NAVY);
  doc.text('KEY ASSUMPTIONS', MARGIN + 5, y + 7);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  setColor(doc, BODY_TEXT);
  const col1 = MARGIN + 5;
  const col2 = MARGIN + 55;
  const col3 = MARGIN + 110;
  doc.text(`Loan Term: ${loanTerm} years`, col1, y + 15);
  doc.text(`Buffer Rate: ${bufferRate.toFixed(1)}%`, col2, y + 15);
  doc.text(`Assessment Rate: ${assessmentRate.toFixed(2)}%`, col3, y + 15);
  // Buffer inclusion indicator on the next line
  doc.setFont('helvetica', 'bold');
  setColor(doc, bufferIncluded ? GREEN : AMBER);
  doc.text(`Buffer: ${bufferLabel}`, col1, y + 21);
  doc.setFont('helvetica', 'normal');
  setColor(doc, BODY_TEXT);
  doc.text(`Expense Method: ${expMethodLabel}`, col2, y + 21);
  if (selectedLender) {
    doc.setFont('helvetica', 'bold');
    setColor(doc, NAVY);
    doc.text(`Selected Lender: ${selectedLender}`, col3, y + 21);
    doc.setFont('helvetica', 'normal');
  }

  y += assumptionsBoxH + 10;

  // ════════════════════════════════════════════════════════════════════════════
  // INCOME ANALYSIS
  // ════════════════════════════════════════════════════════════════════════════
  y = checkPageBreak(doc, y, 40, pageNum);
  y = drawSectionHeader(doc, 'Income Analysis', y);

  // Summary row
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setColor(doc, BODY_TEXT);
  doc.text(`Gross Annual Income: ${fmt(a.gross_annual_income || 0)}`, MARGIN, y);
  doc.text(`Shaded Annual Income: ${fmt(a.shaded_annual_income || 0)}`, MARGIN + 80, y);
  y += 12;

  // Income breakdown table
  const incomeBreakdown = a.income_breakdown || data.incomeSources;
  if (incomeBreakdown && Array.isArray(incomeBreakdown) && incomeBreakdown.length > 0) {
    // Header row with navy background
    setFill(doc, NAVY);
    doc.rect(MARGIN, y - 5, CONTENT_W, ROW_HEIGHT, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    setColor(doc, WHITE);
    doc.text('Source', MARGIN + 3, y + 1);
    doc.text('Gross Amount', MARGIN + 105, y + 1, { align: 'right' } as any);
    doc.text('Shading', MARGIN + 132, y + 1, { align: 'right' } as any);
    doc.text('Shaded Amount', MARGIN + CONTENT_W - 3, y + 1, { align: 'right' } as any);
    y += ROW_HEIGHT + 1;

    for (let i = 0; i < incomeBreakdown.length; i++) {
      const item = incomeBreakdown[i];
      const prevY = y;
      y = checkPageBreak(doc, y, 20, pageNum);
      if (y < prevY) {
        // Re-draw header after page break
        setFill(doc, NAVY);
        doc.rect(MARGIN, y - 5, CONTENT_W, ROW_HEIGHT, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        setColor(doc, WHITE);
        doc.text('Source', MARGIN + 3, y + 1);
        doc.text('Gross Amount', MARGIN + 105, y + 1, { align: 'right' } as any);
        doc.text('Shading', MARGIN + 132, y + 1, { align: 'right' } as any);
        doc.text('Shaded Amount', MARGIN + CONTENT_W - 3, y + 1, { align: 'right' } as any);
        y += ROW_HEIGHT + 1;
      }
      const bg = i % 2 === 0 ? LIGHT_GRAY : undefined;
      const sourceName = item.component || item.source_name || item.source_type || 'Income';
      const gross = item.grossAmount || item.gross_annual_amount || item.input_amount || 0;
      const rate = item.shadingRate || item.custom_shading_rate || item.default_shading_rate || 1;
      const shaded = item.shadedAmount || gross * rate;
      y = drawTableRow(doc, y, [
        { text: sourceName, x: MARGIN + 3, maxWidth: 80 },
        { text: fmt(gross), x: MARGIN + 105, align: 'right' },
        { text: `${(rate * 100).toFixed(0)}%`, x: MARGIN + 132, align: 'right' },
        { text: fmt(shaded), x: MARGIN + CONTENT_W - 3, align: 'right', bold: true },
      ], bg);
    }
    y += 5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXPENSES & LIABILITIES
  // ════════════════════════════════════════════════════════════════════════════
  y = checkPageBreak(doc, y, 40, pageNum);
  y = drawSectionHeader(doc, 'Expenses & Liabilities', y);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setColor(doc, BODY_TEXT);
  doc.text(`Expense Method: ${expMethodLabel}`, MARGIN, y);
  y += 8;
  doc.text(`Monthly Living Expenses: ${fmt(a.living_expenses_monthly || 0)}`, MARGIN, y);
  doc.text(`Monthly Commitments: ${fmt(a.existing_commitments_monthly || 0)}`, MARGIN + 80, y);
  y += 14;

  // Liabilities breakdown
  const liabilities = a.liability_breakdown || data.liabilities;
  if (liabilities && Array.isArray(liabilities) && liabilities.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    setColor(doc, NAVY);
    doc.text('Existing Liabilities', MARGIN, y);
    y += 10;

    // Header row with navy background
    setFill(doc, NAVY);
    doc.rect(MARGIN, y - 5, CONTENT_W, ROW_HEIGHT, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    setColor(doc, WHITE);
    doc.text('Type', MARGIN + 3, y + 1);
    doc.text('Balance', MARGIN + 125, y + 1, { align: 'right' } as any);
    doc.text('Monthly Repayment', MARGIN + CONTENT_W - 3, y + 1, { align: 'right' } as any);
    y += ROW_HEIGHT + 1;

    for (let i = 0; i < liabilities.length; i++) {
      const prevY = y;
      y = checkPageBreak(doc, y, 20, pageNum);
      if (y < prevY) {
        setFill(doc, NAVY);
        doc.rect(MARGIN, y - 5, CONTENT_W, ROW_HEIGHT, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        setColor(doc, WHITE);
        doc.text('Type', MARGIN + 3, y + 1);
        doc.text('Balance', MARGIN + 125, y + 1, { align: 'right' } as any);
        doc.text('Monthly Repayment', MARGIN + CONTENT_W - 3, y + 1, { align: 'right' } as any);
        y += ROW_HEIGHT + 1;
      }
      const l = liabilities[i];
      const bg = i % 2 === 0 ? LIGHT_GRAY : undefined;
      let lType = l.type || l.liability_type || 'Liability';
      lType = formatLabel(lType);
      const provider = l.label || l.provider_name || '';
      if (provider && provider !== lType) {
        lType = `${lType} (${provider})`;
      }
      const balance = l.balance || l.current_balance || 0;
      const monthly = l.monthlyServicing || l.monthly_repayment || 0;
      y = drawTableRow(doc, y, [
        { text: lType, x: MARGIN + 3, maxWidth: 105 },
        { text: fmt(balance), x: MARGIN + 125, align: 'right' },
        { text: fmt(monthly), x: MARGIN + CONTENT_W - 3, align: 'right', color: RED },
      ], bg);
    }
    y += 5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CAPACITY BREAKDOWN
  // ════════════════════════════════════════════════════════════════════════════
  y = checkPageBreak(doc, y, 80, pageNum);
  y = drawSectionHeader(doc, 'Capacity Breakdown', y);

  const breakdownItems = [
    { label: 'Gross Annual Income', value: fmt(a.gross_annual_income || 0), color: NAVY },
    { label: 'Shaded Annual Income', value: fmt(a.shaded_annual_income || 0), color: NAVY },
    { label: 'Living Expenses (Monthly)', value: `-${fmt(a.living_expenses_monthly || 0)}`, color: RED },
    { label: 'Existing Commitments (Monthly)', value: `-${fmt(a.existing_commitments_monthly || 0)}`, color: RED },
    { label: 'Monthly Surplus', value: fmt(a.monthly_surplus || 0), color: (a.monthly_surplus || 0) >= 0 ? GREEN : RED },
    { label: 'Assessment Rate Applied', value: `${round2(a.assessment_rate || a.interest_rate_used || 0).toFixed(2)}%`, color: NAVY },
    { label: 'Loan Term', value: `${a.loan_term_years || 30} years`, color: NAVY },
  ];

  for (let i = 0; i < breakdownItems.length; i++) {
    const item = breakdownItems[i];
    y = checkPageBreak(doc, y, 12, pageNum);
    const bg = i % 2 === 0 ? LIGHT_GRAY : undefined;
    if (bg) {
      setFill(doc, bg);
      doc.rect(MARGIN, y - 4, CONTENT_W, 10, 'F');
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    setColor(doc, BODY_TEXT);
    doc.text(item.label, MARGIN + 3, y + 1);
    doc.setFont('helvetica', 'bold');
    setColor(doc, item.color);
    doc.text(item.value, MARGIN + CONTENT_W - 3, y + 1, { align: 'right' });
    y += 11;
  }

  // Final capacity row with gold background
  y += 2;
  setFill(doc, GOLD);
  doc.roundedRect(MARGIN, y - 5, CONTENT_W, 14, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  setColor(doc, WHITE);
  doc.text('Maximum Borrowing Capacity', MARGIN + 5, y + 4);
  doc.text(fmt(a.borrowing_capacity || 0), MARGIN + CONTENT_W - 5, y + 4, { align: 'right' });
  y += 18;

  // Detailed assumptions list (if available) — styled card
  const rawAssumptions = a.assumptions || [];
  // Handle both old (array) and new (object with items) format
  const assumptionItems: { key: string; value: string }[] = Array.isArray(rawAssumptions) 
    ? rawAssumptions 
    : (rawAssumptions.items && Array.isArray(rawAssumptions.items)) 
      ? rawAssumptions.items 
      : [];

  if (assumptionItems.length > 0) {
    y = checkPageBreak(doc, y, 30, pageNum);

    // Section header
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    setColor(doc, NAVY);
    doc.text('Additional Assumptions', MARGIN, y);
    y += 8;

    // Background card with proper two-column layout
    const assumptionLineH = 8.5;
    const cardPadY = 6;
    const cardH = assumptionItems.length * assumptionLineH + cardPadY * 2;
    y = checkPageBreak(doc, y, cardH + 5, pageNum);
    setFill(doc, LIGHT_GRAY);
    setDraw(doc, { r: 220, g: 220, b: 220 });
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y - 3, CONTENT_W, cardH, 2, 2, 'FD');
    // Navy left accent bar
    setFill(doc, NAVY);
    doc.rect(MARGIN, y - 1, 2.5, cardH - 4, 'F');

    const labelX = MARGIN + 10;
    const valueX = MARGIN + 65; // Fixed column for values — consistent alignment
    let ay = y + cardPadY;
    for (let i = 0; i < assumptionItems.length; i++) {
      const assumption = assumptionItems[i];
      const key = typeof assumption === 'string' ? assumption : (assumption.key || '');
      const val = typeof assumption === 'string' ? '' : (assumption.value || '');
      // Alternating subtle row highlight
      if (i % 2 === 0) {
        setFill(doc, { r: 242, g: 242, b: 242 });
        doc.rect(MARGIN + 4, ay - 3, CONTENT_W - 8, assumptionLineH, 'F');
      }
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      setColor(doc, NAVY);
      doc.text(key, labelX, ay);
      if (val) {
        doc.setFont('helvetica', 'normal');
        setColor(doc, BODY_TEXT);
        doc.text(val, valueX, ay);
      }
      ay += assumptionLineH;
    }
    y += cardH + 8;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS (enhanced with green dot indicators)
  // ════════════════════════════════════════════════════════════════════════════
  const recs = a.recommendations || [];
  if (Array.isArray(recs) && recs.length > 0) {
    y = checkPageBreak(doc, y, 25, pageNum);
    y = drawSectionHeader(doc, 'Recommendations', y);
    for (const rec of recs) {
      y = checkPageBreak(doc, y, 12, pageNum);
      const recText = typeof rec === 'string' ? rec : rec.text || JSON.stringify(rec);

      // Green circle indicator
      setFill(doc, GREEN);
      doc.circle(MARGIN + 3, y - 1, 1.5, 'F');

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      setColor(doc, BODY_TEXT);
      const lines: string[] = doc.splitTextToSize(recText, CONTENT_W - 14);
      doc.text(lines, MARGIN + 9, y);
      y += lines.length * 4.5 + 5;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // WARNINGS (enhanced with amber triangle indicators)
  // ════════════════════════════════════════════════════════════════════════════
  const warnings = a.warnings || [];
  if (Array.isArray(warnings) && warnings.length > 0) {
    y = checkPageBreak(doc, y, 25, pageNum);
    y = drawSectionHeader(doc, 'Warnings', y);

    // Subtle amber background box for warnings
    const warningsStartY = y;
    for (const w of warnings) {
      y = checkPageBreak(doc, y, 12, pageNum);

      // Amber triangle indicator
      setFill(doc, AMBER);
      const triX = MARGIN + 3;
      const triY = y - 2.5;
      doc.triangle(triX, triY, triX - 1.5, triY + 3, triX + 1.5, triY + 3, 'F');

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      setColor(doc, { r: 100, g: 65, b: 20 });
      const lines: string[] = doc.splitTextToSize(w, CONTENT_W - 14);
      doc.text(lines, MARGIN + 9, y);
      y += lines.length * 4.5 + 5;
    }
  }

  // Add footer to last content page
  addFooter(doc, pageNum.value);

  // ════════════════════════════════════════════════════════════════════════════
  // DISCLAIMER & CONTACT PAGE
  // ════════════════════════════════════════════════════════════════════════════
  try {
    const globalSettings = await fetchGlobalReportSettings();
    drawJsPDFDisclaimerPage(doc, globalSettings.contactDetails, globalSettings.disclaimer);
  } catch (e) {
    console.warn('Could not fetch global settings for disclaimer page:', e);
  }

  // ── Update all footers to show "Page X of Y" ──────────────────────────────
  const totalPgs = doc.getNumberOfPages();
  for (let i = 2; i <= totalPgs - 1; i++) {
    // Skip cover (page 1) and disclaimer (last page)
    doc.setPage(i);
    doc.setFontSize(7);
    setColor(doc, GRAY);
    doc.setFont('helvetica', 'normal');
    // Overwrite the right-aligned page number with "Page X of Y"
    // White-out the old text first
    setFill(doc, WHITE);
    doc.rect(PAGE_W - MARGIN - 30, FOOTER_Y - 3, 30, 6, 'F');
    setColor(doc, GRAY);
    doc.text(`Page ${i - 1} of ${totalPgs - 2}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' });
  }

  // Save
  const safeName = data.clientName.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = format(new Date(), 'yyyy-MM-dd');
  doc.save(`Borrowing_Capacity_Snapshot_${safeName}_${dateStr}.pdf`);
}

// ─── Data fetching & orchestration ───────────────────────────────────────────
export async function fetchAndGenerateBorrowingCapacityPDF(clientId: string, clientName: string) {
  toast.loading('Generating Borrowing Capacity Snapshot...', { id: 'bc-pdf' });

  try {
    const { latestAssessment, assessmentHistory, incomeSources, liabilities, expenses, properties, client } = 
      await fetchLatestBorrowingCapacity(clientId);

    if (!latestAssessment) {
      toast.error('No borrowing capacity assessment found. Please calculate capacity first.', { id: 'bc-pdf' });
      return;
    }

    await generateBorrowingCapacityPDF({
      clientId,
      clientName,
      assessment: latestAssessment,
      incomeSources,
      liabilities,
      expenses,
      properties,
      client,
    });

    toast.success('PDF downloaded successfully!', { id: 'bc-pdf' });
  } catch (err: any) {
    console.error('Borrowing Capacity PDF generation failed:', err);
    toast.error(`PDF generation failed: ${err.message}`, { id: 'bc-pdf' });
  }
}
