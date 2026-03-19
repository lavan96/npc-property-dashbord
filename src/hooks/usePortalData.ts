import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePortalAuth } from './usePortalAuth';

const SUPABASE_URL = "https://dduzbchuswwbefdunfct.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdXpiY2h1c3d3YmVmZHVuZmN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NDM4NzksImV4cCI6MjA3MTAxOTg3OX0.eSYU6fxIc3tBQuGLsdBRff0alBMkNfvv7OpW0efNjxk";
const PORTAL_SESSION_KEY = 'portal_session_token';

function getSessionToken(): string | null {
  try { return sessionStorage.getItem(PORTAL_SESSION_KEY) || localStorage.getItem(PORTAL_SESSION_KEY); }
  catch { try { return localStorage.getItem(PORTAL_SESSION_KEY); } catch { return null; } }
}

async function invokePortalEdge(functionName: string, body: Record<string, any>) {
  const sessionToken = getSessionToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      ...(sessionToken ? { 'x-portal-session-token': sessionToken } : {}),
    },
    credentials: 'omit',
    body: JSON.stringify({ ...body, portal_session_token: sessionToken, session_token: sessionToken }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

export interface PortalDataInclude {
  client?: boolean;
  properties?: boolean;
  employment?: boolean;
  income?: boolean;
  expenses?: boolean;
  assets?: boolean;
  liabilities?: boolean;
  deals?: boolean;
  emails?: boolean;
  files?: boolean;
  borrowingCapacity?: boolean;
  notifications?: boolean;
  messages?: boolean;
  reports?: boolean;
  reportRequests?: boolean;
}

/**
 * Fetch all portal client data in a single request
 */
export function usePortalClientData(include: PortalDataInclude = {}) {
  const { user } = usePortalAuth();

  return useQuery({
    queryKey: ['portal-client-data', user?.client_id, include],
    queryFn: () => invokePortalEdge('get-portal-client-data', { include }),
    enabled: !!user?.client_id,
    staleTime: 30000,
  });
}

/**
 * Fetch portal dashboard data (client + properties + deals)
 */
export function usePortalDashboardData() {
  return usePortalClientData({
    client: true,
    properties: true,
    deals: true,
    borrowingCapacity: true,
    notifications: true,
  });
}

/**
 * Fetch portal notifications
 */
export function usePortalNotificationsData() {
  return usePortalClientData({
    client: false,
    properties: false,
    notifications: true,
  });
}

/**
 * Fetch portal messages
 */
export function usePortalMessagesData() {
  return usePortalClientData({
    client: false,
    properties: false,
    messages: true,
  });
}

/**
 * Fetch portal deal progress data
 */
export function usePortalDealProgressData() {
  return usePortalClientData({
    client: false,
    properties: false,
    deals: true,
  });
}

/**
 * Fetch portal profile data
 */
export function usePortalProfileData() {
  return usePortalClientData({
    client: true,
    properties: false,
  });
}

/**
 * Fetch portal properties data
 */
export function usePortalPropertiesData() {
  return usePortalClientData({
    client: false,
    properties: true,
  });
}

/**
 * Fetch portal employment & finances data
 */
export function usePortalFinancesData() {
  return usePortalClientData({
    client: true,
    employment: true,
    income: true,
    expenses: true,
    assets: true,
    liabilities: true,
  });
}

/**
 * Fetch portal emails
 */
export function usePortalEmailsData() {
  return usePortalClientData({
    client: false,
    properties: false,
    emails: true,
  });
}

/**
 * Fetch portal reports and report requests
 */
export function usePortalReportsAndRequestsData() {
  return usePortalClientData({
    client: false,
    properties: true,
    reports: true,
    reportRequests: true,
  });
}

/**
 * Fetch portal documents
 */
export function usePortalDocumentsData() {
  return usePortalClientData({
    client: false,
    properties: false,
    files: true,
  });
}

/**
 * Mutation hook for updating portal client data
 */
export function usePortalUpdateData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { operation: string; table: string; data?: Record<string, any>; id?: string }) =>
      invokePortalEdge('manage-portal-client-data', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-client-data'] });
    },
  });
}
