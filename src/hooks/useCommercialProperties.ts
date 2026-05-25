/**
 * Hook + helpers for Commercial Property data via secure edge function.
 */
import { useCallback, useEffect, useState } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';

export type CommercialAssetClass =
  | 'office' | 'retail' | 'industrial' | 'mixed_use'
  | 'medical' | 'childcare' | 'hospitality' | 'other';

export type CommercialTenure = 'freehold' | 'leasehold' | 'strata';
export type GstTreatment = 'going_concern' | 'margin_scheme' | 'standard' | 'input_taxed';
export type RentBasis = 'gross' | 'net' | 'semi_gross';
export type ReviewType = 'cpi' | 'fixed_percent' | 'market' | 'hybrid' | 'none';
export type LeaseStatus = 'occupied' | 'vacant' | 'holdover' | 'under_offer' | 'expired';
export type SecurityType = 'bond' | 'bank_guarantee' | 'personal_guarantee' | 'none';

export interface CommercialProperty {
  id: string;
  user_id: string;
  client_id?: string | null;
  address: string;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  asset_class: CommercialAssetClass;
  asset_sub_type?: string | null;
  tenure: CommercialTenure;
  zoning?: string | null;
  gfa_sqm?: number | null;
  nla_sqm?: number | null;
  site_area_sqm?: number | null;
  parking_bays?: number | null;
  year_built?: number | null;
  purchase_price?: number | null;
  acquisition_date?: string | null;
  gst_treatment: GstTreatment;
  valuation?: number | null;
  valuation_date?: string | null;
  valuer?: string | null;
  outgoings_recoverable: Record<string, number>;
  industrial_specs: Record<string, any>;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommercialLease {
  id: string;
  property_id: string;
  user_id: string;
  tenant_name: string;
  suite_unit?: string | null;
  nla_sqm?: number | null;
  lease_start?: string | null;
  lease_end?: string | null;
  option_terms: any[];
  base_rent_pa: number;
  rent_basis: RentBasis;
  review_type: ReviewType;
  review_freq_months?: number | null;
  next_review_date?: string | null;
  review_amount?: number | null;
  rent_free_months?: number | null;
  fitout_contribution?: number | null;
  cash_incentive?: number | null;
  outgoings_recovery_pct?: number | null;
  security_type: SecurityType;
  security_amount?: number | null;
  status: LeaseStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

type Table = 'commercial_properties' | 'commercial_leases' | 'commercial_dcf_runs';

async function call<T = any>(operation: string, table: Table, payload: any = {}) {
  return invokeSecureFunction<T>('manage-commercial-data', { operation, table, ...payload });
}

export const commercialApi = {
  listProperties: (clientId?: string) =>
    call<CommercialProperty[]>('list', 'commercial_properties', { clientId }),
  getProperty: (recordId: string) =>
    call<CommercialProperty>('get', 'commercial_properties', { recordId }),
  createProperty: (data: Partial<CommercialProperty>) =>
    call<CommercialProperty>('create', 'commercial_properties', { data }),
  updateProperty: (recordId: string, data: Partial<CommercialProperty>) =>
    call<CommercialProperty>('update', 'commercial_properties', { recordId, data }),
  deleteProperty: (recordId: string) =>
    call('delete', 'commercial_properties', { recordId }),

  listLeases: (propertyId: string) =>
    call<CommercialLease[]>('list', 'commercial_leases', { propertyId }),
  createLease: (data: Partial<CommercialLease>) =>
    call<CommercialLease>('create', 'commercial_leases', { data }),
  updateLease: (recordId: string, data: Partial<CommercialLease>) =>
    call<CommercialLease>('update', 'commercial_leases', { recordId, data }),
  deleteLease: (recordId: string) =>
    call('delete', 'commercial_leases', { recordId }),
};

export function useCommercialProperties() {
  const [properties, setProperties] = useState<CommercialProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await commercialApi.listProperties();
    if (res.error) setError(res.error.message);
    else { setProperties(res.data || []); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { properties, loading, error, refresh };
}

export function useCommercialLeases(propertyId: string | null) {
  const [leases, setLeases] = useState<CommercialLease[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!propertyId) { setLeases([]); return; }
    setLoading(true);
    const res = await commercialApi.listLeases(propertyId);
    if (!res.error) setLeases(res.data || []);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { leases, loading, refresh };
}
