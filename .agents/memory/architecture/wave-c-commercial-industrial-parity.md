---
name: Wave C – Commercial/Industrial Parity & Financing
description: Schema and UI parity for commercial/industrial properties — new commercial_capex, commercial_financing, industrial_financing tables; BC engine prefers relational financing with JSONB/DCF fallback
type: feature
---
Tables (all strict service_role RLS, accessed via `manage-commercial-data` / `manage-industrial-data`):
- `commercial_capex` — year/amount/category/notes, FK property_id (cascade)
- `commercial_financing` — one-to-one with commercial_properties (UNIQUE property_id), full loan fields (lender, loan_amount, loan_balance, interest_rate, loan_term_years, io_period_years, repayment_type, lvr_pct, upfront_fees, ongoing_fees_pa, rate_type, notes)
- `industrial_financing` — same shape as commercial_financing, one-to-one with industrial_properties; legacy JSONB column `industrial_properties.industrial_financing` retained for backwards-compat fallback

Edge fn whitelists updated: both `manage-commercial-data` and `manage-industrial-data` accept the new tables. Commercial fn now distinguishes user-owned tables (carry user_id) from property-owned tables (commercial_capex/commercial_financing — ownership via inner join on commercial_properties.user_id).

BC engine (`calculate-borrowing-capacity/segments`):
- `industrial.ts`: bulk-fetches `industrial_financing` rows then prefers relational over legacy JSONB; emits assumption when falling back to legacy
- `commercial.ts`: bulk-fetches `commercial_financing` rows then prefers relational over latest `commercial_dcf_runs`; falls back to policy defaults

UI:
- Shared `<PropertyFinancingPanel>` at `src/components/property/PropertyFinancingPanel.tsx` — single form, create/update one row per property
- `CommercialCapexTable` mirrors `IndustrialCapexTable` (categories: base_building/fit_out/compliance/lifts/hvac/roof/facade/sustainability/other)
- New tabs added: Commercial detail → Capex + Financing; Industrial detail → Financing (Capex already existed)

Hooks: `useCommercialCapex`, `useCommercialFinancing`, `useIndustrialFinancing` + corresponding `commercialApi.*Capex/*Financing` and `industrialApi.*Financing` methods.
