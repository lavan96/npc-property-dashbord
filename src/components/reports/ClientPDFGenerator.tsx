import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import jsPDF from 'jspdf';
import { useToast } from '@/hooks/use-toast';

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
    const state = parts[parts.length - 1]?.match(/\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/)?.[0] || 'Unknown';
    return { suburb, state };
  };

  const parseReportContent = (content: string) => {
    // Extract sections from markdown content - handle both ## and # headings
    const sections: Record<string, string> = {};
    const lines = content.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    lines.forEach(line => {
      // Match headings (## or #)
      const headingMatch = line.match(/^#{1,2}\s+(.+)/);
      if (headingMatch) {
        // Save previous section
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        currentSection = headingMatch[1].trim();
        currentContent = [];
      } else if (currentSection && line.trim()) {
        // Only add non-empty lines
        currentContent.push(line);
      }
    });

    // Save last section
    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  };

  const cleanMarkdown = (text: string): string => {
    // Remove markdown formatting for PDF
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
      .replace(/\*(.+?)\*/g, '$1') // Italic
      .replace(/`(.+?)`/g, '$1') // Code
      .replace(/^[-*]\s+/gm, '• ') // Bullet points
      .replace(/^\d+\.\s+/gm, '') // Numbered lists
      .trim();
  };

  const generateClientPDF = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - 2 * margin;
      const brandBlue = [41, 128, 185]; // RGB for #2980b9

      const { suburb, state } = extractSuburbState(report.property_address);
      const sections = parseReportContent(report.report_content);

      // Helper function to add new page with header
      const addPageWithHeader = (title: string) => {
        doc.addPage();
        // Gray header bar
        doc.setFillColor(230, 230, 230);
        doc.rect(0, 0, pageWidth, 35, 'F');
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60, 60, 60);
        doc.text('SUBURB SNAPSHOT', margin, 22);
      };

      // Helper to add section with better formatting
      const addSection = (title: string, content: string, yStart: number): number => {
        let yPos = yStart;
        
        // Section title
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(brandBlue[0], brandBlue[1], brandBlue[2]);
        doc.text(title.toUpperCase(), margin, yPos);
        yPos += 8;

        // Section content
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        
        const cleanedContent = cleanMarkdown(content);
        const lines = doc.splitTextToSize(cleanedContent, contentWidth);
        
        lines.forEach((line: string) => {
          if (yPos > pageHeight - 30) {
            addPageWithHeader('');
            yPos = 50;
          }
          doc.text(line, margin, yPos);
          yPos += 5;
        });
        
        return yPos + 5;
      };

      // Page 1: Cover Page
      doc.setFillColor(brandBlue[0], brandBlue[1], brandBlue[2]);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      doc.setFontSize(36);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('NAIDU PROPERTY', pageWidth / 2, 90, { align: 'center' });
      
      doc.setFontSize(30);
      doc.text('CONSULTING SERVICES', pageWidth / 2, 115, { align: 'center' });
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.text('YOUR DEDICATED PROPERTY PARTNER', pageWidth / 2, 140, { align: 'center' });
      
      // Add property address on cover
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(suburb.toUpperCase(), pageWidth / 2, 170, { align: 'center' });
      doc.setFontSize(12);
      doc.text(state, pageWidth / 2, 180, { align: 'center' });

      // Page 2: Location & Profile
      addPageWithHeader('Location & Profile');
      let yPos = 50;

      // Location section
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(brandBlue[0], brandBlue[1], brandBlue[2]);
      doc.text('LOCATION', margin, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(`SUBURB / AREA: ${suburb.toUpperCase()}`, margin, yPos);
      yPos += 6;
      doc.text(`STATE: ${state}`, margin, yPos);
      yPos += 12;

      // Profile section - use actual report content
      const profileContent = sections['Property Overview'] || 
                            sections['Executive Summary'] ||
                            sections['Location Profile'] ||
                            sections['Overview'] ||
                            Object.values(sections)[0] || // First section if no match
                            'Comprehensive property analysis report';
      
      yPos = addSection('PROFILE', profileContent, yPos);

      // Page 3: Property Market
      addPageWithHeader('Property Market');
      yPos = 50;

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(brandBlue[0], brandBlue[1], brandBlue[2]);
      doc.text('PROPERTY MARKET', margin, yPos);
      yPos += 10;

      // Extract financial data from report or database
      const financials = report.financial_calculations || {};
      
      // Try to extract market data from report sections
      const marketSection = sections['Property Market'] || 
                           sections['Market Overview'] || 
                           sections['Financial Analysis'] || '';
      
      // Draw data table
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, yPos, contentWidth, 8, 'F');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text('MEDIAN HOUSE PRICE', margin + 2, yPos + 5);
      doc.setFont('helvetica', 'normal');
      const medianPrice = financials.medianPrice || financials.propertyValue || 'N/A';
      doc.text(`$${typeof medianPrice === 'number' ? medianPrice.toLocaleString() : medianPrice}`, margin + 100, yPos + 5);
      yPos += 10;

      doc.rect(margin, yPos, contentWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.text('MEDIAN WEEKLY RENT', margin + 2, yPos + 5);
      doc.setFont('helvetica', 'normal');
      const weeklyRent = financials.weeklyRent || financials.rentalIncome || 'N/A';
      doc.text(`$${weeklyRent}/WK`, margin + 100, yPos + 5);
      yPos += 10;

      doc.rect(margin, yPos, contentWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.text('GROSS RENTAL YIELD', margin + 2, yPos + 5);
      doc.setFont('helvetica', 'normal');
      const rentalYield = financials.rentalYield || financials.grossYield || 'N/A';
      doc.text(`${rentalYield}%`, margin + 100, yPos + 5);
      yPos += 15;

      // Add market analysis from report
      if (marketSection) {
        yPos = addSection('MARKET ANALYSIS', marketSection, yPos);
      }

      // Page 4: Market Performance
      addPageWithHeader('Market Performance');
      yPos = 50;

      const performanceContent = sections['Market Analysis'] || 
                                sections['Market Performance'] ||
                                sections['Growth Analysis'] ||
                                sections['Investment Potential'] || 
                                sections['Market Trends'] ||
                                'Comprehensive market performance analysis included in full report';
      
      yPos = addSection('MARKET PERFORMANCE', performanceContent, yPos);

      // Page 5: Demographics
      addPageWithHeader('Demographics');
      yPos = 50;

      const demographicsContent = sections['Demographics'] ||
                                 sections['Population Analysis'] ||
                                 sections['Community Profile'] ||
                                 'Demographics and community analysis available in full report';
      
      yPos = addSection('DEMOGRAPHICS', demographicsContent, yPos);

      // Page 6: Infrastructure & Amenities
      addPageWithHeader('Infrastructure & Amenities');
      yPos = 50;

      const infrastructureContent = sections['Infrastructure'] ||
                                   sections['Infrastructure & Amenities'] ||
                                   sections['Local Amenities'] ||
                                   sections['Transport'] ||
                                   'Infrastructure and amenities analysis available in full report';
      
      yPos = addSection('INFRASTRUCTURE & AMENITIES', infrastructureContent, yPos);

      // Page 7: Key Investor Insights
      addPageWithHeader('Key Investor Insights');
      yPos = 50;

      const insightsContent = sections['Investment Recommendation'] ||
                             sections['Key Insights'] ||
                             sections['Investment Analysis'] ||
                             sections['Conclusion'] ||
                             sections['Summary'] ||
                             'Comprehensive investment insights based on detailed market analysis';
      
      yPos = addSection('KEY INVESTOR INSIGHTS', insightsContent, yPos);

      // Investment Score if available
      if (report.investment_score?.score) {
        yPos += 10;
        doc.setFillColor(brandBlue[0], brandBlue[1], brandBlue[2]);
        doc.rect(margin, yPos, contentWidth, 15, 'F');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(`INVESTMENT SCORE: ${report.investment_score.score}/10`, pageWidth / 2, yPos + 10, { align: 'center' });
      }

      // Page 8: Contact & Disclaimer
      doc.addPage();
      yPos = 40;

      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('CONTACT US', margin, yPos);
      yPos += 15;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text('WEBSITE: npcservices.com.au', margin, yPos);
      yPos += 7;
      doc.text('EMAIL: admin@npcservices.com.au', margin, yPos);
      yPos += 7;
      doc.text('PHONE: 0433 005 110', margin, yPos);
      yPos += 15;

      doc.setFontSize(8);
      const disclaimer = 'AS A PROFESSIONAL PROPERTY CONSULTANT & BUYERS AGENT, WE PROVIDE INFORMATION AND ADVICE BASED ON OUR EXPERTISE AND EXPERIENCE IN THE REAL ESTATE MARKET. PLEASE BE AWARE THAT THE ADVICE AND INSIGHTS OFFERED ARE FOR GENERAL INFORMATIONAL PURPOSES ONLY AND SHOULD NOT BE CONSIDERED FINANCIAL ADVICE. WHILE WE STRIVE TO ENSURE THE ACCURACY AND RELEVANCE OF THE INFORMATION PROVIDED, REAL ESTATE MARKETS ARE DYNAMIC AND SUBJECT TO CHANGE AND WE CANNOT GUARANTEE THE FUTURE PERFORMANCE OR OUTCOMES OF ANY PROPERTY INVESTMENT.';
      
      const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
      doc.text(disclaimerLines, margin, yPos);

      // Save PDF
      const fileName = `${suburb.replace(/\s+/g, '_')}_Suburb_Snapshot.pdf`;
      doc.save(fileName);

      toast({
        title: "PDF Generated",
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
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Generating...
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
