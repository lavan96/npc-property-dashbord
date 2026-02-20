/**
 * Shared Disclaimer & Contact Page for all PDF reports.
 * 
 * This is the SINGLE SOURCE OF TRUTH for the dark-themed NPC branded
 * disclaimer/contact page used across every report type.
 * 
 * Two implementations are provided:
 *   - drawJsPDFDisclaimerPage()  → for jsPDF-based generators
 *   - drawPdfLibDisclaimerPage() → for pdf-lib-based generators
 */

import type { jsPDF } from 'jspdf';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import type { ContactDetails, ProfessionalDisclaimer } from '@/hooks/useGlobalReportSettings';

// ─── Design tokens (matching the Q&A message export template) ─────────────────
const GOLD = { r: 191, g: 155, b: 80 };     // #BF9B50
const GRAY = { r: 153, g: 153, b: 153 };     // #999999
const BG   = { r: 20,  g: 20,  b: 20 };      // #141414

// ─── Sanitisation helper ──────────────────────────────────────────────────────
function sanitise(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu, '')
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  jsPDF implementation
// ═══════════════════════════════════════════════════════════════════════════════

export function drawJsPDFDisclaimerPage(
  doc: jsPDF,
  contact: ContactDetails,
  disclaimer: ProfessionalDisclaimer,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  doc.addPage();

  // Dark background
  doc.setFillColor(BG.r, BG.g, BG.b);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Company name — split last word to second line in smaller font
  doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  const companyParts = (contact.company_name || 'Naidu Property Consulting Services')
    .toUpperCase()
    .split(' ');
  if (companyParts.length >= 2) {
    doc.text(companyParts.slice(0, -1).join(' '), margin, 40);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text(companyParts[companyParts.length - 1], margin, 52);
  } else {
    doc.text(companyParts[0], margin, 40);
  }

  // "CONTACT US" heading
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
  doc.text('CONTACT US', margin, 80);

  // Contact detail rows
  const labelX = margin;
  const valueX = margin + 35;
  let contactY = 100;
  const lineH = 12;

  const drawLine = (label: string, value: string | undefined | null) => {
    if (!value) return;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
    doc.text(label.toUpperCase() + ':', labelX, contactY);
    doc.setFont('helvetica', 'normal');
    doc.text(value, valueX, contactY);
    contactY += lineH;
  };

  drawLine('Website', contact.website);
  drawLine('Email', contact.email);
  drawLine('Phone', contact.phone);
  drawLine('Address', contact.address);
  drawLine('ABN', contact.abn);

  // Disclaimer text anchored to the bottom
  if (disclaimer.is_enabled && disclaimer.text) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    const cleaned = sanitise(disclaimer.text);
    const maxW = pageWidth - margin * 1.5;
    const wrapped: string[] = doc.splitTextToSize(cleaned, maxW);
    const lh = 4.2;
    const startY = pageHeight - 20 - wrapped.length * lh;
    doc.text(wrapped, margin * 0.75, Math.max(startY, contactY + 20), {
      lineHeightFactor: 1.4,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  pdf-lib implementation
// ═══════════════════════════════════════════════════════════════════════════════

export function drawPdfLibDisclaimerPage(
  pdfDoc: PDFDocument,
  pageWidth: number,
  pageHeight: number,
  helveticaFont: PDFFont,
  helveticaBold: PDFFont,
  contact: ContactDetails,
  disclaimer: ProfessionalDisclaimer,
) {
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const marginLeft = 60;

  const goldColor = rgb(GOLD.r / 255, GOLD.g / 255, GOLD.b / 255);
  const grayColor = rgb(GRAY.r / 255, GRAY.g / 255, GRAY.b / 255);

  // Dark background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: rgb(BG.r / 255, BG.g / 255, BG.b / 255),
  });

  let yPos = pageHeight - 80;

  // Company name — split last word to second line
  const companyName = (contact.company_name || 'Naidu Property Consulting Services').toUpperCase();
  const parts = companyName.split(' ');
  if (parts.length >= 2) {
    page.drawText(parts.slice(0, -1).join(' '), {
      x: marginLeft, y: yPos, size: 28, font: helveticaBold, color: goldColor,
    });
    yPos -= 20;
    page.drawText(parts[parts.length - 1], {
      x: marginLeft, y: yPos, size: 16, font: helveticaFont, color: goldColor,
    });
  } else {
    page.drawText(companyName, {
      x: marginLeft, y: yPos, size: 28, font: helveticaBold, color: goldColor,
    });
  }

  yPos -= 40;

  // "CONTACT US" heading
  page.drawText('CONTACT US', {
    x: marginLeft, y: yPos, size: 14, font: helveticaBold, color: goldColor,
  });

  yPos -= 30;

  // Contact detail rows
  const valueX = marginLeft + 80;
  const lineH = 22;

  const drawLine = (label: string, value: string | undefined | null) => {
    if (!value) return;
    page.drawText(label.toUpperCase() + ':', {
      x: marginLeft, y: yPos, size: 9, font: helveticaBold, color: goldColor,
    });
    page.drawText(value, {
      x: valueX, y: yPos, size: 9, font: helveticaFont, color: goldColor,
    });
    yPos -= lineH;
  };

  drawLine('Website', contact.website);
  drawLine('Email', contact.email);
  drawLine('Phone', contact.phone);
  drawLine('Address', contact.address);
  drawLine('ABN', contact.abn);

  // Disclaimer text anchored to the bottom
  if (disclaimer.is_enabled && disclaimer.text) {
    const cleaned = sanitise(disclaimer.text);
    const maxWidth = pageWidth - marginLeft * 2;
    const fontSizeMap: Record<string, number> = { small: 8, medium: 10, large: 12 };
    const fontSize = fontSizeMap[disclaimer.font_size || 'small'] || 8;
    const lh = fontSize * 1.5;
    const paragraphGap = fontSize * 0.8;

    const paragraphs = cleaned.split(/\n\s*\n|\n/).filter(p => p.trim());
    const allWrapped: string[][] = [];
    let totalHeight = 0;

    for (const para of paragraphs) {
      const words = para.trim().split(' ');
      let cur = '';
      const lines: string[] = [];
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (helveticaFont.widthOfTextAtSize(test, fontSize) > maxWidth && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      allWrapped.push(lines);
      totalHeight += lines.length * lh + paragraphGap;
    }

    const bottomMargin = 40;
    let dY = bottomMargin + totalHeight + 20;
    dY = Math.max(dY, Math.min(yPos - 40, 350));

    for (const lines of allWrapped) {
      for (const line of lines) {
        if (dY < bottomMargin) break;
        page.drawText(line, {
          x: marginLeft, y: dY, size: fontSize, font: helveticaFont, color: grayColor,
        });
        dY -= lh;
      }
      dY -= paragraphGap;
    }
  }

  return page;
}
