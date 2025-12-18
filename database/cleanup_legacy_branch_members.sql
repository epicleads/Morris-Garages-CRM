-- Cleanup Legacy Branch Members Without User Accounts
-- This script identifies and optionally deactivates branch_members entries
-- that don't have matching user accounts (legacy entries from before user accounts existed)
--
-- INSTRUCTIONS:
-- 1. Run Step 1 to see what will be deactivated
-- 2. Review the list carefully
-- 3. Run Step 2 to deactivate them (soft delete - sets is_active = false)
-- 4. Run Step 3 to verify

-- Step 1: Preview - Show legacy entries that DON'T have matching users
-- These are entries that were created before user accounts existed
SELECT 
  bm.id as branch_member_id,
  bm.contact_name,
  bm.role,
  bm.branch_id,
  bm.is_active,
  bm.created_at,
  '⚠️ NO MATCHING USER - Will be deactivated' as status
FROM branch_members bm
WHERE 
  bm.user_id IS NULL
  AND bm.contact_name IS NOT NULL
  AND bm.role IN ('RM', 'TL')
  AND bm.is_active = true
  -- Exclude entries that have matching users (those should be kept)
  AND NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE (
      LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u.full_name)) OR 
      LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u.username))
    )
    AND u.role = CASE 
      WHEN bm.role = 'RM' THEN 'RM'
      WHEN bm.role = 'TL' THEN 'RM_TL'
      ELSE u.role
    END
    AND (
      SELECT COUNT(*)
      FROM users u2
      WHERE (
        LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u2.full_name)) OR 
        LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u2.username))
      )
      AND u2.role = CASE 
        WHEN bm.role = 'RM' THEN 'RM'
        WHEN bm.role = 'TL' THEN 'RM_TL'
        ELSE u2.role
      END
    ) = 1
  )
ORDER BY bm.created_at DESC, bm.id;

-- Step 2: Deactivate legacy entries (soft delete - sets is_active = false)
-- This preserves the data but hides them from active queries
-- You can reactivate them later if needed
UPDATE branch_members bm
SET 
  is_active = false,
  updated_at = NOW()
WHERE 
  bm.user_id IS NULL
  AND bm.contact_name IS NOT NULL
  AND bm.role IN ('RM', 'TL')
  AND bm.is_active = true
  -- Only deactivate entries that don't have matching users
  AND NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE (
      LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u.full_name)) OR 
      LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u.username))
    )
    AND u.role = CASE 
      WHEN bm.role = 'RM' THEN 'RM'
      WHEN bm.role = 'TL' THEN 'RM_TL'
      ELSE u.role
    END
    AND (
      SELECT COUNT(*)
      FROM users u2
      WHERE (
        LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u2.full_name)) OR 
        LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u2.username))
      )
      AND u2.role = CASE 
        WHEN bm.role = 'RM' THEN 'RM'
        WHEN bm.role = 'TL' THEN 'RM_TL'
        ELSE u2.role
      END
    ) = 1
  );

-- Step 3: Verification - Check remaining active entries
-- Should only show entries with user_id set (or entries that have matching users)
SELECT 
  bm.id,
  bm.contact_name,
  bm.role,
  bm.branch_id,
  bm.user_id,
  bm.is_active,
  CASE 
    WHEN bm.user_id IS NOT NULL THEN '✅ Has user_id'
    WHEN EXISTS (
      SELECT 1 FROM users u
      WHERE (
        LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u.full_name)) OR 
        LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u.username))
      )
      AND u.role = CASE 
        WHEN bm.role = 'RM' THEN 'RM'
        WHEN bm.role = 'TL' THEN 'RM_TL'
        ELSE u.role
      END
    ) THEN '✅ Has matching user (will be linked by backfill)'
    ELSE '⚠️ No user - should be deactivated'
  END as status
FROM branch_members bm
WHERE 
  bm.role IN ('RM', 'TL')
  AND bm.is_active = true
ORDER BY bm.branch_id, bm.role, bm.id;

-- OPTIONAL: Step 4 - Hard delete (PERMANENT - use with caution!)
-- Uncomment only if you're absolutely sure you want to permanently delete these entries
-- This cannot be undone!
/*
DELETE FROM branch_members
WHERE 
  user_id IS NULL
  AND contact_name IS NOT NULL
  AND role IN ('RM', 'TL')
  AND is_active = false
  AND NOT EXISTS (
    SELECT 1 FROM users u
    WHERE (
      LOWER(TRIM(contact_name)) = LOWER(TRIM(u.full_name)) OR 
      LOWER(TRIM(contact_name)) = LOWER(TRIM(u.username))
    )
    AND u.role = CASE 
      WHEN role = 'RM' THEN 'RM'
      WHEN role = 'TL' THEN 'RM_TL'
      ELSE u.role
    END
  );
*/

