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

interface BorrowingCapacityAssessment {
  borrowingCapacity: number;
  monthlySurplus: number;
  serviceabilityBand: string;
  dtiRatio: number;
  stressTestedCapacity: number;
  assessmentRate: number;
  grossAnnualIncome: number;
  shadedAnnualIncome: number;
  livingExpenses: number;
  existingCommitments: number;
  recommendations: string[];
  warnings: string[];
  calculatedAt: string;
}

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
  borrowingCapacity: BorrowingCapacityAssessment | null;
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
// Standard A4 margins: 1 inch (72pt) on all sides for professional documents
const MARGIN_LEFT = 72;
const MARGIN_RIGHT = 72;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 72;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

// Section spacing constants for consistent layout
const SECTION_SPACING = 35;        // Space after major sections
const SUBSECTION_SPACING = 24;     // Space after subsections
const PARAGRAPH_SPACING = 18;      // Space between paragraphs
const LIST_ITEM_SPACING = 8;       // Extra space between list items
const BOX_PADDING = 10;            // Padding inside boxes

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
  const absValue = Math.abs(value);
  const formatted = absValue.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  // Format negative values as -$X,XXX instead of $-X,XXX
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
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
    // Decode HTML entities first
    .replace(/&#x26;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
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

// Strip markdown bold markers and return clean text
const stripMarkdownBold = (text: string): string => {
  if (!text) return '';
  return text.replace(/\*\*/g, '');
};

// Parse text into segments with bold/normal styling
interface TextSegment {
  text: string;
  isBold: boolean;
}

const parseMarkdownBold = (text: string): TextSegment[] => {
  if (!text) return [];
  const segments: TextSegment[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    // Add text before the bold part
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isBold: false });
    }
    // Add the bold part
    segments.push({ text: match[1], isBold: true });
    lastIndex = regex.lastIndex;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isBold: false });
  }
  
  return segments;
};

// Format property type for display (owner_occupied -> Owner Occupied)
const formatPropertyType = (type: string | null | undefined): string => {
  if (!type) return 'Property';
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

// Ensure percentage values include % symbol
const ensurePercentage = (value: string | null | undefined): string => {
  if (!value) return '0%';
  const cleaned = value.replace('%', '').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return '0%';
  return `${num.toFixed(1)}%`;
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
          includeOwnerOccupied: true // Default to include; can be parameterized later
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
      
      // Embed standard fonts
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const timesItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
      
      // Fetch and embed custom Google Fonts (Playfair Display Medium 500 & Cinzel Bold 700)
      console.log('📥 Fetching custom fonts...');
      
      let playfairFont = helveticaFont; // Fallback to Helvetica
      let cinzelFont = helveticaBold; // Fallback to Helvetica Bold
      
      try {
        // Playfair Display Medium 500 (not italic) from Google Fonts CSS API
        const playfairCssUrl = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500&display=swap';
        const playfairCssResponse = await fetch(playfairCssUrl);
        const playfairCss = await playfairCssResponse.text();
        const playfairUrlMatch = playfairCss.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2?)\)/);
        
        if (playfairUrlMatch) {
          const playfairFontResponse = await fetch(playfairUrlMatch[1]);
          const playfairFontBytes = await playfairFontResponse.arrayBuffer();
          playfairFont = await pdfDoc.embedFont(playfairFontBytes);
          console.log('✓ Playfair Display Medium 500 font embedded');
        }
      } catch (fontError) {
        console.warn('Could not load Playfair Display Medium, using fallback:', fontError);
      }
      
      try {
        // Cinzel Bold 700 from Google Fonts CSS API
        const cinzelCssUrl = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap';
        const cinzelCssResponse = await fetch(cinzelCssUrl);
        const cinzelCss = await cinzelCssResponse.text();
        const cinzelUrlMatch = cinzelCss.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2?)\)/);
        
        if (cinzelUrlMatch) {
          const cinzelFontResponse = await fetch(cinzelUrlMatch[1]);
          const cinzelFontBytes = await cinzelFontResponse.arrayBuffer();
          cinzelFont = await pdfDoc.embedFont(cinzelFontBytes);
          console.log('✓ Cinzel Bold 700 font embedded');
        }
      } catch (fontError) {
        console.warn('Could not load Cinzel Bold, using fallback:', fontError);
      }
      
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
        const cleanText = stripEmojis(stripMarkdownBold(text));
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
      
      // Draw wrapped text with markdown bold support
      const drawWrappedTextWithBold = (
        page: PDFPage,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        regularFont: PDFFont,
        boldFont: PDFFont,
        size: number,
        color = SECONDARY_COLOR,
        lineHeight = 1.5
      ): number => {
        const segments = parseMarkdownBold(stripEmojis(text));
        let currentX = x;
        let currentY = y;
        let lineWords: { word: string; isBold: boolean }[] = [];
        
        // Flatten segments into individual words with their styles
        const allWords: { word: string; isBold: boolean }[] = [];
        for (const segment of segments) {
          const words = segment.text.split(' ').filter(w => w.length > 0);
          for (const word of words) {
            allWords.push({ word, isBold: segment.isBold });
          }
        }
        
        // Process words and wrap lines
        let currentLineWidth = 0;
        
        for (const { word, isBold } of allWords) {
          const font = isBold ? boldFont : regularFont;
          const wordWidth = font.widthOfTextAtSize(word + ' ', size);
          
          if (currentLineWidth + wordWidth > maxWidth && lineWords.length > 0) {
            // Draw current line
            let drawX = x;
            for (const { word: w, isBold: bold } of lineWords) {
              const f = bold ? boldFont : regularFont;
              page.drawText(w, { x: drawX, y: currentY, size, font: f, color });
              drawX += f.widthOfTextAtSize(w + ' ', size);
            }
            currentY -= size * lineHeight;
            lineWords = [];
            currentLineWidth = 0;
          }
          
          lineWords.push({ word, isBold });
          currentLineWidth += wordWidth;
        }
        
        // Draw remaining words
        if (lineWords.length > 0) {
          let drawX = x;
          for (const { word: w, isBold: bold } of lineWords) {
            const f = bold ? boldFont : regularFont;
            page.drawText(w, { x: drawX, y: currentY, size, font: f, color });
            drawX += f.widthOfTextAtSize(w + ' ', size);
          }
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
          
          // Cell text - dynamic truncation based on column width
          cellX = x;
          for (let i = 0; i < row.length; i++) {
            const cellText = stripEmojis(row[i] || '');
            // Calculate max characters based on column width (approx 5pt per char at size 8)
            const maxChars = Math.floor((columnWidths[i] - 10) / 4.5);
            const truncatedText = cellText.length > maxChars ? cellText.substring(0, maxChars - 3) + '...' : cellText;
            page.drawText(truncatedText, {
              x: cellX + 6,
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
      
      // Draw section header with improved spacing
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
          start: { x: MARGIN_LEFT, y: y - 8 },
          end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: y - 8 },
          thickness: 1.5,
          color: NPC_GOLD_LIGHT,
        });
        
        return y - SECTION_SPACING;
      };
      
      // Draw subsection header (smaller) with improved spacing
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
        return y - SUBSECTION_SPACING;
      };
      
      // Draw KPI box with improved padding
      const drawKPIBox = (
        page: PDFPage,
        label: string,
        value: string,
        x: number,
        y: number,
        width: number,
        valueColor = SECONDARY_COLOR
      ): void => {
        const boxHeight = 55;
        // KPI box with gold-tinted background and gold border
        page.drawRectangle({
          x,
          y: y - boxHeight,
          width,
          height: boxHeight,
          color: rgb(0.99, 0.98, 0.93), // Gold tint #fdf9ed
          borderColor: NPC_GOLD_LIGHT,
          borderWidth: 1,
        });
        
        page.drawText(stripEmojis(label), {
          x: x + BOX_PADDING,
          y: y - 18,
          size: 8,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        page.drawText(stripEmojis(value), {
          x: x + BOX_PADDING,
          y: y - 40,
          size: 14,
          font: helveticaBold,
          color: valueColor,
        });
      };
      
      // Draw bullet list with markdown bold support
      const drawBulletList = (
        page: PDFPage,
        items: string[],
        x: number,
        y: number,
        maxWidth: number,
        size: number = 9,
        bulletIndent: number = 15
      ): number => {
        let currentY = y;
        const bulletChar = '•';
        
        for (const item of items) {
          // Draw bullet point
          page.drawText(bulletChar, {
            x,
            y: currentY,
            size,
            font: helveticaBold,
            color: PRIMARY_COLOR,
          });
          
          // Draw wrapped text with bold support after bullet
          currentY = drawWrappedTextWithBold(
            page, 
            item, 
            x + bulletIndent, 
            currentY, 
            maxWidth - bulletIndent, 
            helveticaFont, 
            helveticaBold,
            size, 
            SECONDARY_COLOR,
            1.6
          );
          currentY -= LIST_ITEM_SPACING + 4;
        }
        return currentY;
      };
      
      // Draw numbered list with improved formatting
      const drawNumberedList = (
        page: PDFPage,
        items: string[],
        x: number,
        y: number,
        maxWidth: number,
        size: number = 9,
        numberIndent: number = 18
      ): number => {
        let currentY = y;
        
        for (let i = 0; i < items.length; i++) {
          const numberText = `${i + 1}.`;
          
          // Draw number
          page.drawText(numberText, {
            x,
            y: currentY,
            size,
            font: helveticaBold,
            color: PRIMARY_COLOR,
          });
          
          // Draw wrapped text after number with proper indent
          currentY = drawWrappedText(
            page, 
            stripEmojis(items[i]), 
            x + numberIndent, 
            currentY, 
            maxWidth - numberIndent, 
            helveticaFont, 
            size, 
            SECONDARY_COLOR
          );
          currentY -= LIST_ITEM_SPACING;
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
      
      // ============= NPC BRANDED COVER PAGE (Using Image Template) =============
      console.log('📝 Creating NPC branded cover page from image template...');
      const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      
      // Load and embed the cover page image
      try {
        const coverImageResponse = await fetch('/templates/npc-portfolio-cover.jpg');
        const coverImageBytes = await coverImageResponse.arrayBuffer();
        const coverImage = await pdfDoc.embedJpg(coverImageBytes);
        
        // Draw the cover image to fill the entire page
        coverPage.drawImage(coverImage, {
          x: 0,
          y: 0,
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
        });
        
        console.log('✓ Cover page image embedded successfully');
      } catch (imageError) {
        console.error('Failed to load cover image, using fallback:', imageError);
        // Fallback: Draw a simple black background if image fails
        coverPage.drawRectangle({
          x: 0,
          y: 0,
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          color: NPC_BLACK,
        });
      }
      
      // ============= OVERLAY DYNAMIC TEXT ON COVER =============
      // Report Title - positioned in the center-lower area
      const reportTitleY = PAGE_HEIGHT * 0.35;
      const reportTitle = 'Portfolio Performance Report';
      const reportTitleWidth = playfairFont.widthOfTextAtSize(reportTitle, 36);
      coverPage.drawText(reportTitle, {
        x: (PAGE_WIDTH - reportTitleWidth) / 2,
        y: reportTitleY,
        size: 36,
        font: playfairFont,
        color: NPC_WHITE,
      });
      
      // Client Name - below the report title
      const clientNameY = reportTitleY - 50;
      const clientText = stripEmojis(analysisData.clientName).toUpperCase();
      const clientNameWidth = cinzelFont.widthOfTextAtSize(clientText, 16);
      coverPage.drawText(clientText, {
        x: (PAGE_WIDTH - clientNameWidth) / 2,
        y: clientNameY,
        size: 16,
        font: cinzelFont,
        color: NPC_GOLD,
      });
      
      // Date - below the client name
      const dateY = clientNameY - 45;
      const dateText = new Date(analysisData.generatedAt).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const dateWidth = helveticaFont.widthOfTextAtSize(dateText, 14);
      coverPage.drawText(dateText, {
        x: (PAGE_WIDTH - dateWidth) / 2,
        y: dateY,
        size: 14,
        font: helveticaFont,
        color: NPC_WHITE,
      });
      
      console.log('✓ NPC branded cover page complete (image template)');
      
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
      const aboutBoxPadding = 14;
      const aboutBoxHeight = 75;
      
      tocPage.drawRectangle({
        x: MARGIN_LEFT,
        y: noteY - aboutBoxHeight,
        width: CONTENT_WIDTH,
        height: aboutBoxHeight,
        color: rgb(0.99, 0.98, 0.93), // Gold tint
        borderColor: NPC_GOLD_LIGHT,
        borderWidth: 1,
      });
      
      tocPage.drawText('About This Report', {
        x: MARGIN_LEFT + aboutBoxPadding,
        y: noteY - 20,
        size: 10,
        font: helveticaBold,
        color: PRIMARY_COLOR,
      });
      
      const aboutText = `This comprehensive portfolio analysis covers ${metrics.totalProperties} properties with a combined value of ${formatCurrency(metrics.totalValue)}. The analysis includes performance rankings, financial health assessment, risk evaluation, and strategic recommendations.`;
      drawWrappedText(tocPage, aboutText, MARGIN_LEFT + aboutBoxPadding, noteY - 38, CONTENT_WIDTH - (aboutBoxPadding * 2), helveticaFont, 9, MUTED_COLOR, 1.6);
      
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
      
      yPos -= SUBSECTION_SPACING;
      
      // Key Strengths - use improved bullet list
      const keyStrengths = safeArray(analysisData.analysis?.executiveSummary?.keyStrengths);
      if (keyStrengths.length > 0) {
        page.drawText('Key Strengths:', {
          x: MARGIN_LEFT,
          y: yPos,
          size: 10,
          font: helveticaBold,
          color: SUCCESS_COLOR,
        });
        yPos -= PARAGRAPH_SPACING;
        
        yPos = drawBulletList(page, keyStrengths, MARGIN_LEFT + 10, yPos, CONTENT_WIDTH - 20, 9);
        yPos -= PARAGRAPH_SPACING;
      }
      
      // Key Concerns - use improved bullet list
      const keyConcerns = safeArray(analysisData.analysis?.executiveSummary?.keyConcerns);
      if (keyConcerns.length > 0) {
        page.drawText('Key Concerns:', {
          x: MARGIN_LEFT,
          y: yPos,
          size: 10,
          font: helveticaBold,
          color: WARNING_COLOR,
        });
        yPos -= PARAGRAPH_SPACING;
        
        yPos = drawBulletList(page, keyConcerns, MARGIN_LEFT + 10, yPos, CONTENT_WIDTH - 20, 9);
        yPos -= PARAGRAPH_SPACING;
      }
      
      yPos -= SECTION_SPACING;
      
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
      
      yPos -= PARAGRAPH_SPACING;
      
      // Asset Allocation
      yPos = drawSubsectionHeader(page, 'Asset Allocation', yPos);
      yPos = drawFormattedText(page, safeString(composition?.assetAllocation, 'No asset allocation data available.'), MARGIN_LEFT, yPos, CONTENT_WIDTH, 9, 14);
      yPos -= PARAGRAPH_SPACING;
      
      // Property Mix Assessment
      yPos = drawSubsectionHeader(page, 'Property Mix Assessment', yPos);
      yPos = drawFormattedText(page, safeString(composition?.propertyMixAssessment, 'No property mix data available.'), MARGIN_LEFT, yPos, CONTENT_WIDTH, 9, 14);
      yPos -= PARAGRAPH_SPACING;
      
      // Property Type Breakdown Visual
      yPos = drawSubsectionHeader(page, 'Portfolio Breakdown by Type', yPos);
      
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
        yPos = drawBulletList(page, compositionRecs, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= PARAGRAPH_SPACING;
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
        
        // Property type badge - format properly (owner_occupied -> Owner Occupied)
        const formattedType = formatPropertyType(prop.propertyType);
        const typeWidth = helveticaFont.widthOfTextAtSize(formattedType, 8);
        page.drawText(stripEmojis(formattedType), {
          x: PAGE_WIDTH - MARGIN_RIGHT - typeWidth - 10,
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
        const lvrValue = parseFloat(safeString(prop.lvr, '0').replace('%', '')) || 0;
        const lvrColor = lvrValue <= 60 ? SUCCESS_COLOR : lvrValue <= 80 ? WARNING_COLOR : DANGER_COLOR;
        page.drawText(ensurePercentage(prop.lvr), {
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
        page.drawText(ensurePercentage(prop.grossYield), {
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
      
      const statusBoxWidth = (CONTENT_WIDTH - 36) / 4;
      const statusBoxHeight = 58;
      let statusX = MARGIN_LEFT;
      
      for (const item of statusItems) {
        const itemVal = item.value.toLowerCase();
        const statusColor = itemVal.includes('strong') || itemVal.includes('healthy') || itemVal === 'low' || itemVal.includes('positive')
          ? SUCCESS_COLOR
          : itemVal.includes('moderate') || itemVal === 'medium' || itemVal.includes('comfortable')
          ? WARNING_COLOR
          : DANGER_COLOR;
        
        page.drawRectangle({
          x: statusX,
          y: yPos - statusBoxHeight,
          width: statusBoxWidth,
          height: statusBoxHeight,
          color: rgb(0.97, 0.97, 0.97),
          borderColor: statusColor,
          borderWidth: 2,
        });
        
        page.drawText(stripEmojis(item.label), {
          x: statusX + BOX_PADDING,
          y: yPos - 18,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        // Allow longer values with better truncation
        const truncatedValue = item.value.length > 14 ? item.value.substring(0, 12) + '..' : item.value;
        page.drawText(stripEmojis(truncatedValue), {
          x: statusX + BOX_PADDING,
          y: yPos - 42,
          size: 10,
          font: helveticaBold,
          color: statusColor,
        });
        
        statusX += statusBoxWidth + 12;
      }
      
      yPos -= 80;
      
      // Detailed analysis
      yPos = drawSubsectionHeader(page, 'Detailed Analysis', yPos);
      yPos = drawFormattedText(page, safeString(financialHealth?.analysis, 'No detailed analysis available.'), MARGIN_LEFT, yPos, CONTENT_WIDTH, 9, 16);
      yPos -= PARAGRAPH_SPACING;
      
      console.log('✓ Financial health page complete');
      
      // ============= PAGE: BORROWING CAPACITY ASSESSMENT =============
      // Only include if borrowing capacity data exists
      if (analysisData.borrowingCapacity) {
        console.log('📝 Creating borrowing capacity page...');
        page = addContentPage();
        yPos = PAGE_HEIGHT - MARGIN_TOP;
        
        // Section header with gold accent bar
        page.drawRectangle({
          x: MARGIN_LEFT,
          y: yPos - 5,
          width: 4,
          height: 18,
          color: PRIMARY_COLOR,
        });
        
        page.drawText('Borrowing Capacity Assessment', {
          x: MARGIN_LEFT + 12,
          y: yPos,
          size: 14,
          font: helveticaBold,
          color: SECONDARY_COLOR,
        });
        
        yPos -= 45;
        
        const bcData = analysisData.borrowingCapacity;
        const bcBoxWidth = (CONTENT_WIDTH - 20) / 3;
        const bcBoxHeight = 55;
        const bcBoxPadding = 8;
        
        // Box 1: Borrowing Capacity
        page.drawRectangle({
          x: MARGIN_LEFT,
          y: yPos - bcBoxHeight,
          width: bcBoxWidth,
          height: bcBoxHeight,
          color: rgb(0.97, 0.97, 0.97),
          borderColor: rgb(0.9, 0.9, 0.9),
          borderWidth: 1,
        });
        
        page.drawText('BORROWING CAPACITY', {
          x: MARGIN_LEFT + bcBoxPadding,
          y: yPos - 16,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        page.drawText(formatCurrency(bcData.borrowingCapacity), {
          x: MARGIN_LEFT + bcBoxPadding,
          y: yPos - 38,
          size: 16,
          font: helveticaBold,
          color: SECONDARY_COLOR,
        });
        
        // Box 2: Monthly Surplus
        const bc2X = MARGIN_LEFT + bcBoxWidth + 10;
        const surplusColor = bcData.monthlySurplus >= 0 ? SUCCESS_COLOR : DANGER_COLOR;
        
        page.drawRectangle({
          x: bc2X,
          y: yPos - bcBoxHeight,
          width: bcBoxWidth,
          height: bcBoxHeight,
          color: rgb(0.97, 0.97, 0.97),
          borderColor: rgb(0.9, 0.9, 0.9),
          borderWidth: 1,
        });
        
        page.drawText('MONTHLY SURPLUS', {
          x: bc2X + bcBoxPadding,
          y: yPos - 16,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        page.drawText(formatCurrency(bcData.monthlySurplus), {
          x: bc2X + bcBoxPadding,
          y: yPos - 38,
          size: 16,
          font: helveticaBold,
          color: surplusColor,
        });
        
        // Box 3: Serviceability Band
        const bc3X = MARGIN_LEFT + (bcBoxWidth + 10) * 2;
        const bandLabel = bcData.serviceabilityBand === 'green' ? 'STRONG' :
                         bcData.serviceabilityBand === 'amber' ? 'MODERATE' : 'LIMITED';
        const bandColor = bcData.serviceabilityBand === 'green' ? SUCCESS_COLOR :
                         bcData.serviceabilityBand === 'amber' ? WARNING_COLOR : DANGER_COLOR;
        
        page.drawRectangle({
          x: bc3X,
          y: yPos - bcBoxHeight,
          width: bcBoxWidth,
          height: bcBoxHeight,
          color: rgb(0.97, 0.97, 0.97),
          borderColor: rgb(0.9, 0.9, 0.9),
          borderWidth: 1,
        });
        
        page.drawText('SERVICEABILITY', {
          x: bc3X + bcBoxPadding,
          y: yPos - 16,
          size: 7,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        
        // Draw colored badge
        const badgeWidth = helveticaBold.widthOfTextAtSize(bandLabel, 10) + 16;
        page.drawRectangle({
          x: bc3X + bcBoxPadding,
          y: yPos - 45,
          width: badgeWidth,
          height: 20,
          color: bandColor,
        });
        
        page.drawText(bandLabel, {
          x: bc3X + bcBoxPadding + 8,
          y: yPos - 39,
          size: 10,
          font: helveticaBold,
          color: rgb(1, 1, 1),
        });
        
        yPos -= bcBoxHeight + 25;
        
        // Secondary metrics row
        const bcColWidth = CONTENT_WIDTH / 3;
        const dtiColor = bcData.dtiRatio < 6 ? SUCCESS_COLOR : bcData.dtiRatio < 8 ? WARNING_COLOR : DANGER_COLOR;
        
        page.drawText('DTI Ratio:', {
          x: MARGIN_LEFT,
          y: yPos,
          size: 9,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        page.drawText(`${bcData.dtiRatio.toFixed(1)}x`, {
          x: MARGIN_LEFT + 55,
          y: yPos,
          size: 9,
          font: helveticaBold,
          color: dtiColor,
        });
        
        page.drawText('Stress Tested:', {
          x: MARGIN_LEFT + bcColWidth,
          y: yPos,
          size: 9,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        page.drawText(formatCurrency(bcData.stressTestedCapacity), {
          x: MARGIN_LEFT + bcColWidth + 70,
          y: yPos,
          size: 9,
          font: helveticaBold,
          color: SECONDARY_COLOR,
        });
        
        page.drawText('Assessment Rate:', {
          x: MARGIN_LEFT + bcColWidth * 2,
          y: yPos,
          size: 9,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        page.drawText(`${bcData.assessmentRate.toFixed(2)}%`, {
          x: MARGIN_LEFT + bcColWidth * 2 + 85,
          y: yPos,
          size: 9,
          font: helveticaBold,
          color: SECONDARY_COLOR,
        });
        
        yPos -= 35;
        
        // Income breakdown row
        page.drawText('Gross Income:', {
          x: MARGIN_LEFT,
          y: yPos,
          size: 9,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        page.drawText(formatCurrency(bcData.grossAnnualIncome) + '/yr', {
          x: MARGIN_LEFT + 72,
          y: yPos,
          size: 9,
          font: helveticaBold,
          color: SECONDARY_COLOR,
        });
        
        page.drawText('Shaded Income:', {
          x: MARGIN_LEFT + bcColWidth,
          y: yPos,
          size: 9,
          font: helveticaFont,
          color: MUTED_COLOR,
        });
        page.drawText(formatCurrency(bcData.shadedAnnualIncome) + '/yr', {
          x: MARGIN_LEFT + bcColWidth + 80,
          y: yPos,
          size: 9,
          font: helveticaBold,
          color: SECONDARY_COLOR,
        });
        
        yPos -= 35;
        
        // Recommendations
        const bcRecs = safeArray(bcData.recommendations);
        if (bcRecs.length > 0) {
          page.drawText('Recommendations:', {
            x: MARGIN_LEFT,
            y: yPos,
            size: 10,
            font: helveticaBold,
            color: SECONDARY_COLOR,
          });
          yPos -= 18;
          
          for (const rec of bcRecs.slice(0, 4)) {
            page.drawText('•', {
              x: MARGIN_LEFT,
              y: yPos,
              size: 9,
              font: helveticaFont,
              color: SUCCESS_COLOR,
            });
            const displayText = stripEmojis(rec.length > 85 ? rec.slice(0, 82) + '...' : rec);
            page.drawText(displayText, {
              x: MARGIN_LEFT + 12,
              y: yPos,
              size: 9,
              font: helveticaFont,
              color: rgb(0.2, 0.2, 0.2),
            });
            yPos -= 16;
          }
          yPos -= 10;
        }
        
        // Warnings
        const bcWarnings = safeArray(bcData.warnings);
        if (bcWarnings.length > 0) {
          page.drawText('Warnings:', {
            x: MARGIN_LEFT,
            y: yPos,
            size: 10,
            font: helveticaBold,
            color: DANGER_COLOR,
          });
          yPos -= 18;
          
          for (const warning of bcWarnings.slice(0, 3)) {
            page.drawText('!', {
              x: MARGIN_LEFT,
              y: yPos,
              size: 9,
              font: helveticaBold,
              color: WARNING_COLOR,
            });
            const displayText = stripEmojis(warning.length > 85 ? warning.slice(0, 82) + '...' : warning);
            page.drawText(displayText, {
              x: MARGIN_LEFT + 12,
              y: yPos,
              size: 9,
              font: helveticaFont,
              color: rgb(0.3, 0.2, 0.1),
            });
            yPos -= 16;
          }
        }
        
        console.log('✓ Borrowing capacity page complete');
      }
      
      // ============= PAGE 6: RISK ASSESSMENT =============
      console.log('📝 Creating risk assessment page...');
      
      if (needsNewPage(yPos, 200)) {
        page = addContentPage();
        yPos = PAGE_HEIGHT - MARGIN_TOP;
      } else {
        yPos -= SUBSECTION_SPACING;
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
      
      yPos -= 40;
      
      // Risk categories table - wider Assessment column to prevent truncation
      const riskCategories = [
        ['Risk Category', 'Assessment'],
        ['Concentration Risk', safeString(risk?.concentrationRisk, 'N/A')],
        ['Interest Rate Sensitivity', safeString(risk?.interestRateSensitivity, 'N/A')],
        ['Vacancy Risk', safeString(risk?.vacancyRisk, 'N/A')],
      ];
      
      const { lastY: riskTableLastY } = drawTable(page, riskCategories[0], riskCategories.slice(1), MARGIN_LEFT, yPos, [CONTENT_WIDTH * 0.35, CONTENT_WIDTH * 0.65]);
      yPos = riskTableLastY - SUBSECTION_SPACING;
      
      // Market risks
      const marketRisks = safeArray(risk?.marketRisks);
      if (marketRisks.length > 0) {
        yPos = drawSubsectionHeader(page, 'Market Risks', yPos, DANGER_COLOR);
        yPos = drawBulletList(page, marketRisks, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= SUBSECTION_SPACING;
      }
      
      // Mitigation strategies
      const mitigationStrategies = safeArray(risk?.mitigationStrategies);
      if (mitigationStrategies.length > 0) {
        yPos = drawSubsectionHeader(page, 'Mitigation Strategies', yPos, SUCCESS_COLOR);
        yPos = drawBulletList(page, mitigationStrategies, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= SUBSECTION_SPACING;
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
        yPos = drawBulletList(page, equityReleaseOptions, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= PARAGRAPH_SPACING;
      }
      
      // Refinancing Opportunities
      const refinancingOpportunities = safeArray(growth?.refinancingOpportunities);
      if (refinancingOpportunities.length > 0) {
        yPos = drawSubsectionHeader(page, 'Refinancing Opportunities', yPos);
        yPos = drawBulletList(page, refinancingOpportunities, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= PARAGRAPH_SPACING;
      }
      
      // Next Purchase Recommendations
      const nextPurchaseRecs = safeArray(growth?.nextPurchaseRecommendations);
      if (nextPurchaseRecs.length > 0) {
        yPos = drawSubsectionHeader(page, 'Next Purchase Recommendations', yPos, PRIMARY_COLOR);
        yPos = drawBulletList(page, nextPurchaseRecs, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= PARAGRAPH_SPACING;
      }
      
      // Optimization Strategies
      const optimizationStrategies = safeArray(growth?.optimizationStrategies);
      if (optimizationStrategies.length > 0) {
        yPos = drawSubsectionHeader(page, 'Portfolio Optimization Strategies', yPos);
        yPos = drawBulletList(page, optimizationStrategies, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= PARAGRAPH_SPACING;
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
      
      yPos -= 85;
      
      // Assumptions
      const assumptions = safeArray(projections?.assumptions);
      if (assumptions.length > 0) {
        yPos = drawSubsectionHeader(page, 'Key Assumptions', yPos);
        yPos = drawBulletList(page, assumptions, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= SUBSECTION_SPACING;
      }
      
      console.log('✓ Projections page complete');
      
      // ============= PAGE 9: STRATEGIC RECOMMENDATIONS =============
      console.log('📝 Creating strategic recommendations page...');
      page = addContentPage();
      yPos = PAGE_HEIGHT - MARGIN_TOP;
      
      yPos = drawSectionHeader(page, 'Strategic Recommendations', yPos);
      
      const recommendations = analysisData.analysis?.strategicRecommendations;
      
      // Priority Actions (highlighted) - improved spacing and margins
      const priorityActions = safeArray(recommendations?.priorityActions);
      if (priorityActions.length > 0) {
        const actionItemHeight = 28;
        const boxPadding = 18;
        const headerHeight = 32;
        const boxHeight = priorityActions.length * actionItemHeight + headerHeight + boxPadding * 2;
        
        page.drawRectangle({
          x: MARGIN_LEFT,
          y: yPos - boxHeight,
          width: CONTENT_WIDTH,
          height: boxHeight,
          color: rgb(0.95, 0.97, 0.95),
          borderColor: SUCCESS_COLOR,
          borderWidth: 1.5,
        });
        
        page.drawText('PRIORITY ACTIONS', {
          x: MARGIN_LEFT + boxPadding,
          y: yPos - headerHeight + 6,
          size: 11,
          font: helveticaBold,
          color: SUCCESS_COLOR,
        });
        
        let actionY = yPos - headerHeight - boxPadding + 2;
        for (let i = 0; i < priorityActions.length; i++) {
          page.drawText(`${i + 1}.`, {
            x: MARGIN_LEFT + boxPadding,
            y: actionY,
            size: 9,
            font: helveticaBold,
            color: PRIMARY_COLOR,
          });
          drawWrappedText(page, safeString(priorityActions[i], 'N/A'), MARGIN_LEFT + boxPadding + 18, actionY, CONTENT_WIDTH - boxPadding * 2 - 24, helveticaFont, 9, SECONDARY_COLOR, 1.5);
          actionY -= actionItemHeight;
        }
        yPos -= boxHeight + SUBSECTION_SPACING;
      }
      
      // Short-Term (0-12 months)
      const shortTerm = safeArray(recommendations?.shortTerm);
      if (shortTerm.length > 0) {
        yPos = drawSubsectionHeader(page, 'Short-Term (0-12 months)', yPos);
        yPos = drawBulletList(page, shortTerm, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= SUBSECTION_SPACING;
      }
      
      // Medium-Term (1-3 years)
      const mediumTerm = safeArray(recommendations?.mediumTerm);
      if (mediumTerm.length > 0) {
        if (needsNewPage(yPos, 100)) {
          page = addContentPage();
          yPos = PAGE_HEIGHT - MARGIN_TOP;
        }
        yPos = drawSubsectionHeader(page, 'Medium-Term (1-3 years)', yPos);
        yPos = drawBulletList(page, mediumTerm, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= SUBSECTION_SPACING;
      }
      
      // Long-Term (3+ years)
      const longTerm = safeArray(recommendations?.longTerm);
      if (longTerm.length > 0) {
        if (needsNewPage(yPos, 100)) {
          page = addContentPage();
          yPos = PAGE_HEIGHT - MARGIN_TOP;
        }
        yPos = drawSubsectionHeader(page, 'Long-Term (3+ years)', yPos);
        yPos = drawBulletList(page, longTerm, MARGIN_LEFT, yPos, CONTENT_WIDTH, 9);
        yPos -= SUBSECTION_SPACING;
      }
      
      console.log('✓ Strategic recommendations page complete');
      
      // ============= PAGE 10: PROPERTY DETAILS TABLE =============
      console.log('📝 Creating property details page...');
      page = addContentPage();
      yPos = PAGE_HEIGHT - MARGIN_TOP;
      
      yPos = drawSectionHeader(page, 'Property Portfolio Details', yPos);
      
      // Build property table - adjusted column widths for new margins
      const propHeaders = ['#', 'Address', 'Type', 'Value', 'Equity', 'LVR', 'Yield'];
      const propColumnWidths = [22, 140, 55, 65, 65, 45, 50];
      
      const propRows = analysisData.propertyAnalyses.map(prop => [
        prop.propertyNumber.toString(),
        prop.address.substring(0, 30),
        formatPropertyType(prop.propertyType),
        formatCurrency(prop.value),
        formatCurrency(prop.equity),
        ensurePercentage(prop.lvr),
        ensurePercentage(prop.grossYield),
      ]);
      
      let tableResult = drawTable(page, propHeaders, propRows, MARGIN_LEFT, yPos, propColumnWidths, 22);
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
      
      // ============= NPC BRANDED DISCLAIMER & CONTACT PAGE (Exact Template Match) =============
      console.log('📝 Creating NPC branded disclaimer page (exact template match)...');
      const disclaimerPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      
      // Full dark background (slightly lighter than pure black for the template look)
      const bgColor = rgb(0.08, 0.08, 0.08);
      disclaimerPage.drawRectangle({
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        color: bgColor,
      });
      
      // "NAIDU PROPERTY" - large gold text, left-aligned
      disclaimerPage.drawText('NAIDU PROPERTY', {
        x: MARGIN_LEFT,
        y: PAGE_HEIGHT - 80,
        size: 32,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      // "CONSULTING SERVICES" - smaller gold text below
      disclaimerPage.drawText('CONSULTING SERVICES', {
        x: MARGIN_LEFT,
        y: PAGE_HEIGHT - 115,
        size: 18,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      // "CONTACT US" section header
      disclaimerPage.drawText('CONTACT US', {
        x: MARGIN_LEFT,
        y: PAGE_HEIGHT - 190,
        size: 16,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      
      // Contact details with labels in table format
      const labelX = MARGIN_LEFT;
      const valueX = MARGIN_LEFT + 90;
      let contactY = PAGE_HEIGHT - 240;
      const contactLineHeight = 28;
      
      // Website
      disclaimerPage.drawText('WEBSITE:', {
        x: labelX,
        y: contactY,
        size: 10,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      disclaimerPage.drawText('npcservices.com.au', {
        x: valueX,
        y: contactY,
        size: 10,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      contactY -= contactLineHeight;
      
      // Email
      disclaimerPage.drawText('EMAIL:', {
        x: labelX,
        y: contactY,
        size: 10,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      disclaimerPage.drawText('admin@npcservices.com.au', {
        x: valueX,
        y: contactY,
        size: 10,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      contactY -= contactLineHeight;
      
      // Phone
      disclaimerPage.drawText('PHONE:', {
        x: labelX,
        y: contactY,
        size: 10,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      disclaimerPage.drawText('(02) 8609 3299', {
        x: valueX,
        y: contactY,
        size: 10,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      contactY -= contactLineHeight;
      
      // Address
      disclaimerPage.drawText('ADDRESS:', {
        x: labelX,
        y: contactY,
        size: 10,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      disclaimerPage.drawText('Level 5 Nexus Norwest, 4 Columbia Ct, Norwest NSW 2153', {
        x: valueX,
        y: contactY,
        size: 10,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      contactY -= contactLineHeight;
      
      // ABN
      disclaimerPage.drawText('ABN:', {
        x: labelX,
        y: contactY,
        size: 10,
        font: helveticaBold,
        color: NPC_GOLD,
      });
      disclaimerPage.drawText('50 684 555 771', {
        x: valueX,
        y: contactY,
        size: 10,
        font: helveticaFont,
        color: NPC_GOLD,
      });
      
      // Disclaimer text at bottom - gray/muted color for subtlety
      const disclaimerFullText = 'As a Professional Property Consultant & Buyers Agent, we provide information and advice based on our expertise and experience in the real estate market. Please be aware that the advice and insights offered are for general informational purposes only and should not be considered financial advice. While we strive to ensure the accuracy and relevance of the information provided, real estate markets are dynamic and subject to change and cannot guarantee the future performance or outcomes of any property investment. It is important to understand that real estate investments carry risks, including market fluctuations, changes in property values, and potential financial losses. Our services include assisting you in identifying and evaluating potential opportunities, negotiating purchase terms, and navigating the transaction process. Any decisions to purchase, sell, or invest in real estate should be made after careful consideration and consultation with appropriate financial, legal, and tax advisors. By engaging our services, you acknowledge that you have read and understood this disclaimer and agree to take full responsibility for your property-related decisions. Always conduct your own research and due diligence to ensure that any property transaction aligns with your financial objectives and risk profile.';
      
      // Draw wrapped disclaimer text with muted gray color
      const disclaimerGray = rgb(0.6, 0.6, 0.6);
      const disclaimerWords = disclaimerFullText.split(' ');
      let disclaimerLine = '';
      let disclaimerY = 200;
      const maxDisclaimerWidth = CONTENT_WIDTH;
      const disclaimerFontSize = 8;
      const disclaimerLineHeight = 13;
      
      for (const word of disclaimerWords) {
        const testLine = disclaimerLine ? `${disclaimerLine} ${word}` : word;
        const testWidth = helveticaFont.widthOfTextAtSize(testLine, disclaimerFontSize);
        
        if (testWidth > maxDisclaimerWidth && disclaimerLine) {
          disclaimerPage.drawText(disclaimerLine, {
            x: MARGIN_LEFT,
            y: disclaimerY,
            size: disclaimerFontSize,
            font: helveticaFont,
            color: disclaimerGray,
          });
          disclaimerY -= disclaimerLineHeight;
          disclaimerLine = word;
        } else {
          disclaimerLine = testLine;
        }
      }
      
      if (disclaimerLine) {
        disclaimerPage.drawText(disclaimerLine, {
          x: MARGIN_LEFT,
          y: disclaimerY,
          size: disclaimerFontSize,
          font: helveticaFont,
          color: disclaimerGray,
        });
      }
      
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
        
        // Header bar removed per user request
        
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
      const storagePath = `portfolio-reports/${clientId}/${fileName}`;
      
      // Upload PDF to Supabase Storage
      console.log('📤 Uploading PDF to storage...');
      let uploadedFilePath: string | null = null;
      try {
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('client-files')
          .upload(storagePath, blob, {
            contentType: 'application/pdf',
            upsert: true,
          });
        
        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          toast.error('Failed to upload PDF to storage, but will still download locally');
        } else {
          uploadedFilePath = uploadData.path;
          console.log('✓ PDF uploaded to storage:', uploadedFilePath);
        }
      } catch (storageError) {
        console.error('Storage upload exception:', storageError);
      }
      
      // Download the PDF locally as well
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
            pdf_file_path: uploadedFilePath,
            status: 'completed',
          });
        
        if (insertError) {
          console.error('Failed to save report metadata:', insertError);
        } else {
          console.log('✓ Report saved to database with PDF path:', uploadedFilePath);
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

                {/* Borrowing Capacity Assessment */}
                {analysisData.borrowingCapacity && (
                  <Card className="border-primary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        Borrowing Capacity Assessment
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4 text-center mb-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Borrowing Capacity</p>
                          <p className="text-xl font-bold">{formatCurrency(analysisData.borrowingCapacity.borrowingCapacity)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Monthly Surplus</p>
                          <p className={`text-xl font-bold ${analysisData.borrowingCapacity.monthlySurplus >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {formatCurrency(analysisData.borrowingCapacity.monthlySurplus)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Serviceability</p>
                          <Badge 
                            variant={
                              analysisData.borrowingCapacity.serviceabilityBand === 'green' ? 'default' :
                              analysisData.borrowingCapacity.serviceabilityBand === 'amber' ? 'secondary' : 'destructive'
                            }
                            className="mt-1"
                          >
                            {analysisData.borrowingCapacity.serviceabilityBand === 'green' ? 'STRONG' :
                             analysisData.borrowingCapacity.serviceabilityBand === 'amber' ? 'MODERATE' : 'LIMITED'}
                          </Badge>
                        </div>
                      </div>
                      
                      <Separator className="my-3" />
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">DTI Ratio</p>
                          <p className={`font-semibold ${
                            analysisData.borrowingCapacity.dtiRatio < 6 ? 'text-success' :
                            analysisData.borrowingCapacity.dtiRatio < 8 ? 'text-warning' : 'text-destructive'
                          }`}>
                            {analysisData.borrowingCapacity.dtiRatio.toFixed(1)}x
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Stress Tested</p>
                          <p className="font-semibold">{formatCurrency(analysisData.borrowingCapacity.stressTestedCapacity)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Assessment Rate</p>
                          <p className="font-semibold">{analysisData.borrowingCapacity.assessmentRate.toFixed(2)}%</p>
                        </div>
                      </div>
                      
                      {analysisData.borrowingCapacity.recommendations.length > 0 && (
                        <>
                          <Separator className="my-3" />
                          <div>
                            <p className="text-sm font-medium flex items-center gap-1 mb-2">
                              <CheckCircle className="h-4 w-4 text-success" /> Recommendations
                            </p>
                            <ul className="text-sm space-y-1">
                              {analysisData.borrowingCapacity.recommendations.slice(0, 3).map((rec, i) => (
                                <li key={i}>• {rec}</li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}
                      
                      {analysisData.borrowingCapacity.warnings.length > 0 && (
                        <>
                          <Separator className="my-3" />
                          <div>
                            <p className="text-sm font-medium flex items-center gap-1 mb-2">
                              <AlertTriangle className="h-4 w-4 text-warning" /> Warnings
                            </p>
                            <ul className="text-sm space-y-1">
                              {analysisData.borrowingCapacity.warnings.slice(0, 2).map((warning, i) => (
                                <li key={i}>• {warning}</li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}
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
