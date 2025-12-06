# Duplicate Lead Handling - Implementation Guide

## Overview
When a CRE tries to manually add a lead that already exists in the system, the behavior depends on the outcome they select.

---

## Business Rules

### Scenario: CRE B tries to add a lead that already exists (assigned to CRE A)

#### Case 1: CRE B selects "Disqualified" or "Pending"
- **Action:** ❌ **BLOCK** the creation
- **Error Message:** `"This lead is already assigned to [CRE A's name]. You cannot create a duplicate lead."`
- **Result:** Lead remains with CRE A, no changes made

#### Case 2: CRE B selects "Qualified"
- **Action:** ✅ **ALLOW** and **TRANSFER**
- **Process:**
  1. Transfer lead from CRE A to CRE B
  2. Update lead status to "Qualified"
  3. Create/Update qualification record with CRE B's details
  4. Log the transfer in `leads_logs`
- **Result:** 
  - Lead is removed from CRE A's list
  - Lead appears in CRE B's qualified leads
  - Success message: `"Lead transferred from [CRE A] and qualified successfully"`

---

## Technical Implementation

### Backend (`cre.service.ts`)

**Key Logic:**
1. Check for duplicate phone number
2. If duplicate exists:
   - Fetch existing lead with assigned CRE info
   - Extract CRE name from `assigned_user` relation
   - Based on outcome:
     - **Disqualified/Pending:** Throw error with CRE name
     - **Qualified:** Transfer, update, and qualify

**Transfer Process (Qualified):**
1. Update `leads_master`:
   - `assigned_to` → CRE B's user_id
   - `assigned_at` → Current timestamp
   - `status` → 'Qualified'
   - `is_qualified` → true
   - `IS_LOST` → null
   - Update other fields from qualification form

2. Handle Qualification Record:
   - If qualification exists → Update it
   - If no qualification → Create new one
   - Set `qualified_by` → CRE B's user_id

3. Create Transfer Log:
   - `old_status` → Previous status
   - `new_status` → 'Qualified'
   - `remarks` → Transfer message with CRE names
   - `metadata` → Includes transfer details

### Frontend (`CreateLeadModal.tsx` + `useLeads.ts`)

**Error Handling:**
- Shows error toast with CRE name when blocked
- Shows success toast with transfer message when transferred

**Success Message:**
- If transferred: `"Lead transferred from [CRE A] and qualified successfully"`
- If new: `"Lead created successfully!"`

---

## Edge Cases Handled

1. ✅ **Existing lead is "New" or "Assigned"** → Same behavior (transfer if qualified)
2. ✅ **Existing lead is already "Qualified"** → Still transfer to CRE B
3. ✅ **Existing lead is "Disqualified" or "Lost"** → Still allow CRE B to qualify it
4. ✅ **Existing lead is "Pending"** → Block if CRE B selects pending/disqualified, transfer if qualified
5. ✅ **Lead is unassigned** → Shows "Unassigned" in error message
6. ✅ **Qualification already exists** → Updates existing qualification instead of creating duplicate

---

## Database Changes

**No schema changes required** - Uses existing tables:
- `leads_master` - Updated for transfer
- `leads_qualification` - Created/Updated
- `leads_logs` - Transfer log entry

---

## Logging

**Transfer Log Entry:**
```json
{
  "lead_id": 123,
  "old_status": "Pending",
  "new_status": "Qualified",
  "remarks": "Lead transferred from CRE A and qualified by CRE. [remarks]",
  "created_by": CRE_B_user_id,
  "metadata": {
    "action": "lead_transfer_and_qualify",
    "previous_assigned_to": CRE_A_user_id,
    "new_assigned_to": CRE_B_user_id,
    "previous_cre": "CRE A Name",
    "outcome": "qualified",
    "source": "Source Name",
    "sub_source": "Sub Source"
  }
}
```

---

## Testing Scenarios

### Test 1: Block Duplicate (Disqualified)
1. CRE A has lead in "Pending"
2. CRE B tries to add same lead as "Disqualified"
3. **Expected:** Error message showing CRE A's name

### Test 2: Block Duplicate (Pending)
1. CRE A has lead in "New"
2. CRE B tries to add same lead as "Pending"
3. **Expected:** Error message showing CRE A's name

### Test 3: Transfer and Qualify
1. CRE A has lead in "Pending"
2. CRE B adds same lead as "Qualified"
3. **Expected:** 
   - Lead transferred to CRE B
   - Lead qualified
   - Removed from CRE A's pending list
   - Appears in CRE B's qualified list

### Test 4: Transfer Already Qualified Lead
1. CRE A has lead already "Qualified"
2. CRE B adds same lead as "Qualified"
3. **Expected:** Lead transferred to CRE B, qualification updated

### Test 5: Transfer Disqualified Lead
1. CRE A has lead in "Disqualified"
2. CRE B adds same lead as "Qualified"
3. **Expected:** Lead transferred to CRE B and qualified

---

## User Experience

### Error Message (Blocked):
```
"This lead is already assigned to [CRE Name]. You cannot create a duplicate lead."
```

### Success Message (Transferred):
```
"Lead transferred from [CRE Name] and qualified successfully"
```

---

## Files Modified

1. **Backend:**
   - `Morris-Garages-CRM/services/cre.service.ts` - Updated `createManualLead` function

2. **Frontend:**
   - `EPICMG/frontend/Frontend/src/hooks/useLeads.ts` - Updated success/error handling

---

## Status

✅ **Implementation Complete**

All scenarios tested and working:
- Block duplicate for Disqualified/Pending ✅
- Transfer and qualify for Qualified ✅
- Handle all lead statuses ✅
- Proper logging ✅
- User-friendly error messages ✅

