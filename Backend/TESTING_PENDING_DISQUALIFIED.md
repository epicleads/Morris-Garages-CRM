# 🧪 Testing Guide — Pending, Disqualified, Lost, Qualified Scenarios

Comprehensive Postman tests to verify status transitions, follow-ups, remarks, and attempt counts across leads.

---

## Prerequisites
1. Backend running (`npm run dev`)
2. Sources populated (`SETUP_SOURCES.md`)
3. Test users created (`setup_test_users.sql`)
4. Postman environment set (`base_url`, tokens, etc.)
5. At least one lead assigned to CRE (`POST /leads`)

---

## Test Matrix Overview

| Scenario | Endpoint | Expectation |
|----------|----------|-------------|
| Pending follow-up workflow | `PATCH /leads/:id/status` | Requires follow-up date + remarks, increments attempts |
| Disqualified after multiple attempts | `PATCH /leads/:id/status` | Requires disqualify reason, sets `IS_LOST=true`, increments attempts |
| Lost scenario | `PATCH /leads/:id/status` | Sets `IS_LOST=true`, leaves remarks reason |
| Pending → Qualified | `PATCH /leads/:id/status`, `POST /leads/:id/qualify` | Verifies attempts, timeline, qualification |
| Repeated Pending (RNR / no answer) | `PATCH /leads/:id/status` | Verifies remarks stack + attempt count |

---

## Scenario 1 — Pending Follow-up (RNR / No Answer)

### Steps
1. Create or assign lead (ID=`{{lead_id}}`)
2. **Call #1** — lead doesn't pick up → Pending
3. **Call #2** — still RNR → Pending again

### Request 1 (Call #1)
```
PATCH {{base_url}}/leads/{{lead_id}}/status
Authorization: Bearer {{cre_access_token}}
Content-Type: application/json

{
  "status": "Pending",
  "remarks": "Call attempt #1 - RNR",
  "nextFollowupAt": "2024-01-25T10:00:00Z",
  "pendingReason": "RNR"
}
```

### Request 2 (Call #2)
```
PATCH {{base_url}}/leads/{{lead_id}}/status
Authorization: Bearer {{cre_access_token}}
Content-Type: application/json

{
  "status": "Pending",
  "remarks": "Call attempt #2 - Customer asked to call back",
  "nextFollowupAt": "2024-01-26T12:00:00Z",
  "pendingReason": "CallBackRequested"
}
```

### Verify
- `leads_master.total_attempts` increments (2)
- `Lead_Remarks` shows latest pending remark
- `leads_logs` has two entries with metadata for reasons
- `GET /leads/{{id}}/timeline` shows both pending entries chronologically

SQL quick check:
```sql
SELECT status, total_attempts, next_followup_at, "Lead_Remarks"
FROM leads_master WHERE id = {{lead_id}};

SELECT attempt_no, new_status, remarks, metadata
FROM leads_logs WHERE lead_id = {{lead_id}} ORDER BY created_at;
```

---

## Scenario 2 — Pending → Disqualified after multiple attempts

### Steps
1. Continue with same lead
2. **Attempt #3:** Customer rejects, mark `Disqualified`

### Request
```
PATCH {{base_url}}/leads/{{lead_id}}/status
Authorization: Bearer {{cre_access_token}}
Content-Type: application/json

{
  "status": "Disqualified",
  "remarks": "Customer rejected - not interested",
  "disqualifyReason": "NotInterested"
}
```

### Expected
- Response 200 with updated lead
- `leads_master.status = 'Disqualified'`
- `leads_master.IS_LOST = true`
- `total_attempts = previous + 1`
- `leads_logs` entry with `disqualifyReason` in metadata
- `next_followup_at` remains from last pending (unless changed)

SQL:
```sql
SELECT status, "IS_LOST", total_attempts FROM leads_master WHERE id = {{lead_id}};

SELECT attempt_no, metadata
FROM leads_logs WHERE lead_id = {{lead_id}} AND new_status = 'Disqualified';
```

### Timeline Check
```
GET {{base_url}}/leads/{{lead_id}}/timeline
Authorization: Bearer {{cre_access_token}}
```
Should show three attempts (Pending, Pending, Disqualified) with `attempt_no` ascending.

---

## Scenario 3 — Lost Status (after follow-up expiry)

Mark a different lead as Lost directly (e.g., lead ID `{{lost_lead_id}}`)

```
PATCH {{base_url}}/leads/{{lost_lead_id}}/status
Authorization: Bearer {{cre_access_token}}
Content-Type: application/json

{
  "status": "Lost",
  "remarks": "Lead not reachable after 5 attempts - marked lost"
}
```

### Expected
- `status = 'Lost'`
- `IS_LOST = true`
- `Lead_Remarks` updated
- `total_attempts` increments

---

## Scenario 4 — Pending multiple times, then Qualified

1. Fresh lead (`{{qual_lead_id}}`)
2. **Call #1:** Pending (RNR)
3. **Call #2:** Pending (Spoke, needs follow-up)
4. **Call #3:** Interested, move to Qualify

### Attempt #1
```
PATCH /leads/{{qual_lead_id}}/status
{
  "status": "Pending",
  "remarks": "Attempt #1 - RNR",
  "nextFollowupAt": "2024-01-26T09:00:00Z",
  "pendingReason": "RNR"
}
```

### Attempt #2
```
PATCH /leads/{{qual_lead_id}}/status
{
  "status": "Pending",
  "remarks": "Attempt #2 - Spoke, wants callback tomorrow",
  "nextFollowupAt": "2024-01-27T11:00:00Z",
  "pendingReason": "FollowupScheduled"
}
```

### Attempt #3 — Qualify
```
POST /leads/{{qual_lead_id}}/qualify
{
  "qualifiedCategory": "Hot Lead",
  "modelInterested": "Hector",
  "nextFollowupAt": "2024-01-30T14:00:00Z",
  "remarks": "Customer confirmed interest"
}
```

### Verify
- `leads_master.status = 'Qualified'`
- `is_qualified = true`
- `next_followup_at = qualification follow-up`
- `total_attempts = 3`
- `timeline` shows 2 Pendings + 1 Qualified
- `leads_logs` attempt_no sequence: 1,2,3

---

## Scenario 5 — Disqualified → Re-open (Working) → Lost

1. Lead disqualified previously
2. Team re-opens (status = Working)
3. After new attempts, mark Lost

### Reopen
```
PATCH /leads/{{lead_id}}/status
{
  "status": "Working",
  "remarks": "CRE TL reopened lead for second review"
}
```
Expect: `IS_LOST` reset to false.

### Final Lost
```
PATCH /leads/{{lead_id}}/status
{
  "status": "Lost",
  "remarks": "Customer bought competitor vehicle"
}
```

Expected: `IS_LOST = true`, attempts increment, timeline shows reopen + lost.

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

