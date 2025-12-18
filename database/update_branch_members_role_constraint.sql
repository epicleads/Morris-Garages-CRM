-- ============================================================
-- UPDATE BRANCH_MEMBERS ROLE CONSTRAINT TO INCLUDE RECEPTIONIST
-- ============================================================
-- This migration updates the CHECK constraint on branch_members.role
-- to allow 'Receptionist' in addition to 'TL', 'RM', and 'CRE'.
--
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop the existing constraint
ALTER TABLE public.branch_members
  DROP CONSTRAINT IF EXISTS branch_members_role_check;

-- Add the updated constraint with 'Receptionist' included
ALTER TABLE public.branch_members
  ADD CONSTRAINT branch_members_role_check
  CHECK (role = ANY (ARRAY['TL'::text, 'RM'::text, 'CRE'::text, 'Receptionist'::text]));

-- Verify the constraint was updated
-- You can run this query to check:
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conname = 'branch_members_role_check';

