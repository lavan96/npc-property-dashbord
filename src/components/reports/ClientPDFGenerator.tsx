import { PixelPerfectPDFGenerator } from './PixelPerfectPDFGenerator';

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
  // Transform the report data to match PixelPerfectPDFGenerator expectations
  const transformedReport = {
    id: report.id,
    address: report.property_address,
    content: report.report_content,
    created_at: new Date().toISOString(),
    enhanced_data: {
      domainData: null,
      absData: report.demographics_data,
      rbaData: report.economic_data,
      financialData: report.financial_calculations,
      locationData: report.location_intelligence,
      investmentScore: report.investment_score,
    }
  };

  return <PixelPerfectPDFGenerator report={transformedReport} />;
}
