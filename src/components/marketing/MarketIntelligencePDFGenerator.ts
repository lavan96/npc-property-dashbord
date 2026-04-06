/**
 * Market Intelligence PDF Report Generator
 * 
 * Generates a premium navy/gold branded PDF from 6-layer market intelligence data.
 * Matches the NPC investment report design system.
 */

import jsPDF from 'jspdf';
import { fetchGlobalReportSettings } from '@/hooks/useGlobalReportSettings';
import { drawJsPDFDisclaimerPage } from '@/utils/pdfDisclaimerPage';

// ─── Design tokens (matching PixelPerfectPDFGenerator) ───────────────────────
const NAVY = { r: 13, g: 38, b: 77 };      // #0D264D
const GOLD = { r: 191, g: 155, b: 80 };     // #BF9B50
const WHITE = { r: 255, g: 255, b: 255 };
const LIGHT_BG = { r: 245, g: 243, b: 238 };
const DARK_TEXT = { r: 30, g: 30, b: 30 };
const GRAY_TEXT = { r: 100, g: 100, b: 100 };
const GREEN = { r: 34, g: 139, b: 34 };
const RED = { r: 180, g: 40, b: 40 };

interface MarketEvent {
  date: string;
  event: string;
  category: string;
  impact: string;
  description: string;
  relevance_score: number;
}

export interface MarketIntelligenceReportData {
  generatedAt: string;
  reportPeriod: string;
  executiveSummary: string;
  layer1_rba: { content: string; citations: string[] };
  layer2_housing: { content: string; citations: string[] };
  layer3_sentiment: { content: string; citations: string[] };
  layer4_regulatory: { content: string };
  layer5_outlook: { content: string };
  layer6_economic: { content: string; citations: string[] };
  marketEvents: MarketEvent[];
  allCitations: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitise(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu, '')
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '');
}

function stripMarkdown(md: string): string {
  return sanitise(md)
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── PDF Page Drawing Utilities ──────────────────────────────────────────────

class MarketIntelPDFBuilder {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin = 25;
  private y = 0;
  private pageNum = 0;

  constructor() {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
  }

  private contentWidth() { return this.pageWidth - this.margin * 2; }
  
  private checkPageBreak(needed: number) {
    if (this.y + needed > this.pageHeight - 30) {
      this.addPage();
    }
  }

  private addPage() {
    if (this.pageNum > 0) {
      this.drawFooter();
    }
    if (this.pageNum > 0) {
      this.doc.addPage();
    }
    this.pageNum++;
    this.y = 25;
  }

  private drawFooter() {
    const footerY = this.pageHeight - 12;
    // Gold line
    this.doc.setDrawColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, footerY - 3, this.pageWidth - this.margin, footerY - 3);
    // Footer text
    this.doc.setFontSize(7);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
    this.doc.text('NPC Services | Market Intelligence Report', this.margin, footerY);
    this.doc.text(`Page ${this.pageNum}`, this.pageWidth - this.margin, footerY, { align: 'right' });
  }

  // ─── Cover Page ────────────────────────────────────────────────────

  private drawCoverPage(reportPeriod: string) {
    this.pageNum++;
    // Navy background
    this.doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight, 'F');

    // Gold accent bar at top
    this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.rect(0, 0, this.pageWidth, 4, 'F');

    // Company name
    this.doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(14);
    this.doc.text('NPC SERVICES', this.margin, 50);

    // Gold divider
    this.doc.setDrawColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.setLineWidth(1);
    this.doc.line(this.margin, 58, this.margin + 60, 58);

    // Report title
    this.doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(36);
    this.doc.text('MARKET', this.margin, 85);
    this.doc.text('INTELLIGENCE', this.margin, 100);
    this.doc.text('REPORT', this.margin, 115);

    // Report period
    this.doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(16);
    this.doc.text(reportPeriod.toUpperCase(), this.margin, 135);

    // Gold bar decoration
    this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.rect(this.margin, 145, 40, 2, 'F');

    // Subtitle
    this.doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    const subtitleLines = this.doc.splitTextToSize(
      'Comprehensive Australian property market analysis powered by live data, AI-driven insights, and authoritative sources.',
      this.contentWidth()
    );
    this.doc.text(subtitleLines, this.margin, 160);

    // Bottom gold accent
    this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.rect(0, this.pageHeight - 4, this.pageWidth, 4, 'F');

    // Date generated
    this.doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
    this.doc.setFontSize(8);
    this.doc.text(
      `Generated: ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      this.margin,
      this.pageHeight - 15
    );
  }

  // ─── Table of Contents ─────────────────────────────────────────────

  private drawTOC() {
    this.addPage();
    this.drawSectionHeader('TABLE OF CONTENTS');
    this.y += 10;

    const tocItems = [
      { num: '01', title: 'Executive Summary' },
      { num: '02', title: 'RBA & Interest Rate Analysis' },
      { num: '03', title: 'Housing Market Pulse' },
      { num: '04', title: 'Consumer & Investor Sentiment' },
      { num: '05', title: 'Regulatory & Policy Watch' },
      { num: '06', title: 'Economic Indicators Dashboard' },
      { num: '07', title: '90-Day Strategic Outlook' },
      { num: '08', title: 'Market Events Timeline' },
      { num: '09', title: 'Sources & Citations' },
    ];

    for (const item of tocItems) {
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
      this.doc.text(item.num, this.margin, this.y);

      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
      this.doc.text(item.title, this.margin + 15, this.y);

      // Dotted leader line
      this.doc.setDrawColor(GOLD.r, GOLD.g, GOLD.b);
      this.doc.setLineDashPattern([1, 2], 0);
      const textWidth = this.doc.getTextWidth(item.title);
      this.doc.line(this.margin + 15 + textWidth + 3, this.y, this.pageWidth - this.margin, this.y);
      this.doc.setLineDashPattern([], 0);

      this.y += 12;
    }
  }

  // ─── Section Header with Gold Bar ──────────────────────────────────

  private drawSectionHeader(title: string) {
    this.checkPageBreak(20);
    // Gold vertical accent bar
    this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.rect(this.margin, this.y - 5, 3, 14, 'F');

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    this.doc.text(title.toUpperCase(), this.margin + 8, this.y + 5);

    // Underline
    this.doc.setDrawColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, this.y + 10, this.pageWidth - this.margin, this.y + 10);

    this.y += 18;
  }

  // ─── Body Text Renderer ────────────────────────────────────────────

  private drawMarkdownContent(markdown: string) {
    if (!markdown) return;
    const lines = sanitise(markdown).split('\n');
    const maxW = this.contentWidth();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) { this.y += 3; continue; }

      // Headers
      const headerMatch = line.match(/^(#{1,4})\s+(.+)/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const text = headerMatch[2].replace(/\*\*/g, '');
        this.checkPageBreak(14);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(level === 1 ? 14 : level === 2 ? 12 : 10);
        this.doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
        const wrapped = this.doc.splitTextToSize(text, maxW);
        this.doc.text(wrapped, this.margin, this.y);
        this.y += wrapped.length * (level <= 2 ? 6 : 5) + 3;
        continue;
      }

      // Bold lines (e.g. **Label:** value)
      const boldMatch = line.match(/^\*\*(.+?)\*\*[:\s]*(.*)$/);
      if (boldMatch) {
        this.checkPageBreak(10);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(9.5);
        this.doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
        const label = boldMatch[1];
        const value = boldMatch[2] || '';
        
        this.doc.text(label + (value ? ':' : ''), this.margin, this.y);
        if (value) {
          const labelW = this.doc.getTextWidth(label + ': ');
          this.doc.setFont('helvetica', 'normal');
          this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
          const valueWrapped = this.doc.splitTextToSize(stripMarkdown(value), maxW - labelW);
          this.doc.text(valueWrapped, this.margin + labelW, this.y);
          this.y += valueWrapped.length * 4.5;
        } else {
          this.y += 5;
        }
        continue;
      }

      // Bullet points
      if (line.startsWith('- ') || line.startsWith('* ')) {
        this.checkPageBreak(8);
        const bulletText = stripMarkdown(line.slice(2));
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(9);
        this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
        // Gold bullet
        this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
        this.doc.circle(this.margin + 2, this.y - 1, 1, 'F');
        const wrapped = this.doc.splitTextToSize(bulletText, maxW - 10);
        this.doc.text(wrapped, this.margin + 7, this.y);
        this.y += wrapped.length * 4.2 + 2;
        continue;
      }

      // Table rows (pipe-delimited)
      if (line.includes('|') && !line.match(/^[\s|:-]+$/)) {
        this.drawTableRow(line);
        continue;
      }
      if (line.match(/^[\s|:-]+$/)) continue; // skip divider rows

      // Regular paragraph
      this.checkPageBreak(8);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
      const wrapped = this.doc.splitTextToSize(stripMarkdown(line), maxW);
      this.doc.text(wrapped, this.margin, this.y);
      this.y += wrapped.length * 4.5 + 2;
    }
  }

  // ─── Simple Table Row ──────────────────────────────────────────────

  private isTableHeaderRow = true;

  private drawTableRow(line: string) {
    const cells = line.split('|').map(c => c.trim()).filter(c => c);
    if (cells.length === 0) return;

    this.checkPageBreak(10);
    const colWidth = this.contentWidth() / cells.length;

    if (this.isTableHeaderRow) {
      // Navy header background
      this.doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
      this.doc.rect(this.margin, this.y - 4, this.contentWidth(), 7, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(8);
      this.doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
      
      cells.forEach((cell, i) => {
        const cellText = stripMarkdown(cell).slice(0, 30);
        this.doc.text(cellText, this.margin + i * colWidth + 2, this.y);
      });
      this.y += 6;
      this.isTableHeaderRow = false;
    } else {
      // Alternating row background
      this.doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
      this.doc.rect(this.margin, this.y - 3.5, this.contentWidth(), 6, 'F');
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
      
      cells.forEach((cell, i) => {
        const cellText = stripMarkdown(cell).slice(0, 35);
        this.doc.text(cellText, this.margin + i * colWidth + 2, this.y);
      });
      this.y += 5.5;
    }
  }

  private resetTableState() {
    this.isTableHeaderRow = true;
  }

  // ─── Market Events Timeline ────────────────────────────────────────

  private drawEventsTimeline(events: MarketEvent[]) {
    if (!events || events.length === 0) return;

    const recent = events.filter(e => new Date(e.date) <= new Date()).slice(0, 12);
    const upcoming = events.filter(e => new Date(e.date) > new Date()).slice(0, 8);

    if (recent.length > 0) {
      this.checkPageBreak(12);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(11);
      this.doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
      this.doc.text('Recent Events', this.margin, this.y);
      this.y += 8;

      for (const event of recent) {
        this.drawEventCard(event, false);
      }
    }

    if (upcoming.length > 0) {
      this.y += 5;
      this.checkPageBreak(12);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(11);
      this.doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
      this.doc.text('Upcoming Events to Watch', this.margin, this.y);
      this.y += 8;

      for (const event of upcoming) {
        this.drawEventCard(event, true);
      }
    }
  }

  private drawEventCard(event: MarketEvent, isUpcoming: boolean) {
    this.checkPageBreak(20);

    // Card background
    const bgColor = isUpcoming ? { r: 245, g: 248, b: 255 } : LIGHT_BG;
    this.doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
    this.doc.roundedRect(this.margin, this.y - 3, this.contentWidth(), 16, 2, 2, 'F');

    // Border
    if (isUpcoming) {
      this.doc.setDrawColor(GOLD.r, GOLD.g, GOLD.b);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(this.margin, this.y - 3, this.contentWidth(), 16, 2, 2, 'S');
    }

    // Impact indicator
    const impactColor = event.impact === 'positive' ? GREEN : event.impact === 'negative' ? RED : GRAY_TEXT;
    this.doc.setFillColor(impactColor.r, impactColor.g, impactColor.b);
    this.doc.circle(this.margin + 5, this.y + 2, 2, 'F');

    // Event name
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
    this.doc.text(sanitise(event.event).slice(0, 60), this.margin + 10, this.y + 1);

    // Date + category
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
    this.doc.text(`${formatDate(event.date)} | ${event.category}`, this.margin + 10, this.y + 6);

    // Description
    this.doc.setFontSize(7.5);
    this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
    const descWrapped = this.doc.splitTextToSize(sanitise(event.description).slice(0, 120), this.contentWidth() - 15);
    this.doc.text(descWrapped, this.margin + 10, this.y + 10);

    this.y += 20;
  }

  // ─── Citations Page ────────────────────────────────────────────────

  private drawCitations(citations: string[]) {
    if (!citations || citations.length === 0) return;
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7.5);
    this.doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);

    citations.forEach((citation, i) => {
      this.checkPageBreak(6);
      const text = `[${i + 1}] ${sanitise(citation)}`;
      const wrapped = this.doc.splitTextToSize(text, this.contentWidth());
      this.doc.text(wrapped, this.margin, this.y);
      this.y += wrapped.length * 3.5 + 1;
    });
  }

  // ─── Main Generation Method ────────────────────────────────────────

  async generate(data: MarketIntelligenceReportData): Promise<Blob> {
    // Cover page
    this.drawCoverPage(data.reportPeriod);

    // Table of Contents
    this.drawTOC();

    // Section 1: Executive Summary
    this.addPage();
    this.drawSectionHeader('Executive Summary');
    this.drawMarkdownContent(data.executiveSummary);

    // Section 2: RBA & Interest Rates
    this.addPage();
    this.drawSectionHeader('RBA & Interest Rate Analysis');
    this.resetTableState();
    this.drawMarkdownContent(data.layer1_rba.content);

    // Section 3: Housing Market
    this.addPage();
    this.drawSectionHeader('Housing Market Pulse');
    this.resetTableState();
    this.drawMarkdownContent(data.layer2_housing.content);

    // Section 4: Consumer & Investor Sentiment
    this.addPage();
    this.drawSectionHeader('Consumer & Investor Sentiment');
    this.resetTableState();
    this.drawMarkdownContent(data.layer3_sentiment.content);

    // Section 5: Regulatory & Policy Watch
    this.addPage();
    this.drawSectionHeader('Regulatory & Policy Watch');
    this.resetTableState();
    this.drawMarkdownContent(data.layer4_regulatory.content);

    // Section 6: Economic Indicators
    this.addPage();
    this.drawSectionHeader('Economic Indicators Dashboard');
    this.resetTableState();
    this.drawMarkdownContent(data.layer6_economic.content);

    // Section 7: Strategic Outlook
    this.addPage();
    this.drawSectionHeader('90-Day Strategic Outlook');
    this.resetTableState();
    this.drawMarkdownContent(data.layer5_outlook.content);

    // Section 8: Market Events Timeline
    this.addPage();
    this.drawSectionHeader('Market Events Timeline');
    this.drawEventsTimeline(data.marketEvents);

    // Section 9: Sources & Citations
    this.addPage();
    this.drawSectionHeader('Sources & Citations');
    this.drawCitations(data.allCitations);

    // Draw footer on the last content page
    this.drawFooter();

    // Disclaimer page
    try {
      const settings = await fetchGlobalReportSettings();
      drawJsPDFDisclaimerPage(this.doc, settings.contactDetails, settings.disclaimer);
    } catch (e) {
      console.error('Failed to add disclaimer page:', e);
    }

    return this.doc.output('blob');
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateMarketIntelligencePDF(
  data: MarketIntelligenceReportData
): Promise<Blob> {
  const builder = new MarketIntelPDFBuilder();
  return builder.generate(data);
}
