/**
 * Market Intelligence PDF Report Generator v3
 * 
 * Generates premium navy/gold branded PDFs with 8 intelligence layers,
 * audience segmentation, report type variants, key insights snapshot,
 * actionable strategy, internal NPC data, and CTAs.
 */

import jsPDF from 'jspdf';
import { fetchGlobalReportSettings } from '@/hooks/useGlobalReportSettings';
import { drawJsPDFDisclaimerPage } from '@/utils/pdfDisclaimerPage';

// ─── Design tokens (matching PixelPerfectPDFGenerator) ───────────────────────
const NAVY = { r: 13, g: 38, b: 77 };
const GOLD = { r: 191, g: 155, b: 80 };
const WHITE = { r: 255, g: 255, b: 255 };
const LIGHT_BG = { r: 245, g: 243, b: 238 };
const DARK_TEXT = { r: 30, g: 30, b: 30 };
const GRAY_TEXT = { r: 100, g: 100, b: 100 };
const GREEN = { r: 34, g: 139, b: 34 };
const RED = { r: 180, g: 40, b: 40 };
const GOLD_LIGHT_BG = { r: 252, g: 249, b: 242 };
const BLUE_LIGHT_BG = { r: 235, g: 242, b: 255 };
const RED_LIGHT_BG = { r: 255, g: 240, b: 240 };
const GREEN_LIGHT_BG = { r: 235, g: 250, b: 240 };

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
  reportType?: string;
  reportTypeLabel?: string;
  audienceSegment?: string;
  executiveSummary: string;
  keyInsightsSnapshot?: string;
  actionableStrategy?: string;
  layer1_rba: { content: string; citations: string[] };
  layer2_housing: { content: string; citations: string[] };
  layer3_sentiment: { content: string; citations: string[] };
  layer4_regulatory: { content: string };
  layer5_outlook: { content: string };
  layer6_economic: { content: string; citations: string[] };
  layer7_micro?: { content: string; citations: string[] };
  layer8_competitive_edge?: { content: string };
  
  ctaContent?: string;
  marketEvents: MarketEvent[];
  allCitations: string[];
  includedLayers?: string[];
}

const REPORT_TYPE_SUBTITLES: Record<string, string> = {
  full: 'Comprehensive Australian property market analysis powered by live data, AI-driven insights, and authoritative sources.',
  market_pulse: 'A concise overview of macro market conditions — interest rates, sentiment, and economic indicators shaping the property landscape.',
  hotspot_deep_dive: 'In-depth suburb and corridor analysis revealing where the strongest opportunities exist right now.',
  strategy_insight: 'Strategic intelligence and competitive analysis that reveals what others overlook.',
  finance_update: 'Interest rates, lending policy, and regulatory changes impacting borrowing capacity and investor positioning.',
  deal_breakdown: 'Suburb-level analysis with strategic structuring recommendations for identified opportunities.',
  myth_busting: 'Data-driven analysis separating market facts from fiction across key property investment assumptions.',
  development_spotlight: 'Development, subdivision, and zoning opportunities across high-potential suburbs and corridors.',
};

const AUDIENCE_LABELS: Record<string, string> = {
  general: '',
  investor: 'Investor Edition',
  owner_occupier: 'Homebuyer Edition',
};

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
    this.doc.setDrawColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, footerY - 3, this.pageWidth - this.margin, footerY - 3);
    this.doc.setFontSize(7);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
    this.doc.text('NPC Services | Market Intelligence Report', this.margin, footerY);
    this.doc.text(`Page ${this.pageNum}`, this.pageWidth - this.margin, footerY, { align: 'right' });
  }

  // ─── Cover Page ────────────────────────────────────────────────────

  private drawCoverPage(data: MarketIntelligenceReportData) {
    this.pageNum++;
    const reportType = data.reportType || 'full';
    const audienceLabel = AUDIENCE_LABELS[data.audienceSegment || 'general'] || '';

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

    // Report title — varies by type
    this.doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(36);

    const titleLines = (data.reportTypeLabel || 'MARKET INTELLIGENCE REPORT').toUpperCase().split(' ');
    let titleY = 85;
    const groupedLines: string[] = [];
    for (let i = 0; i < titleLines.length; i += 2) {
      groupedLines.push(titleLines.slice(i, i + 2).join(' '));
    }
    for (const line of groupedLines) {
      this.doc.text(line, this.margin, titleY);
      titleY += 16;
    }

    // Audience edition badge
    if (audienceLabel) {
      this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
      this.doc.roundedRect(this.margin, titleY, this.doc.getTextWidth(audienceLabel) + 12, 10, 2, 2, 'F');
      this.doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(9);
      this.doc.text(audienceLabel.toUpperCase(), this.margin + 6, titleY + 7);
      titleY += 18;
    }

    // Report period
    this.doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(16);
    this.doc.text(data.reportPeriod.toUpperCase(), this.margin, titleY + 5);

    // Gold bar
    this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.rect(this.margin, titleY + 12, 40, 2, 'F');

    // Subtitle
    this.doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    const subtitle = REPORT_TYPE_SUBTITLES[reportType] || REPORT_TYPE_SUBTITLES.full;
    const subtitleLines = this.doc.splitTextToSize(subtitle, this.contentWidth());
    this.doc.text(subtitleLines, this.margin, titleY + 24);

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

  private drawTOC(data: MarketIntelligenceReportData) {
    this.addPage();
    this.drawSectionHeader('TABLE OF CONTENTS');
    this.y += 10;

    const layers = data.includedLayers || ['layer1','layer2','layer3','layer4','layer5','layer6','layer7','layer8','events','executive','key_insights','actionable_strategy','cta'];
    const tocItems: { num: string; title: string }[] = [
      { num: '01', title: 'Executive Summary' },
    ];

    let idx = 2;
    if (layers.includes('key_insights')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Key Insights Snapshot' });
    if (layers.includes('layer1')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'RBA & Interest Rate Analysis' });
    if (layers.includes('layer2')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Housing Market Pulse' });
    if (layers.includes('layer3')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Consumer & Investor Sentiment' });
    if (layers.includes('layer4')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Regulatory & Policy Watch' });
    if (layers.includes('layer6')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Economic Indicators Dashboard' });
    if (layers.includes('layer7')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Suburb & Corridor Intelligence' });
    if (layers.includes('layer8')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Competitive Strategic Edge' });
    if (layers.includes('layer5')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: '90-Day Strategic Outlook' });
    if (layers.includes('actionable_strategy')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Actionable Strategy' });
    if (layers.includes('events')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Market Events Timeline' });
    if (layers.includes('cta')) tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Your Next Steps' });
    tocItems.push({ num: String(idx++).padStart(2, '0'), title: 'Sources & Citations' });

    for (const item of tocItems) {
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
      this.doc.text(item.num, this.margin, this.y);

      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
      this.doc.text(item.title, this.margin + 15, this.y);

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
    this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.rect(this.margin, this.y - 5, 3, 14, 'F');

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    this.doc.text(title.toUpperCase(), this.margin + 8, this.y + 5);

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

      // Bold lines
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
        this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
        this.doc.circle(this.margin + 2, this.y - 1, 1, 'F');
        const wrapped = this.doc.splitTextToSize(bulletText, maxW - 10);
        this.doc.text(wrapped, this.margin + 7, this.y);
        this.y += wrapped.length * 4.2 + 2;
        continue;
      }

      // Numbered list
      const numMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (numMatch) {
        this.checkPageBreak(8);
        const num = numMatch[1];
        const text = stripMarkdown(numMatch[2]);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(9);
        this.doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
        this.doc.text(`${num}.`, this.margin, this.y);
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
        const wrapped = this.doc.splitTextToSize(text, maxW - 10);
        this.doc.text(wrapped, this.margin + 7, this.y);
        this.y += wrapped.length * 4.2 + 2;
        continue;
      }

      // Table rows
      if (line.includes('|') && !line.match(/^[\s|:-]+$/)) {
        this.drawTableRow(line);
        continue;
      }
      if (line.match(/^[\s|:-]+$/)) continue;

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

  // ─── "What This Means For You" Callout Panel ──────────────────────

  private drawInsightCallout(title: string, content: string) {
    if (!content) return;
    this.checkPageBreak(25);

    const wrappedContent = this.doc.splitTextToSize(stripMarkdown(content), this.contentWidth() - 14);
    const panelHeight = Math.max(20, wrappedContent.length * 4.5 + 12);
    
    this.doc.setFillColor(GOLD_LIGHT_BG.r, GOLD_LIGHT_BG.g, GOLD_LIGHT_BG.b);
    this.doc.roundedRect(this.margin, this.y - 2, this.contentWidth(), panelHeight, 2, 2, 'F');
    this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.rect(this.margin, this.y - 2, 3, panelHeight, 'F');

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.text(sanitise(title).toUpperCase(), this.margin + 8, this.y + 4);

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
    this.doc.text(wrappedContent, this.margin + 8, this.y + 10);

    this.y += panelHeight + 6;
  }

  // ─── Key Insights Snapshot Panel (NEW) ─────────────────────────────

  private drawKeyInsightsSnapshot(content: string) {
    if (!content) return;

    this.addPage();
    this.drawSectionHeader('Key Insights Snapshot');

    // Navy accent box
    this.doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    this.doc.roundedRect(this.margin, this.y - 2, this.contentWidth(), 12, 2, 2, 'F');
    this.doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.doc.text('YOUR 60-SECOND MARKET BRIEFING', this.pageWidth / 2, this.y + 5, { align: 'center' });
    this.y += 16;

    // Render each bullet as a highlighted card
    const bullets = content.split('\n').filter(l => l.trim().startsWith('- ') || l.trim().startsWith('* '));
    
    for (const bullet of bullets) {
      const text = stripMarkdown(bullet.trim().slice(2));
      if (!text) continue;

      this.checkPageBreak(20);

      const wrapped = this.doc.splitTextToSize(text, this.contentWidth() - 16);
      const cardHeight = Math.max(14, wrapped.length * 4.5 + 8);

      this.doc.setFillColor(BLUE_LIGHT_BG.r, BLUE_LIGHT_BG.g, BLUE_LIGHT_BG.b);
      this.doc.roundedRect(this.margin, this.y - 2, this.contentWidth(), cardHeight, 2, 2, 'F');
      this.doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
      this.doc.rect(this.margin, this.y - 2, 3, cardHeight, 'F');

      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
      this.doc.text(wrapped, this.margin + 8, this.y + 4);

      this.y += cardHeight + 4;
    }

    // If no bullets were found, render as markdown
    if (bullets.length === 0) {
      this.drawMarkdownContent(content);
    }
  }

  // ─── Actionable Strategy Panel (NEW) ──────────────────────────────

  private drawActionableStrategy(content: string) {
    if (!content) return;

    this.addPage();
    this.drawSectionHeader('Actionable Strategy');

    // Parse into sections: What To Do, What To Avoid, Timing
    const sections = content.split(/###\s+/);
    
    for (const section of sections) {
      if (!section.trim()) continue;
      
      const firstNewline = section.indexOf('\n');
      const heading = firstNewline > 0 ? section.slice(0, firstNewline).trim() : section.trim();
      const body = firstNewline > 0 ? section.slice(firstNewline + 1).trim() : '';
      
      if (!heading) continue;

      // Determine colour based on heading
      let bgColor = LIGHT_BG;
      let accentColor = NAVY;
      const headingLower = heading.toLowerCase();
      
      if (headingLower.includes('do now') || headingLower.includes('what to do')) {
        bgColor = GREEN_LIGHT_BG;
        accentColor = GREEN;
      } else if (headingLower.includes('avoid')) {
        bgColor = RED_LIGHT_BG;
        accentColor = RED;
      } else if (headingLower.includes('timing')) {
        bgColor = BLUE_LIGHT_BG;
        accentColor = NAVY;
      }

      this.checkPageBreak(16);

      // Section sub-header with coloured accent
      this.doc.setFillColor(accentColor.r, accentColor.g, accentColor.b);
      this.doc.rect(this.margin, this.y - 3, this.contentWidth(), 10, 'F');
      this.doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(10);
      this.doc.text(stripMarkdown(heading).toUpperCase(), this.margin + 5, this.y + 3);
      this.y += 14;

      // Body content
      if (body) {
        this.drawMarkdownContent(body);
        this.y += 4;
      }
    }

    // If no ### sections found, render as plain markdown
    if (sections.filter(s => s.trim()).length <= 1) {
      this.drawMarkdownContent(content);
    }
  }

  // ─── CTA Panel ────────────────────────────────────────────────────

  private drawCTASection(ctaContent: string) {
    if (!ctaContent) return;

    this.addPage();
    this.drawSectionHeader('Your Next Steps');

    // Full-width gold accent box at top
    this.doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.rect(this.margin, this.y, this.contentWidth(), 1.5, 'F');
    this.y += 8;

    this.drawMarkdownContent(ctaContent);

    // Bottom CTA box
    this.y += 5;
    this.checkPageBreak(30);
    this.doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    this.doc.roundedRect(this.margin, this.y, this.contentWidth(), 25, 3, 3, 'F');
    
    this.doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.text('Ready to Take the Next Step?', this.pageWidth / 2, this.y + 10, { align: 'center' });
    
    this.doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.text('Contact NPC Services to discuss your personalised property strategy.', this.pageWidth / 2, this.y + 17, { align: 'center' });

    this.y += 32;
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
      for (const event of recent) { this.drawEventCard(event, false); }
    }

    if (upcoming.length > 0) {
      this.y += 5;
      this.checkPageBreak(12);
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(11);
      this.doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
      this.doc.text('Upcoming Events to Watch', this.margin, this.y);
      this.y += 8;
      for (const event of upcoming) { this.drawEventCard(event, true); }
    }
  }

  private drawEventCard(event: MarketEvent, isUpcoming: boolean) {
    this.checkPageBreak(20);

    const bgColor = isUpcoming ? { r: 245, g: 248, b: 255 } : LIGHT_BG;
    this.doc.setFillColor(bgColor.r, bgColor.g, bgColor.b);
    this.doc.roundedRect(this.margin, this.y - 3, this.contentWidth(), 16, 2, 2, 'F');

    if (isUpcoming) {
      this.doc.setDrawColor(GOLD.r, GOLD.g, GOLD.b);
      this.doc.setLineWidth(0.3);
      this.doc.roundedRect(this.margin, this.y - 3, this.contentWidth(), 16, 2, 2, 'S');
    }

    const impactColor = event.impact === 'positive' ? GREEN : event.impact === 'negative' ? RED : GRAY_TEXT;
    this.doc.setFillColor(impactColor.r, impactColor.g, impactColor.b);
    this.doc.circle(this.margin + 5, this.y + 2, 2, 'F');

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
    this.doc.text(sanitise(event.event).slice(0, 60), this.margin + 10, this.y + 1);

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7);
    this.doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
    this.doc.text(`${formatDate(event.date)} | ${event.category}`, this.margin + 10, this.y + 6);

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
    const layers = data.includedLayers || ['layer1','layer2','layer3','layer4','layer5','layer6','layer7','layer8','events','executive','key_insights','actionable_strategy','cta'];

    // Cover page
    this.drawCoverPage(data);

    // Table of Contents
    this.drawTOC(data);

    // Executive Summary
    if (data.executiveSummary) {
      this.addPage();
      this.drawSectionHeader('Executive Summary');
      this.drawMarkdownContent(data.executiveSummary);
    }

    // Key Insights Snapshot (NEW — mandatory per master doc)
    if (layers.includes('key_insights') && data.keyInsightsSnapshot) {
      this.drawKeyInsightsSnapshot(data.keyInsightsSnapshot);
    }

    // Layer 1: RBA
    if (layers.includes('layer1') && data.layer1_rba?.content) {
      this.addPage();
      this.drawSectionHeader('RBA & Interest Rate Analysis');
      this.resetTableState();
      this.drawMarkdownContent(data.layer1_rba.content);
    }

    // Layer 2: Housing
    if (layers.includes('layer2') && data.layer2_housing?.content) {
      this.addPage();
      this.drawSectionHeader('Housing Market Pulse');
      this.resetTableState();
      this.drawMarkdownContent(data.layer2_housing.content);
    }

    // Layer 3: Sentiment
    if (layers.includes('layer3') && data.layer3_sentiment?.content) {
      this.addPage();
      this.drawSectionHeader('Consumer & Investor Sentiment');
      this.resetTableState();
      this.drawMarkdownContent(data.layer3_sentiment.content);
    }

    // Layer 4: Regulatory
    if (layers.includes('layer4') && data.layer4_regulatory?.content) {
      this.addPage();
      this.drawSectionHeader('Regulatory & Policy Watch');
      this.resetTableState();
      this.drawMarkdownContent(data.layer4_regulatory.content);
    }

    // Layer 6: Economic
    if (layers.includes('layer6') && data.layer6_economic?.content) {
      this.addPage();
      this.drawSectionHeader('Economic Indicators Dashboard');
      this.resetTableState();
      this.drawMarkdownContent(data.layer6_economic.content);
    }

    // Layer 7: Suburb & Corridor Intelligence
    if (layers.includes('layer7') && data.layer7_micro?.content) {
      this.addPage();
      this.drawSectionHeader('Suburb & Corridor Intelligence');
      this.resetTableState();
      this.drawMarkdownContent(data.layer7_micro.content);
      
      // Audience-specific insight callout
      const audienceInsight = data.audienceSegment === 'investor'
        ? 'These suburbs have been identified based on their yield-to-growth ratio, supply-demand dynamics, and infrastructure pipeline. Each represents a strategic entry point for portfolio growth.'
        : data.audienceSegment === 'owner_occupier'
        ? 'These suburbs offer strong lifestyle value alongside genuine capital growth potential. They represent areas where buying now positions you for long-term wealth building.'
        : 'These suburbs are outperforming the broader market across key metrics. Whether you are investing or buying a home, these locations offer compelling fundamentals.';
      
      this.drawInsightCallout('What This Means For You', audienceInsight);
    }

    // Layer 8: Competitive Strategic Edge
    if (layers.includes('layer8') && data.layer8_competitive_edge?.content) {
      this.addPage();
      this.drawSectionHeader('Competitive Strategic Edge');
      this.resetTableState();
      this.drawMarkdownContent(data.layer8_competitive_edge.content);
      
      this.drawInsightCallout(
        'The NPC Advantage',
        'The insights in this section reflect NPC Services\' proprietary analysis methodology. These strategic angles are not available through standard property reports or competitor advisory services.'
      );
    }

    // Layer 5: Strategic Outlook
    if (layers.includes('layer5') && data.layer5_outlook?.content) {
      this.addPage();
      this.drawSectionHeader('90-Day Strategic Outlook');
      this.resetTableState();
      this.drawMarkdownContent(data.layer5_outlook.content);
    }

    // Actionable Strategy (NEW — mandatory per master doc)
    if (layers.includes('actionable_strategy') && data.actionableStrategy) {
      this.drawActionableStrategy(data.actionableStrategy);
    }

    // Market Events Timeline
    if (layers.includes('events') && data.marketEvents?.length > 0) {
      this.addPage();
      this.drawSectionHeader('Market Events Timeline');
      this.drawEventsTimeline(data.marketEvents);
    }

    // CTA Section
    if (layers.includes('cta') && data.ctaContent) {
      this.drawCTASection(data.ctaContent);
    }

    // Citations
    this.addPage();
    this.drawSectionHeader('Sources & Citations');
    this.drawCitations(data.allCitations);

    // Footer on last page
    this.drawFooter();

    // Disclaimer
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
