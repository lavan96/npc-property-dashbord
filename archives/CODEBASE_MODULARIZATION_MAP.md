# NPC Command Centre — Codebase Modularization Map

> **Purpose:** single source of truth for how the code base is organised into
> modules (frontend → backend → data). Use this document as the reference when
> deciding *where* new code goes, when refactoring, and when reasoning about
> ownership boundaries.
>
> **Scope at time of writing:**
> - `src/`: **1,559** TypeScript / TSX files
> - `supabase/functions/`: **295** edge functions (+ `_shared/` runtime library)
> - `supabase/migrations/`: **515** SQL migrations
> - React routes (`src/App.tsx`): **126** `path=` declarations across 3 shells
>   (internal dashboard, Client Portal, Finance Partner Portal)
>
> **Location:** stored under `/archives/` (out of the historical `docs/` tree)
> so it is decoupled from per-phase audit notes. This file is the top-level
> index; anything more detailed should be a sibling under `archives/`.

---

## 0. Reading guide

Every module below follows the same shape:

| Field | Meaning |
| --- | --- |
| **Purpose** | one-line description of the responsibility. |
| **Frontend** | pages, components, hooks, contexts that own the UI. |
| **Domain logic** | pure TS in `src/lib/**` or `src/utils/**` (no React, no network). |
| **Data access** | Supabase tables, edge functions, and secure invokers used. |
| **Boundaries** | what this module MUST NOT reach into. |
| **Extension points** | where to add new features without breaking layering. |

The layering rule that governs the whole repo is:

```
pages ──► feature components ──► hooks / contexts ──► lib/utils (pure) ──► integrations/supabase ──► edge functions ──► DB
```

- UI never talks to Supabase directly for *write* paths — it goes through
  `invokeSecureFunction` (`src/lib/secureInvoke.ts`) into an edge function,
  which is the only tier allowed to touch `service_role` (see
  `mem://architecture/secure-data-mediation-and-rls-standard`).
- Pure domain logic (calculators, engines, formatters) lives under
  `src/lib/**` or `src/utils/**` and MUST be import-safe from any tier
  (no `window`, no `supabase` client, no React hooks).
- Edge functions share code through `supabase/functions/_shared/**` — never
  by relative imports across function directories.

---

## 1. Top-level directory contract

```
src/
├── App.tsx                 # Route registry (3 shells: dashboard, client portal, finance portal)
├── main.tsx                # Bootstrapping, providers
├── index.css / App.css     # Global tokens + resets (semantic Tailwind layer)
├── assets/                 # Static imports (SVG/PNG/etc.)
├── branding/               # White-label token engine (see §7)
├── components/             # Feature + primitive UI (see §3)
│   ├── ui/                 # shadcn primitives — presentation only
│   ├── layout/             # Dashboard/portal shells, headers, sidebars
│   ├── common/             # ErrorBoundary, ConfirmDialog, etc.
│   ├── shared/             # Cross-feature composites (address, selects…)
│   └── <feature>/          # One folder per business domain (see §3)
├── config/                 # Static registries (module visuals, feature flags)
├── contexts/               # React context providers (see §4)
├── hooks/                  # Reusable hooks; one file per hook (see §5)
├── integrations/supabase/  # Generated client + types.ts (DO NOT edit types.ts)
├── lib/                    # Framework-agnostic libraries (see §6)
├── pages/                  # Route-level containers; thin orchestrators
├── services/               # Long-lived, class/stateful client services
├── stores/                 # Zustand stores (currently: templateEditorStore)
├── styles/                 # Tailwind layer files + finance/portal overrides
├── test/                   # Vitest setup
├── theme/                  # Themed visual maps (light/dark variants)
├── types/                  # Cross-cutting TS types (airtable, marketUpdates…)
└── utils/                  # Pure calculators + adapters (see §6)

supabase/
├── config.toml             # THE ONLY config.toml — one per repo
├── functions/
│   ├── _shared/            # Cross-function library (auth, ghl, agent tools…)
│   └── <function-name>/    # One folder per deployed function (see §8)
└── migrations/             # 515 timestamped SQL files (never hand-copy)

archives/                   # This document + future architecture archives
docs/                       # Historical phase notes (do not put architecture here)
render-source/              # Isolated headless renderer service (Node)
pdf-parse-service/          # Python Docling worker (container)
weasyprint-service/         # Python WeasyPrint worker (container)
```

**Rule:** if a folder is not in this table, it is *not* an approved top-level
location. Add new siblings only after they are documented here.

---

## 2. Application shells (routing tier)

`src/App.tsx` mounts three parallel shells. Each shell owns its own
authentication surface, protected-route wrapper, and layout chrome — they
share primitives (`src/components/ui`) but nothing else.

### 2.1 Internal Dashboard shell (`/*`, requires staff auth)
- Layout: `src/components/layout/DashboardLayout.tsx`
- Auth gate: `src/hooks/useAuth.tsx` + `src/pages/Auth.tsx` (+ `AcceptInvite.tsx`)
- Route pages: everything directly under `src/pages/*.tsx` (see §3 for domain map)
- Sub-shells under `src/pages/admin/`, `src/pages/agent/`,
  `src/pages/calculators/`, `src/pages/commercial/`, `src/pages/industrial/`,
  `src/pages/qa/`

### 2.2 Client Portal shell (`/client/*`)
- Layout: `src/components/portal/PortalLayout.tsx`
- Guard: `src/components/portal/PortalProtectedRoute.tsx`
- Auth hook: `src/hooks/useClientPortalAuth.tsx`
- Pages: `src/pages/portal/*.tsx`
- Follows `mem://architecture/client-portal-security-and-auth-pattern`

### 2.3 Finance Partner Portal shell (`/finance/*`)
- Layout: `src/components/finance-portal/FinancePortalLayout.tsx`
- Guard: `src/components/finance-portal/FinancePortalProtectedRoute.tsx`
- Auth: `src/hooks/useFinancePortalAuth.tsx`
- Pages: `src/pages/finance-portal/*.tsx`
- Follows the 15+ Finance Portal memories in `mem://features/finance-portal/*`

**Boundary:** a page in one shell MUST NOT import a page or layout from
another shell. They may share primitives from `src/components/ui`,
`src/components/common`, `src/components/shared`, and pure libraries.

---

## 3. Feature module catalogue (frontend)

Every business domain owns one folder under `src/components/<feature>/` and
(usually) a corresponding page or sub-directory under `src/pages/`.
Cross-feature use goes through `src/components/shared/` or a hook.

| Module | Components | Pages | Primary hooks | Domain lib | Edge fns |
| --- | --- | --- | --- | --- | --- |
| **Agent (Aurixa AI)** | `components/agent/` (AgentChatWidget, AurixaMark, MemoryCitations…) | `pages/agent/*` (Insights, Plans, Skills, MemoryManager) | `useAgentSession`, `useMemoryRecall` | `lib/agentUpgradeRecommendations.ts` | `agent-*`, `ai-dashboard-agent`, `bc-scenario-agent`, `commercial-bc-scenario-agent` |
| **Reports (Investment/Compass/QA)** | `components/reports/` (+ `library/`, `report-view/`, `manual-inputs/`, `shared/`, `progress/`) | `Reports.tsx`, `ReportsAnalytics.tsx`, `ReportViewer.tsx`, `InvestmentReportView.tsx`, `GeneratedReports.tsx`, `ReportRequests.tsx`, `ReportQA.tsx` | `useInvestmentReports`, `useReportPreferences`, `useCoverPageOverlays` | `lib/reports/*` (compass registry, split registry), `lib/reportTemplate/*` | `generate-investment-report`, `compare-investment-reports`, `condense-investment-report`, `fork-investment-report`, `render-investment-report-pdf`, `regenerate-report-qualitative`, `hero-image-studio`, `report-*` |
| **Template Builder** | `components/templateBuilder/` (~60 editor primitives) | `pages/admin/TemplateBuilder.tsx`, `TemplateBuilderEdit.tsx`, `pages/Templates.tsx`, `TemplateSharePreview.tsx` | `hooks/templateBuilder/*` (autosave, history, mutators, keyboard, weasy preview) | `lib/reportTemplate/*` | `template-*`, `render-template-pdf`, `template-import-*`, `template-design-agent`, `parse-template-document` |
| **Borrowing Capacity** | `components/borrowing-capacity/` (+ `scenarios/`, `sections/`) | `pages/GamePlan.tsx`, `pages/admin/BcSegmentEngineAdmin.tsx` | `useBorrowingCapacity`, `useBcScenarios` | `utils/borrowingCapacity*`, `utils/policyEngine.ts`, `utils/lenderLvrCaps.ts`, `utils/lenderShadingProfiles.ts`, `utils/householdFinance.ts` | `calculate-borrowing-capacity`, `manage-bc-scenarios`, `bc-scenario-agent` |
| **Commercial** | `components/commercial/` (+ `calculators/`) | `pages/commercial/*`, `pages/CashFlowAnalysis.tsx` | `useCommercialProperties` | `utils/commercial/*` (60+ engines: NOI, cap-rate, ICR/DSCR, GST, DCF, 10-year CF, scenarios, AI estimates) | `manage-commercial-data`, `estimate-commercial-noi`, `estimate-commercial-caprate`, `commercial-bc-scenario-agent` |
| **Industrial** | `components/industrial/` (+ `calculators/`) | `pages/industrial/*` | `useIndustrialProperties` | `utils/industrial/*` (NOI, DCF, WALE, rent/sqm, site metrics, yields) | `manage-industrial-data` |
| **Clients / CRM** | `components/clients/` | `ClientManagement.tsx`, `ClientTracker.tsx` | `useClients`, `useClientPortfolio`, `useFinanceContacts` | `utils/excelClientParser.ts` | `manage-client-data`, `get-client-data`, `manage-portal-client-data`, `import-clients-from-ghl`, `sync-client-to-ghl` |
| **Deals** | `components/deals/` | `DealPipeline.tsx` | `useAllDeals` | — | `sync-ghl-pipelines`, `update-ghl-opportunity-stage`, `diagnose-ghl-attribution` |
| **Cash Flow** | `components/cash-flow/` | `CashFlowAnalysis.tsx` | (feature-scoped) | `utils/commercial/tenYear*Engine.ts` | `compare-cash-flow-reports`, `financial-calculator-service`, `financial-validation-service` |
| **Calendar** | `components/calendar/` | `Calendar.tsx` | `useCalendarKeyboard`, `useAppointmentNotifications` | `lib/bookingTimezone.ts`, `lib/sydneyTime.ts`, `lib/timezoneUtils.ts` | `ghl-calendar*`, `outlook-calendar`, `portal-book-appointment`, `send-appointment-notification` |
| **Conversations / Messaging** | `components/conversations/`, `components/email/` | `Conversations.tsx`, `Messages.tsx`, `EmailCopilot.tsx` | `useEmailNotifications` | — | `sync-ghl-conversations`, `conversation-sync-cron`, `email-copilot*`, `email-sync-cron`, `outlook-email-*`, `send-ghl-message`, `staff-client-portal-messages`, `message-governance` |
| **Call logs** | `components/call-logs/` | `CallLogs.tsx` | `useCallNotifications`, `useCallAlertNotifications` | — | `get-call-logs`, `manage-call-logs`, `manage-call-settings`, `cleanup-call-log-names`, `cleanup-stale-calls`, `vapi-call-webhook`, `send-call-alert-email`, `send-weekly-call-report` |
| **Automation** | `components/automation/` | `Automation.tsx` | — | — | `manage-automation-settings`, `process-scheduled-emails`, `dispatch-marketing-reports` |
| **Reminders / Checklists** | `components/reminders/`, `components/checklists/` | `RemindersHub.tsx`, `Checklists.tsx` | `useAllReminders`, `useClientReminderNotifications`, `useChecklists`, `useCreateClientReminder` | `utils/checklistTemplateParser.ts` | — |
| **Agreements** | `components/agreements/` | `Agreements.tsx` | `useAgencyAgreements`, `useAgreementNotifications` | — | `manage-agency-agreements` |
| **Compliance** | `components/compliance/` | (embedded) | `useComplianceRecords` | — | `manage-compliance-records` |
| **Documents** | `components/documents/` | (embedded), portal | — | `lib/documentUpload.ts` | `manage-generated-documents`, `portal-upload-file`, `secure-storage` |
| **Property listings + import** | `components/listings/`, `components/property/`, `components/property-import/` | `Listings.tsx`, `pages/commercial/CommercialPropertyDetail.tsx`, `pages/industrial/IndustrialProperties.tsx` | — | `utils/propertySourcing.ts`, `utils/localityGrowthEstimates.ts`, `lib/postcodeProximity.ts`, `lib/addressUtils.ts` | `scrape-property-listing`, `parse-property-pdf`, `parse-vownet-pdf`, `pdf-parse-*`, `reclassify-property`, `import-suburb-directory`, `import-schools-data`, `google-places-autocomplete` |
| **Market updates / QA** | `components/market-updates/`, `components/report-qa/` | `MarketUpdates.tsx`, `pages/qa/*`, `SharedQAAnswer.tsx` | `useMarketUpdates` | `services/marketUpdates/*` (adapters, seeds, classification, dedupe, normalise, relevance) | `market-updates-*`, `market-qa-*` |
| **Marketing analytics + lead magnets** | `components/marketing/` | `MarketingAnalytics.tsx` | — | — | `analyze-meta-ads*`, `fetch-meta-ads`, `manage-lead-magnets`, `request-lead-magnet`, `generate-market-intelligence-report`, `backfill-lead-attributions`, `enrich-lead-attributions` |
| **Integrations (GHL/Outlook/DocuSign)** | `components/integrations/`, `components/sync/` | `Integrations.tsx`, `CloudflareManagement.tsx`, `pages/admin/GhlMigration.tsx` | — | `lib/ghlExport.ts`, `lib/airtable.ts`, `lib/finance-portal/*` | `ghl-*` (~30 fns), `outlook-*`, `airtable-proxy`, `cloudflare-proxy`, `manychat-proxy`, `sync-ghl-*` |
| **Notifications (Web Push + in-app)** | `components/PushNotificationPrompt.tsx`, `components/Phase1NotificationListeners.tsx`, `components/CallNotificationListener.tsx` | (global) | Many `use*Notifications` hooks | `lib/pushNotifications.ts`, `lib/clientPortalPushNotifications.ts` | `push-subscribe`, `push-unsubscribe`, `send-web-push`, `get-vapid-public-key` |
| **Billing / Mission Control** | `components/billing/`, `components/api-usage/` | `ApiUsage.tsx`, `TokenAuditLog.tsx`, `TokenUsageHistory.tsx` | — | `lib/missionControl.ts`, `lib/missionControlCatalog.ts`, `lib/tokenEvents.ts`, `lib/generateWithTokens.ts` | `mission-control-*`, `list-token-audit`, `list-token-usage`, `get-token-event-trail` |
| **Admin** | `components/admin/` | `pages/admin/*` (~20 pages) | — | — | `admin-*`, `feature-flags-admin`, `user-guide-assistant` |
| **White label / Branding** | `components/branding/`, `branding/*` | `WhiteLabel.tsx` | `useBrand`, `useTokens`, `useBrandKits` | `branding/*` (see §7) | — |
| **Settings / User guide** | `components/settings/`, `components/user-guide/` | `Settings.tsx`, `UserGuide.tsx` | — | `lib/userGuideKnowledge.ts` | `admin-user-management`, `admin-password-reset`, `update-integration-secret`, `check-integration-secrets`, `user-guide-assistant` |
| **Overview / Charts** | `components/overview/`, `components/charts/` | `Overview.tsx`, `Charts.tsx` | `useAnalyticsView` | `services/chartDataService.ts`, `services/propertyDataService.ts` | `analytics-query`, `generate-chart-analysis`, `generate-chart-images`, `generate-charts-python` |
| **Finance Portal (partner-facing)** | `components/finance-portal/` (~60 components) | `pages/finance-portal/*` | `useFinancePortal*` hooks | `lib/finance-portal/*`, `lib/financeNaturalDate.ts` | `finance-portal-*` (~40 fns), `client-portal-finance-hub`, `finance-email-track-pixel` |
| **Client Portal** | `components/portal/` | `pages/portal/*` | `useClientPortal*` | — | `client-portal-*` |

---

## 4. Contexts (`src/contexts/`)

| Context | Scope | Consumers |
| --- | --- | --- |
| `WhiteLabelContext` | Global — brand tokens per tenant | All shells (via `useBrand`) |
| `NotificationsContext` | Dashboard-only — in-app notifications feed | Dashboard header, listeners |
| `PortalNotificationContext` | Client Portal only | `PortalLayout`, `PortalNotificationBell` |
| `SearchContext` | Dashboard-only — global command palette state | Header search, feature pages |
| `ComparisonContext` | Reports feature — property comparison basket | `ComparisonBasket`, comparison flows |
| `CalculatorPrefillContext` | Calculators feature — prefills between calc tabs | Borrowing/Commercial/Industrial calculators |

**Rule:** contexts are only for cross-tree UI state. Persistent state goes in
Supabase; ephemeral local state stays in components; heavy client state uses
Zustand (`src/stores/`).

---

## 5. Hooks (`src/hooks/`)

93 hook files. Categorised:

- **Auth & session** — `useAuth`, `useAuthenticatedSupabase`,
  `useClientPortalAuth`, `useFinancePortalAuth`.
- **Data fetchers** — one hook per resource, always suffixed with the domain
  noun (`useAllDeals`, `useCommercialProperties`, `useClientPortfolio`,
  `useBorrowingCapacity`, `useBcScenarios`, `useCommissionLedger`,
  `useComplianceRecords`, `useBrandKits`, `useMarketUpdates`, …). All wrap
  `invokeSecureFunction` and expose `{ data, loading, error, refetch }`.
- **Notification listeners** — `use*Notifications` (call, email, appointment,
  deal date, client reminder, agreement…). These MUST be mounted once per
  shell, not per page.
- **UX / device** — `use-mobile`, `use-breakpoint`, `use-toast`,
  `useDebounce`, `useCountUp`, `useDashboardTheme`, `useCalendarKeyboard`.
- **Template Builder** — `hooks/templateBuilder/*` isolates editor state.
- **Activity logging** — `useActivityLogger`.

**Rule:** hooks return primitives, not React nodes. If it renders JSX it's a
component, not a hook.

---

## 6. Libraries & utils (`src/lib/` and `src/utils/`)

Two flat namespaces, distinguished by intent:

- **`src/lib/`** — infrastructure and integration helpers (clients, adapters,
  format/parse, IO). Examples: `secureInvoke.ts`, `pushNotifications.ts`,
  `documentUpload.ts`, `ghlExport.ts`, `airtable.ts`, `missionControl.ts`,
  `preflightTokens.ts`, `streamSecureFunction.ts`, `pdf/downloadPdf.ts`,
  `pdf/flattenPdf.ts`, `mcp/*`, `reports/*`, `finance-portal/*`,
  `reportTemplate/*` (the report/template engine — see §6.1).
- **`src/utils/`** — pure calculators and domain algorithms. Examples:
  `commercial/*` (60+ engines), `industrial/*`, `borrowingCapacity*`,
  `policyEngine.ts`, `lenderLvrCaps.ts`, `lenderShadingProfiles.ts`,
  `householdFinance.ts`, `stampDutyCalculator.ts`, `landTaxCalculator.ts`,
  `depreciationCalculator.ts`, `cgtCalculations.ts` (via `lib`),
  `mortgageCalculations.ts`, `capitalAllocationLedger.ts`, `dtiDenominator.ts`,
  `negativeGearingAddBack.ts`, `nameFormatting.ts`, `passwordValidation.ts`,
  `dataValidation.ts`, `vownetParser.ts`, `pdfToImages.ts`.

**Rule of thumb:** if the file imports `@/integrations/supabase/client` it
belongs in `lib/`; if it only takes plain values in and returns plain values
out, it belongs in `utils/`.

### 6.1 Report Template engine (`src/lib/reportTemplate/`)
Sub-namespaces:
- `adapters/` — per-report-type routing + binding context adapters.
- `blocks/`, `rendering/`, `pdfImport/`, `ingestion/` — layout, renderer, and
  input pipelines (PDF/image/URL/code/figma — see
  `mem://architecture/pdf-import-pipeline` family).
- Root files handle bindings, exporters (`htmlExporter`, `pptxExporter`,
  `docxExporter`), fidelity metrics, snippet library, starter templates, and
  the WeasyPrint bridge (`weasyPreview.ts`, `weasyRenderClient.ts`).

### 6.2 Commercial engine (`src/utils/commercial/`)
`index.ts` is the ONLY approved import surface for downstream consumers — it
re-exports legacy calculators and the new engines while preventing name
collisions (see the existing aliasing pattern with `Borrowing*` prefixes).
Never `import` a specific sibling file from outside the folder; add or extend
`index.ts` instead.

### 6.3 Branding engine (`src/branding/`)
Self-contained tenant theming: `brand-defaults.ts`, `brand-assets.ts`,
`brand-fonts.ts`, `brand-types.ts`, `brandPalette.ts`, `color-utils.ts`,
`accessibility.ts`, `token-resolver.ts`, `useBrand.ts`, `useTokens.ts`,
`brand-draft-storage.ts`. Consumers must go through `useBrand()` /
`useTokens()` — never import a raw token file.

---

## 7. Services (`src/services/`) and Stores (`src/stores/`)

- **`services/`** — long-lived client helpers with internal state (currently:
  `chartDataService.ts`, `propertyDataService.ts`, `marketUpdatesService.ts`,
  `marketUpdates/*`). Add here only when a plain function would need to cache,
  batch, or hold a connection.
- **`stores/`** — Zustand stores. Today only `templateEditorStore.ts`. Add new
  stores here (never scatter Zustand across features).

---

## 8. Backend: edge functions (`supabase/functions/`)

295 functions, all deployed automatically. Grouped by prefix:

| Prefix | Purpose | Count (~) |
| --- | --- | --- |
| `agent-*`, `ai-dashboard-agent`, `*-scenario-agent` | Aurixa agent runners, planners, skills | 6 |
| `admin-*`, `feature-flags-admin`, `user-guide-assistant` | Superadmin operations | 4 |
| `analytics-query`, `analyze-meta-ads*`, `fetch-meta-ads` | Analytics + ad platform ingest | 7 |
| `backfill-*`, `email-body-backfill`, `ghl-legacy-backfill-gaps` | One-shot migration workers | 8 |
| `bc-*`, `calculate-borrowing-capacity`, `manage-bc-scenarios`, `commercial-bc-*` | Borrowing capacity | 4 |
| `client-portal-*` | Client Portal API surface (auth + data) | ~12 |
| `finance-portal-*`, `finance-email-track-pixel` | Finance Partner Portal API surface (auth, PF ops, comms, AI copilot, calculators, batches 6–13) | ~42 |
| `custom-auth-*`, `push-*`, `get-vapid-public-key` | Custom auth + Web Push | 5 |
| `ghl-*`, `sync-ghl-*`, `import-clients-from-ghl`, `sync-client-to-ghl`, `update-ghl-opportunity-stage`, `diagnose-ghl-attribution`, `ghl-webhook-receiver` | GHL integration + dual-account migration (Phases 0–5) | ~30 |
| `outlook-*` | Outlook email & calendar | 4 |
| `mission-control-*` | External billing / seats / devices / key rotation | 8 |
| `market-updates-*`, `market-qa-*` | Market intelligence + Market QA | ~10 |
| `manage-*`, `get-*`, `list-*` | Data mediation edge fns (per-domain CRUD via `ALLOWED_TABLES` whitelist) | ~40 |
| `generate-*`, `render-*`, `compare-*`, `condense-*`, `fork-*`, `regenerate-*`, `hero-image-studio` | Report generation pipeline | ~20 |
| `template-*`, `parse-template-document`, `render-template-pdf`, `figma-template-sync` | Template Builder services | ~10 |
| `pdf-parse-*`, `parse-property-pdf`, `parse-vownet-pdf`, `pdf-import-*` | PDF ingestion (calls out to `pdf-parse-service` container) | ~8 |
| `commission-*`, `manage-commission-ledger`, `generate-commission-payout` | Commissions | 3 |
| `cotality-service`, `abs-*-service`, `cdr-lending-rates-service`, `climate-data-service`, `crime-statistics-service`, `domain-data-service`, `location-intelligence-service`, `public-transport-service`, `rba-data-service`, `risk-assessment-service`, `school-data-service`, `sqm-rent-service` | External data spines (Cotality-ready) | ~15 |
| `migration-*` | Template/data import migration orchestrator | 5 |
| Utility | `voice-to-text`, `clean-note-transcript`, `send-*`, `google-places-autocomplete`, `cloudflare-proxy`, `airtable-proxy`, `manychat-proxy`, `render-source`, `secure-storage`, `mcp` | remainder |

### 8.1 `_shared/` runtime library
Reusable modules imported by many functions. Highlights:
- `auth.ts`, `jwt.ts`, `finance-portal-session.ts` — session verification.
- `finance-portal-notify.ts`, `client-portal-notify.ts` — notification
  routing with quiet-hours + prefs (see
  `mem://features/finance-portal/chunk-10-notification-prefs-wiring`).
- `finance-portal-audit.ts` — hash-chained audit events.
- `ghl-account.ts`, `ghl-rate-limiter.ts`, `ghl-asset-harvester.ts`,
  `ghl-worker-fetch.ts` — dual-account GHL resolver
  (see `mem://integrations/ghl-dual-account-resolver`).
- `agent-loop.ts`, `agent-tools-registry.ts`, `agent-tools.ts`,
  `anthropicAdapter.ts` — Aurixa agent runtime.
- `investmentScoreEngine.ts`, `compassSectionRegistry.ts`,
  `compassPostProcessor.ts`, `compassQAValidator.ts` — report scoring &
  composite Compass logic (see `mem://features/reports/*`).
- `calculators.ts`, `capitalAllocationLedger.ts`, `dtiDenominator.ts`,
  `incomeComponentMapping.ts`, `lenderLvrCaps.ts` — mirror pure calculators
  so edge functions do not import from `src/` (they can't).
- `client-data-provenance.ts`, `client-sync.ts` — client data pipeline.
- `docusign-*`, `iconPack.ts`, `figmaCompiler.ts`, `designBrief.ts`,
  `colorScience.ts` — integration + design helpers.

**Rule:** if two functions want to share code, put it in `_shared/`. Never
`import` across function directories with relative paths.

---

## 9. Backend: database & migrations

- `supabase/migrations/` — 515 timestamped SQL files. **Never** create, edit,
  copy, or rename these with the file-editing tools; the migration tool
  writes them. Every `CREATE TABLE public.<name>` must be followed by
  `GRANT` statements in the SAME migration (see project instructions).
- `supabase/config.toml` — the ONLY config.toml in the repo.
- Realtime: any new realtime-consumed table must be added to the
  `supabase_realtime` publication (see
  `mem://architecture/realtime-table-publication-standard`).
- Notifications: new DB trigger types must be added to the
  `notifications_type_check` check constraint.

---

## 10. External services (out-of-repo containers)

| Folder | Purpose | Called from |
| --- | --- | --- |
| `render-source/` | Node headless renderer for code/URL ingestion (Tiers C1–C4) | `render-source` edge fn |
| `pdf-parse-service/` | Python Docling PDF parser | `pdf-parse-*` edge fns |
| `weasyprint-service/` | Python WeasyPrint HTML→PDF | `render-template-pdf`, `render-investment-report-pdf` |

These are versioned in-repo but deployed separately (their own Dockerfiles).
They MUST NOT import from `src/` or `supabase/`.

---

## 11. Cross-cutting concerns

### 11.1 Secure data access
1. UI calls `invokeSecureFunction(fnName, payload)` (see `lib/secureInvoke.ts`).
2. Edge function verifies the caller (via `_shared/auth.ts` / portal session
   helpers) and uses `SUPABASE_SERVICE_ROLE_KEY` internally.
3. Every table touched must be listed in that function's `ALLOWED_TABLES`
   whitelist (see `mem://architecture/edge-function-whitelist-governance`).

### 11.2 Auth surfaces
- Internal staff: `useAuth()` + Supabase Auth.
- Client portal: `useClientPortalAuth()` + `x-portal-session-token`.
- Finance portal: `useFinancePortalAuth()` + `x-finance-session-token`.
- Never call `supabase.auth.getUser()` in edge fns — use `effectiveUserId`
  from `_shared/auth.ts`.

### 11.3 Theming
- One dark-gold semantic token set in `src/index.css`.
- Never hardcode `text-white`, `bg-black`, or hex literals in components.
- Theme cycling via `useDashboardTheme()`; finance/portal themes live in
  `src/styles/finance-portal.css` and `src/lib/finance-portal/theme.ts`.

### 11.4 Notifications
- In-app: `NotificationsContext` + `Phase1NotificationListeners.tsx`.
- Client portal: `PortalNotificationContext` + `ClientPortalPushPrompt`.
- Web Push: `lib/pushNotifications.ts` (staff) and
  `lib/clientPortalPushNotifications.ts` (clients); dispatched via
  `send-web-push` edge fn using VAPID keys.

### 11.5 Billing (Mission Control)
Every metered generator must call reserve → generate → commit/cancel via
`lib/generateWithTokens.ts`. See
`mem://integrations/mission-control-token-integration`.

---

## 12. Modularization action items (prioritised)

The following are the concrete refactors that will pay down the largest
modularization debt without changing behaviour. Each is safe to do
incrementally in a follow-up PR.

1. **Consolidate report-related pages.** Move `Reports.tsx`,
   `ReportsAnalytics.tsx`, `ReportViewer.tsx`, `ReportRequests.tsx`,
   `InvestmentReportView.tsx`, `GeneratedReports.tsx`, `ReportQA.tsx`,
   `PortfolioReports.tsx` into `src/pages/reports/` (mirrors
   `pages/agent/`, `pages/finance-portal/`).
2. **Introduce `src/pages/settings/`** for `Settings.tsx`, `WhiteLabel.tsx`,
   `Integrations.tsx`, `PortalConfig.tsx`, `TokenAuditLog.tsx`,
   `TokenUsageHistory.tsx`, `ApiUsage.tsx`, `ErrorLogs.tsx`,
   `ActivityLogs.tsx`, `Monitoring.tsx`, `Sources.tsx`.
3. **Split `src/utils/commercial/`** (currently 60+ files) into sub-folders:
   `engines/`, `scenarios/`, `ai-estimates/`, `reports/`, `state/`, keeping
   `index.ts` as the sole external surface.
4. **Rename `supabase/functions/finance-portal-batch{6,7,8,9-10}`** into
   feature-named functions (`finance-portal-onboarding`,
   `finance-portal-compliance`, `finance-portal-calculators`,
   `finance-portal-mobile-collab`) so intent is discoverable without reading
   the memory files.
5. **Extract Zustand stores** for global UI state currently held in contexts
   that don't need React re-render granularity (e.g. `SearchContext` →
   `useSearchStore`).
6. **Freeze `src/lib/` root**: move stray files with feature-specific scope
   into feature folders (`ghlExport.ts` → `lib/ghl/`, `airtable.ts` →
   `lib/airtable/`, `bookingTimezone.ts`/`sydneyTime.ts`/`timezoneUtils.ts`
   → `lib/time/`).
7. **Retire `pages/finance-portal/FinancePortalChangePassword.tsx`** style
   monoliths in favour of shared `AuthShell` primitive already used by
   `PortalAuth` and `Auth`.
8. **`docs/` cleanup:** move architecture-relevant markdown into `archives/`;
   keep only per-phase implementation notes under `docs/`.
9. **Add per-module README.md** under each `src/components/<feature>/` and
   `supabase/functions/<name>/` describing the boundary this file codifies —
   generated from this map.
10. **Introduce ESLint boundaries plugin** to enforce §1's layering rule
    (prevent `src/utils/**` from importing `@/integrations/supabase/client`,
    prevent cross-shell page imports, prevent cross-function relative
    imports).

---

## 13. Where to put new work

| I want to add… | Put it here |
| --- | --- |
| A new dashboard page | `src/pages/<Name>.tsx` and register in `src/App.tsx`; components under `src/components/<feature>/` |
| A new portal page (client) | `src/pages/portal/Portal<Name>.tsx` + `src/components/portal/*` |
| A new finance-portal page | `src/pages/finance-portal/FinancePortal<Name>.tsx` + `src/components/finance-portal/*` |
| A pure calculator | `src/utils/<domain>/<name>.ts` with a Vitest under `__tests__/` |
| A supabase-touching helper | `src/lib/<domain>/<name>.ts` (never in `utils/`) |
| A cross-feature UI primitive | `src/components/ui/<name>.tsx` (shadcn shape) or `src/components/shared/` |
| An edge function | `supabase/functions/<kebab-name>/index.ts` + shared code in `_shared/` |
| A DB change | via the migration tool ONLY; add matching `GRANT` in the same migration |
| A new Aurixa skill | `supabase/functions/agent-skill-marketplace` + `_shared/agent-tools-registry.ts` |
| A new report type | Register adapter under `src/lib/reportTemplate/adapters/` and generation edge fn under `supabase/functions/` |
| A theme/token | `src/index.css` (semantic layer) — never hardcode in a component |

---

*Maintained by the platform team. Update this file whenever a new top-level
folder is introduced, a new shell is added, or a module boundary changes.*
