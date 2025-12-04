## Lead Status & Assignment Model

This document describes how lead **status** and **assignment** work across the system, and how TL/CRE dashboards should *display* stages without adding many raw status values in the database.

---

### 1. Core truth in the database

We deliberately keep a **small global status set** on `leads_master.status`:

- `New` – lead has come into the system; CRE has not yet processed it.
- `Qualified` – CRE has qualified the lead (details live in `leads_qualification`).
- `Unqualified` – CRE has disqualified the lead.
- `Pending` – CRE needs to call again / follow up.
- `Lost` – final lost state if used.

Other "stages" (assignment and sales journey) are **not new status values**. They are represented by other columns:

- `leads_master.assigned_to` – which CRE the lead is assigned to.
- `leads_qualification.branch_id`, `tl_id`, `rm_id` – routing to RM/TL/Branch.
- `leads_qualification."TEST_DRIVE"`, `"BOOKED"`, `"RETAILED"` – downstream funnel flags.

This keeps queries and filters simple and avoids status explosion.

---

### 2. Assignment behaviour

There are two main ways a lead gets assigned, and **both now follow the same rule**:  
**assignment does not change the core `status`**.

#### 2.1 Auto‑assignment via rules

Implemented in `services/assignment.service.ts` → `assignLeadToUser` / `autoAssignLead`.

- Writes only to:
  - `leads_master.assigned_to`
  - `leads_master.assigned_at`
  - `leads_master.updated_at`
- Does **not** modify `leads_master.status` (it remains `New`).
- Adds a log row in `leads_logs` with `new_status = 'Assigned'` for audit only.

Result:

- Lead remains **Fresh (status = 'New')**.
- Lead is no longer **Unassigned** because `assigned_to` is set.

#### 2.2 Manual assignment from Admin (pencil / Create Test Lead)

Implemented in `frontend/Frontend/src/pages/admin/AllLeads.tsx` via `PATCH /leads/:id/status` → `updateLeadStatus`:

- When assigning from:
  - **Create Test Lead modal**, or
  - **Pencil icon in All / Fresh / Unassigned views**
- We now send:

```ts
// Create lead + assign at creation
{
  status: 'New',
  assignedTo: <CRE user_id>,
  remarks: 'Assigned at the time of manual lead creation for testing',
}

// Pencil assign for an existing lead
{
  status: currentStatus || 'New',
  assignedTo: <CRE user_id>,
  remarks: 'Assigned from All Leads admin view',
}
```

Back‑end logic (`updateLeadStatus` in `services/leads.service.ts`):

- Updates `assigned_to` and `assigned_at` when `assignedTo` is present and target user is active.
- Leaves `status` unchanged (we pass the current value).
- Ensures `IS_LOST` is `NULL` for non‑lost statuses so CRE queries work.

Result:

- Auto and manual assignment follow **one unified rule**:
  - Change *who* owns the lead.
  - Do **not** flip `status` from `New` just because TL routed it.

---

### 3. How lists interpret New vs Unassigned

Using the above model:

- **Fresh Leads (Admin / TL dashboards)**  
  - `status = 'New'` and `IS_LOST IS NULL`  
  - Can include both:
    - Unassigned new leads.
    - New leads already assigned to a CRE.

- **Unassigned Leads (Admin / TL dashboards)**  
  - `status = 'New'` **AND** `assigned_to IS NULL`  
  - Subset of Fresh Leads that nobody owns yet.

This matches business expectations:

- Fresh = “all brand‑new leads in the system now”.
- Unassigned = “which new leads are still waiting to be given to someone?”

---

### 4. Role‑based *display* stages (no extra status values)

Instead of introducing new raw status values like `CRE_ASSIGNED`, `RM_ASSIGNED`, etc., we derive **display labels** in the UI from the core data:

#### 4.1 CRE_TL view (manager)

Derived stages:

- **New**  
  - `status = 'New'` AND `assigned_to IS NULL`.

- **Assigned to CRE**  
  - `status = 'New'` AND `assigned_to IS NOT NULL`.

- **Qualified**  
  - `status = 'Qualified'` (CRE submitted qualification).

- **Assigned to RM**  
  - `status = 'Qualified'` AND `leads_qualification.rm_id IS NOT NULL`.

- **Test Drive Done / Booking Done / Retail Done**  
  - Still `status = 'Qualified'`, but using flags from `leads_qualification`:
    - `"TEST_DRIVE" = true` → show badge “Test Drive Done”.
    - `"BOOKED" = true` → show badge “Booking Done”.
    - `"RETAILED" = true` → show badge “Retail Done / Won”.

These appear as **badges/chips** in TL dashboards; the database status remains simple.

#### 4.2 CRE view

For an individual CRE:

- **New**  
  - `status = 'New'` AND `assigned_to = this CRE`.

- **Qualified / Unqualified / Pending**  
  - Directly from `status` (`'Qualified' | 'Unqualified' | 'Pending'`), plus qualification details from `leads_qualification`.

- **Won / Lost**  
  - **Won**: `leads_qualification."RETAILED" = true`.
  - **Lost**: `IS_LOST = true` or `status = 'Unqualified'` as per business rules.

The same underlying data supports both TL and CRE views, just with different labels.

---

### 5. Future UI work (not yet fully implemented)

Next steps on the frontend (CRE_TL and CRE dashboards):

- Replace direct usage of raw `status` strings with **derived labels + badges** based on the rules above.
- In TL views, visually separate:
  - New vs Assigned to CRE vs Qualified vs Assigned to RM vs Test/Booking/Retail flags.
- In CRE views, keep the workflow simpler: New → Qualified / Unqualified / Pending → Won / Lost.

This document should be the reference when adding new screens or filters involving lead status and assignment.


