# Stage 1 Security Inventory (Discovery)

This document captures the current access surface used by the dashboard.
It is based on static code inspection of the repo (frontend + edge functions).

## Frontend database access (supabase.from)
The frontend reads/writes the following tables:

### Client data
- clients
- client_properties
- client_employment
- client_income
- client_assets
- client_liabilities
- client_expenses
- client_import_logs
- client_files
- client_notes
- client_tags
- client_tag_assignments
- client_reminders
- client_scores
- client_activities
- portfolio_reviews
- custom_users

### Reports and analytics
- investment_reports
- generated_reports
- report_versions
- report_structure_templates
- chart_configurations
- charts
- chart_analysis
- report_qa_conversations
- report_qa_messages
- comparison_analysis_templates
- property_comparisons
- cash_flow_analyses
- depreciation_comps
- depreciation_estimator_runs

### Automation and bulk processing
- auto_report_master_settings
- auto_report_switches
- auto_report_generation_log
- auto_report_processed_listings
- bulk_generation_jobs
- bulk_generation_items

### Monitoring and admin data
- activity_logs
- notifications
- api_health_log
- integration_configs
- dashboard_modules
- user_permissions

### Call logs
- vapi_call_logs
- call_tags
- call_alert_rules
- call_alert_history

### Other datasets
- finance_agent_contacts
- whitelabel_settings
- global_report_settings
- borrowing_capacity_assessments
- land_tax_rates
- ghl_pipelines
- ghl_pipeline_stages
- email_copilot_emails
- email_copilot_sent_replies
- document_chunks (used by templates flow)

## Frontend storage buckets (supabase.storage.from)
Buckets referenced by the UI:
- branding-assets
- report-templates
- investment-reports
- client-files
- client-documents
- vownet-forms

## Edge functions invoked from the frontend
Functions called via `supabase.functions.invoke(...)`:
- abs-data-service
- admin-password-reset
- admin-user-management
- airtable-proxy
- auto-report-sync
- calculate-borrowing-capacity
- cdr-lending-rates-service
- check-integration-secrets
- clean-note-transcript
- compare-cash-flow-reports
- compare-investment-reports
- condense-investment-report
- custom-auth-login
- custom-auth-logout
- custom-auth-verify
- email-copilot
- estimate-property-expenses
- format-comparison-report
- generate-bulk-reports
- generate-chart-analysis
- generate-charts-python
- generate-investment-report
- generate-portfolio-analysis
- ghl-calendar
- import-clients-from-ghl
- import-schools-data
- import-suburb-directory
- investment-scoring-service
- location-intelligence-service
- log-activity
- migrate-comparison-scores
- outlook-email-sync
- parse-property-pdf
- parse-template-document
- rba-data-service
- regenerate-report-qualitative
- report-qa
- scrape-property-listing
- send-call-alert-email
- send-email-reply
- send-weekly-call-report
- sync-client-to-ghl
- sync-ghl-pipelines
- sync-notes-to-ghl
- update-ghl-opportunity-stage
- update-integration-secret
- voice-to-text

## Auth / access notes (current state)
- `supabase/config.toml` sets `verify_jwt = false` for all edge functions.
- Frontend uses the public anon key from `src/integrations/supabase/client.ts`.
- Many tables and buckets are accessed directly from the browser (see lists above).

## Follow-ups (Stage 1 outcomes)
- Validate the table/bucket list against runtime usage (Sentry/console logs).
- Confirm which functions must remain public vs authenticated vs service-only.
