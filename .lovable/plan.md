
# Commercial & Industrial Property Module — Phase 1 Plan

Based on your answers:
1. **Commercial first** (industrial later as a sub-type)
2. **Multi-tenant** support from day one
3. **DCF** included alongside direct cap & cash-on-cash
4. **GST/depreciation/scheme** modelled up front
5. **Manual entry** for cap rates / market rents (no data feed yet)
6. **Borrowing capacity engine extended** to ICR/DSCR (not a separate broker tool)

---

## Scope of Phase 1

Build a parallel "Commercial" track that mirrors the existing residential surface but uses CRE-native inputs, math, and outputs. Residential code stays untouched — no regressions to current reports or calculators.

### Deliverables

1. **Commercial Property record** (new table + UI)
2. **Lease / Tenancy Schedule** (multi-tenant rent roll)
3. **Commercial Financial Calculator suite** (cap rate, NOI, cash-on-cash, ICR/DSCR, GST, depreciation, outgoings recovery)
4. **DCF Engine** (10-year hold, terminal cap, IRR, NPV, equity multiple)
5. **Commercial Investment Report** (CRE-specific template + PDF)
6. **Borrowing Capacity extension** — ICR/DSCR pathway alongside resi DTI/serviceability
7. **Dashboard cards** — commercial portfolio KPIs (WALE, occupancy, weighted cap rate)

---

## 1. Data Model (new tables)

```text
commercial_properties
  ├─ asset_class (office | retail | industrial | mixed_use | medical | childcare | hospitality)
  ├─ tenure (freehold | leasehold)
  ├─ zoning, GFA, NLA, site_area, parking_bays, year_built
  ├─ purchase_price, acquisition_date, gst_treatment (going_concern | margin | standard)
  ├─ valuation, valuation_date, valuer
  └─ outgoings_recoverable (jsonb: council, water, land_tax, insurance, mgmt, R&M)

commercial_leases (rent roll — one row per tenancy)
  ├─ property_id, tenant_name, suite/unit, NLA_sqm
  ├─ lease_start, lease_end, option_terms (jsonb)
  ├─ base_rent_pa, rent_basis (gross | net | semi_gross)
  ├─ review_type (CPI | fixed % | market | hybrid), review_freq, next_review_date
  ├─ incentives (rent_free_months, fitout_contribution, cash_incentive)
  ├─ outgoings_recovery_pct, security (bond | bank_guarantee), guarantee_amount
  └─ status (occupied | vacant | holdover | under_offer)

commercial_dcf_runs
  ├─ property_id, scenario_name (base | upside | downside)
  ├─ hold_period_years, discount_rate, terminal_cap_rate
  ├─ rental_growth_assumptions (jsonb per year)
  ├─ vacancy_allowance_pct, capex_schedule (jsonb)
  └─ outputs: noi_by_year, cashflows, irr, npv, equity_multiple, peak_equity
```

Existing `properties` table left alone. New module is namespaced.

## 2. Math Engine (`src/utils/commercial/`)

- `noiCalculator.ts` — gross income → vacancy → outgoings → NOI
- `capRateCalculator.ts` — passing yield, equivalent yield, reversionary yield
- `dcfEngine.ts` — full DCF with terminal value, IRR (Newton-Raphson), NPV, equity multiple
- `waleCalculator.ts` — weighted average lease expiry (by income & area)
- `icrDscrCalculator.ts` — Interest Coverage Ratio + Debt Service Coverage Ratio
- `gstCommercial.ts` — going concern vs margin scheme stamp duty/GST impact
- `outgoingsRecovery.ts` — recoverable vs non-recoverable split

All multipliers exact (per Financial Math Standards memory). Rates rounded to 2 dp.

## 3. Borrowing Capacity Extension

Add a `loanType: 'resi' | 'commercial'` switch in the BC engine:

- **Commercial path** uses **ICR (typically ≥1.5x)** and **DSCR (≥1.25–1.35x)** instead of DTI.
- Net rental income from rent roll → debt-serviceable amount at lender's assessment rate.
- Reuses existing lender shading profiles but with CRE-specific LVR caps (max ~65–70%) and rate margins.
- New lender policy fields: `commercial_max_lvr`, `min_icr`, `min_dscr`, `assessment_rate_margin_cre`.

## 4. UI Surface

- **New route** `/commercial` with sub-pages:
  - `/commercial/properties` — list + add
  - `/commercial/properties/:id` — overview, rent roll, financials, DCF, reports
  - `/commercial/calculators` — standalone calc suite (NOI, Cap Rate, DCF, ICR/DSCR, GST)
- **Sidebar** — new "Commercial" section, kept distinct from "Residential" for clarity.
- **Dashboard** — new "Commercial Portfolio" widget card alongside existing resi KPIs.
- Reuses `OverrideFieldGroup`, `OverrideInput`, modal layout, dark-gold theme.

## 5. Commercial Investment Report

New schema variant (parallel to `INVESTMENT_REPORT_SCHEMA`):

```text
1. Executive Summary (deal snapshot, WALE, passing yield)
2. Asset Overview (class, zoning, GFA/NLA, services)
3. Tenancy Schedule (full rent roll table)
4. Income Analysis (gross → net, recoveries, vacancy)
5. Valuation & Yield (passing, equivalent, reversionary, market comps)
6. DCF & Returns (10-year cashflow, IRR, NPV, sensitivity matrix)
7. Debt Structure (ICR/DSCR, lender comparison)
8. Risk Assessment (tenant concentration, lease expiry profile, market)
9. Recommendation & Exit Strategy
10. Disclaimer
```

PDF generator extends existing jsPDF primitives.

## 6. Rollout Order (suggested execution sequence)

```text
Step 1  Migrations: commercial_properties, commercial_leases, commercial_dcf_runs (+ RLS)
Step 2  Math utils (NOI, cap rate, DCF, ICR/DSCR, WALE, GST) + unit tests
Step 3  Commercial properties CRUD UI + rent-roll editor
Step 4  Standalone CRE calculators page
Step 5  BC engine commercial path + lender policy fields
Step 6  Commercial report schema + generation edge function
Step 7  Dashboard commercial KPI widget
Step 8  QA pass on PDF (per memory: image-QA every page)
```

Industrial-specific fields (clearance height, hardstand, power supply, truck access) plug in as an asset-class sub-form in Step 3 — no separate module needed.

---

## What I need from you to start building

Confirm and I'll kick off **Step 1 (migrations) + Step 2 (math utils with tests)** in the next turn. Or if you want to sequence differently (e.g., calculators first, then properties), say the word.
