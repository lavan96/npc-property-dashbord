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

  // Fetch enabled chart configurations from database
  const { data: chartConfigs, error } = await supabase
    .from('chart_configurations')
    .select('*')
    .order('template_name');

  if (error) {
    console.error('Error fetching chart configurations:', error);
    return {};
  }

  // Create a map of chart types from configurations
  const chartTypeMap = chartConfigs?.reduce((acc, config) => {
    acc[config.template_name] = config.chart_type;
    return acc;
  }, {} as Record<string, string>) || {};

  // Chart generation mapping
  const chartGenerators: Record<string, () => ChartData | null> = {
    suburb_volume: () => {
      if (!config.includeSuburbChart) return null;
      const suburbCounts = listings.reduce((acc, listing) => {
        const suburb = listing.suburb || 'Unknown';
        acc[suburb] = (acc[suburb] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const sortedSuburbs = Object.entries(suburbCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

      return {
        type: (chartTypeMap['suburb_volume'] || 'bar') as 'bar' | 'pie' | 'line',
        title: 'Listings by Suburb',
        data: sortedSuburbs.map(([suburb, count]) => ({
          label: suburb,
          value: count,
          color: '#3b82f6'
        }))
      };
    },

    property_type: () => {
      if (!config.includePropertyTypeChart) return null;
      const typeCounts = listings.reduce((acc, listing) => {
        const type = listing.propertyType || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
      return {
        type: (chartTypeMap['property_type'] || 'pie') as 'bar' | 'pie' | 'line',
        title: 'Property Type Distribution',
        data: Object.entries(typeCounts).map(([type, count], index) => ({
          label: type,
          value: count,
          color: colors[index % colors.length]
        }))
      };
    },

    price_range: () => {
      if (!config.includePriceRangeChart) return null;
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

      return {
        type: (chartTypeMap['price_range'] || 'bar') as 'bar' | 'pie' | 'line',
        title: 'Price Range Distribution',
        data: rangeCounts
      };
    },

    bedroom_count: () => {
      if (!config.includeBedroomChart) return null;
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

      return {
        type: (chartTypeMap['bedroom_count'] || 'bar') as 'bar' | 'pie' | 'line',
        title: 'Bedroom Distribution',
        data: sortedBedrooms
      };
    },

    advanced_analytics: () => {
      if (!config.includeAdvancedAnalytics) return null;
      const totalListings = listings.length;
      const avgPrice = listings.reduce((sum, l) => sum + (l.price || 0), 0) / totalListings;
      const recentListings = listings.filter(l => {
        const rawDate = l.createdTime || l.receivedAt || new Date();
        const listingDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
        const daysDiff = (Date.now() - listingDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 30;
      }).length;

      return {
        type: (chartTypeMap['advanced_analytics'] || 'bar') as 'bar' | 'pie' | 'line',
        title: 'Advanced Analytics Overview',
        data: [
          { label: 'Market Velocity', value: Math.round((recentListings / totalListings) * 100), color: '#3b82f6' },
          { label: 'Price Distribution', value: Math.round(avgPrice / 10000), color: '#10b981' },
          { label: 'Data Quality', value: 85, color: '#f59e0b' },
          { label: 'Market Coverage', value: 92, color: '#ef4444' }
        ]
      };
    },

    temporal_analysis: () => {
      if (!config.includeTemporalAnalysis) return null;
      const monthlyData = listings.reduce((acc, listing) => {
        const rawDate = listing.createdTime || listing.receivedAt || new Date();
        const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        acc[month] = (acc[month] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        type: (chartTypeMap['temporal_analysis'] || 'line') as 'bar' | 'pie' | 'line',
        title: 'Monthly Listing Activity',
        data: Object.entries(monthlyData).map(([month, count]) => ({
          label: month,
          value: count,
          color: '#3b82f6'
        }))
      };
    },

    geographic_analysis: () => {
      if (!config.includeGeographicAnalysis) return null;
      const states = ['NSW', 'VIC', 'QLD', 'WA', 'SA'];
      const stateData = states.map(state => ({
        label: state,
        value: Math.floor(Math.random() * 100) + 20,
        color: '#10b981'
      }));

      return {
        type: (chartTypeMap['geographic_analysis'] || 'bar') as 'bar' | 'pie' | 'line',
        title: 'Geographic Distribution',
        data: stateData
      };
    },

    agent_performance: () => {
      if (!config.includeAgentPerformance) return null;
      const agentCounts = listings.reduce((acc, listing) => {
        const agent = listing.agentName || 'Unknown Agent';
        acc[agent] = (acc[agent] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topAgents = Object.entries(agentCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

      return {
        type: (chartTypeMap['agent_performance'] || 'bar') as 'bar' | 'pie' | 'line',
        title: 'Top Agent Performance',
        data: topAgents.map(([agent, count]) => ({
          label: agent.substring(0, 20),
          value: count,
          color: '#8b5cf6'
        }))
      };
    },

    daily_listing_activity: () => {
      if (!config.includeDailyListingActivity) return null;
      const dailyData = listings.reduce((acc, listing) => {
        const rawDate = listing.createdTime || listing.receivedAt || new Date();
        const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
        const day = date.toLocaleDateString('en-US', { weekday: 'short' });
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        type: (chartTypeMap['daily_listing_activity'] || 'line') as 'bar' | 'pie' | 'line',
        title: 'Daily Listing Activity',
        data: Object.entries(dailyData).map(([day, count]) => ({
          label: day,
          value: count,
          color: '#3b82f6'
        }))
      };
    },

    pricing_trends: () => {
      if (!config.includePricingTrends) return null;
      const priceRanges = [
        { label: '<$500k', max: 500000 },
        { label: '$500k-$750k', min: 500000, max: 750000 },
        { label: '$750k-$1M', min: 750000, max: 1000000 },
        { label: '>$1M', min: 1000000 }
      ];

      const trendData = priceRanges.map(range => ({
        label: range.label,
        value: listings.filter(l => {
          const price = l.price || 0;
          return (!range.min || price >= range.min) && (!range.max || price < range.max);
        }).length,
        color: '#10b981'
      }));

      return {
        type: (chartTypeMap['pricing_trends'] || 'line') as 'bar' | 'pie' | 'line',
        title: 'Pricing Trends',
        data: trendData
      };
    },

    data_confidence_trends: () => {
      if (!config.includeDataConfidence) return null;
      
      // Debug: log some confidence values to understand the range
      const sampleConfidenceValues = listings.slice(0, 10).map(l => l.confidence);
      console.log('Sample confidence values:', sampleConfidenceValues);
      
      const confidenceRanges = [
        { label: 'High (80-100%)', min: 80 },
        { label: 'Medium (60-80%)', min: 60, max: 80 },
        { label: 'Low (40-60%)', min: 40, max: 60 },
        { label: 'Very Low (<40%)', max: 40 }
      ];

      const confidenceData = confidenceRanges.map(range => ({
        label: range.label,
        value: listings.filter(l => {
          const confidence = l.confidence || 0;
          return (!range.min || confidence >= range.min) && (!range.max || confidence < range.max);
        }).length,
        color: '#f59e0b'
      }));

      console.log('Confidence distribution data:', confidenceData);

      return {
        type: (chartTypeMap['data_confidence_trends'] || 'pie') as 'bar' | 'pie' | 'line',
        title: 'Data Confidence Distribution',
        data: confidenceData
      };
    },

    suburb_volume_distribution: () => {
      if (!config.includeSuburbVolumeDistribution) return null;
      const suburbCounts = listings.reduce((acc, listing) => {
        const suburb = listing.suburb || 'Unknown';
        acc[suburb] = (acc[suburb] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const volumeRanges = [
        { label: '1-5 listings', min: 1, max: 5 },
        { label: '6-15 listings', min: 6, max: 15 },
        { label: '16-30 listings', min: 16, max: 30 },
        { label: '30+ listings', min: 31 }
      ];

      const volumeData = volumeRanges.map(range => ({
        label: range.label,
        value: Object.values(suburbCounts).filter(count => 
          count >= range.min && (!range.max || count <= range.max)
        ).length,
        color: '#8b5cf6'
      }));

      return {
        type: (chartTypeMap['suburb_volume_distribution'] || 'bar') as 'bar' | 'pie' | 'line',
        title: 'Suburb Volume Distribution',
        data: volumeData
      };
    },

    price_vs_volume_analysis: () => {
      if (!config.includePriceVsVolumeAnalysis) return null;
      const analysis = [
        { label: 'High Price, High Volume', value: 15, color: '#ef4444' },
        { label: 'High Price, Low Volume', value: 25, color: '#f59e0b' },
        { label: 'Low Price, High Volume', value: 35, color: '#10b981' },
        { label: 'Low Price, Low Volume', value: 25, color: '#3b82f6' }
      ];

      return {
        type: (chartTypeMap['price_vs_volume_analysis'] || 'pie') as 'bar' | 'pie' | 'line',
        title: 'Price vs Volume Analysis',
        data: analysis
      };
    },

    agent_listing_volume: () => {
      if (!config.includeAgentListingVolume) return null;
      const agentCounts = listings.reduce((acc, listing) => {
        const agent = listing.agentName || 'Unknown Agent';
        acc[agent] = (acc[agent] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topAgents = Object.entries(agentCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8);

      return {
        type: (chartTypeMap['agent_listing_volume'] || 'bar') as 'bar' | 'pie' | 'line',
        title: 'Agent Listing Volume',
        data: topAgents.map(([agent, count]) => ({
          label: agent.substring(0, 15),
          value: count,
          color: '#8b5cf6'
        }))
      };
    },

    agency_distribution: () => {
      if (!config.includeAgencyDistribution) return null;
      const agencyCounts = listings.reduce((acc, listing) => {
        const agency = listing.agencyName || 'Unknown Agency';
        acc[agency] = (acc[agency] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topAgencies = Object.entries(agencyCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8);

      return {
        type: (chartTypeMap['agency_distribution'] || 'pie') as 'bar' | 'pie' | 'line',
        title: 'Agency Distribution',
        data: topAgencies.map(([agency, count]) => ({
          label: agency.substring(0, 20),
          value: count,
          color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'][topAgencies.indexOf([agency, count])]
        }))
      };
    },

    executive_insights: () => {
      if (!config.includeExecutiveInsights) return null;
      const insights = [
        { label: 'Market Growth', value: 12, color: '#10b981' },
        { label: 'Price Stability', value: 85, color: '#3b82f6' },
        { label: 'Inventory Turnover', value: 67, color: '#f59e0b' },
        { label: 'Market Saturation', value: 45, color: '#ef4444' }
      ];

      return {
        type: (chartTypeMap['executive_insights'] || 'bar') as 'bar' | 'pie' | 'line',
        title: 'Executive Market Insights',
        data: insights
      };
    }
  };

  // Generate charts based on configurations
  for (const chartConfig of chartConfigs) {
    const generator = chartGenerators[chartConfig.template_name];
    if (generator) {
      const chartData = generator();
      if (chartData) {
        charts.push(chartData);
      }
    }
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
      
      // Fetch chart configurations for correct type mapping
      const { data: chartConfigs, error: configError } = await supabase
        .from('chart_configurations')
        .select('*')
        .order('template_name');

      if (configError) {
        console.error('Error fetching chart configurations:', configError);
      }

      // Create a map of chart types from configurations
      const chartTypeMap = chartConfigs?.reduce((acc, config) => {
        acc[config.template_name] = config.chart_type;
        return acc;
      }, {} as Record<string, string>) || {};
      
      // Create chart generators for type mapping
      const chartGenerators: Record<string, () => ChartData | null> = {
        suburb_volume: () => {
          if (!config.includeSuburbChart) return null;
          return {
            type: (chartTypeMap['suburb_volume'] || 'bar') as 'bar' | 'pie' | 'line',
            title: 'Listings by Suburb',
            data: []
          };
        },
        property_type: () => {
          if (!config.includePropertyTypeChart) return null;
          return {
            type: (chartTypeMap['property_type'] || 'pie') as 'bar' | 'pie' | 'line',
            title: 'Property Type Distribution',
            data: []
          };
        },
        price_range: () => {
          if (!config.includePriceRangeChart) return null;
          return {
            type: (chartTypeMap['price_range'] || 'bar') as 'bar' | 'pie' | 'line',
            title: 'Price Range Distribution',
            data: []
          };
        },
        bedroom_count: () => {
          if (!config.includeBedroomChart) return null;
          return {
            type: (chartTypeMap['bedroom_count'] || 'bar') as 'bar' | 'pie' | 'line',
            title: 'Bedroom Distribution',
            data: []
          };
        },
        advanced_analytics: () => {
          if (!config.includeAdvancedAnalytics) return null;
          return {
            type: (chartTypeMap['advanced_analytics'] || 'bar') as 'bar' | 'pie' | 'line',
            title: 'Advanced Analytics Overview',
            data: []
          };
        },
        temporal_analysis: () => {
          if (!config.includeTemporalAnalysis) return null;
          return {
            type: (chartTypeMap['temporal_analysis'] || 'line') as 'bar' | 'pie' | 'line',
            title: 'Monthly Listing Activity',
            data: []
          };
        },
        geographic_analysis: () => {
          if (!config.includeGeographicAnalysis) return null;
          return {
            type: (chartTypeMap['geographic_analysis'] || 'bar') as 'bar' | 'pie' | 'line',
            title: 'Geographic Distribution',
            data: []
          };
        },
        agent_performance: () => {
          if (!config.includeAgentPerformance) return null;
          return {
            type: (chartTypeMap['agent_performance'] || 'bar') as 'bar' | 'pie' | 'line',
            title: 'Top Agent Performance',
            data: []
          };
        },
        daily_listing_activity: () => {
          if (!config.includeDailyListingActivity) return null;
          return {
            type: (chartTypeMap['daily_listing_activity'] || 'line') as 'bar' | 'pie' | 'line',
            title: 'Daily Listing Activity',
            data: []
          };
        },
        pricing_trends: () => {
          if (!config.includePricingTrends) return null;
          return {
            type: (chartTypeMap['pricing_trends'] || 'line') as 'bar' | 'pie' | 'line',
            title: 'Pricing Trends',
            data: []
          };
        },
        data_confidence_trends: () => {
          if (!config.includeDataConfidence) return null;
          return {
            type: (chartTypeMap['data_confidence_trends'] || 'pie') as 'bar' | 'pie' | 'line',
            title: 'Data Confidence Distribution',
            data: []
          };
        },
        suburb_volume_distribution: () => {
          if (!config.includeSuburbVolumeDistribution) return null;
          return {
            type: (chartTypeMap['suburb_volume_distribution'] || 'bar') as 'bar' | 'pie' | 'line',
            title: 'Suburb Volume Distribution',
            data: []
          };
        },
        price_vs_volume_analysis: () => {
          if (!config.includePriceVsVolumeAnalysis) return null;
          return {
            type: (chartTypeMap['price_vs_volume_analysis'] || 'pie') as 'bar' | 'pie' | 'line',
            title: 'Price vs Volume Analysis',
            data: []
          };
        },
        agent_listing_volume: () => {
          if (!config.includeAgentListingVolume) return null;
          return {
            type: (chartTypeMap['agent_listing_volume'] || 'bar') as 'bar' | 'pie' | 'line',
            title: 'Agent Listing Volume',
            data: []
          };
        },
        agency_distribution: () => {
          if (!config.includeAgencyDistribution) return null;
          return {
            type: (chartTypeMap['agency_distribution'] || 'pie') as 'bar' | 'pie' | 'line',
            title: 'Agency Distribution',
            data: []
          };
        },
        executive_insights: () => {
          if (!config.includeExecutiveInsights) return null;
          return {
            type: (chartTypeMap['executive_insights'] || 'bar') as 'bar' | 'pie' | 'line',
            title: 'Executive Market Insights',
            data: []
          };
        }
      };
      
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
          
          // Get the original chart data with correct types
          const originalCharts: ChartData[] = [];
          for (const chartConfig of chartConfigs) {
            const generator = chartGenerators[chartConfig.template_name];
            if (generator) {
              const chartData = generator();
              if (chartData) {
                originalCharts.push(chartData);
              }
            }
          }
          
          // Create a map of chart names to their types
          const chartTypeMapping = originalCharts.reduce((acc, chart) => {
            const chartKey = chart.title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            acc[chartKey] = chart.type;
            return acc;
          }, {} as Record<string, string>);
          
          console.log('Chart type mapping:', chartTypeMapping);
          
          const chartRecords = Object.entries(chartImages).map(([chartType, imageData]) => {
            console.log(`Processing chart: ${chartType}`);
            
            // Use the correct chart type from mapping, fallback to configuration, then crude string matching
            const correctChartType = chartTypeMapping[chartType] || 
                                   chartTypeMap[chartType] || 
                                   (chartType.includes('pie') ? 'pie' : chartType.includes('line') ? 'line' : 'bar');
            
            return {
              report_id: reportData.id,
              chart_type: correctChartType,
              title: chartType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              image_data: imageData as string,
              chart_config: {
                type: chartType,
                chart_type: correctChartType, // Store the correct chart type here too
                generated_at: new Date().toISOString()
              }
            };
          });

          console.log('Chart records to insert:', chartRecords.length);
          
          const { data: insertedCharts, error: chartsError } = await supabase
            .from('charts')
            .insert(chartRecords)
            .select();

          if (chartsError) {
            console.error('Error storing charts:', chartsError);
            // Don't fail the whole process if charts fail to store
          } else {
            console.log('Charts stored successfully!');
            
            // Generate qualitative analysis for each chart
            setCurrentStep('Generating qualitative analysis...');
            setProgress(90);
            
            if (insertedCharts && insertedCharts.length > 0) {
              const analysisPromises = insertedCharts.map(async (chart) => {
                try {
                  const chartDataForAnalysis = {
                    title: chart.title,
                    type: chart.chart_type,
                    data: { listings: allListings.length }, // Simplified data for analysis
                    config: chart.chart_config
                  };
                  
                  const reportContext = {
                    title: config.title,
                    description: config.description,
                    listingCount: totalListings
                  };

                  const { data, error } = await supabase.functions.invoke('generate-chart-analysis', {
                    body: {
                      chartId: chart.id,
                      chartData: chartDataForAnalysis,
                      reportContext
                    }
                  });

                  if (error) {
                    console.error(`Error generating analysis for chart ${chart.id}:`, error);
                  } else {
                    console.log(`Analysis generated for chart ${chart.id}`);
                  }
                } catch (analysisError) {
                  console.error(`Failed to generate analysis for chart ${chart.id}:`, analysisError);
                }
              });

              // Wait for all analysis to complete
              await Promise.all(analysisPromises);
              console.log('All chart analyses generated');
            }
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