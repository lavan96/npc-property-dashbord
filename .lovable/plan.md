# Template Builder → Production Pipeline: Foundation Lockdown

Goal: make `report_templates` the **single source of truth** for every PDF the system produces, so what designers build in the editor is exactly what clients receive — across composite, FIN, PLDD, and per-report-type variants.

This plan addresses Gaps **#1–#4** from the architecture audit. Items #5–#9 are deferred until the foundation is stable.

---

## 1. Schema: make templates variant- and scope-aware

Migration on `public.report_templates`:

- Add `variant text` — one of `composite | financial | due_diligence | null`. `null` = applies to any variant of this `report_type`.
- Add `scope text` — one of `global | agency | user`, default `global`. Enables per-agency / per-user overrides later without another migration.
- Add `priority int default 0` — tiebreaker when multiple templates match.
- Add `agency_id uuid null`, `owner_user_id uuid null` — populated when `scope != 'global'`.
- Backfill: every existing active row gets `variant = null`, `scope = 'global'`.
- Composite index on `(report_type, variant, scope, is_active, priority desc)` for the resolver hot path.

`tier` stays (legacy free-text label) but is no longer load-bearing for resolution.

## 2. Resolver: one function, every report path

New shared module `supabase/functions/_shared/resolveReportTemplate.ts` (and a thin frontend mirror at `src/lib/reportTemplate/resolveTemplate.ts`):

```text
resolveReportTemplate({ reportType, variant, agencyId, userId })
  → { template, engine, source } | null
```

Resolution order (first match wins):

1. `scope='user'` + `owner_user_id=userId` + variant match
2. `scope='agency'` + `agency_id=agencyId` + variant match
3. `scope='global'` + exact variant match
4. `scope='global'` + variant IS NULL (catch-all)

All filtered by `is_active=true`, ordered by `priority desc, updated_at desc`.

Every production generator calls this **before** falling through to legacy:

- `PixelPerfectPDFGenerator` entrypoint
- `render-investment-report-pdf` edge function
- `fork-investment-report` (FIN + PLDD derivations)
- `compassRoute.ts` (already wired — refactored to use the shared resolver)

If a template resolves → route through WeasyPrint. If not → legacy generator continues to run unchanged. Zero-risk rollout.

## 3. Unified renderer: WeasyPrint everywhere (preview + production)

The editor currently previews via **jsPDF** (`renderTemplateToBlob`). Production now uses **WeasyPrint**. They will drift.

Fix:

- New edge function call from the editor's preview path → `render-template-pdf` with `mode='preview'` (already supported).
- Replace `LiveHtmlPreview`'s jsPDF blob with a WeasyPrint PDF rendered server-side, displayed via `<iframe>` of the signed URL. Debounced (1.5s) to avoid render storms.
- jsPDF path retained ONLY as an offline fallback flag (`?engine=jspdf`) for debugging — not used in normal flow.
- Result: pixel parity between editor preview and the final client PDF.

## 4. Data contract: bindings resolve against real report content

Today bindings reach into `report.report_data` (JSONB), but actual narrative lives in `report_content` (markdown chunks keyed by section).

New shared adapter `supabase/functions/_shared/buildTemplateBindingContext.ts`:

```text
buildTemplateBindingContext(reportId) → {
  report:    { id, type, variant, address, generated_at, ... },
  property:  { ...flattened report_data.property },
  financials:{ ...flattened report_data.financials },
  scores:    { ...investment score breakdown },
  sections:  { [sectionKey]: { markdown, html } },   // from report_content
  brand:     { tokens, logo, ... },                  // from active BrandProvider
  tier:      'compass' | 'composite' | ...,          // for conditional blocks
  variant:   'composite' | 'financial' | 'due_diligence',
}
```

- `evalConditional` context extended to receive `tier`, `variant`, `pageNumber`, `pageCount`.
- `compassRoute.ts` updated to use this adapter — no more silent empty-string bindings.
- Binding validation surfaces unresolved paths in the editor's lint panel.

## 5. Editor UX: variant awareness

Small but high-leverage UI additions in `TemplateBuilderEdit.tsx`:

- Variant dropdown next to `report_type` (composite / financial / due_diligence / any).
- Scope dropdown (global / agency / user) — superadmin-only.
- "Test with sample report" picker — load a real report's binding context into the preview so the designer sees actual data, not just sample presets.
- Header chip showing **which generators will route through this template** (resolved live from variant + scope).

---

## Technical notes

- No legacy code is deleted in this pass. Both paths coexist until the resolver returns a template for a meaningful percentage of generations.
- `template_render_jobs` already records every WeasyPrint call → cutover progress is observable from day one.
- All grants on the new columns are inherited from the existing table (no new tables created).
- Frontend ↔ edge contract for `resolveReportTemplate` and `buildTemplateBindingContext` is duplicated (FE mirror + BE source). Marked `KEEP IN SYNC` like `reportSplitRegistry.ts`.

## Out of scope (next phase)

- Retiring `PixelPerfectPDFGenerator` (Gap #7)
- Brand token cascade into WeasyPrint (Gap #8) — easy follow-up once renderer is unified
- `htmlRenderer.ts` parity audit (Gap #9)
- Conditional-block authoring UI for tier/variant gates (Gap #6) — backend support lands here, UI follows

## Acceptance criteria

1. Creating a `report_type=investment_compass, variant=composite` active template causes a freshly generated composite compass report to render via WeasyPrint, with all narrative sections populated from `report_content`.
2. Removing/deactivating that template causes the same generation to fall back to the legacy renderer with no errors.
3. Editor preview and the downloaded production PDF are visually identical for the same template + sample report.
4. Forked FIN and PLDD reports each resolve to their own variant-scoped template when one exists.
