import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Download, TrendingUp, AlertTriangle, CheckCircle, Landmark, Shield, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import { fetchGlobalReportSettings, type GlobalReportSettings } from '@/hooks/useGlobalReportSettings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface PortfolioAnalysisData {
  clientId: string;
  clientName: string;
  portfolioMetrics: {
    totalProperties: number;
    investmentCount: number;
    ownerOccupiedCount: number;
    smsfCount: number;
    totalValue: number;
    totalDebt: number;
    totalEquity: number;
    averageLVR: number;
    totalMonthlyRentalIncome: number;
    totalMonthlyExpenses: number;
    netMonthlyCashflow: number;
    averageYield: number;
    smsfTotalValue: number;
    smsfTotalEquity: number;
    smsfCompliantCount: number;
    smsfPendingAuditCount: number;
    smsfNonCompliantCount: number;
  };
  propertyAnalyses: Array<{
    propertyNumber: number;
    address: string;
    propertyType: string;
    value: number;
    equity: number;
    lvr: string;
    grossYield: string;
    netMonthlyCashflow: number;
    portfolioContribution: string;
  }>;
  analysis: {
    executiveSummary: {
      overallHealth: string;
      healthScore: number;
      keyStrengths: string[];
      keyConcerns: string[];
      primaryRecommendation: string;
    };
    compositionAnalysis: {
      assetAllocation: string;
      diversificationScore: number;
      propertyMixAssessment: string;
      recommendations: string[];
    };
    financialHealth: {
      cashflowStatus: string;
      equityPosition: string;
      debtServiceability: string;
      lvrRisk: string;
      analysis: string;
    };
    propertyRankings: Array<{
      rank: number;
      address: string;
      performanceRating: string;
      strengths: string[];
      concerns: string[];
      recommendation: string;
    }>;
    riskAssessment: {
      overallRiskLevel: string;
      concentrationRisk: string;
      interestRateSensitivity: string;
      vacancyRisk: string;
      marketRisks: string[];
      mitigationStrategies: string[];
    };
    growthOpportunities: {
      equityReleaseOptions: string[];
      refinancingOpportunities: string[];
      nextPurchaseRecommendations: string[];
      optimizationStrategies: string[];
    };
    projections: {
      years: number;
      projectedPortfolioValue: number;
      projectedEquity: number;
      projectedMonthlyCashflow: number;
      assumptions: string[];
    };
    strategicRecommendations: {
      shortTerm: string[];
      mediumTerm: string[];
      longTerm: string[];
      priorityActions: string[];
    };
  };
  generatedAt: string;
}

interface PortfolioAnalysisPDFGeneratorProps {
  clientId: string;
  clientName: string;
  onComplete?: () => void;
}

// ============= PDF CONSTANTS =============
const PAGE_WIDTH = 595.28; // A4 width in points
const PAGE_HEIGHT = 841.89; // A4 height in points
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 60;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// NPC Brand Colors
const NPC_GOLD = rgb(0.79, 0.64, 0.15);        // #c9a227 - Primary brand gold
const NPC_GOLD_LIGHT = rgb(0.91, 0.84, 0.62);  // #e8d59d - Light gold for accents
const NPC_GOLD_DARK = rgb(0.66, 0.52, 0.13);   // #a88520 - Dark gold
const NPC_NAVY = rgb(0.05, 0.15, 0.30);        // #0d264d - Dark navy
const NPC_DARK_BLUE = rgb(0.07, 0.20, 0.38);   // #113361 - Dark blue
const NPC_BLACK = rgb(0.04, 0.04, 0.04);       // #0a0a0a - Near black
const NPC_WHITE = rgb(1, 1, 1);                 // White

// Semantic Colors
const PRIMARY_COLOR = NPC_GOLD;
const SECONDARY_COLOR = NPC_NAVY;
const MUTED_COLOR = rgb(0.5, 0.5, 0.5);
const SUCCESS_COLOR = rgb(0.09, 0.64, 0.29);   // #16a34a
const DANGER_COLOR = rgb(0.94, 0.27, 0.27);    // #ef4444
const WARNING_COLOR = rgb(0.96, 0.62, 0.04);   // #f59e0b
const HEADER_BG_COLOR = NPC_NAVY;
const HEADER_TEXT_COLOR = NPC_WHITE;
const ACCENT_COLOR = NPC_GOLD_LIGHT;

// ============= PHASE 6: SAFE FORMATTING UTILITIES =============
const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) return '$0';
  return '$' + value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatPercentage = (value: number | null | undefined, decimals: number = 1): string => {
  if (value === null || value === undefined || isNaN(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
};

const safeString = (value: string | null | undefined, fallback: string = ''): string => {
  return value?.trim() || fallback;
};

const safeNumber = (value: number | null | undefined, fallback: number = 0): number => {
  if (value === null || value === undefined || isNaN(value)) return fallback;
  return value;
};

const safeArray = <T,>(arr: T[] | null | undefined): T[] => {
  return Array.isArray(arr) ? arr : [];
};

const getHealthColor = (health: string | null | undefined): string => {
  switch (safeString(health).toLowerCase()) {
    case 'excellent': return 'text-green-600';
    case 'good': return 'text-blue-600';
    case 'fair': return 'text-yellow-600';
    case 'poor': return 'text-red-600';
    default: return 'text-muted-foreground';
  }
};

const getRiskBadgeVariant = (risk: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (safeString(risk).toLowerCase()) {
    case 'low': return 'default';
    case 'medium': return 'secondary';
    case 'high': return 'destructive';
    default: return 'outline';
  }
};

// Strip emojis, control characters, and non-WinAnsi characters
const stripEmojis = (text: string): string => {
  if (!text) return '';
  return text
    // Remove control characters (newlines, tabs, etc.) - replace with space
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    // Remove emojis
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[\u200D]/gu, '')
    // Remove any remaining non-WinAnsi characters
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
};

export function PortfolioAnalysisPDFGenerator({ 
  clientId, 
  clientName,
  onComplete 
}: PortfolioAnalysisPDFGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisData, setAnalysisData] = useState<PortfolioAnalysisData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const generateAnalysis = async () => {
    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-portfolio-analysis', {
        body: {
          clientId,
          investorProfile: 'general',
          analysisDepth: 'comprehensive',
          includeProjections: true,
          projectionYears: 10,
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Analysis failed');

      setAnalysisData(data);
      setShowPreview(true);
      toast.success('Portfolio analysis generated successfully');
      
    } catch (error: any) {
      console.error('Portfolio analysis error:', error);
      toast.error('Failed to generate analysis: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // ============= PDF GENERATION ENGINE (Phase 1) =============
  const downloadPDF = async () => {
    if (!analysisData) return;
    
    setIsDownloading(true);
    
    try {
      console.log('📄 Starting Portfolio Analysis PDF generation with pdf-lib...');
      
      // Fetch global settings for branding
      const globalSettings = await fetchGlobalReportSettings();
      console.log('✓ Global settings fetched');
      
      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Embed fonts
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      console.log('✓ PDF document created with fonts');
      
      // ============= PHASE 2: ENHANCED UTILITY FUNCTIONS =============
      
      // Parse markdown text for bold/italic formatting
      const parseMarkdownText = (text: string): Array<{text: string, bold: boolean, italic: boolean}> => {
        const cleanText = stripEmojis(text);
        const parts: Array<{text: string, bold: boolean, italic: boolean}> = [];
        let remaining = cleanText
          .replace(/^#{1,6}\s+/gm, '') // Remove markdown headers
          .replace(/^[\*\-\+]\s+/gm, '• ') // Convert markdown bullets
          .replace(/^\d+\.\s+/gm, '') // Remove numbered lists
          .replace(/^>\s+/gm, '') // Remove blockquotes
          .replace(/`{1,3}(.*?)`{1,3}/g, '$1') // Remove code formatting
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // Remove links, keep text

        const boldItalicRegex = /\*\*\*(.*?)\*\*\*/g;
        const boldRegex = /\*\*(.*?)\*\*/g;
        const italicRegex = /\*(.*?)\*/g;

        let lastIndex = 0;
        const segments: Array<{text: string, start: number, end: number, bold: boolean, italic: boolean}> = [];

        // Find all bold+italic
        let match;
        while ((match = boldItalicRegex.exec(remaining)) !== null) {
          segments.push({text: match[1], start: match.index, end: match.index + match[0].length, bold: true, italic: true});
        }

        // Find all bold
        while ((match = boldRegex.exec(remaining)) !== null) {
          if (!segments.some(s => match!.index >= s.start && match!.index < s.end)) {
            segments.push({text: match[1], start: match.index, end: match.index + match[0].length, bold: true, italic: false});
          }
        }

        // Find all italic
        while ((match = italicRegex.exec(remaining)) !== null) {
          if (!segments.some(s => match!.index >= s.start && match!.index < s.end)) {
            segments.push({text: match[1], start: match.index, end: match.index + match[0].length, bold: false, italic: true});
          }
        }

        segments.sort((a, b) => a.start - b.start);

        segments.forEach((seg) => {
          if (seg.start > lastIndex) {
            const normalText = remaining.substring(lastIndex, seg.start)
              .replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
            if (normalText) parts.push({text: normalText, bold: false, italic: false});
          }
          parts.push({text: seg.text, bold: seg.bold, italic: seg.italic});
          lastIndex = seg.end;
        });

        if (lastIndex < remaining.length) {
          const normalText = remaining.substring(lastIndex)
            .replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
          if (normalText) parts.push({text: normalText, bold: false, italic: false});
        }

        if (parts.length === 0) {
          parts.push({text: remaining.replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, ''), bold: false, italic: false});
        }

        return parts;
      };
      
      // Calculate text height for page break detection
      const calculateTextHeight = (text: string, maxWidth: number, size: number, lineSpacing: number): number => {
        const parts = parseMarkdownText(text);
        let lines = 1;
        let currentLineWidth = 0;
        
        for (const part of parts) {
          const words = part.text.split(' ');
          const font = part.bold ? helveticaBold : helveticaFont;
          
          for (const word of words) {
            const wordWidth = font.widthOfTextAtSize(word + ' ', size);
            if (currentLineWidth + wordWidth > maxWidth && currentLineWidth > 0) {
              lines++;
              currentLineWidth = wordWidth;
            } else {
              currentLineWidth += wordWidth;
            }
          }
        }
        
        return lines * lineSpacing;
      };
      
      // Draw text with markdown formatting and word wrapping
      const drawFormattedText = (
        page: PDFPage,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        size: number,
        lineSpacing: number,
        baseColor = SECONDARY_COLOR
      ): number => {
        const parts = parseMarkdownText(text);
        let currentY = y;
        let currentX = x;
        
        for (const part of parts) {
          const words = part.text.split(' ');
          const font = part.bold ? helveticaBold : helveticaFont;
          
          for (const word of words) {
            const wordWithSpace = word + ' ';
            const wordWidth = font.widthOfTextAtSize(wordWithSpace, size);
            
            if (currentX + wordWidth > x + maxWidth && currentX > x) {
              currentY -= lineSpacing;
              currentX = x;
            }
            
            page.drawText(wordWithSpace, {
              x: currentX,
              y: currentY,
              size,
              font,
              color: baseColor,
            });
            
            currentX += wordWidth;
          }
        }
        
        return currentY - lineSpacing;
      };
      
      // Simple wrapped text (no markdown)
      const drawWrappedText = (
        page: PDFPage,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        font: PDFFont,
        size: number,
        color = SECONDARY_COLOR,
        lineHeight = 1.4
      ): number => {
        const cleanText = stripEmojis(text);
        const words = cleanText.split(' ');
        let line = '';
        let currentY = y;
        
        for (const word of words) {
          const testLine = line ? `${line} ${word}` : word;
          const testWidth = font.widthOfTextAtSize(testLine, size);
          
          if (testWidth > maxWidth && line) {
            page.drawText(line, { x, y: currentY, size, font, color });
            currentY -= size * lineHeight;
            line = word;
          } else {
            line = testLine;
          }
        }
        
        if (line) {
          page.drawText(line, { x, y: currentY, size, font, color });
          currentY -= size * lineHeight;
        }
        
        return currentY;
      };
      
      // Draw a vector-based table
      const drawTable = (
        page: PDFPage,
        headers: string[],
        rows: string[][],
        x: number,
        y: number,
        columnWidths: number[],
        rowHeight: number = 22
      ): { lastY: number; needsNewPage: boolean } => {
        const tableWidth = columnWidths.reduce((sum, w) => sum + w, 0);
        let currentY = y;
        
        // Draw header row with NPC Navy background
        page.drawRectangle({
          x,
          y: currentY - rowHeight,
          width: tableWidth,
          height: rowHeight,
          color: NPC_NAVY,
        });
        
        // Header text (white on navy)
        let cellX = x;
        for (let i = 0; i < headers.length; i++) {
          page.drawText(stripEmojis(headers[i]), {
            x: cellX + 5,
            y: currentY - 15,
            size: 9,
            font: helveticaBold,
            color: NPC_WHITE,
          });
          cellX += columnWidths[i];
        }
        
        // Header borders (gold accent)
        page.drawLine({
          start: { x, y: currentY },
          end: { x: x + tableWidth, y: currentY },
          thickness: 1,
          color: NPC_GOLD,
        });
        page.drawLine({
          start: { x, y: currentY - rowHeight },
          end: { x: x + tableWidth, y: currentY - rowHeight },
          thickness: 1,
          color: NPC_GOLD,
        });
        
        currentY -= rowHeight;
        
        // Draw data rows
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex];
          
          // Check page break
          if (currentY - rowHeight < MARGIN_BOTTOM) {
            return { lastY: currentY, needsNewPage: true };
          }
          
          // Alternating row background (light gold tint)
          if (rowIndex % 2 === 0) {
            page.drawRectangle({
              x,
              y: currentY - rowHeight,
              width: tableWidth,
              height: rowHeight,
              color: rgb(0.99, 0.98, 0.93), // Gold tint #fdf9ed
            });
          }
          
          // Cell text
          cellX = x;
          for (let i = 0; i < row.length; i++) {
            const cellText = stripEmojis(row[i] || '');
            const truncatedText = cellText.length > 30 ? cellText.substring(0, 27) + '...' : cellText;
            page.drawText(truncatedText, {
              x: cellX + 5,
              y: currentY - 15,
              size: 8,
              font: helveticaFont,
              color: SECONDARY_COLOR,
            });
            cellX += columnWidths[i];
          }
          
          // Row border
          page.drawLine({
            start: { x, y: currentY - rowHeight },
            end: { x: x + tableWidth, y: currentY - rowHeight },
            thickness: 0.5,
            color: rgb(0.85, 0.85, 0.85),
          });
          
          currentY -= rowHeight;
        }
        
        // Vertical borders
        cellX = x;
        for (let i = 0; i <= columnWidths.length; i++) {
          page.drawLine({
            start: { x: cellX, y: y },
            end: { x: cellX, y: currentY },
            thickness: 0.5,
            color: rgb(0.85, 0.85, 0.85),
          });
          if (i < columnWidths.length) cellX += columnWidths[i];
        }
        
        return { lastY: currentY - 15, needsNewPage: false };
      };
      
      // Draw section header
      const drawSectionHeader = (
        page: PDFPage,
        title: string,
        y: number
      ): number => {
        page.drawText(stripEmojis(title), {
          x: MARGIN_LEFT,
          y,
          size: 14,
          font: helveticaBold,
          color: PRIMARY_COLOR,
        });
        
        page.drawLine({
          start: { x: MARGIN_LEFT, y: y - 5 },
          end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: y - 5 },
          thickness: 1,
          color: rgb(0.8, 0.8, 0.8),
        });
        
        return y - 25;
      };
      
      // Draw subsection header (smaller)
      const drawSubsectionHeader = (
        page: PDFPage,
        title: string,
        y: number,
        color = SECONDARY_COLOR
      ): number => {
        page.drawText(stripEmojis(title), {
          x: MARGIN_LEFT,
          y,
          size: 11,
          font: helveticaBold,
          color,
        });
        return y - 18;
      };
      
      // Draw KPI box
      const drawKPIBox = (
        page: PDFPage,
        label: string,
        value: string,
        x: number,
        y: number,
        width: number,
        valueColor = SECONDARY_COLOR
      ): void => {
        // KPI box with gold-tinted background and gold border
        page.drawRectangle({
          x,
          y: y - 45,
          width,
          height: 50,
          color: rgb(0.99, 0.98, 0.93), // Gold tint #fdf9ed
          borderColor: NPC_GOLD_LIGHT,
          borderWidth: 1,
        });
        
        page.drawText(stripEmojis(label), {
          x: x + 8,
          y: y - 15,
          size: 8,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        page.drawText(stripEmojis(value), {
          x: x + 8,
          y: y - 35,
          size: 14,
          font: helveticaBold,
          color: valueColor,
        });
      };
      
      // Draw bullet list
      const drawBulletList = (
        page: PDFPage,
        items: string[],
        x: number,
        y: number,
        maxWidth: number,
        size: number = 9
      ): number => {
        let currentY = y;
        for (const item of items) {
          currentY = drawWrappedText(page, `• ${item}`, x, currentY, maxWidth, helveticaFont, size, SECONDARY_COLOR);
          currentY -= 2;
        }
        return currentY;
      };
      
      // Draw badge (colored rectangle with text)
      const drawBadge = (
        page: PDFPage,
        text: string,
        x: number,
        y: number,
        bgColor = PRIMARY_COLOR,
        textColor = rgb(1, 1, 1)
      ): number => {
        const badgeText = stripEmojis(text.toUpperCase());
        const textWidth = helveticaBold.widthOfTextAtSize(badgeText, 8);
        const padding = 6;
        
        page.drawRectangle({
          x,
          y: y - 12,
          width: textWidth + padding * 2,
          height: 16,
          color: bgColor,
        });
        
        page.drawText(badgeText, {
          x: x + padding,
          y: y - 8,
          size: 8,
          font: helveticaBold,
          color: textColor,
        });
        
        return x + textWidth + padding * 2 + 8;
      };
      
      // Check if new page needed
      const needsNewPage = (currentY: number, requiredSpace: number): boolean => {
        return currentY - requiredSpace < MARGIN_BOTTOM;
      };
      
      // Add new content page with optional header
      const addContentPage = (pageTitle?: string): PDFPage => {
        const newPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        if (pageTitle) {
          newPage.drawText(stripEmojis(pageTitle), {
            x: MARGIN_LEFT,
            y: PAGE_HEIGHT - MARGIN_TOP,
            size: 12,
            font: helveticaBold,
            color: PRIMARY_COLOR,
          });
        }
        return newPage;
      };
      
      // ============= NPC BRANDED COVER PAGE (Matching Cash Flow PDF) =============
      console.log('📝 Creating NPC branded cover page (Cash Flow style)...');
      const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      
      // Full black background
      coverPage.drawRectangle({
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        color: NPC_BLACK,
      });
      
      // Top gold accent bar
      coverPage.drawRectangle({
        x: 0,
        y: PAGE_HEIGHT - 12,
        width: PAGE_WIDTH,
        height: 12,
        color: NPC_GOLD,
      });
      
      // NPC Business Card / Logo area (simulated with text block)
      const cardY = PAGE_HEIGHT - 180;
      const cardWidth = 300;
      const cardHeight = 100;
      const cardX = (PAGE_WIDTH - cardWidth) / 2;
      
      // Card background
      coverPage.drawRectangle({
        x: cardX,
        y: cardY - cardHeight,
        width: cardWidth,
        height: cardHeight,
        color: NPC_BLACK,
        borderColor: NPC_GOLD,
        borderWidth: 1,
      });
      
      // Left side of card - Contact info
      const contactInfoX = cardX + 15;
      coverPage.drawText('Rugesh Naidu', {
        x: contactInfoX,
        y: cardY - 20,
        size: 11,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      coverPage.drawText('Director', {
        x: contactInfoX,
        y: cardY - 35,
        size: 8,
        font: helveticaFont,
        color: NPC_WHITE,
      });
      
      coverPage.drawText('Property Consultant & Buyers Agent', {
        x: contactInfoX,
        y: cardY - 47,
        size: 7,
        font: helveticaFont,
        color: NPC_WHITE,
      });
      
      coverPage.drawText('Mobile: 0433 005 110', {
        x: contactInfoX,
        y: cardY - 62,
        size: 7,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      coverPage.drawText('Email: Rugesh@npcservices.com.au', {
        x: contactInfoX,
        y: cardY - 74,
        size: 7,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      coverPage.drawText('Website: www.npcservices.com.au', {
        x: contactInfoX,
        y: cardY - 86,
        size: 7,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      // Right side of card - Company name
      const rightSideX = cardX + cardWidth / 2 + 10;
      coverPage.drawRectangle({
        x: cardX + cardWidth / 2,
        y: cardY - cardHeight,
        width: cardWidth / 2,
        height: cardHeight,
        color: rgb(0.08, 0.08, 0.08), // Slightly lighter black
      });
      
      coverPage.drawText('Naidu Property Consulting', {
        x: rightSideX,
        y: cardY - 25,
        size: 9,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      coverPage.drawText('Services', {
        x: rightSideX,
        y: cardY - 38,
        size: 9,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      // "YOUR DEDICATED PROPERTY PARTNER" tagline
      const taglineText = 'YOUR DEDICATED PROPERTY PARTNER';
      const taglineWidth = helveticaBold.widthOfTextAtSize(taglineText, 11);
      coverPage.drawText(taglineText, {
        x: (PAGE_WIDTH - taglineWidth) / 2,
        y: cardY - cardHeight - 35,
        size: 11,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      // Gold separator line
      coverPage.drawLine({
        start: { x: PAGE_WIDTH / 2 - 120, y: cardY - cardHeight - 55 },
        end: { x: PAGE_WIDTH / 2 + 120, y: cardY - cardHeight - 55 },
        thickness: 1,
        color: NPC_GOLD,
      });
      
      // Main title - "PORTFOLIO PERFORMANCE" 
      const title1 = 'PORTFOLIO';
      const title1Width = helveticaBold.widthOfTextAtSize(title1, 42);
      coverPage.drawText(title1, {
        x: (PAGE_WIDTH - title1Width) / 2,
        y: PAGE_HEIGHT - 400,
        size: 42,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      const title2 = 'PERFORMANCE ANALYSIS';
      const title2Width = helveticaBold.widthOfTextAtSize(title2, 42);
      coverPage.drawText(title2, {
        x: (PAGE_WIDTH - title2Width) / 2,
        y: PAGE_HEIGHT - 455,
        size: 42,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      // Client name (property/client identifier)
      const clientText = stripEmojis(analysisData.clientName);
      const clientWidth = helveticaFont.widthOfTextAtSize(clientText, 16);
      coverPage.drawText(clientText, {
        x: (PAGE_WIDTH - clientWidth) / 2,
        y: PAGE_HEIGHT - 520,
        size: 16,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      // Prepared date at bottom
      const dateText = `Prepared: ${new Date(analysisData.generatedAt).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`;
      const dateWidth = helveticaFont.widthOfTextAtSize(dateText, 12);
      coverPage.drawText(dateText, {
        x: (PAGE_WIDTH - dateWidth) / 2,
        y: 100,
        size: 12,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      // Bottom gold accent bar
      coverPage.drawRectangle({
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: 12,
        color: NPC_GOLD,
      });
      
      console.log('✓ NPC branded cover page complete');
      
      // Define metrics and health score early for TOC page numbers and later use
      const metrics = analysisData.portfolioMetrics;
      const healthScore = safeNumber(analysisData.analysis?.executiveSummary?.healthScore, 0);
      
      // ============= PHASE 5: TABLE OF CONTENTS =============
      console.log('📝 Creating table of contents...');
      const tocPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      let tocY = PAGE_HEIGHT - MARGIN_TOP;
      
      // Header bar for TOC with NPC Navy
      tocPage.drawRectangle({
        x: 0,
        y: PAGE_HEIGHT - 40,
        width: PAGE_WIDTH,
        height: 40,
        color: NPC_NAVY,
      });
      
      tocPage.drawText('TABLE OF CONTENTS', {
        x: MARGIN_LEFT,
        y: PAGE_HEIGHT - 27,
        size: 12,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
      
      tocY -= 30;
      
      // TOC entries with page numbers
      const tocEntries = [
        { title: 'Executive Summary', page: 3 },
        { title: 'Portfolio Overview', page: 3 },
        { title: 'Portfolio Composition Analysis', page: metrics.smsfCount > 0 ? 5 : 4 },
        { title: 'Property Cashflow Analysis', page: metrics.smsfCount > 0 ? 6 : 5 },
        { title: 'Property Performance Rankings', page: metrics.smsfCount > 0 ? 7 : 6 },
        { title: 'Financial Health Analysis', page: metrics.smsfCount > 0 ? 8 : 7 },
        { title: 'Risk Assessment', page: metrics.smsfCount > 0 ? 8 : 7 },
        { title: 'Growth Opportunities', page: metrics.smsfCount > 0 ? 9 : 8 },
        { title: 'Portfolio Projections', page: metrics.smsfCount > 0 ? 9 : 8 },
        { title: 'Strategic Recommendations', page: metrics.smsfCount > 0 ? 10 : 9 },
        { title: 'Property Portfolio Details', page: metrics.smsfCount > 0 ? 11 : 10 },
        { title: 'Disclaimer & Contact', page: metrics.smsfCount > 0 ? 12 : 11 },
      ];
      
      if (metrics.smsfCount > 0) {
        tocEntries.splice(2, 0, { title: 'SMSF Portfolio Summary', page: 4 });
      }
      
      for (let i = 0; i < tocEntries.length; i++) {
        const entry = tocEntries[i];
        const entryY = tocY - (i * 28);
        
        // Section number
        tocPage.drawText(`${i + 1}.`, {
          x: MARGIN_LEFT,
          y: entryY,
          size: 11,
          font: helveticaBold,
          color: PRIMARY_COLOR,
        });
        
        // Section title
        tocPage.drawText(stripEmojis(entry.title), {
          x: MARGIN_LEFT + 25,
          y: entryY,
          size: 11,
          font: helveticaFont,
          color: SECONDARY_COLOR,
        });
        
        // Dotted line
        const titleWidth = helveticaFont.widthOfTextAtSize(entry.title, 11);
        const dotsStart = MARGIN_LEFT + 30 + titleWidth;
        const dotsEnd = PAGE_WIDTH - MARGIN_RIGHT - 30;
        const dotSpacing = 4;
        
        for (let dotX = dotsStart; dotX < dotsEnd; dotX += dotSpacing) {
          tocPage.drawCircle({
            x: dotX,
            y: entryY + 3,
            size: 0.5,
            color: rgb(0.7, 0.7, 0.7),
          });
        }
        
        // Page number
        tocPage.drawText(entry.page.toString(), {
          x: PAGE_WIDTH - MARGIN_RIGHT - 15,
          y: entryY,
          size: 11,
          font: helveticaBold,
          color: PRIMARY_COLOR,
        });
      }
      
      // Note about report contents
      const noteY = tocY - (tocEntries.length * 28) - 40;
      tocPage.drawRectangle({
        x: MARGIN_LEFT,
        y: noteY - 50,
        width: CONTENT_WIDTH,
        height: 55,
        color: rgb(0.99, 0.98, 0.93), // Gold tint
        borderColor: NPC_GOLD_LIGHT,
        borderWidth: 1,
      });
      
      tocPage.drawText('About This Report', {
        x: MARGIN_LEFT + 10,
        y: noteY - 15,
        size: 10,
        font: helveticaBold,
        color: PRIMARY_COLOR,
      });
      
      const aboutText = `This comprehensive portfolio analysis covers ${metrics.totalProperties} properties with a combined value of ${formatCurrency(metrics.totalValue)}. The analysis includes performance rankings, financial health assessment, risk evaluation, and strategic recommendations.`;
      drawWrappedText(tocPage, aboutText, MARGIN_LEFT + 10, noteY - 30, CONTENT_WIDTH - 20, helveticaFont, 9, MUTED_COLOR);
      
      console.log('✓ Table of contents complete');
      
      // ============= PAGE 2: EXECUTIVE SUMMARY =============
      console.log('📝 Creating executive summary page...');
      let page = addContentPage();
      let yPos = PAGE_HEIGHT - MARGIN_TOP;
      
      // Page header
      yPos = drawSectionHeader(page, 'Executive Summary', yPos);
      
      // Health status row
      const healthStatus = analysisData.analysis.executiveSummary.overallHealth;
      page.drawText('Portfolio Health:', {
        x: MARGIN_LEFT,
        y: yPos,
        size: 11,
        font: helveticaFont,
        color: MUTED_COLOR,
      });
      
      const healthStatusColor = healthStatus.toLowerCase() === 'excellent' || healthStatus.toLowerCase() === 'good' 
        ? SUCCESS_COLOR 
        : healthStatus.toLowerCase() === 'poor' ? DANGER_COLOR : WARNING_COLOR;
      
      page.drawText(stripEmojis(healthStatus.toUpperCase()), {
        x: MARGIN_LEFT + 95,
        y: yPos,
        size: 11,
        font: helveticaBold,
        color: healthStatusColor,
      });
      
      page.drawText(`Score: ${healthScore}/100`, {
        x: PAGE_WIDTH - MARGIN_RIGHT - 80,
        y: yPos,
        size: 11,
        font: helveticaBold,
        color: PRIMARY_COLOR,
      });
      
      yPos -= 25;
      
      // Primary recommendation
      page.drawText('Primary Recommendation:', {
        x: MARGIN_LEFT,
        y: yPos,
        size: 10,
        font: helveticaBold,
        color: SECONDARY_COLOR,
      });
      yPos -= 15;
      
      yPos = drawWrappedText(
        page,
        analysisData.analysis.executiveSummary.primaryRecommendation,
        MARGIN_LEFT,
        yPos,
        CONTENT_WIDTH,
        helveticaFont,
        10,
        SECONDARY_COLOR
      );
      
      yPos -= 20;
      
      // Key Strengths
      const keyStrengths = safeArray(analysisData.analysis?.executiveSummary?.keyStrengths);
      if (keyStrengths.length > 0) {
        page.drawText('Key Strengths:', {
          x: MARGIN_LEFT,
          y: yPos,
          size: 10,
          font: helveticaBold,
          color: SUCCESS_COLOR,
        });
        yPos -= 15;
        
        for (const strength of keyStrengths) {
          yPos = drawWrappedText(page, `• ${safeString(strength, 'N/A')}`, MARGIN_LEFT + 10, yPos, CONTENT_WIDTH - 20, helveticaFont, 9, SECONDARY_COLOR);
        }
        
        yPos -= 15;
      }
      
      // Key Concerns
      const keyConcerns = safeArray(analysisData.analysis?.executiveSummary?.keyConcerns);
      if (keyConcerns.length > 0) {
        page.drawText('Key Concerns:', {
          x: MARGIN_LEFT,
          y: yPos,
          size: 10,
          font: helveticaBold,
          color: WARNING_COLOR,
        });
        yPos -= 15;
        
        for (const concern of keyConcerns) {
          yPos = drawWrappedText(page, `• ${safeString(concern, 'N/A')}`, MARGIN_LEFT + 10, yPos, CONTENT_WIDTH - 20, helveticaFont, 9, SECONDARY_COLOR);
        }
      }
      
      yPos -= 30;
      
      // ============= PORTFOLIO OVERVIEW SECTION =============
      yPos = drawSectionHeader(page, 'Portfolio Overview', yPos);
      
      const kpiWidth = (CONTENT_WIDTH - 20) / 3;
      
      // Row 1: Total Value, Total Equity, Average LVR
      drawKPIBox(page, 'TOTAL VALUE', formatCurrency(metrics.totalValue), MARGIN_LEFT, yPos, kpiWidth);
      drawKPIBox(page, 'TOTAL EQUITY', formatCurrency(metrics.totalEquity), MARGIN_LEFT + kpiWidth + 10, yPos, kpiWidth, SUCCESS_COLOR);
      drawKPIBox(page, 'AVERAGE LVR', formatPercentage(metrics.averageLVR), MARGIN_LEFT + (kpiWidth + 10) * 2, yPos, kpiWidth);
      
      yPos -= 65;
      
      // Row 2: Properties, Monthly Cashflow, Avg Yield
      const cashflowColor = safeNumber(metrics.netMonthlyCashflow) >= 0 ? SUCCESS_COLOR : DANGER_COLOR;
      drawKPIBox(page, 'PROPERTIES', safeNumber(metrics.totalProperties).toString(), MARGIN_LEFT, yPos, kpiWidth);
      drawKPIBox(page, 'MONTHLY CASHFLOW', formatCurrency(metrics.netMonthlyCashflow), MARGIN_LEFT + kpiWidth + 10, yPos, kpiWidth, cashflowColor);
      drawKPIBox(page, 'AVG. YIELD', formatPercentage(metrics.averageYield, 2), MARGIN_LEFT + (kpiWidth + 10) * 2, yPos, kpiWidth);
      
      yPos -= 65;
      
      console.log('✓ Executive summary page complete');
      
      // ============= PAGE 3: SMSF SUMMARY (if applicable) =============
      if (safeNumber(metrics.smsfCount) > 0) {
        console.log('📝 Creating SMSF summary page...');
        page = addContentPage();
        yPos = PAGE_HEIGHT - MARGIN_TOP;
        
        yPos = drawSectionHeader(page, 'SMSF Portfolio Summary', yPos);
        
        // SMSF KPI boxes
        const smsfKpiWidth = (CONTENT_WIDTH - 10) / 2;
        drawKPIBox(page, 'SMSF PROPERTIES', safeNumber(metrics.smsfCount).toString(), MARGIN_LEFT, yPos, smsfKpiWidth);
        drawKPIBox(page, 'SMSF TOTAL VALUE', formatCurrency(metrics.smsfTotalValue), MARGIN_LEFT + smsfKpiWidth + 10, yPos, smsfKpiWidth, PRIMARY_COLOR);
        
        yPos -= 65;
        
        drawKPIBox(page, 'SMSF EQUITY', formatCurrency(metrics.smsfTotalEquity), MARGIN_LEFT, yPos, smsfKpiWidth, SUCCESS_COLOR);
        
        yPos -= 80;
        
        // Compliance status
        yPos = drawSubsectionHeader(page, 'Compliance Status', yPos);
        yPos -= 5;
        
        const complianceData = [
          ['Status', 'Count'],
          ['Compliant', safeNumber(metrics.smsfCompliantCount).toString()],
          ['Pending Audit', safeNumber(metrics.smsfPendingAuditCount).toString()],
          ['Non-Compliant', safeNumber(metrics.smsfNonCompliantCount).toString()],
        ];
        
        const { lastY: complianceLastY } = drawTable(page, complianceData[0], complianceData.slice(1), MARGIN_LEFT, yPos, [CONTENT_WIDTH / 2, CONTENT_WIDTH / 2]);
        yPos = complianceLastY - 20;
        
        console.log('✓ SMSF summary page complete');
      }
      
      // ============= PHASE 4: COMPOSITION ANALYSIS PAGE =============
      console.log('📝 Creating composition analysis page...');
      page = addContentPage();
      yPos = PAGE_HEIGHT - MARGIN_TOP;
      
      yPos = drawSectionHeader(page, 'Portfolio Composition Analysis', yPos);
      
      const composition = analysisData.analysis.compositionAnalysis;
      
      // Diversification Score Visual (Progress Bar Style)
      const drawScoreBar = (
        page: PDFPage,
        label: string,
        score: number,
        maxScore: number,
        x: number,
        y: number,
        width: number
      ): number => {
        const barHeight = 20;
        const percentage = Math.min(score / maxScore, 1);
        const filledWidth = width * percentage;
        
        // Label
        page.drawText(stripEmojis(label), {
          x,
          y: y + 5,
          size: 9,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        // Background bar
        page.drawRectangle({
          x,
          y: y - barHeight,
          width,
          height: barHeight,
          color: rgb(0.93, 0.93, 0.93),
        });
        
        // Filled bar
        const barColor = percentage >= 0.7 ? SUCCESS_COLOR : percentage >= 0.4 ? WARNING_COLOR : DANGER_COLOR;
        page.drawRectangle({
          x,
          y: y - barHeight,
          width: filledWidth,
          height: barHeight,
          color: barColor,
        });
        
        // Score text
        const scoreText = `${score}/${maxScore}`;
        page.drawText(scoreText, {
          x: x + width + 10,
          y: y - 14,
          size: 11,
          font: helveticaBold,
          color: barColor,
        });
        
        return y - barHeight - 20;
      };
      
      // Diversification Score
      const diversificationScore = safeNumber(composition?.diversificationScore);
      yPos = drawScoreBar(page, 'Diversification Score', diversificationScore, 100, MARGIN_LEFT, yPos, CONTENT_WIDTH - 80);
      
      yPos -= 10;
      
      // Asset Allocation
      yPos = drawSubsectionHeader(page, 'Asset Allocation', yPos);
      yPos -= 5;
      yPos = drawFormattedText(page, safeString(composition?.assetAllocation, 'No asset allocation data available.'), MARGIN_LEFT, yPos, CONTENT_WIDTH, 9, 14);
      yPos -= 15;
      
      // Property Mix Assessment
      yPos = drawSubsectionHeader(page, 'Property Mix Assessment', yPos);
      yPos -= 5;
      yPos = drawFormattedText(page, safeString(composition?.propertyMixAssessment, 'No property mix data available.'), MARGIN_LEFT, yPos, CONTENT_WIDTH, 9, 14);
      yPos -= 15;
      
      // Property Type Breakdown Visual
      yPos = drawSubsectionHeader(page, 'Portfolio Breakdown by Type', yPos);
      yPos -= 10;
      
      const totalProps = safeNumber(metrics.totalProperties);
      const investmentPercent = totalProps > 0 
        ? Math.round((safeNumber(metrics.investmentCount) / totalProps) * 100) 
        : 0;
      const ownerOccPercent = totalProps > 0 
        ? Math.round((safeNumber(metrics.ownerOccupiedCount) / totalProps) * 100) 
        : 0;
      const smsfPercent = totalProps > 0 
        ? Math.round((safeNumber(metrics.smsfCount) / totalProps) * 100) 
        : 0;
      
      // Investment properties bar
      const barWidth = CONTENT_WIDTH - 100;
      
      page.drawText('Investment', {
        x: MARGIN_LEFT,
        y: yPos,
        size: 8,
        font: helveticaFont,
        color: MUTED_COLOR,
      });
      page.drawRectangle({
        x: MARGIN_LEFT + 70,
        y: yPos - 8,
        width: barWidth,
        height: 14,
        color: rgb(0.93, 0.93, 0.93),
      });
      page.drawRectangle({
        x: MARGIN_LEFT + 70,
        y: yPos - 8,
        width: barWidth * (investmentPercent / 100),
        height: 14,
        color: PRIMARY_COLOR,
      });
      page.drawText(`${investmentPercent}% (${safeNumber(metrics.investmentCount)})`, {
        x: MARGIN_LEFT + 75 + barWidth,
        y: yPos - 5,
        size: 8,
        font: helveticaBold,
        color: PRIMARY_COLOR,
      });
      yPos -= 22;
      
      // Owner Occupied bar
      page.drawText('Owner Occ.', {
        x: MARGIN_LEFT,
        y: yPos,
        size: 8,
        font: helveticaFont,
        color: MUTED_COLOR,
      });
      page.drawRectangle({
        x: MARGIN_LEFT + 70,
        y: yPos - 8,
        width: barWidth,
        height: 14,
        color: rgb(0.93, 0.93, 0.93),
      });
      page.drawRectangle({
        x: MARGIN_LEFT + 70,
        y: yPos - 8,
        width: barWidth * (ownerOccPercent / 100),
        height: 14,
        color: SUCCESS_COLOR,
      });
      page.drawText(`${ownerOccPercent}% (${safeNumber(metrics.ownerOccupiedCount)})`, {
        x: MARGIN_LEFT + 75 + barWidth,
        y: yPos - 5,
        size: 8,
        font: helveticaBold,
        color: SUCCESS_COLOR,
      });
      yPos -= 22;
      
      // SMSF bar
      if (safeNumber(metrics.smsfCount) > 0) {
        page.drawText('SMSF', {
          x: MARGIN_LEFT,
          y: yPos,
          size: 8,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        page.drawRectangle({
          x: MARGIN_LEFT + 70,
          y: yPos - 8,
          width: barWidth,
          height: 14,
          color: rgb(0.93, 0.93, 0.93),
        });
        page.drawRectangle({
          x: MARGIN_LEFT + 70,
          y: yPos - 8,
          width: barWidth * (smsfPercent / 100),
          height: 14,
          color: WARNING_COLOR,
        });
        page.drawText(`${smsfPercent}% (${safeNumber(metrics.smsfCount)})`, {
          x: MARGIN_LEFT + 75 + barWidth,
          y: yPos - 5,
          size: 8,
          font: helveticaBold,
          color: WARNING_COLOR,
        });
        yPos -= 22;
      }
      
      yPos -= 15;
      
      // Composition Recommendations
      const compositionRecs = safeArray(composition?.recommendations);
      if (compositionRecs.length > 0) {
        yPos = drawSubsectionHeader(page, 'Composition Recommendations', yPos, PRIMARY_COLOR);
        yPos -= 5;
        yPos = drawBulletList(page, compositionRecs, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
      }
      
      console.log('✓ Composition analysis page complete');
      
      // ============= PHASE 4: ENHANCED PROPERTY CASHFLOW TABLE =============
      console.log('📝 Creating property cashflow details page...');
      page = addContentPage();
      yPos = PAGE_HEIGHT - MARGIN_TOP;
      
      yPos = drawSectionHeader(page, 'Property Cashflow Analysis', yPos);
      
      // Enhanced property cards with cashflow details
      const propertyAnalyses = safeArray(analysisData.propertyAnalyses);
      for (const prop of propertyAnalyses) {
        // Check for page break - each property card needs ~100px
        if (needsNewPage(yPos, 100)) {
          page = addContentPage();
          yPos = PAGE_HEIGHT - MARGIN_TOP;
          yPos = drawSectionHeader(page, 'Property Cashflow Analysis (continued)', yPos);
        }
        
        // Property card background
        page.drawRectangle({
          x: MARGIN_LEFT,
          y: yPos - 80,
          width: CONTENT_WIDTH,
          height: 85,
          color: rgb(0.98, 0.98, 0.98),
          borderColor: rgb(0.9, 0.9, 0.9),
          borderWidth: 1,
        });
        
        // Property number badge
        page.drawRectangle({
          x: MARGIN_LEFT + 5,
          y: yPos - 20,
          width: 22,
          height: 18,
          color: PRIMARY_COLOR,
        });
        page.drawText(`${prop.propertyNumber}`, {
          x: MARGIN_LEFT + 12,
          y: yPos - 16,
          size: 10,
          font: helveticaBold,
          color: rgb(1, 1, 1),
        });
        
        // Address
        const propAddress = safeString(prop.address, 'Unknown Address');
        const truncatedAddress = propAddress.length > 50 ? propAddress.substring(0, 47) + '...' : propAddress;
        page.drawText(stripEmojis(truncatedAddress), {
          x: MARGIN_LEFT + 35,
          y: yPos - 15,
          size: 10,
          font: helveticaBold,
          color: SECONDARY_COLOR,
        });
        
        // Property type badge
        page.drawText(stripEmojis(safeString(prop.propertyType, 'Property')), {
          x: PAGE_WIDTH - MARGIN_RIGHT - 60,
          y: yPos - 15,
          size: 8,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        // Metrics row 1
        const metricsY = yPos - 40;
        const metricWidth = CONTENT_WIDTH / 5;
        
        // Value
        page.drawText('Value', {
          x: MARGIN_LEFT + 10,
          y: metricsY + 10,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        page.drawText(formatCurrency(prop.value), {
          x: MARGIN_LEFT + 10,
          y: metricsY - 3,
          size: 9,
          font: helveticaBold,
          color: SECONDARY_COLOR,
        });
        
        // Equity
        page.drawText('Equity', {
          x: MARGIN_LEFT + 10 + metricWidth,
          y: metricsY + 10,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        page.drawText(formatCurrency(prop.equity), {
          x: MARGIN_LEFT + 10 + metricWidth,
          y: metricsY - 3,
          size: 9,
          font: helveticaBold,
          color: SUCCESS_COLOR,
        });
        
        // LVR
        page.drawText('LVR', {
          x: MARGIN_LEFT + 10 + metricWidth * 2,
          y: metricsY + 10,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        const lvrValue = parseFloat(safeString(prop.lvr, '0')) || 0;
        const lvrColor = lvrValue <= 60 ? SUCCESS_COLOR : lvrValue <= 80 ? WARNING_COLOR : DANGER_COLOR;
        page.drawText(safeString(prop.lvr, '0%'), {
          x: MARGIN_LEFT + 10 + metricWidth * 2,
          y: metricsY - 3,
          size: 9,
          font: helveticaBold,
          color: lvrColor,
        });
        
        // Yield
        page.drawText('Gross Yield', {
          x: MARGIN_LEFT + 10 + metricWidth * 3,
          y: metricsY + 10,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        page.drawText(safeString(prop.grossYield, '0%'), {
          x: MARGIN_LEFT + 10 + metricWidth * 3,
          y: metricsY - 3,
          size: 9,
          font: helveticaBold,
          color: PRIMARY_COLOR,
        });
        
        // Net Cashflow
        page.drawText('Net Cashflow/mo', {
          x: MARGIN_LEFT + 10 + metricWidth * 4,
          y: metricsY + 10,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        const netCashflow = safeNumber(prop.netMonthlyCashflow);
        const cfColor = netCashflow >= 0 ? SUCCESS_COLOR : DANGER_COLOR;
        const cfPrefix = netCashflow >= 0 ? '+' : '';
        page.drawText(`${cfPrefix}${formatCurrency(netCashflow)}`, {
          x: MARGIN_LEFT + 10 + metricWidth * 4,
          y: metricsY - 3,
          size: 9,
          font: helveticaBold,
          color: cfColor,
        });
        
        // Portfolio contribution bar
        const contributionY = metricsY - 25;
        page.drawText('Portfolio Contribution:', {
          x: MARGIN_LEFT + 10,
          y: contributionY,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        const contributionPercent = parseFloat(safeString(prop.portfolioContribution, '0')) || 0;
        const contribBarWidth = 150;
        page.drawRectangle({
          x: MARGIN_LEFT + 110,
          y: contributionY - 5,
          width: contribBarWidth,
          height: 10,
          color: rgb(0.9, 0.9, 0.9),
        });
        page.drawRectangle({
          x: MARGIN_LEFT + 110,
          y: contributionY - 5,
          width: contribBarWidth * (contributionPercent / 100),
          height: 10,
          color: PRIMARY_COLOR,
        });
        page.drawText(safeString(prop.portfolioContribution, '0%'), {
          x: MARGIN_LEFT + 115 + contribBarWidth,
          y: contributionY - 2,
          size: 8,
          font: helveticaBold,
          color: PRIMARY_COLOR,
        });
        
        yPos -= 95;
      }
      
      console.log('✓ Property cashflow details page complete');
      
      // ============= PAGE: PROPERTY RANKINGS =============
      console.log('📝 Creating property rankings page...');
      page = addContentPage();
      yPos = PAGE_HEIGHT - MARGIN_TOP;
      
      yPos = drawSectionHeader(page, 'Property Performance Rankings', yPos);
      
      const propertyRankings = safeArray(analysisData.analysis?.propertyRankings);
      for (const prop of propertyRankings) {
        // Check for page break
        if (needsNewPage(yPos, 120)) {
          page = addContentPage();
          yPos = PAGE_HEIGHT - MARGIN_TOP;
          yPos = drawSectionHeader(page, 'Property Performance Rankings (continued)', yPos);
        }
        
        // Rank badge
        const rankBadgeColor = prop.rank === 1 ? SUCCESS_COLOR : prop.rank === 2 ? PRIMARY_COLOR : MUTED_COLOR;
        page.drawRectangle({
          x: MARGIN_LEFT,
          y: yPos - 16,
          width: 25,
          height: 20,
          color: rankBadgeColor,
        });
        page.drawText(`#${prop.rank}`, {
          x: MARGIN_LEFT + 6,
          y: yPos - 12,
          size: 10,
          font: helveticaBold,
          color: rgb(1, 1, 1),
        });
        
        // Address
        page.drawText(stripEmojis(safeString(prop.address, 'Unknown Address')), {
          x: MARGIN_LEFT + 35,
          y: yPos - 10,
          size: 10,
          font: helveticaBold,
          color: SECONDARY_COLOR,
        });
        
        // Performance rating badge
        const perfRating = safeString(prop.performanceRating, 'Unknown');
        const ratingColor = perfRating.toLowerCase() === 'strong' ? SUCCESS_COLOR :
                           perfRating.toLowerCase() === 'moderate' ? WARNING_COLOR : DANGER_COLOR;
        const ratingText = stripEmojis(perfRating.toUpperCase());
        const ratingWidth = helveticaBold.widthOfTextAtSize(ratingText, 8);
        page.drawRectangle({
          x: PAGE_WIDTH - MARGIN_RIGHT - ratingWidth - 12,
          y: yPos - 14,
          width: ratingWidth + 12,
          height: 16,
          color: ratingColor,
        });
        page.drawText(ratingText, {
          x: PAGE_WIDTH - MARGIN_RIGHT - ratingWidth - 6,
          y: yPos - 10,
          size: 8,
          font: helveticaBold,
          color: rgb(1, 1, 1),
        });
        
        yPos -= 28;
        
        // Strengths (green)
        const propStrengths = safeArray(prop.strengths);
        if (propStrengths.length > 0) {
          page.drawText('Strengths:', {
            x: MARGIN_LEFT + 10,
            y: yPos,
            size: 8,
            font: helveticaBold,
            color: SUCCESS_COLOR,
          });
          yPos -= 12;
          for (const strength of propStrengths.slice(0, 2)) {
            yPos = drawWrappedText(page, `+ ${safeString(strength, 'N/A')}`, MARGIN_LEFT + 15, yPos, CONTENT_WIDTH - 25, helveticaFont, 8, SECONDARY_COLOR);
          }
        }
        
        // Concerns (amber)
        const propConcerns = safeArray(prop.concerns);
        if (propConcerns.length > 0) {
          page.drawText('Concerns:', {
            x: MARGIN_LEFT + 10,
            y: yPos,
            size: 8,
            font: helveticaBold,
            color: WARNING_COLOR,
          });
          yPos -= 12;
          for (const concern of propConcerns.slice(0, 2)) {
            yPos = drawWrappedText(page, `- ${safeString(concern, 'N/A')}`, MARGIN_LEFT + 15, yPos, CONTENT_WIDTH - 25, helveticaFont, 8, SECONDARY_COLOR);
          }
        }
        
        // Recommendation
        const propRec = safeString(prop.recommendation);
        if (propRec) {
          page.drawText('Recommendation:', {
            x: MARGIN_LEFT + 10,
            y: yPos,
            size: 8,
            font: helveticaBold,
            color: PRIMARY_COLOR,
          });
          yPos -= 12;
          yPos = drawWrappedText(page, propRec, MARGIN_LEFT + 15, yPos, CONTENT_WIDTH - 25, helveticaFont, 8, SECONDARY_COLOR);
        }
        
        // Separator line
        yPos -= 10;
        page.drawLine({
          start: { x: MARGIN_LEFT, y: yPos },
          end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: yPos },
          thickness: 0.5,
          color: rgb(0.9, 0.9, 0.9),
        });
        yPos -= 15;
      }
      
      console.log('✓ Property rankings page complete');
      
      // ============= PAGE 5: FINANCIAL HEALTH ANALYSIS =============
      console.log('📝 Creating financial health page...');
      page = addContentPage();
      yPos = PAGE_HEIGHT - MARGIN_TOP;
      
      yPos = drawSectionHeader(page, 'Financial Health Analysis', yPos);
      
      const financialHealth = analysisData.analysis?.financialHealth;
      
      // Status indicators
      const statusItems = [
        { label: 'Cashflow Status', value: safeString(financialHealth?.cashflowStatus, 'N/A') },
        { label: 'Equity Position', value: safeString(financialHealth?.equityPosition, 'N/A') },
        { label: 'Debt Serviceability', value: safeString(financialHealth?.debtServiceability, 'N/A') },
        { label: 'LVR Risk', value: safeString(financialHealth?.lvrRisk, 'N/A') },
      ];
      
      const statusBoxWidth = (CONTENT_WIDTH - 30) / 4;
      let statusX = MARGIN_LEFT;
      
      for (const item of statusItems) {
        const itemVal = item.value.toLowerCase();
        const statusColor = itemVal.includes('strong') || itemVal.includes('healthy') || itemVal === 'low'
          ? SUCCESS_COLOR
          : itemVal.includes('moderate') || itemVal === 'medium'
          ? WARNING_COLOR
          : DANGER_COLOR;
        
        page.drawRectangle({
          x: statusX,
          y: yPos - 45,
          width: statusBoxWidth,
          height: 50,
          color: rgb(0.97, 0.97, 0.97),
          borderColor: statusColor,
          borderWidth: 2,
        });
        
        page.drawText(stripEmojis(item.label), {
          x: statusX + 5,
          y: yPos - 15,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        const truncatedValue = item.value.length > 12 ? item.value.substring(0, 10) + '..' : item.value;
        page.drawText(stripEmojis(truncatedValue), {
          x: statusX + 5,
          y: yPos - 35,
          size: 10,
          font: helveticaBold,
          color: statusColor,
        });
        
        statusX += statusBoxWidth + 10;
      }
      
      yPos -= 70;
      
      // Detailed analysis
      yPos = drawSubsectionHeader(page, 'Detailed Analysis', yPos);
      yPos -= 5;
      yPos = drawFormattedText(page, safeString(financialHealth?.analysis, 'No detailed analysis available.'), MARGIN_LEFT, yPos, CONTENT_WIDTH, 9, 14);
      
      console.log('✓ Financial health page complete');
      
      // ============= PAGE 6: RISK ASSESSMENT =============
      console.log('📝 Creating risk assessment page...');
      
      if (needsNewPage(yPos, 200)) {
        page = addContentPage();
        yPos = PAGE_HEIGHT - MARGIN_TOP;
      } else {
        yPos -= 25;
      }
      
      yPos = drawSectionHeader(page, 'Risk Assessment', yPos);
      
      const risk = analysisData.analysis?.riskAssessment;
      
      // Overall risk level badge
      const overallRiskLevel = safeString(risk?.overallRiskLevel, 'Unknown');
      const overallRiskColor = overallRiskLevel.toLowerCase() === 'low' ? SUCCESS_COLOR :
                               overallRiskLevel.toLowerCase() === 'medium' ? WARNING_COLOR : DANGER_COLOR;
      
      page.drawText('Overall Risk Level:', {
        x: MARGIN_LEFT,
        y: yPos,
        size: 10,
        font: helveticaFont,
        color: MUTED_COLOR,
      });
      
      const riskLevelText = stripEmojis(overallRiskLevel.toUpperCase());
      page.drawRectangle({
        x: MARGIN_LEFT + 105,
        y: yPos - 5,
        width: helveticaBold.widthOfTextAtSize(riskLevelText, 12) + 16,
        height: 20,
        color: overallRiskColor,
      });
      page.drawText(riskLevelText, {
        x: MARGIN_LEFT + 113,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
      
      yPos -= 35;
      
      // Risk categories table
      const riskCategories = [
        ['Risk Category', 'Assessment'],
        ['Concentration Risk', safeString(risk?.concentrationRisk, 'N/A')],
        ['Interest Rate Sensitivity', safeString(risk?.interestRateSensitivity, 'N/A')],
        ['Vacancy Risk', safeString(risk?.vacancyRisk, 'N/A')],
      ];
      
      const { lastY: riskTableLastY } = drawTable(page, riskCategories[0], riskCategories.slice(1), MARGIN_LEFT, yPos, [CONTENT_WIDTH * 0.4, CONTENT_WIDTH * 0.6]);
      yPos = riskTableLastY - 20;
      
      // Market risks
      const marketRisks = safeArray(risk?.marketRisks);
      if (marketRisks.length > 0) {
        yPos = drawSubsectionHeader(page, 'Market Risks', yPos, DANGER_COLOR);
        yPos -= 5;
        yPos = drawBulletList(page, marketRisks, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= 10;
      }
      
      // Mitigation strategies
      const mitigationStrategies = safeArray(risk?.mitigationStrategies);
      if (mitigationStrategies.length > 0) {
        yPos = drawSubsectionHeader(page, 'Mitigation Strategies', yPos, SUCCESS_COLOR);
        yPos -= 5;
        yPos = drawBulletList(page, mitigationStrategies, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
      }
      
      console.log('✓ Risk assessment page complete');
      
      // ============= PAGE 7: GROWTH OPPORTUNITIES =============
      console.log('📝 Creating growth opportunities page...');
      page = addContentPage();
      yPos = PAGE_HEIGHT - MARGIN_TOP;
      
      yPos = drawSectionHeader(page, 'Growth Opportunities', yPos);
      
      const growth = analysisData.analysis?.growthOpportunities;
      
      // Equity Release Options
      const equityReleaseOptions = safeArray(growth?.equityReleaseOptions);
      if (equityReleaseOptions.length > 0) {
        yPos = drawSubsectionHeader(page, 'Equity Release Options', yPos);
        yPos -= 5;
        yPos = drawBulletList(page, equityReleaseOptions, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= 15;
      }
      
      // Refinancing Opportunities
      const refinancingOpportunities = safeArray(growth?.refinancingOpportunities);
      if (refinancingOpportunities.length > 0) {
        yPos = drawSubsectionHeader(page, 'Refinancing Opportunities', yPos);
        yPos -= 5;
        yPos = drawBulletList(page, refinancingOpportunities, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= 15;
      }
      
      // Next Purchase Recommendations
      const nextPurchaseRecs = safeArray(growth?.nextPurchaseRecommendations);
      if (nextPurchaseRecs.length > 0) {
        yPos = drawSubsectionHeader(page, 'Next Purchase Recommendations', yPos, PRIMARY_COLOR);
        yPos -= 5;
        yPos = drawBulletList(page, nextPurchaseRecs, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= 15;
      }
      
      // Optimization Strategies
      const optimizationStrategies = safeArray(growth?.optimizationStrategies);
      if (optimizationStrategies.length > 0) {
        yPos = drawSubsectionHeader(page, 'Portfolio Optimization Strategies', yPos);
        yPos -= 5;
        yPos = drawBulletList(page, optimizationStrategies, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
      }
      
      console.log('✓ Growth opportunities page complete');
      
      // ============= PAGE 8: 10-YEAR PROJECTIONS =============
      console.log('📝 Creating projections page...');
      
      if (needsNewPage(yPos, 200)) {
        page = addContentPage();
        yPos = PAGE_HEIGHT - MARGIN_TOP;
      } else {
        yPos -= 25;
      }
      
      const projections = analysisData.analysis?.projections;
      const projYears = safeNumber(projections?.years, 10);
      yPos = drawSectionHeader(page, `${projYears}-Year Portfolio Projections`, yPos);
      
      // Projection KPI boxes
      const projKpiWidth = (CONTENT_WIDTH - 20) / 3;
      drawKPIBox(page, 'PROJECTED VALUE', formatCurrency(projections?.projectedPortfolioValue), MARGIN_LEFT, yPos, projKpiWidth, PRIMARY_COLOR);
      drawKPIBox(page, 'PROJECTED EQUITY', formatCurrency(projections?.projectedEquity), MARGIN_LEFT + projKpiWidth + 10, yPos, projKpiWidth, SUCCESS_COLOR);
      drawKPIBox(page, 'PROJECTED CASHFLOW', formatCurrency(projections?.projectedMonthlyCashflow) + '/mo', MARGIN_LEFT + (projKpiWidth + 10) * 2, yPos, projKpiWidth);
      
      yPos -= 80;
      
      // Assumptions
      const assumptions = safeArray(projections?.assumptions);
      if (assumptions.length > 0) {
        yPos = drawSubsectionHeader(page, 'Key Assumptions', yPos);
        yPos -= 5;
        yPos = drawBulletList(page, assumptions, MARGIN_LEFT, yPos, CONTENT_WIDTH, 8);
      }
      
      console.log('✓ Projections page complete');
      
      // ============= PAGE 9: STRATEGIC RECOMMENDATIONS =============
      console.log('📝 Creating strategic recommendations page...');
      page = addContentPage();
      yPos = PAGE_HEIGHT - MARGIN_TOP;
      
      yPos = drawSectionHeader(page, 'Strategic Recommendations', yPos);
      
      const recommendations = analysisData.analysis?.strategicRecommendations;
      
      // Priority Actions (highlighted)
      const priorityActions = safeArray(recommendations?.priorityActions);
      if (priorityActions.length > 0) {
        page.drawRectangle({
          x: MARGIN_LEFT,
          y: yPos - (priorityActions.length * 18 + 35),
          width: CONTENT_WIDTH,
          height: priorityActions.length * 18 + 35,
          color: rgb(0.95, 0.97, 0.95),
          borderColor: SUCCESS_COLOR,
          borderWidth: 1,
        });
        
        page.drawText('PRIORITY ACTIONS', {
          x: MARGIN_LEFT + 10,
          y: yPos - 18,
          size: 11,
          font: helveticaBold,
          color: SUCCESS_COLOR,
        });
        
        yPos -= 35;
        for (let i = 0; i < priorityActions.length; i++) {
          page.drawText(`${i + 1}.`, {
            x: MARGIN_LEFT + 15,
            y: yPos,
            size: 9,
            font: helveticaBold,
            color: PRIMARY_COLOR,
          });
          yPos = drawWrappedText(page, safeString(priorityActions[i], 'N/A'), MARGIN_LEFT + 30, yPos, CONTENT_WIDTH - 50, helveticaFont, 9, SECONDARY_COLOR);
          yPos -= 3;
        }
        yPos -= 20;
      }
      
      // Short-Term (0-12 months)
      const shortTerm = safeArray(recommendations?.shortTerm);
      if (shortTerm.length > 0) {
        yPos = drawSubsectionHeader(page, 'Short-Term (0-12 months)', yPos);
        yPos -= 5;
        yPos = drawBulletList(page, shortTerm, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= 15;
      }
      
      // Medium-Term (1-3 years)
      const mediumTerm = safeArray(recommendations?.mediumTerm);
      if (mediumTerm.length > 0) {
        if (needsNewPage(yPos, 80)) {
          page = addContentPage();
          yPos = PAGE_HEIGHT - MARGIN_TOP;
        }
        yPos = drawSubsectionHeader(page, 'Medium-Term (1-3 years)', yPos);
        yPos -= 5;
        yPos = drawBulletList(page, mediumTerm, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= 15;
      }
      
      // Long-Term (3+ years)
      const longTerm = safeArray(recommendations?.longTerm);
      if (longTerm.length > 0) {
        if (needsNewPage(yPos, 80)) {
          page = addContentPage();
          yPos = PAGE_HEIGHT - MARGIN_TOP;
        }
        yPos = drawSubsectionHeader(page, 'Long-Term (3+ years)', yPos);
        yPos -= 5;
        yPos = drawBulletList(page, longTerm, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
      }
      
      console.log('✓ Strategic recommendations page complete');
      
      // ============= PAGE 10: PROPERTY DETAILS TABLE =============
      console.log('📝 Creating property details page...');
      page = addContentPage();
      yPos = PAGE_HEIGHT - MARGIN_TOP;
      
      yPos = drawSectionHeader(page, 'Property Portfolio Details', yPos);
      
      // Build property table
      const propHeaders = ['#', 'Address', 'Type', 'Value', 'Equity', 'LVR', 'Yield'];
      const propColumnWidths = [25, 170, 60, 70, 70, 40, 50];
      
      const propRows = analysisData.propertyAnalyses.map(prop => [
        prop.propertyNumber.toString(),
        prop.address.substring(0, 35),
        prop.propertyType,
        formatCurrency(prop.value),
        formatCurrency(prop.equity),
        prop.lvr,
        prop.grossYield,
      ]);
      
      let tableResult = drawTable(page, propHeaders, propRows, MARGIN_LEFT, yPos, propColumnWidths, 20);
      yPos = tableResult.lastY;
      
      // Handle table overflow to new page
      if (tableResult.needsNewPage) {
        const remainingRows = propRows.slice(Math.floor((PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM) / 20) - 1);
        page = addContentPage();
        yPos = PAGE_HEIGHT - MARGIN_TOP;
        yPos = drawSectionHeader(page, 'Property Portfolio Details (continued)', yPos);
        tableResult = drawTable(page, propHeaders, remainingRows, MARGIN_LEFT, yPos, propColumnWidths, 20);
        yPos = tableResult.lastY;
      }
      
      console.log('✓ Property details page complete');
      
      // ============= NPC BRANDED DISCLAIMER & CONTACT PAGE (Matching Cash Flow PDF) =============
      console.log('📝 Creating NPC branded disclaimer page...');
      const disclaimerPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      
      // Full black background
      disclaimerPage.drawRectangle({
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        color: NPC_BLACK,
      });
      
      // Top gold accent bar
      disclaimerPage.drawRectangle({
        x: 0,
        y: PAGE_HEIGHT - 12,
        width: PAGE_WIDTH,
        height: 12,
        color: NPC_GOLD,
      });
      
      // "NAIDU PROPERTY" - large gold text
      const naiduText = 'NAIDU PROPERTY';
      const naiduWidth = helveticaBold.widthOfTextAtSize(naiduText, 36);
      disclaimerPage.drawText(naiduText, {
        x: MARGIN_LEFT,
        y: PAGE_HEIGHT - 100,
        size: 36,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      // "CONSULTING SERVICES" - gold text below
      const servicesText = 'CONSULTING SERVICES';
      disclaimerPage.drawText(servicesText, {
        x: MARGIN_LEFT,
        y: PAGE_HEIGHT - 140,
        size: 24,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      // "CONTACT US" section
      disclaimerPage.drawText('CONTACT US', {
        x: MARGIN_LEFT,
        y: PAGE_HEIGHT - 200,
        size: 18,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      // Contact details with labels
      const labelX = MARGIN_LEFT;
      const valueX = MARGIN_LEFT + 90;
      let contactY = PAGE_HEIGHT - 250;
      
      // Website
      disclaimerPage.drawText('WEBSITE:', {
        x: labelX,
        y: contactY,
        size: 11,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      disclaimerPage.drawText('npcservices.com.au', {
        x: valueX,
        y: contactY,
        size: 11,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      contactY -= 30;
      
      // Email
      disclaimerPage.drawText('EMAIL:', {
        x: labelX,
        y: contactY,
        size: 11,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      disclaimerPage.drawText('admin@npcservices.com.au', {
        x: valueX,
        y: contactY,
        size: 11,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      contactY -= 30;
      
      // Phone
      disclaimerPage.drawText('PHONE:', {
        x: labelX,
        y: contactY,
        size: 11,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      disclaimerPage.drawText('0433 005 110', {
        x: valueX,
        y: contactY,
        size: 11,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      // Disclaimer text at bottom
      const disclaimerFullText = 'AS A PROFESSIONAL PROPERTY CONSULTANT & BUYERS AGENT, WE PROVIDE INFORMATION AND ADVICE BASED ON OUR EXPERTISE AND EXPERIENCE IN THE REAL ESTATE MARKET. PLEASE BE AWARE THAT THE ADVICE AND INSIGHTS OFFERED ARE FOR GENERAL INFORMATIONAL PURPOSES ONLY AND SHOULD NOT BE CONSIDERED FINANCIAL ADVICE. WHILE WE STRIVE TO ENSURE THE ACCURACY AND RELEVANCE OF THE INFORMATION PROVIDED, REAL ESTATE MARKETS ARE DYNAMIC AND SUBJECT TO CHANGE AND WE CANNOT GUARANTEE THE FUTURE PERFORMANCE OR OUTCOMES OF ANY PROPERTY INVESTMENT.';
      
      // Draw wrapped disclaimer text
      const disclaimerWords = disclaimerFullText.split(' ');
      let disclaimerLine = '';
      let disclaimerY = 280;
      const maxDisclaimerWidth = CONTENT_WIDTH - 20;
      
      for (const word of disclaimerWords) {
        const testLine = disclaimerLine ? `${disclaimerLine} ${word}` : word;
        const testWidth = helveticaFont.widthOfTextAtSize(testLine, 9);
        
        if (testWidth > maxDisclaimerWidth && disclaimerLine) {
          disclaimerPage.drawText(disclaimerLine, {
            x: MARGIN_LEFT,
            y: disclaimerY,
            size: 9,
            font: helveticaFont,
            color: NPC_GOLD,
          });
          disclaimerY -= 14;
          disclaimerLine = word;
        } else {
          disclaimerLine = testLine;
        }
      }
      
      if (disclaimerLine) {
        disclaimerPage.drawText(disclaimerLine, {
          x: MARGIN_LEFT,
          y: disclaimerY,
          size: 9,
          font: helveticaFont,
          color: NPC_GOLD,
        });
      }
      
      // Bottom gold accent bar
      disclaimerPage.drawRectangle({
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: 12,
        color: NPC_GOLD,
      });
      
      console.log('✓ NPC branded disclaimer page complete');
      
      // ============= PHASE 5: ENHANCED PAGE FOOTERS =============
      const totalPages = pdfDoc.getPageCount();
      const footerCompanyName = globalSettings?.contactDetails?.company_name || '';
      
      for (let i = 0; i < totalPages; i++) {
        const currentPage = pdfDoc.getPage(i);
        const pageNum = i + 1;
        
        // Skip footer on cover page (page 1)
        if (i === 0) {
          continue;
        }
        
        // Header bar on content pages (not cover or TOC)
        if (i > 1) {
          currentPage.drawRectangle({
            x: 0,
            y: PAGE_HEIGHT - 35,
            width: PAGE_WIDTH,
            height: 35,
            color: PRIMARY_COLOR,
          });
          
          // Company name in header
          if (footerCompanyName) {
            currentPage.drawText(stripEmojis(footerCompanyName.toUpperCase()), {
              x: MARGIN_LEFT,
              y: PAGE_HEIGHT - 23,
              size: 9,
              font: helveticaBold,
              color: rgb(1, 1, 1),
            });
          }
          
          // Page number in header right
          const headerPageText = `Page ${pageNum}`;
          const headerPageWidth = helveticaFont.widthOfTextAtSize(headerPageText, 9);
          currentPage.drawText(headerPageText, {
            x: PAGE_WIDTH - MARGIN_RIGHT - headerPageWidth,
            y: PAGE_HEIGHT - 23,
            size: 9,
            font: helveticaFont,
            color: rgb(0.9, 0.9, 0.9),
          });
        }
        
        // Footer
        currentPage.drawLine({
          start: { x: MARGIN_LEFT, y: 45 },
          end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: 45 },
          thickness: 0.5,
          color: rgb(0.85, 0.85, 0.85),
        });
        
        // Page number centered
        const pageText = `${pageNum} of ${totalPages}`;
        const pageNumWidth = helveticaFont.widthOfTextAtSize(pageText, 8);
        currentPage.drawText(pageText, {
          x: (PAGE_WIDTH - pageNumWidth) / 2,
          y: 28,
          size: 8,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        // Confidential notice on left
        currentPage.drawText('CONFIDENTIAL', {
          x: MARGIN_LEFT,
          y: 28,
          size: 7,
          font: helveticaFont,
          color: rgb(0.75, 0.75, 0.75),
        });
        
        // Client name on right
        const clientFooter = stripEmojis(analysisData.clientName);
        const clientFooterWidth = helveticaFont.widthOfTextAtSize(clientFooter, 7);
        currentPage.drawText(clientFooter, {
          x: PAGE_WIDTH - MARGIN_RIGHT - clientFooterWidth,
          y: 28,
          size: 7,
          font: helveticaFont,
          color: rgb(0.75, 0.75, 0.75),
        });
      }
      
      console.log('✓ Disclaimer page complete');
      
      // ============= SAVE PDF =============
      console.log('💾 Saving PDF...');
      const pdfBytes = await pdfDoc.save();
      
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const fileName = `Portfolio_Analysis_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      
      // Download the PDF
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Save report metadata to database
      console.log('📊 Saving report to database...');
      try {
        // Use any cast since table was just created and types.ts is read-only
        const { error: insertError } = await (supabase as any)
          .from('portfolio_analysis_reports')
          .insert({
            client_id: clientId,
            client_name: analysisData.clientName,
            health_score: analysisData.analysis?.executiveSummary?.healthScore || null,
            overall_health: analysisData.analysis?.executiveSummary?.overallHealth || null,
            portfolio_value: analysisData.portfolioMetrics?.totalValue || null,
            total_equity: analysisData.portfolioMetrics?.totalEquity || null,
            net_monthly_cashflow: analysisData.portfolioMetrics?.netMonthlyCashflow || null,
            total_properties: analysisData.portfolioMetrics?.totalProperties || null,
            average_lvr: analysisData.portfolioMetrics?.averageLVR || null,
            average_yield: analysisData.portfolioMetrics?.averageYield || null,
            report_data: analysisData as any,
            status: 'completed',
          });
        
        if (insertError) {
          console.error('Failed to save report metadata:', insertError);
        } else {
          console.log('✓ Report saved to database');
        }
      } catch (dbError) {
        console.error('Database save error:', dbError);
      }
      
      console.log('✅ PDF generation complete!');
      toast.success('PDF downloaded successfully');
      onComplete?.();
      
    } catch (error: any) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF: ' + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={generateAnalysis}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <TrendingUp className="h-4 w-4 mr-2" />
        )}
        {isGenerating ? 'Analyzing...' : 'Portfolio Analysis'}
      </Button>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Portfolio Performance Analysis</span>
              <Button 
                onClick={downloadPDF} 
                disabled={isDownloading}
                size="sm"
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download PDF
              </Button>
            </DialogTitle>
            <DialogDescription>
              Comprehensive analysis of {clientName}'s investment property portfolio
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-120px)]">
            {analysisData && (
              <div id="portfolio-analysis-content" className="p-6 bg-white space-y-6">
                {/* Header */}
                <div className="text-center border-b pb-4">
                  <h1 className="text-2xl font-bold text-primary">Portfolio Performance Analysis</h1>
                  <p className="text-lg text-muted-foreground">{analysisData.clientName}</p>
                  <p className="text-sm text-muted-foreground">
                    Generated: {new Date(analysisData.generatedAt).toLocaleDateString('en-AU', { 
                      day: 'numeric', month: 'long', year: 'numeric' 
                    })}
                  </p>
                </div>

                {/* Executive Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Executive Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Portfolio Health</p>
                        <p className={`text-2xl font-bold ${getHealthColor(analysisData.analysis.executiveSummary.overallHealth)}`}>
                          {analysisData.analysis.executiveSummary.overallHealth}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Health Score</p>
                        <p className="text-3xl font-bold text-primary">
                          {analysisData.analysis.executiveSummary.healthScore}/100
                        </p>
                      </div>
                    </div>
                    
                    <p className="text-sm">{analysisData.analysis.executiveSummary.primaryRecommendation}</p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-green-700 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" /> Key Strengths
                        </p>
                        <ul className="text-sm space-y-1 mt-1">
                          {analysisData.analysis.executiveSummary.keyStrengths.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4" /> Key Concerns
                        </p>
                        <ul className="text-sm space-y-1 mt-1">
                          {analysisData.analysis.executiveSummary.keyConcerns.map((c, i) => (
                            <li key={i}>• {c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Portfolio Metrics */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Portfolio Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Value</p>
                        <p className="text-xl font-bold">{formatCurrency(analysisData.portfolioMetrics.totalValue)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Equity</p>
                        <p className="text-xl font-bold text-green-600">{formatCurrency(analysisData.portfolioMetrics.totalEquity)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Average LVR</p>
                        <p className="text-xl font-bold">{analysisData.portfolioMetrics.averageLVR.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Properties</p>
                        <p className="text-xl font-bold">{analysisData.portfolioMetrics.totalProperties}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Monthly Cashflow</p>
                        <p className={`text-xl font-bold ${analysisData.portfolioMetrics.netMonthlyCashflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(analysisData.portfolioMetrics.netMonthlyCashflow)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Avg. Yield</p>
                        <p className="text-xl font-bold">{analysisData.portfolioMetrics.averageYield.toFixed(2)}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* SMSF Properties Summary - Only show if there are SMSF properties */}
                {(analysisData.portfolioMetrics.smsfCount > 0) && (
                  <Card className="border-amber-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Landmark className="h-5 w-5 text-amber-600" />
                        SMSF Properties Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4 text-center mb-4">
                        <div>
                          <p className="text-sm text-muted-foreground">SMSF Properties</p>
                          <p className="text-xl font-bold">{analysisData.portfolioMetrics.smsfCount}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">SMSF Total Value</p>
                          <p className="text-xl font-bold">{formatCurrency(analysisData.portfolioMetrics.smsfTotalValue || 0)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">SMSF Equity</p>
                          <p className="text-xl font-bold text-green-600">{formatCurrency(analysisData.portfolioMetrics.smsfTotalEquity || 0)}</p>
                        </div>
                      </div>
                      
                      <Separator className="my-3" />
                      
                      <div className="space-y-2">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <Shield className="h-4 w-4 text-amber-600" />
                          Compliance Overview
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-200">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <div>
                              <p className="text-xs text-muted-foreground">Compliant</p>
                              <p className="font-semibold text-green-700">{analysisData.portfolioMetrics.smsfCompliantCount || 0}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <div>
                              <p className="text-xs text-muted-foreground">Pending Audit</p>
                              <p className="font-semibold text-amber-700">{analysisData.portfolioMetrics.smsfPendingAuditCount || 0}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-200">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            <div>
                              <p className="text-xs text-muted-foreground">Non-Compliant</p>
                              <p className="font-semibold text-red-700">{analysisData.portfolioMetrics.smsfNonCompliantCount || 0}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Property Rankings */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Property Rankings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {analysisData.analysis.propertyRankings.map((prop) => (
                      <div key={prop.rank} className="border rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">#{prop.rank}</Badge>
                              <span className="font-medium text-sm">{prop.address}</span>
                            </div>
                            <Badge 
                              variant={prop.performanceRating === 'Star' ? 'default' : 'secondary'}
                              className="mt-1"
                            >
                              {prop.performanceRating}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">{prop.recommendation}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Risk Assessment */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Risk Assessment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm">Overall Risk Level:</span>
                      <Badge variant={getRiskBadgeVariant(analysisData.analysis.riskAssessment.overallRiskLevel)}>
                        {analysisData.analysis.riskAssessment.overallRiskLevel}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Market Risks</p>
                        <ul className="mt-1 space-y-1">
                          {analysisData.analysis.riskAssessment.marketRisks.map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Mitigation Strategies</p>
                        <ul className="mt-1 space-y-1">
                          {analysisData.analysis.riskAssessment.mitigationStrategies.map((s, i) => (
                            <li key={i}>• {s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Projections */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{analysisData.analysis.projections.years}-Year Projections</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Projected Value</p>
                        <p className="text-xl font-bold text-primary">
                          {formatCurrency(analysisData.analysis.projections.projectedPortfolioValue)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Projected Equity</p>
                        <p className="text-xl font-bold text-green-600">
                          {formatCurrency(analysisData.analysis.projections.projectedEquity)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Monthly Cashflow</p>
                        <p className="text-xl font-bold">
                          {formatCurrency(analysisData.analysis.projections.projectedMonthlyCashflow)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Strategic Recommendations */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Strategic Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="font-medium text-sm text-primary">Priority Actions</p>
                      <ul className="text-sm mt-1 space-y-1">
                        {analysisData.analysis.strategicRecommendations.priorityActions.map((a, i) => (
                          <li key={i}>• {a}</li>
                        ))}
                      </ul>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="font-medium">Short-Term (0-12m)</p>
                        <ul className="mt-1 space-y-1">
                          {analysisData.analysis.strategicRecommendations.shortTerm.slice(0, 3).map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium">Medium-Term (1-3y)</p>
                        <ul className="mt-1 space-y-1">
                          {analysisData.analysis.strategicRecommendations.mediumTerm.slice(0, 3).map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium">Long-Term (3-10y)</p>
                        <ul className="mt-1 space-y-1">
                          {analysisData.analysis.strategicRecommendations.longTerm.slice(0, 3).map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Footer */}
                <div className="text-center text-xs text-muted-foreground pt-4 border-t">
                  <p>This analysis is for informational purposes only. Please consult with qualified financial advisors.</p>
                  <p>Generated by NPC Property Analytics</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
