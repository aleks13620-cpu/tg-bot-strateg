-- Allow 'archived' as a valid sprint status
ALTER TABLE sprints DROP CONSTRAINT IF EXISTS sprints_status_check;
ALTER TABLE sprints ADD CONSTRAINT sprints_status_check
  CHECK (status IN ('active', 'completed', 'cancelled', 'archived'));
