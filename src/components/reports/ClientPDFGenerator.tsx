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
    // Extract sections from markdown content
    const sections: Record<string, string> = {};
    const lines = content.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    lines.forEach(line => {
      if (line.startsWith('##')) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        currentSection = line.replace('##', '').trim();
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    });

    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  };

  const generateClientPDF = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - 2 * margin;

      const { suburb, state } = extractSuburbState(report.property_address);
      const sections = parseReportContent(report.report_content);

      // Helper function to add new page with header
      const addPageWithHeader = (title: string) => {
        doc.addPage();
        doc.setFillColor(220, 220, 220);
        doc.rect(0, 0, pageWidth, 30, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);
        doc.text('SUBURB SNAPSHOT', margin, 20);
      };

      // Page 1: Cover Page
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      doc.setFontSize(32);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('NAIDU PROPERTY', pageWidth / 2, 80, { align: 'center' });
      
      doc.setFontSize(28);
      doc.text('CONSULTING SERVICES', pageWidth / 2, 100, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'normal');
      doc.text('YOUR DEDICATED PROPERTY PARTNER', pageWidth / 2, 120, { align: 'center' });

      // Page 2: Location & Profile
      addPageWithHeader('Location & Profile');
      let yPos = 45;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('LOCATION', margin, yPos);
      yPos += 10;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(`SUBURB / AREA: ${suburb.toUpperCase()}`, margin, yPos);
      yPos += 7;
      doc.text(`STATE: ${state}`, margin, yPos);
      yPos += 12;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('PROFILE', margin, yPos);
      yPos += 10;

      // Extract profile from report content
      const profileText = String(
        sections['Property Overview'] || 
        sections['Location Profile'] || 
        report.location_intelligence?.description || 
        'Profile data not available'
      );
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const profileLines = doc.splitTextToSize(profileText.substring(0, 800), contentWidth);
      doc.text(profileLines, margin, yPos);

      // Page 3: Property Market
      addPageWithHeader('Property Market');
      yPos = 45;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('PROPERTY MARKET', margin, yPos);
      yPos += 15;

      // Extract financial data
      const financials = report.financial_calculations || {};
      const medianPrice = financials.medianPrice || 'N/A';
      const weeklyRent = financials.weeklyRent || 'N/A';
      const rentalYield = financials.rentalYield || 'N/A';

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      
      doc.text('MEDIAN HOUSE PRICE', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`$${typeof medianPrice === 'number' ? medianPrice.toLocaleString() : medianPrice}`, margin + 80, yPos);
      yPos += 10;

      doc.setFont('helvetica', 'bold');
      doc.text('MEDIAN WEEKLY RENT', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`$${weeklyRent}/WK`, margin + 80, yPos);
      yPos += 10;

      doc.setFont('helvetica', 'bold');
      doc.text('GROSS RENTAL YIELD', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(`${rentalYield}%`, margin + 80, yPos);

      // Page 4: Market Performance
      addPageWithHeader('Market Performance');
      yPos = 45;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('MARKET PERFORMANCE', margin, yPos);
      yPos += 15;

      const performanceText = String(
        sections['Market Analysis'] || 
        sections['Investment Potential'] || 
        'Market performance data being collected from enhanced APIs'
      );
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const perfLines = doc.splitTextToSize(performanceText.substring(0, 600), contentWidth);
      doc.text(perfLines, margin, yPos);

      // Page 5: Demographics
      addPageWithHeader('Demographics');
      yPos = 45;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('DEMOGRAPHICS', margin, yPos);
      yPos += 15;

      const demographics = report.demographics_data || {};
      const demoText = String(
        sections['Demographics'] || 
        `Population: ${demographics.population || 'N/A'}\n` +
        `Median Age: ${demographics.medianAge || 'N/A'}\n` +
        `Household Types: ${demographics.householdTypes || 'Data available via enhanced APIs'}`
      );

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const demoLines = doc.splitTextToSize(demoText, contentWidth);
      doc.text(demoLines, margin, yPos);

      // Page 6: Infrastructure & Amenities
      addPageWithHeader('Infrastructure & Amenities');
      yPos = 45;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('INFRASTRUCTURE & AMENITIES', margin, yPos);
      yPos += 15;

      const infraText = String(
        sections['Infrastructure'] || 
        sections['Location Profile'] ||
        (typeof report.location_intelligence?.amenities === 'string' 
          ? report.location_intelligence.amenities 
          : JSON.stringify(report.location_intelligence?.amenities || {})) ||
        'Infrastructure details available in full report'
      );

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const infraLines = doc.splitTextToSize(infraText.substring(0, 800), contentWidth);
      doc.text(infraLines, margin, yPos);

      // Page 7: Key Investor Insights
      addPageWithHeader('Key Investor Insights');
      yPos = 45;

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(41, 128, 185);
      doc.text('KEY INVESTOR INSIGHTS', margin, yPos);
      yPos += 15;

      const insights = String(
        sections['Investment Recommendation'] || 
        sections['Conclusion'] ||
        'Investment insights based on comprehensive market analysis'
      );

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const insightLines = doc.splitTextToSize(insights, contentWidth);
      doc.text(insightLines, margin, yPos);

      // Investment Score if available
      if (report.investment_score) {
        yPos += insightLines.length * 5 + 10;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(41, 128, 185);
        doc.text(`INVESTMENT SCORE: ${report.investment_score.score || 'N/A'}/10`, margin, yPos);
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
