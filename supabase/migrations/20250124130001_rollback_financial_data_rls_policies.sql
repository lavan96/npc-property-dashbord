-- Rollback Migration: Restore Original Financial Data RLS Policies
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

-- borrowing_capacity_assessments: Restore original policies
CREATE POLICY IF NOT EXISTS "Public read access"
ON borrowing_capacity_assessments
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Service role full access"
ON borrowing_capacity_assessments
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- cash_flow_analyses: Restore "Anyone" policies
CREATE POLICY IF NOT EXISTS "Anyone can view cash flow analyses"
ON cash_flow_analyses
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Anyone can create cash flow analyses"
ON cash_flow_analyses
FOR INSERT
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Anyone can update cash flow analyses"
ON cash_flow_analyses
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Anyone can delete cash flow analyses"
ON cash_flow_analyses
FOR DELETE
USING (true);

-- portfolio_analysis_reports: Restore "Anyone" policies
CREATE POLICY IF NOT EXISTS "Anyone can view portfolio analysis reports"
ON portfolio_analysis_reports
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Anyone can create portfolio analysis reports"
ON portfolio_analysis_reports
FOR INSERT
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Anyone can update portfolio analysis reports"
ON portfolio_analysis_reports
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Anyone can delete portfolio analysis reports"
ON portfolio_analysis_reports
FOR DELETE
USING (true);

-- portfolio_reviews: Restore "Anyone" policies
CREATE POLICY IF NOT EXISTS "Anyone can view portfolio reviews"
ON portfolio_reviews
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Anyone can insert portfolio reviews"
ON portfolio_reviews
FOR INSERT
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Anyone can update portfolio reviews"
ON portfolio_reviews
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Anyone can delete portfolio reviews"
ON portfolio_reviews
FOR DELETE
USING (true);

-- ============================================
-- Security Warning
-- ============================================
-- These policies restore permissive access to financial data.
-- This means any authenticated user can access all financial data.
-- 
-- Use this rollback only if:
-- 1. The security changes are causing issues
-- 2. You need immediate access restored
-- 3. You plan to fix the issues and re-apply security later
--
-- After rollback, ensure edge functions still enforce proper access control.

COMMIT;

