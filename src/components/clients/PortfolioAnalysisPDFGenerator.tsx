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

// Colors
const PRIMARY_COLOR = rgb(0.07, 0.46, 0.31); // Dark green
const SECONDARY_COLOR = rgb(0.2, 0.2, 0.2);
const MUTED_COLOR = rgb(0.5, 0.5, 0.5);
const SUCCESS_COLOR = rgb(0.13, 0.55, 0.13);
const DANGER_COLOR = rgb(0.86, 0.21, 0.27);
const WARNING_COLOR = rgb(0.85, 0.65, 0.13);

const formatCurrency = (value: number): string => {
  return '$' + value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const getHealthColor = (health: string): string => {
  switch (health?.toLowerCase()) {
    case 'excellent': return 'text-green-600';
    case 'good': return 'text-blue-600';
    case 'fair': return 'text-yellow-600';
    case 'poor': return 'text-red-600';
    default: return 'text-muted-foreground';
  }
};

const getRiskBadgeVariant = (risk: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (risk?.toLowerCase()) {
    case 'low': return 'default';
    case 'medium': return 'secondary';
    case 'high': return 'destructive';
    default: return 'outline';
  }
};

// Strip emojis and non-WinAnsi characters
const stripEmojis = (text: string): string => {
  return text
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
    .replace(/[^\x00-\xFF]/g, '');
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
        
        // Draw header row
        page.drawRectangle({
          x,
          y: currentY - rowHeight,
          width: tableWidth,
          height: rowHeight,
          color: rgb(0.93, 0.93, 0.93),
        });
        
        // Header text
        let cellX = x;
        for (let i = 0; i < headers.length; i++) {
          page.drawText(stripEmojis(headers[i]), {
            x: cellX + 5,
            y: currentY - 15,
            size: 9,
            font: helveticaBold,
            color: SECONDARY_COLOR,
          });
          cellX += columnWidths[i];
        }
        
        // Header borders
        page.drawLine({
          start: { x, y: currentY },
          end: { x: x + tableWidth, y: currentY },
          thickness: 1,
          color: rgb(0.7, 0.7, 0.7),
        });
        page.drawLine({
          start: { x, y: currentY - rowHeight },
          end: { x: x + tableWidth, y: currentY - rowHeight },
          thickness: 1,
          color: rgb(0.7, 0.7, 0.7),
        });
        
        currentY -= rowHeight;
        
        // Draw data rows
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex];
          
          // Check page break
          if (currentY - rowHeight < MARGIN_BOTTOM) {
            return { lastY: currentY, needsNewPage: true };
          }
          
          // Alternating row background
          if (rowIndex % 2 === 0) {
            page.drawRectangle({
              x,
              y: currentY - rowHeight,
              width: tableWidth,
              height: rowHeight,
              color: rgb(0.98, 0.98, 0.98),
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
        page.drawRectangle({
          x,
          y: y - 45,
          width,
          height: 50,
          color: rgb(0.97, 0.97, 0.97),
          borderColor: rgb(0.9, 0.9, 0.9),
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
      
      // ============= PAGE 1: COVER PAGE =============
      console.log('📝 Creating cover page...');
      const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      
      // Logo would be loaded from storage if available - for now, skip logo
      // Future enhancement: fetch logo from client_branding_profiles or global settings
      
      // Title
      const title = 'PORTFOLIO PERFORMANCE';
      const titleWidth = helveticaBold.widthOfTextAtSize(title, 28);
      coverPage.drawText(title, {
        x: (PAGE_WIDTH - titleWidth) / 2,
        y: PAGE_HEIGHT - 280,
        size: 28,
        font: helveticaBold,
        color: PRIMARY_COLOR,
      });
      
      const subtitle = 'ANALYSIS';
      const subtitleWidth = helveticaBold.widthOfTextAtSize(subtitle, 28);
      coverPage.drawText(subtitle, {
        x: (PAGE_WIDTH - subtitleWidth) / 2,
        y: PAGE_HEIGHT - 315,
        size: 28,
        font: helveticaBold,
        color: PRIMARY_COLOR,
      });
      
      // Client name
      const clientText = stripEmojis(analysisData.clientName);
      const clientWidth = helveticaFont.widthOfTextAtSize(clientText, 18);
      coverPage.drawText(clientText, {
        x: (PAGE_WIDTH - clientWidth) / 2,
        y: PAGE_HEIGHT - 380,
        size: 18,
        font: helveticaFont,
        color: SECONDARY_COLOR,
      });
      
      // Date
      const dateText = new Date(analysisData.generatedAt).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const dateWidth = helveticaFont.widthOfTextAtSize(dateText, 12);
      coverPage.drawText(dateText, {
        x: (PAGE_WIDTH - dateWidth) / 2,
        y: PAGE_HEIGHT - 410,
        size: 12,
        font: helveticaFont,
        color: MUTED_COLOR,
      });
      
      // Health score badge at bottom
      const healthScore = analysisData.analysis.executiveSummary.healthScore;
      const healthText = `Health Score: ${healthScore}/100`;
      const healthWidth = helveticaBold.widthOfTextAtSize(healthText, 16);
      
      coverPage.drawRectangle({
        x: (PAGE_WIDTH - healthWidth - 40) / 2,
        y: PAGE_HEIGHT - 520,
        width: healthWidth + 40,
        height: 40,
        color: PRIMARY_COLOR,
      });
      
      coverPage.drawText(healthText, {
        x: (PAGE_WIDTH - healthWidth) / 2,
        y: PAGE_HEIGHT - 506,
        size: 16,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
      
      console.log('✓ Cover page complete');
      
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
      page.drawText('Key Strengths:', {
        x: MARGIN_LEFT,
        y: yPos,
        size: 10,
        font: helveticaBold,
        color: SUCCESS_COLOR,
      });
      yPos -= 15;
      
      for (const strength of analysisData.analysis.executiveSummary.keyStrengths) {
        yPos = drawWrappedText(page, `• ${strength}`, MARGIN_LEFT + 10, yPos, CONTENT_WIDTH - 20, helveticaFont, 9, SECONDARY_COLOR);
      }
      
      yPos -= 15;
      
      // Key Concerns
      page.drawText('Key Concerns:', {
        x: MARGIN_LEFT,
        y: yPos,
        size: 10,
        font: helveticaBold,
        color: WARNING_COLOR,
      });
      yPos -= 15;
      
      for (const concern of analysisData.analysis.executiveSummary.keyConcerns) {
        yPos = drawWrappedText(page, `• ${concern}`, MARGIN_LEFT + 10, yPos, CONTENT_WIDTH - 20, helveticaFont, 9, SECONDARY_COLOR);
      }
      
      yPos -= 30;
      
      // ============= PORTFOLIO OVERVIEW SECTION =============
      yPos = drawSectionHeader(page, 'Portfolio Overview', yPos);
      
      const metrics = analysisData.portfolioMetrics;
      const kpiWidth = (CONTENT_WIDTH - 20) / 3;
      
      // Row 1: Total Value, Total Equity, Average LVR
      drawKPIBox(page, 'TOTAL VALUE', formatCurrency(metrics.totalValue), MARGIN_LEFT, yPos, kpiWidth);
      drawKPIBox(page, 'TOTAL EQUITY', formatCurrency(metrics.totalEquity), MARGIN_LEFT + kpiWidth + 10, yPos, kpiWidth, SUCCESS_COLOR);
      drawKPIBox(page, 'AVERAGE LVR', `${metrics.averageLVR.toFixed(1)}%`, MARGIN_LEFT + (kpiWidth + 10) * 2, yPos, kpiWidth);
      
      yPos -= 65;
      
      // Row 2: Properties, Monthly Cashflow, Avg Yield
      const cashflowColor = metrics.netMonthlyCashflow >= 0 ? SUCCESS_COLOR : DANGER_COLOR;
      drawKPIBox(page, 'PROPERTIES', metrics.totalProperties.toString(), MARGIN_LEFT, yPos, kpiWidth);
      drawKPIBox(page, 'MONTHLY CASHFLOW', formatCurrency(metrics.netMonthlyCashflow), MARGIN_LEFT + kpiWidth + 10, yPos, kpiWidth, cashflowColor);
      drawKPIBox(page, 'AVG. YIELD', `${metrics.averageYield.toFixed(2)}%`, MARGIN_LEFT + (kpiWidth + 10) * 2, yPos, kpiWidth);
      
      yPos -= 65;
      
      console.log('✓ Executive summary page complete');
      
      // ============= SAVE PDF =============
      console.log('💾 Saving PDF...');
      const pdfBytes = await pdfDoc.save();
      
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Portfolio_Analysis_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
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
