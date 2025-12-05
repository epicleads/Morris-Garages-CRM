# MG CRM - Project Roadmap & Priority Guide

**Last Updated:** December 2024  
**Status:** Active Development

---

## 📋 Overview

This document outlines all remaining features, improvements, and technical tasks for the MG CRM system. Items are organized by priority and phase to guide development efforts.

---

## 🎯 User-Requested Features

### 1. Import Error Handling & Reporting ⚠️ **HIGH PRIORITY**

**Status:** Not Started  
**Priority:** Phase 1 - Critical

**Requirements:**
- Show detailed errors when CSV import fails (case sensitivity, duplicates, invalid data)
- Display row numbers and specific error messages
- Provide downloadable error report CSV
- Allow partial imports (import valid rows, report invalid ones)
- Show error summary before/after import

**Technical Approach:**
- Enhance `importLeads` service to return detailed error array
- Create error report generation (CSV format)
- Add error preview modal before import confirmation
- Store import errors in database for audit trail

**Files to Modify:**
- `Morris-Garages-CRM/services/import.service.ts`
- `EPICMG/frontend/Frontend/src/pages/admin/AllLeads.tsx`
- Create: `EPICMG/frontend/Frontend/src/components/admin/ImportErrorModal.tsx`

**Questions to Answer:**
- [ ] Show errors inline in UI or downloadable report only?
- [ ] Allow re-upload with corrections or manual fix only?
- [ ] Should we store failed imports for retry later?

---

### 2. Raise Ticket / Support System 🎫

**Status:** Not Started  
**Priority:** Phase 3 - Important

**Requirements:**
- "Raise Ticket" button in header (CRE/Admin)
- Ticket form: category, priority, description, screenshots
- Email notifications to developers
- Ticket status tracking (Open, In Progress, Resolved)
- View ticket history

**Technical Approach:**
- Create `support_tickets` table
- Create ticket creation/management endpoints
- Add ticket UI components
- Integrate email service (SendGrid/Nodemailer)
- Add ticket list view for admins

**Database Schema:**
```sql
CREATE TABLE support_tickets (
  id BIGSERIAL PRIMARY KEY,
  created_by BIGINT REFERENCES users(user_id),
  category VARCHAR(50), -- 'bug', 'feature', 'question', 'other'
  priority VARCHAR(20), -- 'low', 'medium', 'high', 'urgent'
  subject TEXT,
  description TEXT,
  status VARCHAR(20) DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
  assigned_to BIGINT REFERENCES users(user_id),
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Files to Create:**
- `Morris-Garages-CRM/services/support.service.ts`
- `Morris-Garages-CRM/controllers/support.controller.ts`
- `Morris-Garages-CRM/routes/support.routes.ts`
- `EPICMG/frontend/Frontend/src/components/modals/RaiseTicketModal.tsx`
- `EPICMG/frontend/Frontend/src/pages/admin/Tickets.tsx`

**Questions to Answer:**
- [ ] Email notifications or in-app notifications only?
- [ ] Should CREs see their own tickets or all tickets?
- [ ] Auto-assign tickets or manual assignment?

---

### 3. Developer Panel 🔧

**Status:** Not Started  
**Priority:** Phase 2 - High Priority

**Requirements:**
- View system logs (API errors, database errors)
- Real-time error monitoring
- Performance metrics
- User activity logs
- System health dashboard

**Technical Approach:**
- Create developer-only routes
- Add log aggregation endpoint
- Create log viewer UI
- Add performance monitoring
- Integrate error tracking (optional: Sentry)

**Database Schema:**
```sql
-- Already have leads_logs, but might need:
CREATE TABLE system_logs (
  id BIGSERIAL PRIMARY KEY,
  level VARCHAR(20), -- 'error', 'warn', 'info', 'debug'
  message TEXT,
  metadata JSONB,
  user_id BIGINT REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Files to Create:**
- `Morris-Garages-CRM/services/logging.service.ts`
- `Morris-Garages-CRM/controllers/developer.controller.ts`
- `EPICMG/frontend/Frontend/src/pages/developer/Dashboard.tsx`
- `EPICMG/frontend/Frontend/src/pages/developer/Logs.tsx`
- `EPICMG/frontend/Frontend/src/pages/developer/Errors.tsx`

**Questions to Answer:**
- [ ] Read-only logs or allow actions (clear logs, restart services)?
- [ ] Real-time updates or refresh button?
- [ ] Log retention period?

---

### 4. Dashboard Improvements 📊

**Status:** Partially Complete  
**Priority:** Phase 2 - High Priority

**Current State:**
- ✅ Basic KPI cards (CRE Dashboard)
- ✅ Basic stats (Admin Dashboard)
- ❌ Charts and visualizations
- ❌ Trends and analytics
- ❌ Performance metrics

**Requirements:**
- **CRE Dashboard:**
  - Personal performance charts
  - Lead conversion funnel
  - Daily/weekly/monthly trends
  - Source performance breakdown
  
- **Admin Dashboard:**
  - Team performance overview
  - Conversion rates by source
  - CRE performance comparison
  - Lead volume trends
  - Revenue metrics (if applicable)

- **TL Dashboard:**
  - Team metrics
  - Individual CRE performance
  - Source distribution
  - Conversion analytics

**Technical Approach:**
- Add charting library (Recharts or Chart.js)
- Create analytics service endpoints
- Build dashboard components
- Add date range filters
- Cache analytics data for performance

**Files to Create/Modify:**
- `Morris-Garages-CRM/services/analytics.service.ts`
- `EPICMG/frontend/Frontend/src/components/dashboard/Charts.tsx`
- `EPICMG/frontend/Frontend/src/components/dashboard/PerformanceMetrics.tsx`
- `EPICMG/frontend/Frontend/src/pages/admin/Dashboard.tsx` (enhance)
- `EPICMG/frontend/Frontend/src/pages/cre/Dashboard.tsx` (enhance)

**Questions to Answer:**
- [ ] Which chart types are most important?
- [ ] Real-time updates or cached data?
- [ ] Export dashboard data?

---

### 5. Enhanced Export Functionality 📤

**Status:** Partially Complete  
**Priority:** Phase 2 - High Priority

**Current State:**
- ✅ Basic CSV export (All Leads, Qualified Leads)
- ❌ Custom column selection
- ❌ Multiple formats (Excel, PDF)
- ❌ Scheduled exports
- ❌ Export templates

**Requirements:**
- Custom export builder (select columns, filters, date ranges)
- Multiple formats (CSV, Excel, PDF)
- Scheduled exports (daily/weekly/monthly)
- Export templates (save and reuse)
- Export history

**Technical Approach:**
- Create export service with format support
- Add column selector UI
- Implement Excel generation (xlsx library)
- Implement PDF generation (jsPDF or PDFKit)
- Add export scheduling (cron jobs or queue)
- Store export templates in database

**Files to Create/Modify:**
- `Morris-Garages-CRM/services/export.service.ts`
- `EPICMG/frontend/Frontend/src/components/admin/ExportBuilder.tsx`
- `EPICMG/frontend/Frontend/src/components/admin/ExportTemplates.tsx`
- Enhance existing export functions

**Questions to Answer:**
- [ ] Which formats are priority? (CSV, Excel, PDF)
- [ ] Export size limits?
- [ ] Background processing for large exports?

---

### 6. Admin View-as-CRE (Impersonation) 👤

**Status:** Not Started  
**Priority:** Phase 1 - Critical

**Requirements:**
- Click on CRE name in User Management
- Directly access their workspace (no login needed)
- Clear indicator showing "Viewing as [CRE Name]"
- Audit logging for impersonation
- Security: only Admin/CRE_TL can impersonate

**Technical Approach:**
- Add impersonation endpoint
- Create temporary session for impersonation
- Add UI indicator in header
- Log all actions during impersonation
- Add "Exit Impersonation" button

**Database Schema:**
```sql
-- Add to existing tables or create new:
CREATE TABLE impersonation_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT REFERENCES users(user_id),
  impersonated_user_id BIGINT REFERENCES users(user_id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  actions_count INTEGER DEFAULT 0
);
```

**Files to Create/Modify:**
- `Morris-Garages-CRM/services/impersonation.service.ts`
- `Morris-Garages-CRM/controllers/impersonation.controller.ts`
- `EPICMG/frontend/Frontend/src/lib/auth.tsx` (add impersonation state)
- `EPICMG/frontend/Frontend/src/components/layouts/DashboardLayout.tsx` (add indicator)
- `EPICMG/frontend/Frontend/src/pages/admin/UserManagement.tsx` (add button)

**Questions to Answer:**
- [ ] Full access or read-only mode?
- [ ] Time limit for impersonation?
- [ ] Notification to CRE when admin views their workspace?

---

### 7. Source Analytics on Click 📈

**Status:** Not Started  
**Priority:** Phase 1 - Critical

**Requirements:**
- Click on source name anywhere in the app
- Open modal/drawer with source analytics:
  - Total leads from source
  - Breakdown by status (New, Qualified, Disqualified, etc.)
  - Conversion funnel
  - Timeline chart (leads over time)
  - Top performing CREs for that source
  - Recent leads from source

**Technical Approach:**
- Create source analytics endpoint
- Build analytics modal component
- Add click handlers to source names
- Create charts for visualization
- Cache analytics data

**Files to Create:**
- `Morris-Garages-CRM/services/source-analytics.service.ts`
- `Morris-Garages-CRM/controllers/source-analytics.controller.ts`
- `EPICMG/frontend/Frontend/src/components/modals/SourceAnalyticsModal.tsx`
- `EPICMG/frontend/Frontend/src/hooks/useSourceAnalytics.ts`

**Questions to Answer:**
- [ ] Simple stats or advanced charts?
- [ ] Real-time or cached data?
- [ ] Export source analytics?

---

## 🔧 Technical Improvements (My Recommendations)

### 8. Data Integrity & Validation ✅

**Status:** Partially Complete  
**Priority:** Phase 1 - Critical

**Current State:**
- ✅ Phone normalization
- ✅ Duplicate detection
- ⚠️ Need: Better validation messages
- ⚠️ Need: Data quality checks

**Tasks:**
- [ ] Enhanced phone number validation
- [ ] Email validation (if applicable)
- [ ] Data quality scoring
- [ ] Automated cleanup jobs
- [ ] Duplicate merge functionality

---

### 9. Performance Optimization ⚡

**Status:** Needs Improvement  
**Priority:** Phase 2 - High Priority

**Tasks:**
- [ ] Implement proper pagination (currently basic)
- [ ] Add virtual scrolling for long lists
- [ ] Query optimization (add missing indexes)
- [ ] API response caching
- [ ] Lazy loading for heavy components
- [ ] Database query optimization

**Database Indexes to Add:**
```sql
-- Check if these exist, add if missing:
CREATE INDEX IF NOT EXISTS idx_leads_master_assigned_to_status 
  ON leads_master(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_leads_master_source_created 
  ON leads_master(source_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_qualification_qualified_by 
  ON leads_qualification(qualified_by);
```

---

### 10. Security Enhancements 🔒

**Status:** Basic Security in Place  
**Priority:** Phase 3 - Important

**Tasks:**
- [ ] API rate limiting
- [ ] Input sanitization audit
- [ ] Session timeout handling
- [ ] Password strength requirements
- [ ] 2FA (optional, future)
- [ ] Audit logging for sensitive operations

---

### 11. Audit Trail & Compliance 📝

**Status:** Partial  
**Priority:** Phase 3 - Important

**Current State:**
- ✅ Basic logging (leads_logs)
- ❌ Comprehensive audit trail
- ❌ Data retention policies

**Tasks:**
- [ ] Enhanced audit logging
- [ ] User activity tracking
- [ ] Data export for compliance
- [ ] Data deletion (GDPR)
- [ ] Audit log viewer

---

### 12. Real-time Features 🔔

**Status:** Not Started  
**Priority:** Phase 3 - Important

**Tasks:**
- [ ] Real-time lead assignment notifications
- [ ] Live dashboard updates
- [ ] WebSocket integration
- [ ] Push notifications
- [ ] In-app notification center

---

### 13. Mobile Responsiveness 📱

**Status:** Needs Testing  
**Priority:** Phase 3 - Important

**Tasks:**
- [ ] Test all modals on mobile
- [ ] Responsive table design
- [ ] Touch-friendly buttons
- [ ] Mobile-optimized forms
- [ ] Mobile navigation

---

### 14. Testing & Quality Assurance 🧪

**Status:** Not Started  
**Priority:** Phase 4 - Nice to Have

**Tasks:**
- [ ] Unit tests for critical functions
- [ ] Integration tests for API endpoints
- [ ] E2E tests for key workflows
- [ ] Error boundary components
- [ ] Load testing

---

### 15. Monitoring & Alerts 📊

**Status:** Not Started  
**Priority:** Phase 3 - Important

**Tasks:**
- [ ] Error tracking (Sentry integration)
- [ ] Performance monitoring
- [ ] Uptime monitoring
- [ ] Alert system for critical errors
- [ ] Health check endpoints

---

### 16. Backup & Recovery 💾

**Status:** Not Started  
**Priority:** Phase 3 - Important

**Tasks:**
- [ ] Automated database backups
- [ ] Backup verification
- [ ] Disaster recovery plan
- [ ] Data export capabilities
- [ ] Backup restoration testing

---

### 17. Documentation 📚

**Status:** Partial  
**Priority:** Phase 4 - Nice to Have

**Tasks:**
- [ ] API documentation (Swagger/OpenAPI)
- [ ] User guides (CRE/Admin)
- [ ] Technical documentation
- [ ] Deployment guides
- [ ] Troubleshooting guides

---

## 🎯 Priority Phases

### **Phase 1: Critical (Do First)** 🚨
1. ✅ Import Error Handling (#1)
2. ✅ Admin View-as-CRE (#6)
3. ✅ Source Analytics on Click (#7)
4. ✅ Data Integrity & Validation (#8)

**Timeline:** 2-3 weeks  
**Impact:** High user satisfaction, critical workflows

---

### **Phase 2: High Priority** ⚡
5. ✅ Developer Panel (#3)
6. ✅ Enhanced Exports (#5)
7. ✅ Dashboard Improvements (#4)
8. ✅ Performance Optimization (#9)

**Timeline:** 3-4 weeks  
**Impact:** Better UX, system efficiency

---

### **Phase 3: Important** 📋
9. ✅ Raise Ticket System (#2)
10. ✅ Audit Trail & Compliance (#11)
11. ✅ Real-time Features (#12)
12. ✅ Mobile Responsiveness (#13)
13. ✅ Monitoring & Alerts (#15)
14. ✅ Backup & Recovery (#16)
15. ✅ Security Enhancements (#10)

**Timeline:** 4-6 weeks  
**Impact:** System reliability, user experience

---

### **Phase 4: Nice to Have** 🌟
16. ✅ Testing & Quality Assurance (#14)
17. ✅ Documentation (#17)

**Timeline:** Ongoing  
**Impact:** Code quality, maintainability

---

## 📊 Implementation Status Tracker

### Completed ✅
- [x] CRE Manual Lead Creation
- [x] Basic Export (CSV)
- [x] Basic Dashboard Stats
- [x] Lead Qualification Flow
- [x] Source Management
- [x] User Management
- [x] Assignment Rules

### In Progress 🚧
- [ ] None currently

### Not Started ⏳
- [ ] All items listed above

---

## 🔄 Dependencies

**Before starting Phase 2:**
- Complete Phase 1 items (especially #1, #6, #7)

**Before starting Phase 3:**
- Complete Phase 1 & 2
- Set up monitoring infrastructure

**Before starting Phase 4:**
- Complete core features
- System is stable

---

## ❓ Open Questions

### Import Error Handling (#1)
- [ ] Show errors inline in UI or downloadable report only?
- [ ] Allow re-upload with corrections or manual fix only?
- [ ] Should we store failed imports for retry later?

### Raise Ticket System (#2)
- [ ] Email notifications or in-app notifications only?
- [ ] Should CREs see their own tickets or all tickets?
- [ ] Auto-assign tickets or manual assignment?

### Developer Panel (#3)
- [ ] Read-only logs or allow actions (clear logs, restart services)?
- [ ] Real-time updates or refresh button?
- [ ] Log retention period?

### Dashboard (#4)
- [ ] Which chart types are most important?
- [ ] Real-time updates or cached data?
- [ ] Export dashboard data?

### Enhanced Exports (#5)
- [ ] Which formats are priority? (CSV, Excel, PDF)
- [ ] Export size limits?
- [ ] Background processing for large exports?

### View-as-CRE (#6)
- [ ] Full access or read-only mode?
- [ ] Time limit for impersonation?
- [ ] Notification to CRE when admin views their workspace?

### Source Analytics (#7)
- [ ] Simple stats or advanced charts?
- [ ] Real-time or cached data?
- [ ] Export source analytics?

---

## 📝 Notes

- **Current Focus:** Complete Phase 1 items first
- **Next Review:** After Phase 1 completion
- **Estimated Total Timeline:** 10-15 weeks for all phases
- **Team Size:** 1 developer (adjust timeline if team grows)

---

## 🎯 Success Metrics

### Phase 1 Success:
- ✅ Import errors are clearly visible and actionable
- ✅ Admins can easily view CRE workspaces
- ✅ Source analytics provide valuable insights
- ✅ Data quality is improved

### Phase 2 Success:
- ✅ Developer panel is useful for debugging
- ✅ Exports are flexible and user-friendly
- ✅ Dashboards provide actionable insights
- ✅ System performance is optimized

### Phase 3 Success:
- ✅ Support system is functional
- ✅ System is reliable and monitored
- ✅ Mobile experience is good
- ✅ Security is enhanced

---

## 📞 Contact & Updates

**Last Updated:** December 2024  
**Next Review:** After Phase 1 completion

**To Update This Document:**
1. Update status of items as they're completed
2. Add new items as they come up
3. Adjust priorities based on business needs
4. Update timeline estimates

---

**End of Roadmap**

