# Assignment Endpoints Documentation

## Overview
This document describes the new assignment endpoints created for the Tele-In Lead Assignment workspace page.

## Database Tables Required

Run the migration SQL file to create the required tables:
```sql
-- See: Backend/migrations/create_assignment_tables.sql
```

This creates:
- `auto_assign_configs` - Stores auto-assign percentage configurations per source
- `telein_assignments` - Stores Tele-In number to CRE assignments

## Endpoints

### 1. GET /leads/unassigned
Get summary of unassigned leads grouped by source.

**Response:**
```json
{
  "by_source": {
    "Meta": 5,
    "Google + Telein": 3,
    "CarDekho": 2
  },
  "total_unassigned": 10
}
```

**Auth:** Requires CRE_TL or Admin role

---

### 2. GET /leads/unassigned/:source
Get unassigned leads for a specific source.

**URL Params:**
- `source` - Source name (e.g., "Meta", "Google + Telein")

**Response:**
```json
[
  {
    "id": "123",
    "uid": "123",
    "customer_name": "John Doe",
    "customer_mobile_number": "9876543210",
    "source": "Meta",
    "sub_source": "Web",
    "created_at": "2024-01-15T10:00:00Z"
  }
]
```

**Auth:** Requires CRE_TL or Admin role

---

### 3. GET /auto-assign-configs/by-source
Get all auto-assign configurations grouped by source.

**Response:**
```json
{
  "Meta": [
    {
      "cre_id": "1",
      "cre_name": "John Doe",
      "percentage": 50,
      "is_active": true
    },
    {
      "cre_id": "2",
      "cre_name": "Jane Smith",
      "percentage": 50,
      "is_active": true
    }
  ],
  "Google + Telein": [
    {
      "cre_id": "1",
      "cre_name": "John Doe",
      "percentage": 100,
      "is_active": true
    }
  ]
}
```

**Auth:** Requires CRE_TL or Admin role

**Note:** Returns empty object `{}` if table doesn't exist or no configs found.

---

### 4. POST /auto-assign-configs
Save auto-assign configuration for a source.

**Body:**
```json
{
  "source": "Meta",
  "sub_source": "Web", // optional, null if not applicable
  "is_active": true,
  "configs": [
    {
      "cre_id": "1",
      "cre_name": "John Doe",
      "percentage": 50
    },
    {
      "cre_id": "2",
      "cre_name": "Jane Smith",
      "percentage": 50
    }
  ]
}
```

**Validation:**
- Percentages should sum to 100 (enforced on frontend)
- All configs must have valid cre_id and cre_name

**Auth:** Requires CRE_TL or Admin role

---

### 5. DELETE /auto-assign-configs
Delete auto-assign configuration for a source.

**Query Params:**
- `source` (required) - Source name
- `sub_source` (optional) - Sub-source name

**Example:**
```
DELETE /auto-assign-configs?source=Meta&sub_source=Web
```

**Auth:** Requires CRE_TL or Admin role

---

### 6. POST /admin/auto-assign/run
Manually trigger auto-assignment for all active configurations.

**Response:**
```json
{
  "message": "Auto-assign completed: 15 leads assigned",
  "total_assigned": 15
}
```

**Auth:** Requires CRE_TL or Admin role

---

### 7. GET /admin/telein-assignments
Get all Tele-In number assignments.

**Response:**
```json
{
  "assignments": [
    {
      "telein_no": "9944008080",
      "cre_id": "1",
      "id": "1",
      "username": "john_doe",
      "full_name": "John Doe"
    },
    {
      "telein_no": "9500007575",
      "cre_id": "2",
      "id": "2",
      "username": "jane_smith",
      "full_name": "Jane Smith"
    }
  ]
}
```

**Auth:** Requires CRE_TL or Admin role

**Note:** Returns empty array if table doesn't exist.

---

### 8. POST /admin/telein-assign
Assign a Tele-In number to a CRE.

**Body:**
```json
{
  "telein_no": "9944008080",
  "cre_id": "1"
}
```

**Response:**
```json
{
  "message": "Tele-In assigned successfully",
  "assignment": {
    "telein_no": "9944008080",
    "cre_id": "1",
    "full_name": "John Doe",
    "username": "john_doe"
  }
}
```

**Auth:** Requires CRE_TL or Admin role

---

## Error Handling

All endpoints handle missing tables gracefully:
- If `auto_assign_configs` table doesn't exist: Returns empty object/array
- If `telein_assignments` table doesn't exist: Returns empty array

This allows the frontend to work even before migrations are run.

## Database Schema Notes

- `leads_master` table is used as-is (no modifications needed)
- `sources` table is queried for source display names
- `sub_source` information is extracted from `leads_master.raw_payload` JSONB field
- Both new tables (`auto_assign_configs`, `telein_assignments`) need to be created via migration

