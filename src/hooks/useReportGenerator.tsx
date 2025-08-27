import { useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PropertyListing } from '@/lib/airtable';
import { ReportConfig } from '@/components/reports/ReportConfigModal';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { quickChartService } from '@/lib/quickchart';

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
        const suburb = listing.suburb || 'Unknown';
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

      // Generate dynamic QuickChart URLs
      const chartUrls = await quickChartService.generateChartUrls(allListings);

      // Fire webhook notification
      try {
        // Calculate analytics data
        const now = new Date();
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const last60Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

        const recent30 = allListings.filter(l => l.receivedAt && new Date(l.receivedAt) >= last30Days);
        const previous30 = allListings.filter(l => 
          l.receivedAt && 
          new Date(l.receivedAt) >= last60Days && 
          new Date(l.receivedAt) < last30Days
        );

        const velocityChange = previous30.length > 0 
          ? ((recent30.length - previous30.length) / previous30.length * 100) 
          : 0;

        // Price analytics
        const pricesWithData = allListings.filter(l => l.price && l.price > 0).map(l => l.price!);
        const sortedPrices = pricesWithData.sort((a, b) => a - b);
        
        const median = sortedPrices.length > 0 
          ? sortedPrices[Math.floor(sortedPrices.length / 2)] 
          : 0;
        
        const q1 = sortedPrices.length > 0 
          ? sortedPrices[Math.floor(sortedPrices.length * 0.25)] 
          : 0;
        
        const q3 = sortedPrices.length > 0 
          ? sortedPrices[Math.floor(sortedPrices.length * 0.75)] 
          : 0;

        // Quality metrics
        const withConfidence = allListings.filter(l => l.confidence && l.confidence > 0);
        const avgConfidence = withConfidence.length > 0
          ? withConfidence.reduce((sum, l) => sum + l.confidence!, 0) / withConfidence.length
          : 0;

        const dataCompleteness = allListings.length > 0 
          ? allListings.reduce((sum, l) => {
              let fields = 0;
              let filledFields = 0;
              
              ['address', 'suburb', 'propertyType', 'price', 'beds', 'baths', 'agencyName'].forEach(field => {
                fields++;
                if (l[field as keyof PropertyListing]) filledFields++;
              });
              
              return sum + (filledFields / fields);
            }, 0) / allListings.length * 100
          : 0;

        // Market insights
        const marketSaturation = Object.values(suburbData).reduce((sum, count) => {
          return sum + (count > 10 ? 1 : 0);
        }, 0);

        // Generate insights
        const insights = [];
        if (velocityChange > 15) {
          insights.push({
            category: "positive",
            priority: "high",
            severity: "low",
            text: `Strong market momentum with ${velocityChange.toFixed(1)}% increase in listings volume.`
          });
        } else if (velocityChange < -15) {
          insights.push({
            category: "warning",
            priority: "medium",
            severity: "medium",
            text: `Market activity declining with ${Math.abs(velocityChange).toFixed(1)}% decrease in listings.`
          });
        }

        if (avgConfidence < 0.6) {
          insights.push({
            category: "warning",
            priority: "high",
            severity: "medium",
            text: `Data quality concerns detected - average confidence only ${(avgConfidence * 100).toFixed(1)}%.`
          });
        }

        // Sample listings (first 5 with required fields)
        const sampleListings = allListings
          .filter(l => l.address && l.suburb && l.price)
          .slice(0, 5)
          .map(l => ({
            address: l.address || '',
            suburb: l.suburb || '',
            state: 'WA', // Default as property doesn't exist
            postcode: '', // Default as property doesn't exist
            property_type: l.propertyType || '',
            price: l.price || 0,
            beds: l.beds || 0,
            baths: l.baths || 0,
            car: l.carSpaces || 0,
            confidence: l.confidence || 0
          }));

        const webhookPayload = {
          report: {
            config: {
              title: config.title,
              description: config.description,
              author_name: config.authorName,
              company_name: config.companyName,
              generation_date: new Date().toLocaleString(),
              custom_notes: config.customNotes,
              include_kpis: config.includeKPIs,
              include_suburb_chart: config.includeSuburbChart,
              include_property_type_chart: config.includePropertyTypeChart,
              include_price_range_chart: config.includePriceRangeChart,
              include_bedroom_chart: config.includeBedroomChart
            },
            kpis: {
              total_listings: totalListings,
              avg_price: avgPrice,
              recent_30d: recentListings,
              unique_suburbs: Object.keys(suburbData).length
            },
            analytics: {
              velocity: {
                label: velocityChange > 0 ? "Uptrend" : velocityChange < 0 ? "Downtrend" : "Stable",
                delta: velocityChange
              },
              price: {
                median: median,
                q1: q1,
                q3: q3,
                iqr: q3 - q1
              },
              quality: {
                avg_confidence: avgConfidence,
                completeness: Math.round(dataCompleteness)
              },
              coverage: {
                suburbs: Object.keys(suburbData).length,
                saturation: marketSaturation > 5 ? "High" : marketSaturation > 2 ? "Medium" : "Low"
              }
            },
            insights: insights,
            charts: {
              daily_activity_url: "https://placeholder.com/daily.png",
              avg_price_url: "https://placeholder.com/avg.png",
              confidence_url: "https://placeholder.com/conf.png",
              suburb_matrix_url: "https://placeholder.com/matrix.png",
              suburb_volume_url: chartUrls.suburb_bar_url,
              price_volume_scatter_url: "https://placeholder.com/scatter.png",
              agency_size_url: "https://placeholder.com/agency.png",
              agent_volume_url: "https://placeholder.com/agent.png",
              suburb_bar_url: chartUrls.suburb_bar_url,
              property_type_pie_url: chartUrls.property_type_pie_url,
              price_range_bar_url: chartUrls.price_range_bar_url,
              bedroom_bar_url: chartUrls.bedroom_bar_url
            },
            listings: sampleListings,
            generated_at: new Date().toISOString()
          }
        };

        // Store report in Supabase
        const { data: reportData, error: reportError } = await supabase
          .from('generated_reports')
          .insert({
            title: config.title,
            description: config.description,
            config: config,
            kpis: webhookPayload.report.kpis,
            analytics: webhookPayload.report.analytics,
            insights: webhookPayload.report.insights,
            chart_urls: webhookPayload.report.charts,
            listing_count: totalListings,
            webhook_url: 'https://hook.eu2.make.com/rwayg51jnfmljlv1xgdndt4kps6rhw86',
            webhook_sent: false
          })
          .select()
          .single();

        if (reportError) {
          console.error('Error storing report:', reportError);
        }

        // Send webhook
        await fetch('https://hook.eu2.make.com/rwayg51jnfmljlv1xgdndt4kps6rhw86', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload),
        });

        // Update webhook status if report was stored successfully
        if (reportData) {
          await supabase
            .from('generated_reports')
            .update({ webhook_sent: true })
            .eq('id', reportData.id);
        }

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