-- ============================================================
-- FIX RECEPTIONIST USER_ID IN BRANCH_MEMBERS
-- ============================================================
-- This script updates existing Receptionist branch_members records
-- to link them to their actual user accounts via user_id.
--
-- The issue: Receptionists were assigned with user_id = null
-- This script finds Receptionist users by username/contact_name
-- and updates branch_members to link them correctly.
--
-- Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: See which Receptionist records need fixing
SELECT 
  bm.id,
  bm.branch_id,
  bm.contact_name,
  bm.user_id,
  bm.role,
  bm.is_active,
  u.user_id as actual_user_id,
  u.username,
  u.role as user_role
FROM branch_members bm
LEFT JOIN users u ON LOWER(TRIM(u.username)) = LOWER(TRIM(bm.contact_name))
WHERE bm.role = 'Receptionist'
  AND bm.user_id IS NULL
  AND bm.is_active = true
ORDER BY bm.branch_id, bm.contact_name;

-- Step 2: Update Receptionist records to link to user_id
-- This matches by username = contact_name
UPDATE branch_members bm
SET user_id = u.user_id
FROM users u
WHERE bm.role = 'Receptionist'
  AND bm.user_id IS NULL
  AND bm.is_active = true
  AND LOWER(TRIM(u.username)) = LOWER(TRIM(bm.contact_name))
  AND u.role = 'Receptionist';

-- Step 3: Verify the updates
SELECT 
  bm.id,
  bm.branch_id,
  b.name as branch_name,
  bm.contact_name,
  bm.user_id,
  u.username,
  u.role as user_role,
  bm.is_active
FROM branch_members bm
LEFT JOIN users u ON u.user_id = bm.user_id
LEFT JOIN branches b ON b.id = bm.branch_id
WHERE bm.role = 'Receptionist'
  AND bm.is_active = true
ORDER BY bm.branch_id, u.username;

-- Step 4: Check for any Receptionists that couldn't be matched
-- (These will need manual fixing)
SELECT 
  bm.id,
  bm.branch_id,
  b.name as branch_name,
  bm.contact_name,
  bm.user_id
FROM branch_members bm
LEFT JOIN branches b ON b.id = bm.branch_id
WHERE bm.role = 'Receptionist'
  AND bm.user_id IS NULL
  AND bm.is_active = true;

-- ============================================================
-- MANUAL FIX (if username doesn't match contact_name)
-- ============================================================
-- If some records couldn't be auto-matched, update them manually:
-- Replace <branch_member_id> and <user_id> with actual values

/*
UPDATE branch_members
SET user_id = <user_id>
WHERE id = <branch_member_id>
  AND role = 'Receptionist';
*/

