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
      // Match markdown headers (## or #)
      if (line.match(/^#{1,2}\s+/)) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        // Extract section title, remove numbers like "1. ", "2. ", etc.
        currentSection = line.replace(/^#{1,2}\s+/, '').replace(/^\d+\.\s+/, '').trim();
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

    // Extract data from Market KPIs section
    const marketSection = findSection(sections, ['Market KPIs', 'Market Performance', 'Current Market Conditions']);
    const medianPriceMatch = marketSection.match(/Median (?:House )?Price[:\s]+\$?([\d,]+)/i);
    const rentalYieldMatch = marketSection.match(/Gross (?:Rental )?Yield[:\s]+(\d+\.?\d*)%/i);
    const growthMatch = marketSection.match(/Annual (?:Capital )?Growth[:\s]+(-?\d+\.?\d*)%/i);
    
    // Extract demographics
    const demoSection = findSection(sections, ['Demographics & Demand Drivers', 'Demographics', 'Population']);
    const populationMatch = demoSection.match(/(?:Current )?Population[:\s]+(\d+)/i);
    const incomeMatch = demoSection.match(/Median (?:Household )?Income[:\s]+\$?([\d,]+)/i);

    return {
      medianPrice: medianPriceMatch ? medianPriceMatch[1] : (domainData.medianPrice || financialData.propertyValue || 'N/A'),
      rentalYield: rentalYieldMatch ? rentalYieldMatch[1] : (financialData.rentalYield || investmentScore.cashFlowScore || 'N/A'),
      growthRate: growthMatch ? growthMatch[1] : (domainData.growthRate || investmentScore.capitalGrowthScore || 'N/A'),
      population: populationMatch ? populationMatch[1] : (absData.population || domainData.population || 'N/A'),
      medianIncome: incomeMatch ? incomeMatch[1] : (absData.medianIncome || domainData.medianIncome || 'N/A'),
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

  const replaceContentSection = (container: HTMLElement, sectionIdentifiers: string[], content: string, maxLength = 800) => {
    if (!content) return;

    // Clean the content - remove markdown, bullets, excess whitespace
    const cleanContent = content
      .replace(/[#*•\-]/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, maxLength);

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
      const lowerText = text.toLowerCase();
      
      // Check if this text node contains any of our section identifiers
      const hasIdentifier = sectionIdentifiers.some(id => lowerText.includes(id.toLowerCase()));
      
      // Also check for placeholder text patterns
      const isPlaceholder = text.includes('Lorem ipsum') || 
                           text.includes('Sample text') || 
                           text.includes('placeholder') ||
                           (text.length > 50 && text.includes('text'));
      
      if (hasIdentifier || isPlaceholder) {
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
      const marketData = extractMarketData(sections, report.enhanced_data);

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
      
      // Replace market data placeholders
      const marketDataReplacements: Record<string, string> = {
        '$750,000': marketData.medianPrice.toString().includes('$') 
          ? marketData.medianPrice.toString()
          : `$${marketData.medianPrice.toString()}`,
        '5.2%': marketData.rentalYield.toString().includes('%')
          ? marketData.rentalYield.toString()
          : `${marketData.rentalYield}%`,
        '12.5%': marketData.growthRate.toString().includes('%')
          ? marketData.growthRate.toString()
          : `${marketData.growthRate}%`,
        '15,423': marketData.population.toString(),
        '$82,500': marketData.medianIncome.toString().includes('$')
          ? marketData.medianIncome.toString()
          : `$${marketData.medianIncome.toString()}`,
      };

      Object.entries(marketDataReplacements).forEach(([placeholder, value]) => {
        if (value && value !== 'N/A') {
          replaceTextInElement(container, placeholder, value);
        }
      });

      // Replace content sections with actual report content
      const sectionMappings = [
        {
          identifiers: ['location overview', 'location profile', 'suburb overview'],
          content: findSection(sections, ['Location Overview', 'Location Profile', 'Suburb Overview', 'Area Overview'])
        },
        {
          identifiers: ['market performance', 'market kpis', 'market analysis'],
          content: findSection(sections, ['Market KPIs', 'Market Performance', 'Market Analysis', 'Property Market', 'Current Market Conditions'])
        },
        {
          identifiers: ['demographics', 'demand drivers', 'population'],
          content: findSection(sections, ['Demographics & Demand Drivers', 'Demographics', 'Population Dynamics', 'Household Characteristics'])
        },
        {
          identifiers: ['infrastructure', 'amenities', 'transport'],
          content: findSection(sections, ['Infrastructure & Amenities', 'Transport Infrastructure', 'Education Facilities', 'Lifestyle & Recreation'])
        },
        {
          identifiers: ['investment score', 'overall score', 'rating'],
          content: findSection(sections, ['Overall Investment Score', 'Investment Score', 'Component Scores'])
        },
        {
          identifiers: ['risks', 'opportunities', 'key risks'],
          content: findSection(sections, ['Key Opportunities & Risks', 'Risk Assessment', 'Investment Risks'])
        }
      ];

      sectionMappings.forEach(({ identifiers, content }) => {
        if (content) {
          replaceContentSection(container, identifiers, content);
        }
      });

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
