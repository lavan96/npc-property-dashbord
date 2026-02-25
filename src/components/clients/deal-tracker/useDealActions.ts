import { useQueryClient, useMutation } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { toast } from 'sonner';
import {
  DealType,
  Deal,
  EXISTING_PROPERTY_STAGES,
  HOUSE_AND_LAND_STAGES,
  BUILD_PAYMENT_STAGES,
} from './types';

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

export function useDealActions(clientId: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['secure-client-data', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-deals', clientId] });
  };

  const createDeal = useMutation({
    mutationFn: async ({ dealType, propertyId }: { dealType: DealType; propertyId?: string }) => {
      // 1. Create the deal record
      const deal = await manageDealData({
        operation: 'create',
        table: 'client_deals',
        clientId,
        data: {
          deal_type: dealType,
          property_id: propertyId || null,
          current_stage: dealType === 'existing_property' ? 'Initial Holding Deposit (0.25%)' : 'Lot Secured',
          current_stage_number: 1,
        },
      });

      const dealId = deal.id;

      // 2. Create stage templates
      const stageTemplates = dealType === 'existing_property' ? EXISTING_PROPERTY_STAGES : HOUSE_AND_LAND_STAGES;
      const stagesData = stageTemplates.map((s, i) => ({
        deal_id: dealId,
        stage_number: s.stage_number,
        stage_name: s.stage_name,
        stage_category: s.stage_category,
        responsible: s.responsible,
        internal_action: s.internal_action,
        client_action: s.client_action,
        percentage_or_amount: (s as any).percentage_or_amount || null,
        display_order: i,
        status: 'pending',
      }));

      await manageDealData({
        operation: 'create',
        table: 'deal_stages',
        clientId,
        data: stagesData,
      });

      // 3. For H&L, create build payment stages
      if (dealType === 'house_and_land') {
        const paymentsData = BUILD_PAYMENT_STAGES.map((p, i) => ({
          deal_id: dealId,
          stage_number: p.stage_number,
          stage_name: p.stage_name,
          percentage: p.percentage,
          is_commission_trigger: p.is_commission_trigger,
          display_order: i,
        }));

        await manageDealData({
          operation: 'create',
          table: 'build_progress_payments',
          clientId,
          data: paymentsData,
        });
      }

      return deal;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Deal created successfully');
    },
    onError: (err: any) => {
      toast.error('Failed to create deal: ' + err.message);
    },
  });

  const updateDeal = useMutation({
    mutationFn: async ({ dealId, data }: { dealId: string; data: Partial<Deal> }) => {
      return manageDealData({
        operation: 'update',
        table: 'client_deals',
        clientId,
        recordId: dealId,
        data,
      });
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err: any) => {
      toast.error('Failed to update deal: ' + err.message);
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ stageId, data }: { stageId: string; data: any }) => {
      return manageDealData({
        operation: 'update',
        table: 'deal_stages',
        clientId,
        recordId: stageId,
        data,
      });
    },
    onSuccess: () => {
      invalidate();
    },
  });

  const updateBuildPayment = useMutation({
    mutationFn: async ({ paymentId, data }: { paymentId: string; data: any }) => {
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
  });

  const deleteDeal = useMutation({
    mutationFn: async (dealId: string) => {
      return manageDealData({
        operation: 'delete',
        table: 'client_deals',
        clientId,
        recordId: dealId,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success('Deal deleted');
    },
    onError: (err: any) => {
      toast.error('Failed to delete deal: ' + err.message);
    },
  });

  return { createDeal, updateDeal, updateStage, updateBuildPayment, deleteDeal };
}
