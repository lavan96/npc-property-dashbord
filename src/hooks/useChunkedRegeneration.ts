import { useState, useCallback, useRef } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';

interface ChunkedRegenerationOptions {
  reportId: string;
  propertyAddress: string;
  manualOverrides?: Record<string, any>;
  financialCalculations?: Record<string, any>;
  currentReportContent?: string;
  onProgress?: (section: number, total: number) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

interface RegenerationState {
  isRegenerating: boolean;
  currentSection: number;
  totalSections: number;
  error: string | null;
}

const TOTAL_SECTIONS = 12;
const MAX_RETRIES_PER_SECTION = 2;

export function useChunkedRegeneration() {
  const [state, setState] = useState<RegenerationState>({
    isRegenerating: false,
    currentSection: 0,
    totalSections: TOTAL_SECTIONS,
    error: null
  });
  
  const abortRef = useRef(false);

  const regenerate = useCallback(async (options: ChunkedRegenerationOptions) => {
    const {
      reportId,
      propertyAddress,
      manualOverrides = {},
      financialCalculations = {},
      currentReportContent = '',
      onProgress,
      onComplete,
      onError
    } = options;

    abortRef.current = false;
    setState({ isRegenerating: true, currentSection: 0, totalSections: TOTAL_SECTIONS, error: null });

    const toastId = toast.loading('Starting regeneration...', {
      description: 'Preparing to regenerate report in chunks...'
    });

    try {
      // Fetch current report state to get data for regeneration
      const { data: reportData, error: fetchError } = await invokeSecureFunction('get-investment-reports', {
        reportId,
        listOptions: {
          select: 'report_content, manual_overrides, financial_calculations, last_completed_section, status, current_version, property_address'
        }
      });

      if (fetchError) {
        throw new Error(fetchError.message || 'Failed to fetch report');
      }

      const report = reportData?.report;
      let startSection = 0;
      
      // For regeneration, we want to start fresh - reset last_completed_section to 0
      // But first, archive the current version
      if (report?.report_content && report?.current_version) {
        console.log(`[ChunkedRegeneration] Archiving current version ${report.current_version} before regeneration`);
        // The version archiving is handled by the edge function when it detects existing content
      }

      // Reset for fresh regeneration - set last_completed_section to 0
      await invokeSecureFunction('manage-investment-reports', {
        action: 'update',
        reportId,
        data: { 
          status: 'processing', 
          error_message: null,
          last_completed_section: 0 // Reset for fresh generation
        }
      });
      
      // Use property address from existing report if not provided
      const effectivePropertyAddress = propertyAddress || report?.property_address || '';

      // Generate sections one at a time
      for (let section = startSection; section < TOTAL_SECTIONS; section++) {
        if (abortRef.current) {
          console.log('[ChunkedRegeneration] Aborted by user');
          break;
        }

        setState(prev => ({ ...prev, currentSection: section + 1 }));
        onProgress?.(section + 1, TOTAL_SECTIONS);

        toast.loading(`Generating section ${section + 1}/${TOTAL_SECTIONS}...`, {
          id: toastId,
          description: 'Using Perplexity AI for fresh qualitative analysis'
        });

        let sectionSuccess = false;
        let lastError = '';

        for (let retry = 0; retry < MAX_RETRIES_PER_SECTION && !sectionSuccess; retry++) {
          if (retry > 0) {
            console.log(`[ChunkedRegeneration] Retry ${retry + 1} for section ${section + 1}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          // Use the main generate-investment-report function with singleSection mode
          const { data, error } = await invokeSecureFunction('generate-investment-report', {
            reportId,
            propertyAddress: effectivePropertyAddress,
            propertyDetails: {
              manualOverrides: manualOverrides || report?.manual_overrides || {},
              ...financialCalculations,
              ...(report?.financial_calculations || {})
            },
            continueFrom: true,
            singleSection: true // Key flag for chunked mode - generates one section per call
          });

          if (error) {
            lastError = error.message || 'Unknown error';
            console.error(`[ChunkedRegeneration] Section ${section + 1} error:`, lastError);
            continue;
          }

          if (data?.success) {
            sectionSuccess = true;
            
            // Check if this was the final section
            if (data.isComplete) {
              console.log('[ChunkedRegeneration] All sections complete');
              break;
            }
          } else {
            lastError = data?.error || 'Section generation failed';
          }
        }

        if (!sectionSuccess) {
          throw new Error(`Failed to generate section ${section + 1}: ${lastError}`);
        }
      }

      // Fetch final status to confirm completion
      const { data: finalData } = await invokeSecureFunction('get-investment-reports', {
        reportId,
        listOptions: { select: 'status, current_version, last_completed_section' }
      });

      const finalReport = finalData?.report;
      
      if (finalReport?.last_completed_section >= TOTAL_SECTIONS) {
        toast.success('Report regenerated successfully', {
          id: toastId,
          description: `Version ${finalReport.current_version || 'new'} created with updated analysis`
        });
        
        setState(prev => ({ ...prev, isRegenerating: false, currentSection: TOTAL_SECTIONS }));
        onComplete?.();
      } else {
        throw new Error('Report regeneration incomplete');
      }

    } catch (error: any) {
      console.error('[ChunkedRegeneration] Error:', error);
      const errorMessage = error.message || 'Regeneration failed';
      
      setState(prev => ({ ...prev, isRegenerating: false, error: errorMessage }));
      
      toast.error('Regeneration failed', {
        id: toastId,
        description: errorMessage
      });

      // Mark report as failed
      await invokeSecureFunction('manage-investment-reports', {
        action: 'update',
        reportId,
        data: { status: 'failed' }
      });

      onError?.(errorMessage);
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  return {
    ...state,
    regenerate,
    abort
  };
}
