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
      if (line.match(/^#{1,6}\s*/)) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        // Remove all leading hashtags, spaces, and optional numbering
        currentSection = line
          .replace(/^#{1,6}\s*/, '') // Remove hashtags
          .replace(/^\d+\.\s*/, '') // Remove numbering
          .replace(/:\s*$/, '') // Remove trailing colon
          .trim();
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
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

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
      const margin = 60; // Left/right margin
      const topMargin = 80; // Top margin (more space for template header)
      const bottomMargin = 70; // Bottom margin
      const lineHeight = 16;
      const titleSize = 14;
      const textSize = 10;

      let currentPage: any = null;
      let yPosition = 0;

      // Helper function to strip emojis from text (WinAnsi encoding doesn't support them)
      const stripEmojis = (text: string): string => {
        // Remove emojis and other non-WinAnsi characters
        return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '')
          .replace(/[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{231A}-\u{231B}]/gu, '')
          .replace(/[\u{FE00}-\u{FE0F}]|[\u{E0020}-\u{E007F}]|[\u{200D}]/gu, '') // Variation selectors and ZWJ
          .trim();
      };

      // Helper function to add a new content page by copying from template
      const addContentPage = async () => {
        // Load template again to get a fresh page 2
        const freshTemplate = await PDFDocument.load(templateBytes);
        const [copiedPage] = await pdfDoc.copyPages(freshTemplate, [1]);
        pdfDoc.addPage(copiedPage);
        return pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      };

      // Helper to check if text is a markdown table
      const isMarkdownTable = (text: string): boolean => {
        const lines = text.trim().split('\n');
        // A table has at least 2 lines (header + separator)
        if (lines.length < 2) return false;
        // Check if it has pipe separators
        return lines.some(line => line.includes('|'));
      };

      // Helper to parse and draw markdown table
      const drawTable = (page: any, tableText: string, x: number, startY: number, maxWidth: number, normalFont: any, boldFont: any, size: number): { lastY: number; needsNewPage: boolean } => {
        const lines = tableText.trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return { lastY: startY, needsNewPage: false };

        // Parse table structure
        const rows = lines
          .filter(line => !line.match(/^[\|\s\-:]+$/)) // Filter out separator lines
          .map(line => 
            line.split('|')
              .map(cell => stripEmojis(cell.trim()))
              .filter(cell => cell.length > 0)
          );

        if (rows.length === 0) return { lastY: startY, needsNewPage: false };

        const columnCount = Math.max(...rows.map(r => r.length));
        const cellWidth = maxWidth / columnCount;
        const cellPadding = 5;
        const rowHeight = size + 10;

        let currentY = startY;

        // Draw each row
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const isHeader = i === 0;
          const font = isHeader ? boldFont : normalFont;
          
          // Check if we need a new page
          if (currentY - rowHeight < bottomMargin + 40) {
            return { lastY: currentY, needsNewPage: true };
          }

          // Draw cell backgrounds (alternating for readability)
          if (!isHeader && i % 2 === 0) {
            page.drawRectangle({
              x: x,
              y: currentY - rowHeight + 2,
              width: maxWidth,
              height: rowHeight,
              color: rgb(0.95, 0.95, 0.95),
            });
          }

          // Draw cell borders and text
          for (let j = 0; j < row.length; j++) {
            const cellX = x + (j * cellWidth);
            const cellText = row[j];
            
            // Truncate text if too long for cell
            let displayText = cellText;
            let textWidth = font.widthOfTextAtSize(displayText, size);
            while (textWidth > cellWidth - 2 * cellPadding && displayText.length > 3) {
              displayText = displayText.slice(0, -4) + '...';
              textWidth = font.widthOfTextAtSize(displayText, size);
            }

            // Draw cell text
            page.drawText(displayText, {
              x: cellX + cellPadding,
              y: currentY - size - 3,
              size,
              font,
              color: rgb(0.2, 0.2, 0.2),
            });

            // Draw vertical cell border
            if (j < row.length - 1) {
              page.drawLine({
                start: { x: cellX + cellWidth, y: currentY },
                end: { x: cellX + cellWidth, y: currentY - rowHeight },
                thickness: 0.5,
                color: rgb(0.7, 0.7, 0.7),
              });
            }
          }

          // Draw horizontal border
          page.drawLine({
            start: { x: x, y: currentY - rowHeight },
            end: { x: x + maxWidth, y: currentY - rowHeight },
            thickness: isHeader ? 1.5 : 0.5,
            color: rgb(0.5, 0.5, 0.5),
          });

          if (isHeader) {
            // Draw top border for header
            page.drawLine({
              start: { x: x, y: currentY },
              end: { x: x + maxWidth, y: currentY },
              thickness: 1.5,
              color: rgb(0.5, 0.5, 0.5),
            });
          }

          currentY -= rowHeight;
        }

        return { lastY: currentY - 8, needsNewPage: false };
      };

      // Helper to draw horizontal rule
      const drawHorizontalRule = (page: any, x: number, y: number, width: number): number => {
        page.drawLine({
          start: { x: x, y: y },
          end: { x: x + width, y: y },
          thickness: 1,
          color: rgb(0.6, 0.6, 0.6),
          dashArray: [3, 3],
        });
        return y - 15; // Space after rule
      };

      // Helper to parse markdown and detect formatting
      const parseMarkdownText = (text: string): Array<{text: string, bold: boolean, italic: boolean}> => {
        // Strip emojis first to prevent encoding errors
        text = stripEmojis(text);
        const parts: Array<{text: string, bold: boolean, italic: boolean}> = [];
        let remaining = text
          .replace(/^#{1,6}\s+/gm, '') // Remove markdown headers
          .replace(/^[\*\-\+]\s+/gm, '• ') // Convert markdown bullets
          .replace(/^\d+\.\s+/gm, '') // Remove numbered lists
          .replace(/^>\s+/gm, '') // Remove blockquotes
          .replace(/`{1,3}(.*?)`{1,3}/g, '$1') // Remove code formatting
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // Remove links, keep text

        // Parse bold and italic
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
        boldItalicRegex.lastIndex = 0;
        remaining = text
          .replace(/^#{1,6}\s+/gm, '')
          .replace(/^[\*\-\+]\s+/gm, '• ')
          .replace(/^\d+\.\s+/gm, '')
          .replace(/^>\s+/gm, '')
          .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
        
        while ((match = boldRegex.exec(remaining)) !== null) {
          // Don't overlap with bold+italic
          if (!segments.some(s => match.index >= s.start && match.index < s.end)) {
            segments.push({text: match[1], start: match.index, end: match.index + match[0].length, bold: true, italic: false});
          }
        }

        // Find all italic
        boldRegex.lastIndex = 0;
        while ((match = italicRegex.exec(remaining)) !== null) {
          // Don't overlap with bold or bold+italic
          if (!segments.some(s => match.index >= s.start && match.index < s.end)) {
            segments.push({text: match[1], start: match.index, end: match.index + match[0].length, bold: false, italic: true});
          }
        }

        // Sort segments by position
        segments.sort((a, b) => a.start - b.start);

        // Build parts array with normal text between segments
        segments.forEach((seg, i) => {
          // Add normal text before this segment
          if (seg.start > lastIndex) {
            const normalText = remaining.substring(lastIndex, seg.start)
              .replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
            if (normalText) parts.push({text: normalText, bold: false, italic: false});
          }
          // Add formatted segment
          parts.push({text: seg.text, bold: seg.bold, italic: seg.italic});
          lastIndex = seg.end;
        });

        // Add remaining normal text
        if (lastIndex < remaining.length) {
          const normalText = remaining.substring(lastIndex)
            .replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
          if (normalText) parts.push({text: normalText, bold: false, italic: false});
        }

        // If no formatting found, return whole text as normal
        if (parts.length === 0) {
          parts.push({text: remaining.replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, ''), bold: false, italic: false});
        }

        return parts;
      };

      // Helper to calculate text height without drawing
      const calculateTextHeight = (text: string, maxWidth: number, normalFont: any, boldFont: any, size: number, lineSpacing: number): number => {
        const parts = parseMarkdownText(text);
        let lines = 1;
        let currentLineWidth = 0;
        
        for (const part of parts) {
          const words = part.text.split(' ');
          const font = part.bold ? boldFont : normalFont;
          
          for (const word of words) {
            const wordWithSpace = word + ' ';
            const wordWidth = font.widthOfTextAtSize(wordWithSpace, size);
            
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

      // Helper to draw text with word wrapping and markdown formatting
      const drawTextWithWrap = (page: any, text: string, x: number, startY: number, maxWidth: number, normalFont: any, boldFont: any, size: number, lineSpacing: number) => {
        const parts = parseMarkdownText(text);
        let currentY = startY;
        let currentX = x;
        
        for (const part of parts) {
          const words = part.text.split(' ');
          const font = part.bold ? boldFont : normalFont;
          
          for (const word of words) {
            const wordWithSpace = word + ' ';
            const wordWidth = font.widthOfTextAtSize(wordWithSpace, size);
            
            // Check if word fits on current line
            if (currentX + wordWidth > x + maxWidth && currentX > x) {
              // Move to next line
              currentX = x;
              currentY -= lineSpacing;
              
              // Check if we need a new page
              if (currentY < bottomMargin + 40) {
                return { needsNewPage: true, lastY: currentY, remainingParts: parts.slice(parts.indexOf(part)) };
              }
            }
            
            // Draw the word
            page.drawText(wordWithSpace, {
              x: currentX,
              y: currentY,
              size,
              font,
              color: rgb(0.2, 0.2, 0.2),
            });
            
            currentX += wordWidth;
          }
        }

        return { needsNewPage: false, lastY: currentY - lineSpacing, remainingParts: [] };
      };

      // Add report title on first content page with word wrapping
      currentPage = await addContentPage();
      yPosition = pageHeight - topMargin - 20;

      const titleText = stripEmojis(`Investment Report: ${suburb}, ${state}`);
      const titleResult = drawTextWithWrap(
        currentPage,
        `**${titleText}**`,
        margin,
        yPosition,
        pageWidth - 2 * margin,
        helveticaFont,
        helveticaBold,
        18,
        24
      );
      yPosition = titleResult.lastY - 25;

      // Get ALL sections from the report dynamically instead of hardcoded list
      const allSectionNames = Object.keys(sections).filter(name => 
        name && sections[name] && sections[name].trim().length > 0
      );
      
      console.log('Found sections to include in PDF:', allSectionNames);

      for (const sectionName of allSectionNames) {
        const content = sections[sectionName];
        if (!content) continue;

        // Clean section name and strip emojis
        const cleanSectionName = stripEmojis(
          sectionName
            .replace(/^#{1,6}\s*/, '')
            .replace(/:\s*$/, '')
            .trim()
        );

        // Calculate total height needed for this section
        const paragraphs = content.split('\n').filter(p => p.trim());
        const sectionTitleHeight = 30;
        let totalContentHeight = 0;
        
        for (const paragraph of paragraphs) {
          if (paragraph.trim()) {
            totalContentHeight += calculateTextHeight(
              paragraph,
              pageWidth - 2 * margin,
              helveticaFont,
              helveticaBold,
              textSize,
              lineHeight
            ) + 8; // paragraph spacing
          }
        }
        
        const totalSectionHeight = sectionTitleHeight + totalContentHeight + 15; // section spacing
        
        // Smart page break: if section is small enough and won't fit, start on new page
        if (totalSectionHeight < (pageHeight - topMargin - bottomMargin - 100) && 
            yPosition - totalSectionHeight < bottomMargin + 40) {
          currentPage = await addContentPage();
          yPosition = pageHeight - topMargin - 20;
        } else if (yPosition < bottomMargin + 80) {
          // Otherwise just check if we have minimum space for title
          currentPage = await addContentPage();
          yPosition = pageHeight - topMargin - 20;
        }

        // Draw section title with word wrapping
        const titleResult = drawTextWithWrap(
          currentPage,
          `**${cleanSectionName}**`,
          margin,
          yPosition,
          pageWidth - 2 * margin,
          helveticaFont,
          helveticaBold,
          titleSize,
          20
        );
        yPosition = titleResult.lastY - 10;

        // Draw paragraphs
        for (const paragraph of paragraphs) {
          if (!paragraph.trim()) continue;

          // Check for horizontal rule (---)
          if (paragraph.trim().match(/^-{3,}$/)) {
            // Check if we need a new page
            if (yPosition < bottomMargin + 60) {
              currentPage = await addContentPage();
              yPosition = pageHeight - topMargin - 20;
            }
            yPosition = drawHorizontalRule(currentPage, margin, yPosition - 10, pageWidth - 2 * margin);
            continue;
          }

          // Check if paragraph is a markdown table
          if (isMarkdownTable(paragraph)) {
            // Check if we need a new page
            if (yPosition < bottomMargin + 100) {
              currentPage = await addContentPage();
              yPosition = pageHeight - topMargin - 20;
            }

            const tableResult = drawTable(
              currentPage,
              paragraph,
              margin,
              yPosition,
              pageWidth - 2 * margin,
              helveticaFont,
              helveticaBold,
              textSize
            );

            if (tableResult.needsNewPage) {
              currentPage = await addContentPage();
              yPosition = pageHeight - topMargin - 20;
              // Retry drawing the table on new page
              const retryResult = drawTable(
                currentPage,
                paragraph,
                margin,
                yPosition,
                pageWidth - 2 * margin,
                helveticaFont,
                helveticaBold,
                textSize
              );
              yPosition = retryResult.lastY;
            } else {
              yPosition = tableResult.lastY;
            }
            continue;
          }

          // Regular paragraph with text wrapping
          let remainingParts = parseMarkdownText(paragraph);
          
          while (remainingParts.length > 0) {
            // Check if we need a new page before starting paragraph
            if (yPosition < bottomMargin + 60) {
              currentPage = await addContentPage();
              yPosition = pageHeight - topMargin - 20;
            }

            const paragraphText = remainingParts.map(p => {
              if (p.bold && p.italic) return `***${p.text}***`;
              if (p.bold) return `**${p.text}**`;
              if (p.italic) return `*${p.text}*`;
              return p.text;
            }).join('');

            const result = drawTextWithWrap(
              currentPage,
              paragraphText,
              margin,
              yPosition,
              pageWidth - 2 * margin,
              helveticaFont,
              helveticaBold,
              textSize,
              lineHeight
            );

            if (result.needsNewPage) {
              currentPage = await addContentPage();
              yPosition = pageHeight - topMargin - 20;
              remainingParts = result.remainingParts;
            } else {
              yPosition = result.lastY;
              remainingParts = [];
            }
          }

          yPosition -= 8; // Space between paragraphs
        }

        yPosition -= 15; // Space between sections
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
