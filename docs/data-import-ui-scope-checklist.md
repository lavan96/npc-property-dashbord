# Data Import UI Scope Checklist

## Inspected before UI changes

- Route: `/data-import` is mounted through `ModuleGuard moduleKey="data_import"` in `src/App.tsx`.
- Dashboard token banner: `TokenBalanceBanner` is mounted by `DashboardLayout`; no banner behavior was changed.
- Header: Data Import title and subtitle are in `src/pages/DataImport.tsx`.
- Quick Import panel: external source card and `Import Australian Suburb Directory` action are in `src/pages/DataImport.tsx`.
- Upload CSV Data form: Data Type selector, optional State/Territory selector, CSV file input, Upload Data action and result alert are in `src/pages/DataImport.tsx`.
- CSV Format Requirements renderer: all existing data type notes and column strings are in `src/pages/DataImport.tsx`.
- Validation states: invalid file type, missing data type/file and missing state toasts were reviewed and left unchanged.
- Loading states: `uploading` and `importingSuburbs` states were reviewed and left unchanged.
- Success/error states: upload result alert, upload toasts, import toasts and notifications were reviewed and left unchanged.
- API/Supabase calls: `invokeSecureFunction('import-schools-data')`, `invokeSecureFunction('manage-data-import')` and `invokeSecureFunction('import-suburb-directory')` were reviewed and left unchanged.
- External source import logic, CSV parsing, cache mapping, authentication route guard and module permissions were reviewed and left unchanged.

## Touched files

- `src/pages/DataImport.tsx` — UI-only polish, containment and theme-token alignment for the Data Import tab.
- `docs/data-import-ui-scope-checklist.md` — local developer checklist for this safe-scope pass.

## Intentionally untouched modules

Overview, Listings, Commercial / Industrial, Calendar, Sources, Reports, Generated Reports, Cash Flow Analysis, Report Q&A, Portfolio Reports, Report Requests, Charts, Clients, Client Tracker, CRM Conversations, Portal Messages, Email Copilot, Call Logs, Deal Pipeline, Reminders, Checklists, Agreements, Game Plan, Marketing, User Guide, Token Usage, Automation, Templates, Branding, Integrations, Cloudflare, API Usage, Model Hub, Monitoring, Quality Assurance, Depreciation Comps, Error Logs, Activity Logs, Settings, User Management, Finance Portal, Portal Config, Token Audit Log, PDF Import Engine, PDF Import Diagnostics, BC Segment Engine, Reclassify Property, sidebar grouping, global routes, authentication and permissions.

## Scope lock confirmation

- No CSV parsing logic was changed.
- No external import behavior was changed.
- No API, Supabase, cache-table mapping or cache-write logic was changed.
- No route, authentication or permission logic was changed.
- No mock imported data, fake upload results or artificial cache records were added.
