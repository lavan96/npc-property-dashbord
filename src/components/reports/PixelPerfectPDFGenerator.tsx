import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
      if (line.startsWith('##')) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        currentSection = line.replace(/^##\s*/, '').trim();
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

  const extractMarketData = (enhancedData: any) => {
    const domainData = enhancedData?.domainData || {};
    const financialData = enhancedData?.financialData || {};
    const investmentScore = enhancedData?.investmentScore || {};
    const absData = enhancedData?.absData || {};
    const locationData = enhancedData?.locationData || {};

    return {
      medianPrice: domainData.medianPrice || financialData.propertyValue || 'N/A',
      rentalYield: financialData.rentalYield || investmentScore.cashFlowScore || 'N/A',
      growthRate: domainData.growthRate || investmentScore.capitalGrowthScore || 'N/A',
      population: absData.population || domainData.population || 'N/A',
      medianAge: absData.medianAge || domainData.medianAge || 'N/A',
      medianIncome: absData.medianIncome || domainData.medianIncome || 'N/A',
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

  const replaceContentSection = (container: HTMLElement, sectionMarker: string, content: string) => {
    // Find elements that might contain the section content
    // This will look for divs or text elements that contain section identifiers
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
      
      // Look for section markers or placeholder content
      if (text.includes(sectionMarker) || text.includes('Lorem ipsum') || text.includes('Sample text')) {
        // Replace with actual content, truncated to reasonable length
        const cleanContent = content.substring(0, 500).replace(/[#*\n]/g, ' ').trim();
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
      const marketData = extractMarketData(report.enhanced_data);

      // Load the HTML template
      const response = await fetch('/templates/npc_suburb_snapshot_pixel_perfect.html');
      const htmlContent = await response.text();

      // Create a temporary container
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.innerHTML = htmlContent;
      document.body.appendChild(container);

      // Replace placeholders with actual data
      replaceTextInElement(container, 'NORTH ROTHBURY', suburb);
      replaceTextInElement(container, 'NSW', state);
      
      // Replace market data if found
      const marketDataReplacements = {
        '$750,000': typeof marketData.medianPrice === 'number' 
          ? `$${marketData.medianPrice.toLocaleString()}` 
          : marketData.medianPrice,
        '5.2%': typeof marketData.rentalYield === 'number'
          ? `${marketData.rentalYield.toFixed(1)}%`
          : marketData.rentalYield,
        '12.5%': typeof marketData.growthRate === 'number'
          ? `${marketData.growthRate.toFixed(1)}%`
          : marketData.growthRate,
      };

      Object.entries(marketDataReplacements).forEach(([placeholder, value]) => {
        replaceTextInElement(container, placeholder, value);
      });

      // Replace content sections with actual report content
      const locationOverview = findSection(sections, [
        'Location Overview',
        'Location Profile', 
        'Suburb Overview',
        'Area Overview'
      ]);
      
      const marketPerformance = findSection(sections, [
        'Market Performance',
        'Market Analysis',
        'Property Market'
      ]);

      if (locationOverview) {
        replaceContentSection(container, 'Location', locationOverview);
      }
      
      if (marketPerformance) {
        replaceContentSection(container, 'Market', marketPerformance);
      }

      // Wait for any fonts/images to load
      await new Promise(resolve => setTimeout(resolve, 500));

      // Find all pages in the template - pdf2htmlEX uses .pf class for page frames
      const pages = container.querySelectorAll('.pf, .page, [data-page], .pdf-page');
      
      if (pages.length === 0) {
        console.error('No pages found. Available classes:', container.querySelector('*')?.className);
        throw new Error('No pages found in template');
      }

      // Calculate PDF dimensions based on the first page's actual rendered size
      const firstPage = pages[0] as HTMLElement;
      const pageWidth = firstPage.offsetWidth;
      const pageHeight = firstPage.offsetHeight;
      
      // Convert pixels to mm (assuming 96 DPI: 1 inch = 25.4mm, 96px = 25.4mm)
      const pxToMm = 25.4 / 96;
      const pdfWidthMm = pageWidth * pxToMm;
      const pdfHeightMm = pageHeight * pxToMm;

      // Create PDF with dimensions matching the template
      const pdf = new jsPDF({
        orientation: pdfWidthMm > pdfHeightMm ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [pdfWidthMm, pdfHeightMm],
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Capture each page
      for (let i = 0; i < pages.length; i++) {
        const pageElement = pages[i] as HTMLElement;
        
        const canvas = await html2canvas(pageElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        if (i > 0) {
          pdf.addPage();
        }
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }

      // Clean up
      document.body.removeChild(container);

      // Save PDF
      const fileName = `${suburb}_${state}_Investment_Report.pdf`;
      pdf.save(fileName);

      toast.success('PDF generated successfully!');
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
