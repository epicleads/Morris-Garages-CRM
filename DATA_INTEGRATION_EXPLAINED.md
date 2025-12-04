# Data Integration Flow - Explained

## Overview

Your system fetches leads from **3 external sources**:
1. **Meta (Facebook/Instagram)** - via `meta_sync.py`
2. **Knowlarity** - via `knowlarity_sync.py`
3. **Google** - (similar pattern, not shown but would follow same logic)

These scripts run via **GitHub Actions** on a schedule and sync leads into your Supabase database.

---

## 📊 Database Tables Involved

### 1. `sources` Table
**Purpose**: Master list of all lead sources

| Column | Description | Example |
|--------|-------------|---------|
| `id` | Primary key (BIGSERIAL) | `1`, `2`, `3` |
| `display_name` | **Source Name** (what users see) | `"Meta"`, `"Knowlarity"`, `"Google"` |
| `source_type` | **Sub Source** (technical identifier) | `"meta_form"`, `"knowlarity_call"`, `"google_ads"` |
| `total_leads_count` | Total leads from this source | `1250` |
| `todays_leads_count` | Leads created today | `45` |

**Key Point**: 
- `display_name` = **Source** (shown in UI)
- `source_type` = **Sub Source** (technical identifier)

### 2. `leads_master` Table
**Purpose**: Main leads table - one row per unique phone number

| Column | Description | Example |
|--------|-------------|---------|
| `id` | Primary key | `1001` |
| `full_name` | Customer name | `"John Doe"` |
| `phone_number_normalized` | **Last 10 digits** (for deduplication) | `"9876543210"` |
| `source_id` | **Foreign key to `sources.id`** | `1` (Meta) |
| `external_lead_id` | ID from external platform | `"123456789"` (Meta lead ID) |
| `status` | Lead status | `"New"` |
| `raw_payload` | Full JSON from external API | `{...}` |

### 3. `lead_sources_history` Table
**Purpose**: Track when same phone number comes from multiple sources

| Column | Description | Example |
|--------|-------------|---------|
| `lead_id` | Foreign key to `leads_master.id` | `1001` |
| `source_id` | Foreign key to `sources.id` | `2` (Knowlarity) |
| `external_id` | ID from external platform | `"call-uuid-123"` |
| `raw_payload` | Full JSON from external API | `{...}` |
| `is_primary` | Is this the primary source? | `false` (secondary source) |
| `received_at` | When this source sent the lead | `2025-01-15 10:30:00` |

---

## 🔄 How Data Fetching Works

### **Meta Sync Flow** (`meta_sync.py`)

```
1. Connect to Meta Graph API
   ↓
2. Fetch all ACTIVE lead forms from META_PAGE_ID
   ↓
3. For each form, fetch leads created in last 24 hours (or custom date range)
   ↓
4. Process each lead:
   - Extract phone number (normalize to last 10 digits)
   - Extract name
   - Check if phone already exists in leads_master
   ↓
5. Apply deduplication logic (see below)
```

**Key Functions**:
- `fetch_lead_forms()` - Gets all active forms from Meta page
- `fetch_leads_for_form_stream()` - Streams leads page by page (handles pagination)
- `normalize_phone_keep_10_digits()` - Converts `+91-9876543210` → `"9876543210"`

### **Knowlarity Sync Flow** (`knowlarity_sync.py`)

```
1. Connect to Knowlarity API
   ↓
2. Fetch call logs from last 15 minutes (or custom time range)
   ↓
3. Process each call record:
   - Extract phone from `customer_number` or `caller_id`
   - Normalize to last 10 digits
   - Check if phone already exists in leads_master
   ↓
4. Apply deduplication logic (see below)
```

**Key Functions**:
- `fetch_knowlarity_page()` - Fetches paginated call logs
- `normalize_knowlarity_record()` - Extracts phone, name, timestamp from call record

---

## 🎯 Source Management Logic

### **Step 1: Ensure Source Exists**

Both scripts call `ensure_source_row()` which:

```python
# Meta sync
DISPLAY = "Meta"
TYPE = "meta_form"

# Knowlarity sync
DISPLAY = "Knowlarity"
TYPE = "knowlarity_call"
```

**Logic**:
1. Check if source exists: `SELECT * FROM sources WHERE display_name = 'Meta' AND source_type = 'meta_form'`
2. If exists → return the `id`
3. If NOT exists → INSERT new row:
   ```sql
   INSERT INTO sources (display_name, source_type, total_leads_count, todays_leads_count)
   VALUES ('Meta', 'meta_form', 0, 0)
   ```
4. Return the `source_id` (used later)

**Result**: Each platform gets ONE source row:
- Meta → `{id: 1, display_name: "Meta", source_type: "meta_form"}`
- Knowlarity → `{id: 2, display_name: "Knowlarity", source_type: "knowlarity_call"}`

---

## 🔍 Deduplication Logic (Critical!)

All scripts use the **same 3-case logic** based on phone number:

### **Case A: New Phone Number** ✅
**Scenario**: Phone `9876543210` doesn't exist in `leads_master`

**Action**:
```sql
INSERT INTO leads_master (
    full_name,
    phone_number_normalized,
    source_id,  -- e.g., 1 (Meta)
    external_lead_id,
    status,
    raw_payload
) VALUES (
    'John Doe',
    '9876543210',
    1,  -- Meta source_id
    'meta-lead-123',
    'New',
    '{...}'
)
```

**Result**: New lead created, `sources.total_leads_count++`

---

### **Case B: Same Source Duplicate** ⏭️
**Scenario**: Phone `9876543210` already exists AND `source_id = 1` (Meta)

**Action**: **SKIP** - Don't create duplicate lead from same source

**Example**:
- Lead already exists: `{phone: "9876543210", source_id: 1}` (Meta)
- New Meta lead comes in with same phone
- **Skip** - already have this lead from Meta

**Result**: No action, no count increment

---

### **Case C: Cross-Source Duplicate** 🔗
**Scenario**: Phone `9876543210` exists BUT from different source

**Action**: Add to `lead_sources_history` (NOT `leads_master`)

**Example**:
1. Lead exists: `{phone: "9876543210", source_id: 1}` (Meta)
2. Knowlarity call comes in with same phone
3. **Action**:
   ```sql
   INSERT INTO lead_sources_history (
       lead_id,  -- existing lead's ID
       source_id,  -- 2 (Knowlarity)
       external_id,
       raw_payload,
       is_primary  -- false (Meta is primary)
   ) VALUES (...)
   ```

**Result**: 
- No new lead created
- History record added
- `sources.total_leads_count++` (Knowlarity count increases)

**Why?**: One customer can come from multiple sources, but we keep ONE lead record and track all sources.

---

## 📝 How Leads Enter `leads_master`

### **Initial Values Set**:

```python
insert_payload = {
    "full_name": name,  # From Meta form or Knowlarity call
    "phone_number_normalized": normalized,  # Last 10 digits
    "alternate_phone_number": None,
    "source_id": source_id,  # From ensure_source_row()
    "external_lead_id": raw_lead.get("id"),  # Meta lead ID or Knowlarity UUID
    "assigned_to": None,  # Unassigned initially
    "status": "New",  # Always starts as "New"
    "next_followup_at": None,
    "total_attempts": 0,
    "is_qualified": False,
    "raw_payload": record,  # Full JSON from external API
}
```

**Key Points**:
- `source_id` links to `sources.id`
- `status` always starts as `"New"`
- `assigned_to` is `NULL` (unassigned)
- `raw_payload` stores complete API response for debugging

---

## 🔢 Source Count Updates

After processing leads, scripts update source counts:

```python
update_source_counts(source_id, inc_total, inc_today)
```

**Logic**:
1. Read current counts: `SELECT total_leads_count, todays_leads_count FROM sources WHERE id = ?`
2. Increment:
   - `total_leads_count += inc_total` (always +1 for new/cross-source)
   - `todays_leads_count += inc_today` (only if created today)
3. Update: `UPDATE sources SET total_leads_count = ?, todays_leads_count = ? WHERE id = ?`

**When counts increment**:
- ✅ Case A (new lead): `inc_total = 1`, `inc_today = 1` (if created today)
- ✅ Case C (cross-source): `inc_total = 1`, `inc_today = 1` (if created today)
- ❌ Case B (same-source duplicate): No increment

---

## 🎨 Source vs Sub-Source in UI

### **In Database**:
```sql
sources table:
id | display_name | source_type
1  | "Meta"       | "meta_form"
2  | "Knowlarity" | "knowlarity_call"
3  | "Google"     | "google_ads"
```

### **In Frontend UI**:
- **"Source"** dropdown shows: `display_name` → `"Meta"`, `"Knowlarity"`, `"Google"`
- **"Sub Source"** field shows: `source_type` → `"meta_form"`, `"knowlarity_call"`, `"google_ads"`

**Mapping**:
- `sources.display_name` = **Source** (user-friendly name)
- `sources.source_type` = **Sub Source** (technical identifier)

---

## 🔄 Complete Flow Example

### **Scenario: Meta Lead Comes In**

```
1. GitHub Action triggers meta_sync.py
   ↓
2. ensure_source_row() called
   - Checks: SELECT * FROM sources WHERE display_name='Meta' AND source_type='meta_form'
   - If not exists: INSERT new row, get source_id = 1
   ↓
3. Fetch leads from Meta API (last 24 hours)
   ↓
4. For each lead:
   a. Extract phone: "+91-9876543210" → normalize → "9876543210"
   b. Check: SELECT * FROM leads_master WHERE phone_number_normalized = '9876543210'
   
   c. If NO existing leads (Case A):
      - INSERT INTO leads_master (source_id=1, phone='9876543210', ...)
      - UPDATE sources SET total_leads_count = total_leads_count + 1
   
   d. If exists with source_id=1 (Case B):
      - SKIP (same source duplicate)
   
   e. If exists with source_id=2 (Case C):
      - INSERT INTO lead_sources_history (lead_id=existing_id, source_id=1, ...)
      - UPDATE sources SET total_leads_count = total_leads_count + 1
   ↓
5. Summary returned: {insertedNew: 5, duplicateSameSource: 2, crossSourceHistory: 1}
```

---

## 🚀 GitHub Actions Integration

These scripts run automatically via GitHub Actions:

```yaml
# .github/workflows/sync-leads.yml
on:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes

jobs:
  sync-meta:
    runs-on: ubuntu-latest
    steps:
      - run: python meta_sync.py
      
  sync-knowlarity:
    runs-on: ubuntu-latest
    steps:
      - run: python knowlarity_sync.py
```

**Frequency**:
- **Knowlarity**: Every 15 minutes (lookback: 15 minutes)
- **Meta**: Every 15 minutes (lookback: 24 hours)

---

## 📋 Summary

| Aspect | How It Works |
|--------|--------------|
| **Source Creation** | Auto-created on first sync if doesn't exist |
| **Source ID** | Stored in `leads_master.source_id` (foreign key) |
| **Source Name** | `sources.display_name` → shown as "Source" in UI |
| **Sub Source** | `sources.source_type` → shown as "Sub Source" in UI |
| **Deduplication** | Based on `phone_number_normalized` (last 10 digits) |
| **Cross-Source** | Tracked in `lead_sources_history`, not duplicate leads |
| **Count Updates** | Incremented after each successful insert |

---

## 🔧 Adding New Sources

To add a new source (e.g., "Google Ads"):

1. Create new sync script: `google_sync.py`
2. In `ensure_source_row()`:
   ```python
   DISPLAY = "Google"
   TYPE = "google_ads"
   ```
3. Follow same 3-case deduplication logic
4. Add to GitHub Actions workflow

The system will automatically:
- Create source row on first run
- Handle deduplication
- Track cross-source duplicates
- Update counts

---

## ❓ Common Questions

**Q: What if same phone comes from Meta AND Knowlarity?**
A: One lead in `leads_master` (from first source), second source tracked in `lead_sources_history`.

**Q: How do I see all sources for a lead?**
A: Query `lead_sources_history` WHERE `lead_id = ?` to see all sources that sent this phone number.

**Q: Can I manually add a source?**
A: Yes, via Admin UI → Sources tab → Add Source (or directly in database).

**Q: What's the difference between `source_id` in `leads_master` vs `lead_sources_history`?**
A: 
- `leads_master.source_id` = **Primary source** (where lead first came from)
- `lead_sources_history.source_id` = **Secondary sources** (additional sources for same phone)

