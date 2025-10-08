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
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Add content pages starting from page 2
      let yPosition = 750;
      const pageWidth = 595; // A4 width in points
      const pageHeight = 842; // A4 height in points
      const margin = 50;
      const lineHeight = 20;

      // Add a new page for content
      const contentPage = pdfDoc.addPage([pageWidth, pageHeight]);

      // Add title
      contentPage.drawText(`Investment Report: ${suburb}, ${state}`, {
        x: margin,
        y: yPosition,
        size: 18,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPosition -= 40;

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

        // Check if we need a new page
        if (yPosition < 100) {
          const newPage = pdfDoc.addPage([pageWidth, pageHeight]);
          yPosition = 750;
          
          // Draw section title on new page
          newPage.drawText(sectionName, {
            x: margin,
            y: yPosition,
            size: 14,
            font: helveticaBold,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= 30;

          // Draw content
          const cleanContent = content
            .replace(/^[#*\-•]\s*/gm, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .trim();

          const lines = cleanContent.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            
            // Word wrap
            const words = line.split(' ');
            let currentLine = '';
            
            for (const word of words) {
              const testLine = currentLine + (currentLine ? ' ' : '') + word;
              const textWidth = helveticaFont.widthOfTextAtSize(testLine, 11);
              
              if (textWidth > pageWidth - 2 * margin) {
                newPage.drawText(currentLine, {
                  x: margin,
                  y: yPosition,
                  size: 11,
                  font: helveticaFont,
                  color: rgb(0.3, 0.3, 0.3),
                });
                yPosition -= lineHeight;
                currentLine = word;
                
                if (yPosition < 50) {
                  const anotherPage = pdfDoc.addPage([pageWidth, pageHeight]);
                  yPosition = 750;
                }
              } else {
                currentLine = testLine;
              }
            }
            
            if (currentLine) {
              newPage.drawText(currentLine, {
                x: margin,
                y: yPosition,
                size: 11,
                font: helveticaFont,
                color: rgb(0.3, 0.3, 0.3),
              });
              yPosition -= lineHeight;
            }
          }
          
          yPosition -= 20;
        } else {
          // Draw on current page
          contentPage.drawText(sectionName, {
            x: margin,
            y: yPosition,
            size: 14,
            font: helveticaBold,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= 30;

          const cleanContent = content
            .replace(/^[#*\-•]\s*/gm, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .trim();

          const lines = cleanContent.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            
            const words = line.split(' ');
            let currentLine = '';
            
            for (const word of words) {
              const testLine = currentLine + (currentLine ? ' ' : '') + word;
              const textWidth = helveticaFont.widthOfTextAtSize(testLine, 11);
              
              if (textWidth > pageWidth - 2 * margin) {
                contentPage.drawText(currentLine, {
                  x: margin,
                  y: yPosition,
                  size: 11,
                  font: helveticaFont,
                  color: rgb(0.3, 0.3, 0.3),
                });
                yPosition -= lineHeight;
                currentLine = word;
                
                if (yPosition < 50) break;
              } else {
                currentLine = testLine;
              }
            }
            
            if (currentLine && yPosition >= 50) {
              contentPage.drawText(currentLine, {
                x: margin,
                y: yPosition,
                size: 11,
                font: helveticaFont,
                color: rgb(0.3, 0.3, 0.3),
              });
              yPosition -= lineHeight;
            }
            
            if (yPosition < 100) break;
          }
          
          yPosition -= 20;
        }
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
