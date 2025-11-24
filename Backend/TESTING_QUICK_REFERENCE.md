# ⚡ Quick Testing Reference - Leads CRUD

## 🚀 Quick Start (5 Minutes)

### 1. Login
```
POST {{base_url}}/auth/login
Body: { "username": "{{cre_tl_username}}", "password": "{{cre_tl_password}}" }
```
**Save token:** `cre_tl_access_token`

---

### 2. Create Lead
```
POST {{base_url}}/leads
Authorization: Bearer {{cre_tl_access_token}}
Body: {
  "fullName": "Test Lead",
  "phoneNumber": "9876543210"
}
```
**Save lead ID:** `lead_id`

---

### 3. List Leads
```
GET {{base_url}}/leads?page=1&limit=50
Authorization: Bearer {{cre_tl_access_token}}
```

---

### 4. Get Single Lead
```
GET {{base_url}}/leads/{{lead_id}}
Authorization: Bearer {{cre_tl_access_token}}
```

---

### 5. Update Status
```
PATCH {{base_url}}/leads/{{lead_id}}/status
Authorization: Bearer {{cre_tl_access_token}}
Body: {
  "status": "Working",
  "remarks": "Called customer",
  "attemptNo": 1
}
```

---

### 6. Get Timeline
```
GET {{base_url}}/leads/{{lead_id}}/timeline
Authorization: Bearer {{cre_tl_access_token}}
```

---

## 📋 All Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/leads` | ✅ | List leads (with filters) |
| GET | `/leads/:id` | ✅ | Get single lead |
| GET | `/leads/:id/timeline` | ✅ | Get lead history |
| GET | `/leads/followups/today` | ✅ | Today's follow-ups |
| GET | `/leads/stats` | ✅ | Statistics |
| POST | `/leads` | ✅ CRE_TL+ | Create lead |
| PATCH | `/leads/:id/status` | ✅ | Update status |
| POST | `/leads/:id/qualify` | ✅ | Qualify lead |

---

## 🔍 Filter Examples

### Today
```
GET /leads?filterType=today
```

### MTD
```
GET /leads?filterType=mtd
```

### Custom Date
```
GET /leads?filterType=custom&dateFrom=2024-01-01T00:00:00Z&dateTo=2024-01-31T23:59:59Z
```

### Search
```
GET /leads?search=John
```

### Combined
```
GET /leads?status=New&sourceId=1&filterType=today&page=1&limit=50
```

---

## ✅ Test Checklist

- [ ] Login works
- [ ] Create lead works
- [ ] List leads works
- [ ] Get single lead works
- [ ] Update status works
- [ ] Timeline shows all attempts
- [ ] Filters work
- [ ] CRE sees only assigned leads
- [ ] CRE_TL sees all leads

---

**For detailed testing, see `TESTING_LEADS_CRUD.md`**

