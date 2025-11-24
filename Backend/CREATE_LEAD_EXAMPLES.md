# 📝 Create Lead - JSON Body Examples

## Complete Example (All Fields)

```json
{
  "fullName": "Rajesh Kumar",
  "phoneNumber": "+91 98765 43210",
  "alternatePhoneNumber": "+91 98765 43211",
  "sourceId": 1,
  "externalLeadId": "META_LEAD_12345",
  "rawPayload": {
    "ad_id": "123456",
    "ad_name": "MG Hector Campaign",
    "form_id": "789012",
    "created_time": "2024-01-15T10:30:00Z",
    "field_data": [
      {
        "name": "full_name",
        "values": ["Rajesh Kumar"]
      },
      {
        "name": "phone_number",
        "values": ["+91 98765 43210"]
      }
    ]
  }
}
```

---

## Minimal Example (Required Fields Only)

```json
{
  "fullName": "Rajesh Kumar",
  "phoneNumber": "9876543210"
}
```

---

## Examples for Different Sources

### 1. Website Form Lead

```json
{
  "fullName": "Priya Sharma",
  "phoneNumber": "9876543212",
  "alternatePhoneNumber": "9876543213",
  "sourceId": 1,
  "externalLeadId": "WEB_FORM_20240115_001",
  "rawPayload": {
    "form_name": "Contact Us Form",
    "page_url": "https://mgmotors.com/contact",
    "utm_source": "google",
    "utm_campaign": "brand_awareness",
    "submitted_at": "2024-01-15T11:00:00Z"
  }
}
```

---

### 2. Meta (Facebook) Lead Ad

```json
{
  "fullName": "Amit Patel",
  "phoneNumber": "9876543214",
  "sourceId": 2,
  "externalLeadId": "META_LEAD_67890",
  "rawPayload": {
    "ad_id": "123456",
    "ad_name": "MG Hector Test Drive",
    "adset_id": "234567",
    "campaign_id": "345678",
    "form_id": "456789",
    "created_time": "2024-01-15T12:00:00Z",
    "field_data": [
      {
        "name": "full_name",
        "values": ["Amit Patel"]
      },
      {
        "name": "phone_number",
        "values": ["9876543214"]
      },
      {
        "name": "email",
        "values": ["amit@example.com"]
      }
    ]
  }
}
```

---

### 3. Google Lead Form

```json
{
  "fullName": "Sneha Reddy",
  "phoneNumber": "9876543215",
  "sourceId": 3,
  "externalLeadId": "GOOGLE_LEAD_11111",
  "rawPayload": {
    "click_id": "CLICK_123",
    "gclid": "EAIaIQobChMI...",
    "campaign_id": "GOOGLE_CAMP_001",
    "ad_group_id": "AD_GROUP_001",
    "keyword": "mg hector price",
    "created_time": "2024-01-15T13:00:00Z"
  }
}
```

---

### 4. CarDekho Lead

```json
{
  "fullName": "Vikram Singh",
  "phoneNumber": "9876543216",
  "sourceId": 4,
  "externalLeadId": "CARDekho_LEAD_22222",
  "rawPayload": {
    "listing_id": "CD_12345",
    "vehicle_id": "VEH_67890",
    "dealer_id": "DLR_001",
    "enquiry_type": "price_enquiry",
    "created_at": "2024-01-15T14:00:00Z"
  }
}
```

---

### 5. CarWale Lead

```json
{
  "fullName": "Anjali Mehta",
  "phoneNumber": "9876543217",
  "sourceId": 5,
  "externalLeadId": "CarWale_LEAD_33333",
  "rawPayload": {
    "enquiry_id": "CW_12345",
    "car_id": "CAR_67890",
    "variant_id": "VAR_001",
    "city": "Mumbai",
    "created_at": "2024-01-15T15:00:00Z"
  }
}
```

---

### 6. Knowlarity (Telephony) Lead

```json
{
  "fullName": "Rahul Verma",
  "phoneNumber": "9876543218",
  "sourceId": 6,
  "externalLeadId": "KNOWLARITY_CALL_44444",
  "rawPayload": {
    "call_id": "CALL_12345",
    "caller_number": "9876543218",
    "call_duration": 180,
    "call_type": "inbound",
    "ivr_response": "interested_in_test_drive",
    "call_recording_url": "https://recordings.knowlarity.com/...",
    "created_at": "2024-01-15T16:00:00Z"
  }
}
```

---

### 7. Manual Entry (No Source)

```json
{
  "fullName": "Manish Gupta",
  "phoneNumber": "9876543219",
  "alternatePhoneNumber": "9876543220"
}
```

---

## Field Descriptions

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `fullName` | string | ✅ Yes | Customer's full name | "Rajesh Kumar" |
| `phoneNumber` | string | ✅ Yes | Primary phone number (will be normalized) | "9876543210" or "+91 98765 43210" |
| `alternatePhoneNumber` | string | ❌ No | Alternate/secondary phone number | "9876543211" |
| `sourceId` | number | ❌ No | ID from `sources` table | 1, 2, 3, etc. |
| `externalLeadId` | string | ❌ No | External system's lead ID (for tracking) | "META_LEAD_12345" |
| `rawPayload` | object | ❌ No | Complete raw payload from source (for audit) | `{...}` |

---

## Phone Number Formats (All Accepted)

The system automatically normalizes phone numbers (removes all non-digits), so these all work:

```json
{
  "phoneNumber": "9876543210"           // ✅ Works
}
```

```json
{
  "phoneNumber": "+91 98765 43210"      // ✅ Works (normalized to 919876543210)
}
```

```json
{
  "phoneNumber": "(987) 654-3210"       // ✅ Works (normalized to 9876543210)
}
```

```json
{
  "phoneNumber": "98765-43210"           // ✅ Works (normalized to 9876543210)
}
```

---

## Postman Request Example

### Request Setup:
```
Method: POST
URL: {{base_url}}/leads
Headers:
  Authorization: Bearer {{cre_tl_access_token}}
  Content-Type: application/json
```

### Body (raw JSON):
```json
{
  "fullName": "Rajesh Kumar",
  "phoneNumber": "9876543210",
  "alternatePhoneNumber": "9876543211",
  "sourceId": 1,
  "externalLeadId": "WEB_FORM_20240115_001",
  "rawPayload": {
    "form_name": "Contact Us",
    "page_url": "https://mgmotors.com/contact",
    "submitted_at": "2024-01-15T10:30:00Z"
  }
}
```

---

## Expected Response (201 Created)

```json
{
  "message": "Lead created successfully",
  "lead": {
    "id": 1,
    "full_name": "Rajesh Kumar",
    "phone_number_normalized": "9876543210",
    "alternate_phone_number": "9876543211",
    "source_id": 1,
    "external_lead_id": "WEB_FORM_20240115_001",
    "assigned_to": null,
    "assigned_at": null,
    "status": "New",
    "next_followup_at": null,
    "total_attempts": 0,
    "lead_category": null,
    "is_qualified": false,
    "raw_payload": {
      "form_name": "Contact Us",
      "page_url": "https://mgmotors.com/contact",
      "submitted_at": "2024-01-15T10:30:00Z"
    },
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z",
    "source": {
      "id": 1,
      "display_name": "Website Forms",
      "source_type": "website",
      "webhook_secret": null,
      "field_mapping": null
    },
    "assigned_user": null
  }
}
```

---

## Validation Rules

### ✅ Valid Examples:

```json
// Minimum required
{
  "fullName": "Test User",
  "phoneNumber": "9876543210"
}
```

```json
// With all optional fields
{
  "fullName": "Test User",
  "phoneNumber": "9876543210",
  "alternatePhoneNumber": "9876543211",
  "sourceId": 1,
  "externalLeadId": "EXT_123",
  "rawPayload": {}
}
```

### ❌ Invalid Examples:

```json
// Missing required field
{
  "phoneNumber": "9876543210"
  // ❌ Missing fullName
}
```

```json
// Empty fullName
{
  "fullName": "",
  "phoneNumber": "9876543210"
  // ❌ fullName cannot be empty
}
```

```json
// Phone too short
{
  "fullName": "Test User",
  "phoneNumber": "123"
  // ❌ Phone number must be at least 10 digits
}
```

---

## Quick Copy-Paste Templates

### Template 1: Basic Lead
```json
{
  "fullName": "Customer Name",
  "phoneNumber": "9876543210"
}
```

### Template 2: With Source
```json
{
  "fullName": "Customer Name",
  "phoneNumber": "9876543210",
  "sourceId": 1,
  "externalLeadId": "EXT_12345"
}
```

### Template 3: Complete Lead
```json
{
  "fullName": "Customer Name",
  "phoneNumber": "9876543210",
  "alternatePhoneNumber": "9876543211",
  "sourceId": 1,
  "externalLeadId": "EXT_12345",
  "rawPayload": {
    "source": "website",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

---

## Notes

1. **Phone Normalization**: All phone numbers are automatically normalized (non-digits removed)
2. **Duplicate Check**: System checks for existing leads by normalized phone number
3. **Source ID**: Must exist in `sources` table (foreign key constraint)
4. **Auto Log**: A lead_log entry is automatically created when lead is created
5. **Status**: New leads are created with status "New"

---

**Ready to test! Copy any example above and paste into Postman! 🚀**

