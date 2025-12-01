# 🚀 Quick Start - Testing Guide

## Step-by-Step Testing Instructions

### Step 1: Start Backend Server ✅

```bash
cd EPICMG/Backend
npm install  # If not done already
npm run dev
```

**Verify:** Server should start on `http://localhost:4000` (or your configured port)

---

### Step 2: Create Test Users ✅

**Option A: Using SQL (Recommended)**
1. Open Supabase Dashboard → SQL Editor
2. Run `setup_test_users.sql`
3. Verify users are created

**Option B: Using Developer Endpoint**
1. Login as Developer (use credentials from `.env`)
2. Use `POST /developer/users` to create test users

**Test Users Created:**
- `cre_tl_test` / `cre_tl123` (CRE_TL role)
- `cre1_test` / `cre123` (CRE role)
- `cre2_test` / `cre123` (CRE role)

---

### Step 3: Setup Postman Environment ✅

1. **Import Collection:**
   - Open Postman
   - Click "Import"
   - Select `postman_collection.json`
   - Collection imported ✅

2. **Create Environment:**
   - Click "Environments" → "Create Environment"
   - Name: `MG CRM - Local`
   - Add these variables:

| Variable | Initial Value |
|----------|---------------|
| `base_url` | `http://localhost:4000` |
| `dev_username` | (from your `.env` file) |
| `dev_password` | (from your `.env` file) |
| `cre_tl_username` | `cre_tl_test` |
| `cre_tl_password` | `cre_tl123` |
| `cre1_username` | `cre1_test` |
| `cre1_password` | `cre123` |
| `cre2_username` | `cre2_test` |
| `cre2_password` | `cre123` |
| `access_token` | (leave empty - auto-set) |
| `refresh_token` | (leave empty - auto-set) |
| `cre_tl_access_token` | (leave empty - auto-set) |
| `cre_tl_refresh_token` | (leave empty - auto-set) |
| `cre_access_token` | (leave empty - auto-set) |
| `cre_refresh_token` | (leave empty - auto-set) |
| `user_id` | (leave empty - auto-set) |
| `user_role` | (leave empty - auto-set) |

3. **Select Environment:**
   - Select `MG CRM - Local` from dropdown
   - Ready to test! ✅

---

### Step 4: Run Tests (In Order) ✅

#### Group 1: Authentication Flow
1. ✅ **1.1 Developer Login** - Should get tokens
2. ✅ **1.2 CRE_TL Login** - Should get tokens
3. ✅ **1.3 CRE Login** - Should get tokens
4. ❌ **1.4 Invalid Credentials** - Should fail (401)
5. ✅ **1.5 Get Profile** - Should return user info
6. ❌ **1.6 Get Profile (Unauthenticated)** - Should fail (401)
7. ❌ **1.7 Get Profile (Invalid Token)** - Should fail (401)
8. ✅ **1.8 Refresh Token** - Should get new tokens
9. ❌ **1.9 Refresh Token (Invalid)** - Should fail (401)
10. ✅ **1.10 Logout** - Should succeed (204)
11. ❌ **1.11 Refresh After Logout** - Should fail (401)

#### Group 2: Developer Role Tests
1. ✅ **2.1 List All Users** - Should return all users
2. ✅ **2.2 Create User** - Should create new user
3. ✅ **2.3 Update User** - Should update user
4. ✅ **2.4 Delete User** - Should delete user
5. ❌ **2.5 CRE_TL Try Developer Endpoint** - Should fail (403)
6. ❌ **2.6 CRE Try Developer Endpoint** - Should fail (403)

#### Group 3: Security Tests
1. ❌ **3.1 Access Without Token** - Should fail (401)
2. ❌ **3.2 Access With Expired Token** - Should fail (401)

---

### Step 5: Verify Results ✅

**All tests should pass/fail as expected:**
- ✅ Green checkmarks for successful operations
- ❌ Red X for expected failures (401/403)

**Check Environment Variables:**
- After login tests, tokens should be auto-saved
- Check Postman environment - tokens should be populated

---

## 🐛 Troubleshooting

### Issue: "Invalid credentials"
**Solution:**
- Check password hashes in database
- Verify test users exist: `SELECT * FROM users WHERE username LIKE '%test%';`
- Try creating users via Developer endpoint

### Issue: "Missing Authorization header"
**Solution:**
- Ensure you selected the environment
- Check token is saved in environment variables
- Manually set `Authorization: Bearer {{access_token}}`

### Issue: "Forbidden" when should have access
**Solution:**
- Verify user role in database
- Check `isDeveloper` flag (username matches `.env`)
- Verify token contains correct user info

### Issue: Server not responding
**Solution:**
- Check server is running: `npm run dev`
- Verify port in environment: `http://localhost:4000`
- Check server logs for errors

---

## 📊 Expected Test Results

### ✅ Should Pass (200/201/204):
- All login tests (Developer, CRE_TL, CRE)
- Get profile (authenticated)
- Refresh token
- Logout
- Developer: List/Create/Update/Delete users

### ❌ Should Fail (401/403/400):
- Invalid credentials
- Unauthenticated requests
- Invalid/expired tokens
- CRE_TL accessing developer endpoints
- CRE accessing developer endpoints
- Self-update/delete attempts

---

## ✅ Testing Checklist

Before starting:
- [ ] Backend server is running
- [ ] Database is connected
- [ ] Test users are created
- [ ] Postman collection imported
- [ ] Postman environment configured
- [ ] Environment variables set

During testing:
- [ ] Run all authentication flow tests
- [ ] Run all developer role tests
- [ ] Run all security tests
- [ ] Verify tokens are saved
- [ ] Check server logs for errors

After testing:
- [ ] All expected tests pass
- [ ] All expected tests fail (negative cases)
- [ ] No unexpected errors
- [ ] Ready to move forward! 🚀

---

## 🎯 Next Steps After Testing

Once all tests pass:

1. ✅ **Authentication System Verified**
2. ⏳ **Apply Database Schema Improvements** (run `schema_improvements.sql`)
3. ⏳ **Implement Leads Endpoints**
4. ⏳ **Implement Assignment Rules Endpoints**
5. ⏳ **Add RLS Policies in Supabase**

---

**Happy Testing! 🚀**

If you encounter any issues, check:
- Server logs
- Database connection
- Environment variables
- Token expiration

