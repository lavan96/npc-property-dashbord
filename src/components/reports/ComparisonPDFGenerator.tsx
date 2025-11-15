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
  // Helper function to convert JSON to readable text
  const formatValue = (value: any, indent: string = ''): string => {
    if (value === null || value === undefined) return 'N/A';
    
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    
    if (Array.isArray(value)) {
      if (value.length === 0) return 'None';
      return value.map(item => {
        if (typeof item === 'object') {
          return Object.entries(item)
            .map(([k, v]) => `${indent}  - ${k}: ${formatValue(v, indent + '  ')}`)
            .join('\n');
        }
        return `${indent}  - ${formatValue(item, indent + '  ')}`;
      }).join('\n');
    }
    
    if (typeof value === 'object') {
      return Object.entries(value)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => {
          const formattedKey = k.replace(/([A-Z])/g, ' $1').trim()
            .replace(/^./, str => str.toUpperCase());
          return `${indent}${formattedKey}: ${formatValue(v, indent + '  ')}`;
        })
        .join('\n');
    }
    
    return String(value);
  };

  // Transform comparison data into report content format
  const generateReportContent = (): string => {
    let content = '# Property Comparison Analysis Report\n\n';
    
    // Executive Summary
    if (comparison.executive_summary) {
      content += '## Executive Summary\n\n';
      content += comparison.executive_summary + '\n\n';
    }

    // Rankings Section
    if (comparison.rankings) {
      content += '## Overall Rankings\n\n';
      
      if (Array.isArray(comparison.rankings)) {
        comparison.rankings.forEach((property: any, index: number) => {
          const rank = property.rank || (index + 1);
          const address = property.address || property.propertyAddress || `Property ${index + 1}`;
          const score = property.finalScore || property.score || property.overallScore;
          
          content += `**Rank ${rank}: ${address}**\n\n`;
          
          if (score !== undefined && score !== null) {
            content += `Overall Score: ${typeof score === 'number' ? score.toFixed(1) : score}/100\n\n`;
          }
          
          // Add all other property details
          Object.entries(property).forEach(([key, value]) => {
            if (!['rank', 'address', 'propertyAddress', 'finalScore', 'score', 'overallScore'].includes(key)) {
              const formattedKey = key.replace(/([A-Z])/g, ' $1').trim()
                .replace(/^./, str => str.toUpperCase());
              content += `${formattedKey}:\n${formatValue(value, '  ')}\n\n`;
            }
          });
          
          content += '---\n\n';
        });
      } else if (typeof comparison.rankings === 'object') {
        content += formatValue(comparison.rankings) + '\n\n';
      }
    }

    // Financial Comparison
    if (comparison.financial_comparison) {
      content += '## Financial Analysis\n\n';
      
      if (Array.isArray(comparison.financial_comparison)) {
        comparison.financial_comparison.forEach((property: any) => {
          const address = property.address || property.propertyAddress || 'Property';
          content += `**${address}**\n\n`;
          
          Object.entries(property).forEach(([key, value]) => {
            if (key !== 'address' && key !== 'propertyAddress') {
              const formattedKey = key.replace(/([A-Z])/g, ' $1').trim()
                .replace(/^./, str => str.toUpperCase());
              content += `${formattedKey}:\n${formatValue(value, '  ')}\n\n`;
            }
          });
          
          content += '---\n\n';
        });
      } else if (typeof comparison.financial_comparison === 'object') {
        content += formatValue(comparison.financial_comparison) + '\n\n';
      }
    }

    // Location Comparison
    if (comparison.location_comparison) {
      content += '## Location Intelligence\n\n';
      
      if (Array.isArray(comparison.location_comparison)) {
        comparison.location_comparison.forEach((property: any) => {
          const address = property.address || property.propertyAddress || 'Property';
          content += `**${address}**\n\n`;
          
          Object.entries(property).forEach(([key, value]) => {
            if (key !== 'address' && key !== 'propertyAddress') {
              const formattedKey = key.replace(/([A-Z])/g, ' $1').trim()
                .replace(/^./, str => str.toUpperCase());
              content += `${formattedKey}:\n${formatValue(value, '  ')}\n\n`;
            }
          });
          
          content += '---\n\n';
        });
      } else if (typeof comparison.location_comparison === 'object') {
        content += formatValue(comparison.location_comparison) + '\n\n';
      }
    }

    // Risk Assessment
    if (comparison.risk_comparison) {
      content += '## Risk Assessment\n\n';
      
      if (Array.isArray(comparison.risk_comparison)) {
        comparison.risk_comparison.forEach((property: any) => {
          const address = property.address || property.propertyAddress || 'Property';
          content += `**${address}**\n\n`;
          
          Object.entries(property).forEach(([key, value]) => {
            if (key !== 'address' && key !== 'propertyAddress') {
              const formattedKey = key.replace(/([A-Z])/g, ' $1').trim()
                .replace(/^./, str => str.toUpperCase());
              content += `${formattedKey}:\n${formatValue(value, '  ')}\n\n`;
            }
          });
          
          content += '---\n\n';
        });
      } else if (typeof comparison.risk_comparison === 'object') {
        content += formatValue(comparison.risk_comparison) + '\n\n';
      }
    }

    // Recommendations
    if (comparison.recommendations) {
      content += '## Investment Recommendations\n\n';
      
      if (typeof comparison.recommendations === 'string') {
        content += comparison.recommendations + '\n\n';
      } else if (Array.isArray(comparison.recommendations)) {
        comparison.recommendations.forEach((rec: any) => {
          content += formatValue(rec) + '\n\n';
        });
      } else if (typeof comparison.recommendations === 'object') {
        content += formatValue(comparison.recommendations) + '\n\n';
      }
    }

    // Red Flags
    if (comparison.red_flags && Array.isArray(comparison.red_flags) && comparison.red_flags.length > 0) {
      content += '## Important Considerations\n\n';
      comparison.red_flags.forEach((flag: any) => {
        if (typeof flag === 'string') {
          content += `- ${flag}\n`;
        } else if (typeof flag === 'object') {
          content += formatValue(flag, '- ') + '\n';
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
