# Migration Summary: Customers Table & Sync Handler Updates

## ✅ Completed

### 1. SQL Backfill Script
**File:** `database/backfill_customers_migration.sql`

- Creates `customers` rows from existing `leads_master` data
- Links all existing leads to customers via `customer_id`
- Idempotent (safe to run multiple times)
- Includes verification queries

**Next step:** Run this script in Supabase SQL Editor to migrate existing data.

---

### 2. Updated Knowlarity Webhook Handler
**File:** `services/webhooks.service.ts` - `processKnowlarityWebhook()`

**Changes:**
- ✅ Now uses `findOrCreateCustomerByPhone()` from `customer.service.ts`
- ✅ All new Knowlarity webhook leads will have `customer_id` set
- ✅ Follows the new scalable CRM pattern

**What this means:**
- All **new** Knowlarity webhooks will automatically:
  1. Ensure customer exists in `customers` table
  2. Create lead with `customer_id` linked
  3. Maintain backward compatibility with existing deduplication logic

---

### 3. Updated Phone Search Logic
**File:** `services/walkins.service.ts` - `findCustomerWithLeadsByPhone()`

**Changes:**
- ✅ Now searches `leads_master` by `phone_number_normalized` even when no `customers` row exists
- ✅ This fixes the issue where Receptionist couldn't see existing leads for phones without a `customers` row

**What this means:**
- Receptionist can now see **all** existing leads for a phone number, even legacy ones
- After running the backfill script, all leads will also be linked to customers

---

## ⚠️ Pending (Manual Updates Needed)

### Python Sync Scripts

The following Python scripts still use the old pattern (direct insert into `leads_master` without `customer_id`):

1. **`knowlarity_sync.py`** (Line ~606)
2. **`meta_sync.py`** (Line ~605)

**Why they need updates:**
- These scripts run periodically to sync external leads
- They currently insert directly into `leads_master` without ensuring customers exist
- After migration, new leads from these scripts won't have `customer_id` set

**Solution:**
- See `database/MIGRATION_GUIDE.md` for the Python pattern to follow
- Update both scripts to:
  1. Ensure customer exists (upsert into `customers` table)
  2. Set `customer_id` when inserting into `leads_master`

**Note:** These scripts are backup sync methods. The primary method (webhooks) is already updated.

---

## 📋 Next Steps

### Immediate (Before Production)

1. **Run SQL backfill script:**
   ```sql
   -- In Supabase SQL Editor
   \i database/backfill_customers_migration.sql
   ```

2. **Verify migration:**
   ```sql
   -- Check that all leads have customer_id
   SELECT 
     COUNT(*) as total,
     COUNT(customer_id) as with_customer,
     COUNT(*) - COUNT(customer_id) as without_customer
   FROM leads_master;
   ```

3. **Test Knowlarity webhook:**
   - Send a test webhook
   - Verify new lead has `customer_id` set
   - Verify customer row exists in `customers` table

### Short-term (This Week)

4. **Update Python scripts:**
   - Follow pattern in `MIGRATION_GUIDE.md`
   - Test `knowlarity_sync.py` manually
   - Test `meta_sync.py` manually

### Long-term (Optional)

5. **Add constraints:**
   - Once all leads have `customer_id`, consider making it `NOT NULL`
   - Add foreign key constraint if not already present

6. **Cleanup:**
   - Archive or mark test/junk leads
   - Review leads with NULL `phone_number_normalized` (edge cases)

---

## 🎯 Benefits Achieved

1. **Single source of truth:** One `customers` row per phone number
2. **Better search:** Receptionist can find all leads for a customer across branches
3. **Scalable architecture:** Ready for new roles (Finance, Service, etc.)
4. **Data integrity:** All new leads properly linked to customers

---

## 📚 Related Files

- `database/backfill_customers_migration.sql` - SQL migration script
- `database/MIGRATION_GUIDE.md` - Detailed migration guide
- `database/scalable_crm_schema.sql` - New schema definition
- `services/customer.service.ts` - Customer management functions
- `services/webhooks.service.ts` - Updated webhook handler
- `services/walkins.service.ts` - Updated phone search logic
- `RECEPTIONIST_RM_WORKFLOW.md` - Full workflow design

---

## ❓ Questions?

- **Q: What if I run the backfill script twice?**  
  A: It's idempotent - safe to run multiple times. It will skip existing customers.

- **Q: What about leads with NULL phone_number_normalized?**  
  A: They will remain with `customer_id = NULL`. These are edge cases that can be handled manually.

- **Q: Do I need to update Python scripts immediately?**  
  A: Not critical if webhooks are your primary sync method. But update them before the next scheduled sync to avoid creating leads without `customer_id`.

- **Q: Can I rollback?**  
  A: Yes - the `customer_id` column is nullable, so old leads still work. Just don't delete the `customers` table.

