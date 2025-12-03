import React from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';

interface InvestmentReportData {
  id: string;
  address: string;
  content: string;
  created_at: string;
  enhanced_data?: {
    domainData?: any;
    absData?: any;
    rbaData?: any;
    financialData?: any;
    locationData?: any;
    investmentScore?: any;
  };
}

interface PixelPerfectPDFGeneratorProps {
  report: InvestmentReportData;
  includeSources?: boolean;
}

export const PixelPerfectPDFGenerator: React.FC<PixelPerfectPDFGeneratorProps> = ({ report, includeSources = true }) => {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const extractSuburbState = (address: string): { suburb: string; state: string } => {
    const parts = address.split(',').map(p => p.trim());
    
    // Map full state names to abbreviations
    const stateMapping: Record<string, string> = {
      'new south wales': 'NSW',
      'victoria': 'VIC',
      'queensland': 'QLD',
      'south australia': 'SA',
      'western australia': 'WA',
      'tasmania': 'TAS',
      'northern territory': 'NT',
      'australian capital territory': 'ACT',
    };
    
    // Search entire address for state (abbreviation first, then full name)
    let state = '';
    const addressLower = address.toLowerCase();
    
    // Try to find state abbreviation anywhere in address
    const stateAbbrevMatch = address.match(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/i);
    if (stateAbbrevMatch) {
      state = stateAbbrevMatch[0].toUpperCase();
    } else {
      // Try full state names
      for (const [fullName, abbrev] of Object.entries(stateMapping)) {
        if (addressLower.includes(fullName)) {
          state = abbrev;
          break;
        }
      }
    }
    
    // Extract suburb - find the first meaningful part that's not a postcode, state, or "Australia"
    let suburb = '';
    for (const part of parts) {
      const trimmedPart = part.trim();
      const partLower = trimmedPart.toLowerCase();
      
      // Skip if it's "Australia", a postcode (4 digits), or contains the state
      const isAustralia = partLower === 'australia';
      const isPostcode = /^\d{4}$/.test(trimmedPart);
      const isState = /\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/i.test(trimmedPart) || 
                      Object.keys(stateMapping).some(s => partLower === s);
      const containsPostcode = /\b\d{4}\b/.test(trimmedPart);
      
      // For suburb reports, the first part is usually the suburb name
      if (!isAustralia && !isPostcode && !isState) {
        // If this part contains a postcode but also text, extract just the suburb name
        if (containsPostcode) {
          const suburbOnly = trimmedPart.replace(/\b\d{4}\b/, '').replace(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/gi, '').trim();
          if (suburbOnly) {
            suburb = suburbOnly;
            break;
          }
        } else {
          suburb = trimmedPart;
          break;
        }
      }
    }
    
    // Fallback: use first part if nothing else worked
    if (!suburb && parts.length > 0) {
      suburb = parts[0].replace(/\b\d{4}\b/, '').replace(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/gi, '').trim();
    }
    
    return { suburb: suburb.toUpperCase(), state };
  };

  const filterSourcesSections = (sections: Record<string, string>): Record<string, string> => {
    if (includeSources) {
      console.log('✓ Including sources in PDF (toggle is ON)');
      return sections;
    }
    
    console.log('🚫 Filtering out sources sections from PDF (toggle is OFF)');
    console.log('📋 Available sections before filtering:', Object.keys(sections));
    
    // Create a new object without source-related sections
    const filteredSections: Record<string, string> = {};
    const sourceSectionPatterns = [
      /market data sources?/i,
      /data sources?/i,
      /demographic.*economic data/i,
      /economic data sources?/i,
      /sources?$/i
    ];
    
    let removedCount = 0;
    for (const [key, value] of Object.entries(sections)) {
      const isSourceSection = sourceSectionPatterns.some(pattern => pattern.test(key));
      if (isSourceSection) {
        console.log(`  ❌ Removing section: "${key}"`);
        removedCount++;
      } else {
        filteredSections[key] = value;
      }
    }
    
    console.log(`✓ Filtered out ${removedCount} source section(s)`);
    console.log('📋 Remaining sections:', Object.keys(filteredSections));
    return filteredSections;
  };

  const injectOverridesIntoContent = (content: string, financialData: any): string => {
    if (!financialData) {
      console.log('⚠️ No financialData provided, skipping injection');
      return content;
    }

    console.log('💉 Injecting override values into markdown content');
    console.log('📊 Input financialData structure:', JSON.stringify(financialData, null, 2).substring(0, 2000));
    console.log('🔍 Direct value checks:', {
      'financialData.income': financialData?.income,
      'financialData.income.weeklyRent': financialData?.income?.weeklyRent,
      'financialData.income.annualRent': financialData?.income?.annualRent,
    });

    // Calculate annual rent from weekly rent (weekly × 52)
    const weeklyRent = financialData?.income?.weeklyRent || 0;
    console.log('📌 weeklyRent resolved to:', weeklyRent);
    const annualRent = weeklyRent * 52;

    // Recalculate property management based on overridden values
    const propertyManagementPercent = financialData?.annualCosts?.propertyManagementPercent || 7;
    const propertyManagementCalculated = Math.floor(annualRent * (propertyManagementPercent / 100));

    // Calculate total annual costs dynamically from overridden values (excluding letting fees)
    const councilRates = financialData?.annualCosts?.councilRates || 0;
    const waterRates = financialData?.annualCosts?.waterRates || 0;
    const strataFees = financialData?.annualCosts?.strataFees || 0;
    const landlordInsurance = financialData?.annualCosts?.landlordInsurance || 0;
    const propertyManagement = propertyManagementCalculated; // Use dynamically calculated value
    const maintenance = financialData?.annualCosts?.maintenance || 1500; // Use override value or default to 1500
    const landTax = financialData?.annualCosts?.landTax || 0;
    
    // Total annual costs WITHOUT land tax - used for net yield calculation (pages 14-15)
    const totalAnnualCostsExcludingLandTax = councilRates + waterRates + strataFees + landlordInsurance + propertyManagement + maintenance;
    
    // Total annual costs WITH land tax - used for page 10 ongoing costs table display
    const totalAnnualCostsWithLandTax = totalAnnualCostsExcludingLandTax + landTax;
    
    console.log('📊 Computed values from overrides:', {
      weeklyRent,
      annualRent,
      councilRates,
      waterRates,
      strataFees,
      landlordInsurance,
      propertyManagement,
      maintenance,
      landTax,
      totalAnnualCostsExcludingLandTax,
      totalAnnualCostsWithLandTax
    });
    
    // Debug: Log specific content snippets we're trying to match
    const annualIncomeMatch = content.match(/Annual Income[^\n]{0,100}/gi);
    const annualExpensesMatch = content.match(/Annual Expenses[^\n]{0,100}/gi);
    const propertyMgmtMatch = content.match(/Property Management[^\n]{0,100}/gi);
    console.log('🔍 Content snippets found:', {
      annualIncome: annualIncomeMatch,
      annualExpenses: annualExpensesMatch,
      propertyMgmt: propertyMgmtMatch
    });

    // Calculate loan amount from property value and deposit
    const propertyValue = financialData?.initialCosts?.propertyValue || 0;
    const depositValue = financialData?.initialCosts?.deposit || 0;
    const loanAmount = propertyValue - depositValue;
    const interestRate = financialData?.loanDetails?.interestRate || 6;
    const loanTerm = financialData?.loanDetails?.loanTerm || 30;

    // Map of field paths to regex patterns that match them in markdown tables
    const fieldReplacements: Array<{ pattern: RegExp; getValue: () => any; format: (v: any) => string; isFullLineReplacement?: boolean }> = [
      // === BASE ASSUMPTIONS SECTION - Bullet point format ===
      // Property Price: $XXX,XXX
      {
        pattern: /[-•]\s*Property Price:[^\n]*/gi,
        getValue: () => propertyValue,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '- Property Price: $' + str;
        },
        isFullLineReplacement: true
      },
      // Deposit: $XXX,XXX
      {
        pattern: /[-•]\s*Deposit:[^\n]*/gi,
        getValue: () => depositValue,
        format: (v) => {
          const str = Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
          return '- Deposit: $' + str;
        },
        isFullLineReplacement: true
      },
      // Loan Amount: $XXX,XXX
      {
        pattern: /[-•]\s*Loan Amount:[^\n]*/gi,
        getValue: () => loanAmount,
        format: (v) => {
          const str = Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
          return '- Loan Amount: $' + str;
        },
        isFullLineReplacement: true
      },
      // Interest Rate: X%
      {
        pattern: /[-•]\s*Interest Rate:[^\n]*/gi,
        getValue: () => interestRate,
        format: (v) => '- Interest Rate: ' + (v || 0) + '%',
        isFullLineReplacement: true
      },
      // Loan Term: XX years
      {
        pattern: /[-•]\s*Loan Term:[^\n]*/gi,
        getValue: () => loanTerm,
        format: (v) => '- Loan Term: ' + (v || 30) + ' years',
        isFullLineReplacement: true
      },
      // Weekly Rent: $XXX ($XX,XXX annually)
      {
        pattern: /[-•]\s*Weekly Rent:[^\n]*/gi,
        getValue: () => ({ weeklyRent, annualRent }),
        format: (v) => {
          const weeklyStr = String(v.weeklyRent || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          const annualStr = String(v.annualRent || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          console.log('📝 Weekly Rent format - weeklyRent:', v.weeklyRent, 'formatted:', weeklyStr);
          return '- Weekly Rent: $' + weeklyStr + ' ($' + annualStr + ' annually)';
        },
        isFullLineReplacement: true
      },
      // Property Management: X% of $XX,XXX annual rent = $X,XXX
      {
        pattern: /[-•]\s*Property Management:[^\n]*/gi,
        getValue: () => ({ percent: propertyManagementPercent, annualRent, fee: propertyManagement }),
        format: (v) => {
          const annualStr = String(v.annualRent || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          const feeStr = String(v.fee || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '- Property Management: ' + (v.percent || 7) + '% of $' + annualStr + ' annual rent = $' + feeStr;
        },
        isFullLineReplacement: true
      },
      // Maintenance: $X annually (fixed)
      {
        pattern: /[-•]\s*Maintenance:[^\n]*/gi,
        getValue: () => maintenance,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '- Maintenance: $' + str + ' annually (fixed)';
        },
        isFullLineReplacement: true
      },
      // Council Rates: $X,XXX annually
      {
        pattern: /[-•]\s*Council Rates:[^\n]*/gi,
        getValue: () => councilRates,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '- Council Rates: $' + str + ' annually';
        },
        isFullLineReplacement: true
      },
      // Water Rates: $X,XXX annually
      {
        pattern: /[-•]\s*Water Rates:[^\n]*/gi,
        getValue: () => waterRates,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '- Water Rates: $' + str + ' annually';
        },
        isFullLineReplacement: true
      },
      // Insurance: $X,XXX annually
      {
        pattern: /[-•]\s*Insurance:[^\n]*/gi,
        getValue: () => landlordInsurance,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '- Insurance: $' + str + ' annually';
        },
        isFullLineReplacement: true
      },

      // === OTHER SECTIONS - Non-bullet patterns ===
      {
        pattern: /Purchase Price.*?\$[\d,]+/gi,
        getValue: () => propertyValue,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return 'Purchase Price: $' + str;
        }
      },
      {
        pattern: /Property Value.*?\$[\d,]+/gi,
        getValue: () => propertyValue,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return 'Property Value: $' + str;
        }
      },
      {
        pattern: /Stamp Duty.*?\$[\d,]+/gi,
        getValue: () => financialData?.initialCosts?.stampDuty,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return 'Stamp Duty: $' + str;
        }
      },
      {
        pattern: /Deposit(?:.*?20%)?[:\s-]+\$[\d,]+/gi,
        getValue: () => depositValue,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return 'Deposit: $' + str;
        }
      },
      // Non-bullet Weekly Rent patterns
      {
        pattern: /(?<![•\-]\s)Weekly Rent:\s*\$[\d,]+\s*\(\$[\d,]+\s*annually\)/gi,
        getValue: () => ({ weeklyRent, annualRent }),
        format: (v) => {
          const weeklyStr = String(v.weeklyRent || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          const annualStr = String(v.annualRent || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return 'Weekly Rent: $' + weeklyStr + ' ($' + annualStr + ' annually)';
        },
        isFullLineReplacement: true
      },
      {
        pattern: /Weekly Rent:\s*\$[\d,]+(?!\s*\()/gi,
        getValue: () => weeklyRent,
        format: (v) => {
          const weeklyStr = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return 'Weekly Rent: $' + weeklyStr;
        },
        isFullLineReplacement: true
      },
      {
        pattern: /Annual Rent.*?\$[\d,]+/gi,
        getValue: () => annualRent,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return 'Annual Rent: $' + str;
        }
      },
      // Annual Income row in Gross & Net Yield table
      {
        pattern: /\|\s*Annual Income\s*\|\s*\$[\d,]+\s*[×x]\s*52\s*weeks?\s*\|\s*\$[\d,]+\s*\|/gi,
        getValue: () => ({ weeklyRent, annualRent }),
        format: (v) => {
          const weeklyStr = String(v.weeklyRent || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          const annualStr = String(v.annualRent || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '| Annual Income | $' + weeklyStr + ' x 52 weeks | $' + annualStr + ' |';
        },
        isFullLineReplacement: true
      },
      // Table format patterns for ongoing costs
      {
        pattern: /\|\s*Council Rates\s*\|[^\n]*/gi,
        getValue: () => councilRates,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '| Council Rates | Annual | $' + str + ' |';
        },
        isFullLineReplacement: true
      },
      {
        pattern: /\|\s*Water Rates\s*\|[^\n]*/gi,
        getValue: () => waterRates,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '| Water Rates | Annual | $' + str + ' |';
        },
        isFullLineReplacement: true
      },
      {
        pattern: /\|\s*(?:Building\s*(?:&|and)\s*)?(?:Landlord\s*)?Insurance\s*\|[^\n]*/gi,
        getValue: () => landlordInsurance,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '| Building & Landlord Insurance | Annual | $' + str + ' |';
        },
        isFullLineReplacement: true
      },
      {
        pattern: /\|\s*Strata Fees\s*\|[^\n]*/gi,
        getValue: () => strataFees,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '| Strata Fees | Annual | $' + str + ' |';
        },
        isFullLineReplacement: true
      },
      {
        pattern: /\|\s*Body Corporate\s*\|[^\n]*/gi,
        getValue: () => strataFees,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '| Body Corporate | Annual | $' + str + ' |';
        },
        isFullLineReplacement: true
      },
      // Property Management Fee table row
      {
        pattern: /\|?\s*Property Management Fee?\s*\|[^\n]*/gi,
        getValue: () => ({ percent: propertyManagementPercent, annualRent, fee: propertyManagement }),
        format: (v) => {
          const annualStr = String(v.annualRent || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          const feeStr = String(v.fee || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '| Property Management Fee | ' + (v.percent || 7) + '% x $' + annualStr + ' annual rent | $' + feeStr + ' |';
        },
        isFullLineReplacement: true
      },
      {
        pattern: /\|\s*Maintenance\s*\|[^\n]*/gi,
        getValue: () => maintenance,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '| Maintenance | Annual (fixed) | $' + str + ' |';
        },
        isFullLineReplacement: true
      },
      {
        pattern: /Interest Rate.*?[\d.]+%/gi,
        getValue: () => interestRate,
        format: (v) => 'Interest Rate: ' + (v || 0) + '%'
      },
      {
        pattern: /Capital Growth.*?[\d.]+%/gi,
        getValue: () => financialData?.assumptions?.capitalGrowth,
        format: (v) => 'Capital Growth: ' + (v || 0) + '%'
      },
      {
        pattern: /LVR.*?[\d.]+%/gi,
        getValue: () => financialData?.keyMetrics?.lvr,
        format: (v) => 'LVR: ' + (v || 0) + '%'
      },
      // Land Tax row in page 10 table
      {
        pattern: /\|\s*Land Tax\s*\|[^\n]*/gi,
        getValue: () => landTax,
        format: (v) => {
          const str = String(v || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return '| Land Tax | Annual | $' + str + ' |';
        },
        isFullLineReplacement: true
      },
      {
        pattern: /\*\*Total Annual Costs\*\*.*?\$[\d,]+/gi,
        getValue: () => totalAnnualCostsWithLandTax,
        format: (v) => `$${v?.toLocaleString() || '0'}`
      },
      {
        pattern: /Total Annual Costs.*?\$[\d,]+/gi,
        getValue: () => totalAnnualCostsWithLandTax,
        format: (v) => `$${v?.toLocaleString() || '0'}`
      },
      // Annual Expenses row in Gross & Net Yield table - handle table rows starting with |
      {
        pattern: /\|?\s*Annual Expenses\s*\|[^\n]*/gi,
        getValue: () => {
          // Build breakdown components for display (include strataFees if present)
          const components = [];
          if (councilRates > 0) components.push(`$${councilRates.toLocaleString()}`);
          if (waterRates > 0) components.push(`$${waterRates.toLocaleString()}`);
          if (strataFees > 0) components.push(`$${strataFees.toLocaleString()}`);
          if (propertyManagement > 0) components.push(`$${propertyManagement.toLocaleString()}`);
          if (landlordInsurance > 0) components.push(`$${landlordInsurance.toLocaleString()}`);
          if (maintenance > 0) components.push(`$${maintenance.toLocaleString()}`);
          
          console.log('📊 Annual Expenses breakdown:', {
            councilRates,
            waterRates,
            strataFees,
            propertyManagement,
            landlordInsurance,
            maintenance,
            totalAnnualCostsExcludingLandTax,
            breakdown: components.join(' + ')
          });
          
          return { 
            breakdown: components.join(' + ') || '$0',
            total: totalAnnualCostsExcludingLandTax 
          };
        },
        format: (v) => `| Annual Expenses | ${v.breakdown} | $${v.total?.toLocaleString() || '0'} |`,
        isFullLineReplacement: true
      },
      // Note: Removed generic "Annual Expenses" pattern that was corrupting table breakdown display
      // The table-specific pattern above handles the yield table; no fallback needed
      // Net Annual Return row in Gross & Net Yield table - handle table rows starting with |
      {
        pattern: /\|?\s*Net Annual Return\s*\|[^\n]*/gi,
        getValue: () => {
          const netAnnualReturn = annualRent - totalAnnualCostsExcludingLandTax;
          return { annualRent, totalExpenses: totalAnnualCostsExcludingLandTax, netReturn: netAnnualReturn };
        },
        format: (v) => `| Net Annual Return | $${v.annualRent?.toLocaleString() || '0'} - $${v.totalExpenses?.toLocaleString() || '0'} | $${v.netReturn?.toLocaleString() || '0'} |`,
        isFullLineReplacement: true
      },
      // Net Rental Yield row in Gross & Net Yield table - handle table rows starting with |
      {
        pattern: /\|?\s*Net Rental Yield\s*\|[^\n]*/gi,
        getValue: () => {
          const purchasePrice = financialData?.initialCosts?.propertyValue || 0;
          const netAnnualReturn = annualRent - totalAnnualCostsExcludingLandTax;
          const netYield = purchasePrice > 0 ? ((netAnnualReturn / purchasePrice) * 100).toFixed(2) : '0.00';
          return { netReturn: netAnnualReturn, purchasePrice, netYield };
        },
        format: (v) => `| Net Rental Yield | $${v.netReturn?.toLocaleString() || '0'} ÷ $${v.purchasePrice?.toLocaleString() || '0'} × 100 | ${v.netYield}% |`,
        isFullLineReplacement: true
      },
    ];

    let updatedContent = content;
    let replacementCount = 0;

    for (const { pattern, getValue, format, isFullLineReplacement } of fieldReplacements) {
      const value = getValue();
      if (value !== undefined && value !== null) {
        const formattedValue = format(value);
        const beforeReplace = updatedContent;
        // Use a function replacement to ensure the value is returned verbatim
        updatedContent = updatedContent.replace(pattern, () => {
          // If explicitly marked as full line replacement, return formatted value directly
          if (isFullLineReplacement) {
            console.log(`  🔄 Full line replacement → "${formattedValue.substring(0, 60)}..."`);
            replacementCount++;
            return formattedValue;
          }
          // If formattedValue contains ' | ' (table row) or starts with '- ' (bullet point line), return as-is
          if (formattedValue.includes(' | ') || formattedValue.startsWith('- ')) {
            replacementCount++;
            return formattedValue;
          }
          // Otherwise, this shouldn't happen with current patterns
          replacementCount++;
          return formattedValue;
        });
        
        if (beforeReplace !== updatedContent) {
          console.log(`  ✓ Injected value for pattern: ${pattern.source.substring(0, 30)}...`);
        }
      }
    }

    console.log(`✓ Completed: ${replacementCount} value replacements in markdown content`);
    return updatedContent;
  };

  const parseReportContent = (content: string): Record<string, string> => {
    const sections: Record<string, string> = {};
    const lines = content.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      // Handle both ## and # headers, remove numbering like "1. "
      if (line.match(/^#{1,6}\s*/)) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        // Remove all leading hashtags, spaces, and optional numbering
        currentSection = line
          .replace(/^#{1,6}\s*/, '') // Remove hashtags
          .replace(/^\d+\.\s*/, '') // Remove numbering
          .replace(/:\s*$/, '') // Remove trailing colon
          .trim();
        currentContent = [];
      } else if (currentSection && line.trim()) {
        currentContent.push(line);
      }
    }

    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  };

  const findSection = (sections: Record<string, string>, possibleNames: string[]): string => {
    for (const name of possibleNames) {
      const exactMatch = sections[name];
      if (exactMatch) return exactMatch;

      const partialMatch = Object.keys(sections).find(key => 
        key.toLowerCase().includes(name.toLowerCase())
      );
      if (partialMatch) return sections[partialMatch];
    }
    return '';
  };

  const extractMarketData = (sections: Record<string, string>, enhancedData: any) => {
    const domainData = enhancedData?.domainData || {};
    const financialData = enhancedData?.financialData || {};
    const investmentScore = enhancedData?.investmentScore || {};
    const absData = enhancedData?.absData || {};
    const locationData = enhancedData?.locationData || {};

    console.log('📊 Extracting market data with financial calculations:', {
      hasFinancialData: !!financialData,
      hasInitialCosts: !!financialData?.initialCosts,
      hasKeyMetrics: !!financialData?.keyMetrics,
      propertyValue: financialData?.initialCosts?.propertyValue,
      weeklyRent: financialData?.income?.weeklyRent
    });

    // Helper to extract numeric values from text
    const extractNumber = (text: string, pattern: RegExp): number | null => {
      const match = text.match(pattern);
      if (match) {
        const numStr = match[1].replace(/,/g, '');
        const num = parseFloat(numStr);
        return isNaN(num) ? null : num;
      }
      return null;
    };

    // CRITICAL: Prioritize structured financial data over markdown-parsed values
    // This ensures manual overrides are reflected in the PDF
    let medianPrice = financialData?.initialCosts?.propertyValue || domainData.medianPrice;
    let rentalYield = financialData?.keyMetrics?.grossYield || investmentScore.cashFlowScore;
    let growthRate = financialData?.assumptions?.capitalGrowth || domainData.growthRate || investmentScore.capitalGrowthScore;

    // Only fall back to parsing markdown if structured data is not available
    if (!medianPrice || !rentalYield) {
      const marketKPIs = findSection(sections, ['Market KPIs', 'Market Performance', 'Key Metrics']);
      
      if (marketKPIs) {
        if (!medianPrice) {
          const priceMatch = extractNumber(marketKPIs, /median.*price.*\$?([\d,]+)/i);
          if (priceMatch) medianPrice = priceMatch;
        }
        
        if (!rentalYield) {
          const yieldMatch = extractNumber(marketKPIs, /rental.*yield.*?([\d.]+)%/i);
          if (yieldMatch) rentalYield = yieldMatch;
        }
        
        if (!growthRate) {
          const growthMatch = extractNumber(marketKPIs, /growth.*?([\d.]+)%/i);
          if (growthMatch) growthRate = growthMatch;
        }
      }
    }

    // Parse Demographics section
    const demographics = findSection(sections, ['Demographics & Demand Drivers', 'Demographics', 'Population']);
    let population = absData.population || domainData.population;
    let medianAge = absData.medianAge || domainData.medianAge;
    let medianIncome = absData.medianIncome || domainData.medianIncome;

    if (demographics) {
      const popMatch = extractNumber(demographics, /population.*?([\d,]+)/i);
      if (popMatch) population = popMatch;
      
      const ageMatch = extractNumber(demographics, /median age.*?([\d.]+)/i);
      if (ageMatch) medianAge = ageMatch;
      
      const incomeMatch = extractNumber(demographics, /median.*income.*\$?([\d,]+)/i);
      if (incomeMatch) medianIncome = incomeMatch;
    }

    console.log('✓ Market data extracted:', {
      medianPrice,
      rentalYield,
      growthRate,
      source: financialData?.initialCosts?.propertyValue ? 'structured_data' : 'markdown_parsed'
    });

    return {
      medianPrice,
      rentalYield,
      growthRate,
      population,
      medianAge,
      medianIncome,
      demographics: absData.demographics || {},
      infrastructure: locationData.nearbyAmenities || locationData.infrastructure || {},
      financialData, // Pass through full financial data for detailed sections
    };
  };

  const replaceTextInElement = (element: HTMLElement, placeholder: string, value: string) => {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    const nodesToReplace: { node: Text; newValue: string }[] = [];

    let node;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      if (textNode.nodeValue?.includes(placeholder)) {
        nodesToReplace.push({
          node: textNode,
          newValue: textNode.nodeValue.replace(new RegExp(placeholder, 'g'), value)
        });
      }
    }

    nodesToReplace.forEach(({ node, newValue }) => {
      node.nodeValue = newValue;
    });
  };

  const replaceContentSection = (container: HTMLElement, sectionIdentifiers: string[], content: string, maxLength: number = 500) => {
    if (!content) return;

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    const nodesToReplace: { node: Text; newValue: string }[] = [];
    let node;
    
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const text = textNode.nodeValue || '';
      
      // Check if text matches any section identifier or is placeholder
      const matchesIdentifier = sectionIdentifiers.some(id => 
        text.toLowerCase().includes(id.toLowerCase())
      );
      const isPlaceholder = text.includes('Lorem ipsum') || 
                           text.includes('Sample text') ||
                           text.includes('placeholder') ||
                           text.trim().length > 50 && text.includes('dolor sit amet');
      
      if (matchesIdentifier || isPlaceholder) {
        // Clean markdown and bullets from content
        const cleanContent = content
          .replace(/^[#*\-•]\s*/gm, '') // Remove markdown headers and bullets
          .replace(/\n+/g, ' ') // Replace newlines with spaces
          .trim()
          .substring(0, maxLength);
        
        nodesToReplace.push({
          node: textNode,
          newValue: cleanContent
        });
      }
    }

    nodesToReplace.forEach(({ node, newValue }) => {
      node.nodeValue = newValue;
    });
  };

  const generatePixelPerfectPDF = async () => {
    setIsGenerating(true);
    console.log('🚀 Starting PDF generation for report:', report.id);
    
    try {
      console.log('📍 Step 1: Extracting suburb and state from address:', report.address);
      const { suburb, state } = extractSuburbState(report.address);
      console.log('✓ Extracted:', { suburb, state });
      
      console.log('📄 Step 2: Injecting override values and parsing report content...');
      // Inject override values from structured financial data into markdown content
      const contentWithOverrides = injectOverridesIntoContent(
        report.content,
        report.enhanced_data?.financialData
      );
      
      // Parse report content into sections
      const parsedSections = parseReportContent(contentWithOverrides);
      console.log('✓ Parsed sections:', Object.keys(parsedSections));
      
      // Filter out sources sections if toggle is off (AFTER parsing for reliability)
      const sections = filterSourcesSections(parsedSections);
      console.log('✓ Final sections for PDF:', Object.keys(sections));

      // Load the PDF template
      console.log('📥 Step 3: Loading PDF template from /templates/npc_template.pdf...');
      const templateResponse = await fetch('/templates/npc_template.pdf');
      if (!templateResponse.ok) {
        throw new Error(`Failed to load template: ${templateResponse.status} ${templateResponse.statusText}`);
      }
      const templateBytes = await templateResponse.arrayBuffer();
      console.log('✓ Template loaded, size:', templateBytes.byteLength, 'bytes');
      
      // Load the template PDF
      console.log('📋 Step 4: Parsing PDF template...');
      const pdfDoc = await PDFDocument.load(templateBytes);
      console.log('✓ PDF template parsed successfully');
      
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      console.log('✓ Fonts embedded');

      // Get the second page from template to use as content template
      console.log('📑 Step 5: Preparing template pages...');
      const templatePages = pdfDoc.getPages();
      console.log('✓ Template has', templatePages.length, 'pages');
      
      if (templatePages.length < 2) {
        throw new Error('Template must have at least 2 pages');
      }

      // Remove the original second page since we'll duplicate it as needed
      pdfDoc.removePage(1); // Remove index 1 (second page)
      console.log('✓ Template pages configured');

      // Page settings
      const pageWidth = 595; // A4 width in points
      const pageHeight = 842; // A4 height in points
      const margin = 60; // Left/right margin
      const topMargin = 80; // Top margin (more space for template header)
      const bottomMargin = 70; // Bottom margin
      const lineHeight = 16;
      const titleSize = 14;
      const textSize = 10;

      let currentPage: any = null;
      let yPosition = 0;

      // Helper to group content into paragraphs and tables
      const groupContentBlocks = (content: string): string[] => {
        const lines = content.split('\n');
        const blocks: string[] = [];
        let i = 0;
        
        while (i < lines.length) {
          const line = lines[i].trim();
          
          // Skip empty lines
          if (!line) {
            i++;
            continue;
          }
          
          // Check if this line is part of a table (contains |)
          if (line.includes('|')) {
            // Accumulate all consecutive table lines
            const tableLines: string[] = [];
            while (i < lines.length && lines[i].trim().includes('|')) {
              tableLines.push(lines[i]);
              i++;
            }
            // Add the complete table as one block
            blocks.push(tableLines.join('\n'));
          } else {
            // Regular paragraph line
            blocks.push(line);
            i++;
          }
        }
        
        return blocks;
      };

      // Helper function to sanitize text for WinAnsi encoding (removes emojis, newlines, and special chars)
      const stripEmojis = (text: string): string => {
        // Remove emojis and other non-WinAnsi characters
        return text
          // Replace smart/curly quotes with straight quotes
          .replace(/[\u2018\u2019\u201B]/g, "'") // Single curly quotes to straight
          .replace(/[\u201C\u201D\u201F]/g, '"') // Double curly quotes to straight
          // Replace special dashes and hyphens
          .replace(/[\u2013\u2014\u2015]/g, '-') // En-dash, em-dash, horizontal bar
          .replace(/[\u2010\u2011\u2012]/g, '-') // Various hyphens
          // Replace ellipsis
          .replace(/\u2026/g, '...')
          // Replace bullet points
          .replace(/[\u2022\u2023\u2043\u204C\u204D]/g, '-')
          // Replace non-breaking spaces and other space variants
          .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
          // Remove zero-width characters
          .replace(/[\u200C\u200D\uFEFF]/g, '')
          // Remove emojis - comprehensive ranges
          .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '')
          .replace(/[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{231A}-\u{231B}]/gu, '')
          .replace(/[\u{FE00}-\u{FE0F}]|[\u{E0020}-\u{E007F}]/gu, '') // Variation selectors
          // Remove other problematic Unicode symbols
          .replace(/[\u2190-\u21FF]/g, '') // Arrows
          .replace(/[\u2500-\u257F]/g, '') // Box drawing
          .replace(/[\u2580-\u259F]/g, '') // Block elements
          .replace(/[\u25A0-\u25FF]/g, '') // Geometric shapes
          .replace(/[\u2600-\u26FF]/g, '') // Miscellaneous symbols
          .replace(/[\u2700-\u27BF]/g, '') // Dingbats
          // Replace any remaining non-ASCII characters that aren't in WinAnsi
          .replace(/[^\x00-\x7F\xA0-\xFF]/g, '')
          // Replace newlines, carriage returns, tabs with spaces
          .replace(/[\n\r\t]/g, ' ')
          // Normalize multiple spaces to single space
          .replace(/\s+/g, ' ')
          .trim();
      };

      // Helper function to add a new content page by copying from template
      const addContentPage = async () => {
        // Load template again to get a fresh page 2
        const freshTemplate = await PDFDocument.load(templateBytes);
        const [copiedPage] = await pdfDoc.copyPages(freshTemplate, [1]);
        pdfDoc.addPage(copiedPage);
        return pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      };

      // Helper to check if text is a markdown table
      const isMarkdownTable = (text: string): boolean => {
        const lines = text.trim().split('\n');
        // A table has at least 2 lines (header + separator)
        if (lines.length < 2) return false;
        // Check if it has pipe separators
        return lines.some(line => line.includes('|'));
      };

      // Helper to parse and draw markdown table
      const drawTable = (page: any, tableText: string, x: number, startY: number, maxWidth: number, normalFont: any, boldFont: any, size: number): { lastY: number; needsNewPage: boolean } => {
        const lines = tableText.trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return { lastY: startY, needsNewPage: false };

        console.log('Drawing table with lines:', lines);

        // Parse table structure - filter out separator lines more carefully
        const rows = lines
          .filter(line => {
            // Keep lines that have content other than just |, -, :, and spaces
            const withoutPipes = line.replace(/\|/g, '').trim();
            const isSeparator = /^[\s\-:]+$/.test(withoutPipes);
            return !isSeparator;
          })
          .map(line => {
            // Split by | and clean up cells - don't strip emojis yet, we'll do it when drawing
            const cells = line.split('|')
              .map(cell => cell.trim())
              .filter(cell => cell.length > 0);
            
            // Check if this is a total row (contains "Total" and has amount in the text)
            const lineText = line.toLowerCase();
            const isTotalRow = lineText.includes('total') && /\$[\d,]+/.test(line);
            
            // For total rows, preserve all cells including amounts
            // For normal rows, remove the last column (Source/Methodology) to simplify layout
            if (!isTotalRow && cells.length > 3) {
              // Only remove last column if we have more than 3 columns (Cost Type, Calculation, Amount, Source)
              return cells.slice(0, -1);
            }
            
            // For rows with amount in first cell like "Total Initial Costs $48,269", split it properly
            if (isTotalRow && cells.length === 1 && cells[0].includes('$')) {
              const match = cells[0].match(/^(.*?)(\$[\d,]+)$/);
              if (match) {
                return [match[1].trim(), '', match[2].trim()];
              }
            }
            
            return cells;
          })
          .filter(row => row.length > 0);

        console.log('Parsed table rows:', rows);

        if (rows.length === 0) return { lastY: startY, needsNewPage: false };

        const columnCount = Math.max(...rows.map(r => r.length));
        const cellPadding = 5;
        const lineHeight = size + 4;
        
        // Calculate dynamic column widths based on content
        const calculateColumnWidths = (): number[] => {
          const minColWidth = 60; // Minimum column width
          const contentWidths: number[] = [];
          
          // Calculate content width for each column
          for (let col = 0; col < columnCount; col++) {
            let maxContentWidth = minColWidth;
            
            for (const row of rows) {
              if (row[col]) {
                const cellText = stripEmojis(row[col]);
                const parts = parseMarkdownText(cellText);
                
                // Calculate max word/segment width in this cell
                for (const part of parts) {
                  const partFont = part.bold ? boldFont : normalFont;
                  const words = part.text.split(' ');
                  
                  for (const word of words) {
                    const wordWidth = partFont.widthOfTextAtSize(word + ' ', size);
                    maxContentWidth = Math.max(maxContentWidth, wordWidth + 2 * cellPadding);
                  }
                }
              }
            }
            
            contentWidths.push(maxContentWidth);
          }
          
          // Calculate total desired width
          const totalDesiredWidth = contentWidths.reduce((sum, w) => sum + w, 0);
          
          // If desired width fits, use it; otherwise scale proportionally
          if (totalDesiredWidth <= maxWidth) {
            // Distribute extra space proportionally
            const extraSpace = maxWidth - totalDesiredWidth;
            return contentWidths.map(w => w + (w / totalDesiredWidth) * extraSpace);
          } else {
            // Scale down proportionally to fit
            const scale = maxWidth / totalDesiredWidth;
            return contentWidths.map(w => Math.max(minColWidth, w * scale));
          }
        };
        
        const columnWidths = calculateColumnWidths();

        let currentY = startY;

        // Helper to draw text with wrapping and markdown within a cell
        const drawCellText = (
          cellText: string, 
          cellX: number, 
          cellY: number, 
          cellWidth: number, 
          font: any,
          isHeader: boolean
        ): number => {
          const maxCellWidth = cellWidth - 2 * cellPadding;
          const parts = parseMarkdownText(stripEmojis(cellText));
          
          let currentLineY = cellY;
          let currentLineX = cellX + cellPadding;
          let lineWords: Array<{text: string, font: any}> = [];
          let lineWidth = 0;

          const drawLine = () => {
            if (lineWords.length === 0) return;
            let drawX = currentLineX;
            for (const word of lineWords) {
              page.drawText(word.text, {
                x: drawX,
                y: currentLineY,
                size,
                font: word.font,
                color: rgb(0.2, 0.2, 0.2),
              });
              drawX += word.font.widthOfTextAtSize(word.text, size);
            }
            lineWords = [];
            lineWidth = 0;
            currentLineY -= lineHeight;
          };

          for (const part of parts) {
            const partFont = (part.bold || isHeader) ? boldFont : normalFont;
            
            // Check if this is a URL (contains :// or www. or long string without spaces)
            const isURL = part.text.includes('://') || part.text.includes('www.') || 
                         (part.text.length > 40 && !part.text.includes(' '));
            
            if (isURL) {
              // Break URLs at slashes, question marks, and other delimiters
              // BUT skip breaking at the protocol (https://, http://)
              let currentSegment = '';
              const protocolEndIndex = part.text.indexOf('://') !== -1 ? part.text.indexOf('://') + 3 : 0;
              
              for (let i = 0; i < part.text.length; i++) {
                const char = part.text[i];
                currentSegment += char;
                
                // Only break at / if we're past the protocol part
                const isBreakableSlash = char === '/' && i >= protocolEndIndex;
                const shouldBreakAfter = (isBreakableSlash || ['?', '&', '='].includes(char));
                const segmentWidth = partFont.widthOfTextAtSize(currentSegment, size);
                
                if ((shouldBreakAfter && i < part.text.length - 1) || segmentWidth > maxCellWidth * 0.95) {
                  // Draw current segment
                  if (lineWidth + segmentWidth > maxCellWidth && lineWords.length > 0) {
                    drawLine();
                  }
                  
                  lineWords.push({ text: currentSegment, font: partFont });
                  lineWidth += segmentWidth;
                  
                  // Start new line for next segment
                  if (shouldBreakAfter) {
                    drawLine();
                  }
                  
                  currentSegment = '';
                }
              }
              
              // Draw any remaining segment
              if (currentSegment) {
                const segmentWidth = partFont.widthOfTextAtSize(currentSegment, size);
                if (lineWidth + segmentWidth > maxCellWidth && lineWords.length > 0) {
                  drawLine();
                }
                lineWords.push({ text: currentSegment, font: partFont });
                lineWidth += segmentWidth;
              }
            } else {
              // Normal text wrapping by words
              const words = part.text.split(' ').filter(w => w.length > 0);
              
              for (const word of words) {
                const wordWithSpace = word + ' ';
                const wordWidth = partFont.widthOfTextAtSize(wordWithSpace, size);
                
                if (lineWidth + wordWidth > maxCellWidth && lineWords.length > 0) {
                  drawLine();
                }
                
                lineWords.push({ text: wordWithSpace, font: partFont });
                lineWidth += wordWidth;
              }
            }
          }
          
          if (lineWords.length > 0) {
            drawLine();
          }

          return cellY - currentLineY;
        };

        // Calculate row height based on tallest cell
        const calculateRowHeight = (row: string[], isHeader: boolean): number => {
          let maxHeight = lineHeight + 8; // Minimum height
          
          for (let j = 0; j < row.length; j++) {
            const cellText = row[j];
            const maxCellWidth = columnWidths[j] - 2 * cellPadding;
            
            // Calculate how many lines this cell needs
            const parts = parseMarkdownText(stripEmojis(cellText));
            let currentLineWidth = 0;
            let lines = 1;
            
            for (const part of parts) {
              const partFont = (part.bold || isHeader) ? boldFont : normalFont;
              
              // Check if this is a URL (same logic as drawCellText)
              const isURL = part.text.includes('://') || part.text.includes('www.') || 
                           (part.text.length > 40 && !part.text.includes(' '));
              
              if (isURL) {
                // Calculate lines needed for URL with breaking
                // BUT skip breaking at the protocol (https://, http://)
                let currentSegment = '';
                const protocolEndIndex = part.text.indexOf('://') !== -1 ? part.text.indexOf('://') + 3 : 0;
                
                for (let i = 0; i < part.text.length; i++) {
                  const char = part.text[i];
                  currentSegment += char;
                  
                  // Only break at / if we're past the protocol part
                  const isBreakableSlash = char === '/' && i >= protocolEndIndex;
                  const shouldBreakAfter = (isBreakableSlash || ['?', '&', '='].includes(char));
                  const segmentWidth = partFont.widthOfTextAtSize(currentSegment, size);
                  
                  if ((shouldBreakAfter && i < part.text.length - 1) || segmentWidth > maxCellWidth * 0.95) {
                    if (currentLineWidth + segmentWidth > maxCellWidth && currentLineWidth > 0) {
                      lines++;
                      currentLineWidth = segmentWidth;
                    } else {
                      currentLineWidth += segmentWidth;
                    }
                    
                    if (shouldBreakAfter) {
                      lines++;
                      currentLineWidth = 0;
                    }
                    
                    currentSegment = '';
                  }
                }
                
                if (currentSegment) {
                  const segmentWidth = partFont.widthOfTextAtSize(currentSegment, size);
                  if (currentLineWidth + segmentWidth > maxCellWidth && currentLineWidth > 0) {
                    lines++;
                    currentLineWidth = segmentWidth;
                  } else {
                    currentLineWidth += segmentWidth;
                  }
                }
              } else {
                // Normal word-based calculation
                const words = part.text.split(' ').filter(w => w.length > 0);
                
                for (const word of words) {
                  const wordWithSpace = word + ' ';
                  const wordWidth = partFont.widthOfTextAtSize(wordWithSpace, size);
                  
                  if (currentLineWidth + wordWidth > maxCellWidth && currentLineWidth > 0) {
                    lines++;
                    currentLineWidth = wordWidth;
                  } else {
                    currentLineWidth += wordWidth;
                  }
                }
              }
            }
            
            const cellHeight = (lines * lineHeight) + 8;
            maxHeight = Math.max(maxHeight, cellHeight);
          }
          
          return maxHeight;
        };

        // Draw each row
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const isHeader = i === 0;
          const rowHeight = calculateRowHeight(row, isHeader);
          
          // Check if we need a new page
          if (currentY - rowHeight < bottomMargin + 40) {
            return { lastY: currentY, needsNewPage: true };
          }

          // Draw cell backgrounds (alternating for readability)
          if (!isHeader && i % 2 === 0) {
            page.drawRectangle({
              x: x,
              y: currentY - rowHeight + 2,
              width: maxWidth,
              height: rowHeight,
              color: rgb(0.95, 0.95, 0.95),
            });
          }

          // Draw cells
          for (let j = 0; j < row.length; j++) {
            const cellX = x + columnWidths.slice(0, j).reduce((sum, w) => sum + w, 0);
            const cellText = row[j];
            const font = isHeader ? boldFont : normalFont;
            
            // Draw cell text with wrapping and markdown
            drawCellText(cellText, cellX, currentY - size - 4, columnWidths[j], font, isHeader);

            // Draw vertical cell border
            if (j < row.length - 1) {
              page.drawLine({
                start: { x: cellX + columnWidths[j], y: currentY },
                end: { x: cellX + columnWidths[j], y: currentY - rowHeight },
                thickness: 0.5,
                color: rgb(0.7, 0.7, 0.7),
              });
            }
          }

          // Draw horizontal border
          page.drawLine({
            start: { x: x, y: currentY - rowHeight },
            end: { x: x + maxWidth, y: currentY - rowHeight },
            thickness: isHeader ? 1.5 : 0.5,
            color: rgb(0.5, 0.5, 0.5),
          });

          if (isHeader) {
            // Draw top border for header
            page.drawLine({
              start: { x: x, y: currentY },
              end: { x: x + maxWidth, y: currentY },
              thickness: 1.5,
              color: rgb(0.5, 0.5, 0.5),
            });
          }

          currentY -= rowHeight;
        }

        return { lastY: currentY - 25, needsNewPage: false }; // Increased spacing after table
      };

      // Helper to draw horizontal rule
      const drawHorizontalRule = (page: any, x: number, y: number, width: number): number => {
        page.drawLine({
          start: { x: x, y: y },
          end: { x: x + width, y: y },
          thickness: 1.5,
          color: rgb(0.5, 0.5, 0.5),
        });
        return y - 20; // Space after rule
      };

      // Helper to parse markdown and detect formatting
      const parseMarkdownText = (text: string): Array<{text: string, bold: boolean, italic: boolean}> => {
        // Strip emojis first to prevent encoding errors
        text = stripEmojis(text);
        const parts: Array<{text: string, bold: boolean, italic: boolean}> = [];
        let remaining = text
          .replace(/^#{1,6}\s+/gm, '') // Remove markdown headers
          .replace(/^[\*\-\+]\s+/gm, '• ') // Convert markdown bullets
          .replace(/^\d+\.\s+/gm, '') // Remove numbered lists
          .replace(/^>\s+/gm, '') // Remove blockquotes
          .replace(/`{1,3}(.*?)`{1,3}/g, '$1') // Remove code formatting
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'); // Remove links, keep text

        // Parse bold and italic
        const boldItalicRegex = /\*\*\*(.*?)\*\*\*/g;
        const boldRegex = /\*\*(.*?)\*\*/g;
        const italicRegex = /\*(.*?)\*/g;

        let lastIndex = 0;
        const segments: Array<{text: string, start: number, end: number, bold: boolean, italic: boolean}> = [];

        // Find all bold+italic
        let match;
        while ((match = boldItalicRegex.exec(remaining)) !== null) {
          segments.push({text: match[1], start: match.index, end: match.index + match[0].length, bold: true, italic: true});
        }

        // Find all bold
        boldItalicRegex.lastIndex = 0;
        remaining = text
          .replace(/^#{1,6}\s+/gm, '')
          .replace(/^[\*\-\+]\s+/gm, '• ')
          .replace(/^\d+\.\s+/gm, '')
          .replace(/^>\s+/gm, '')
          .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
        
        while ((match = boldRegex.exec(remaining)) !== null) {
          // Don't overlap with bold+italic
          if (!segments.some(s => match.index >= s.start && match.index < s.end)) {
            segments.push({text: match[1], start: match.index, end: match.index + match[0].length, bold: true, italic: false});
          }
        }

        // Find all italic
        boldRegex.lastIndex = 0;
        while ((match = italicRegex.exec(remaining)) !== null) {
          // Don't overlap with bold or bold+italic
          if (!segments.some(s => match.index >= s.start && match.index < s.end)) {
            segments.push({text: match[1], start: match.index, end: match.index + match[0].length, bold: false, italic: true});
          }
        }

        // Sort segments by position
        segments.sort((a, b) => a.start - b.start);

        // Build parts array with normal text between segments
        segments.forEach((seg, i) => {
          // Add normal text before this segment
          if (seg.start > lastIndex) {
            const normalText = remaining.substring(lastIndex, seg.start)
              .replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
            if (normalText) parts.push({text: normalText, bold: false, italic: false});
          }
          // Add formatted segment
          parts.push({text: seg.text, bold: seg.bold, italic: seg.italic});
          lastIndex = seg.end;
        });

        // Add remaining normal text
        if (lastIndex < remaining.length) {
          const normalText = remaining.substring(lastIndex)
            .replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
          if (normalText) parts.push({text: normalText, bold: false, italic: false});
        }

        // If no formatting found, return whole text as normal
        if (parts.length === 0) {
          parts.push({text: remaining.replace(/\*\*\*/g, '').replace(/\*\*/g, '').replace(/\*/g, ''), bold: false, italic: false});
        }

        return parts;
      };

      // Helper to calculate text height without drawing
      const calculateTextHeight = (text: string, maxWidth: number, normalFont: any, boldFont: any, size: number, lineSpacing: number): number => {
        const sanitizedText = stripEmojis(text); // Sanitize text first
        const parts = parseMarkdownText(sanitizedText);
        let lines = 1;
        let currentLineWidth = 0;
        
        for (const part of parts) {
          const words = part.text.split(' ');
          const font = part.bold ? boldFont : normalFont;
          
          for (const word of words) {
            const wordWithSpace = word + ' ';
            const wordWidth = font.widthOfTextAtSize(wordWithSpace, size);
            
            if (currentLineWidth + wordWidth > maxWidth && currentLineWidth > 0) {
              lines++;
              currentLineWidth = wordWidth;
            } else {
              currentLineWidth += wordWidth;
            }
          }
        }
        
        return lines * lineSpacing;
      };

      // Helper to draw text with word wrapping and markdown formatting
      const drawTextWithWrap = (page: any, text: string, x: number, startY: number, maxWidth: number, normalFont: any, boldFont: any, size: number, lineSpacing: number) => {
        const sanitizedText = stripEmojis(text); // Sanitize text first
        const parts = parseMarkdownText(sanitizedText);
        let currentY = startY;
        let currentX = x;
        
        for (const part of parts) {
          const words = part.text.split(' ');
          const font = part.bold ? boldFont : normalFont;
          
          for (const word of words) {
            const wordWithSpace = word + ' ';
            const wordWidth = font.widthOfTextAtSize(wordWithSpace, size);
            
            // Check if word fits on current line
            if (currentX + wordWidth > x + maxWidth && currentX > x) {
              // Move to next line
              currentX = x;
              currentY -= lineSpacing;
              
              // Check if we need a new page
              if (currentY < bottomMargin + 40) {
                return { needsNewPage: true, lastY: currentY, remainingParts: parts.slice(parts.indexOf(part)) };
              }
            }
            
            // Draw the word (already sanitized)
            page.drawText(wordWithSpace, {
              x: currentX,
              y: currentY,
              size,
              font,
              color: rgb(0.2, 0.2, 0.2),
            });
            
            currentX += wordWidth;
          }
        }

        return { needsNewPage: false, lastY: currentY - lineSpacing, remainingParts: [] };
      };

      // Add report title on first content page with word wrapping
      currentPage = await addContentPage();
      yPosition = pageHeight - topMargin - 20;

      // Use the property address directly as the title (which admins can edit)
      const titleText = stripEmojis(`Investment Report: ${report.address}`);
      const titleResult = drawTextWithWrap(
        currentPage,
        `**${titleText}**`,
        margin,
        yPosition,
        pageWidth - 2 * margin,
        helveticaFont,
        helveticaBold,
        18,
        24
      );
      yPosition = titleResult.lastY - 25;

      // Get ALL sections from the report dynamically instead of hardcoded list
      const allSectionNames = Object.keys(sections).filter(name => 
        name && sections[name] && sections[name].trim().length > 0
      );
      
      console.log('Found sections to include in PDF:', allSectionNames);
      console.log('✏️ Step 5.1: Starting to render', allSectionNames.length, 'sections...');

      let sectionCount = 0;
      for (const sectionName of allSectionNames) {
        sectionCount++;
        const content = sections[sectionName];
        if (!content) continue;

        // Clean section name and strip emojis
        const cleanSectionName = stripEmojis(
          sectionName
            .replace(/^#{1,6}\s*/, '')
            .replace(/:\s*$/, '')
            .trim()
        );
        
        console.log(`  📝 Section ${sectionCount}/${allSectionNames.length}: "${cleanSectionName}"`);

        // Calculate total height needed for this section
        const paragraphs = groupContentBlocks(content);
        console.log(`     → ${paragraphs.length} content blocks`);
        const sectionTitleHeight = 30;
        let totalContentHeight = 0;
        
        // Calculate height of first content block (to ensure it stays with heading)
        let firstBlockHeight = 0;
        
        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
          const paragraph = paragraphs[pIdx];
          if (!paragraph.trim()) continue;
          
          let blockHeight = 0;
          
          // Check for horizontal rule
          if (paragraph.trim().match(/^-{3,}$/)) {
            blockHeight = 20;
          } else if (isMarkdownTable(paragraph)) {
            // Estimate table height: count rows and multiply by row height
            const tableLines = paragraph.split('\n').filter(l => l.trim() && !l.match(/^[\|\s\-:]+$/));
            blockHeight = tableLines.length * (textSize + 12) + 16; // row height + padding
          } else {
            // Regular text - calculate height normally
            blockHeight = calculateTextHeight(
              paragraph,
              pageWidth - 2 * margin,
              helveticaFont,
              helveticaBold,
              textSize,
              lineHeight
            ) + 8; // paragraph spacing
          }
          
          totalContentHeight += blockHeight;
          
          // Capture first meaningful block height (skip horizontal rules)
          if (firstBlockHeight === 0 && !paragraph.trim().match(/^-{3,}$/)) {
            firstBlockHeight = blockHeight;
          }
        }
        
        const totalSectionHeight = sectionTitleHeight + totalContentHeight + 15; // section spacing
        
        // IMPROVED PAGE BREAK LOGIC:
        // 1. Minimum content with heading = title + first content block (at least 120px)
        // 2. Never leave a heading orphaned at the bottom of a page
        const minContentWithHeading = Math.max(sectionTitleHeight + firstBlockHeight + 30, 150);
        const remainingSpace = yPosition - bottomMargin;
        
        // Force new page if we can't fit heading + first content block together
        if (remainingSpace < minContentWithHeading) {
          console.log(`     → Page break: only ${Math.round(remainingSpace)}px remaining, need ${Math.round(minContentWithHeading)}px for heading + first block`);
          currentPage = await addContentPage();
          yPosition = pageHeight - topMargin - 20;
        }
        // Or if entire section fits and current space is tight, start fresh
        else if (totalSectionHeight < (pageHeight - topMargin - bottomMargin - 100) && 
            yPosition - totalSectionHeight < bottomMargin + 40) {
          console.log(`     → Page break: section fits on new page (${Math.round(totalSectionHeight)}px), starting fresh`);
          currentPage = await addContentPage();
          yPosition = pageHeight - topMargin - 20;
        }

        // Draw section title with word wrapping
        const titleResult = drawTextWithWrap(
          currentPage,
          `**${stripEmojis(cleanSectionName)}**`,
          margin,
          yPosition,
          pageWidth - 2 * margin,
          helveticaFont,
          helveticaBold,
          titleSize,
          20
        );
        yPosition = titleResult.lastY - 10;

        // Draw paragraphs
        for (const paragraph of paragraphs) {
          if (!paragraph.trim()) continue;

          // Check for horizontal rule (---)
          if (paragraph.trim().match(/^-{3,}$/)) {
            // Check if we need a new page
            if (yPosition < bottomMargin + 60) {
              currentPage = await addContentPage();
              yPosition = pageHeight - topMargin - 20;
            }
            yPosition = drawHorizontalRule(currentPage, margin, yPosition - 10, pageWidth - 2 * margin);
            continue;
          }

          // Check if paragraph is a markdown table (but skip contact sections)
          if (isMarkdownTable(paragraph) && !cleanSectionName.toLowerCase().includes('contact')) {
            console.log('     ✓ Detected markdown table, rendering...');
            try {
              // Check if we need a new page
              if (yPosition < bottomMargin + 100) {
                currentPage = await addContentPage();
                yPosition = pageHeight - topMargin - 20;
              }

              const tableResult = drawTable(
                currentPage,
                paragraph,
                margin,
                yPosition,
                pageWidth - 2 * margin,
                helveticaFont,
                helveticaBold,
                textSize
              );

              if (tableResult.needsNewPage) {
                currentPage = await addContentPage();
                yPosition = pageHeight - topMargin - 20;
                // Retry drawing the table on new page
                const retryResult = drawTable(
                  currentPage,
                  paragraph,
                  margin,
                  yPosition,
                  pageWidth - 2 * margin,
                  helveticaFont,
                  helveticaBold,
                  textSize
                );
                yPosition = retryResult.lastY;
              } else {
                yPosition = tableResult.lastY;
              }
              console.log('     ✓ Table rendered successfully');
            } catch (tableError) {
              console.error('     ❌ Error rendering table:', tableError);
              console.error('     Table content:', paragraph.substring(0, 200));
              throw tableError;
            }
            continue;
          }

          // Regular paragraph with text wrapping
          let remainingParts = parseMarkdownText(paragraph);
          
          while (remainingParts.length > 0) {
            // Check if we need a new page before starting paragraph
            if (yPosition < bottomMargin + 60) {
              currentPage = await addContentPage();
              yPosition = pageHeight - topMargin - 20;
            }

            const paragraphText = remainingParts.map(p => {
              if (p.bold && p.italic) return `***${p.text}***`;
              if (p.bold) return `**${p.text}**`;
              if (p.italic) return `*${p.text}*`;
              return p.text;
            }).join('');

            const result = drawTextWithWrap(
              currentPage,
              paragraphText,
              margin,
              yPosition,
              pageWidth - 2 * margin,
              helveticaFont,
              helveticaBold,
              textSize,
              lineHeight
            );

            if (result.needsNewPage) {
              currentPage = await addContentPage();
              yPosition = pageHeight - topMargin - 20;
              remainingParts = result.remainingParts;
            } else {
              yPosition = result.lastY;
              remainingParts = [];
            }
          }

          yPosition -= 8; // Space between paragraphs
        }

        yPosition -= 15; // Space between sections
      }

      // Add page numbers to all pages except first and last
      console.log('🔢 Step 5.5: Adding page numbers...');
      const allPages = pdfDoc.getPages();
      const totalPages = allPages.length;
      console.log(`✓ Total pages in document: ${totalPages}`);
      
      // Add page numbers starting from page 2 (index 1), excluding last page
      for (let i = 1; i < totalPages - 1; i++) {
        const page = allPages[i];
        const pageNumber = i + 1; // Display page number (2, 3, 4, ...)
        
        // Draw page number in bottom left corner
        page.drawText(String(pageNumber), {
          x: 60, // Left margin position
          y: 40, // Bottom position
          size: 10,
          font: helveticaFont,
          color: rgb(0.4, 0.4, 0.4), // Gray color
        });
        
        console.log(`  ✓ Added page number ${pageNumber} to page index ${i}`);
      }
      console.log(`✓ Page numbering complete (pages 2-${totalPages - 1})`);

      // Save the PDF
      console.log('💾 Step 6: Saving PDF document...');
      const pdfBytes = await pdfDoc.save();
      console.log('✓ PDF saved, size:', pdfBytes.length, 'bytes');
      
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      console.log('✓ Blob created');
      
      // Upload to Supabase Storage
      console.log('☁️ Step 7: Uploading to Supabase Storage...');
      const fileName = `${report.id}_${suburb}_${state}_${Date.now()}.pdf`;
      console.log('📤 Uploading as:', fileName);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('investment-reports')
        .upload(fileName, blob, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        console.error('❌ Upload failed:', uploadError);
        throw uploadError;
      }
      console.log('✓ Upload successful:', uploadData);

      // Get public URL
      console.log('🔗 Step 8: Getting public URL...');
      const { data: { publicUrl } } = supabase.storage
        .from('investment-reports')
        .getPublicUrl(fileName);
      console.log('✓ Public URL:', publicUrl);

      // Update the investment_reports table with the PDF URL
      console.log('💽 Step 9: Updating database...');
      const { error: updateError } = await supabase
        .from('investment_reports')
        .update({ pdf_url: publicUrl })
        .eq('id', report.id);

      if (updateError) {
        console.error('❌ Database update failed:', updateError);
        throw updateError;
      }
      console.log('✓ Database updated');

      // Download the PDF
      console.log('⬇️ Step 10: Triggering browser download...');
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${suburb}_${state}_Investment_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      console.log('✓ Download triggered');

      console.log('✅ PDF generation completed successfully!');
      toast.success('PDF generated and saved successfully!');
    } catch (error) {
      console.error('❌ PDF generation error:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // More specific error message
      let errorMessage = 'Failed to generate PDF. ';
      if (error instanceof Error) {
        if (error.message.includes('WinAnsi')) {
          errorMessage += 'Special characters encoding issue detected.';
        } else if (error.message.includes('template')) {
          errorMessage += 'Template loading failed.';
        } else if (error.message.includes('storage')) {
          errorMessage += 'Failed to upload to storage.';
        } else {
          errorMessage += error.message;
        }
      }
      
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={generatePixelPerfectPDF}
      disabled={isGenerating}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      {isGenerating ? 'Generating PDF...' : 'Download Client PDF'}
    </Button>
  );
};
