# Migration Guide: Backfilling Customers & Updating Sync Handlers

## Overview

This guide explains how to migrate existing `leads_master` data to the new scalable CRM architecture that uses a separate `customers` table.

---

## Step 1: Run SQL Backfill Script

**File:** `database/backfill_customers_migration.sql`

**What it does:**
1. Creates `customers` rows from existing `leads_master` data (grouped by `phone_number_normalized`)
2. Updates `leads_master.customer_id` to link all leads to their customers
3. Reports migration statistics

**How to run:**
```sql
-- In Supabase SQL Editor or psql:
\i database/backfill_customers_migration.sql
```

**Expected output:**
- Creates one `customers` row per unique `phone_number_normalized`
- Links all existing leads to their customers via `customer_id`
- Shows summary: total leads, leads with customer_id, total customers created

**Notes:**
- Safe to run multiple times (idempotent)
- Leads with NULL/empty `phone_number_normalized` will remain with `customer_id = NULL` (edge cases)

---

## Step 2: Updated Sync Pattern

### New Pattern for All Lead Intake

**Old pattern (direct insert):**
```typescript
// ❌ OLD - Directly inserts into leads_master
await supabaseAdmin.from('leads_master').insert({
  phone_number_normalized: normalizedPhone,
  full_name: '...',
  source_id: sourceId,
  // customer_id is NULL ❌
});
```

**New pattern (ensure customer first):**
```typescript
// ✅ NEW - Ensure customer exists, then create lead
import { findOrCreateCustomerByPhone } from './customer.service';

// 1. Ensure customer exists
const { normalizedPhone, customer } = await findOrCreateCustomerByPhone({
  rawPhone: phoneFromWebhook,
  fullName: nameFromWebhook || null,
  city: locationFromWebhook || null
});

// 2. Create lead with customer_id set
await supabaseAdmin.from('leads_master').insert({
  customer_id: customer.id, // ✅ Always set
  phone_number_normalized: normalizedPhone,
  full_name: customer.full_name,
  source_id: sourceId,
  branch_id: branchId || null,
  // ... other fields
});
```

---

## Step 3: What's Been Updated

### ✅ Backend Services Updated

1. **`services/webhooks.service.ts`** - `processKnowlarityWebhook()`
   - Now uses `findOrCreateCustomerByPhone()` before creating leads
   - All new Knowlarity webhook leads will have `customer_id` set

### ⚠️ Python Scripts Need Manual Updates

The following Python scripts still use the old pattern and need to be updated:

1. **`knowlarity_sync.py`**
   - **Location:** Line ~606 (insert into leads_master)
   - **Change needed:** Before inserting, ensure customer exists and set `customer_id`

2. **`meta_sync.py`**
   - **Location:** Line ~605 (insert into leads_master)
   - **Change needed:** Before inserting, ensure customer exists and set `customer_id`

**Python Pattern to Follow:**
```python
# 1. Normalize phone
normalized_phone = normalize_phone(raw_phone)

# 2. Ensure customer exists (upsert pattern)
customer_resp = supabase.table("customers").upsert({
    "phone_number_normalized": normalized_phone,
    "full_name": name or None,
    "city": city or None
}, on_conflict="phone_number_normalized").select("id").execute()

customer_id = customer_resp.data[0]["id"]

# 3. Create lead with customer_id
supabase.table("leads_master").insert({
    "customer_id": customer_id,  # ✅ Always set
    "phone_number_normalized": normalized_phone,
    "full_name": name or None,
    "source_id": source_id,
    # ... other fields
}).execute()
```

---

## Step 4: Verification

After migration and updates:

1. **Check customers table:**
   ```sql
   SELECT COUNT(*) FROM customers;
   -- Should match number of unique phone numbers in leads_master
   ```

2. **Check leads_master linkage:**
   ```sql
   SELECT 
     COUNT(*) as total_leads,
     COUNT(customer_id) as leads_with_customer,
     COUNT(*) - COUNT(customer_id) as leads_without_customer
   FROM leads_master;
   -- leads_without_customer should be 0 (or very small for edge cases)
   ```

3. **Test new webhook:**
   - Send a test Knowlarity webhook
   - Verify:
     - New `customers` row created (if new phone)
     - New `leads_master` row with `customer_id` set
     - No duplicate customers for same phone

---

## Benefits of New Pattern

1. **Single source of truth:** One `customers` row per phone number
2. **Better analytics:** Can track customer journey across branches/sources
3. **Scalable:** Easy to add new roles (Finance, Service, etc.) that reference customers
4. **Data integrity:** Foreign key constraints ensure leads always link to customers

---

## Rollback Plan

If you need to rollback:

1. **Don't delete `customers` table** - it's now part of the schema
2. **Old leads still work** - they just won't have `customer_id` set (backward compatible)
3. **New leads will fail** if `customer_id` is required - but we made it nullable for migration period

---

## Questions?

- Check `RECEPTIONIST_RM_WORKFLOW.md` for the full workflow design
- Check `database/scalable_crm_schema.sql` for the new schema
- Check `services/customer.service.ts` for customer management functions

