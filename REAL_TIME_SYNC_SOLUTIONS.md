# Real-Time Lead Sync Solutions - Discussion Document

**Problem:** Current 15-minute delay between call/lead generation and CRM visibility  
**Impact:** CREs can't act on fresh leads immediately, poor user experience  
**Current Setup:** GitHub Actions running every 15 minutes

---

## 📊 Current Situation Analysis

### **Current Flow:**
1. Call happens on Knowlarity / Lead form submitted on Meta
2. **Wait up to 15 minutes** (worst case)
3. GitHub Actions triggers sync
4. Lead appears in CRM
5. CRE can now act

### **Problems:**
- **15-minute delay** is too long for sales operations
- CRE might miss time-sensitive opportunities
- Poor user experience

---

## 🎯 Solution Options

### **Option 1: Reduce GitHub Actions Interval** ⚠️

**Approach:** Change cron from `*/15 * * * *` to `*/1 * * * *` (every 1 minute)

**Pros:**
- ✅ Simple change (just update workflow file)
- ✅ No infrastructure changes
- ✅ No additional costs for setup
- ✅ Reduces delay to 1 minute (max)

**Cons:**
- ⚠️ **GitHub Actions Free Tier Limits:**
  - 2,000 minutes/month (free)
  - 1-minute intervals = 1,440 runs/month = ~1,440 minutes
  - **Risk:** May exceed free tier during peak usage
- ⚠️ **GitHub Actions Paid Tier:**
  - $0.008 per minute (after free tier)
  - ~$11.52/month for 1,440 minutes
  - Additional runs = additional costs
- ⚠️ Still has 1-minute delay (not truly real-time)
- ⚠️ GitHub Actions can have cold starts (adds latency)

**Recommendation:** ⭐⭐⭐ (Good for short-term, not ideal long-term)

---

### **Option 2: Webhook-Based Real-Time Sync** ⭐⭐⭐⭐⭐

**Approach:** Use webhooks from Meta/Knowlarity to trigger immediate sync

**How it works:**
1. Configure webhook in Meta/Knowlarity dashboard
2. When call/lead happens → Webhook fires → Your backend receives it
3. Backend processes immediately → Lead appears in CRM instantly

**Pros:**
- ✅ **True real-time** (near-instant)
- ✅ No polling needed (efficient)
- ✅ No GitHub Actions usage
- ✅ Scalable (handles any volume)
- ✅ Lower costs (only process when events happen)

**Cons:**
- ⚠️ Need to check if Meta/Knowlarity support webhooks
- ⚠️ Need to create webhook endpoint in backend
- ⚠️ Need to handle webhook security (signatures, tokens)
- ⚠️ Need to handle webhook failures/retries

**Implementation Steps:**
1. Check Meta Lead Ads webhook support
2. Check Knowlarity webhook support
3. Create `POST /webhooks/meta` endpoint
4. Create `POST /webhooks/knowlarity` endpoint
5. Verify webhook signatures
6. Process leads immediately
7. Keep scheduled sync as backup

**Recommendation:** ⭐⭐⭐⭐⭐ (Best long-term solution)

---

### **Option 3: Backend Polling Service** ⭐⭐⭐⭐

**Approach:** Run sync script as a background service on your backend server

**How it works:**
1. Create a Node.js/TypeScript service that polls every 30s-1min
2. Run it as a background process on your Render server
3. Use `setInterval` or a job queue (BullMQ, Agenda.js)

**Pros:**
- ✅ Full control over interval (30s, 1min, etc.)
- ✅ No GitHub Actions limits
- ✅ Can run continuously
- ✅ Lower latency than GitHub Actions
- ✅ Can add retry logic, error handling

**Cons:**
- ⚠️ Need to keep backend running 24/7
- ⚠️ Uses backend resources (CPU, memory)
- ⚠️ Need to handle process crashes/restarts
- ⚠️ Still has polling delay (not truly real-time)

**Implementation:**
```typescript
// services/sync-worker.service.ts
import { scheduleJob } from 'node-schedule';

export function startSyncWorker() {
  // Sync Knowlarity every 1 minute
  scheduleJob('*/1 * * * *', async () => {
    await syncKnowlarityCalls();
  });
  
  // Sync Meta every 5 minutes (less frequent)
  scheduleJob('*/5 * * * *', async () => {
    await syncMetaLeads();
  });
}
```

**Recommendation:** ⭐⭐⭐⭐ (Good alternative if webhooks not available)

---

### **Option 4: Hybrid Approach (Webhooks + Scheduled Backup)** ⭐⭐⭐⭐⭐

**Approach:** Use webhooks for real-time + scheduled syncs as backup

**How it works:**
1. **Primary:** Webhooks for immediate sync
2. **Backup:** GitHub Actions every 15-30 minutes (catches missed webhooks)
3. **Fallback:** Backend polling every 5 minutes (if webhooks fail)

**Pros:**
- ✅ Best of all worlds
- ✅ Real-time when webhooks work
- ✅ Backup ensures no leads are missed
- ✅ Resilient to failures

**Cons:**
- ⚠️ More complex setup
- ⚠️ Need to handle deduplication (same lead from webhook + scheduled)

**Recommendation:** ⭐⭐⭐⭐⭐ (Ideal production solution)

---

### **Option 5: Serverless Functions (Vercel/Netlify/AWS Lambda)** ⭐⭐⭐

**Approach:** Deploy sync scripts as serverless functions with short intervals

**Pros:**
- ✅ No server management
- ✅ Pay per execution
- ✅ Can run every 30s-1min
- ✅ Auto-scaling

**Cons:**
- ⚠️ Additional service to manage
- ⚠️ Cold starts can add latency
- ⚠️ Costs can add up with high frequency
- ⚠️ More complex than current setup

**Recommendation:** ⭐⭐⭐ (Good if you're already using serverless)

---

## 🔍 Checking Webhook Support

### **Meta Lead Ads:**
- ✅ **Supports Webhooks!**
- Meta Lead Ads API supports webhook subscriptions
- Can subscribe to `leadgen` events
- Webhook URL: `https://your-backend.com/webhooks/meta`

**Documentation:** https://developers.facebook.com/docs/graph-api/webhooks/reference/leadgen

### **Knowlarity:**
- ❓ **Need to verify**
- Check Knowlarity API documentation for webhook support
- May need to contact Knowlarity support
- Alternative: Use their real-time API if available

---

## 💡 Recommended Solution: Hybrid Approach

### **Phase 1: Immediate (Quick Fix)**
1. **Reduce GitHub Actions to 1 minute** for Knowlarity
   - Change: `*/15 * * * *` → `*/1 * * * *`
   - Monitor GitHub Actions usage
   - Keep Meta at 4 hours (less critical)

### **Phase 2: Short-term (1-2 weeks)**
2. **Implement Backend Polling Service**
   - Create sync worker in backend
   - Poll Knowlarity every 30 seconds
   - Poll Meta every 5 minutes
   - Keep GitHub Actions as backup (every 15 min)

### **Phase 3: Long-term (1 month)**
3. **Implement Webhook Support**
   - Set up Meta webhook endpoint
   - Set up Knowlarity webhook (if supported)
   - Process leads in real-time
   - Keep scheduled syncs as backup

---

## 📋 Implementation Plan

### **Quick Fix (Today):**
```yaml
# .github/workflows/main.yml
# Change Knowlarity sync to 1 minute
- cron: "*/1 * * * *"  # Every 1 minute
```

**Pros:**
- Immediate improvement (1 min delay instead of 15 min)
- Simple change
- Can implement in 5 minutes

**Cons:**
- Still has 1-minute delay
- May hit GitHub Actions limits

---

### **Backend Polling Service (This Week):**

**File:** `Morris-Garages-CRM/services/sync-worker.service.ts`

```typescript
import { scheduleJob } from 'node-schedule';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function startSyncWorker() {
  // Sync Knowlarity every 30 seconds
  scheduleJob('*/0.5 * * * *', async () => {
    try {
      await execAsync('python knowlarity_sync.py');
      console.log('[Sync Worker] Knowlarity sync completed');
    } catch (error) {
      console.error('[Sync Worker] Knowlarity sync failed:', error);
    }
  });
  
  // Sync Meta every 5 minutes
  scheduleJob('*/5 * * * *', async () => {
    try {
      await execAsync('python meta_sync.py');
      console.log('[Sync Worker] Meta sync completed');
    } catch (error) {
      console.error('[Sync Worker] Meta sync failed:', error);
    }
  });
}
```

**Integration:**
- Add to `server.ts` on startup
- Runs as part of backend process
- No additional infrastructure needed

---

### **Webhook Implementation (Next Month):**

**Backend Endpoint:** `POST /webhooks/meta`

```typescript
// controllers/webhooks.controller.ts
export const metaWebhookController = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Verify webhook signature (Meta requirement)
  const signature = request.headers['x-hub-signature-256'];
  if (!verifyMetaSignature(request.body, signature)) {
    return reply.status(401).send({ message: 'Invalid signature' });
  }

  const event = request.body;
  
  // Process lead immediately
  if (event.entry?.[0]?.changes?.[0]?.value) {
    const leadData = event.entry[0].changes[0].value;
    await processMetaLead(leadData);
  }

  return reply.send({ success: true });
};
```

---

## 🎯 My Recommendation

### **Immediate Action (Today):**
1. ✅ **Reduce GitHub Actions to 1 minute** for Knowlarity
   - Quick win, reduces delay from 15 min to 1 min
   - Monitor usage to ensure we don't exceed limits

### **This Week:**
2. ✅ **Implement Backend Polling Service**
   - Poll Knowlarity every 30 seconds
   - Poll Meta every 5 minutes
   - Keep GitHub Actions as backup (every 15 min)
   - This gives you 30-second delay (much better)

### **Next Month:**
3. ✅ **Implement Webhook Support**
   - Set up Meta webhooks (confirmed supported)
   - Check Knowlarity webhook support
   - Real-time processing
   - Keep polling as backup

---

## 📊 Comparison Table

| Solution | Delay | Cost | Complexity | Scalability |
|----------|-------|------|------------|-------------|
| **GitHub Actions (1 min)** | 1 min | Free (limited) / $11.52/mo | ⭐ Low | ⭐⭐ Medium |
| **Backend Polling (30s)** | 30s | Included in backend | ⭐⭐ Medium | ⭐⭐⭐ Good |
| **Webhooks** | <5s | Included in backend | ⭐⭐⭐ High | ⭐⭐⭐⭐⭐ Excellent |
| **Hybrid (Webhooks + Backup)** | <5s | Included in backend | ⭐⭐⭐⭐ Very High | ⭐⭐⭐⭐⭐ Excellent |

---

## ❓ Questions to Answer

1. **Do you have access to Meta Lead Ads webhook configuration?**
   - If yes → Webhooks are the best solution
   - If no → Backend polling is good alternative

2. **Does Knowlarity support webhooks?**
   - Need to check their API documentation
   - May need to contact support

3. **What's your GitHub Actions usage currently?**
   - Check: https://github.com/settings/billing
   - If low usage → Can safely reduce to 1 min
   - If high usage → Consider backend polling

4. **Is your backend always running (Render free tier sleeps)?**
   - If always running → Backend polling works
   - If sleeps → Need to use GitHub Actions or upgrade

---

## 🚀 Next Steps

**Let's decide:**
1. **Quick fix first?** (Reduce to 1 min GitHub Actions)
2. **Backend polling?** (30-second intervals)
3. **Webhooks?** (Check support first, then implement)

**My suggestion:** Start with **Option 1 (1-minute GitHub Actions)** today, then implement **Option 3 (Backend Polling)** this week for 30-second delays, and plan **Option 2 (Webhooks)** for next month for true real-time.

---

**What do you think? Which approach do you prefer?**

