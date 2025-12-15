## Phase 2 – Receptionist Walk-in Backend (Implemented)

### 1. What Was Implemented

- **New core services**
  - `services/customer.service.ts`
    - `normalizePhone(phone)` – shared helper to strip non-digits.
    - `findCustomerByPhone(rawPhone)` – find customer by normalized phone.
    - `findOrCreateCustomerByPhone({ rawPhone, fullName, email, city })` – returns `{ normalizedPhone, customer }`.
  - `services/walkins.service.ts`
    - `findCustomerWithLeadsByPhone(phone)` – returns customer + all leads across branches.
    - `createOrAttachWalkInLead(user, payload)` – main business logic:
      - Ensures `customers` record exists.
      - Checks for existing **open lead** for `(customer_id, branch_id)`.
      - If open lead exists → logs `walk_in_again` in `leads_logs` and returns existing lead.
      - If not → creates new row in `leads_master` and initial `leads_logs` entry `walk_in_created`.
      - Optionally inserts a minimal `leads_qualification` row with `branch_id` and `rm_id` when `rmMemberId` is provided.

- **New controllers**
  - `controllers/walkins.controller.ts`
    - `getCustomerByPhoneController` → `GET /customers/by-phone`
    - `createWalkInLeadController` → `POST /walkins/create`

- **New routes**
  - `routes/walkins.routes.ts`
    - All routes wrapped with `authorize(['Receptionist', 'Admin', 'CRE_TL', 'Developer'])`.
    - Registered paths:
      - `GET /customers/by-phone`
      - `POST /walkins/create`
  - `server.ts`
    - Registered `walkinsRoutes` with Fastify.

- **Existing tables used**
  - `customers` – new master identity per person (phone-based).
  - `leads_master` – one lead per `(customer, branch)` (open vs closed logic).
  - `leads_qualification` – optional RM mapping (`rm_id`, `branch_id`).
  - `leads_logs` – activity timeline (walk-in created / revisit).
  - `sources` – resolve default **Walk-in** source when `sourceId` is not passed.

---

### 2. Endpoints & JSON Contracts

#### 2.1 `GET /customers/by-phone`

- **Purpose:** Receptionist quickly checks if the phone number already exists and what leads exist for this customer.
- **Auth:** `Receptionist`, `Admin`, `CRE_TL`, `Developer`.

**Query params:**

```text
phone: string (raw phone – can contain spaces, +91, etc.)
```

**Sample request (cURL):**

```bash
curl -X GET \
  "$API_BASE_URL/customers/by-phone?phone=+91-9876543210" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

**Sample response (customer exists with leads):**

```json
{
  "normalizedPhone": "9876543210",
  "customer": {
    "id": 101,
    "phone_number_normalized": "9876543210",
    "full_name": "Rajesh Kumar",
    "email": "rajesh@example.com",
    "city": "Bangalore",
    "created_at": "2025-01-01T10:00:00.000Z",
    "updated_at": "2025-01-01T10:00:00.000Z"
  },
  "leads": [
    {
      "id": 501,
      "full_name": "Rajesh Kumar",
      "phone_number_normalized": "9876543210",
      "status": "fresh",
      "is_qualified": false,
      "IS_LOST": null,
      "created_at": "2025-01-05T09:15:00.000Z",
      "updated_at": "2025-01-05T09:15:00.000Z",
      "branch_id": 1,
      "assigned_to": null,
      "source_id": 3
    }
  ]
}
```

**Sample response (no customer yet):**

```json
{
  "normalizedPhone": "9876543210",
  "customer": null,
  "leads": []
}
```

---

#### 2.2 `POST /walkins/create`

- **Purpose:** Called by Receptionist when a walk-in arrives.
- **Behavior:**
  - **If no customer exists** → create `customers` row + new lead.
  - **If customer exists and no open lead in this branch** → create new lead for `(customer, branch)`.
  - **If open lead already exists for this (customer, branch)** → do **not** create a duplicate; just log `walk_in_again` on the existing lead.
- **Auth:** `Receptionist`, `Admin`, `CRE_TL`, `Developer`.

**Request body:**

```json
{
  "phone": "+91 9876543210",
  "fullName": "Rajesh Kumar",
  "branchId": 1,
  "rmMemberId": 12,         // optional: branch_members.id of the RM
  "sourceId": 3,            // optional: if omitted, backend tries to auto-detect 'Walk-in'
  "model": "Hector",
  "variant": "Sharp DCT",
  "location": "Bangalore",
  "remarks": "Walk-in from mall event"
}
```

**Sample response – new lead created:**

```json
{
  "created": true,
  "action": "created_new_lead",
  "customer": {
    "id": 101,
    "phone_number_normalized": "9876543210",
    "full_name": "Rajesh Kumar",
    "email": null,
    "city": "Bangalore",
    "created_at": "2025-01-05T09:15:00.000Z",
    "updated_at": "2025-01-05T09:15:00.000Z"
  },
  "lead": {
    "id": 550,
    "full_name": "Rajesh Kumar",
    "phone_number_normalized": "9876543210",
    "status": "fresh",
    "is_qualified": false,
    "IS_LOST": null,
    "Lead_Remarks": "Walk-in from mall event",
    "customer_id": 101,
    "branch_id": 1,
    "source_id": 3,
    "created_at": "2025-01-05T09:15:00.000Z",
    "updated_at": "2025-01-05T09:15:00.000Z"
  }
}
```

**Sample response – attached to existing open lead:**

```json
{
  "created": false,
  "action": "attached_to_existing",
  "customer": {
    "id": 101,
    "phone_number_normalized": "9876543210",
    "full_name": "Rajesh Kumar",
    "email": null,
    "city": "Bangalore",
    "created_at": "2025-01-01T10:00:00.000Z",
    "updated_at": "2025-01-05T09:15:00.000Z"
  },
  "lead": {
    "id": 501,
    "full_name": "Rajesh Kumar",
    "phone_number_normalized": "9876543210",
    "status": "fresh",
    "is_qualified": false,
    "IS_LOST": null,
    "created_at": "2025-01-02T11:00:00.000Z",
    "updated_at": "2025-01-05T09:15:00.000Z",
    "branch_id": 1,
    "assigned_to": null,
    "source_id": 3
  }
}
```

---

### 3. How It Logs Activity

- Table: `leads_logs`
- When **new lead is created**:

```json
{
  "lead_id": 550,
  "old_status": null,
  "new_status": "fresh",
  "remarks": "Walk-in lead created",
  "created_by": 999,
  "metadata": {
    "event": "walk_in_created",
    "source": "Walk-in",
    "model": "Hector",
    "variant": "Sharp DCT",
    "location": "Bangalore",
    "created_by_user_id": 999,
    "created_by_role": "Receptionist"
  }
}
```

- When **existing open lead is reused**:

```json
{
  "lead_id": 501,
  "old_status": "fresh",
  "new_status": "fresh",
  "remarks": "Walk-in visit (existing lead)",
  "created_by": 999,
  "metadata": {
    "event": "walk_in_again",
    "source": "Walk-in",
    "model": "Hector",
    "variant": "Sharp DCT",
    "location": "Bangalore",
    "created_by_user_id": 999,
    "created_by_role": "Receptionist"
  }
}
```

---

### 4. Testing Scenarios (Postman / cURL)

Assume:
- `API_BASE_URL = https://your-backend-url`
- You have a valid `ACCESS_TOKEN` for a **Receptionist** (or Admin/CRE_TL/Developer).

#### 4.1 New Customer, New Branch (Case 1)

1. **Check customer**
   - `GET /customers/by-phone?phone=9876543210`
   - Expect: `customer: null`, `leads: []`.
2. **Create walk-in lead**

```bash
curl -X POST "$API_BASE_URL/walkins/create" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "9876543210",
    "fullName": "Rajesh Kumar",
    "branchId": 1,
    "rmMemberId": 12,
    "model": "Hector",
    "variant": "Sharp DCT",
    "location": "Bangalore",
    "remarks": "First visit - walk-in"
  }'
```

- Expect: `created: true`, `action: "created_new_lead"`.

#### 4.2 Existing Customer, Same Branch (Case 3)

1. Repeat the **same `POST /walkins/create`** with same phone + branch.
2. Expect:
   - `created: false`
   - `action: "attached_to_existing"`
   - Same `lead.id` as previous.
3. Verify:
   - `leads_logs` has a new entry with `metadata.event = "walk_in_again"` for that lead.

#### 4.3 Existing Customer, Different Branch (Case 2)

1. Use `branchId = 2` in the POST body (different from previous).
2. Expect:
   - A **new lead** is created for `(same customer, branch 2)`.
   - Response `created: true` and a different `lead.id`.
3. Check `GET /customers/by-phone`:
   - Same `customer.id`,
   - `leads` array with **two different leads** (branch 1 and branch 2).

#### 4.4 Invalid Phone

1. Call `POST /walkins/create` with phone `"123"` or non-numeric junk.
2. Expect:
   - HTTP 400 with message `"Invalid phone number - must contain at least 10 digits"` or validation error.

#### 4.5 Unauthorized Role

1. Use a token for a user who is **not** `Receptionist`, `Admin`, `CRE_TL`, or `Developer`.
2. Call either endpoint.
3. Expect:
   - HTTP 403 `"Forbidden"`.

---

### 5. What’s Next (Frontend & Mapping)

- Build **Receptionist UI** that uses:
  - `GET /customers/by-phone` for phone search.
  - `POST /walkins/create` to create/attach leads.
- Decide exact **branch ↔ receptionist mapping**:
  - Either via `branch_members` (with `role = 'Receptionist'`) or via `users.role` + separate mapping.
- Integrate **RM selection**:
  - UI will pass `rmMemberId` (branch_members.id) when assigning to a specific RM.


