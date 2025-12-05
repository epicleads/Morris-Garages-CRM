# CRE Manual Lead Creation - Approach & Implementation Plan

## Overview
Allow CREs to manually add leads they receive via phone calls, walk-ins, or other direct interactions. The lead can be immediately marked as Qualified, Disqualified, or Pending with all relevant details.

---

## 1. User Flow

### Step 1: CRE Clicks "Add Lead" Button
- Location: CRE Dashboard (prominent button, maybe in header or filter bar)
- Action: Opens modal/drawer for lead creation

### Step 2: Enter Customer Details (Mandatory for ALL outcomes)
- **Customer Name** (required)
- **Phone Number** (required, normalized)
- **Alternate Phone** (optional) // no need of this field
- **Source**: Auto-set to "CRE Manual Entry" (hidden field) (frop down - and also subsource required)
- **External Lead ID**: Optional (if they have a reference number) -  no need of this

### Step 3: Choose Outcome
- **Qualified** → Show qualification form
- **Disqualified** → Show disqualified form
- **Pending** → Show pending form

### Step 4: Outcome-Specific Details

#### If Qualified:
- All fields from current qualification form:
  - Qualified for (Showroom Visit / Test Drive / Booking)
  - Model Interested
  - Variant
  - Profession
  - Customer Location
  - Purchase Timeline
  - Finance Options
  - Trade-in details (if Yes)
  - Lead Category (Hot/Warm/Cold/Future Prospect)
  - Remarks (required)
  - Next Follow-up Date (required)

#### If Disqualified:
- Disqualified Reason (dropdown, same as current)
- Remarks (required)

#### If Pending:
- Pending Reason (dropdown, same as current)
- Next Follow-up Date (required)
- Remarks (required)

### Step 5: Save
- Creates lead in database
- Auto-assigns to current CRE
- Creates appropriate logs/history
- Shows success message

---

## 2. Database & Status Handling

### 2.1 Source Creation
**Need to ensure "CRE Manual Entry" source exists:**
- `display_name`: "CRE Manual Entry" // this will be source 
- `source_type`: "cre_manual" or "manual_entry" // ths will be subsource she will enter 
- Auto-created if doesn't exist (similar to Knowlarity source)

### 2.2 Lead Creation in `leads_master`
```sql
{
  full_name: string (required)
  phone_number_normalized: string (required, normalized to 10 digits)
  alternate_phone_number: string | null (optional)
  source_id: bigint (CRE Manual Entry source)
  external_lead_id: string | null (optional)
  assigned_to: bigint (current CRE's user_id) -- AUTO-ASSIGNED
  assigned_at: timestamp (now)
  status: 'New' | 'Qualified' | 'Unqualified' | 'Pending' (based on outcome)
  next_followup_at: timestamp | null (if Pending or Qualified)
  total_attempts: 0 (new lead)
  is_qualified: boolean (true if Qualified, false otherwise)
  IS_LOST: boolean | null (true if Disqualified, null otherwise)
  raw_payload: jsonb | null (can store form data)
  created_at: timestamp (now)
  updated_at: timestamp (now)
}
```

### 2.3 Status Logic

#### If Qualified:
- `status = 'Qualified'`
- `is_qualified = true`
- `assigned_to = current CRE user_id`
- `assigned_at = now()`
- Create `leads_qualification` record with all qualification details
- `next_followup_at` = from form

#### If Disqualified:
- `status = 'Unqualified'` (or 'Disqualified' if that's the standard)
- `is_qualified = false`
- `IS_LOST = true`
- `assigned_to = current CRE user_id`
- `assigned_at = now()`
- No qualification record

#### If Pending:
- `status = 'Pending'`
- `is_qualified = false`
- `assigned_to = current CRE user_id`
- `assigned_at = now()`
- `next_followup_at` = from form
- No qualification record

---

## 3. History & Logging

### 3.1 Lead Log Entry (`leads_logs`)
For ALL outcomes, create log entry:
```sql
{
  lead_id: bigint (newly created lead)
  created_by: bigint (current CRE user_id)
  old_status: null (new lead)
  new_status: 'Qualified' | 'Unqualified' | 'Pending'
  remarks: string (from form or auto-generated)
  action_type: 'CRE_MANUAL_CREATE' or 'CRE_MANUAL_CREATE_QUALIFIED' etc.
  created_at: timestamp (now)
}
```

**Remarks examples:**
- Qualified: "Lead created and qualified manually by CRE {name}"
- Disqualified: "Lead created and disqualified manually by CRE {name}. Reason: {reason}"
- Pending: "Lead created manually by CRE {name}. Pending reason: {reason}"

### 3.2 Timeline Display
When viewing lead history, show:
1. **"Lead created manually by CRE {name}"** (first entry)
2. **"Qualified"** (if Qualified) with qualification details
3. **"Disqualified: {reason}"** (if Disqualified)
4. **"Marked as Pending: {reason}. Follow-up: {date}"** (if Pending)

---

## 4. CRE_TL Visibility

### 4.1 Qualified Leads
- **Should appear in CRE_TL's "Qualified Leads Review"** tab
- Same as leads qualified through normal flow
- CRE_TL can review, assign to Branch/TL/RM, etc.
- Status: `status = 'Qualified'` + `leads_qualification` record exists

### 4.2 Disqualified Leads
- **Appear in CRE_TL's "All Leads" view**
- Filter: `status = 'Unqualified'` or `IS_LOST = true`
- Can see reason and remarks
- No action needed (already disqualified)

### 4.3 Pending Leads
- **Appear in CRE_TL's "All Leads" view**
- Filter: `status = 'Pending'`
- Can see follow-up date and reason
- Can reassign if needed
- Will appear in CRE's "Today's Follow-ups" when date arrives

---

## 5. Backend Implementation

### 5.1 New Endpoint: `POST /cre/leads/manual`

**Request Body:**
```typescript
{
  // Customer details (required for all)
  full_name: string
  phone_number: string
  alternate_phone_number?: string
  external_lead_id?: string
  
  // Outcome selection
  outcome: 'qualified' | 'disqualified' | 'pending'
  
  // Qualified details (if outcome = 'qualified')
  qualification?: {
    qualified_category: string
    model_interested: string
    variant: string
    profession?: string
    customer_location?: string
    purchase_timeline?: string
    finance_type?: string
    trade_in?: {
      has_trade_in: boolean
      make?: string
      model?: string
      year?: number
      km_driven?: string
      ownership_no?: string
    }
    lead_category: string
    remarks: string
    next_followup_at: string (ISO datetime)
  }
  
  // Disqualified details (if outcome = 'disqualified')
  disqualified?: {
    reason: string
    remarks: string
  }
  
  // Pending details (if outcome = 'pending')
  pending?: {
    reason: string
    next_followup_at: string (ISO datetime)
    remarks: string
  }
}
```

**Response:**
```typescript
{
  success: true
  lead: {
    id: number
    full_name: string
    phone_number_normalized: string
    status: string
    assigned_to: number
    // ... other lead fields
  }
  qualification?: { ... } // if qualified
  message: string
}
```

### 5.2 Service Function: `createManualLead(userId, data)`

**Steps:**
1. Ensure "CRE Manual Entry" source exists (create if not)
2. Normalize phone number (last 10 digits)
3. Check for duplicate phone (if exists, return error or link to existing)
4. Create lead in `leads_master`:
   - Set `assigned_to = userId` (current CRE)
   - Set `assigned_at = now()`
   - Set `status` based on outcome
   - Set `IS_LOST` if disqualified
5. If Qualified: Create `leads_qualification` record
6. Create log entry in `leads_logs`
7. Return created lead

### 5.3 Validation
- Phone number must be valid (10 digits after normalization)
- If duplicate phone exists, ask user: "Lead with this phone already exists. Link to existing lead?"
- Required fields based on outcome
- Next follow-up date must be in future (for Pending/Qualified)

---

## 6. Frontend Implementation

### 6.1 UI Component: `CreateLeadModal.tsx`

**Structure:**
```
┌─────────────────────────────────────┐
│ Create New Lead              [X]    │
├─────────────────────────────────────┤
│                                     │
│ Customer Details (Always Visible)   │
│ ┌─────────────────────────────┐   │
│ │ Name *                       │   │
│ │ Phone Number *               │   │
│ │ Alternate Phone              │   │
│ │ External ID (optional)        │   │
│ └─────────────────────────────┘   │
│                                     │
│ Select Outcome                      │
│ ○ Qualified  ○ Disqualified  ○ Pending │
│                                     │
│ [Conditional Form Based on Outcome] │
│                                     │
│ [Cancel]  [Save Lead]               │
└─────────────────────────────────────┘
```

### 6.2 Form States

**State 1: Customer Details + Outcome Selection**
- Show customer form
- Show radio buttons for outcome
- Disable "Save" until customer details filled

**State 2: Outcome-Specific Form**
- Show customer details (read-only or editable)
- Show outcome-specific form (Qualified/Disqualified/Pending)
- Enable "Save" when all required fields filled

### 6.3 Integration Points
- Reuse `UpdateLeadModal` components for Qualified/Disqualified/Pending forms
- Use same validation schemas
- Use same dropdown options (reasons, models, etc.)

---

## 7. Edge Cases & Considerations

### 7.1 Duplicate Phone Numbers
**Option A: Prevent creation**
- Check if phone exists
- Show error: "Lead with this phone already exists"
- Link to existing lead

**Option B: Allow but warn**
- Check if phone exists
- Show warning: "Lead with this phone exists. Continue anyway?"
- Create new lead (different source)

**Recommendation: Option A** - Prevent duplicates, show existing lead

### 7.2 Phone Number Normalization
- Extract last 10 digits
- Remove country codes, spaces, dashes
- Store in `phone_number_normalized`
- Display original format in UI

### 7.3 Source Management
- Auto-create "CRE Manual Entry" source if doesn't exist
- Similar to how Knowlarity source is auto-created
- Use `ensure_source_row()` pattern

### 7.4 Assignment
- **Always auto-assign to current CRE** (the one creating the lead)
- No need for assignment rules (manual entry = direct assignment)
- `assigned_at = now()`

### 7.5 Status Consistency
- Follow existing status model (see `LEAD_STATUS_MODEL.md`)
- Qualified → `status = 'Qualified'`
- Disqualified → `status = 'Unqualified'` + `IS_LOST = true`
- Pending → `status = 'Pending'`

---

## 8. Implementation Checklist

### Backend
- [ ] Create `POST /cre/leads/manual` endpoint
- [ ] Implement `createManualLead` service function
- [ ] Ensure "CRE Manual Entry" source exists (auto-create)
- [ ] Handle duplicate phone numbers
- [ ] Create lead in `leads_master`
- [ ] Create `leads_qualification` if Qualified
- [ ] Create log entry in `leads_logs`
- [ ] Add validation (Zod schemas)
- [ ] Test all three outcomes

### Frontend
- [ ] Create `CreateLeadModal` component
- [ ] Add "Add Lead" button to CRE Dashboard
- [ ] Implement customer details form
- [ ] Implement outcome selection (radio buttons)
- [ ] Reuse qualification form from `UpdateLeadModal`
- [ ] Reuse disqualified form from `UpdateLeadModal`
- [ ] Reuse pending form from `UpdateLeadModal`
- [ ] Handle duplicate phone error
- [ ] Show success message
- [ ] Refresh lead list after creation

### Testing
- [ ] Test Qualified flow
- [ ] Test Disqualified flow
- [ ] Test Pending flow
- [ ] Test duplicate phone handling
- [ ] Test CRE_TL visibility (Qualified leads appear in review)
- [ ] Test history/timeline display
- [ ] Test phone normalization

---

## 9. Questions to Confirm

1. **Duplicate Handling**: Should we prevent duplicate phones or allow with warning?
2. **External Lead ID**: Is this needed? What format?
3. **Alternate Phone**: Should this also be checked for duplicates?
4. **Source Name**: "CRE Manual Entry" or "Manual Entry" or "Direct Entry"?
5. **Qualified Leads**: Should they immediately appear in CRE_TL's review, or wait for some approval?
6. **Phone Format**: Should we allow international format or only Indian numbers?

---

## 10. Next Steps

1. **Review this document** and confirm approach
2. **Answer questions** in section 9
3. **Start with backend** (endpoint + service)
4. **Then frontend** (modal + forms)
5. **Test thoroughly** before deploying

---

## Summary

This feature allows CREs to quickly add leads they receive directly, with immediate qualification/disqualification/pending status. The lead is auto-assigned to the CRE, and qualified leads appear in CRE_TL's review queue for branch assignment. All existing workflows (qualification, pending, disqualified) remain the same, just with a different entry point.

