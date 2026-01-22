import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Generic types that work with actual database schema
// Using Record<string, any> with key required fields to maintain flexibility
export interface ClientData {
  id: string;
  primary_first_name: string | null;
  primary_surname: string | null;
  created_at: string;
  [key: string]: any; // Allow additional fields from DB
}

export interface ClientProperty {
  id: string;
  client_id: string;
  created_at: string;
  [key: string]: any; // Allow additional fields from DB
}

export interface ClientIncome {
  id: string;
  client_id: string;
  created_at: string;
  [key: string]: any;
}

export interface ClientAsset {
  id: string;
  client_id: string;
  created_at: string;
  [key: string]: any;
}

export interface ClientLiability {
  id: string;
  client_id: string;
  created_at: string;
  [key: string]: any;
}

export interface ClientExpense {
  id: string;
  client_id: string;
  created_at: string;
  [key: string]: any;
}

export interface ClientEmployment {
  id: string;
  client_id: string;
  created_at: string;
  [key: string]: any;
}

export interface SecureClientDataResponse {
  client: ClientData | null;
  properties: ClientProperty[];
  employment: ClientEmployment[];
  income: ClientIncome[];
  assets: ClientAsset[];
  liabilities: ClientLiability[];
  expenses: ClientExpense[];
  notes?: any[];
  files?: any[];
  activities?: any[];
  borrowingCapacity?: any;
}

interface UseSecureClientDataOptions {
  clientId: string;
  include?: {
    client?: boolean;
    properties?: boolean;
    employment?: boolean;
    income?: boolean;
    assets?: boolean;
    liabilities?: boolean;
    expenses?: boolean;
    notes?: boolean;
    files?: boolean;
    activities?: boolean;
    borrowingCapacity?: boolean;
  };
  enabled?: boolean;
}

/**
 * Helper function to get session token
 */
function getSessionToken(): string | null {
  return localStorage.getItem('session_token');
}

/**
 * Fetch client data securely via Edge Function with fallback to direct queries
 * This provides backward compatibility during the security transition
 */
async function fetchClientDataSecure(
  clientId: string,
  include: UseSecureClientDataOptions['include'] = {}
): Promise<SecureClientDataResponse> {
  const sessionToken = getSessionToken();
  
  // Default includes if not specified
  const includeConfig = {
    client: include.client !== false,
    properties: include.properties !== false,
    employment: include.employment !== false,
    income: include.income !== false,
    assets: include.assets !== false,
    liabilities: include.liabilities !== false,
    expenses: include.expenses !== false,
    notes: include.notes ?? false,
    files: include.files ?? false,
    activities: include.activities ?? false,
    borrowingCapacity: include.borrowingCapacity ?? false,
  };

  // Try secure Edge Function first if we have a session
  if (sessionToken) {
    try {
      const { data, error } = await supabase.functions.invoke('get-client-data', {
        body: {
          session_token: sessionToken,
          clientId,
          include: includeConfig,
        },
      });

      if (!error && data?.success) {
        return {
          client: data.data?.client || null,
          properties: data.data?.properties || [],
          employment: data.data?.employment || [],
          income: data.data?.income || [],
          assets: data.data?.assets || [],
          liabilities: data.data?.liabilities || [],
          expenses: data.data?.expenses || [],
          notes: data.data?.notes || [],
          files: data.data?.files || [],
          activities: data.data?.activities || [],
          borrowingCapacity: data.data?.borrowingCapacity || null,
        };
      }
      
      // If edge function fails (but not 401), log warning and fall through to direct query
      if (error && !error.message?.includes('401')) {
        console.warn('Secure fetch failed, falling back to direct query:', error.message);
      }
    } catch (err) {
      console.warn('Edge function call failed, falling back to direct query:', err);
    }
  }

  // Fallback: Direct Supabase queries (backward compatible during transition)
  // This maintains existing functionality while we migrate
  const result: SecureClientDataResponse = {
    client: null,
    properties: [],
    employment: [],
    income: [],
    assets: [],
    liabilities: [],
    expenses: [],
  };

  const promises: Promise<void>[] = [];

  if (includeConfig.client) {
    const clientPromise = (async () => {
      const { data } = await supabase.from('clients').select('*').eq('id', clientId).single();
      result.client = data as ClientData | null;
    })();
    promises.push(clientPromise);
  }

  if (includeConfig.properties) {
    const propsPromise = (async () => {
      const { data } = await supabase.from('client_properties').select('*').eq('client_id', clientId).order('created_at');
      result.properties = (data || []) as ClientProperty[];
    })();
    promises.push(propsPromise);
  }

  if (includeConfig.employment) {
    const empPromise = (async () => {
      const { data } = await supabase.from('client_employment').select('*').eq('client_id', clientId);
      result.employment = (data || []) as ClientEmployment[];
    })();
    promises.push(empPromise);
  }

  if (includeConfig.income) {
    const incPromise = (async () => {
      const { data } = await supabase.from('client_income').select('*').eq('client_id', clientId);
      result.income = (data || []) as ClientIncome[];
    })();
    promises.push(incPromise);
  }

  if (includeConfig.assets) {
    const assetPromise = (async () => {
      const { data } = await supabase.from('client_assets').select('*').eq('client_id', clientId);
      result.assets = (data || []) as ClientAsset[];
    })();
    promises.push(assetPromise);
  }

  if (includeConfig.liabilities) {
    const liabPromise = (async () => {
      const { data } = await supabase.from('client_liabilities').select('*').eq('client_id', clientId);
      result.liabilities = (data || []) as ClientLiability[];
    })();
    promises.push(liabPromise);
  }

  if (includeConfig.expenses) {
    const expPromise = (async () => {
      const { data } = await supabase.from('client_expenses').select('*').eq('client_id', clientId);
      result.expenses = (data || []) as ClientExpense[];
    })();
    promises.push(expPromise);
  }

  if (includeConfig.notes) {
    const notesPromise = (async () => {
      const { data } = await supabase.from('client_notes').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
      result.notes = data || [];
    })();
    promises.push(notesPromise);
  }

  if (includeConfig.files) {
    const filesPromise = (async () => {
      const { data } = await supabase.from('client_files').select('*').eq('client_id', clientId);
      result.files = data || [];
    })();
    promises.push(filesPromise);
  }

  if (includeConfig.activities) {
    const activitiesPromise = (async () => {
      const { data } = await supabase.from('client_activities').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(50);
      result.activities = data || [];
    })();
    promises.push(activitiesPromise);
  }

  if (includeConfig.borrowingCapacity) {
    const bcPromise = (async () => {
      const { data } = await supabase.from('borrowing_capacity_assessments').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1);
      result.borrowingCapacity = data?.[0] || null;
    })();
    promises.push(bcPromise);
  }

  await Promise.all(promises);
  return result;
}

/**
 * Hook for fetching client data securely
 * Uses Edge Function with session validation, with fallback to direct queries
 */
export function useSecureClientData({
  clientId,
  include = {},
  enabled = true,
}: UseSecureClientDataOptions) {
  return useQuery({
    queryKey: ['secure-client-data', clientId, include],
    queryFn: () => fetchClientDataSecure(clientId, include),
    enabled: enabled && !!clientId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook for fetching just the client record
 */
export function useSecureClient(clientId: string, enabled = true) {
  return useQuery({
    queryKey: ['secure-client', clientId],
    queryFn: async () => {
      const result = await fetchClientDataSecure(clientId, { 
        client: true, 
        properties: false, 
        employment: false, 
        income: false, 
        assets: false, 
        liabilities: false,
        expenses: false,
      });
      return result.client;
    },
    enabled: enabled && !!clientId,
  });
}

/**
 * Hook for fetching client properties
 */
export function useSecureClientProperties(clientId: string, enabled = true) {
  return useQuery({
    queryKey: ['secure-client-properties', clientId],
    queryFn: async () => {
      const result = await fetchClientDataSecure(clientId, { 
        client: false, 
        properties: true, 
        employment: false, 
        income: false, 
        assets: false, 
        liabilities: false,
        expenses: false,
      });
      return result.properties;
    },
    enabled: enabled && !!clientId,
  });
}

// Type for manage operations
type ManageOperation = 'create' | 'update' | 'delete';
type ManageTable = 'clients' | 'client_properties' | 'client_income' | 'client_assets' | 
                   'client_liabilities' | 'client_expenses' | 'client_employment' | 
                   'client_notes' | 'client_files';

interface ManageClientDataParams {
  operation: ManageOperation;
  table: ManageTable;
  data?: Record<string, any>;
  id?: string;
  clientId?: string;
}

/**
 * Manage client data securely via Edge Function with fallback
 */
async function manageClientDataSecure(params: ManageClientDataParams): Promise<any> {
  const sessionToken = getSessionToken();
  
  // Try secure Edge Function first if we have a session
  if (sessionToken) {
    try {
      const { data, error } = await supabase.functions.invoke('manage-client-data', {
        body: {
          session_token: sessionToken,
          ...params,
        },
      });

      if (!error && data?.success) {
        return data.data;
      }
      
      if (error && !error.message?.includes('401')) {
        console.warn('Secure manage failed, falling back to direct query:', error.message);
      }
    } catch (err) {
      console.warn('Edge function call failed, falling back to direct query:', err);
    }
  }

  // Fallback: Direct Supabase operations (backward compatible during transition)
  const { operation, table, data: payload, id } = params;

  switch (operation) {
    case 'create': {
      const { data: result, error } = await supabase
        .from(table)
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return result;
    }
    case 'update': {
      if (!id) throw new Error('ID required for update');
      const { data: result, error } = await supabase
        .from(table)
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result;
    }
    case 'delete': {
      if (!id) throw new Error('ID required for delete');
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { deleted: true };
    }
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

/**
 * Hook for managing client data (create/update/delete)
 */
export function useManageClientData() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: manageClientDataSecure,
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      if (variables.clientId) {
        queryClient.invalidateQueries({ queryKey: ['secure-client-data', variables.clientId] });
        queryClient.invalidateQueries({ queryKey: ['secure-client', variables.clientId] });
        queryClient.invalidateQueries({ queryKey: ['secure-client-properties', variables.clientId] });
        
        // Also invalidate legacy query keys for backward compatibility
        queryClient.invalidateQueries({ queryKey: ['client-details', variables.clientId] });
        queryClient.invalidateQueries({ queryKey: ['client-properties', variables.clientId] });
        queryClient.invalidateQueries({ queryKey: ['client-income', variables.clientId] });
        queryClient.invalidateQueries({ queryKey: ['client-assets', variables.clientId] });
        queryClient.invalidateQueries({ queryKey: ['client-liabilities', variables.clientId] });
        queryClient.invalidateQueries({ queryKey: ['client-expenses', variables.clientId] });
        queryClient.invalidateQueries({ queryKey: ['client-employment', variables.clientId] });
      }
      
      // Invalidate clients list
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

/**
 * Utility to get session token for components that need it
 */
export function useSessionToken() {
  return getSessionToken();
}
