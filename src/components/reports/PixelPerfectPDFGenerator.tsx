import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';

interface InvestmentReportData {
  id: string;
  address: string;
  content: string;
  created_at: string;
  enhanced_data?: {
    domainData?: any;
    absData?: any;
    rbaData?: any;
    financialData?: any;
    locationData?: any;
    investmentScore?: any;
  };
}

interface PixelPerfectPDFGeneratorProps {
  report: InvestmentReportData;
}

export const PixelPerfectPDFGenerator: React.FC<PixelPerfectPDFGeneratorProps> = ({ report }) => {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const extractSuburbState = (address: string): { suburb: string; state: string } => {
    const parts = address.split(',').map(p => p.trim());
    const lastPart = parts[parts.length - 1] || '';
    const stateMatch = lastPart.match(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/i);
    const state = stateMatch ? stateMatch[0].toUpperCase() : 'NSW';
    
    const suburb = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return { suburb: suburb.toUpperCase(), state };
  };

  const parseReportContent = (content: string): Record<string, string> => {
    const sections: Record<string, string> = {};
    const lines = content.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      // Handle both ## and # headers, remove numbering like "1. "
      if (line.match(/^#{1,2}\s*(\d+\.\s*)?/)) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        currentSection = line.replace(/^#{1,2}\s*(\d+\.\s*)?/, '').trim();
        currentContent = [];
      } else if (currentSection && line.trim()) {
        currentContent.push(line);
      }
    }

    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  };

  const findSection = (sections: Record<string, string>, possibleNames: string[]): string => {
    for (const name of possibleNames) {
      const exactMatch = sections[name];
      if (exactMatch) return exactMatch;

      const partialMatch = Object.keys(sections).find(key => 
        key.toLowerCase().includes(name.toLowerCase())
      );
      if (partialMatch) return sections[partialMatch];
    }
    return '';
  };

  const extractMarketData = (sections: Record<string, string>, enhancedData: any) => {
    const domainData = enhancedData?.domainData || {};
    const financialData = enhancedData?.financialData || {};
    const investmentScore = enhancedData?.investmentScore || {};
    const absData = enhancedData?.absData || {};
    const locationData = enhancedData?.locationData || {};

    // Helper to extract numeric values from text
    const extractNumber = (text: string, pattern: RegExp): number | null => {
      const match = text.match(pattern);
      if (match) {
        const numStr = match[1].replace(/,/g, '');
        const num = parseFloat(numStr);
        return isNaN(num) ? null : num;
      }
      return null;
    };

    // Parse Market KPIs section
    const marketKPIs = findSection(sections, ['Market KPIs', 'Market Performance', 'Key Metrics']);
    let medianPrice = domainData.medianPrice || financialData.propertyValue;
    let rentalYield = financialData.rentalYield || investmentScore.cashFlowScore;
    let growthRate = domainData.growthRate || investmentScore.capitalGrowthScore;

    if (marketKPIs) {
      const priceMatch = extractNumber(marketKPIs, /median.*price.*\$?([\d,]+)/i);
      if (priceMatch) medianPrice = priceMatch;
      
      const yieldMatch = extractNumber(marketKPIs, /rental.*yield.*?([\d.]+)%/i);
      if (yieldMatch) rentalYield = yieldMatch;
      
      const growthMatch = extractNumber(marketKPIs, /growth.*?([\d.]+)%/i);
      if (growthMatch) growthRate = growthMatch;
    }

    // Parse Demographics section
    const demographics = findSection(sections, ['Demographics & Demand Drivers', 'Demographics', 'Population']);
    let population = absData.population || domainData.population;
    let medianAge = absData.medianAge || domainData.medianAge;
    let medianIncome = absData.medianIncome || domainData.medianIncome;

    if (demographics) {
      const popMatch = extractNumber(demographics, /population.*?([\d,]+)/i);
      if (popMatch) population = popMatch;
      
      const ageMatch = extractNumber(demographics, /median age.*?([\d.]+)/i);
      if (ageMatch) medianAge = ageMatch;
      
      const incomeMatch = extractNumber(demographics, /median.*income.*\$?([\d,]+)/i);
      if (incomeMatch) medianIncome = incomeMatch;
    }

    return {
      medianPrice,
      rentalYield,
      growthRate,
      population,
      medianAge,
      medianIncome,
      demographics: absData.demographics || {},
      infrastructure: locationData.nearbyAmenities || locationData.infrastructure || {},
    };
  };

  const replaceTextInElement = (element: HTMLElement, placeholder: string, value: string) => {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    const nodesToReplace: { node: Text; newValue: string }[] = [];

    let node;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      if (textNode.nodeValue?.includes(placeholder)) {
        nodesToReplace.push({
          node: textNode,
          newValue: textNode.nodeValue.replace(new RegExp(placeholder, 'g'), value)
        });
      }
    }

    nodesToReplace.forEach(({ node, newValue }) => {
      node.nodeValue = newValue;
    });
  };

  const replaceContentSection = (container: HTMLElement, sectionIdentifiers: string[], content: string, maxLength: number = 500) => {
    if (!content) return;

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const nodesToReplace: { node: Text; newValue: string }[] = [];
    let node;
    
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const text = textNode.nodeValue || '';
      
      // Check if text matches any section identifier or is placeholder
      const matchesIdentifier = sectionIdentifiers.some(id => 
        text.toLowerCase().includes(id.toLowerCase())
      );
      const isPlaceholder = text.includes('Lorem ipsum') || 
                           text.includes('Sample text') ||
                           text.includes('placeholder') ||
                           text.trim().length > 50 && text.includes('dolor sit amet');
      
      if (matchesIdentifier || isPlaceholder) {
        // Clean markdown and bullets from content
        const cleanContent = content
          .replace(/^[#*\-•]\s*/gm, '') // Remove markdown headers and bullets
          .replace(/\n+/g, ' ') // Replace newlines with spaces
          .trim()
          .substring(0, maxLength);
        
        nodesToReplace.push({
          node: textNode,
          newValue: cleanContent
        });
      }
    }

    nodesToReplace.forEach(({ node, newValue }) => {
      node.nodeValue = newValue;
    });
  };

  const generatePixelPerfectPDF = async () => {
    setIsGenerating(true);
    
    try {
      const { suburb, state } = extractSuburbState(report.address);
      const sections = parseReportContent(report.content);

      console.log('Parsed sections:', Object.keys(sections));

      // Load the PDF template
      const templateResponse = await fetch('/templates/npc_template.pdf');
      const templateBytes = await templateResponse.arrayBuffer();
      
      // Load the template PDF
      const pdfDoc = await PDFDocument.load(templateBytes);
      const bodyFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const bodyBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Get the second page from template to use as content template
      const templatePages = pdfDoc.getPages();
      if (templatePages.length < 2) {
        throw new Error('Template must have at least 2 pages');
      }

      // Remove the original second page since we'll duplicate it as needed
      pdfDoc.removePage(1); // Remove index 1 (second page)

      // Page settings
      const pageWidth = 595; // A4 width in points
      const pageHeight = 842; // A4 height in points
      const margin = 70;
      const lineHeight = 20;
      const titleSize = 18;
      const textSize = 12;

      // Keywords that should be bold
      const importantKeywords = [
        'investment', 'growth', 'return', 'yield', 'capital', 'rental',
        'median', 'price', 'strong', 'high', 'low', 'risk', 'opportunity',
        'recommend', 'excellent', 'good', 'poor', 'infrastructure',
        'development', 'demand', 'supply', 'market', 'potential', 'score',
        'positive', 'negative', 'increase', 'decrease', 'significant'
      ];

      let currentPage: any = null;
      let yPosition = 0;

      // Helper function to add a new content page by copying from template
      const addContentPage = async () => {
        // Load template again to get a fresh page 2
        const freshTemplate = await PDFDocument.load(templateBytes);
        const [copiedPage] = await pdfDoc.copyPages(freshTemplate, [1]);
        pdfDoc.addPage(copiedPage);
        return pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      };

      // Helper to clean markdown formatting
      const cleanMarkdown = (text: string): string => {
        return text
          .replace(/^#{1,6}\s+/gm, '') // Remove markdown headers
          .replace(/\*\*\*(.*?)\*\*\*/g, '$1') // Remove bold+italic
          .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
          .replace(/\*(.*?)\*/g, '$1') // Remove italic
          .replace(/^[\*\-\+]\s+/gm, '• ') // Convert markdown bullets to bullets
          .replace(/^\d+\.\s+/gm, '') // Remove numbered lists
          .replace(/^>\s+/gm, '') // Remove blockquotes
          .replace(/`{1,3}(.*?)`{1,3}/g, '$1') // Remove code formatting
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links, keep text
          .trim();
      };

      // Helper to check if a word should be bold
      const shouldBeBold = (word: string): boolean => {
        const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
        return importantKeywords.some(keyword => cleanWord.includes(keyword)) ||
               /^\$[\d,]+/.test(word) || // Dollar amounts
               /\d+%/.test(word) || // Percentages
               /\d{4}/.test(word); // Years
      };

      // Helper to draw text with word wrapping and smart bolding
      const drawTextWithWrap = (page: any, text: string, x: number, startY: number, maxWidth: number, size: number, lineSpacing: number) => {
        const words = text.split(' ');
        let currentLine = '';
        let currentLineWords: { text: string; bold: boolean }[] = [];
        let currentY = startY;
        let currentX = x;

        const drawCurrentLine = () => {
          if (currentLineWords.length === 0) return;

          currentX = x;
          for (const wordObj of currentLineWords) {
            const font = wordObj.bold ? bodyBoldFont : bodyFont;
            page.drawText(wordObj.text + ' ', {
              x: currentX,
              y: currentY,
              size,
              font,
              color: rgb(0.15, 0.15, 0.15),
            });
            currentX += font.widthOfTextAtSize(wordObj.text + ' ', size);
          }
          currentY -= lineSpacing;
          currentLineWords = [];
          currentLine = '';
        };

        for (const word of words) {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const isBold = shouldBeBold(word);
          const testFont = isBold ? bodyBoldFont : bodyFont;
          const testWidth = currentX - x + testFont.widthOfTextAtSize(word + ' ', size);
          
          if (testWidth > maxWidth) {
            drawCurrentLine();
            currentX = x;
            currentLine = word;
            currentLineWords = [{ text: word, bold: isBold }];
          } else {
            currentLine = testLine;
            currentLineWords.push({ text: word, bold: isBold });
          }

          if (currentY < margin + 50) {
            return { needsNewPage: true, lastY: currentY, remainingText: words.slice(words.indexOf(word)).join(' ') };
          }
        }
        
        drawCurrentLine();
        return { needsNewPage: false, lastY: currentY, remainingText: '' };
      };

      // Add report title on first content page
      currentPage = await addContentPage();
      yPosition = pageHeight - margin - 50;

      currentPage.drawText(`Investment Report: ${suburb}, ${state}`, {
        x: margin,
        y: yPosition,
        size: 22,
        font: titleFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      yPosition -= 50;

      // Add sections
      const sectionOrder = [
        'Location Overview',
        'Market KPIs',
        'Demographics & Demand Drivers',
        'Infrastructure & Amenities',
        'Property-Level Information',
        'Costs for Investors',
        'Risk Assessment',
        'Comparable Market Evidence',
        'Financial Analysis',
        '10-Year Projection Scenarios',
        'Overall Investment Score',
        'Key Opportunities & Risks',
      ];

      for (const sectionName of sectionOrder) {
        const content = findSection(sections, [sectionName]);
        if (!content) continue;

        // Check if we need a new page for section title
        if (yPosition < margin + 100) {
          currentPage = await addContentPage();
          yPosition = pageHeight - margin - 50;
        }

        // Draw section title
        currentPage.drawText(sectionName, {
          x: margin,
          y: yPosition,
          size: titleSize,
          font: titleFont,
          color: rgb(0.1, 0.1, 0.1),
        });
        yPosition -= 40;

        // Clean and draw content
        const cleanContent = cleanMarkdown(content);
        const paragraphs = cleanContent.split('\n').filter(p => p.trim());

        for (const paragraph of paragraphs) {
          if (!paragraph.trim()) continue;

          let remainingText = paragraph;
          
          while (remainingText) {
            const result = drawTextWithWrap(
              currentPage,
              remainingText,
              margin,
              yPosition,
              pageWidth - 2 * margin,
              textSize,
              lineHeight
            );

            if (result.needsNewPage) {
              currentPage = await addContentPage();
              yPosition = pageHeight - margin - 50;
              remainingText = result.remainingText;
            } else {
              yPosition = result.lastY;
              remainingText = '';
            }
          }

          yPosition -= 10; // Space between paragraphs
        }

        yPosition -= 20; // Space between sections
      }

      // Save the PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      
      // Upload to Supabase Storage
      const fileName = `${report.id}_${suburb}_${state}_${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('investment-reports')
        .upload(fileName, blob, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('investment-reports')
        .getPublicUrl(fileName);

      // Update the investment_reports table with the PDF URL
      const { error: updateError } = await supabase
        .from('investment_reports')
        .update({ pdf_url: publicUrl })
        .eq('id', report.id);

      if (updateError) throw updateError;

      // Download the PDF
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${suburb}_${state}_Investment_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      toast.success('PDF generated and saved successfully!');
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={generatePixelPerfectPDF}
      disabled={isGenerating}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      {isGenerating ? 'Generating PDF...' : 'Download Client PDF'}
    </Button>
  );
};
