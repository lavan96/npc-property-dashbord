import { PixelPerfectPDFGenerator } from './PixelPerfectPDFGenerator';
import { useState, useEffect } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';

interface ComparisonData {
  id: string;
  property_count: number;
  property_addresses?: string[];
  property_states?: string[];
  report_title?: string;
  executive_summary: string | null;
  rankings: any;
  financial_comparison: any;
  location_comparison: any;
  risk_comparison: any;
  recommendations: any;
  red_flags: any;
  report_ids: string[];
  created_at: string;
}

interface ComparisonPDFGeneratorProps {
  comparison: ComparisonData;
}

export function ComparisonPDFGenerator({ comparison }: ComparisonPDFGeneratorProps) {
  const [formattedContent, setFormattedContent] = useState<string | null>(null);
  const [isFormatting, setIsFormatting] = useState(true);

  useEffect(() => {
    formatComparisonReport();
  }, [comparison]);

  const formatComparisonReport = async () => {
    try {
      setIsFormatting(true);
      console.log('Calling format-comparison-report edge function...');

      const { data, error } = await invokeSecureFunction('format-comparison-report', {
        comparisonData: comparison
      });

      if (error) {
        console.error('Error formatting report:', error);
        toast.error('Failed to format comparison report');
        // Fallback to basic formatting
        setFormattedContent(generateBasicReportContent());
      } else if (data?.formattedContent) {
        console.log('Successfully formatted comparison report');
        setFormattedContent(data.formattedContent);
      } else {
        console.warn('No formatted content returned, using fallback');
        setFormattedContent(generateBasicReportContent());
      }
    } catch (error) {
      console.error('Error in formatComparisonReport:', error);
      toast.error('Error formatting report, using basic format');
      setFormattedContent(generateBasicReportContent());
    } finally {
      setIsFormatting(false);
    }
  };

  // Fallback basic formatting function
  const generateBasicReportContent = (): string => {
    const title = comparison.report_title || `Property Comparison Analysis - ${comparison.property_count} Properties`;
    const states = comparison.property_states?.join(', ') || 'Mixed States';
    
    let content = `# ${title}\n\n`;
    content += `**Properties Compared:** ${comparison.property_count}\n`;
    content += `**States:** ${states}\n`;
    content += `**Analysis Date:** ${new Date(comparison.created_at).toLocaleDateString()}\n\n`;
    
    if (comparison.property_addresses && comparison.property_addresses.length > 0) {
      content += `**Property Addresses:**\n`;
      comparison.property_addresses.forEach((address, index) => {
        content += `${index + 1}. ${address}\n`;
      });
      content += `\n`;
    }
    
    content += `---\n\n`;
    
    if (comparison.executive_summary) {
      content += '## Executive Summary\n\n';
      content += comparison.executive_summary + '\n\n';
    }

    if (comparison.rankings) {
      content += '## Overall Rankings\n\n';
      content += JSON.stringify(comparison.rankings, null, 2) + '\n\n';
    }

    if (comparison.financial_comparison) {
      content += '## Financial Analysis\n\n';
      content += JSON.stringify(comparison.financial_comparison, null, 2) + '\n\n';
    }

    if (comparison.location_comparison) {
      content += '## Location Intelligence\n\n';
      content += JSON.stringify(comparison.location_comparison, null, 2) + '\n\n';
    }

    if (comparison.risk_comparison) {
      content += '## Risk Assessment\n\n';
      content += JSON.stringify(comparison.risk_comparison, null, 2) + '\n\n';
    }

    if (comparison.recommendations) {
      content += '## Investment Recommendations\n\n';
      content += JSON.stringify(comparison.recommendations, null, 2) + '\n\n';
    }

    if (comparison.red_flags && Array.isArray(comparison.red_flags) && comparison.red_flags.length > 0) {
      content += '## Important Considerations\n\n';
      comparison.red_flags.forEach((flag: any) => {
        content += `- ${typeof flag === 'string' ? flag : JSON.stringify(flag)}\n`;
      });
      content += '\n';
    }

    return content;
  };

  // Show loading state while formatting
  if (isFormatting || !formattedContent) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Formatting comparison report...</p>
        </div>
      </div>
    );
  }

  // Transform comparison data to match PixelPerfectPDFGenerator expectations
  const transformedReport = {
    id: comparison.id,
    address: comparison.report_title || `Comparison Analysis - ${comparison.property_count} Properties`,
    content: formattedContent, // Use the formatted content from Perplexity
    created_at: comparison.created_at || new Date().toISOString(),
    enhanced_data: {
      domainData: null,
      absData: null,
      rbaData: null,
      financialData: comparison.financial_comparison,
      locationData: comparison.location_comparison,
      investmentScore: comparison.rankings,
    }
  };

  return <PixelPerfectPDFGenerator report={transformedReport} />;
}
