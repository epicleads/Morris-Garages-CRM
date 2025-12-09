# Knowlarity Hook API Strategy

## 🎯 What You Found

Based on the dashboard screenshots:

1. **"Hook API" Section** ✅
   - This is where we configure **custom webhooks**
   - Shows existing APIs (like "Raam Group K..", "Scale Dino")
   - Has "Add API" button to create new webhooks
   - API Type: POST
   - API URL: Where Knowlarity sends webhook data

2. **"Integrations" Section** ⚠️
   - Pre-built CRM integrations (Freshdesk, Salesforce, etc.)
   - These are **not** what we need
   - We need a **custom webhook** via Hook API

---

## 💡 Strategy: Use Hook API for Real-Time Sync

### **Approach:**

1. **Create a new Hook API in Knowlarity Dashboard:**
   - Click "Add API" button
   - API Name: "MG CRM Lead Sync" (or similar)
   - API Type: POST
   - API URL: `https://morris-garages-crm.onrender.com/webhooks/knowlarity`

2. **Configure Events:**
   - Select which call events to send (Call Completed, Call Logged, etc.)
   - This will trigger webhook when calls happen

3. **Implement Backend Endpoint:**
   - Create `/webhooks/knowlarity` endpoint
   - Process incoming call data immediately
   - Create/update leads in real-time

---

## 🔍 Questions to Answer First

### **1. What events are available in Hook API?**

When you click "Add API", you should see:
- Event types (Call Completed, Call Started, etc.)
- Configuration options
- Test functionality

**Action:** Click "Add API" and see what options are available.

---

### **2. What data format does Hook API send?**

The webhook payload might be:
- Same format as the GET call logs API response
- Or a different webhook-specific format

**Action:** Check Knowlarity documentation or test with a sample call.

---

### **3. Do we need authentication?**

Hook API might require:
- API Key in headers
- Signature verification
- IP whitelisting

**Action:** Check if there's a "Secret" or "Token" field when creating the Hook API.

---

## 📋 Implementation Plan

### **Phase 1: Configure Hook API (In Dashboard)** 🎯

1. **Click "Add API" in Hook API section**
2. **Fill in details:**
   ```
   API Name: MG CRM Lead Sync
   API Type: POST
   API URL: https://morris-garages-crm.onrender.com/webhooks/knowlarity
   ```
3. **Select events:**
   - ✅ Call Completed (most important)
   - ✅ Call Logged
   - (Optional) Call Started
4. **Save/Enable the Hook API**

---

### **Phase 2: Implement Backend Endpoint** 🚀

**File:** `Morris-Garages-CRM/controllers/webhooks.controller.ts`

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { processKnowlarityWebhook } from '../services/webhooks.service';

export const knowlarityWebhookController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Log incoming webhook for debugging
    console.log('[Webhook] Received Knowlarity webhook:', {
      headers: request.headers,
      body: request.body,
    });

    const payload = request.body as any;
    
    // Process the call log immediately
    await processKnowlarityWebhook(payload);
    
    return reply.send({ success: true, message: 'Webhook processed' });
  } catch (error: any) {
    console.error('[Webhook] Knowlarity webhook error:', error);
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

// Reuse functions from knowlarity_sync.py logic
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export async function processKnowlarityWebhook(payload: any) {
  console.log('[Webhook Service] Processing webhook payload:', payload);
  
  // Extract call data - format might vary, handle both:
  // 1. Direct call object
  // 2. Wrapped in event/data structure
  const callData = payload.data || payload;
  
  // Normalize phone number
  const normalizedPhone = normalizePhone(
    callData.customer_number || callData.caller_id || callData.customer_number_normalized
  );
  
  if (!normalizedPhone) {
    throw new Error('No valid phone number in webhook payload');
  }
  
  // Ensure Knowlarity source exists
  const { data: sourceRows } = await supabaseAdmin
    .from('sources')
    .select('id, total_leads_count, todays_leads_count')
    .eq('display_name', 'Knowlarity')
    .eq('source_type', 'knowlarity_call')
    .limit(1);
  
  let sourceId: number;
  if (!sourceRows || sourceRows.length === 0) {
    // Create source if doesn't exist
    const { data: newSource, error } = await supabaseAdmin
      .from('sources')
      .insert({
        display_name: 'Knowlarity',
        source_type: 'knowlarity_call',
        total_leads_count: 0,
        todays_leads_count: 0,
      })
      .select('id')
      .single();
    
    if (error || !newSource) {
      throw new Error(`Failed to create Knowlarity source: ${error?.message}`);
    }
    sourceId = newSource.id;
  } else {
    sourceId = sourceRows[0].id;
  }
  
  // Check for existing lead
  const { data: existingLeads, error: queryError } = await supabaseAdmin
    .from('leads_master')
    .select('id, source_id, created_at')
    .eq('phone_number_normalized', normalizedPhone);
  
  if (queryError) {
    throw new Error(`Failed to query existing leads: ${queryError.message}`);
  }
  
  const today = new Date().toISOString().split('T')[0];
  const isToday = callData.start_time?.includes(today) || 
                  callData.created_at?.includes(today) ||
                  true; // Assume today if unclear
  
  if (!existingLeads || existingLeads.length === 0) {
    // Case A: New lead - create immediately
    console.log(`[Webhook Service] Creating new lead for phone: ${normalizedPhone}`);
    
    const { error: insertError } = await supabaseAdmin
      .from('leads_master')
      .insert({
        full_name: `Knowlarity Lead ${normalizedPhone}`,
        phone_number_normalized: normalizedPhone,
        source_id: sourceId,
        external_lead_id: callData.uuid || callData.id?.toString(),
        status: 'New',
        raw_payload: callData,
        is_qualified: false,
        total_attempts: 0,
      });
    
    if (insertError) {
      throw new Error(`Failed to insert lead: ${insertError.message}`);
    }
    
    // Update source counts
    await supabaseAdmin.rpc('increment_source_counts', {
      source_id: sourceId,
      inc_total: 1,
      inc_today: isToday ? 1 : 0,
    });
    
    console.log(`[Webhook Service] Lead created successfully`);
  } else {
    // Check for cross-source duplicate
    const crossSource = existingLeads.find(l => l.source_id !== sourceId);
    
    if (crossSource) {
      // Case C: Cross-source duplicate - add to history
      console.log(`[Webhook Service] Cross-source duplicate for phone: ${normalizedPhone}`);
      
      const { error: histError } = await supabaseAdmin
        .from('lead_sources_history')
        .insert({
          lead_id: crossSource.id,
          source_id: sourceId,
          external_id: callData.uuid || callData.id?.toString(),
          raw_payload: callData,
          received_at: new Date().toISOString(),
          is_primary: false,
        });
      
      if (histError) {
        throw new Error(`Failed to insert history: ${histError.message}`);
      }
      
      // Update source counts
      await supabaseAdmin.rpc('increment_source_counts', {
        source_id: sourceId,
        inc_total: 1,
        inc_today: isToday ? 1 : 0,
      });
    } else {
      // Case B: Same-source duplicate - skip
      console.log(`[Webhook Service] Same-source duplicate, skipping: ${normalizedPhone}`);
    }
  }
}
```

**File:** `Morris-Garages-CRM/routes/webhooks.routes.ts`

```typescript
import { FastifyInstance } from 'fastify';
import { knowlarityWebhookController } from '../controllers/webhooks.controller';

export async function webhookRoutes(fastify: FastifyInstance) {
  // Webhook endpoint - no auth required (Knowlarity will call this)
  // We can add signature verification later if needed
  fastify.post('/webhooks/knowlarity', knowlarityWebhookController);
}
```

**Register in `server.ts`:**
```typescript
import { webhookRoutes } from './routes/webhooks.routes';
// ... in buildServer()
fastify.register(webhookRoutes);
```

---

## 🧪 Testing Strategy

### **1. Test Webhook Endpoint Locally:**

```bash
# Test with sample payload
curl -X POST http://localhost:5000/webhooks/knowlarity \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "test-123",
    "customer_number": "+918019858999",
    "agent_number": "+918121119250",
    "knowlarity_number": "+919873762618",
    "start_time": "2025-12-06 11:11:21+05:30",
    "call_duration": 293,
    "business_call_type": "Call Group"
  }'
```

### **2. Test in Knowlarity Dashboard:**
- Some dashboards have "Test Webhook" button
- Or make a test call and check if webhook fires

### **3. Monitor Logs:**
- Check backend logs for webhook requests
- Verify leads are created in database

---

## 🔒 Security Considerations

### **1. Signature Verification (If Available):**

If Knowlarity provides a signature header:

```typescript
import crypto from 'crypto';

function verifyKnowlaritySignature(
  payload: any,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');
  
  return signature === expectedSignature || 
         signature === `sha256=${expectedSignature}`;
}
```

### **2. IP Whitelisting:**
- Ask Knowlarity for their webhook IP ranges
- Whitelist in your backend/firewall

### **3. Rate Limiting:**
- Add rate limiting to prevent abuse
- Knowlarity shouldn't send too many requests

---

## 📊 Hybrid Approach (Recommended)

### **Best of Both Worlds:**

1. **Primary: Hook API (Webhooks)**
   - Real-time processing (<5 seconds)
   - Handles 99% of calls

2. **Backup: Backend Polling (30 seconds)**
   - Catches missed webhooks
   - Handles webhook failures
   - Ensures no leads are missed

3. **Fallback: GitHub Actions (1 minute)**
   - Final safety net
   - Runs every 1 minute as backup

**Result:** 
- ✅ Real-time when webhooks work
- ✅ 30-second delay if webhooks fail
- ✅ 1-minute delay as last resort
- ✅ Zero missed leads

---

## 🎯 Next Steps

### **Immediate (Today):**

1. **Click "Add API" in Hook API section**
2. **Note down:**
   - What fields are required?
   - What events can we subscribe to?
   - Is there a secret/token field?
   - Can we test the webhook?

3. **Share the details with me:**
   - Screenshot of "Add API" form
   - Available event types
   - Any authentication requirements

### **Once We Have Details:**

1. ✅ Configure Hook API in dashboard
2. ✅ Implement backend endpoint
3. ✅ Test with real call
4. ✅ Keep polling as backup

---

## ❓ Questions for You

1. **When you click "Add API", what fields do you see?**
   - API Name?
   - API URL?
   - Event types?
   - Authentication options?

2. **Can you see existing APIs?**
   - What format are they using?
   - Do they have any special configuration?

3. **Is there a "Test" or "Send Test Webhook" button?**
   - This would help us test before going live

**Share what you see, and I'll help you configure it perfectly!** 🚀

