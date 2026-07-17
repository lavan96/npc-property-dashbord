
UPDATE public.client_files
SET file_path = (file_path::jsonb ->> 'path')
WHERE file_path LIKE '{%'
  AND (file_path::jsonb ->> 'path') IS NOT NULL
  AND (file_path::jsonb ->> 'path') <> '';
