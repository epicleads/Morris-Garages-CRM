-- ============================================================
-- FIX DUPLICATE RECEPTIONIST BRANCH ASSIGNMENTS
-- ============================================================
-- A Receptionist should only be assigned to ONE branch.
-- This script keeps the most recent assignment and deactivates older ones.
--
-- Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: Identify Receptionists with multiple active branch assignments
SELECT 
  bm.user_id,
  u.username,
  COUNT(*) as assignment_count,
  ARRAY_AGG(bm.branch_id ORDER BY bm.id DESC) as branch_ids,
  ARRAY_AGG(bm.id ORDER BY bm.id DESC) as member_ids
FROM branch_members bm
JOIN users u ON u.user_id = bm.user_id
WHERE bm.role = 'Receptionist'
  AND bm.is_active = true
  AND bm.user_id IS NOT NULL
GROUP BY bm.user_id, u.username
HAVING COUNT(*) > 1;

-- Step 2: Keep the most recent assignment (highest id), deactivate others
-- For user_id = 17 (reception), this will keep the assignment with the highest id
WITH duplicates AS (
  SELECT 
    bm.id,
    bm.user_id,
    bm.branch_id,
    ROW_NUMBER() OVER (
      PARTITION BY bm.user_id 
      ORDER BY bm.id DESC
    ) as row_num
  FROM branch_members bm
  WHERE bm.role = 'Receptionist'
    AND bm.is_active = true
    AND bm.user_id IS NOT NULL
)
UPDATE branch_members bm
SET is_active = false
WHERE bm.id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);

-- Step 3: Verify - each Receptionist should now have only ONE active assignment
SELECT 
  bm.id,
  bm.branch_id,
  b.name as branch_name,
  bm.user_id,
  u.username,
  bm.is_active
FROM branch_members bm
JOIN users u ON u.user_id = bm.user_id
LEFT JOIN branches b ON b.id = bm.branch_id
WHERE bm.role = 'Receptionist'
  AND bm.user_id IS NOT NULL
ORDER BY u.username, bm.is_active DESC, bm.id DESC;

-- Step 4: Final check - should return 0 rows (no duplicates)
SELECT 
  bm.user_id,
  COUNT(*) as count
FROM branch_members bm
WHERE bm.role = 'Receptionist'
  AND bm.is_active = true
  AND bm.user_id IS NOT NULL
GROUP BY bm.user_id
HAVING COUNT(*) > 1;

