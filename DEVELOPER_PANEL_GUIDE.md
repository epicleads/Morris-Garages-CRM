# Developer Panel - Monitoring Guide

## 📊 What You'll See in the Dashboard

### 1. **System Health Cards**
- **Database Status**: Shows if Supabase connection is healthy
- **Recent Errors (24h)**: Count of errors in the last 24 hours
- **Total Logs**: Total number of logs in the system

### 2. **Log Statistics**
- **Total Logs**: All logs (error, warn, info, debug)
- **Errors**: Critical errors that need attention
- **Warnings**: Non-critical issues to monitor
- **Info**: General information logs

### 3. **Logs Page** (`/developer/logs`)
- View all system logs with filters
- Search by message
- Filter by level (error, warn, info, debug)
- See which user triggered each log
- View metadata/details for each log

### 4. **Errors Page** (`/developer/errors`)
- Focused view of only errors
- Quick identification of issues
- Error details and context

---

## 🔍 What Gets Logged

Currently, **we're NOT logging anything yet**. The dashboard is ready, but we need to add logging calls throughout the application.

### What Should Be Logged:

1. **API Errors** (500, 400 errors)
   - Failed authentication attempts
   - Validation errors
   - Database errors
   - External API failures

2. **Critical Operations**
   - User creation/deletion
   - Lead assignments
   - Qualification updates
   - Import/export operations

3. **System Events**
   - Sync worker failures
   - Webhook processing errors
   - Background job failures

4. **Warnings**
   - Slow queries
   - Rate limit approaching
   - Deprecated API usage

5. **Info/Debug**
   - Successful operations (optional)
   - Performance metrics
   - User actions (for audit)

---

## 🛠️ How to Add Logging

### Step 1: Import the logging service
```typescript
import { writeSystemLog } from '../services/logging.service';
```

### Step 2: Add logging in error handlers
```typescript
try {
  // Your code
} catch (error: any) {
  await writeSystemLog({
    level: 'error',
    message: `Failed to process lead: ${error.message}`,
    metadata: { leadId: 123, userId: user.id },
    user_id: user.id
  });
  throw error;
}
```

### Step 3: Add logging for important events
```typescript
await writeSystemLog({
  level: 'info',
  message: 'Lead qualified successfully',
  metadata: { leadId: 123, qualifiedBy: user.id },
  user_id: user.id
});
```

---

## 📝 Example: Adding Logging to Controllers

### Example 1: Error Logging in Controller
```typescript
export const someController = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    // Your logic
  } catch (error: any) {
    await writeSystemLog({
      level: 'error',
      message: `Controller error: ${error.message}`,
      metadata: {
        endpoint: request.url,
        method: request.method,
        userId: request.authUser?.id
      },
      user_id: request.authUser?.id
    });
    return reply.status(500).send({ message: error.message });
  }
};
```

### Example 2: Warning for Slow Operations
```typescript
const startTime = Date.now();
// ... do work ...
const duration = Date.now() - startTime;

if (duration > 5000) { // 5 seconds
  await writeSystemLog({
    level: 'warn',
    message: `Slow operation detected: ${duration}ms`,
    metadata: { operation: 'lead-import', duration }
  });
}
```

---

## 🎯 Priority Places to Add Logging

1. **Error Handlers** (server.ts, controllers)
2. **Authentication** (auth.service.ts)
3. **Lead Operations** (leads.service.ts, cre.service.ts)
4. **Import/Export** (import.service.ts)
5. **Sync Workers** (sync-worker.service.ts)
6. **Webhooks** (webhooks.controller.ts)

---

## 🔄 Current Status

✅ **Ready:**
- Dashboard UI
- Log viewing pages
- Logging service functions
- Database table exists

❌ **Not Started:**
- Actual logging calls in the codebase
- Error logging in controllers
- Event logging for operations

---

## 🚀 Next Steps

1. Add error logging to all controllers
2. Add logging to critical services
3. Add warning logs for slow operations
4. Add info logs for important events
5. Test the dashboard to see logs appear

---

## 📊 What You'll Monitor

Once logging is added, you'll be able to:

- **Track Errors**: See all errors in real-time
- **Monitor Performance**: Identify slow operations
- **Audit Trail**: See who did what and when
- **Debug Issues**: Get context for problems
- **System Health**: Monitor database and API health

---

**Note**: The dashboard is currently showing "0" for everything because we haven't added logging calls yet. Once we add logging throughout the application, data will start appearing automatically!

