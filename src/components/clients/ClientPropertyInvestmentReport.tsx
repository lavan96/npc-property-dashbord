import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { PreGenerationOverrides, PreGenerationData } from '@/components/reports/PreGenerationOverrides';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/contexts/NotificationsContext';
import { addBackgroundJob } from '@/components/BackgroundJobTracker';
import {
  FileText,
  Loader2,
  ChevronDown,
  Eye,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';

interface ClientPropertyInvestmentReportProps {
  property: {
    id: string;
    address: string;
    property_type: string;
    value: number | null;
    loan_remaining: number | null;
    interest_rate: number | null;
    monthly_rental_income: number | null;
    total_monthly_expenditure: number | null;
    monthly_council_rates: number | null;
    monthly_water_rates: number | null;
    monthly_body_corporate: number | null;
    monthly_building_insurance: number | null;
    monthly_landlord_insurance: number | null;
    monthly_property_management: number | null;
    monthly_repairs_maintenance: number | null;
    weekly_rental_income: number | null;
  };
  clientId: string;
  clientName: string;
}

export function ClientPropertyInvestmentReport({
  property,
  clientId,
  clientName,
}: ClientPropertyInvestmentReportProps) {
  const [isOverrideSheetOpen, setIsOverrideSheetOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [preGenData, setPreGenData] = useState<PreGenerationData>({
    buildType: 'existing_property',
  });

  const { toast } = useToast();
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  // Fetch existing investment reports for this property
  const { data: existingReports = [], refetch: refetchReports } = useQuery({
    queryKey: ['client-property-reports', property.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investment_reports')
        .select('id, property_address, status, created_at, report_content')
        .eq('client_property_id', property.id)
        .eq('is_client_report', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Pre-populate PreGenerationOverrides with property data
  const handleOpenOverrideSheet = () => {
    // Calculate weekly rent from monthly if not directly available
    const weeklyRent = property.weekly_rental_income || 
      (property.monthly_rental_income ? Math.round(property.monthly_rental_income * 12 / 52) : undefined);

    // Convert monthly expenses to annual
    const annualCouncilRates = property.monthly_council_rates ? property.monthly_council_rates * 12 : undefined;
    const annualWaterRates = property.monthly_water_rates ? property.monthly_water_rates * 12 : undefined;
    const annualBodyCorp = property.monthly_body_corporate ? property.monthly_body_corporate * 12 : undefined;
    const annualInsurance = (property.monthly_building_insurance || 0) + (property.monthly_landlord_insurance || 0);
    const annualBuildingInsurance = annualInsurance ? annualInsurance * 12 : undefined;
    const annualRepairs = property.monthly_repairs_maintenance ? property.monthly_repairs_maintenance * 12 : undefined;

    // Calculate PM percentage from monthly value
    let pmPercent: number | undefined;
    if (property.monthly_property_management && property.monthly_rental_income) {
      pmPercent = (property.monthly_property_management / property.monthly_rental_income) * 100;
    }

    setPreGenData({
      buildType: 'existing_property',
      purchasePrice: property.value || undefined,
      propertyValue: property.value || undefined,
      weeklyRent,
      interestRate: property.interest_rate || undefined,
      loanAmount: property.loan_remaining || undefined,
      councilRates: annualCouncilRates,
      waterRates: annualWaterRates,
      bodyCorporateFees: annualBodyCorp,
      buildingLandlordInsurance: annualBuildingInsurance,
      propertyManagementFees: pmPercent,
      repairsMaintenance: annualRepairs,
    });

    setIsOverrideSheetOpen(true);
  };

  const handlePreGenDataChange = (data: PreGenerationData) => {
    setPreGenData(data);
  };

  const handleGenerateReport = async () => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to generate reports.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Build propertyDetails object with all override data
      const propertyDetails: Record<string, any> = {
        // Core details
        price: preGenData.purchasePrice || property.value,
        propertyType: property.property_type === 'investment' ? 'house' : property.property_type,
        buildType: preGenData.buildType,
        
        // Pre-generation overrides
        ...preGenData,
      };

      // Clean overrides for database storage
      const cleanedOverrides = Object.fromEntries(
        Object.entries(preGenData).filter(([_, v]) => v !== undefined)
      ) as Json;

      // Create the report record with client_property_id and is_client_report flag
      const { data: pendingReport, error: insertError } = await supabase
        .from('investment_reports')
        .insert({
          property_address: property.address,
          report_content: 'Generating report...',
          status: 'pending',
          report_scope: 'address',
          generated_by: null,
          manual_overrides: cleanedOverrides,
          client_property_id: property.id,
          is_client_report: true,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating report record:', insertError);
        throw new Error(`Failed to create report: ${insertError.message || 'Database error'}`);
      }

      // Add to background job tracker
      addBackgroundJob({
        id: pendingReport.id,
        type: 'investment_report',
      });

      // Start generation in background
      supabase.functions
        .invoke('generate-investment-report', {
          body: {
            reportId: pendingReport.id,
            propertyAddress: property.address,
            propertyDetails,
          },
        })
        .catch((error) => {
          console.error('Background generation error:', error);
        });

      // Add notification
      addNotification({
        type: 'report_generation_started',
        title: 'Report Generation Started',
        message: `Generating investment report for ${property.address}...`,
        entityId: pendingReport.id,
      });

      toast({
        title: 'Report Generation Started',
        description: `Your investment report for ${property.address} is being generated in the background.`,
      });

      // Close sheet and refresh reports
      setIsOverrideSheetOpen(false);
      refetchReports();
      
    } catch (error) {
      console.error('Error starting report generation:', error);
      toast({
        title: 'Failed to Start Generation',
        description: error instanceof Error ? error.message : 'Failed to start report generation.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'pending':
      case 'processing':
        return <Clock className="h-3 w-3 text-yellow-500 animate-pulse" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  const hasExistingReports = existingReports.length > 0;

  return (
    <>
      {hasExistingReports ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Reports ({existingReports.length})
              <ChevronDown className="h-3 w-3 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onClick={handleOpenOverrideSheet}>
              <Plus className="h-4 w-4 mr-2" />
              Generate New Report
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {existingReports.slice(0, 5).map((report: any) => (
              <DropdownMenuItem
                key={report.id}
                onClick={() => {
                  // Open report viewer (could navigate or open modal)
                  window.open(`/investment-report/${report.id}`, '_blank');
                }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  {getStatusIcon(report.status)}
                  <span className="text-xs">
                    {format(new Date(report.created_at), 'dd MMM yyyy HH:mm')}
                  </span>
                </div>
                <Eye className="h-3 w-3 text-muted-foreground" />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button variant="outline" size="sm" onClick={handleOpenOverrideSheet}>
          <FileText className="h-4 w-4 mr-2" />
          Generate Report
        </Button>
      )}

      {/* Pre-Generation Overrides Sheet */}
      <Sheet open={isOverrideSheetOpen} onOpenChange={setIsOverrideSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
          <SheetHeader>
            <SheetTitle>Generate Investment Report</SheetTitle>
            <SheetDescription>
              Configure report parameters for {property.address}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1 mt-4 pr-4">
            <div className="space-y-4">
              {/* Property Summary */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Property</span>
                  <Badge variant="secondary">{property.property_type}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{property.address}</p>
                {property.value && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Value:</span>{' '}
                    {new Intl.NumberFormat('en-AU', {
                      style: 'currency',
                      currency: 'AUD',
                      maximumFractionDigits: 0,
                    }).format(property.value)}
                  </p>
                )}
              </div>

              <Separator />

              {/* Pre-Generation Overrides Component */}
              <PreGenerationOverrides
                propertyAddress={property.address}
                onDataChange={handlePreGenDataChange}
                disabled={isGenerating}
                buildType={preGenData.buildType}
                onBuildTypeChange={(bt) => setPreGenData((prev) => ({ ...prev, buildType: bt }))}
                externalPurchasePrice={preGenData.purchasePrice}
                externalPropertyValue={preGenData.propertyValue}
                externalWeeklyRent={preGenData.weeklyRent}
                externalCouncilRates={preGenData.councilRates}
                externalWaterRates={preGenData.waterRates}
                externalBodyCorporateFees={preGenData.bodyCorporateFees}
                externalBuildingInsurance={preGenData.buildingLandlordInsurance}
                externalPropertyManagementPercent={preGenData.propertyManagementFees}
              />
            </div>
          </ScrollArea>

          {/* Generate Button */}
          <div className="mt-4 pt-4 border-t">
            <Button
              onClick={handleGenerateReport}
              disabled={isGenerating}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Investment Report
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Report will be generated in the background. You'll be notified when complete.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
