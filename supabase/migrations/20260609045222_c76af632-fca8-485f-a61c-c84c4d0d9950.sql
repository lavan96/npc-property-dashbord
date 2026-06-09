-- 1. Update default permissions to allow edit/delete by finance partners
UPDATE public.finance_portal_default_permissions
SET permissions = jsonb_build_object(
  'properties',  jsonb_build_object('view', true, 'edit', true, 'delete', true),
  'income',      jsonb_build_object('view', true, 'edit', true, 'delete', true),
  'expenses',    jsonb_build_object('view', true, 'edit', true, 'delete', true),
  'assets',      jsonb_build_object('view', true, 'edit', true, 'delete', true),
  'liabilities', jsonb_build_object('view', true, 'edit', true, 'delete', true),
  'employment',  jsonb_build_object('view', true, 'edit', true, 'delete', true),
  'notes',       jsonb_build_object('view', true, 'edit', true, 'delete', true),
  'contacts',    jsonb_build_object('view', true, 'edit', true, 'delete', true)
),
updated_at = now();

-- 2. Upgrade all existing per-client assignments to full edit/delete so partners
--    aren't stuck with the old read-only defaults on already-assigned clients.
UPDATE public.finance_portal_client_assignments
SET permissions = (
  SELECT jsonb_object_agg(
    key,
    jsonb_build_object('view', true, 'edit', true, 'delete', true)
  )
  FROM jsonb_object_keys(permissions) AS key
),
updated_at = now()
WHERE permissions IS NOT NULL;

-- 3. Patch the client_activities check constraint to recognise new activity
--    types that the finance portal emits when partners create/import clients.
ALTER TABLE public.client_activities
  DROP CONSTRAINT IF EXISTS client_activities_activity_type_check;

ALTER TABLE public.client_activities
  ADD CONSTRAINT client_activities_activity_type_check CHECK (
    activity_type = ANY (ARRAY[
      'note_added','file_uploaded','reminder_created','reminder_completed',
      'tag_added','tag_removed','property_added','property_updated',
      'score_updated','contact_made','meeting','email_sent','status_changed',
      'client_created','client_imported','custom'
    ])
  );

-- 4. Patch the finance_portal_activity_log actor_type check so it accepts
--    the 'finance_partner' value the function emits without falling over.
ALTER TABLE public.finance_portal_activity_log
  DROP CONSTRAINT IF EXISTS finance_portal_activity_actor_type_check;

ALTER TABLE public.finance_portal_activity_log
  ADD CONSTRAINT finance_portal_activity_actor_type_check CHECK (
    actor_type = ANY (ARRAY['finance_user','finance_partner','staff','system'])
  );
