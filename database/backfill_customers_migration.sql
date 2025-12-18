-- ============================================================
-- BACKFILL CUSTOMERS TABLE FROM EXISTING LEADS_MASTER DATA
-- ============================================================
-- This script migrates existing leads_master rows to populate
-- the new customers table and link customer_id in leads_master.
--
-- Run this ONCE after deploying the new scalable CRM schema.
-- It's safe to run multiple times (idempotent).
-- ============================================================

-- Step 1: Create customers from leads_master where customer_id IS NULL
-- Group by normalized phone to avoid duplicates
INSERT INTO customers (phone_number_normalized, full_name, city, created_at, updated_at)
SELECT DISTINCT ON (phone_number_normalized)
    phone_number_normalized,
    -- Use the most recent full_name for each phone
    (SELECT full_name 
     FROM leads_master lm2 
     WHERE lm2.phone_number_normalized = lm.phone_number_normalized 
       AND lm2.full_name IS NOT NULL 
       AND lm2.full_name != ''
     ORDER BY lm2.created_at DESC 
     LIMIT 1) AS full_name,
    -- Extract city from raw_customer_location if available
    NULL AS city, -- Can be enhanced later if location data is structured
    MIN(lm.created_at) AS created_at,
    MAX(lm.updated_at) AS updated_at
FROM leads_master lm
WHERE lm.phone_number_normalized IS NOT NULL
  AND lm.phone_number_normalized != ''
  AND lm.customer_id IS NULL
GROUP BY lm.phone_number_normalized
ON CONFLICT (phone_number_normalized) DO NOTHING;

-- Step 2: Update leads_master.customer_id for all rows that don't have it
UPDATE leads_master lm
SET customer_id = c.id,
    updated_at = NOW()
FROM customers c
WHERE lm.phone_number_normalized = c.phone_number_normalized
  AND lm.customer_id IS NULL
  AND lm.phone_number_normalized IS NOT NULL
  AND lm.phone_number_normalized != '';

-- Step 3: Verify migration results
-- Count how many leads now have customer_id
DO $$
DECLARE
    total_leads INTEGER;
    leads_with_customer INTEGER;
    leads_without_customer INTEGER;
    total_customers INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_leads FROM leads_master;
    SELECT COUNT(*) INTO leads_with_customer FROM leads_master WHERE customer_id IS NOT NULL;
    SELECT COUNT(*) INTO leads_without_customer FROM leads_master WHERE customer_id IS NULL AND phone_number_normalized IS NOT NULL AND phone_number_normalized != '';
    SELECT COUNT(*) INTO total_customers FROM customers;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION SUMMARY:';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total leads in leads_master: %', total_leads;
    RAISE NOTICE 'Leads with customer_id: %', leads_with_customer;
    RAISE NOTICE 'Leads without customer_id (null/empty phone): %', leads_without_customer;
    RAISE NOTICE 'Total customers created: %', total_customers;
    RAISE NOTICE '========================================';
    
    IF leads_without_customer > 0 THEN
        RAISE WARNING 'Some leads still have NULL customer_id. These likely have NULL/empty phone_number_normalized.';
    END IF;
END $$;

-- Step 4: Optional - Create index if not exists (should already exist from schema)
CREATE INDEX IF NOT EXISTS idx_leads_master_customer_id ON leads_master(customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_master_phone_normalized ON leads_master(phone_number_normalized);

-- ============================================================
-- NOTES:
-- ============================================================
-- 1. This script is idempotent - safe to run multiple times
-- 2. Leads with NULL/empty phone_number_normalized will remain
--    with customer_id = NULL (these are edge cases)
-- 3. If a lead has phone_number_normalized but no matching customer
--    was found, check the customers table for that phone
-- 4. After running this, all new leads should use the new pattern:
--    - Ensure customer exists (findOrCreateCustomerByPhone)
--    - Create lead with customer_id set
-- ============================================================

