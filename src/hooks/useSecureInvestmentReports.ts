import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ListOptions {
  select?: string;
  status?: string | string[];
  isArchived?: boolean;
  isClientReport?: boolean | null;
  clientPropertyId?: string;
  clientPropertyIds?: string[];
  orderBy?: string;
  orderAsc?: boolean;
  limit?: number;
  createdAfter?: string;
}

interface InvestmentReport {
  id: string;
  property_address: string;
  property_listing_id: string | null;
  report_content?: string;
  sources_content?: string | null;
  created_at: string;
  current_version?: number;
  report_scope?: string;
  report_tier?: 'compass' | 'briefing' | 'snapshot';
  parent_report_id?: string | null;
  status?: string;
  is_archived?: boolean;
  manual_overrides?: any;
  financial_calculations?: any;
  demographics_data?: any;
  economic_data?: any;
  investment_score?: any;
  location_intelligence?: any;
  is_client_report?: boolean;
  client_property_id?: string;
  [key: string]: any;
}

// Helper to get session token from localStorage
const getSessionToken = (): string | null => {
  return localStorage.getItem('session_token');
};

export function useSecureInvestmentReports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch a single report by ID
  const fetchReport = useCallback(async (reportId: string): Promise<InvestmentReport | null> => {
    setLoading(true);
    setError(null);
    
    const sessionToken = getSessionToken();
    
    try {
      // Try secure Edge Function first
      if (sessionToken) {
        const { data, error: fnError } = await supabase.functions.invoke('get-investment-reports', {
          body: { reportId, session_token: sessionToken }
        });

        if (!fnError && data?.success && data?.report) {
          return data.report;
        }
        console.log('Secure fetch failed, falling back to direct query:', fnError?.message || data?.error);
      }

      // Fallback to direct query (will fail if RLS is strict)
      const { data, error: queryError } = await supabase
        .from('investment_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (queryError) {
        console.error('Direct query failed:', queryError);
        setError(queryError.message);
        return null;
      }

      return data as InvestmentReport;
    } catch (err: any) {
      console.error('Error fetching report:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch multiple reports by IDs
  const fetchReportsByIds = useCallback(async (reportIds: string[]): Promise<InvestmentReport[]> => {
    setLoading(true);
    setError(null);

    const sessionToken = getSessionToken();

    try {
      if (sessionToken) {
        const { data, error: fnError } = await supabase.functions.invoke('get-investment-reports', {
          body: { reportIds, session_token: sessionToken }
        });

        if (!fnError && data?.success && data?.reports) {
          return data.reports;
        }
        console.log('Secure fetch failed, falling back:', fnError?.message || data?.error);
      }

      // Fallback
      const { data, error: queryError } = await supabase
        .from('investment_reports')
        .select('*')
        .in('id', reportIds);

      if (queryError) {
        console.error('Direct query failed:', queryError);
        setError(queryError.message);
        return [];
      }

      return (data as InvestmentReport[]) || [];
    } catch (err: any) {
      console.error('Error fetching reports:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // List reports with filters
  const listReports = useCallback(async (options: ListOptions = {}): Promise<InvestmentReport[]> => {
    setLoading(true);
    setError(null);

    const sessionToken = getSessionToken();

    try {
      if (sessionToken) {
        const { data, error: fnError } = await supabase.functions.invoke('get-investment-reports', {
          body: { listMode: true, listOptions: options, session_token: sessionToken }
        });

        if (!fnError && data?.success && data?.reports) {
          return data.reports;
        }
        console.log('Secure list failed, falling back:', fnError?.message || data?.error);
      }

      // Fallback to direct query
      let query = supabase.from('investment_reports').select(options.select || '*');

      if (options.status) {
        if (Array.isArray(options.status)) {
          query = query.in('status', options.status);
        } else {
          query = query.eq('status', options.status);
        }
      }

      if (typeof options.isArchived === 'boolean') {
        query = query.eq('is_archived', options.isArchived);
      }

      if (options.isClientReport === true) {
        query = query.eq('is_client_report', true);
      } else if (options.isClientReport === false) {
        query = query.or('is_client_report.is.null,is_client_report.eq.false');
      }

      if (options.clientPropertyId) {
        query = query.eq('client_property_id', options.clientPropertyId);
      } else if (options.clientPropertyIds && options.clientPropertyIds.length > 0) {
        query = query.in('client_property_id', options.clientPropertyIds);
      }

      if (options.createdAfter) {
        query = query.gte('created_at', options.createdAfter);
      }

      query = query.order(options.orderBy || 'created_at', { ascending: options.orderAsc || false });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        console.error('Direct query failed:', queryError);
        setError(queryError.message);
        return [];
      }

      return (data as unknown as InvestmentReport[]) || [];
    } catch (err: any) {
      console.error('Error listing reports:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Insert a new report
  const insertReport = useCallback(async (reportData: Partial<InvestmentReport>): Promise<InvestmentReport | null> => {
    setLoading(true);
    setError(null);

    const sessionToken = getSessionToken();

    try {
      if (sessionToken) {
        const { data: result, error: fnError } = await supabase.functions.invoke('manage-investment-reports', {
          body: { action: 'insert', data: reportData, session_token: sessionToken }
        });

        if (!fnError && result?.success && result?.report) {
          return result.report;
        }
        console.log('Secure insert failed, falling back:', fnError?.message || result?.error);
      }

      // Fallback
      const { data: report, error: insertError } = await supabase
        .from('investment_reports')
        .insert(reportData as any)
        .select()
        .single();

      if (insertError) {
        console.error('Direct insert failed:', insertError);
        setError(insertError.message);
        return null;
      }

      return report as InvestmentReport;
    } catch (err: any) {
      console.error('Error inserting report:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update a report
  const updateReport = useCallback(async (reportId: string, reportData: Partial<InvestmentReport>): Promise<InvestmentReport | null> => {
    setLoading(true);
    setError(null);

    const sessionToken = getSessionToken();

    try {
      if (sessionToken) {
        const { data: result, error: fnError } = await supabase.functions.invoke('manage-investment-reports', {
          body: { action: 'update', reportId, data: reportData, session_token: sessionToken }
        });

        if (!fnError && result?.success && result?.report) {
          return result.report;
        }
        console.log('Secure update failed, falling back:', fnError?.message || result?.error);
      }

      // Fallback
      const { data: report, error: updateError } = await supabase
        .from('investment_reports')
        .update({ ...reportData, updated_at: new Date().toISOString() })
        .eq('id', reportId)
        .select()
        .single();

      if (updateError) {
        console.error('Direct update failed:', updateError);
        setError(updateError.message);
        return null;
      }

      return report as InvestmentReport;
    } catch (err: any) {
      console.error('Error updating report:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete a report
  const deleteReport = useCallback(async (reportId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const sessionToken = getSessionToken();

    try {
      if (sessionToken) {
        const { data: result, error: fnError } = await supabase.functions.invoke('manage-investment-reports', {
          body: { action: 'delete', reportId, session_token: sessionToken }
        });

        if (!fnError && result?.success) {
          return true;
        }
        console.log('Secure delete failed, falling back:', fnError?.message || result?.error);
      }

      // Fallback
      const { error: deleteError } = await supabase
        .from('investment_reports')
        .delete()
        .eq('id', reportId);

      if (deleteError) {
        console.error('Direct delete failed:', deleteError);
        setError(deleteError.message);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error('Error deleting report:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Archive/unarchive a report
  const toggleArchive = useCallback(async (reportId: string, archive: boolean): Promise<InvestmentReport | null> => {
    setLoading(true);
    setError(null);

    const sessionToken = getSessionToken();

    try {
      if (sessionToken) {
        const { data: result, error: fnError } = await supabase.functions.invoke('manage-investment-reports', {
          body: { action: archive ? 'archive' : 'unarchive', reportId, session_token: sessionToken }
        });

        if (!fnError && result?.success && result?.report) {
          return result.report;
        }
        console.log('Secure archive toggle failed, falling back:', fnError?.message || result?.error);
      }

      // Fallback
      const { data: report, error: archiveError } = await supabase
        .from('investment_reports')
        .update({ is_archived: archive, updated_at: new Date().toISOString() })
        .eq('id', reportId)
        .select()
        .single();

      if (archiveError) {
        console.error('Direct archive toggle failed:', archiveError);
        setError(archiveError.message);
        return null;
      }

      return report as InvestmentReport;
    } catch (err: any) {
      console.error('Error toggling archive:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Bulk delete reports by status
  const bulkDeleteByStatus = useCallback(async (statusFilter: string[]): Promise<number> => {
    setLoading(true);
    setError(null);

    const sessionToken = getSessionToken();

    try {
      if (sessionToken) {
        const { data: result, error: fnError } = await supabase.functions.invoke('manage-investment-reports', {
          body: { action: 'bulkDelete', reportIds: [], data: { statusFilter }, session_token: sessionToken }
        });

        if (!fnError && result?.success) {
          return result.deletedCount || 0;
        }
        console.log('Secure bulk delete failed, falling back:', fnError?.message || result?.error);
      }

      // Fallback
      const { data, error: deleteError } = await supabase
        .from('investment_reports')
        .delete()
        .in('status', statusFilter)
        .select('id');

      if (deleteError) {
        console.error('Direct bulk delete failed:', deleteError);
        setError(deleteError.message);
        return 0;
      }

      return data?.length || 0;
    } catch (err: any) {
      console.error('Error in bulk delete:', err);
      setError(err.message);
      return 0;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    fetchReport,
    fetchReportsByIds,
    listReports,
    insertReport,
    updateReport,
    deleteReport,
    toggleArchive,
    bulkDeleteByStatus
  };
}
