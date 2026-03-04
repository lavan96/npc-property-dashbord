import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import { logActivityDirect } from '@/hooks/useActivityLogger';

async function manageDealData(params: {
  operation: string;
  table: string;
  clientId?: string;
  recordId?: string;
  data?: any;
}) {
  const { data, error } = await invokeSecureFunction('manage-client-data', params);
  if (error) throw new Error(error.message || 'Operation failed');
  if (!data?.success) throw new Error(data?.error || 'Operation failed');
  return data.result;
}

/**
 * Provides mutations for updating build payments and deal data
 * from the pipeline page (cross-client context).
 */
export function usePipelineMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['all-deals'] });
  };

  const updateBuildPayment = useMutation({
    mutationFn: async ({ paymentId, clientId, data }: { paymentId: string; clientId: string; data: any }) => {
      return manageDealData({
        operation: 'update',
        table: 'build_progress_payments',
        clientId,
        recordId: paymentId,
        data,
      });
    },
    onSuccess: (_: any, variables: { paymentId: string; clientId: string; data: any }) => {
      invalidate();
      logActivityDirect({
        actionType: 'build_payment_updated',
        entityType: 'deal',
        entityId: variables.paymentId,
      });
    },
    onError: (err: any) => {
      toast.error('Failed to update: ' + err.message);
    },
  });

  const updateDeal = useMutation({
    mutationFn: async ({ dealId, clientId, data }: { dealId: string; clientId: string; data: any }) => {
      return manageDealData({
        operation: 'update',
        table: 'client_deals',
        clientId,
        recordId: dealId,
        data,
      });
    },
    onSuccess: (_: any, variables: { dealId: string; clientId: string; data: any }) => {
      invalidate();
      logActivityDirect({
        actionType: 'deal_updated',
        entityType: 'deal',
        entityId: variables.dealId,
      });
      toast.success('Deal updated');
    },
    onError: (err: any) => {
      toast.error('Failed to update deal: ' + err.message);
    },
  });

  const updateDealStage = useMutation({
    mutationFn: async ({ stageId, clientId, data }: { stageId: string; clientId: string; data: any }) => {
      return manageDealData({
        operation: 'update',
        table: 'deal_stages',
        clientId,
        recordId: stageId,
        data,
      });
    },
    onSuccess: (_: any, variables: { stageId: string; clientId: string; data: any }) => {
      invalidate();
      logActivityDirect({
        actionType: 'deal_stage_changed',
        entityType: 'deal',
        entityId: variables.stageId,
      });
      toast.success('Stage updated');
    },
    onError: (err: any) => {
      toast.error('Failed to update stage: ' + err.message);
    },
  });

  return { updateBuildPayment, updateDeal, updateDealStage };
}
