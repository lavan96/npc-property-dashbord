# Industrial Investment Module — Implementation Plan

Mirror the commercial build but tuned to the industrial asset class (warehousing, logistics, manufacturing, distribution, cold storage, flex/industrial estates). Industrial differs from commercial in driver economics: rent is quoted per sqm of GLA, site cover / clearance / hardstand drive value, outgoings are typically net (tenant pays), and key risks shift to tenant covenant + functional obsolescence (truck access, clearance, power, floor load).

## Step 1 — Schema & Persistence

Create three tables mirroring the commercial schema, plus an industrial-specific spec table.

- `industrial_properties` — address, asset_subtype (warehouse | logistics_hub | manufacturing | cold_storage | flex | data_centre), purchase_price, current_valuation, valuation_date, gla_sqm, site_area_sqm, site_cover_pct, office_pct, hardstand_sqm, clearance_metres, power_kva, dock_doors, ground_floor_load_kpa, zoning, year_built, condition_rating, status, notes.
- `industrial_tenancies` — property_id, tenant_name, anzsic_industry, unit_label, gla_sqm, lease_start, lease_end, base_rent_per_sqm_pa, base_rent_pa, outgoings_recovery_type (net | semi_gross | gross), annual_review_type (cpi | fixed | market | hybrid), review_rate_pct, option_terms_years, bank_guarantee_months, incentive_pct, make_good_status.
- `industrial_capex` — property_id, year, amount, category (roof | hardstand | racking | compliance | sprinkler | other), notes.
- Same `service_role`-only RLS pattern; add tables to `ALLOWED_TABLES` whitelist in `manage-industrial-data` edge function and to `supabase_realtime` publication.

## Step 2 — Edge Function & API Layer

- New edge function `manage-industrial-data` (mirror of `manage-commercial-data`) with CRUD ops on the 3 tables and `effectiveUserId` resolution.
- New client wrapper `src/utils/industrial/industrialApi.ts` using `invokeSecureFunction`.

## Step 3 — Industrial Math Engine

`src/utils/industrial/` — pure functions, fully unit-tested:

- `rentPerSqm.ts` — gross/net rent per sqm normalisation.
- `noi.ts` — industrial NOI: gross rent − vacancy − outgoings (where applicable) − non-recoverable opex − capex reserve.
- `siteMetrics.ts` — site cover %, office-to-warehouse ratio, $/sqm GLA, $/sqm site, hardstand ratio.
- `wale.ts` — WALE by income and by GLA.
- `yields.ts` — passing, market and equivalent yield.
- `dcf.ts` — 10-year DCF with rent reviews, lease expiry re-letting assumption, downtime, incentive amortisation, capex schedule.
- `industrialBorrowingCapacity.ts` — ICR (≥1.75x typical) + DSCR (≥1.35x) + LVR cap (typically 60–65% industrial) + sponsor liquidity cap. Returns lesser of caps with binding constraint and band.
- `index.ts` barrel export.
- `__tests__/industrial.test.ts` covering each engine.

## Step 4 — Pages, Hooks, Modals

Mirror commercial structure:

- `src/pages/industrial/IndustrialProperties.tsx` — list view with filters (subtype, status, valuation range, GLA range).
- `src/pages/industrial/IndustrialPropertyDetail.tsx` — overview, financial snapshot, tenancy schedule, capex, generate report button.
- `src/pages/industrial/IndustrialCalculators.tsx` — calculator hub.
- `src/hooks/useIndustrialProperties.ts` — list + mutations.
- `src/components/industrial/IndustrialPropertyFormModal.tsx`, `TenancyFormModal.tsx`, `TenancyScheduleTable.tsx`, `FinancialSnapshot.tsx`.
- Route added in `App.tsx` and sidebar entry in `DashboardSidebar.tsx` under a new "Industrial" group.

## Step 5 — Calculator Cards

`src/components/industrial/calculators/`:

- `NoiCalculatorCard.tsx`
- `CapRateCalculatorCard.tsx`
- `DcfCalculatorCard.tsx`
- `IcrDscrCalculatorCard.tsx`
- `RentPerSqmCalculatorCard.tsx` — gross↔net per sqm conversion.
- `SiteCoverCalculatorCard.tsx` — site cover %, $/sqm GLA & site, hardstand share.
- `IndustrialBorrowingCapacityCard.tsx` — wraps `calculateIndustrialBc`.

## Step 6 — Industrial Investment Report (PDF)

`src/utils/industrial/industrialReportPdf.ts` — branded Dark & Gold jsPDF report, 10 sections: Cover, Executive Summary, Asset Specification (clearance, dock doors, power, floor load, site cover), Tenancy Schedule, Income & Outgoings, Valuation & Yield, 10-Year DCF, Debt Structure (ICR/DSCR), Risk Assessment (covenant, expiry, functional obsolescence), Recommendations. Triggered from `IndustrialPropertyDetail`.

## Step 7 — Dashboard Widget

`src/components/industrial/IndustrialPortfolioWidget.tsx` — asset count, total valuation, total GLA, passing rent, NOI, weighted yield, WALE, occupancy, 12-month expiries. Rendered in `Overview.tsx` beside the commercial widget.

## Step 8 — QA Pass

Typecheck, run full vitest, smoke-test routes in preview, fix issues.

## Technical Notes

- Reuse `commercialReportPdf` jsPDF primitives (header, footer, table, KPI tile, risk chip) by extracting them into a shared `src/utils/pdf/primitives.ts` first if duplication grows — keep this optional and only refactor if Step 6 demands it.
- All money values rounded to 2 dp; rent per sqm to 2 dp; yields to 2 dp; ICR/DSCR to 2 dp.
- All new tables registered in `ALLOWED_TABLES` whitelist and `supabase_realtime` publication, per project standards.
- Use semantic theme tokens only — no hardcoded colours.

Ready to start at Step 1 (schema migration) on approval.