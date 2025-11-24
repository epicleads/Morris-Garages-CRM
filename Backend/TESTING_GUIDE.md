# Authentication System - Postman Testing Guide

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Test Scenarios Overview](#test-scenarios-overview)
4. [Detailed Test Cases](#detailed-test-cases)
5. [Postman Collection Setup](#postman-collection-setup)
6. [Expected Results](#expected-results)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. Backend Server Running
```bash
cd EPICMG/Backend
npm install
npm run dev
# Server should be running on port 4000 (or your configured port)
```

### 2. Database Setup
- Ensure Supabase database is connected
- Developer account should be auto-created on server start
- Create test users (see below)

### 3. Test Users Setup

Run these SQL queries in Supabase to create test users:

```sql
-- Test CRE_TL (Team Lead)
INSERT INTO users (username, password_hash, role, full_name, status)
VALUES (
  'cre_tl_test',
  '$2a$10$rOzJqKqKqKqKqKqKqKqKqOqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKq', -- password: 'cre_tl123'
  'CRE_TL',
  'Test Team Lead',
  true
);

-- Test CRE 1
INSERT INTO users (username, password_hash, role, full_name, status)
VALUES (
  'cre1_test',
  '$2a$10$rOzJqKqKqKqKqKqKqKqKqOqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKq', -- password: 'cre123'
  'CRE',
  'Test CRE 1',
  true
);

-- Test CRE 2
INSERT INTO users (username, password_hash, role, full_name, status)
VALUES (
  'cre2_test',
  '$2a$10$rOzJqKqKqKqKqKqKqKqKqOqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKqKq', -- password: 'cre123'
  'CRE',
  'Test CRE 2',
  true
);
```

**Note:** The password hashes above are placeholders. Use bcrypt to generate real hashes, or use the developer endpoint to create users.

---

## Environment Setup

### Postman Environment Variables

Create a Postman environment with these variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `base_url` | `http://localhost:4000` | - |
| `dev_username` | `your_dev_username` | (from .env) |
| `dev_password` | `your_dev_password` | (from .env) |
| `cre_tl_username` | `cre_tl_test` | - |
| `cre_tl_password` | `cre_tl123` | - |
| `cre1_username` | `cre1_test` | - |
| `cre1_password` | `cre123` | - |
| `cre2_username` | `cre2_test` | - |
| `cre2_password` | `cre123` | - |
| `access_token` | (empty) | (auto-set after login) |
| `refresh_token` | (empty) | (auto-set after login) |
| `user_id` | (empty) | (auto-set after login) |
| `user_role` | (empty) | (auto-set after login) |

---

## Test Scenarios Overview

### Test Groups:
1. **Authentication Flow** (Login, Refresh, Logout)
2. **Developer Role Tests** (Highest privileges)
3. **CRE_TL Role Tests** (Team Lead permissions)
4. **CRE Role Tests** (Limited permissions)
5. **Security Tests** (Unauthorized access, invalid tokens)
6. **Edge Cases** (Inactive users, expired tokens)

---

## Detailed Test Cases

### GROUP 1: Authentication Flow

#### Test 1.1: Developer Login ✅
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
    "isDeveloper": true,
    "status": true
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "abc123...",
  "refreshTokenExpiresAt": "2024-01-15T10:00:00.000Z"
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has access token", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('accessToken');
    pm.expect(jsonData.accessToken).to.be.a('string');
});

pm.test("User is developer", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.user.isDeveloper).to.be.true;
});

// Save tokens
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set("access_token", jsonData.accessToken);
    pm.environment.set("refresh_token", jsonData.refreshToken);
    pm.environment.set("user_id", jsonData.user.id);
    pm.environment.set("user_role", jsonData.user.role);
}
```

---

#### Test 1.2: CRE_TL Login ✅
**Request:**
```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "username": "{{cre_tl_username}}",
  "password": "{{cre_tl_password}}"
}
```

**Expected Response (200):**
```json
{
  "user": {
    "id": 2,
    "username": "cre_tl_test",
    "role": "CRE_TL",
    "isDeveloper": false,
    "status": true
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "abc123..."
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("User role is CRE_TL", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.user.role).to.equal('CRE_TL');
    pm.expect(jsonData.user.isDeveloper).to.be.false;
});

// Save tokens for CRE_TL
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set("cre_tl_access_token", jsonData.accessToken);
    pm.environment.set("cre_tl_refresh_token", jsonData.refreshToken);
}
```

---

#### Test 1.3: CRE Login ✅
**Request:**
```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "username": "{{cre1_username}}",
  "password": "{{cre1_password}}"
}
```

**Expected Response (200):**
```json
{
  "user": {
    "id": 3,
    "username": "cre1_test",
    "role": "CRE",
    "isDeveloper": false,
    "status": true
  },
  "accessToken": "eyJhbGc...",
  "refreshToken": "abc123..."
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("User role is CRE", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.user.role).to.equal('CRE');
});

// Save tokens for CRE
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set("cre_access_token", jsonData.accessToken);
    pm.environment.set("cre_refresh_token", jsonData.refreshToken);
}
```

---

#### Test 1.4: Invalid Credentials ❌
**Request:**
```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "username": "invalid_user",
  "password": "wrong_password"
}
```

**Expected Response (401):**
```json
{
  "message": "Invalid credentials"
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 401", function () {
    pm.response.to.have.status(401);
});

pm.test("Error message is correct", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.message).to.include('Invalid credentials');
});
```

---

#### Test 1.5: Get Profile (Authenticated) ✅
**Request:**
```
GET {{base_url}}/auth/profile
Authorization: Bearer {{access_token}}
```

**Expected Response (200):**
```json
{
  "id": 1,
  "username": "your_dev_username",
  "role": "CRE_TL",
  "isDeveloper": true,
  "status": true
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Returns user profile", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('id');
    pm.expect(jsonData).to.have.property('username');
    pm.expect(jsonData).to.have.property('role');
});
```

---

#### Test 1.6: Get Profile (Unauthenticated) ❌
**Request:**
```
GET {{base_url}}/auth/profile
(No Authorization header)
```

**Expected Response (401):**
```json
{
  "message": "Missing Authorization header"
}
```

---

#### Test 1.7: Get Profile (Invalid Token) ❌
**Request:**
```
GET {{base_url}}/auth/profile
Authorization: Bearer invalid_token_here
```

**Expected Response (401):**
```json
{
  "message": "Invalid token"
}
```

---

#### Test 1.8: Refresh Token ✅
**Request:**
```
POST {{base_url}}/auth/refresh
Content-Type: application/json

{
  "refreshToken": "{{refresh_token}}"
}
```

**Expected Response (200):**
```json
{
  "user": { ... },
  "accessToken": "new_access_token...",
  "refreshToken": "new_refresh_token...",
  "refreshTokenExpiresAt": "2024-01-15T10:00:00.000Z"
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Returns new tokens", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('accessToken');
    pm.expect(jsonData).to.have.property('refreshToken');
    // New tokens should be different
    pm.expect(jsonData.accessToken).to.not.equal(pm.environment.get("access_token"));
});

// Update tokens
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set("access_token", jsonData.accessToken);
    pm.environment.set("refresh_token", jsonData.refreshToken);
}
```

---

#### Test 1.9: Refresh Token (Invalid) ❌
**Request:**
```
POST {{base_url}}/auth/refresh
Content-Type: application/json

{
  "refreshToken": "invalid_refresh_token"
}
```

**Expected Response (401):**
```json
{
  "message": "Invalid refresh token"
}
```

---

#### Test 1.10: Logout ✅
**Request:**
```
POST {{base_url}}/auth/logout
Content-Type: application/json

{
  "refreshToken": "{{refresh_token}}"
}
```

**Expected Response (204):**
```
(No body)
```

**Postman Test Script:**
```javascript
pm.test("Status code is 204", function () {
    pm.response.to.have.status(204);
});

// After logout, refresh token should be revoked
// Try to use it again - should fail
```

---

#### Test 1.11: Refresh After Logout ❌
**Request:**
```
POST {{base_url}}/auth/refresh
Content-Type: application/json

{
  "refreshToken": "{{refresh_token}}" // (the one we just logged out)
}
```

**Expected Response (401):**
```json
{
  "message": "Refresh token revoked"
}
```

---

### GROUP 2: Developer Role Tests

#### Test 2.1: Developer - List All Users ✅
**Request:**
```
GET {{base_url}}/developer/users
Authorization: Bearer {{access_token}}  // (Developer token)
```

**Expected Response (200):**
```json
[
  {
    "id": 1,
    "username": "your_dev_username",
    "role": "CRE_TL",
    "isDeveloper": true
  },
  {
    "id": 2,
    "username": "cre_tl_test",
    "role": "CRE_TL",
    "isDeveloper": false
  },
  {
    "id": 3,
    "username": "cre1_test",
    "role": "CRE",
    "isDeveloper": false
  }
]
```

**Postman Test Script:**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Returns array of users", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.be.an('array');
    pm.expect(jsonData.length).to.be.greaterThan(0);
});
```

---

#### Test 2.2: Developer - Create User ✅
**Request:**
```
POST {{base_url}}/developer/users
Authorization: Bearer {{access_token}}  // (Developer token)
Content-Type: application/json

{
  "username": "new_cre_test",
  "password": "password123",
  "role": "CRE",
  "fullName": "New CRE User",
  "email": "newcre@test.com",
  "phoneNumber": "1234567890",
  "status": true
}
```

**Expected Response (201):**
```json
{
  "id": 4,
  "username": "new_cre_test",
  "role": "CRE",
  "isDeveloper": false,
  "status": true
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 201", function () {
    pm.response.to.have.status(201);
});

pm.test("User created successfully", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('id');
    pm.expect(jsonData.username).to.equal('new_cre_test');
    pm.expect(jsonData.role).to.equal('CRE');
});
```

---

#### Test 2.3: Developer - Update User ✅
**Request:**
```
PATCH {{base_url}}/developer/users/4
Authorization: Bearer {{access_token}}  // (Developer token)
Content-Type: application/json

{
  "fullName": "Updated CRE User",
  "status": false
}
```

**Expected Response (200):**
```json
{
  "id": 4,
  "username": "new_cre_test",
  "fullName": "Updated CRE User",
  "role": "CRE",
  "status": false
}
```

---

#### Test 2.4: Developer - Delete User ✅
**Request:**
```
DELETE {{base_url}}/developer/users/4
Authorization: Bearer {{access_token}}  // (Developer token)
```

**Expected Response (204):**
```
(No body)
```

---

#### Test 2.5: CRE_TL - Try to Access Developer Endpoint ❌
**Request:**
```
GET {{base_url}}/developer/users
Authorization: Bearer {{cre_tl_access_token}}  // (CRE_TL token)
```

**Expected Response (403):**
```json
{
  "message": "Forbidden"
}
```

**Postman Test Script:**
```javascript
pm.test("Status code is 403", function () {
    pm.response.to.have.status(403);
});

pm.test("Access denied for non-developer", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.message).to.equal('Forbidden');
});
```

---

#### Test 2.6: CRE - Try to Access Developer Endpoint ❌
**Request:**
```
GET {{base_url}}/developer/users
Authorization: Bearer {{cre_access_token}}  // (CRE token)
```

**Expected Response (403):**
```json
{
  "message": "Forbidden"
}
```

---

### GROUP 3: CRE_TL Role Tests

#### Test 3.1: CRE_TL - Cannot Access Developer Endpoints ❌
**Request:**
```
GET {{base_url}}/developer/users
Authorization: Bearer {{cre_tl_access_token}}
```

**Expected Response (403):**
```json
{
  "message": "Forbidden"
}
```

**Note:** CRE_TL should NOT have access to developer endpoints. This test verifies proper role isolation.

---

#### Test 3.2: CRE_TL - Can View All Leads (Future Endpoint) ✅
**Note:** This test will work once leads endpoints are implemented.

**Request:**
```
GET {{base_url}}/leads
Authorization: Bearer {{cre_tl_access_token}}
```

**Expected Behavior:**
- Should return ALL leads (not filtered by assigned_to)
- Status: 200
- Response: Array of all leads

---

#### Test 3.3: CRE_TL - Can Manage Assignment Rules (Future Endpoint) ✅
**Note:** This test will work once assignment rules endpoints are implemented.

**Request:**
```
POST {{base_url}}/assignment-rules
Authorization: Bearer {{cre_tl_access_token}}
Content-Type: application/json

{
  "name": "Test Rule",
  "sourceId": 1,
  "ruleType": "round-robin",
  "isActive": true
}
```

**Expected Behavior:**
- Should succeed (200/201)
- CRE_TL has permission to manage rules

---

### GROUP 4: CRE Role Tests

#### Test 4.1: CRE - Cannot Access Developer Endpoints ❌
**Request:**
```
GET {{base_url}}/developer/users
Authorization: Bearer {{cre_access_token}}
```

**Expected Response (403):**
```json
{
  "message": "Forbidden"
}
```

---

#### Test 4.2: CRE - Cannot Manage Assignment Rules (Future Endpoint) ❌
**Note:** This test will work once assignment rules endpoints are implemented.

**Request:**
```
POST {{base_url}}/assignment-rules
Authorization: Bearer {{cre_access_token}}
Content-Type: application/json

{
  "name": "Test Rule",
  "ruleType": "round-robin"
}
```

**Expected Response (403):**
```json
{
  "message": "Permission denied: manageAssignmentRules"
}
```

---

#### Test 4.3: CRE - Can Only View Assigned Leads (Future Endpoint) ✅
**Note:** This test will work once leads endpoints are implemented.

**Request:**
```
GET {{base_url}}/leads
Authorization: Bearer {{cre_access_token}}
```

**Expected Behavior:**
- Should return ONLY leads where `assigned_to = CRE's user_id`
- Status: 200
- Response: Filtered array of leads

---

### GROUP 5: Security Tests

#### Test 5.1: Access Protected Endpoint Without Token ❌
**Request:**
```
GET {{base_url}}/auth/profile
(No Authorization header)
```

**Expected Response (401):**
```json
{
  "message": "Missing Authorization header"
}
```

---

#### Test 5.2: Access Protected Endpoint With Expired Token ❌
**Request:**
```
GET {{base_url}}/auth/profile
Authorization: Bearer expired_token_here
```

**Expected Response (401):**
```json
{
  "message": "Invalid token"
}
```

---

#### Test 5.3: Login With Inactive User ❌
**Steps:**
1. Create a user with `status: false`
2. Try to login

**Request:**
```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "username": "inactive_user",
  "password": "password123"
}
```

**Expected Response (401):**
```json
{
  "message": "Invalid credentials"
}
```

**Note:** Inactive users should not be able to login.

---

#### Test 5.4: Try to Update Own User (Should Fail) ❌
**Request:**
```
PATCH {{base_url}}/developer/users/{{user_id}}
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "fullName": "Updated Name"
}
```

**Expected Response (400):**
```json
{
  "message": "Use profile endpoint to update self"
}
```

---

#### Test 5.5: Try to Delete Own User (Should Fail) ❌
**Request:**
```
DELETE {{base_url}}/developer/users/{{user_id}}
Authorization: Bearer {{access_token}}
```

**Expected Response (400):**
```json
{
  "message": "Cannot delete developer session"
}
```

---

### GROUP 6: Edge Cases

#### Test 6.1: Login With Empty Username ❌
**Request:**
```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "username": "",
  "password": "password123"
}
```

**Expected Response (400):**
```json
{
  "message": "Validation failed",
  "details": [...]
}
```

---

#### Test 6.2: Login With Short Password ❌
**Request:**
```
POST {{base_url}}/auth/login
Content-Type: application/json

{
  "username": "test_user",
  "password": "123"
}
```

**Expected Response (400):**
```json
{
  "message": "Validation failed",
  "details": [...]
}
```

---

#### Test 6.3: Refresh Token Twice (Should Fail) ❌
**Steps:**
1. Get refresh token
2. Use it to refresh (should work)
3. Try to use the same refresh token again (should fail - it's revoked)

**Request 1:**
```
POST {{base_url}}/auth/refresh
Content-Type: application/json

{
  "refreshToken": "{{refresh_token}}"
}
```
**Expected:** 200 (first time)

**Request 2:**
```
POST {{base_url}}/auth/refresh
Content-Type: application/json

{
  "refreshToken": "{{refresh_token}}"  // Same token
}
```
**Expected:** 401 (second time - token revoked)

---

## Postman Collection Setup

### Collection Structure:

```
MG CRM - Authentication Tests
├── 1. Authentication Flow
│   ├── 1.1 Developer Login
│   ├── 1.2 CRE_TL Login
│   ├── 1.3 CRE Login
│   ├── 1.4 Invalid Credentials
│   ├── 1.5 Get Profile (Authenticated)
│   ├── 1.6 Get Profile (Unauthenticated)
│   ├── 1.7 Get Profile (Invalid Token)
│   ├── 1.8 Refresh Token
│   ├── 1.9 Refresh Token (Invalid)
│   ├── 1.10 Logout
│   └── 1.11 Refresh After Logout
├── 2. Developer Role Tests
│   ├── 2.1 List All Users
│   ├── 2.2 Create User
│   ├── 2.3 Update User
│   ├── 2.4 Delete User
│   ├── 2.5 CRE_TL Try Developer Endpoint
│   └── 2.6 CRE Try Developer Endpoint
├── 3. CRE_TL Role Tests
│   ├── 3.1 Cannot Access Developer Endpoints
│   ├── 3.2 Can View All Leads (Future)
│   └── 3.3 Can Manage Assignment Rules (Future)
├── 4. CRE Role Tests
│   ├── 4.1 Cannot Access Developer Endpoints
│   ├── 4.2 Cannot Manage Assignment Rules (Future)
│   └── 4.3 Can Only View Assigned Leads (Future)
├── 5. Security Tests
│   ├── 5.1 Access Without Token
│   ├── 5.2 Access With Expired Token
│   ├── 5.3 Login With Inactive User
│   ├── 5.4 Try to Update Own User
│   └── 5.5 Try to Delete Own User
└── 6. Edge Cases
    ├── 6.1 Login With Empty Username
    ├── 6.2 Login With Short Password
    └── 6.3 Refresh Token Twice
```

### Collection-Level Scripts:

**Pre-request Script (Collection Level):**
```javascript
// Set base URL if not set
if (!pm.environment.get("base_url")) {
    pm.environment.set("base_url", "http://localhost:4000");
}
```

**Test Script (Collection Level):**
```javascript
// Global test for response time
pm.test("Response time is less than 2000ms", function () {
    pm.expect(pm.response.responseTime).to.be.below(2000);
});

// Global test for valid JSON
pm.test("Response is valid JSON", function () {
    pm.response.to.be.json;
});
```

---

## Expected Results Summary

### ✅ Should Pass (200/201/204):
- Developer login
- CRE_TL login
- CRE login
- Get profile (authenticated)
- Refresh token
- Logout
- Developer: List/Create/Update/Delete users
- CRE_TL: View all leads (future)
- CRE: View assigned leads (future)

### ❌ Should Fail (401/403/400):
- Invalid credentials
- Unauthenticated requests
- Invalid/expired tokens
- CRE_TL accessing developer endpoints
- CRE accessing developer endpoints
- CRE accessing CRE_TL-only endpoints
- Self-update/delete attempts
- Validation errors

---

## Troubleshooting

### Issue: "Invalid credentials" on valid login
**Solution:**
- Check password hash in database
- Verify bcrypt is working correctly
- Check username is correct

### Issue: "Missing Authorization header"
**Solution:**
- Ensure Authorization header is set: `Bearer {{access_token}}`
- Check token is saved in environment variable

### Issue: "Forbidden" when should have access
**Solution:**
- Verify user role in database
- Check `isDeveloper` flag (for developer access)
- Verify token contains correct user info

### Issue: Server not responding
**Solution:**
- Check server is running: `npm run dev`
- Verify port in environment variables
- Check server logs for errors

### Issue: Database connection errors
**Solution:**
- Verify Supabase credentials in `.env`
- Check Supabase project is active
- Verify network connection

---

## Testing Checklist

### Before Testing:
- [ ] Backend server is running
- [ ] Database is connected
- [ ] Test users are created
- [ ] Postman environment is configured
- [ ] Environment variables are set

### During Testing:
- [ ] Run all authentication flow tests
- [ ] Run all developer role tests
- [ ] Run all CRE_TL role tests
- [ ] Run all CRE role tests
- [ ] Run all security tests
- [ ] Run all edge case tests

### After Testing:
- [ ] All expected tests pass
- [ ] All expected tests fail (negative cases)
- [ ] Tokens are properly saved/updated
- [ ] No unexpected errors in server logs
- [ ] Database state is correct

---

## Next Steps After Testing

Once all authentication tests pass:

1. ✅ **Authentication System Verified**
2. ⏳ **Implement Leads Endpoints** (use permission system)
3. ⏳ **Implement Assignment Rules Endpoints**
4. ⏳ **Add RLS Policies in Supabase**
5. ⏳ **Test Full Integration**

---

## Notes

- **Token Expiration**: Access tokens expire in 15 minutes (configurable)
- **Refresh Token**: Expires in 30 days (configurable)
- **Password Requirements**: Minimum 8 characters (enforced in validation)
- **Role Detection**: Developer is identified by username matching `.env` variable

---

**Happy Testing! 🚀**

