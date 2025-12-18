-- ============================================================
-- CLEANUP DUPLICATE BRANCH MEMBERS
-- ============================================================
-- This script helps identify and remove duplicate branch member assignments
-- (same user_id + same branch_id + same role + active)
--
-- Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: Identify duplicates
-- This query shows all duplicate assignments (keeping the oldest one)
SELECT 
  branch_id,
  user_id,
  role,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id ORDER BY created_at) as member_ids,
  ARRAY_AGG(created_at ORDER BY created_at) as created_dates
FROM branch_members
WHERE is_active = true
  AND user_id IS NOT NULL  -- Only check roles that use user_id (CRE, Receptionist)
GROUP BY branch_id, user_id, role
HAVING COUNT(*) > 1
ORDER BY branch_id, user_id, role;

-- Step 2: Remove duplicates (keeps the oldest record, deletes newer ones)
-- WARNING: Review the results from Step 1 before running this!
-- Uncomment and run only if you're sure:

/*
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY branch_id, user_id, role 
      ORDER BY created_at ASC
    ) as row_num
  FROM branch_members
  WHERE is_active = true
    AND user_id IS NOT NULL
)
UPDATE branch_members
SET is_active = false
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);
*/

-- Step 3: Verify cleanup (should return 0 rows if all duplicates are removed)
SELECT 
  branch_id,
  user_id,
  role,
  COUNT(*) as count
FROM branch_members
WHERE is_active = true
  AND user_id IS NOT NULL
GROUP BY branch_id, user_id, role
HAVING COUNT(*) > 1;

-- ============================================================
-- ALTERNATIVE: Manual cleanup for specific cases
-- ============================================================
-- If you want to remove a specific duplicate, use this:
-- Replace <member_id_to_remove> with the actual ID

/*
UPDATE branch_members
SET is_active = false
WHERE id = <member_id_to_remove>;
*/

