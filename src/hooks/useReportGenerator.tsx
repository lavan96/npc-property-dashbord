import { useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PropertyListing } from '@/lib/airtable';
import { ReportConfig } from '@/components/reports/ReportConfigModal';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ChartData {
  type: 'bar' | 'pie' | 'line';
  title: string;
  data: Array<{ label: string; value: number; color?: string }>;
  width?: number;
  height?: number;
}

const generateChartImages = async (listings: PropertyListing[], config: ReportConfig) => {
  const charts: ChartData[] = [];

  // Process suburb data
  if (config.includeSuburbChart) {
    const suburbCounts = listings.reduce((acc, listing) => {
      const suburb = listing.suburb || 'Unknown';
      acc[suburb] = (acc[suburb] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedSuburbs = Object.entries(suburbCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    charts.push({
      type: 'bar',
      title: 'Listings by Suburb',
      data: sortedSuburbs.map(([suburb, count]) => ({
        label: suburb,
        value: count,
        color: '#3b82f6'
      }))
    });
  }

  // Process property type data
  if (config.includePropertyTypeChart) {
    const typeCounts = listings.reduce((acc, listing) => {
      const type = listing.propertyType || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    charts.push({
      type: 'pie',
      title: 'Property Type Distribution',
      data: Object.entries(typeCounts).map(([type, count], index) => ({
        label: type,
        value: count,
        color: colors[index % colors.length]
      }))
    });
  }

  // Process price range data
  if (config.includePriceRangeChart) {
    const ranges = [
      { label: 'Under $300k', min: 0, max: 300000 },
      { label: '$300k-$500k', min: 300000, max: 500000 },
      { label: '$500k-$750k', min: 500000, max: 750000 },
      { label: '$750k-$1M', min: 750000, max: 1000000 },
      { label: 'Over $1M', min: 1000000, max: Infinity }
    ];

    const rangeCounts = ranges.map(range => ({
      label: range.label,
      value: listings.filter(listing => {
        const price = listing.price || 0;
        return price >= range.min && price < range.max;
      }).length,
      color: '#10b981'
    }));

    charts.push({
      type: 'bar',
      title: 'Price Range Distribution',
      data: rangeCounts
    });
  }

  // Process bedroom data
  if (config.includeBedroomChart) {
    const bedroomCounts = listings.reduce((acc, listing) => {
      const beds = listing.beds || 0;
      const key = beds > 5 ? '5+' : beds.toString();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedBedrooms = ['1', '2', '3', '4', '5', '5+']
      .filter(key => bedroomCounts[key])
      .map(key => ({
        label: `${key} bedroom${key !== '1' ? 's' : ''}`,
        value: bedroomCounts[key] || 0,
        color: '#f59e0b'
      }));

    charts.push({
      type: 'bar',
      title: 'Bedroom Distribution',
      data: sortedBedrooms
    });
  }

  console.log('=== CHART GENERATION DEBUG ===');
  console.log('Listings count:', listings.length);
  console.log('Config:', config);
  console.log('Charts to generate:', charts.length);
  
  if (charts.length === 0) {
    console.warn('No charts to generate - all chart options disabled');
    return {};
  }

  charts.forEach((chart, index) => {
    console.log(`Chart ${index + 1}:`, {
      type: chart.type,
      title: chart.title,
      dataPoints: chart.data.length,
      sampleData: chart.data.slice(0, 2)
    });
  });

  try {
    console.log('Calling chart generation with payload:', JSON.stringify({ charts }, null, 2));
    
    // Call the chart generation function
    const { data, error } = await supabase.functions.invoke('generate-charts-python', {
      body: { charts }
    });

    if (error) {
      console.error('Supabase function error:', error);
      return {};
    }

    console.log('Python chart generation response:', data);
    console.log('Chart images keys:', Object.keys(data?.chartImages || {}));
    console.log('Chart images count:', Object.keys(data?.chartImages || {}).length);
    
    // Validate response
    if (!data || !data.chartImages || Object.keys(data.chartImages).length === 0) {
      console.warn('Empty or invalid chart images response from Python generator');
      return {};
    }
    
    return data.chartImages;
  } catch (error) {
    console.error('Error calling Python chart generation function:', error);
    return {};
  }
};

export function useReportGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');

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
    setProgress(0);
    setCurrentStep('Initializing report generation...');
    
    try {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated. Please log in to generate reports.');
      }
      
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

      setProgress(10);
      setCurrentStep('Creating PDF structure...');

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

      setProgress(50);
      setCurrentStep('Saving PDF report...');
      
      // Save the PDF
      const fileName = `${config.title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      setProgress(60);
      setCurrentStep('Generating AI-powered charts...');
      
      // Generate chart images using ChatGPT
      const chartImages = await generateChartImages(allListings, config);

      setProgress(80);
      setCurrentStep('Processing analytics and insights...');

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
            charts: chartImages,
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
            generated_by: (await supabase.auth.getUser()).data.user?.id,
            webhook_url: 'https://hook.eu2.make.com/rwayg51jnfmljlv1xgdndt4kps6rhw86',
            webhook_sent: false
          })
          .select()
          .single();

        if (reportError) {
          console.error('Error storing report:', reportError);
          throw new Error('Failed to store report in database');
        }

        // Store individual charts in the charts table
        console.log('=== CHART STORAGE DEBUG ===');
        console.log('Report data:', reportData);
        console.log('Chart images received:', Object.keys(chartImages));
        console.log('Chart images count:', Object.keys(chartImages).length);
        
        if (reportData && Object.keys(chartImages).length > 0) {
          console.log('Storing charts in database...');
          const chartRecords = Object.entries(chartImages).map(([chartType, imageData]) => {
            console.log(`Processing chart: ${chartType}`);
            return {
              report_id: reportData.id,
              chart_type: chartType.includes('pie') ? 'pie' : chartType.includes('line') ? 'line' : 'bar',
              title: chartType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              image_data: imageData as string,
              chart_config: {
                type: chartType,
                generated_at: new Date().toISOString()
              }
            };
          });

          console.log('Chart records to insert:', chartRecords.length);
          
          const { error: chartsError } = await supabase
            .from('charts')
            .insert(chartRecords);

          if (chartsError) {
            console.error('Error storing charts:', chartsError);
            // Don't fail the whole process if charts fail to store
          } else {
            console.log('Charts stored successfully!');
          }
        } else {
          console.warn('No charts to store - either no report data or no chart images generated');
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

      setProgress(100);
      setCurrentStep('Report generation complete!');
      
      toast({
        title: "Report Generated Successfully! 📊",
        description: `${fileName} has been downloaded and charts are available in the Charts page.`,
      });

    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Report Generation Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      setProgress(0);
      setCurrentStep('');
    }
  };

  return {
    generateReport,
    isGenerating,
    progress,
    currentStep,
  };
}