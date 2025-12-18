-- Backfill user_id for RM and TL entries in branch_members
-- This script matches branch_members.contact_name to users.full_name or users.username
-- and updates branch_members.user_id accordingly
--
-- CONTEXT:
-- Earlier, RMs/TLs were created in branch_members without user accounts (just labels).
-- Now that user accounts exist, we need to link them.
--
-- BEHAVIOR:
-- - Entries WITH matching users → Will be updated with user_id
-- - Entries WITHOUT matching users → Will remain with user_id: null (legacy data, this is OK)
--
-- INSTRUCTIONS:
-- 1. Run Step 1 to see what WILL be updated
-- 2. Run Step 1b to see what will REMAIN unchanged (legacy entries)
-- 3. Run Step 2 to perform the actual update
-- 4. Run Step 3 to verify results

-- Step 1: Preview - Show what WILL be updated (entries with matching users)
SELECT 
  bm.id as branch_member_id,
  bm.contact_name as branch_member_name,
  bm.role,
  bm.branch_id,
  u.user_id as will_be_linked_to_user_id,
  u.full_name as user_full_name,
  u.username as user_username,
  '✅ WILL BE UPDATED' as status
FROM branch_members bm
INNER JOIN users u ON (
  (LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u.full_name)) OR 
   LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u.username)))
  AND u.role = CASE 
    WHEN bm.role = 'RM' THEN 'RM'
    WHEN bm.role = 'TL' THEN 'RM_TL'
    ELSE u.role
  END
)
WHERE 
  bm.user_id IS NULL
  AND bm.contact_name IS NOT NULL
  AND bm.role IN ('RM', 'TL')
  AND bm.is_active = true
  -- Only show entries with exactly one match (to avoid ambiguous updates)
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
ORDER BY bm.id;

-- Step 1b: Preview - Show what will REMAIN unchanged (entries without matching users)
-- These are legacy entries that don't have user accounts - this is OK!
SELECT 
  bm.id as branch_member_id,
  bm.contact_name,
  bm.role,
  bm.branch_id,
  '⚠️ NO MATCHING USER - Will remain as-is' as status
FROM branch_members bm
WHERE 
  bm.user_id IS NULL
  AND bm.contact_name IS NOT NULL
  AND bm.role IN ('RM', 'TL')
  AND bm.is_active = true
  -- Exclude entries that have matching users (those will be updated)
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
ORDER BY bm.id;

-- Step 2: Update branch_members with user_id where match is found
UPDATE branch_members bm
SET 
  user_id = u.user_id,
  updated_at = NOW()
FROM users u
WHERE 
  bm.user_id IS NULL
  AND bm.contact_name IS NOT NULL
  AND bm.role IN ('RM', 'TL')
  AND bm.is_active = true
  AND (
    LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u.full_name)) OR 
    LOWER(TRIM(bm.contact_name)) = LOWER(TRIM(u.username))
  )
  AND u.role = CASE 
    WHEN bm.role = 'RM' THEN 'RM'
    WHEN bm.role = 'TL' THEN 'RM_TL'
    ELSE u.role
  END
  -- Only update if exactly one match is found (to avoid ambiguous updates)
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
  ) = 1;

-- Step 3: Verification - Check remaining entries without user_id
SELECT 
  bm.id,
  bm.contact_name,
  bm.role,
  bm.branch_id,
  bm.is_active
FROM branch_members bm
WHERE 
  bm.user_id IS NULL
  AND bm.contact_name IS NOT NULL
  AND bm.role IN ('RM', 'TL')
  AND bm.is_active = true
ORDER BY bm.id;

-- Expected result: Should show entries that couldn't be matched (if any)
-- These might need manual linking or the user might not exist in users table

