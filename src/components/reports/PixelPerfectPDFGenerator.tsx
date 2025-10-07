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
      const marketData = extractMarketData(sections, report.enhanced_data);

      console.log('Parsed sections:', Object.keys(sections));
      console.log('Extracted market data:', marketData);

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
      
      // Replace all numeric market data placeholders
      const formatCurrency = (val: any) => {
        if (typeof val === 'number') return `$${val.toLocaleString()}`;
        if (typeof val === 'string' && !val.includes('$') && !val.includes('N/A')) return `$${val}`;
        return val;
      };

      const formatPercentage = (val: any) => {
        if (typeof val === 'number') return `${val.toFixed(1)}%`;
        if (typeof val === 'string' && !val.includes('%') && !val.includes('N/A')) return `${val}%`;
        return val;
      };

      const formatNumber = (val: any) => {
        if (typeof val === 'number') return val.toLocaleString();
        return val;
      };

      // Replace specific placeholder values with actual data
      if (marketData.medianPrice && marketData.medianPrice !== 'N/A') {
        replaceTextInElement(container, '$750,000', formatCurrency(marketData.medianPrice));
        replaceTextInElement(container, '$750000', formatCurrency(marketData.medianPrice));
      }
      
      if (marketData.rentalYield && marketData.rentalYield !== 'N/A') {
        replaceTextInElement(container, '5.2%', formatPercentage(marketData.rentalYield));
        replaceTextInElement(container, '5.2', formatPercentage(marketData.rentalYield));
      }
      
      if (marketData.growthRate && marketData.growthRate !== 'N/A') {
        replaceTextInElement(container, '12.5%', formatPercentage(marketData.growthRate));
        replaceTextInElement(container, '12.5', formatPercentage(marketData.growthRate));
      }

      if (marketData.population && marketData.population !== 'N/A') {
        replaceTextInElement(container, '15,000', formatNumber(marketData.population));
        replaceTextInElement(container, '15000', formatNumber(marketData.population));
      }

      if (marketData.medianIncome && marketData.medianIncome !== 'N/A') {
        replaceTextInElement(container, '$85,000', formatCurrency(marketData.medianIncome));
        replaceTextInElement(container, '$85000', formatCurrency(marketData.medianIncome));
      }

      // Map and replace content sections
      const sectionMappings = [
        {
          identifiers: ['Location Overview', 'Location Profile', 'Area Description'],
          content: findSection(sections, ['Location Overview', 'Location Profile', 'Suburb Overview', 'Area Overview'])
        },
        {
          identifiers: ['Market Performance', 'Market Analysis', 'Property Market'],
          content: findSection(sections, ['Market KPIs', 'Market Performance', 'Market Analysis', 'Property Market'])
        },
        {
          identifiers: ['Demographics', 'Population', 'Demand Drivers'],
          content: findSection(sections, ['Demographics & Demand Drivers', 'Demographics', 'Population'])
        },
        {
          identifiers: ['Infrastructure', 'Amenities', 'Development'],
          content: findSection(sections, ['Infrastructure & Development', 'Infrastructure', 'Amenities'])
        },
        {
          identifiers: ['Investment Score', 'Investment Rating', 'Score'],
          content: findSection(sections, ['Investment Score', 'Investment Rating', 'Overall Score'])
        },
        {
          identifiers: ['Risks', 'Opportunities', 'Risk Assessment'],
          content: findSection(sections, ['Risks & Opportunities', 'Risk Factors', 'Opportunities'])
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
