# Knowlarity Number Filtering Setup Guide

## Overview
The Knowlarity sync script now supports filtering by specific `knowlarity_number` values. Only calls received on the allowed numbers will be processed and imported into the CRM.

## Changes Made

### 1. Script Updates (`knowlarity_sync.py`)
- Added support for `KNOWLARITY_ALLOWED_NUMBERS` environment variable
- Filters records by `knowlarity_number` from the payload
- Normalizes phone numbers (extracts last 10 digits) for comparison
- Backward compatible: if no env var is set, all numbers are processed

### 2. Filtering Logic
- Extracts `knowlarity_number` from each Knowlarity API record
- Normalizes to last 10 digits (e.g., `+919873762618` → `9873762618`)
- Compares against allowed list
- Skips records that don't match

## Setup Instructions

### Step 1: Update Local `.env` File

Add this line to your `.env` file in `Morris-Garages-CRM/`:

```env
KNOWLARITY_ALLOWED_NUMBERS=7799935258,7288885544
```

**Your complete `.env` should now look like:**
```env
KNOWLARITY_API_URL=https://kpi.knowlarity.com/Basic/v1/account/calllog
KNOWLARITY_API_KEY=HDwHGppu368tRViUEzBdn2NxYHalJxfLaz2FrSUt
KNOWLARITY_AUTH_TOKEN=8eb75459-8d97-4b21-a731-0323f8ee13c7
KNOWLARITY_CHANNEL=Basic
KNOWLARITY_SYNC_ENABLED=true
KNOWLARITY_SYNC_INTERVAL_MS=60000
KNOWLARITY_ALLOWED_NUMBERS=7799935258,7288885544
```

### Step 2: Add to GitHub Actions Secrets

Since your script runs via GitHub Actions, you need to add the secret there:

1. **Go to your GitHub repository**
   - Navigate to: `Settings` → `Secrets and variables` → `Actions`

2. **Click "New repository secret"**

3. **Add the secret:**
   - **Name:** `KNOWLARITY_ALLOWED_NUMBERS`
   - **Value:** `7799935258,7288885544`
   - Click "Add secret"

4. **Verify your GitHub Actions workflow file** (usually in `.github/workflows/`)
   - Make sure it's reading environment variables correctly
   - Example:
     ```yaml
     env:
       KNOWLARITY_ALLOWED_NUMBERS: ${{ secrets.KNOWLARITY_ALLOWED_NUMBERS }}
     ```

### Step 3: Test Locally

Run the script locally to verify it works:

```bash
cd Morris-Garages-CRM
python knowlarity_sync.py
```

**Expected output:**
```
[knowlarity-sync] 2025-12-04T... - Filtering enabled: 2 allowed Knowlarity numbers: ['7288885544', '7799935258']
[knowlarity-sync] 2025-12-04T... - Starting Knowlarity sync
...
```

**Check the summary:**
- `skippedNotAllowed`: Count of records filtered out (should be > 0 if there are calls on other numbers)
- `insertedNew`: Only leads from allowed numbers should be inserted

## How It Works

### Example Flow

1. **Knowlarity API returns a call record:**
   ```json
   {
     "uuid": "93b4c091-ab5c-401f-9a0c-e99c20ffc95b",
     "customer_number": "+917330995416",
     "knowlarity_number": "+919873762618",
     "business_call_type": "Missed Call"
   }
   ```

2. **Script normalizes `knowlarity_number`:**
   - `+919873762618` → `9873762618` (last 10 digits)

3. **Checks if `9873762618` is in allowed list:**
   - ✅ If yes: Process the record
   - ❌ If no: Skip and log reason

4. **Only processed records create leads in `leads_master`**

## Adding/Removing Numbers

### To Add a New Number:
1. Update `.env`:
   ```env
   KNOWLARITY_ALLOWED_NUMBERS=7799935258,7288885544,9876543210
   ```

2. Update GitHub Actions secret with the same value

3. Restart the sync (or wait for next scheduled run)

### To Remove a Number:
1. Remove it from the comma-separated list in `.env` and GitHub secret
2. Restart sync

## Troubleshooting

### Issue: All records are being skipped
**Check:**
- Are the numbers in `KNOWLARITY_ALLOWED_NUMBERS` correct? (last 10 digits only)
- Check logs for `knowlarity_number` values in the payload
- Verify the numbers match exactly (no spaces, no country codes in the env var)

### Issue: No filtering happening
**Check:**
- Is `KNOWLARITY_ALLOWED_NUMBERS` set in your environment?
- Check script logs: Should see "Filtering enabled: X allowed Knowlarity numbers"
- If you see "No KNOWLARITY_ALLOWED_NUMBERS set", the env var isn't being read

### Issue: GitHub Actions not using the secret
**Check:**
- Is the secret name exactly `KNOWLARITY_ALLOWED_NUMBERS`?
- Is the workflow file reading `secrets.KNOWLARITY_ALLOWED_NUMBERS`?
- Check GitHub Actions logs for environment variable values

## Summary

✅ **What changed:** Script now filters by `knowlarity_number`  
✅ **What to do:** Add `KNOWLARITY_ALLOWED_NUMBERS=7799935258,7288885544` to `.env` and GitHub Actions secrets  
✅ **Result:** Only calls on those 2 numbers will be imported

