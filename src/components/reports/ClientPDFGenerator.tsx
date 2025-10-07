import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useToast } from '@/hooks/use-toast';
import { ClientPDFTemplate } from './ClientPDFTemplate';
import { createRoot } from 'react-dom/client';

interface InvestmentReportData {
  id: string;
  property_address: string;
  report_content: string;
  demographics_data?: any;
  economic_data?: any;
  financial_calculations?: any;
  investment_score?: any;
  location_intelligence?: any;
}

interface ClientPDFGeneratorProps {
  report: InvestmentReportData;
}

export function ClientPDFGenerator({ report }: ClientPDFGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const extractSuburbState = (address: string) => {
    const parts = address.split(',').map(p => p.trim());
    const suburb = parts[0] || 'Unknown';
    const stateMatch = address.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/);
    const state = stateMatch ? `${stateMatch[0]}` : 'Unknown';
    return { suburb, state };
  };

  const parseReportContent = (content: string) => {
    const sections: Record<string, string> = {};
    const lines = content.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    lines.forEach(line => {
      const headingMatch = line.match(/^#{1,2}\s+(.+)/);
      if (headingMatch) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        currentSection = headingMatch[1].trim();
        currentContent = [];
      } else if (currentSection && line.trim()) {
        currentContent.push(line);
      }
    });

    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    console.log('Parsed sections:', Object.keys(sections));
    return sections;
  };

  const findSection = (sections: Record<string, string>, possibleNames: string[], sectionType: string): string => {
    // Try exact match first
    for (const name of possibleNames) {
      if (sections[name]) {
        console.log(`✓ Found exact match for ${sectionType}: "${name}"`);
        return sections[name];
      }
    }
    
    // Try partial match (case insensitive)
    for (const name of possibleNames) {
      const sectionKey = Object.keys(sections).find(key => 
        key.toLowerCase().includes(name.toLowerCase()) || 
        name.toLowerCase().includes(key.toLowerCase())
      );
      if (sectionKey) {
        console.log(`✓ Found partial match for ${sectionType}: "${sectionKey}" (searched: "${name}")`);
        return sections[sectionKey];
      }
    }
    
    console.log(`✗ No match found for ${sectionType}. Searched:`, possibleNames);
    return '';
  };

  const generateClientPDF = async () => {
    setIsGenerating(true);
    try {
      const { suburb, state } = extractSuburbState(report.property_address);
      const sections = parseReportContent(report.report_content);

      console.log('Report sections found:', Object.keys(sections));
      console.log('Full report content length:', report.report_content.length);

      // Extract content intelligently with actual report section names
      const profileContent = findSection(sections, [
        '1. Location Overview',
        'Location Overview',
        'Property Overview',
        'Executive Summary', 
        'Location Profile',
        'Overview',
        'Introduction'
      ], 'Profile') || Object.values(sections)[0] || 'Comprehensive property analysis report';

      const performanceContent = findSection(sections, [
        '2. Market KPIs',
        'Market KPIs',
        '9. Financial Analysis',
        'Financial Analysis',
        'Market Performance',
        'Market Analysis',
        'Growth Analysis',
        'Investment Potential',
        'Market Trends'
      ], 'Performance') || 'Market performance data available in full report';

      const demographicsContent = findSection(sections, [
        '3. Demographics & Demand Drivers',
        'Demographics & Demand Drivers',
        'Demographics',
        'Population Analysis',
        'Community Profile',
        'Demographic Profile'
      ], 'Demographics') || 'Demographics analysis available in full report';

      const infrastructureContent = findSection(sections, [
        '4. Infrastructure & Amenities',
        'Infrastructure & Amenities',
        'Infrastructure',
        'Local Amenities',
        'Transport',
        'Facilities'
      ], 'Infrastructure') || 'Infrastructure details available in full report';

      const investmentInsights = findSection(sections, [
        '12. Key Opportunities & Risks',
        'Key Opportunities & Risks',
        '11. Overall Investment Score',
        'Overall Investment Score',
        'Investment Recommendation',
        'Key Insights',
        'Investment Analysis',
        'Conclusion',
        'Recommendation'
      ], 'Investment Insights') || 'Investment insights based on comprehensive analysis';

      // Extract financial data
      const financials = report.financial_calculations || {};
      const marketData = {
        medianPrice: financials.medianPrice ? `$${Number(financials.medianPrice).toLocaleString()}` : 'N/A',
        weeklyRent: financials.weeklyRent ? `$${financials.weeklyRent}/WK` : 'N/A',
        rentalYield: financials.rentalYield ? `${financials.rentalYield}%` : 'N/A',
      };

      console.log('Extracted content lengths:', {
        profile: profileContent.length,
        performance: performanceContent.length,
        demographics: demographicsContent.length,
        infrastructure: infrastructureContent.length,
        insights: investmentInsights.length,
      });

      // Create a temporary container
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      document.body.appendChild(container);

      // Render the template
      const root = createRoot(container);
      
      await new Promise<void>((resolve) => {
        root.render(
          <ClientPDFTemplate
            suburb={suburb}
            state={state}
            profileContent={profileContent}
            marketData={marketData}
            performanceContent={performanceContent}
            demographicsContent={demographicsContent}
            infrastructureContent={infrastructureContent}
            investmentInsights={investmentInsights}
            investmentScore={report.investment_score?.score}
          />
        );
        setTimeout(resolve, 2000); // Give time for rendering
      });

      // Convert to PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pages = container.querySelectorAll('.pdf-page');
      
      if (pages.length === 0) {
        throw new Error('No PDF pages found in template');
      }
      
      console.log(`Found ${pages.length} pages to render`);

      // Make container visible for proper rendering
      container.style.position = 'fixed';
      container.style.left = '0';
      container.style.top = '0';
      container.style.opacity = '0';
      container.style.zIndex = '-1';

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        
        console.log(`Capturing page ${i + 1}...`);
        
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#1a1a1a',
          logging: false,
          width: 794,
          height: 1123,
        });

        if (canvas.width === 0 || canvas.height === 0) {
          console.error(`Canvas ${i + 1} has zero dimensions`);
          continue;
        }

        const imgData = canvas.toDataURL('image/png', 1.0);
        
        if (i > 0) {
          pdf.addPage();
        }
        
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
        
        console.log(`Page ${i + 1} rendered successfully`);
      }

      // Cleanup
      root.unmount();
      document.body.removeChild(container);

      // Save PDF
      const fileName = `${suburb.replace(/\s+/g, '_')}_Suburb_Snapshot.pdf`;
      pdf.save(fileName);

      toast({
        title: "PDF Generated Successfully",
        description: `Client template PDF downloaded as ${fileName}`,
      });

    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate client PDF template",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={generateClientPDF}
      disabled={isGenerating}
      variant="outline"
      size="sm"
      className="w-full"
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Generating Client PDF...
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4 mr-2" />
          Generate Client PDF
        </>
      )}
    </Button>
  );
}
