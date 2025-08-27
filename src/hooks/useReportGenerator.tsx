import { useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PropertyListing } from '@/lib/airtable';
import { ReportConfig } from '@/components/reports/ReportConfigModal';
import { toast } from '@/hooks/use-toast';

export function useReportGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateReport = async (
    config: ReportConfig, 
    allListings: PropertyListing[],
    chartRefs: {
      kpis?: HTMLElement | null;
      advancedAnalytics?: HTMLElement | null;
      temporalAnalysis?: HTMLElement | null;
      suburbChart?: HTMLElement | null;
      propertyTypeChart?: HTMLElement | null;
      priceRangeChart?: HTMLElement | null;
      bedroomChart?: HTMLElement | null;
      geographicAnalysis?: HTMLElement | null;
      agentPerformance?: HTMLElement | null;
      executiveInsights?: HTMLElement | null;
    }
  ) => {
    setIsGenerating(true);
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      let currentY = margin;

      // Helper function to add a new page if needed
      const checkPageBreak = (neededHeight: number) => {
        if (currentY + neededHeight > pageHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }
      };

      // Title Page
      pdf.setFontSize(24);
      pdf.setFont('helvetica', 'bold');
      pdf.text(config.title, pageWidth / 2, currentY + 20, { align: 'center' });
      currentY += 40;

      if (config.description) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        const descLines = pdf.splitTextToSize(config.description, pageWidth - 2 * margin);
        pdf.text(descLines, pageWidth / 2, currentY, { align: 'center' });
        currentY += descLines.length * 6 + 10;
      }

      // Report metadata
      pdf.setFontSize(10);
      pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, margin, currentY);
      currentY += 6;
      
      if (config.authorName) {
        pdf.text(`Author: ${config.authorName}`, margin, currentY);
        currentY += 6;
      }
      
      if (config.companyName) {
        pdf.text(`Company: ${config.companyName}`, margin, currentY);
        currentY += 6;
      }

      currentY += 20;

      // Calculate metrics
      const totalListings = allListings.length;
      const avgPrice = allListings.length > 0 
        ? Math.round(allListings.reduce((sum, listing) => sum + (listing.price || 0), 0) / allListings.length)
        : 0;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentListings = allListings.filter(listing => {
        const receivedAt = listing.receivedAt;
        return receivedAt && new Date(receivedAt) >= thirtyDaysAgo;
      }).length;

      const suburbData = allListings.reduce((acc, listing) => {
        const suburb = listing.suburb || listing.location || 'Unknown';
        acc[suburb] = (acc[suburb] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // KPIs Section
      if (config.includeKPIs) {
        checkPageBreak(60);
        
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Key Metrics', margin, currentY);
        currentY += 15;

        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        
        const kpiData = [
          [`Total Listings`, totalListings.toLocaleString()],
          [`Average Price`, `$${avgPrice.toLocaleString()}`],
          [`Recent Listings (30 days)`, recentListings.toLocaleString()],
          [`Unique Suburbs`, Object.keys(suburbData).length.toLocaleString()]
        ];

        kpiData.forEach(([label, value]) => {
          pdf.text(`${label}: ${value}`, margin, currentY);
          currentY += 8;
        });
        
        currentY += 15;
      }

      // Helper function to capture and add chart
      const addChartToPDF = async (chartRef: HTMLElement | null, title: string) => {
        if (!chartRef) return;
        
        checkPageBreak(80);
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, margin, currentY);
        currentY += 15;

        try {
          const canvas = await html2canvas(chartRef, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
          });

          const imgWidth = pageWidth - 2 * margin;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          
          checkPageBreak(imgHeight + 10);
          
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', margin, currentY, imgWidth, imgHeight);
          currentY += imgHeight + 20;
        } catch (error) {
          console.error(`Error capturing ${title}:`, error);
          pdf.setFontSize(10);
          pdf.text(`Error capturing ${title} chart`, margin, currentY);
          currentY += 15;
        }
      };

      // Add advanced analytics and insights
      if (chartRefs.advancedAnalytics) {
        await addChartToPDF(chartRefs.advancedAnalytics, 'Advanced Market Analytics');
      }

      if (chartRefs.executiveInsights) {
        await addChartToPDF(chartRefs.executiveInsights, 'Executive Insights & Recommendations');
      }

      if (chartRefs.temporalAnalysis) {
        await addChartToPDF(chartRefs.temporalAnalysis, 'Temporal Analysis');
      }

      if (chartRefs.geographicAnalysis) {
        await addChartToPDF(chartRefs.geographicAnalysis, 'Geographic Analysis');
      }

      if (chartRefs.agentPerformance) {
        await addChartToPDF(chartRefs.agentPerformance, 'Agent & Agency Performance');
      }

      // Add original charts based on configuration
      if (config.includeSuburbChart && chartRefs.suburbChart) {
        await addChartToPDF(chartRefs.suburbChart, 'Listings by Suburb');
      }

      if (config.includePropertyTypeChart && chartRefs.propertyTypeChart) {
        await addChartToPDF(chartRefs.propertyTypeChart, 'Property Type Distribution');
      }

      if (config.includePriceRangeChart && chartRefs.priceRangeChart) {
        await addChartToPDF(chartRefs.priceRangeChart, 'Price Range Distribution');
      }

      if (config.includeBedroomChart && chartRefs.bedroomChart) {
        await addChartToPDF(chartRefs.bedroomChart, 'Bedroom Distribution');
      }

      // Custom Notes Section
      if (config.customNotes && config.customNotes.trim()) {
        checkPageBreak(40);
        
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Additional Notes', margin, currentY);
        currentY += 15;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        const noteLines = pdf.splitTextToSize(config.customNotes, pageWidth - 2 * margin);
        noteLines.forEach((line: string) => {
          checkPageBreak(6);
          pdf.text(line, margin, currentY);
          currentY += 6;
        });
      }

      // Save the PDF
      const fileName = `${config.title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      // Fire webhook notification
      try {
        const webhookPayload = {
          event: "report_generated",
          timestamp: new Date().toISOString(),
          report: {
            title: config.title,
            description: config.description,
            author: config.authorName,
            company: config.companyName,
            fileName: fileName,
            metrics: {
              totalListings,
              averagePrice: avgPrice,
              recentListings,
              uniqueSuburbs: Object.keys(suburbData).length
            }
          }
        };

        await fetch('https://hook.eu2.make.com/rwayg51jnfmljlv1xgdndt4kps6rhw86', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload),
        });

        console.log('Webhook notification sent successfully');
      } catch (webhookError) {
        console.error('Failed to send webhook notification:', webhookError);
        // Don't fail the report generation if webhook fails
      }

      toast({
        title: "Report Generated",
        description: `${fileName} has been downloaded successfully.`,
      });

    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Error",
        description: "Failed to generate report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    generateReport,
    isGenerating,
  };
}