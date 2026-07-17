INSERT INTO aml.role_assignments (user_id, role, notes)
SELECT u.id, 'mlro'::aml.aml_role, 'Bootstrap MLRO grant for tri-portal rollout'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM aml.role_assignments r
  WHERE r.user_id = u.id AND r.role = 'mlro'::aml.aml_role AND r.revoked_at IS NULL
);

INSERT INTO public.feature_flags (key, value, description)
VALUES ('aml_ctf', jsonb_build_object('enabled', true), 'AML/CTF tri-portal module')
ON CONFLICT (key) DO UPDATE SET value = jsonb_build_object('enabled', true);