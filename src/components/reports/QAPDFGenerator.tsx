import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, RGB } from 'pdf-lib';

interface QAPDFGeneratorProps {
  content: string;
  title: string;
  reportNames: string[];
  onComplete?: () => void;
}

// Color type for the PDF
interface PDFColors {
  black: RGB;
  darkGray: RGB;
  gold: RGB;
  lightGold: RGB;
  white: RGB;
  gray: RGB;
  darkText: RGB;
}

export const QAPDFGenerator: React.FC<QAPDFGeneratorProps> = ({ 
  content, 
  title, 
  reportNames,
  onComplete 
}) => {
  const [isGenerating, setIsGenerating] = React.useState(false);

  // NPC Brand colors
  const colors: PDFColors = {
    black: rgb(0.04, 0.04, 0.04),         // #0a0a0a
    darkGray: rgb(0.18, 0.18, 0.18),       // #2d2d2d
    gold: rgb(0.79, 0.64, 0.15),           // #c9a227
    lightGold: rgb(0.91, 0.84, 0.62),      // #e8d59d
    white: rgb(1, 1, 1),
    gray: rgb(0.53, 0.53, 0.53),           // #888888
    darkText: rgb(0.1, 0.1, 0.1),          // #1a1a1a
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    console.log('🚀 Starting Q&A PDF generation');
    
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Embed fonts
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      const timesRomanItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

      // Page dimensions (A4)
      const pageWidth = 595;
      const pageHeight = 842;
      const margin = 60;

      // Create cover page
      await createCoverPage(pdfDoc, {
        pageWidth,
        pageHeight,
        title,
        reportNames,
        fonts: { helvetica, helveticaBold, timesRoman, timesRomanBold },
        colors,
      });

      // Create content pages
      await createContentPages(pdfDoc, {
        pageWidth,
        pageHeight,
        margin,
        content,
        fonts: { helvetica, helveticaBold, timesRoman, timesRomanBold, timesRomanItalic },
        colors,
      });

      // Generate PDF bytes
      const pdfBytes = await pdfDoc.save();
      
      // Create download
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const fileName = reportNames.length > 0 
        ? `Summary - ${reportNames.join(', ')}.pdf`
        : `Q&A Summary - ${new Date().toLocaleDateString()}.pdf`;
      
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('PDF Downloaded', {
        description: 'Your summary has been exported',
      });

      onComplete?.();
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Export failed', {
        description: 'Failed to generate PDF',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={generatePDF}
      disabled={isGenerating}
      className="gap-1.5"
    >
      {isGenerating ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Download className="h-3 w-3" />
      )}
      PDF
    </Button>
  );
};

// Helper types
interface PageConfig {
  pageWidth: number;
  pageHeight: number;
  title: string;
  reportNames: string[];
  fonts: {
    helvetica: PDFFont;
    helveticaBold: PDFFont;
    timesRoman: PDFFont;
    timesRomanBold: PDFFont;
  };
  colors: PDFColors;
}

interface ContentConfig {
  pageWidth: number;
  pageHeight: number;
  margin: number;
  content: string;
  fonts: {
    helvetica: PDFFont;
    helveticaBold: PDFFont;
    timesRoman: PDFFont;
    timesRomanBold: PDFFont;
    timesRomanItalic: PDFFont;
  };
  colors: PDFColors;
}

async function createCoverPage(pdfDoc: PDFDocument, config: PageConfig) {
  const { pageWidth, pageHeight, title, reportNames, fonts, colors } = config;
  
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  
  // Black background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: colors.black,
  });

  // Corner accents - Top left
  page.drawRectangle({
    x: 0,
    y: pageHeight - 120,
    width: 120,
    height: 120,
    color: colors.darkGray,
  });
  // Gold accent line
  page.drawLine({
    start: { x: 0, y: pageHeight - 100 },
    end: { x: 100, y: pageHeight },
    thickness: 2,
    color: colors.gold,
  });

  // Corner accents - Top right
  page.drawRectangle({
    x: pageWidth - 120,
    y: pageHeight - 120,
    width: 120,
    height: 120,
    color: colors.darkGray,
  });
  page.drawLine({
    start: { x: pageWidth - 100, y: pageHeight },
    end: { x: pageWidth, y: pageHeight - 100 },
    thickness: 2,
    color: colors.gold,
  });

  // Corner accents - Bottom right
  page.drawRectangle({
    x: pageWidth - 120,
    y: 0,
    width: 120,
    height: 120,
    color: colors.darkGray,
  });
  page.drawLine({
    start: { x: pageWidth, y: 100 },
    end: { x: pageWidth - 100, y: 0 },
    thickness: 2,
    color: colors.gold,
  });

  // Corner accents - Bottom left
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 120,
    height: 120,
    color: colors.darkGray,
  });
  page.drawLine({
    start: { x: 0, y: 100 },
    end: { x: 100, y: 0 },
    thickness: 2,
    color: colors.gold,
  });

  // Draw stylized "N" logo
  const logoY = pageHeight - 280;
  const logoSize = 80;
  const logoX = (pageWidth - logoSize) / 2;
  
  // N shape using lines
  page.drawLine({
    start: { x: logoX + 15, y: logoY },
    end: { x: logoX + 15, y: logoY + logoSize },
    thickness: 8,
    color: colors.gold,
  });
  page.drawLine({
    start: { x: logoX + 15, y: logoY + logoSize },
    end: { x: logoX + logoSize - 15, y: logoY },
    thickness: 8,
    color: colors.gold,
  });
  page.drawLine({
    start: { x: logoX + logoSize - 15, y: logoY },
    end: { x: logoX + logoSize - 15, y: logoY + logoSize },
    thickness: 8,
    color: colors.gold,
  });

  // Company name
  const companyLine1 = 'NAIDU PROPERTY';
  const companyLine2 = 'CONSULTING SERVICES';
  const companySize = 24;
  
  const line1Width = fonts.timesRoman.widthOfTextAtSize(companyLine1, companySize);
  const line2Width = fonts.timesRoman.widthOfTextAtSize(companyLine2, companySize);
  
  page.drawText(companyLine1, {
    x: (pageWidth - line1Width) / 2,
    y: pageHeight - 380,
    size: companySize,
    font: fonts.timesRoman,
    color: colors.gold,
  });
  
  page.drawText(companyLine2, {
    x: (pageWidth - line2Width) / 2,
    y: pageHeight - 410,
    size: companySize,
    font: fonts.timesRoman,
    color: colors.gold,
  });

  // Decorative divider
  const dividerY = pageHeight - 450;
  page.drawLine({
    start: { x: pageWidth / 2 - 80, y: dividerY },
    end: { x: pageWidth / 2 - 10, y: dividerY },
    thickness: 2,
    color: colors.gold,
  });
  // Diamond shape using a small rotated rectangle - simplified without rotation
  // Draw as a diamond using lines instead
  const diamondSize = 6;
  const cx = pageWidth / 2;
  const cy = dividerY;
  page.drawLine({
    start: { x: cx, y: cy + diamondSize },
    end: { x: cx + diamondSize, y: cy },
    thickness: 2,
    color: colors.gold,
  });
  page.drawLine({
    start: { x: cx + diamondSize, y: cy },
    end: { x: cx, y: cy - diamondSize },
    thickness: 2,
    color: colors.gold,
  });
  page.drawLine({
    start: { x: cx, y: cy - diamondSize },
    end: { x: cx - diamondSize, y: cy },
    thickness: 2,
    color: colors.gold,
  });
  page.drawLine({
    start: { x: cx - diamondSize, y: cy },
    end: { x: cx, y: cy + diamondSize },
    thickness: 2,
    color: colors.gold,
  });
  page.drawLine({
    start: { x: pageWidth / 2 + 10, y: dividerY },
    end: { x: pageWidth / 2 + 80, y: dividerY },
    thickness: 2,
    color: colors.gold,
  });

  // Tagline
  const tagline = 'YOUR DEDICATED PROPERTY PARTNER';
  const taglineSize = 10;
  const taglineWidth = fonts.helvetica.widthOfTextAtSize(tagline, taglineSize);
  page.drawText(tagline, {
    x: (pageWidth - taglineWidth) / 2,
    y: pageHeight - 480,
    size: taglineSize,
    font: fonts.helvetica,
    color: colors.gold,
  });

  // Document title
  const titleSize = 18;
  const titleWidth = fonts.timesRomanBold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (pageWidth - titleWidth) / 2,
    y: pageHeight - 550,
    size: titleSize,
    font: fonts.timesRomanBold,
    color: colors.white,
  });

  // Report names
  if (reportNames.length > 0) {
    const basedOnText = `Based on: ${reportNames.join(', ')}`;
    const basedOnSize = 10;
    const basedOnWidth = fonts.helvetica.widthOfTextAtSize(basedOnText, basedOnSize);
    page.drawText(basedOnText, {
      x: (pageWidth - basedOnWidth) / 2,
      y: pageHeight - 580,
      size: basedOnSize,
      font: fonts.helvetica,
      color: colors.gray,
    });
  }

  // Generated date
  const generatedText = `Generated: ${new Date().toLocaleString()}`;
  const generatedSize = 9;
  const generatedWidth = fonts.helvetica.widthOfTextAtSize(generatedText, generatedSize);
  page.drawText(generatedText, {
    x: (pageWidth - generatedWidth) / 2,
    y: pageHeight - 620,
    size: generatedSize,
    font: fonts.helvetica,
    color: colors.gray,
  });
}

async function createContentPages(pdfDoc: PDFDocument, config: ContentConfig) {
  const { pageWidth, pageHeight, margin, content, fonts, colors } = config;
  
  const topMargin = 80;
  const bottomMargin = 80;
  const textSize = 11;
  const lineHeight = 16;
  const headerSize = 14;
  const subHeaderSize = 12;
  
  // Parse content into lines
  const lines = parseContentToLines(content, fonts.timesRoman, textSize, pageWidth - margin * 2);
  
  let currentPage: PDFPage | null = null;
  let yPosition = 0;
  let pageNumber = 1;
  const totalPages = Math.ceil(lines.length / 45) + 1; // Estimate

  const startNewPage = () => {
    currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNumber++;
    yPosition = pageHeight - topMargin;
    
    // Draw page decorations
    drawPageDecorations(currentPage, pageWidth, pageHeight, colors);
    
    return currentPage;
  };

  // Start first content page
  currentPage = startNewPage();

  for (const line of lines) {
    // Check if we need a new page
    if (yPosition < bottomMargin + 40) {
      // Add footer to current page before starting new one
      addPageFooter(currentPage!, pageWidth, pageNumber, totalPages, fonts.helvetica, colors);
      currentPage = startNewPage();
    }

    // Determine line type and styling
    if (line.type === 'header') {
      // Add extra spacing before headers
      yPosition -= 10;
      
      // Draw gold underline for headers
      currentPage!.drawLine({
        start: { x: margin, y: yPosition - 5 },
        end: { x: pageWidth - margin, y: yPosition - 5 },
        thickness: 1,
        color: colors.gold,
      });
      
      currentPage!.drawText(line.text, {
        x: margin,
        y: yPosition,
        size: headerSize,
        font: fonts.timesRomanBold,
        color: colors.darkText,
      });
      yPosition -= lineHeight + 8;
    } else if (line.type === 'subheader') {
      yPosition -= 6;
      currentPage!.drawText(line.text, {
        x: margin,
        y: yPosition,
        size: subHeaderSize,
        font: fonts.timesRomanBold,
        color: colors.darkText,
      });
      yPosition -= lineHeight + 4;
    } else if (line.type === 'bullet') {
      // Draw gold bullet
      currentPage!.drawText('•', {
        x: margin,
        y: yPosition,
        size: textSize,
        font: fonts.timesRoman,
        color: colors.gold,
      });
      currentPage!.drawText(line.text, {
        x: margin + 15,
        y: yPosition,
        size: textSize,
        font: fonts.timesRoman,
        color: colors.darkText,
      });
      yPosition -= lineHeight;
    } else if (line.type === 'numbered') {
      currentPage!.drawText(line.prefix || '', {
        x: margin,
        y: yPosition,
        size: textSize,
        font: fonts.timesRomanBold,
        color: colors.gold,
      });
      currentPage!.drawText(line.text, {
        x: margin + 20,
        y: yPosition,
        size: textSize,
        font: fonts.timesRoman,
        color: colors.darkText,
      });
      yPosition -= lineHeight;
    } else if (line.type === 'bold') {
      currentPage!.drawText(line.text, {
        x: margin,
        y: yPosition,
        size: textSize,
        font: fonts.timesRomanBold,
        color: colors.darkText,
      });
      yPosition -= lineHeight;
    } else if (line.type === 'empty') {
      yPosition -= lineHeight / 2;
    } else {
      // Regular text
      currentPage!.drawText(line.text, {
        x: margin,
        y: yPosition,
        size: textSize,
        font: fonts.timesRoman,
        color: colors.darkText,
      });
      yPosition -= lineHeight;
    }
  }

  // Add footer to last page
  if (currentPage) {
    addPageFooter(currentPage, pageWidth, pageNumber, totalPages, fonts.helvetica, colors);
    
    // Add contact info and disclaimer on last page
    addLastPageInfo(currentPage, pageWidth, margin, fonts, colors);
  }
}

function drawPageDecorations(page: PDFPage, pageWidth: number, pageHeight: number, colors: ContentConfig['colors']) {
  // Top-left corner accent
  page.drawRectangle({
    x: 0,
    y: pageHeight - 60,
    width: 60,
    height: 60,
    color: colors.darkGray,
  });
  page.drawLine({
    start: { x: 0, y: pageHeight - 50 },
    end: { x: 50, y: pageHeight },
    thickness: 1.5,
    color: colors.gold,
  });

  // Bottom-right corner accent
  page.drawRectangle({
    x: pageWidth - 60,
    y: 0,
    width: 60,
    height: 60,
    color: colors.darkGray,
  });
  page.drawLine({
    start: { x: pageWidth, y: 50 },
    end: { x: pageWidth - 50, y: 0 },
    thickness: 1.5,
    color: colors.gold,
  });
}

function addPageFooter(page: PDFPage, pageWidth: number, pageNumber: number, totalPages: number, font: PDFFont, colors: ContentConfig['colors']) {
  const footerY = 30;
  
  // Left side - company info
  page.drawText('NPC Services | npcservices.com.au', {
    x: 60,
    y: footerY,
    size: 8,
    font,
    color: colors.gray,
  });
  
  // Right side - page number
  const pageText = `Page ${pageNumber} of ${totalPages}`;
  const pageTextWidth = font.widthOfTextAtSize(pageText, 8);
  page.drawText(pageText, {
    x: pageWidth - 60 - pageTextWidth,
    y: footerY,
    size: 8,
    font,
    color: colors.gray,
  });
  
  // Top border line
  page.drawLine({
    start: { x: 60, y: footerY + 15 },
    end: { x: pageWidth - 60, y: footerY + 15 },
    thickness: 0.5,
    color: rgb(0.9, 0.9, 0.9),
  });
}

function addLastPageInfo(page: PDFPage, pageWidth: number, margin: number, fonts: ContentConfig['fonts'], colors: ContentConfig['colors']) {
  const contactY = 120;
  
  // Gold divider line
  page.drawLine({
    start: { x: margin, y: contactY + 20 },
    end: { x: pageWidth - margin, y: contactY + 20 },
    thickness: 2,
    color: colors.gold,
  });
  
  // Contact heading
  const contactHeading = 'Contact NPC Services';
  const headingWidth = fonts.timesRomanBold.widthOfTextAtSize(contactHeading, 11);
  page.drawText(contactHeading, {
    x: (pageWidth - headingWidth) / 2,
    y: contactY,
    size: 11,
    font: fonts.timesRomanBold,
    color: colors.darkText,
  });
  
  // Contact details
  const contactDetails = 'Phone: 0433 005 110 | Email: admin@npcservices.com.au | Website: npcservices.com.au';
  const detailsWidth = fonts.timesRoman.widthOfTextAtSize(contactDetails, 9);
  page.drawText(contactDetails, {
    x: (pageWidth - detailsWidth) / 2,
    y: contactY - 18,
    size: 9,
    font: fonts.timesRoman,
    color: colors.gray,
  });
  
  // Disclaimer
  const disclaimer = 'Disclaimer: This summary is provided for informational purposes only and does not constitute financial advice.';
  const disclaimerWidth = fonts.timesRomanItalic.widthOfTextAtSize(disclaimer, 8);
  page.drawText(disclaimer, {
    x: (pageWidth - disclaimerWidth) / 2,
    y: contactY - 40,
    size: 8,
    font: fonts.timesRomanItalic,
    color: colors.gray,
  });
}

interface ParsedLine {
  type: 'header' | 'subheader' | 'bullet' | 'numbered' | 'bold' | 'text' | 'empty';
  text: string;
  prefix?: string;
}

function parseContentToLines(content: string, font: PDFFont, fontSize: number, maxWidth: number): ParsedLine[] {
  const result: ParsedLine[] = [];
  const rawLines = content.split('\n');
  
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    
    if (!trimmed) {
      result.push({ type: 'empty', text: '' });
      continue;
    }
    
    // Check for headers (## or #)
    if (trimmed.startsWith('## ')) {
      result.push({ type: 'subheader', text: trimmed.replace(/^##\s*/, '') });
      continue;
    }
    if (trimmed.startsWith('# ')) {
      result.push({ type: 'header', text: trimmed.replace(/^#\s*/, '') });
      continue;
    }
    
    // Check for bullet points
    if (trimmed.match(/^[•\-\*]\s+/)) {
      const bulletText = trimmed.replace(/^[•\-\*]\s+/, '');
      const wrappedLines = wrapText(bulletText, font, fontSize, maxWidth - 15);
      wrappedLines.forEach((line, idx) => {
        if (idx === 0) {
          result.push({ type: 'bullet', text: line });
        } else {
          result.push({ type: 'text', text: '   ' + line });
        }
      });
      continue;
    }
    
    // Check for numbered lists
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      const prefix = numberedMatch[1] + '.';
      const numberedText = numberedMatch[2];
      const wrappedLines = wrapText(numberedText, font, fontSize, maxWidth - 20);
      wrappedLines.forEach((line, idx) => {
        if (idx === 0) {
          result.push({ type: 'numbered', text: line, prefix });
        } else {
          result.push({ type: 'text', text: '    ' + line });
        }
      });
      continue;
    }
    
    // Check for bold text (entire line)
    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      result.push({ type: 'bold', text: trimmed.replace(/\*\*/g, '') });
      continue;
    }
    
    // Regular text - wrap to fit page width
    const cleanText = trimmed.replace(/\*\*/g, '').replace(/__/g, '');
    const wrappedLines = wrapText(cleanText, font, fontSize, maxWidth);
    wrappedLines.forEach(line => {
      result.push({ type: 'text', text: line });
    });
  }
  
  return result;
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    
    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.length > 0 ? lines : [''];
}
