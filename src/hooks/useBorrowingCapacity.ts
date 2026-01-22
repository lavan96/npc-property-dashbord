import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  calculateBorrowingCapacity as calculateLocal,
  getHemBenchmark,
  type BorrowingCapacityInput,
  type BorrowingCapacityResult,
  type FullAssessmentResult,
  type ServiceabilityBand,
} from '@/utils/borrowingCapacityCalculations';
import { toast } from 'sonner';

interface BorrowingCapacityOverrides {
  grossAnnualIncome?: number;
  additionalIncome?: number;
  livingExpenses?: number;
  additionalLiabilities?: number;
  interestRate?: number;
  bufferRate?: number;
  loanTermYears?: number;
  proposedLoanAmount?: number;
  calculationMode?: 'bank' | 'conservative';
  dtiCapEnabled?: boolean;
  dtiCapLimit?: number;
}

interface UseBorrowingCapacityOptions {
  clientId: string;
  autoFetch?: boolean;
}

/**
 * Get session token for secure API calls
 */
function getSessionToken(): string | null {
  return localStorage.getItem('session_token');
}

export function useBorrowingCapacity({ clientId, autoFetch = true }: UseBorrowingCapacityOptions) {
  const queryClient = useQueryClient();
  const [localResult, setLocalResult] = useState<BorrowingCapacityResult | null>(null);

  // Fetch latest assessment from database with secure Edge Function + fallback
  const {
    data: latestAssessment,
    isLoading: isLoadingAssessment,
    error: assessmentError,
    refetch: refetchAssessment,
  } = useQuery({
    queryKey: ['borrowing-capacity', clientId],
    queryFn: async () => {
      const sessionToken = getSessionToken();
      
      // Try secure Edge Function first
      if (sessionToken) {
        try {
          const { data, error } = await supabase.functions.invoke('get-client-data', {
            body: {
              session_token: sessionToken,
              clientId,
              include: { borrowingCapacity: true },
            },
          });
          
          if (!error && data?.success && data.data?.borrowingCapacity) {
            // Return the latest assessment (already sorted by created_at desc)
            const assessments = data.data.borrowingCapacity;
            return assessments.length > 0 ? assessments[0] : null;
          }
        } catch (err) {
          console.warn('Secure borrowing capacity fetch failed, falling back:', err);
        }
      }
      
      // Fallback: Direct Supabase query
      const { data, error } = await supabase
        .from('borrowing_capacity_assessments')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: autoFetch && !!clientId,
  });

  // Fetch assessment history with secure Edge Function + fallback
  const {
    data: assessmentHistory,
    isLoading: isLoadingHistory,
  } = useQuery({
    queryKey: ['borrowing-capacity-history', clientId],
    queryFn: async () => {
      const sessionToken = getSessionToken();
      
      // Try secure Edge Function first
      if (sessionToken) {
        try {
          const { data, error } = await supabase.functions.invoke('get-client-data', {
            body: {
              session_token: sessionToken,
              clientId,
              include: { borrowingCapacity: true },
            },
          });
          
          if (!error && data?.success && data.data?.borrowingCapacity) {
            // Return up to 10 assessments for history
            return data.data.borrowingCapacity.slice(0, 10).map((a: any) => ({
              id: a.id,
              borrowing_capacity: a.borrowing_capacity,
              serviceability_band: a.serviceability_band,
              created_at: a.created_at,
            }));
          }
        } catch (err) {
          console.warn('Secure borrowing capacity history fetch failed, falling back:', err);
        }
      }
      
      // Fallback: Direct Supabase query
      const { data, error } = await supabase
        .from('borrowing_capacity_assessments')
        .select('id, borrowing_capacity, serviceability_band, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
    enabled: autoFetch && !!clientId,
  });

  // Calculate borrowing capacity via edge function
  const calculateMutation = useMutation({
    mutationFn: async (overrides?: BorrowingCapacityOverrides) => {
      const { data, error } = await supabase.functions.invoke('calculate-borrowing-capacity', {
        body: {
          clientId,
          overrides,
          saveResult: true,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Calculation failed');
      
      return data.data as FullAssessmentResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['borrowing-capacity', clientId] });
      queryClient.invalidateQueries({ queryKey: ['borrowing-capacity-history', clientId] });
      toast.success('Borrowing capacity calculated successfully');
    },
    onError: (error: Error) => {
      console.error('Borrowing capacity calculation failed:', error);
      toast.error(`Calculation failed: ${error.message}`);
    },
  });

  // Calculate locally for instant feedback (what-if scenarios)
  const calculateLocally = useCallback((input: BorrowingCapacityInput): BorrowingCapacityResult => {
    const result = calculateLocal(input);
    setLocalResult(result);
    return result;
  }, []);

  // Quick calculate using client data without saving
  const quickCalculate = useCallback(async (overrides?: BorrowingCapacityOverrides) => {
    try {
      const { data, error } = await supabase.functions.invoke('calculate-borrowing-capacity', {
        body: {
          clientId,
          overrides,
          saveResult: false, // Don't save - just calculate
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Calculation failed');
      
      return data.data as FullAssessmentResult;
    } catch (error) {
      console.error('Quick calculation failed:', error);
      throw error;
    }
  }, [clientId]);

  // Get formatted result for display
  const getDisplayResult = useCallback((): {
    capacity: number;
    band: ServiceabilityBand;
    surplus: number;
    dtiRatio: number;
    stressTested: number;
    lastCalculated: string | null;
  } | null => {
    if (latestAssessment) {
      return {
        capacity: latestAssessment.borrowing_capacity || 0,
        band: (latestAssessment.serviceability_band as ServiceabilityBand) || 'red',
        surplus: latestAssessment.monthly_surplus || 0,
        dtiRatio: latestAssessment.dti_ratio || 0,
        stressTested: latestAssessment.stress_tested_capacity || 0,
        lastCalculated: latestAssessment.created_at,
      };
    }
    return null;
  }, [latestAssessment]);

  return {
    // State
    latestAssessment,
    assessmentHistory,
    localResult,
    isLoading: isLoadingAssessment || calculateMutation.isPending,
    isLoadingHistory,
    error: assessmentError || calculateMutation.error,
    isCalculating: calculateMutation.isPending,

    // Actions
    calculate: calculateMutation.mutate,
    calculateAsync: calculateMutation.mutateAsync,
    calculateLocally,
    quickCalculate,
    refetch: refetchAssessment,

    // Helpers
    getDisplayResult,
    getHemBenchmark,
  };
}

// Export types
export type {
  BorrowingCapacityOverrides,
  UseBorrowingCapacityOptions,
  BorrowingCapacityInput,
  BorrowingCapacityResult,
  FullAssessmentResult,
  ServiceabilityBand,
};
