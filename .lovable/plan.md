
# Phase 4: Market Intelligence Report — Email Distribution

## Architecture
Emails are sent through the existing `send-email-reply` edge function (Microsoft Graph API) with `source: 'agent'` to apply the NPC-branded HTML template (banner image, gold/navy accents, signature, disclaimer). The PDF report is attached as a base64 file attachment. Recipients are resolved from GHL pipeline contacts.

---

## Step 1: Database Migration

### New Table: `marketing_report_schedules`
- `id`, `name`, `description`
- `pipeline_id` (UUID → ghl_pipelines)
- `stage_id` (UUID → ghl_pipeline_stages, nullable = all stages)
- `frequency` (enum: weekly, fortnightly, monthly, ad_hoc)
- `mailbox_source` ('admin' | 'personal')
- `sender_mailbox_email` (specific personal mailbox if selected)
- `email_subject_template` (customizable subject line)
- `email_body_template` (customizable intro message in markdown)
- `is_enabled`, `last_sent_at`, `next_scheduled_at`
- `created_by`, `created_at`, `updated_at`

### New Table: `marketing_report_distribution_log`
- `id`, `schedule_id`, `report_id` (→ marketing_intelligence_reports)
- `recipient_email`, `recipient_name`, `ghl_contact_id`
- `status` (pending, sent, failed, skipped)
- `error_message`, `sent_at`, `created_at`

---

## Step 2: Edge Function — `dispatch-marketing-reports`

### Flow:
1. Receive schedule_id (or ad-hoc trigger with pipeline/stage params)
2. Check if a fresh report exists (< 24h old) or generate a new one via `generate-market-intelligence-report`
3. Fetch PDF from Supabase Storage → convert to base64
4. Resolve recipients from `ghl_client_opportunities` filtered by pipeline_id + stage_id
5. Get recipient emails from `ghl_client_opportunities` (email field) or cross-reference with `clients` table
6. For each recipient:
   - Call `send-email-reply` internally with:
     - `source: 'agent'` (branded template)
     - `mailboxSource: schedule.mailbox_source`
     - PDF attachment (base64)
     - Custom subject + body from schedule template
   - Log result to `marketing_report_distribution_log`
7. Update schedule `last_sent_at` + calculate `next_scheduled_at`

### Rate limiting:
- 200ms delay between sends to respect Microsoft Graph limits
- Max 100 recipients per dispatch run

---

## Step 3: UI — Distribution Management

### Location: Marketing Analytics page → new "Report Distribution" section

**Components:**
1. **Schedule List** — Shows configured distribution schedules with status badges
2. **Create/Edit Schedule Dialog** — Pipeline selector, stage selector, frequency, mailbox choice, subject/body templates
3. **Send Now Button** — Triggers ad-hoc dispatch for any schedule
4. **Distribution History** — Table showing recent sends with recipient, status, timestamp

---

## Step 4: pg_cron Job

- Runs every hour: checks `marketing_report_schedules` where `is_enabled = true` AND `next_scheduled_at <= now()`
- Calls `dispatch-marketing-reports` for each due schedule
- Uses `net.http_post` pattern with service role auth

---

## Execution Order
1. Database migration (tables)
2. Edge function (dispatch-marketing-reports)
3. UI components (schedule management + distribution history)
4. pg_cron job setup
