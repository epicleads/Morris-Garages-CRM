# 🧪 Testing Guide — Multi-CRE Pending/Disqualified/Lost/Qualified Scenariosgit

Complete walkthrough for onboarding a new tester: two CREs, two leads, realistic status flows, and verification steps (attempt counts, remarks, IS_LOST, timeline).

---

## Prerequisites
1. Backend running (`npm run dev`)
2. Database seeded (`setup_test_users.sql`, `SETUP_SOURCES.md`)
3. Postman environment set (base_url **`http://localhost:5000`**, tokens, etc.)
4. Users available:
   - CRE_TL: `cre_tl_test`
   - CRE #1: `cre1_test`
   - CRE #2: `cre2_test`
5. Tokens already generated (see `TESTING_LEADS_CRUD.md` Step 1)
6. All requests use `Content-Type: application/json`

---

## Overview Flow
1. CRE_TL creates two leads (Lead A, Lead B)
2. Assign Lead A → CRE1, Lead B → CRE2
3. CRE1 handles Pending → Pending → Qualified
4. CRE2 handles multiple pendings → Disqualified → Reopen → Lost
5. After each stage, validate DB, timeline, attempts, remarks

---

## Step 1 — Lead Creation (CRE_TL)

### Lead A (for CRE1)
```
POST http://localhost:5000/leads
Authorization: Bearer {{cre_tl_access_token}}
{
  "fullName": "Lead A - CRE1",
  "phoneNumber": "9000000001",
  "sourceId": 1
}
```
➡️ Save `leadA_id`.

### Lead B (for CRE2)
```
POST http://localhost:5000/leads
Authorization: Bearer {{cre_tl_access_token}}
{
  "fullName": "Lead B - CRE2",
  "phoneNumber": "9000000002",
  "sourceId": 1
}
```
➡️ Save `leadB_id`.

---

## Step 2 — Assign Leads (if auto assignment not active)
```
PATCH http://localhost:5000/leads/{{leadA_id}}/status
Authorization: Bearer {{cre_tl_access_token}}
{
  "status": "Assigned",
  "remarks": "Assigned to CRE1",
  "assignedTo": {{cre1_user_id}}
}
```
Repeat for `leadB_id` with `cre2_user_id`. Confirm via `GET /leads/{{id}}`.

---

## Scenario A — CRE1 (Pending → Pending → Qualified)
Token: `{{cre1_access_token}}`

### Steps
1. Lead A, attempt #1 → Pending (RNR)
2. Lead A, attempt #2 → Pending (Callback)
3. Lead A, attempt #3 → Qualify

### Request 1 (Pending #1)
```
PATCH http://localhost:5000/leads/{{leadA_id}}/status
Authorization: Bearer {{cre_access_token}}
Content-Type: application/json

{
  "status": "Pending",
  "remarks": "Call attempt #1 - RNR",
  "nextFollowupAt": "2024-01-25T10:00:00Z",
  "pendingReason": "RNR"
}
```

### Request 2 (Pending #2)
```
PATCH http://localhost:5000/leads/{{leadA_id}}/status
Authorization: Bearer {{cre_access_token}}
Content-Type: application/json

{
  "status": "Pending",
  "remarks": "Call attempt #2 - Customer asked to call back",
  "nextFollowupAt": "2024-01-26T12:00:00Z",
  "pendingReason": "CallBackRequested"
}
```

### Request 3 (Qualify)
```
POST http://localhost:5000/leads/{{leadA_id}}/qualify
Authorization: Bearer {{cre_access_token}}
{
  "qualifiedCategory": "Hot Lead",
  "modelInterested": "Hector",
  "nextFollowupAt": "2024-01-30T14:00:00Z",
  "remarks": "Customer confirmed interest"
}
```

### Verify
- `total_attempts = 3`
- `status = Qualified`, `is_qualified = true`, `next_followup_at` from qualification
- `Lead_Remarks = "Customer confirmed interest"`
- `timeline` shows 2 Pendings + 1 Qualified chronologically

SQL quick check:
```sql
SELECT status, total_attempts, next_followup_at, "Lead_Remarks"
FROM leads_master WHERE id = {{leadA_id}};

SELECT attempt_no, new_status, remarks, metadata
FROM leads_logs WHERE lead_id = {{leadA_id}} ORDER BY created_at;
```

---

## Scenario B — CRE2 (Multiple Pendings → Disqualified → Reopen → Lost)
Token: `{{cre2_access_token}}`

### Steps
1. Lead B — multiple pendings (RNR, CallBack)
2. Attempt #3 — mark Disqualified (not interested)
3. CRE_TL reopens to Working
4. CRE2 finalises as Lost

### Pending Attempts
Follow same Pending payload as Scenario A (use different remarks). After two attempts, continue:

### Disqualify
```
PATCH http://localhost:5000/leads/{{leadB_id}}/status
Authorization: Bearer {{cre_access_token}}
Content-Type: application/json

{
  "status": "Disqualified",
  "remarks": "Customer rejected - not interested",
  "disqualifyReason": "NotInterested"
}
```

### Expected
- `status = Disqualified`
- `IS_LOST = true`
- `total_attempts` incremented
- `leads_logs.metadata.disqualifyReason = "NotInterested"`

SQL:
```sql
SELECT status, "IS_LOST", total_attempts FROM leads_master WHERE id = {{lead_id}};

SELECT attempt_no, metadata
FROM leads_logs WHERE lead_id = {{lead_id}} AND new_status = 'Disqualified';
```

### Reopen (CRE_TL)
```
PATCH http://localhost:5000/leads/{{leadB_id}}/status
Authorization: Bearer {{cre_tl_access_token}}
{
  "status": "Working",
  "remarks": "Team lead reopened for second review"
}
```
Expect: `IS_LOST = false`.

### Final Lost (CRE2)
```
PATCH http://localhost:5000/leads/{{leadB_id}}/status
Authorization: Bearer {{cre_access_token}}
{
  "status": "Lost",
  "remarks": "Customer purchased competitor vehicle"
}
```
Expect: `IS_LOST = true`, attempts incremented, timeline shows entire journey.

---

## Validation Checklist

- [ ] Pending requires `nextFollowupAt` + `remarks`
- [ ] Disqualified requires `disqualifyReason`
- [ ] Lost automatically sets `IS_LOST = true`
- [ ] `total_attempts` increments every status change
- [ ] `Lead_Remarks` captures latest remark
- [ ] Timeline shows chronological history with attempt numbers
- [ ] `leads_logs.metadata.pendingReason` stored for pending
- [ ] `leads_logs.metadata.disqualifyReason` stored for disqualified
- [ ] `GET /leads/{{id}}/timeline` matches DB values

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| 400 `nextFollowupAt required` | Missing date when status Pending/Qualified | Include ISO datetime |
| 400 `remarks are required` | Pending without remarks | Provide remark |
| 400 `disqualifyReason required` | Disqualified without reason | Provide reason |
| Attempts not incrementing | `attemptNo` explicitly set | Remove `attemptNo` (auto increments) |
| RNR remarks not visible | Check `Leads_Remarks` (only latest shown) | Use timeline/logs for history |

---

**Ready to test! 🚀**	Run through each scenario sequentially, capture screenshots or SQL outputs as evidence. Update `PROJECT_STATUS.md` after verifying all flows in Postman.***

