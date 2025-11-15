import { PixelPerfectPDFGenerator } from './PixelPerfectPDFGenerator';

interface ComparisonData {
  id: string;
  property_count: number;
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
  // Transform comparison data into report content format
  const generateReportContent = (): string => {
    let content = '# Property Comparison Analysis Report\n\n';
    
    // Executive Summary
    if (comparison.executive_summary) {
      content += '## Executive Summary\n\n';
      content += comparison.executive_summary + '\n\n';
    }

    // Rankings Section
    if (comparison.rankings && Array.isArray(comparison.rankings)) {
      content += '## Overall Rankings\n\n';
      comparison.rankings.forEach((property: any) => {
        content += `**Rank ${property.rank}: ${property.address}**\n`;
        content += `- Overall Score: ${typeof property.finalScore === 'number' ? property.finalScore.toFixed(1) : property.finalScore}/100\n`;
        if (property.reasoning) {
          content += `- Analysis: ${property.reasoning}\n`;
        }
        content += '\n';
      });
      content += '\n';
    }

    // Financial Comparison
    if (comparison.financial_comparison) {
      content += '## Financial Analysis\n\n';
      
      if (Array.isArray(comparison.financial_comparison)) {
        comparison.financial_comparison.forEach((property: any) => {
          content += `**${property.address}**\n`;
          if (property.expectedYield) content += `- Expected Yield: ${property.expectedYield}\n`;
          if (property.capitalGrowth) content += `- Capital Growth: ${property.capitalGrowth}\n`;
          if (property.cashFlow) content += `- Cash Flow: ${property.cashFlow}\n`;
          if (property.analysis) content += `- Analysis: ${property.analysis}\n`;
          content += '\n';
        });
      } else if (typeof comparison.financial_comparison === 'object') {
        Object.entries(comparison.financial_comparison).forEach(([key, value]) => {
          content += `**${key}**: ${typeof value === 'object' ? JSON.stringify(value) : value}\n`;
        });
      }
      content += '\n';
    }

    // Location Comparison
    if (comparison.location_comparison) {
      content += '## Location Intelligence\n\n';
      
      if (Array.isArray(comparison.location_comparison)) {
        comparison.location_comparison.forEach((property: any) => {
          content += `**${property.address}**\n`;
          if (property.transportScore) content += `- Transport Score: ${property.transportScore}\n`;
          if (property.amenitiesScore) content += `- Amenities Score: ${property.amenitiesScore}\n`;
          if (property.schoolsQuality) content += `- Schools Quality: ${property.schoolsQuality}\n`;
          if (property.analysis) content += `- Analysis: ${property.analysis}\n`;
          content += '\n';
        });
      } else if (typeof comparison.location_comparison === 'object') {
        Object.entries(comparison.location_comparison).forEach(([key, value]) => {
          content += `**${key}**: ${typeof value === 'object' ? JSON.stringify(value) : value}\n`;
        });
      }
      content += '\n';
    }

    // Risk Assessment
    if (comparison.risk_comparison) {
      content += '## Risk Assessment\n\n';
      
      if (Array.isArray(comparison.risk_comparison)) {
        comparison.risk_comparison.forEach((property: any) => {
          content += `**${property.address}**\n`;
          if (property.overallRisk) content += `- Overall Risk: ${property.overallRisk}\n`;
          if (property.marketVolatility) content += `- Market Volatility: ${property.marketVolatility}\n`;
          if (property.liquidityRisk) content += `- Liquidity Risk: ${property.liquidityRisk}\n`;
          if (property.analysis) content += `- Analysis: ${property.analysis}\n`;
          content += '\n';
        });
      } else if (typeof comparison.risk_comparison === 'object') {
        Object.entries(comparison.risk_comparison).forEach(([key, value]) => {
          content += `**${key}**: ${typeof value === 'object' ? JSON.stringify(value) : value}\n`;
        });
      }
      content += '\n';
    }

    // Recommendations
    if (comparison.recommendations) {
      content += '## Investment Recommendations\n\n';
      
      if (typeof comparison.recommendations === 'string') {
        content += comparison.recommendations + '\n\n';
      } else if (typeof comparison.recommendations === 'object') {
        if (comparison.recommendations.topChoice) {
          content += `**Top Choice**: ${comparison.recommendations.topChoice}\n\n`;
        }
        if (comparison.recommendations.reasoning) {
          content += comparison.recommendations.reasoning + '\n\n';
        }
        if (Array.isArray(comparison.recommendations.keyPoints)) {
          content += '**Key Points**:\n';
          comparison.recommendations.keyPoints.forEach((point: string) => {
            content += `- ${point}\n`;
          });
          content += '\n';
        }
      }
    }

    // Red Flags
    if (comparison.red_flags && Array.isArray(comparison.red_flags) && comparison.red_flags.length > 0) {
      content += '## Important Considerations\n\n';
      comparison.red_flags.forEach((flag: any) => {
        if (typeof flag === 'string') {
          content += `- ${flag}\n`;
        } else if (flag.property && flag.issue) {
          content += `**${flag.property}**: ${flag.issue}\n`;
          if (flag.severity) content += `  - Severity: ${flag.severity}\n`;
        }
      });
      content += '\n';
    }

    return content;
  };

  // Transform comparison data to match PixelPerfectPDFGenerator expectations
  const transformedReport = {
    id: comparison.id,
    address: `Comparison Analysis - ${comparison.property_count} Properties`,
    content: generateReportContent(),
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
