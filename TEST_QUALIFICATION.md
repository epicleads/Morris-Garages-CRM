# 🧪 Testing Guide - Qualification Endpoint

## 📋 Quick Test Steps

### Step 1: Login as CRE User
**Request:**
```
POST http://localhost:4000/auth/login
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "username": "cre1_test",
  "password": "cre123"
}
```

**Expected Response (200):**
```json
{
  "user": {
    "id": 3,
    "username": "cre1_test",
    "role": "CRE"
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "abc123..."
}
```

**✅ Save the `accessToken` - you'll need it for next steps**

---

### Step 2: Get a Lead ID (or Create One)

**Option A: List Leads to Get ID**
```
GET http://localhost:4000/leads?page=1&limit=10
Authorization: Bearer <your_access_token>
```

**✅ Copy a `lead_id` from the response (e.g., `id: 123`)**

**Option B: Create a New Lead (if you're CRE_TL/Admin)**
```
POST http://localhost:4000/leads
Authorization: Bearer <your_access_token>
Content-Type: application/json
```

**Body:**
```json
{
  "fullName": "John Doe",
  "phoneNumber": "9876543210",
  "sourceId": 1
}
```

**✅ Save the `id` from response (e.g., `id: 123`)**

---

### Step 3: Qualify the Lead

**Request:**
```
POST http://localhost:4000/leads/123/qualify
Authorization: Bearer <your_access_token>
Content-Type: application/json
```

**Replace `123` with your actual lead ID**

---

## 📝 Postman JSON Examples

### Example 1: Minimal (Only Required Fields)

**Body:**
```json
{
  "qualifiedCategory": "Hot Lead",
  "nextFollowupAt": "2024-01-18T10:00:00Z"
}
```

**✅ This should work - only required fields**

---

### Example 2: Complete (All Fields)

**Body:**
```json
{
  "qualifiedCategory": "Hot Lead",
  "modelInterested": "Hector",
  "variant": "Plus",
  "profession": "Business Owner",
  "customerLocation": "Mumbai",
  "purchaseTimeline": "Within 1 month",
  "financeType": "Loan",
  "testdriveDate": "2024-01-20",
  "exchangeVehicleMake": "Maruti",
  "exchangeVehicleModel": "Swift",
  "exchangeVehicleYear": 2020,
  "leadCategory": "Premium",
  "nextFollowupAt": "2024-01-18T10:00:00Z",
  "remarks": "Customer is very interested, ready to purchase"
}
```

**✅ This includes all optional fields**

---

### Example 3: Partial (Some Optional Fields)

**Body:**
```json
{
  "qualifiedCategory": "Warm Lead",
  "modelInterested": "Hector",
  "customerLocation": "Delhi",
  "purchaseTimeline": "Within 3 months",
  "nextFollowupAt": "2024-01-20T14:00:00Z",
  "remarks": "Customer needs more time to decide"
}
```

**✅ This includes some optional fields**

---

## ✅ Expected Success Response (200)

```json
{
  "message": "Lead qualified successfully",
  "qualification": {
    "id": 1,
    "lead_id": 123,
    "qualified_category": "Hot Lead",
    "model_interested": "Hector",
    "variant": "Plus",
    "profession": "Business Owner",
    "customer_location": "Mumbai",
    "purchase_timeline": "Within 1 month",
    "finance_type": "Loan",
    "testdrive_date": "2024-01-20",
    "exchange_vehicle_make": "Maruti",
    "exchange_vehicle_model": "Swift",
    "exchange_vehicle_year": 2020,
    "lead_category": "Premium",
    "next_followup_at": "2024-01-18T10:00:00Z",
    "remarks": "Customer is very interested, ready to purchase",
    "qualified_by": 3,
    "qualified_at": "2024-01-16T10:00:00Z",
    "updated_at": "2024-01-16T10:00:00Z"
  }
}
```

---

## ❌ Error Responses

### Error 1: Missing Required Field
**Request:**
```json
{
  "qualifiedCategory": "Hot Lead"
  // Missing nextFollowupAt
}
```

**Response (400):**
```json
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "nextFollowupAt",
      "message": "nextFollowupAt is required and must be a valid ISO datetime"
    }
  ]
}
```

---

### Error 2: Invalid Date Format
**Request:**
```json
{
  "qualifiedCategory": "Hot Lead",
  "nextFollowupAt": "2024-01-18"  // Missing time
}
```

**Response (400):**
```json
{
  "message": "Validation failed",
  "errors": [
    {
      "field": "nextFollowupAt",
      "message": "nextFollowupAt is required and must be a valid ISO datetime"
    }
  ]
}
```

---

### Error 3: Lead Already Qualified (Now Updates Instead)
**Request:** (Qualify same lead twice - now updates automatically)
```json
{
  "qualifiedCategory": "Hot Lead",
  "nextFollowupAt": "2024-01-18T10:00:00Z"
}
```

**Response (200):** (Now updates instead of error)
```json
{
  "message": "Qualification updated successfully",
  "qualification": {
    "id": 1,
    "lead_id": 123,
    "qualified_category": "Hot Lead",
    ...
  }
}
```

**Note:** The same endpoint (`POST /leads/:id/qualify`) now handles both:
- **First time:** Creates qualification (message: "Lead qualified successfully")
- **Subsequent times:** Updates qualification (message: "Qualification updated successfully")

---

### Error 4: Lead Not Found
**Request:** (Use invalid lead ID)
```
POST /leads/99999/qualify
```

**Response (404):**
```json
{
  "message": "Lead not found"
}
```

---

## 🔍 What to Verify After Qualification

### 1. Check `leads_master` Table
```sql
SELECT 
  id, 
  status, 
  is_qualified, 
  next_followup_at, 
  total_attempts,
  "Lead_Remarks"
FROM leads_master 
WHERE id = 123;
```

**Expected:**
- `status` = `'Qualified'`
- `is_qualified` = `true`
- `next_followup_at` = `'2024-01-18 10:00:00'`
- `total_attempts` = increased by 1
- `Lead_Remarks` = your remarks

---

### 2. Check `leads_qualification` Table
```sql
SELECT * FROM leads_qualification WHERE lead_id = 123;
```

**Expected:**
- New record created with all your qualification data
- `qualified_by` = your user ID
- `qualified_at` = current timestamp

---

### 3. Check `leads_logs` Table
```sql
SELECT * FROM leads_logs WHERE lead_id = 123 ORDER BY created_at DESC LIMIT 1;
```

**Expected:**
- New log entry with:
  - `old_status` = previous status
  - `new_status` = `'Qualified'`
  - `remarks` = your remarks
  - `attempt_no` = incremented number
  - `metadata` contains qualification details

---

### 4. Get Lead Timeline
```
GET http://localhost:4000/leads/123/timeline
Authorization: Bearer <your_access_token>
```

**Expected:**
- Timeline should show qualification event
- Status changed to 'Qualified'
- Qualification details visible

---

## 📋 Test Checklist

- [ ] Login as CRE user
- [ ] Get/Create a lead ID
- [ ] Qualify with minimal fields (required only) - **First time (creates)**
- [ ] Qualify with complete fields (all optional) - **First time (creates)**
- [ ] Verify `leads_master` updated correctly
- [ ] Verify `leads_qualification` record created
- [ ] Verify `leads_logs` entry created
- [ ] Check timeline shows qualification
- [ ] **Qualify same lead again (should UPDATE, not fail)** ✅
- [ ] Verify qualification was updated in database
- [ ] Try with missing `nextFollowupAt` (should fail)
- [ ] Try with invalid date format (should fail)

---

## 🚀 Quick Copy-Paste for Postman

### Request 1: Login
```
POST http://localhost:4000/auth/login
Content-Type: application/json

{
  "username": "cre1_test",
  "password": "cre123"
}
```

### Request 2: Qualify Lead (Minimal)
```
POST http://localhost:4000/leads/123/qualify
Authorization: Bearer <paste_token_here>
Content-Type: application/json

{
  "qualifiedCategory": "Hot Lead",
  "nextFollowupAt": "2024-01-18T10:00:00Z"
}
```

### Request 3: Qualify Lead (Complete)
```
POST http://localhost:4000/leads/123/qualify
Authorization: Bearer <paste_token_here>
Content-Type: application/json

{
  "qualifiedCategory": "Hot Lead",
  "modelInterested": "Hector",
  "variant": "Plus",
  "profession": "Business Owner",
  "customerLocation": "Mumbai",
  "purchaseTimeline": "Within 1 month",
  "financeType": "Loan",
  "testdriveDate": "2024-01-20",
  "exchangeVehicleMake": "Maruti",
  "exchangeVehicleModel": "Swift",
  "exchangeVehicleYear": 2020,
  "leadCategory": "Premium",
  "nextFollowupAt": "2024-01-18T10:00:00Z",
  "remarks": "Customer is very interested, ready to purchase"
}
```

---

## 💡 Tips

1. **Date Format:** Always use ISO datetime format: `2024-01-18T10:00:00Z`
2. **Test Date:** Use future dates for `nextFollowupAt`
3. **Lead Status:** Lead can be in any status to qualify
4. **Update Behavior:** If lead is already qualified, same endpoint will update it automatically
5. **User Access:** CRE can only qualify leads assigned to them
6. **CRE_TL Access:** CRE_TL can qualify any lead
7. **Timeline:** Check timeline endpoint to see qualification history

---

## 🐛 Troubleshooting

### Issue: "Lead not found"
- Check if lead ID exists
- Check if lead is assigned to you (if you're CRE)
- Verify lead exists: `SELECT * FROM leads_master WHERE id = 123;`

### Issue: "Access denied"
- CRE can only qualify leads assigned to them
- Check lead assignment: `SELECT assigned_to FROM leads_master WHERE id = 123;`

### Issue: "Already qualified"
- **Note:** This is no longer an error! The endpoint now automatically updates if lead is already qualified.
- If you want to check qualification status: `SELECT is_qualified FROM leads_master WHERE id = 123;`

### Issue: "Invalid date"
- Use ISO format: `2024-01-18T10:00:00Z`
- Include time, not just date
- Use UTC timezone (Z at the end)

---

## 🔄 Update Qualification Flow

### How It Works:
1. **First Qualification:** `POST /leads/:id/qualify` → Creates qualification
   - Response: `"Lead qualified successfully"`
   
2. **Update Qualification:** `POST /leads/:id/qualify` (same endpoint) → Updates qualification
   - Response: `"Qualification updated successfully"`
   - Only updates fields you provide
   - Fields not provided remain unchanged

### Example: Update Qualification
```json
POST /leads/123/qualify
{
  "qualifiedCategory": "Warm Lead",  // Updates category
  "nextFollowupAt": "2024-01-25T10:00:00Z",  // Updates follow-up date
  "remarks": "Updated remarks"  // Updates remarks
  // Other fields not provided remain unchanged
}
```

**Note:** The same endpoint handles both create and update automatically!

---

**Ready to test! 🚀**

