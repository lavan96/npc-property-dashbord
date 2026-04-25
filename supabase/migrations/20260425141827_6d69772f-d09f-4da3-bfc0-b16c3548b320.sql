-- Reset 4 jobs that died due to the now-fixed `.catch is not a function` bug.
-- They have valid resume_cursor checkpoints so will pick up where they left off.
UPDATE migration_jobs
SET 
  status = 'pending',
  worker_lock_until = NULL,
  completed_at = NULL,
  error_summary = NULL,
  dispatch_count = 0
WHERE id IN (
  '49cea0b9-eeaa-40c1-b9c2-1f2e2b0dfac5',
  '49e0f5d6-5b42-4fae-818b-a62fe49fdf6f',
  'e3f0d0d3-c119-4a16-8fc9-076546dbbbbd',
  '06e729c7-6700-4322-8896-36175a83fbee'
)
AND status = 'failed';