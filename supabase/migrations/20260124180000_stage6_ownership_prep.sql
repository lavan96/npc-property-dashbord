-- Stage 6: Ownership scaffolding + shadow owner-based policies (non-breaking)
-- This migration adds ownership columns and indexes, plus owner-based policies.
-- Existing permissive policies remain, so behavior is unchanged.

-- Helper function for matching auth.uid() to custom_users ids
CREATE OR REPLACE FUNCTION public.matches_auth_uid(target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (target_id = auth.uid() OR target_id::text = auth.uid()::text)
$$;

-- === Ownership columns (client data) ===
ALTER TABLE public.client_properties
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.client_employment
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.client_income
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.client_assets
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.client_liabilities
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.client_expenses
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.client_scores
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

-- === Ownership columns (system tables) ===
ALTER TABLE public.auto_report_generation_log
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.call_tags
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.call_alert_rules
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.call_alert_history
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.whitelabel_settings
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.global_report_settings
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.custom_users(id);

ALTER TABLE public.integration_configs
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.custom_users(id);

-- === Indexes for ownership columns ===
CREATE INDEX IF NOT EXISTS idx_client_properties_created_by ON public.client_properties(created_by);
CREATE INDEX IF NOT EXISTS idx_client_employment_created_by ON public.client_employment(created_by);
CREATE INDEX IF NOT EXISTS idx_client_income_created_by ON public.client_income(created_by);
CREATE INDEX IF NOT EXISTS idx_client_assets_created_by ON public.client_assets(created_by);
CREATE INDEX IF NOT EXISTS idx_client_liabilities_created_by ON public.client_liabilities(created_by);
CREATE INDEX IF NOT EXISTS idx_client_expenses_created_by ON public.client_expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_client_scores_created_by ON public.client_scores(created_by);
CREATE INDEX IF NOT EXISTS idx_client_files_uploaded_by ON public.client_files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_client_notes_created_by ON public.client_notes(created_by);
CREATE INDEX IF NOT EXISTS idx_client_reminders_created_by ON public.client_reminders(created_by);
CREATE INDEX IF NOT EXISTS idx_client_tags_created_by ON public.client_tags(created_by);
CREATE INDEX IF NOT EXISTS idx_client_tag_assignments_assigned_by ON public.client_tag_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_client_activities_created_by ON public.client_activities(created_by);
CREATE INDEX IF NOT EXISTS idx_portfolio_reports_generated_by ON public.portfolio_analysis_reports(generated_by);
CREATE INDEX IF NOT EXISTS idx_investment_reports_generated_by ON public.investment_reports(generated_by);
CREATE INDEX IF NOT EXISTS idx_cash_flow_analyses_created_by ON public.cash_flow_analyses(created_by);
CREATE INDEX IF NOT EXISTS idx_report_qa_conversations_created_by ON public.report_qa_conversations(created_by);
CREATE INDEX IF NOT EXISTS idx_report_qa_messages_created_by ON public.report_qa_messages(created_by);

-- === Shadow owner-based policies (non-enforcing while permissive policies exist) ===
-- Clients
DROP POLICY IF EXISTS "Owner can select clients" ON public.clients;
CREATE POLICY "Owner can select clients"
  ON public.clients FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert clients" ON public.clients;
CREATE POLICY "Owner can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update clients" ON public.clients;
CREATE POLICY "Owner can update clients"
  ON public.clients FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete clients" ON public.clients;
CREATE POLICY "Owner can delete clients"
  ON public.clients FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Client properties
DROP POLICY IF EXISTS "Owner can select client properties" ON public.client_properties;
CREATE POLICY "Owner can select client properties"
  ON public.client_properties FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client properties" ON public.client_properties;
CREATE POLICY "Owner can insert client properties"
  ON public.client_properties FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client properties" ON public.client_properties;
CREATE POLICY "Owner can update client properties"
  ON public.client_properties FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client properties" ON public.client_properties;
CREATE POLICY "Owner can delete client properties"
  ON public.client_properties FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Client employment
DROP POLICY IF EXISTS "Owner can select client employment" ON public.client_employment;
CREATE POLICY "Owner can select client employment"
  ON public.client_employment FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client employment" ON public.client_employment;
CREATE POLICY "Owner can insert client employment"
  ON public.client_employment FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client employment" ON public.client_employment;
CREATE POLICY "Owner can update client employment"
  ON public.client_employment FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client employment" ON public.client_employment;
CREATE POLICY "Owner can delete client employment"
  ON public.client_employment FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Client income
DROP POLICY IF EXISTS "Owner can select client income" ON public.client_income;
CREATE POLICY "Owner can select client income"
  ON public.client_income FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client income" ON public.client_income;
CREATE POLICY "Owner can insert client income"
  ON public.client_income FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client income" ON public.client_income;
CREATE POLICY "Owner can update client income"
  ON public.client_income FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client income" ON public.client_income;
CREATE POLICY "Owner can delete client income"
  ON public.client_income FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Client assets
DROP POLICY IF EXISTS "Owner can select client assets" ON public.client_assets;
CREATE POLICY "Owner can select client assets"
  ON public.client_assets FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client assets" ON public.client_assets;
CREATE POLICY "Owner can insert client assets"
  ON public.client_assets FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client assets" ON public.client_assets;
CREATE POLICY "Owner can update client assets"
  ON public.client_assets FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client assets" ON public.client_assets;
CREATE POLICY "Owner can delete client assets"
  ON public.client_assets FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Client liabilities
DROP POLICY IF EXISTS "Owner can select client liabilities" ON public.client_liabilities;
CREATE POLICY "Owner can select client liabilities"
  ON public.client_liabilities FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client liabilities" ON public.client_liabilities;
CREATE POLICY "Owner can insert client liabilities"
  ON public.client_liabilities FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client liabilities" ON public.client_liabilities;
CREATE POLICY "Owner can update client liabilities"
  ON public.client_liabilities FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client liabilities" ON public.client_liabilities;
CREATE POLICY "Owner can delete client liabilities"
  ON public.client_liabilities FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Client expenses
DROP POLICY IF EXISTS "Owner can select client expenses" ON public.client_expenses;
CREATE POLICY "Owner can select client expenses"
  ON public.client_expenses FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client expenses" ON public.client_expenses;
CREATE POLICY "Owner can insert client expenses"
  ON public.client_expenses FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client expenses" ON public.client_expenses;
CREATE POLICY "Owner can update client expenses"
  ON public.client_expenses FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client expenses" ON public.client_expenses;
CREATE POLICY "Owner can delete client expenses"
  ON public.client_expenses FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Client files (uploaded_by)
DROP POLICY IF EXISTS "Owner can select client files" ON public.client_files;
CREATE POLICY "Owner can select client files"
  ON public.client_files FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(uploaded_by) OR uploaded_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client files" ON public.client_files;
CREATE POLICY "Owner can insert client files"
  ON public.client_files FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(uploaded_by) OR uploaded_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client files" ON public.client_files;
CREATE POLICY "Owner can update client files"
  ON public.client_files FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(uploaded_by) OR uploaded_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client files" ON public.client_files;
CREATE POLICY "Owner can delete client files"
  ON public.client_files FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(uploaded_by) OR uploaded_by IS NULL);

-- Client notes
DROP POLICY IF EXISTS "Owner can select client notes" ON public.client_notes;
CREATE POLICY "Owner can select client notes"
  ON public.client_notes FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client notes" ON public.client_notes;
CREATE POLICY "Owner can insert client notes"
  ON public.client_notes FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client notes" ON public.client_notes;
CREATE POLICY "Owner can update client notes"
  ON public.client_notes FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client notes" ON public.client_notes;
CREATE POLICY "Owner can delete client notes"
  ON public.client_notes FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Client reminders
DROP POLICY IF EXISTS "Owner can select client reminders" ON public.client_reminders;
CREATE POLICY "Owner can select client reminders"
  ON public.client_reminders FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client reminders" ON public.client_reminders;
CREATE POLICY "Owner can insert client reminders"
  ON public.client_reminders FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client reminders" ON public.client_reminders;
CREATE POLICY "Owner can update client reminders"
  ON public.client_reminders FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client reminders" ON public.client_reminders;
CREATE POLICY "Owner can delete client reminders"
  ON public.client_reminders FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Client scores
DROP POLICY IF EXISTS "Owner can select client scores" ON public.client_scores;
CREATE POLICY "Owner can select client scores"
  ON public.client_scores FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client scores" ON public.client_scores;
CREATE POLICY "Owner can insert client scores"
  ON public.client_scores FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client scores" ON public.client_scores;
CREATE POLICY "Owner can update client scores"
  ON public.client_scores FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client scores" ON public.client_scores;
CREATE POLICY "Owner can delete client scores"
  ON public.client_scores FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Client activities
DROP POLICY IF EXISTS "Owner can select client activities" ON public.client_activities;
CREATE POLICY "Owner can select client activities"
  ON public.client_activities FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert client activities" ON public.client_activities;
CREATE POLICY "Owner can insert client activities"
  ON public.client_activities FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update client activities" ON public.client_activities;
CREATE POLICY "Owner can update client activities"
  ON public.client_activities FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete client activities" ON public.client_activities;
CREATE POLICY "Owner can delete client activities"
  ON public.client_activities FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Portfolio analysis reports (generated_by)
DROP POLICY IF EXISTS "Owner can select portfolio analysis reports" ON public.portfolio_analysis_reports;
CREATE POLICY "Owner can select portfolio analysis reports"
  ON public.portfolio_analysis_reports FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(generated_by) OR generated_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert portfolio analysis reports" ON public.portfolio_analysis_reports;
CREATE POLICY "Owner can insert portfolio analysis reports"
  ON public.portfolio_analysis_reports FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(generated_by) OR generated_by IS NULL);

DROP POLICY IF EXISTS "Owner can update portfolio analysis reports" ON public.portfolio_analysis_reports;
CREATE POLICY "Owner can update portfolio analysis reports"
  ON public.portfolio_analysis_reports FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(generated_by) OR generated_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete portfolio analysis reports" ON public.portfolio_analysis_reports;
CREATE POLICY "Owner can delete portfolio analysis reports"
  ON public.portfolio_analysis_reports FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(generated_by) OR generated_by IS NULL);

-- Investment reports (generated_by)
DROP POLICY IF EXISTS "Owner can select investment reports" ON public.investment_reports;
CREATE POLICY "Owner can select investment reports"
  ON public.investment_reports FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(generated_by) OR generated_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert investment reports" ON public.investment_reports;
CREATE POLICY "Owner can insert investment reports"
  ON public.investment_reports FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(generated_by) OR generated_by IS NULL);

DROP POLICY IF EXISTS "Owner can update investment reports" ON public.investment_reports;
CREATE POLICY "Owner can update investment reports"
  ON public.investment_reports FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(generated_by) OR generated_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete investment reports" ON public.investment_reports;
CREATE POLICY "Owner can delete investment reports"
  ON public.investment_reports FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(generated_by) OR generated_by IS NULL);

-- Cash flow analyses (created_by)
DROP POLICY IF EXISTS "Owner can select cash flow analyses" ON public.cash_flow_analyses;
CREATE POLICY "Owner can select cash flow analyses"
  ON public.cash_flow_analyses FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert cash flow analyses" ON public.cash_flow_analyses;
CREATE POLICY "Owner can insert cash flow analyses"
  ON public.cash_flow_analyses FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update cash flow analyses" ON public.cash_flow_analyses;
CREATE POLICY "Owner can update cash flow analyses"
  ON public.cash_flow_analyses FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete cash flow analyses" ON public.cash_flow_analyses;
CREATE POLICY "Owner can delete cash flow analyses"
  ON public.cash_flow_analyses FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

-- Report Q&A conversations/messages
DROP POLICY IF EXISTS "Owner can select report qa conversations" ON public.report_qa_conversations;
CREATE POLICY "Owner can select report qa conversations"
  ON public.report_qa_conversations FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert report qa conversations" ON public.report_qa_conversations;
CREATE POLICY "Owner can insert report qa conversations"
  ON public.report_qa_conversations FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update report qa conversations" ON public.report_qa_conversations;
CREATE POLICY "Owner can update report qa conversations"
  ON public.report_qa_conversations FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete report qa conversations" ON public.report_qa_conversations;
CREATE POLICY "Owner can delete report qa conversations"
  ON public.report_qa_conversations FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can select report qa messages" ON public.report_qa_messages;
CREATE POLICY "Owner can select report qa messages"
  ON public.report_qa_messages FOR SELECT
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can insert report qa messages" ON public.report_qa_messages;
CREATE POLICY "Owner can insert report qa messages"
  ON public.report_qa_messages FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can update report qa messages" ON public.report_qa_messages;
CREATE POLICY "Owner can update report qa messages"
  ON public.report_qa_messages FOR UPDATE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);

DROP POLICY IF EXISTS "Owner can delete report qa messages" ON public.report_qa_messages;
CREATE POLICY "Owner can delete report qa messages"
  ON public.report_qa_messages FOR DELETE
  USING (auth.role() = 'service_role' OR matches_auth_uid(created_by) OR created_by IS NULL);
