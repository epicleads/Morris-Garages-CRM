# 🔧 Setup Sources - Before Creating Leads

## ⚠️ Important: Create Sources First!

Before creating leads, you need to create sources in the `sources` table. The `sourceId` in your lead creation must reference an existing source.

---

## 📋 How to Create Sources

### Option 1: Using SQL (Supabase Dashboard)

Run this SQL in Supabase SQL Editor:

```sql
-- Create common sources
INSERT INTO sources (display_name, source_type, webhook_secret, field_mapping)
VALUES 
  ('GOOGLE', 'Websites', NULL, '{"name": "full_name", "phone": "phone_number"}'),
  ('META', 'meta', 'your_meta_webhook_secret', '{"name": "full_name", "phone": "phone_number"}'),
  ('GOOGLE', 'google', 'your_google_webhook_secret', '{"name": "full_name", "phone": "phone_number"}'),
  ('CarDekho', 'cardekho', NULL, '{"name": "full_name", "phone": "phone_number"}'),
  ('CarWale', 'carwale', NULL, '{"name": "full_name", "phone": "phone_number"}'),
  ('Knowlarity', 'knowlarity', NULL, '{"name": "full_name", "phone": "phone_number"}'),
  ('Manual Entry', 'manual', NULL, NULL)
ON CONFLICT DO NOTHING;

-- Verify sources created
SELECT id, display_name, source_type FROM sources ORDER BY id;
```

---

### Option 2: Using Postman/API (If you have a sources endpoint)

**Note:** You might need to create a sources management endpoint first, or use SQL.

---

## 🔍 Check Existing Sources

Run this SQL to see all sources:

```sql
SELECT 
  id,
  display_name,
  source_type,
  total_leads_count,
  created_at
FROM sources
ORDER BY id;
```

---

## ✅ After Creating Sources

Once sources are created, you can use their IDs in lead creation:

```json
{
  "fullName": "Test Lead",
  "phoneNumber": "9876543210",
  "sourceId": 1  // ✅ This will work if source ID 1 exists
}
```

---

## 🚨 Common Issues

### Issue: "Source ID does not exist"
**Solution:**
1. Check what sources exist: `SELECT * FROM sources;`
2. Use a valid source ID
3. Or don't include `sourceId` (it's optional)

### Issue: "Foreign key constraint violation"
**Solution:**
- The `sourceId` you're using doesn't exist
- Create the source first, or remove `sourceId` from your request

---

## 📝 Quick Setup Script

Copy and run this in Supabase SQL Editor:

```sql
-- Create all common sources
INSERT INTO sources (display_name, source_type) VALUES
  ('Website Forms', 'website'),
  ('Meta Lead Ads', 'meta'),
  ('Google Lead Forms', 'google'),
  ('CarDekho', 'cardekho'),
  ('CarWale', 'carwale'),
  ('Knowlarity', 'knowlarity'),
  ('Manual Entry', 'manual')
ON CONFLICT DO NOTHING;

-- Show created sources
SELECT id, display_name, source_type FROM sources;
```

---

## 💡 Best Practice

1. **Create sources first** before creating leads
2. **Use source IDs** from the `sources` table
3. **Or omit sourceId** if creating manual leads (it's optional)

---

**After creating sources, you can create leads with `sourceId`! 🚀**

