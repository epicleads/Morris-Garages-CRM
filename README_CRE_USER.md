# CRE User Credentials Guide

## Quick Test CRE User Credentials

### Option 1: Use the Script (Recommended)

Create a CRE user instantly using the script:

```bash
cd Backend
npx ts-node scripts/create-cre-user.ts
```

**Default credentials created:**
- **Username:** `testcre`
- **Password:** `Test123456`
- **Full Name:** `Test CRE User`
- **Role:** `CRE`

### Option 2: Use Existing Test Users (from SQL file)

If you've run `setup_test_users.sql`, you have these test users:

#### CRE User 1
- **Username:** `cre1_test`
- **Password:** `cre123`
- **Full Name:** `Test CRE 1`
- **Role:** `CRE`
- **Email:** `cre1@test.com`

#### CRE User 2
- **Username:** `cre2_test`
- **Password:** `cre123`
- **Full Name:** `Test CRE 2`
- **Role:** `CRE`
- **Email:** `cre2@test.com`

#### CRE Team Lead
- **Username:** `cre_tl_test`
- **Password:** `cre_tl123`
- **Full Name:** `Test Team Lead`
- **Role:** `CRE_TL`
- **Email:** `cre_tl@test.com`

> **Note:** To set up these users, run `Backend/setup_test_users.sql` in your Supabase SQL Editor. Make sure to update the password hashes first using the `generate_password_hash.js` script.

## Custom CRE User Creation

To create a CRE user with custom credentials:

```bash
cd Backend
npx ts-node scripts/create-cre-user.ts \
  --username mycre \
  --password MySecurePassword123 \
  --fullName "My CRE User" \
  --email cre@example.com \
  --phoneNumber "+1234567890"
```

## Creating via API (Requires Developer Account)

If you're logged in as the Developer account, you can create a CRE user via the API:

```bash
curl -X POST http://localhost:5000/developer/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "username": "testcre",
    "password": "Test123456",
    "role": "CRE",
    "fullName": "Test CRE User",
    "status": true
  }'
```

## Login

After creating a user, login at:
- **URL:** `http://localhost:3000/login`
- Use the username and password from above

## User Roles

The system supports three roles:
- **CRE** - Customer Relationship Executive (standard user)
- **CRE_TL** - Team Lead (can view all leads and manage assignments)
- **Admin** - Full administrative access
- **Developer** - Special role (automatically created from environment variables)

## Developer Account

The Developer account is automatically created on server startup from environment variables:
- `DEVELOPER_USERNAME` - from `.env` file
- `DEVELOPER_PASSWORD` - from `.env` file

This account has `CRE_TL` role privileges and can create/manage users.

## Password Requirements

- Minimum 8 characters
- Used with bcrypt hashing (10 rounds)

## Generate Password Hashes

To generate a password hash for SQL insertion:

```bash
cd Backend
node scripts/generate_password_hash.js your_password
```

## Listing All Users

To list all users (requires Developer or Admin role):

```bash
curl -X GET http://localhost:5000/developer/users \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Or in the frontend, if you're logged in as a Team Lead or Admin, you can view users in the Team Pipeline section.
