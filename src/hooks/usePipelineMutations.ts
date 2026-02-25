import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';

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
    onSuccess: () => {
      invalidate();
    },
    onError: (err: any) => {
      toast.error('Failed to update: ' + err.message);
    },
  });

  return { updateBuildPayment };
}
