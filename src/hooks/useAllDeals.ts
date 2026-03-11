import { useQuery } from '@tanstack/react-query';
import { invokeSecureFunction } from '@/lib/secureInvoke';
import { formatFullName } from '@/utils/nameFormatting';

export interface DealWithClient {
  id: string;
  client_id: string;
  deal_type: 'existing_property' | 'house_and_land' | 'refinance';
  current_stage: string;
  current_stage_number: number;
  risk_status: 'on_track' | 'needs_follow_up' | 'urgent';
  responsible_person: string | null;
  total_contract_price: number | null;
  land_price: number | null;
  property_address: string | null;
  build_price: number | null;
  loan_amount: number | null;
  valuation_completed: boolean;
  settlement_date: string | null;
  finance_clause_expiry: string | null;
  land_settlement_date: string | null;
  expected_build_start: string | null;
  estimated_completion: string | null;
  notes: string | null;
  commission_estimate: number | null;
  new_loan_amount: number | null;
  clawback_expiry_date: string | null;
  clawback_period_months: number | null;
  created_at: string;
  updated_at: string;
  // Joined from client
  client_name?: string;
  // Nested
  stages?: any[];
  buildPayments?: any[];
  invoices?: any[];
  leadSource?: string | null;
}

/**
 * Fetches all deals across all clients via the get-client-data edge function
 * using listMode with client_deals table
 */
export function useAllDeals() {
  return useQuery({
    queryKey: ['all-deals'],
    queryFn: async (): Promise<DealWithClient[]> => {
      // Fetch all deals
      const { data: dealsData, error: dealsError } = await invokeSecureFunction('get-client-data', {
        listMode: true,
        listOptions: {
          table: 'client_deals',
          select: '*',
          orderBy: 'created_at',
          orderAsc: false,
        },
      });

      if (dealsError || !dealsData?.success) {
        throw new Error(dealsError?.message || 'Failed to fetch deals');
      }

      const deals = dealsData.records || [];
      if (deals.length === 0) return [];

      // Fetch client names for all unique client IDs
      const clientIds = [...new Set(deals.map((d: any) => d.client_id))];
      const { data: clientsData } = await invokeSecureFunction('get-client-data', {
        clientIds,
        include: { client: true, properties: false, employment: false, income: false, assets: false, liabilities: false, expenses: false },
      });

      const clientMap: Record<string, string> = {};
      if (clientsData?.success && clientsData.clients) {
        for (const c of clientsData.clients) {
          if (c.client) {
            const name = formatFullName(c.client.primary_first_name, c.client.primary_surname);
            clientMap[c.id] = name || 'Unknown';
          }
        }
      }

      // Fetch stages & build payments for all deals
      const dealIds = deals.map((d: any) => d.id);

      const [stagesRes, paymentsRes, invoicesRes, attributionsRes] = await Promise.all([
        invokeSecureFunction('get-client-data', {
          listMode: true,
          listOptions: { table: 'deal_stages', select: '*', orderBy: 'display_order', orderAsc: true },
        }),
        invokeSecureFunction('get-client-data', {
          listMode: true,
          listOptions: { table: 'build_progress_payments', select: '*', orderBy: 'display_order', orderAsc: true },
        }),
        invokeSecureFunction('get-client-data', {
          listMode: true,
          listOptions: { table: 'builder_invoices', select: '*', orderBy: 'created_at', orderAsc: false },
        }),
        invokeSecureFunction('get-client-data', {
          listMode: true,
          listOptions: { table: 'lead_source_attributions', select: 'client_id,utm_source,utm_campaign', orderBy: 'attributed_at', orderAsc: false, limit: 500 },
        }),
      ]);

      const stages = stagesRes.data?.records || [];
      const payments = paymentsRes.data?.records || [];
      const invoices = invoicesRes.data?.records || [];

      // Group by deal_id
      const stagesByDeal: Record<string, any[]> = {};
      const paymentsByDeal: Record<string, any[]> = {};
      const invoicesByDeal: Record<string, any[]> = {};

      for (const s of stages) {
        if (!stagesByDeal[s.deal_id]) stagesByDeal[s.deal_id] = [];
        stagesByDeal[s.deal_id].push(s);
      }
      for (const p of payments) {
        if (!paymentsByDeal[p.deal_id]) paymentsByDeal[p.deal_id] = [];
        paymentsByDeal[p.deal_id].push(p);
      }
      for (const i of invoices) {
        if (!invoicesByDeal[i.deal_id]) invoicesByDeal[i.deal_id] = [];
        invoicesByDeal[i.deal_id].push(i);
      }

      return deals.map((d: any) => ({
        ...d,
        client_name: clientMap[d.client_id] || 'Unknown',
        stages: stagesByDeal[d.id] || [],
        buildPayments: paymentsByDeal[d.id] || [],
        invoices: invoicesByDeal[d.id] || [],
      }));
    },
    staleTime: 30000,
  });
}
