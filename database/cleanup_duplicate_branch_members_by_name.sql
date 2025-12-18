-- Cleanup Duplicate Branch Members by Contact Name
-- This script identifies and deactivates duplicate branch_members entries
-- that have the same contact_name (case-insensitive), branch_id, role, and are active
-- Keeps the most recent entry (or the one with user_id if available)

-- Step 1: Identify duplicates
-- This query shows all duplicate entries grouped by normalized contact_name, branch_id, and role
SELECT 
  LOWER(TRIM(contact_name)) as normalized_name,
  branch_id,
  role,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(id ORDER BY 
    CASE WHEN user_id IS NOT NULL THEN 0 ELSE 1 END, -- Prefer entries with user_id
    created_at DESC -- Then prefer most recent
  ) as member_ids
FROM branch_members
WHERE 
  is_active = true
  AND contact_name IS NOT NULL
  AND role IN ('TL', 'RM')
GROUP BY 
  LOWER(TRIM(contact_name)),
  branch_id,
  role
HAVING COUNT(*) > 1;

-- Step 2: Deactivate duplicates (keeping the first one from the sorted array)
-- This will keep the entry with user_id (if any) or the most recent one
WITH duplicates AS (
  SELECT 
    id,
    LOWER(TRIM(contact_name)) as normalized_name,
    branch_id,
    role,
    user_id,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(contact_name)), branch_id, role 
      ORDER BY 
        CASE WHEN user_id IS NOT NULL THEN 0 ELSE 1 END, -- Prefer entries with user_id
        created_at DESC -- Then prefer most recent
    ) as rn
  FROM branch_members
  WHERE 
    is_active = true
    AND contact_name IS NOT NULL
    AND role IN ('TL', 'RM')
)
UPDATE branch_members
SET 
  is_active = false,
  updated_at = NOW()
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 3: Verification - Check remaining active duplicates
SELECT 
  LOWER(TRIM(contact_name)) as normalized_name,
  branch_id,
  role,
  COUNT(*) as remaining_count
FROM branch_members
WHERE 
  is_active = true
  AND contact_name IS NOT NULL
  AND role IN ('TL', 'RM')
GROUP BY 
  LOWER(TRIM(contact_name)),
  branch_id,
  role
HAVING COUNT(*) > 1;

-- Expected result: Should return 0 rows if cleanup was successful

