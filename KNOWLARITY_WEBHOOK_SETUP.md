# Knowlarity Webhook Setup Guide

**Status:** Knowlarity supports webhooks, but configuration is done through their dashboard, not via API.

---

## 🔍 Where to Find Webhook Configuration

### **Option 1: Knowlarity Dashboard (Primary Method)**

1. **Log in to Knowlarity Dashboard:**
   - URL: `https://srbetaui.knowlarity.com` or your Knowlarity portal
   - Navigate to: **Settings** → **Integrations** → **Webhooks** (or similar)

2. **Look for:**
   - "Webhook Configuration"
   - "API Integrations"
   - "Call Event Notifications"
   - "Real-time Call Alerts"

3. **Configure Webhook:**
   - Add your webhook URL: `https://morris-garages-crm.onrender.com/webhooks/knowlarity`
   - Select events: "Call Started", "Call Completed", "Call Logged"
   - Save configuration

---

### **Option 2: Contact Knowlarity Support**

If you can't find webhook settings in the dashboard:

1. **Contact Knowlarity Support:**
   - Email: support@knowlarity.com
   - Phone: Check your Knowlarity account for support number
   - Request: "I need to set up webhooks for real-time call log notifications"

2. **Ask them:**
   - "How do I configure webhooks for call events?"
   - "What webhook events are available?"
   - "How do I verify webhook authenticity?"

---

### **Option 3: Check API Documentation**

1. **Knowlarity API Documentation:**
   - URL: `https://srbetaui.knowlarity.com/api-documentation`
   - Look for: "Webhooks", "Callbacks", "Event Subscriptions"

2. **Postman Collection:**
   - URL: `https://www.postman.com/divigo-india/knowlarity/overview`
   - May have webhook examples

---

## 📋 What You Need to Configure

### **Webhook URL:**
```
https://morris-garages-crm.onrender.com/webhooks/knowlarity
```

### **Events to Subscribe:**
- ✅ **Call Completed** (most important - when call ends)
- ✅ **Call Started** (optional - when call begins)
- ✅ **Call Logged** (when call is saved to system)

### **Webhook Payload Format:**
Knowlarity will send POST requests with call data. Expected format:
```json
{
  "event": "call.completed",
  "data": {
    "uuid": "70967713-ca23-4bce-92e9-8617a63e7e9e",
    "customer_number": "+918019858999",
    "agent_number": "+918121119250",
    "knowlarity_number": "+919873762618",
    "start_time": "2025-12-06 11:11:21+05:30",
    "call_duration": 293,
    "business_call_type": "Call Group",
    "call_recording": "https://...",
    // ... other fields
  },
  "timestamp": "2025-12-06T11:16:14+05:30"
}
```

---

## 🚀 Implementation Plan

### **Step 1: Check Knowlarity Dashboard**
1. Log in to Knowlarity dashboard
2. Look for webhook/integration settings
3. If found → Configure webhook URL
4. If not found → Contact support

### **Step 2: Create Webhook Endpoint (Backend)**

**File:** `Morris-Garages-CRM/controllers/webhooks.controller.ts`

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { processKnowlarityWebhook } from '../services/webhooks.service';

export const knowlarityWebhookController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Verify webhook authenticity (if Knowlarity provides signature)
    // const signature = request.headers['x-knowlarity-signature'];
    // if (!verifyKnowlaritySignature(request.body, signature)) {
    //   return reply.status(401).send({ message: 'Invalid signature' });
    // }

    const payload = request.body as any;
    
    // Process the call log immediately
    await processKnowlarityWebhook(payload);
    
    return reply.send({ success: true, message: 'Webhook processed' });
  } catch (error: any) {
    console.error('Knowlarity webhook error:', error);
    return reply.status(500).send({ 
      success: false, 
      message: 'Failed to process webhook',
      error: error.message 
    });
  }
};
```

**File:** `Morris-Garages-CRM/services/webhooks.service.ts`

```typescript
import { supabaseAdmin } from '../config/supabase';
import { normalize_phone_keep_10_digits, ensure_source_row, update_source_counts } from './knowlarity-helpers';

export async function processKnowlarityWebhook(payload: any) {
  // Extract call data from webhook payload
  const callData = payload.data || payload;
  
  // Normalize phone number
  const normalizedPhone = normalize_phone_keep_10_digits(
    callData.customer_number || callData.caller_id
  );
  
  if (!normalizedPhone) {
    throw new Error('No valid phone number in webhook payload');
  }
  
  // Ensure source exists
  const sourceRow = await ensure_source_row();
  const sourceId = sourceRow.id;
  
  // Check for existing lead
  const { data: existingLeads } = await supabaseAdmin
    .from('leads_master')
    .select('id, source_id')
    .eq('phone_number_normalized', normalizedPhone);
  
  if (!existingLeads || existingLeads.length === 0) {
    // New lead - create immediately
    const { error } = await supabaseAdmin
      .from('leads_master')
      .insert({
        full_name: `Knowlarity Lead ${normalizedPhone}`,
        phone_number_normalized: normalizedPhone,
        source_id: sourceId,
        external_lead_id: callData.uuid,
        status: 'New',
        raw_payload: callData,
      });
    
    if (!error) {
      await update_source_counts(sourceId, 1, 1);
    }
  } else {
    // Check for cross-source duplicate
    const crossSource = existingLeads.find(l => l.source_id !== sourceId);
    if (crossSource) {
      // Add to lead_sources_history
      await supabaseAdmin
        .from('lead_sources_history')
        .insert({
          lead_id: crossSource.id,
          source_id: sourceId,
          external_id: callData.uuid,
          raw_payload: callData,
          received_at: new Date().toISOString(),
          is_primary: false,
        });
    }
    // Same-source duplicate - skip
  }
}
```

**File:** `Morris-Garages-CRM/routes/webhooks.routes.ts`

```typescript
import { FastifyInstance } from 'fastify';
import { knowlarityWebhookController } from '../controllers/webhooks.controller';

export async function webhookRoutes(fastify: FastifyInstance) {
  // Webhooks don't require authentication (they use signatures instead)
  // But we can add IP whitelisting or signature verification
  
  fastify.post('/webhooks/knowlarity', knowlarityWebhookController);
}
```

**Register in `server.ts`:**
```typescript
import { webhookRoutes } from './routes/webhooks.routes';
// ...
fastify.register(webhookRoutes);
```

---

## 🔒 Security Considerations

### **1. Webhook Signature Verification**
Knowlarity may provide a signature header. Verify it:

```typescript
function verifyKnowlaritySignature(payload: any, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');
  return signature === expectedSignature;
}
```

### **2. IP Whitelisting**
If Knowlarity provides IP ranges, whitelist them in your backend.

### **3. HTTPS Only**
Ensure your webhook endpoint uses HTTPS (Render provides this automatically).

---

## 📊 Comparison: Webhook vs Polling

| Aspect | Webhooks | Polling (30s) |
|--------|----------|---------------|
| **Delay** | <5 seconds | 30 seconds |
| **Efficiency** | ✅ Only processes when events happen | ⚠️ Polls even when no calls |
| **Reliability** | ⚠️ Depends on Knowlarity delivery | ✅ Always runs |
| **Setup** | ⚠️ Requires Knowlarity dashboard config | ✅ Just code |
| **Cost** | ✅ No extra cost | ✅ No extra cost |

---

## 🎯 Recommended Approach

### **If Webhooks Available:**
1. ✅ Set up webhook endpoint
2. ✅ Configure in Knowlarity dashboard
3. ✅ Keep polling as backup (every 5 minutes)

### **If Webhooks NOT Available:**
1. ✅ Implement backend polling (30 seconds)
2. ✅ Keep GitHub Actions as backup (every 15 minutes)
3. ✅ Contact Knowlarity support to request webhook feature

---

## 📝 Next Steps

1. **Check Knowlarity Dashboard:**
   - Log in and look for webhook settings
   - Take screenshots if you find it

2. **If Found:**
   - Configure webhook URL
   - Test with a call
   - Implement backend endpoint

3. **If Not Found:**
   - Contact Knowlarity support
   - Meanwhile, implement backend polling (30s)

**Let me know what you find in the dashboard, and I'll help implement the solution!**

