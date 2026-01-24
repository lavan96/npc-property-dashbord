-- Rollback Migration: Restore Original Client Data RLS Policies
-- Purpose: Rollback the security changes if needed
-- Date: 2025-01-24
-- 
-- WARNING: This restores permissive policies that were removed for security.
-- Only use this if you need to rollback the security changes.

BEGIN;

-- ============================================
-- ROLLBACK: Restore original permissive policies
-- ============================================
-- Note: These policies were removed for security reasons.
-- Restoring them makes the data accessible again but less secure.

-- client_activities: Restore "Allow all access"
CREATE POLICY IF NOT EXISTS "Allow all access to client_activities"
ON client_activities
FOR ALL
USING (true)
WITH CHECK (true);

-- client_files: Restore "Allow all access"
CREATE POLICY IF NOT EXISTS "Allow all access to client_files"
ON client_files
FOR ALL
USING (true)
WITH CHECK (true);

-- client_notes: Restore "Allow all operations"
CREATE POLICY IF NOT EXISTS "Allow all operations on client_notes"
ON client_notes
FOR ALL
USING (true)
WITH CHECK (true);

-- client_tag_assignments: Restore "Allow all access"
CREATE POLICY IF NOT EXISTS "Allow all access to client_tag_assignments"
ON client_tag_assignments
FOR ALL
USING (true)
WITH CHECK (true);

-- client_tags: Restore "Allow all access"
CREATE POLICY IF NOT EXISTS "Allow all access to client_tags"
ON client_tags
FOR ALL
USING (true)
WITH CHECK (true);

-- client_branding_profiles: Restore original policies
CREATE POLICY IF NOT EXISTS "Branding profiles are publicly readable"
ON client_branding_profiles
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Allow branding profile inserts"
ON client_branding_profiles
FOR INSERT
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow branding profile updates"
ON client_branding_profiles
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow branding profile deletes"
ON client_branding_profiles
FOR DELETE
USING (true);

-- ============================================
-- Security Warning
-- ============================================
-- These policies restore permissive access to client data.
-- This means any authenticated user can access all client data.
-- 
-- Use this rollback only if:
-- 1. The security changes are causing issues
-- 2. You need immediate access restored
-- 3. You plan to fix the issues and re-apply security later
--
-- After rollback, ensure edge functions still enforce proper access control.

COMMIT;

