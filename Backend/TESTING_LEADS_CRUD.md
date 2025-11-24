# 🧪 Testing Guide - Leads CRUD Implementation

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Login & Get Tokens](#step-1-login--get-tokens)
3. [Step 2: Create Test Leads](#step-2-create-test-leads)
4. [Step 3: Test List Leads](#step-3-test-list-leads)
5. [Step 4: Test Get Single Lead](#step-4-test-get-single-lead)
6. [Step 5: Test Update Lead Status](#step-5-test-update-lead-status)
7. [Step 6: Test Qualify Lead](#step-6-test-qualify-lead)
8. [Step 7: Test Timeline/History](#step-7-test-timelinehistory)
9. [Step 8: Test Follow-ups](#step-8-test-follow-ups)
9. [Step 9: Test Filters](#step-9-test-filters)
10. [Step 10: Test Statistics](#step-10-test-statistics)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. Backend Server Running
```bash
cd EPICMG/Backend
npm run dev
```
**Verify:** Server should be running on `http://localhost:4000`

### 2. Database Ready
- Schema improvements applied
- Test users created (if needed)

### 3. Postman Setup
- Import Postman collection (or use existing)
- Create/Select environment
- Set environment variables (see below)

---

## Postman Environment Variables

Create these variables in your Postman environment:

| Variable | Description | Example |
|----------|-------------|---------|
| `base_url` | Backend URL | `http://localhost:4000` |
| `dev_username` | Developer username | (from .env) |
| `dev_password` | Developer password | (from .env) |
| `cre_tl_username` | CRE_TL username | `cre_tl_test` |
| `cre_tl_password` | CRE_TL password | `cre_tl123` |
| `cre1_username` | CRE 1 username | `cre1_test` |
| `cre1_password` | CRE 1 password | `cre123` |
| `access_token` | Access token (auto-set) | - |
| `cre_tl_access_token` | CRE_TL token (auto-set) | - |
| `cre_access_token` | CRE token (auto-set) | - |
| `lead_id` | Lead ID (auto-set) | - |

---

## Step 1: Login & Get Tokens

### 1.1 Login as Developer

**Request:**
```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "username": "{{dev_username}}",
  "password": "{{dev_password}}"
}
```

**Expected Response (200):**
```json
{
  "user": {
    "id": 1,
    "username": "your_dev_username",
    "role": "CRE_TL",
    "isDeveloper": true
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "abc123..."
}
```

**Postman Test Script (to save token):**
```javascript
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set("access_token", jsonData.accessToken);
    pm.environment.set("user_id", jsonData.user.id);
    pm.environment.set("user_role", jsonData.user.role);
}
```

**✅ Verify:** Token is saved in environment variables

---

### 1.2 Login as CRE_TL

**Request:**
```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "username": "{{cre_tl_username}}",
  "password": "{{cre_tl_password}}"
}
```

**Postman Test Script:**
```javascript
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set("cre_tl_access_token", jsonData.accessToken);
}
```

**✅ Verify:** CRE_TL token saved

---

### 1.3 Login as CRE

**Request:**
```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "username": "{{cre1_username}}",
  "password": "{{cre1_password}}"
}
```

**Postman Test Script:**
```javascript
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set("cre_access_token", jsonData.accessToken);
}
```

**✅ Verify:** CRE token saved

---

## Step 2: Create Test Leads

### 2.1 Create First Lead (as CRE_TL/Developer)

**Request:**
```
POST {{base_url}}/leads
Authorization: Bearer {{cre_tl_access_token}}
Content-Type: application/json

{
  "fullName": "John Doe",
  "phoneNumber": "9876543210",
  "alternatePhoneNumber": "9876543211",
  "sourceId": 1
}
```

**Expected Response (201):**
```json
{
  "message": "Lead created successfully",
  "lead": {
    "id": 1,
    "full_name": "John Doe",
    "phone_number_normalized": "9876543210",
    "status": "New",
    "created_at": "2024-01-15T10:00:00Z"
  }
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 201", function () {
    pm.response.to.have.status(201);
});

pm.test("Lead created successfully", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('lead');
    pm.expect(jsonData.lead).to.have.property('id');
    
    // Save lead ID for later tests
    pm.environment.set("lead_id", jsonData.lead.id);
});
```

**✅ Verify:** Lead created, ID saved

---

### 2.2 Create More Test Leads

Create 3-4 more leads with different data:

**Lead 2:**
```json
{
  "fullName": "Jane Smith",
  "phoneNumber": "9876543212",
  "sourceId": 1
}
```

**Lead 3:**
```json
{
  "fullName": "Bob Johnson",
  "phoneNumber": "9876543213",
  "sourceId": 2
}
```

**Lead 4:**
```json
{
  "fullName": "Alice Williams",
  "phoneNumber": "9876543214",
  "sourceId": 1
}
```

**✅ Verify:** Multiple leads created

---

### 2.3 Test Duplicate Prevention

**Request:**
```
POST {{base_url}}/leads
Authorization: Bearer {{cre_tl_access_token}}
Content-Type: application/json

{
  "fullName": "Duplicate Test",
  "phoneNumber": "9876543210"
}
```

**Expected Response (409):**
```json
{
  "message": "Lead with this phone number already exists (ID: 1, Status: New)"
}
```

**✅ Verify:** Duplicate prevented

---

### 2.4 Test CRE Cannot Create Leads

**Request:**
```
POST {{base_url}}/leads
Authorization: Bearer {{cre_access_token}}
Content-Type: application/json

{
  "fullName": "Test Lead",
  "phoneNumber": "9999999999"
}
```

**Expected Response (403):**
```json
{
  "message": "Permission denied: Only Team Leads can create leads"
}
```

**✅ Verify:** CRE cannot create leads

---

## Step 3: Test List Leads

### 3.1 List All Leads (CRE_TL/Developer)

**Request:**
```
GET {{base_url}}/leads?page=1&limit=50
Authorization: Bearer {{cre_tl_access_token}}
```

**Expected Response (200):**
```json
{
  "leads": [
    {
      "id": 1,
      "full_name": "John Doe",
      "phone_number_normalized": "9876543210",
      "status": "New",
      "created_at": "2024-01-15T10:00:00Z"
    },
    ...
  ],
  "total": 4,
  "page": 1,
  "limit": 50,
  "totalPages": 1
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Returns leads array", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('leads');
    pm.expect(jsonData.leads).to.be.an('array');
    pm.expect(jsonData).to.have.property('total');
    pm.expect(jsonData).to.have.property('page');
});
```

**✅ Verify:** All leads returned

---

### 3.2 List Leads with Status Filter

**Request:**
```
GET {{base_url}}/leads?status=New&page=1&limit=50
Authorization: Bearer {{cre_tl_access_token}}
```

**Expected Response (200):**
```json
{
  "leads": [...], // Only leads with status "New"
  "total": 4
}
```

**✅ Verify:** Only "New" leads returned

---

### 3.3 List Leads with Source Filter

**Request:**
```
GET {{base_url}}/leads?sourceId=1&page=1&limit=50
Authorization: Bearer {{cre_tl_access_token}}
```

**✅ Verify:** Only leads from source 1

---

### 3.4 List Leads - CRE (Should See Only Assigned)

**First, assign a lead to CRE (we'll do this in Step 5), then:**

**Request:**
```
GET {{base_url}}/leads
Authorization: Bearer {{cre_access_token}}
```

**Expected:** Only leads where `assigned_to = CRE's user_id`

**✅ Verify:** CRE sees only assigned leads

---

## Step 4: Test Get Single Lead

### 4.1 Get Lead by ID

**Request:**
```
GET {{base_url}}/leads/{{lead_id}}
Authorization: Bearer {{cre_tl_access_token}}
```

**Expected Response (200):**
```json
{
  "lead": {
    "id": 1,
    "full_name": "John Doe",
    "phone_number_normalized": "9876543210",
    "status": "New",
    "assigned_to": null,
    "created_at": "2024-01-15T10:00:00Z"
  },
  "timeline": {
    "timeline": [...],
    "summary": {
      "totalAttempts": 0,
      "totalSources": 1,
      "isQualified": false,
      "currentStatus": "New"
    }
  }
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Returns lead and timeline", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('lead');
    pm.expect(jsonData).to.have.property('timeline');
    pm.expect(jsonData).to.have.property('summary');
});
```

**✅ Verify:** Lead and timeline returned

---

### 4.2 Test Access Denied (CRE accessing unassigned lead)

**Request:**
```
GET {{base_url}}/leads/{{lead_id}}
Authorization: Bearer {{cre_access_token}}
```

**Expected Response (404):**
```json
{
  "message": "Access denied: You can only view leads assigned to you"
}
```

**✅ Verify:** CRE cannot access unassigned leads

---

## Step 5: Test Update Lead Status

### 5.1 Update Status to "Working"

**Request:**
```
PATCH {{base_url}}/leads/{{lead_id}}/status
Authorization: Bearer {{cre_tl_access_token}}
Content-Type: application/json

{
  "status": "Working",
  "remarks": "Started working on this lead",
  "attemptNo": 1,
  "callDuration": 120
}
```

**Expected Response (200):**
```json
{
  "message": "Lead status updated successfully",
  "lead": {
    "id": 1,
    "status": "Working",
    "total_attempts": 1,
    "updated_at": "2024-01-15T10:05:00Z"
  }
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Status updated", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.lead.status).to.equal('Working');
});
```

**✅ Verify:** Status updated, lead_log created

---

### 5.2 Update Status to "Pending" (Requires nextFollowupAt)

**Request:**
```
PATCH {{base_url}}/leads/{{lead_id}}/status
Authorization: Bearer {{cre_tl_access_token}}
Content-Type: application/json

{
  "status": "Pending",
  "remarks": "Customer not available",
  "pendingReason": "RNR",
  "nextFollowupAt": "2024-01-16T10:00:00Z",
  "attemptNo": 2,
  "callDuration": 30
}
```

**Expected Response (200):**
```json
{
  "message": "Lead status updated successfully",
  "lead": {
    "status": "Pending",
    "next_followup_at": "2024-01-16T10:00:00Z"
  }
}
```

**✅ Verify:** Status updated, follow-up date set

---

### 5.3 Test Missing nextFollowupAt for Pending

**Request:**
```
PATCH {{base_url}}/leads/{{lead_id}}/status
Authorization: Bearer {{cre_tl_access_token}}
Content-Type: application/json

{
  "status": "Pending",
  "remarks": "Test"
}
```

**Expected Response (400):**
```json
{
  "message": "nextFollowupAt is required for Pending status"
}
```

**✅ Verify:** Validation working

---

### 5.4 Update Status to "Disqualified"

**Request:**
```
PATCH {{base_url}}/leads/{{lead_id}}/status
Authorization: Bearer {{cre_tl_access_token}}
Content-Type: application/json

{
  "status": "Disqualified",
  "remarks": "Not interested",
  "disqualifyReason": "Just enquired",
  "attemptNo": 3
}
```

**✅ Verify:** Status updated to Disqualified

---

## Step 6: Test Qualify Lead

### 6.1 Qualify a Lead

**First, update lead status back to "Working":**
```
PATCH {{base_url}}/leads/{{lead_id}}/status
{
  "status": "Working"
}
```

**Then qualify:**
```
POST {{base_url}}/leads/{{lead_id}}/qualify
Authorization: Bearer {{cre_tl_access_token}}
Content-Type: application/json

{
  "qualifiedCategory": "Test Drive",
  "modelInterested": "MG Hector",
  "variant": "Plus",
  "profession": "Engineer",
  "customerLocation": "Mumbai",
  "purchaseTimeline": "Within 1 month",
  "financeType": "Loan",
  "testdriveDate": "2024-01-20",
  "qualifiedFor": ["Test Drive", "Showroom Visit"],
  "nextFollowupAt": "2024-01-18T10:00:00Z",
  "remarks": "Customer is very interested"
}
```

**Expected Response (200):**
```json
{
  "message": "Lead qualified successfully",
  "qualification": {
    "id": "uuid-here",
    "lead_id": 1,
    "qualified_category": "Test Drive",
    "model_interested": "MG Hector",
    "review_status": "pending",
    "qualified_at": "2024-01-15T10:10:00Z"
  }
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Lead qualified", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('qualification');
    pm.expect(jsonData.qualification.review_status).to.equal('pending');
});
```

**✅ Verify:** Lead qualified, qualification record created

---

## Step 7: Test Timeline/History

### 7.1 Get Lead Timeline

**Request:**
```
GET {{base_url}}/leads/{{lead_id}}/timeline
Authorization: Bearer {{cre_tl_access_token}}
```

**Expected Response (200):**
```json
{
  "timeline": [
    {
      "type": "source",
      "timestamp": "2024-01-15T10:00:00Z",
      "data": {
        "sourceName": "Website",
        "sourceType": "website",
        "isPrimary": true
      }
    },
    {
      "type": "log",
      "timestamp": "2024-01-15T10:05:00Z",
      "data": {
        "oldStatus": "New",
        "newStatus": "Working",
        "attemptNo": 1,
        "remarks": "Started working on this lead",
        "createdBy": "Test Team Lead"
      }
    },
    {
      "type": "log",
      "timestamp": "2024-01-15T10:07:00Z",
      "data": {
        "oldStatus": "Working",
        "newStatus": "Pending",
        "attemptNo": 2,
        "pendingReason": "RNR"
      }
    },
    {
      "type": "qualification",
      "timestamp": "2024-01-15T10:10:00Z",
      "data": {
        "qualifiedCategory": "Test Drive",
        "modelInterested": "MG Hector"
      }
    }
  ],
  "summary": {
    "totalAttempts": 3,
    "totalSources": 1,
    "isQualified": true,
    "currentStatus": "Qualified",
    "assignedTo": "Test Team Lead"
  }
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Returns timeline", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('timeline');
    pm.expect(jsonData.timeline).to.be.an('array');
    pm.expect(jsonData).to.have.property('summary');
    pm.expect(jsonData.summary.totalAttempts).to.be.greaterThan(0);
});
```

**✅ Verify:** Complete timeline with all attempts and status changes

---

### 7.2 Verify All Attempts Are Shown

Make 2-3 more status updates, then check timeline again:

**Request:**
```
GET {{base_url}}/leads/{{lead_id}}/timeline
```

**✅ Verify:** All previous attempts (1, 2, 3, 4...) are shown in chronological order

---

## Step 8: Test Follow-ups

### 8.1 Get Today's Follow-ups

**First, create a lead with today's follow-up date:**
```
PATCH {{base_url}}/leads/{{lead_id}}/status
{
  "status": "Pending",
  "nextFollowupAt": "2024-01-15T15:00:00Z"  // Today's date
}
```

**Then get follow-ups:**
```
GET {{base_url}}/leads/followups/today
Authorization: Bearer {{cre_tl_access_token}}
```

**Expected Response (200):**
```json
{
  "followups": [
    {
      "id": 1,
      "full_name": "John Doe",
      "next_followup_at": "2024-01-15T15:00:00Z",
      "status": "Pending"
    }
  ],
  "count": 1
}
```

**✅ Verify:** Only today's follow-ups returned

---

## Step 9: Test Filters

### 9.1 Filter by Today

**Request:**
```
GET {{base_url}}/leads?filterType=today&page=1&limit=50
Authorization: Bearer {{cre_tl_access_token}}
```

**✅ Verify:** Only leads created today

---

### 9.2 Filter by MTD (Month to Date)

**Request:**
```
GET {{base_url}}/leads?filterType=mtd&page=1&limit=50
Authorization: Bearer {{cre_tl_access_token}}
```

**✅ Verify:** Only leads created this month

---

### 9.3 Filter by Custom Date Range

**Request:**
```
GET {{base_url}}/leads?filterType=custom&dateFrom=2024-01-01T00:00:00Z&dateTo=2024-01-31T23:59:59Z
Authorization: Bearer {{cre_tl_access_token}}
```

**✅ Verify:** Only leads in date range

---

### 9.4 Search by Name

**Request:**
```
GET {{base_url}}/leads?search=John&page=1&limit=50
Authorization: Bearer {{cre_tl_access_token}}
```

**✅ Verify:** Only leads matching "John"

---

### 9.5 Search by Phone

**Request:**
```
GET {{base_url}}/leads?search=9876543210&page=1&limit=50
Authorization: Bearer {{cre_tl_access_token}}
```

**✅ Verify:** Lead with matching phone returned

---

### 9.6 Combined Filters

**Request:**
```
GET {{base_url}}/leads?status=New&sourceId=1&filterType=today&page=1&limit=50
Authorization: Bearer {{cre_tl_access_token}}
```

**✅ Verify:** All filters work together

---

## Step 10: Test Statistics

### 10.1 Get Lead Statistics

**Request:**
```
GET {{base_url}}/leads/stats?filterType=mtd
Authorization: Bearer {{cre_tl_access_token}}
```

**Expected Response (200):**
```json
{
  "total": 4,
  "byStatus": {
    "New": 2,
    "Working": 1,
    "Qualified": 1
  },
  "bySource": {
    "1": 3,
    "2": 1
  },
  "qualified": 1,
  "todayFollowups": 1
}
```

**✅ Verify:** Statistics returned correctly

---

## Complete Testing Checklist

### Authentication
- [ ] Developer login works
- [ ] CRE_TL login works
- [ ] CRE login works
- [ ] Tokens saved in environment

### Create Leads
- [ ] CRE_TL can create leads
- [ ] Developer can create leads
- [ ] CRE cannot create leads (403)
- [ ] Duplicate prevention works (409)
- [ ] Phone normalization works

### List Leads
- [ ] CRE_TL sees all leads
- [ ] CRE sees only assigned leads
- [ ] Status filter works
- [ ] Source filter works
- [ ] Pagination works
- [ ] Search works

### Get Single Lead
- [ ] Returns lead data
- [ ] Returns timeline summary
- [ ] CRE cannot access unassigned leads

### Update Status
- [ ] Status update works
- [ ] Lead log created automatically
- [ ] Attempt number tracked
- [ ] nextFollowupAt required for Pending
- [ ] Call duration stored

### Qualify Lead
- [ ] Qualification record created
- [ ] Lead status updated to Qualified
- [ ] Review status set to pending

### Timeline/History
- [ ] All attempts shown
- [ ] All status changes shown
- [ ] Source history shown
- [ ] Qualification shown
- [ ] Chronological order
- [ ] Summary statistics correct

### Follow-ups
- [ ] Today's follow-ups returned
- [ ] Role-based filtering works

### Filters
- [ ] Today filter works
- [ ] MTD filter works
- [ ] Custom date range works
- [ ] Search by name works
- [ ] Search by phone works
- [ ] Combined filters work

### Statistics
- [ ] Total count correct
- [ ] By status count correct
- [ ] By source count correct
- [ ] Qualified count correct
- [ ] Today follow-ups count correct

---

## Troubleshooting

### Issue: "Access denied" when should have access
**Solution:**
- Check token is correct
- Verify user role in database
- Check lead is assigned to CRE (if CRE user)

### Issue: "Lead not found"
**Solution:**
- Verify lead ID exists
- Check if lead is assigned to user (for CRE)
- Verify database connection

### Issue: "Validation failed"
**Solution:**
- Check request body format
- Verify required fields are present
- Check date format (ISO 8601)

### Issue: Timeline empty
**Solution:**
- Make sure you've updated lead status at least once
- Check `leads_logs` table has entries
- Verify lead ID is correct

### Issue: Count wrong
**Solution:**
- Check filters are applied correctly
- Verify role-based filtering
- Check database has data

---

## Next Steps After Testing

Once all tests pass:

1. ✅ **Leads CRUD Verified**
2. ⏳ **Move to Step 3: Assignment Rules**
3. ⏳ **Then Step 4: Webhook Ingestion**

---

**Happy Testing! 🚀**

If you encounter any issues, check:
- Server logs
- Database connection
- Token expiration
- Environment variables

