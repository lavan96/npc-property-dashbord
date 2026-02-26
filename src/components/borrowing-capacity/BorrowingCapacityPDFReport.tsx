/**
 * Borrowing Capacity Snapshot PDF Report
 * 
 * Generates a branded jsPDF report with:
 * - Cover page
 * - Executive summary (KPIs)
 * - Income analysis with shading
 * - Expenses & liabilities breakdown
 * - Capacity breakdown
 * - Scenario comparison (conditional, only if 2+ assessments exist)
 * - Standardised disclaimer/contact page
 */

import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { fetchGlobalReportSettings } from '@/hooks/useGlobalReportSettings';
import { drawJsPDFDisclaimerPage } from '@/utils/pdfDisclaimerPage';
import { fetchLatestBorrowingCapacity } from '@/lib/fetchLatestBorrowingCapacity';
import { format } from 'date-fns';

// ─── Design tokens ───────────────────────────────────────────────────────────
const GOLD = { r: 191, g: 155, b: 80 };
const NAVY = { r: 13, g: 38, b: 77 };
const DARK_BG = { r: 20, g: 20, b: 20 };
const WHITE = { r: 255, g: 255, b: 255 };
const GRAY = { r: 128, g: 128, b: 128 };
const LIGHT_GRAY = { r: 245, g: 245, b: 245 };
const GREEN = { r: 22, g: 163, b: 74 };
const RED = { r: 239, g: 68, b: 68 };
const AMBER = { r: 245, g: 158, b: 11 };

type RGB = { r: number; g: number; b: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: number) => {
  const abs = Math.abs(v);
  const s = abs.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `-$${s}` : `$${s}`;
};

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

// ─── Page management ─────────────────────────────────────────────────────────
const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 15;

function addFooter(doc: jsPDF, pageNum: number) {
  doc.setFontSize(7);
  setColor(doc, GRAY);
  doc.setFont('helvetica', 'normal');
  doc.text('Borrowing Capacity Snapshot', MARGIN, FOOTER_Y);
  doc.text(`Page ${pageNum}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' });
  // Gold line
  setFill(doc, GOLD);
  doc.rect(MARGIN, FOOTER_Y - 4, CONTENT_W, 0.5, 'F');
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

// ─── Section header ──────────────────────────────────────────────────────────
function drawSectionHeader(doc: jsPDF, title: string, y: number): number {
  setFill(doc, GOLD);
  doc.rect(MARGIN, y - 1, 3, 14, 'F');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  setColor(doc, NAVY);
  doc.text(title, MARGIN + 8, y + 9);
  return y + 22;
}

// ─── Table row helper ────────────────────────────────────────────────────────
function drawTableRow(
  doc: jsPDF,
  y: number,
  cols: { text: string; x: number; align?: 'left' | 'right'; bold?: boolean; color?: RGB }[],
  bg?: RGB
) {
  if (bg) {
    setFill(doc, bg);
    doc.rect(MARGIN, y - 4, CONTENT_W, 8, 'F');
  }
  doc.setFontSize(9);
  for (const col of cols) {
    doc.setFont('helvetica', col.bold ? 'bold' : 'normal');
    setColor(doc, col.color || { r: 50, g: 50, b: 50 });
    doc.text(col.text, col.x, y, { align: col.align || 'left' });
  }
  return y + 10;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT FUNCTION
// ═════════════════════════════════════════════════════════════════════════════

export interface BorrowingCapacityExportData {
  clientId: string;
  clientName: string;
  assessment: any; // latest borrowing_capacity_assessment row
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
  let y = 30;

  y = drawSectionHeader(doc, 'Executive Summary', y);

  // KPI boxes
  const boxW = (CONTENT_W - 10) / 3;
  const boxH = 35;

  // Box 1: Borrowing Capacity
  setFill(doc, LIGHT_GRAY);
  doc.rect(MARGIN, y, boxW, boxH, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY);
  doc.text('BORROWING CAPACITY', MARGIN + 5, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  setColor(doc, NAVY);
  doc.text(fmt(a.borrowing_capacity || 0), MARGIN + 5, y + 22);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY);
  doc.text('Estimate', MARGIN + 5, y + 29);

  // Box 2: Monthly Surplus
  const b2x = MARGIN + boxW + 5;
  const surplusColor = (a.monthly_surplus || 0) >= 0 ? GREEN : RED;
  setFill(doc, LIGHT_GRAY);
  doc.rect(b2x, y, boxW, boxH, 'F');
  doc.setFontSize(7);
  setColor(doc, GRAY);
  doc.text('MONTHLY SURPLUS', b2x + 5, y + 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  setColor(doc, surplusColor);
  doc.text(fmt(a.monthly_surplus || 0), b2x + 5, y + 22);

  // Box 3: Serviceability Band
  const b3x = MARGIN + (boxW + 5) * 2;
  const bc = bandColor(a.serviceability_band || 'red');
  setFill(doc, LIGHT_GRAY);
  doc.rect(b3x, y, boxW, boxH, 'F');
  doc.setFontSize(7);
  setColor(doc, GRAY);
  doc.setFont('helvetica', 'normal');
  doc.text('SERVICEABILITY', b3x + 5, y + 10);
  // Badge
  const bl = bandLabel(a.serviceability_band || 'red');
  const badgeW = doc.getTextWidth(bl) + 10;
  setFill(doc, bc);
  doc.roundedRect(b3x + 5, y + 14, badgeW > 30 ? badgeW : 30, 10, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  setColor(doc, WHITE);
  doc.text(bl, b3x + 10, y + 21);

  y += boxH + 12;

  // Secondary metrics row
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
  doc.text(`${(a.assessment_rate || a.interest_rate_used || 0).toFixed(2)}%`, MARGIN + metricColW * 2 + 35, y);

  y += 15;

  // ════════════════════════════════════════════════════════════════════════════
  // INCOME ANALYSIS
  // ════════════════════════════════════════════════════════════════════════════
  y = drawSectionHeader(doc, 'Income Analysis', y);

  // Summary row
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setColor(doc, { r: 80, g: 80, b: 80 });
  doc.text(`Gross Annual Income: ${fmt(a.gross_annual_income || 0)}`, MARGIN, y);
  doc.text(`Shaded Annual Income: ${fmt(a.shaded_annual_income || 0)}`, MARGIN + 80, y);
  y += 10;

  // Income breakdown table
  const incomeBreakdown = a.income_breakdown || data.incomeSources;
  if (incomeBreakdown && Array.isArray(incomeBreakdown) && incomeBreakdown.length > 0) {
    // Header
    const srcColW = 65; // max width for source name before truncation
    y = drawTableRow(doc, y, [
      { text: 'Source', x: MARGIN, bold: true, color: NAVY },
      { text: 'Gross Amount', x: MARGIN + 90, align: 'right', bold: true, color: NAVY },
      { text: 'Shading', x: MARGIN + 120, align: 'right', bold: true, color: NAVY },
      { text: 'Shaded Amount', x: MARGIN + CONTENT_W, align: 'right', bold: true, color: NAVY },
    ]);

    setFill(doc, GOLD);
    doc.rect(MARGIN, y - 9, CONTENT_W, 0.5, 'F');

    for (let i = 0; i < incomeBreakdown.length; i++) {
      const item = incomeBreakdown[i];
      const prevY = y;
      y = checkPageBreak(doc, y, 10, pageNum);
      // Re-draw table header after page break
      if (y < prevY) {
        y = drawTableRow(doc, y, [
          { text: 'Source', x: MARGIN, bold: true, color: NAVY },
          { text: 'Gross Amount', x: MARGIN + 90, align: 'right', bold: true, color: NAVY },
          { text: 'Shading', x: MARGIN + 120, align: 'right', bold: true, color: NAVY },
          { text: 'Shaded Amount', x: MARGIN + CONTENT_W, align: 'right', bold: true, color: NAVY },
        ]);
        setFill(doc, GOLD);
        doc.rect(MARGIN, y - 9, CONTENT_W, 0.5, 'F');
      }
      const bg = i % 2 === 0 ? LIGHT_GRAY : undefined;
      let sourceName = item.component || item.source_name || item.source_type || 'Income';
      // Truncate long source names to prevent overlap with amount columns
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      while (doc.getTextWidth(sourceName) > srcColW && sourceName.length > 10) {
        sourceName = sourceName.slice(0, -4) + '...';
      }
      const gross = item.grossAmount || item.gross_annual_amount || item.input_amount || 0;
      const rate = item.shadingRate || item.custom_shading_rate || item.default_shading_rate || 1;
      const shaded = item.shadedAmount || gross * rate;
      y = drawTableRow(doc, y, [
        { text: sourceName, x: MARGIN },
        { text: fmt(gross), x: MARGIN + 90, align: 'right' },
        { text: `${(rate * 100).toFixed(0)}%`, x: MARGIN + 120, align: 'right' },
        { text: fmt(shaded), x: MARGIN + CONTENT_W, align: 'right', bold: true },
      ], bg);
    }
    y += 5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXPENSES & LIABILITIES
  // ════════════════════════════════════════════════════════════════════════════
  y = checkPageBreak(doc, y, 40, pageNum);
  y = drawSectionHeader(doc, 'Expenses & Liabilities', y);

  // Expense method
  const expMethod = a.expense_method || 'hem';
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  setColor(doc, { r: 80, g: 80, b: 80 });
  doc.text(`Expense Method: ${expMethod === 'hem' ? 'HEM Benchmark' : expMethod === 'declared' ? 'Declared Expenses' : 'Hybrid (Higher of HEM/Declared)'}`, MARGIN, y);
  y += 8;
  doc.text(`Monthly Living Expenses: ${fmt(a.living_expenses_monthly || 0)}`, MARGIN, y);
  doc.text(`Monthly Commitments: ${fmt(a.existing_commitments_monthly || 0)}`, MARGIN + 80, y);
  y += 12;

  // Liabilities breakdown
  const liabilities = a.liability_breakdown || data.liabilities;
  if (liabilities && Array.isArray(liabilities) && liabilities.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    setColor(doc, NAVY);
    doc.text('Existing Liabilities', MARGIN, y);
    y += 8;

    y = drawTableRow(doc, y, [
      { text: 'Type', x: MARGIN, bold: true, color: NAVY },
      { text: 'Balance', x: MARGIN + 60, align: 'right', bold: true, color: NAVY },
      { text: 'Monthly Repayment', x: MARGIN + CONTENT_W, align: 'right', bold: true, color: NAVY },
    ]);
    setFill(doc, GOLD);
    doc.rect(MARGIN, y - 9, CONTENT_W, 0.5, 'F');

    for (let i = 0; i < liabilities.length; i++) {
      const prevY = y;
      y = checkPageBreak(doc, y, 10, pageNum);
      // Re-draw table header after page break
      if (y < prevY) {
        y = drawTableRow(doc, y, [
          { text: 'Type', x: MARGIN, bold: true, color: NAVY },
          { text: 'Balance', x: MARGIN + 60, align: 'right', bold: true, color: NAVY },
          { text: 'Monthly Repayment', x: MARGIN + CONTENT_W, align: 'right', bold: true, color: NAVY },
        ]);
        setFill(doc, GOLD);
        doc.rect(MARGIN, y - 9, CONTENT_W, 0.5, 'F');
      }
      const l = liabilities[i];
      const bg = i % 2 === 0 ? LIGHT_GRAY : undefined;
      let lType = l.type || l.liability_type || 'Liability';
      lType = formatLabel(lType);
      // Truncate long liability names (e.g. "Existing Loan P&I (address...)")
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const maxLiabW = 50;
      while (doc.getTextWidth(lType) > maxLiabW && lType.length > 10) {
        lType = lType.slice(0, -4) + '...';
      }
      const balance = l.balance || l.current_balance || 0;
      const monthly = l.monthlyServicing || l.monthly_repayment || 0;
      y = drawTableRow(doc, y, [
        { text: lType, x: MARGIN },
        { text: fmt(balance), x: MARGIN + 60, align: 'right' },
        { text: fmt(monthly), x: MARGIN + CONTENT_W, align: 'right', color: RED },
      ], bg);
    }
    y += 5;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CAPACITY BREAKDOWN
  // ════════════════════════════════════════════════════════════════════════════
  y = checkPageBreak(doc, y, 80, pageNum);
  y = drawSectionHeader(doc, 'Capacity Breakdown', y);

  // Waterfall-style breakdown
  const afterTaxMonthly = ((a.gross_annual_income || 0) * 0.68) / 12; // rough after-tax estimate
  const breakdownItems = [
    { label: 'Gross Annual Income', value: fmt(a.gross_annual_income || 0), color: NAVY },
    { label: 'Shaded Annual Income', value: fmt(a.shaded_annual_income || 0), color: NAVY },
    { label: 'Living Expenses (Monthly)', value: `-${fmt(a.living_expenses_monthly || 0)}`, color: RED },
    { label: 'Existing Commitments (Monthly)', value: `-${fmt(a.existing_commitments_monthly || 0)}`, color: RED },
    { label: 'Monthly Surplus', value: fmt(a.monthly_surplus || 0), color: (a.monthly_surplus || 0) >= 0 ? GREEN : RED },
    { label: 'Assessment Rate Applied', value: `${(a.assessment_rate || a.interest_rate_used || 0).toFixed(2)}%`, color: NAVY },
    { label: 'Loan Term', value: `${a.loan_term_years || 30} years`, color: NAVY },
    { label: 'Maximum Borrowing Capacity', value: fmt(a.borrowing_capacity || 0), color: GREEN },
  ];

  for (const item of breakdownItems) {
    y = checkPageBreak(doc, y, 10, pageNum);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    setColor(doc, { r: 80, g: 80, b: 80 });
    doc.text(item.label, MARGIN, y);
    doc.setFont('helvetica', 'bold');
    setColor(doc, item.color);
    doc.text(item.value, MARGIN + CONTENT_W, y, { align: 'right' });
    y += 9;
  }

  // Gold separator before capacity
  setFill(doc, GOLD);
  doc.rect(MARGIN, y - 4, CONTENT_W, 1, 'F');
  y += 8;

  // Assumptions box
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  setColor(doc, GRAY);
  const assumptions = a.assumptions || [];
  if (Array.isArray(assumptions) && assumptions.length > 0) {
    doc.text('Assumptions:', MARGIN, y);
    y += 6;
    for (const assumption of assumptions) {
      y = checkPageBreak(doc, y, 6, pageNum);
      const key = assumption.key || assumption;
      const val = assumption.value || '';
      doc.text(`• ${key}${val ? ': ' + val : ''}`, MARGIN + 5, y);
      y += 5;
    }
    y += 5;
  }

  // Recommendations
  const recs = a.recommendations || [];
  if (Array.isArray(recs) && recs.length > 0) {
    y = checkPageBreak(doc, y, 20, pageNum);
    y = drawSectionHeader(doc, 'Recommendations', y);
    for (const rec of recs) {
      y = checkPageBreak(doc, y, 8, pageNum);
      const recText = typeof rec === 'string' ? rec : rec.text || JSON.stringify(rec);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      setColor(doc, GREEN);
      doc.text('•', MARGIN, y);
      setColor(doc, { r: 50, g: 50, b: 50 });
      const lines: string[] = doc.splitTextToSize(recText, CONTENT_W - 8);
      doc.text(lines, MARGIN + 5, y);
      y += lines.length * 5 + 3;
    }
  }

  // Warnings
  const warnings = a.warnings || [];
  if (Array.isArray(warnings) && warnings.length > 0) {
    y = checkPageBreak(doc, y, 20, pageNum);
    y = drawSectionHeader(doc, 'Warnings', y);
    for (const w of warnings) {
      y = checkPageBreak(doc, y, 8, pageNum);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      setColor(doc, AMBER);
      doc.text('!', MARGIN, y);
      setColor(doc, { r: 80, g: 50, b: 20 });
      const lines: string[] = doc.splitTextToSize(w, CONTENT_W - 8);
      doc.text(lines, MARGIN + 5, y);
      y += lines.length * 5 + 3;
    }
  }

  // Assessment History section removed — not included in final PDF export

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
