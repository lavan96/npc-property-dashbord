-- Tighten storage write policies for sensitive buckets.
-- Note: Reads remain unchanged to avoid breaking existing public URLs.

-- client-files bucket
DROP POLICY IF EXISTS "Allow uploads to client-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow updates to client-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes from client-files" ON storage.objects;

CREATE POLICY "client_files_insert_authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'client-files'
    AND auth.role() IN ('authenticated', 'service_role')
  );

CREATE POLICY "client_files_update_authenticated"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'client-files'
    AND auth.role() IN ('authenticated', 'service_role')
  );

CREATE POLICY "client_files_delete_authenticated"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'client-files'
    AND auth.role() IN ('authenticated', 'service_role')
  );

-- investment-reports bucket
DROP POLICY IF EXISTS "Authenticated users can upload investment reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update their own reports" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete their own reports" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload to investment-reports" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update investment-reports" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete from investment-reports" ON storage.objects;

CREATE POLICY "investment_reports_insert_authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'investment-reports'
    AND auth.role() IN ('authenticated', 'service_role')
  );

CREATE POLICY "investment_reports_update_authenticated"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'investment-reports'
    AND auth.role() IN ('authenticated', 'service_role')
  );

CREATE POLICY "investment_reports_delete_authenticated"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'investment-reports'
    AND auth.role() IN ('authenticated', 'service_role')
  );

-- report-templates bucket
DROP POLICY IF EXISTS "Authenticated users can upload template files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update template files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete template files" ON storage.objects;

CREATE POLICY "report_templates_insert_authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'report-templates'
    AND auth.role() IN ('authenticated', 'service_role')
  );

CREATE POLICY "report_templates_update_authenticated"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'report-templates'
    AND auth.role() IN ('authenticated', 'service_role')
  );

CREATE POLICY "report_templates_delete_authenticated"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'report-templates'
    AND auth.role() IN ('authenticated', 'service_role')
  );

-- branding-assets bucket
DROP POLICY IF EXISTS "Authenticated users can upload branding assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update branding assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete branding assets" ON storage.objects;

CREATE POLICY "branding_assets_insert_authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'branding-assets'
    AND auth.role() IN ('authenticated', 'service_role')
  );

CREATE POLICY "branding_assets_update_authenticated"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'branding-assets'
    AND auth.role() IN ('authenticated', 'service_role')
  );

CREATE POLICY "branding_assets_delete_authenticated"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'branding-assets'
    AND auth.role() IN ('authenticated', 'service_role')
  );

-- vownet-forms bucket
DROP POLICY IF EXISTS "Authenticated users can upload vownet forms" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update vownet forms" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete vownet forms" ON storage.objects;
DROP POLICY IF EXISTS "vownet_forms_insert_policy" ON storage.objects;
DROP POLICY IF EXISTS "vownet_forms_update_policy" ON storage.objects;
DROP POLICY IF EXISTS "vownet_forms_delete_policy" ON storage.objects;
DROP POLICY IF EXISTS "vownet_forms_allow_all_insert" ON storage.objects;
DROP POLICY IF EXISTS "vownet_forms_allow_all_update" ON storage.objects;
DROP POLICY IF EXISTS "vownet_forms_allow_all_delete" ON storage.objects;

CREATE POLICY "vownet_forms_insert_authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'vownet-forms'
    AND auth.role() IN ('authenticated', 'service_role')
  );

CREATE POLICY "vownet_forms_update_authenticated"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'vownet-forms'
    AND auth.role() IN ('authenticated', 'service_role')
  );

CREATE POLICY "vownet_forms_delete_authenticated"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'vownet-forms'
    AND auth.role() IN ('authenticated', 'service_role')
  );
