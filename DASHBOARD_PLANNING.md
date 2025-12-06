# Advanced Dashboard - Planning & Implementation Guide

**Last Updated:** December 2025  
**Status:** Planning Phase

---

## 📊 Dashboard Overview

This document outlines the comprehensive dashboard requirements with live updates, advanced analytics, and real-time metrics for the MG CRM system.

---

## 🎯 Your Requested Metrics

### 1. Total Number of Leads Generated
**Definition:** Count of all leads in `leads_master` table  
**Time Range:** All time, Today, MTD, YTD, Custom range  
**Data Source:** `leads_master` (COUNT)

**Display:**
- Large KPI card with number
- Trend indicator (↑/↓ vs previous period)
- Clickable → Navigate to "All Leads" page

---

### 2. Number of Leads Count
**Clarification Needed:** 
- Is this different from #1? 
- Or do you mean "Active Leads" (not lost/disqualified)?
- Or "Assigned Leads"?

**Proposed Options:**
- **Option A:** Active Leads (IS_LOST = NULL, status != 'Disqualified')CRE performance — Include inactive CREs in historical data? 
- **Option B:** Assigned Leads (assigned_to IS NOT NULL)
- **Option C:** Working Leads (status IN ('New', 'Assigned', 'Pending', 'Qualified'))

**Recommendation:** Show multiple counts:
- Total Leads
- Active Leads
- Assigned Leads
- Unassigned Leads

---

### 3. Number of Test Drives
**Definition:** Count where `leads_qualification.TEST_DRIVE = TRUE`  
**Data Source:** `leads_qualification` JOIN `leads_master`  
**Time Range:** All time, Today, MTD, YTD, Custom

**Display:**
- KPI card with count
- Trend chart (test drives over time)
- Clickable → Filtered view of test drive leads

---

### 4. Number of Bookings
**Definition:** Count where `leads_qualification.BOOKED = TRUE`  
**Data Source:** `leads_qualification` JOIN `leads_master`  
**Time Range:** All time, Today, MTD, YTD, Custom

**Display:**
- KPI card with count
- Conversion rate (Bookings / Qualified Leads)
- Clickable → Filtered view of booked leads

---

### 5. Number of Retails
**Definition:** Count where `leads_qualification.RETAILED = TRUE`  
**Data Source:** `leads_qualification` JOIN `leads_master`  
**Time Range:** All time, Today, MTD, YTD, Custom

**Display:**
- KPI card with count (highlighted in green/gold)
- Conversion rate (Retails / Qualified Leads)
- Revenue impact (if applicable)
- Clickable → Filtered view of retailed leads

---

### 6. Source-wise Leads Distribution Table
**Format:** Table with columns:
- **Source Name** (display_name)
- **Total Count** (all leads from this source)
- **Qualified** (is_qualified = TRUE)
- **E (Enquiry)** - Leads in enquiry stage (New, Assigned, Pending)
- **T (Test Drive)** - TEST_DRIVE = TRUE
- **B (Booking)** - BOOKED = TRUE
- **R (Retail)** - RETAILED = TRUE

**Data Source:**
```sql
SELECT 
  s.display_name,
  COUNT(DISTINCT lm.id) as total_count,
  COUNT(DISTINCT CASE WHEN lm.is_qualified = TRUE THEN lm.id END) as qualified,
  COUNT(DISTINCT CASE WHEN lm.status IN ('New', 'Assigned', 'Pending') THEN lm.id END) as enquiry,
  COUNT(DISTINCT CASE WHEN lq.TEST_DRIVE = TRUE THEN lq.lead_id END) as test_drive,
  COUNT(DISTINCT CASE WHEN lq.BOOKED = TRUE THEN lq.lead_id END) as booked,
  COUNT(DISTINCT CASE WHEN lq.RETAILED = TRUE THEN lq.lead_id END) as retailed
FROM sources s
LEFT JOIN leads_master lm ON lm.source_id = s.id
LEFT JOIN leads_qualification lq ON lq.lead_id = lm.id
GROUP BY s.display_name
ORDER BY total_count DESC
```

**Display:**
- Sortable table
- Clickable source name → Source analytics modal
- Export to CSV/Excel
- Time range filter (Today, MTD, YTD, Custom)

---

### 7. CRE-wise Leads Distribution
**Format:** Table with columns:
- **CRE Name** (full_name)
- **Leads Assigned** (assigned_to = CRE user_id)
- **Qualified** (is_qualified = TRUE AND assigned_to = CRE)
- **Test Drive** (TEST_DRIVE = TRUE AND assigned_to = CRE)
- **Booking** (BOOKED = TRUE AND assigned_to = CRE)
- **Retail** (RETAILED = TRUE AND assigned_to = CRE)

**Data Source:**
```sql
SELECT 
  u.full_name,
  COUNT(DISTINCT lm.id) as leads_assigned,
  COUNT(DISTINCT CASE WHEN lm.is_qualified = TRUE THEN lm.id END) as qualified,
  COUNT(DISTINCT CASE WHEN lq.TEST_DRIVE = TRUE THEN lq.lead_id END) as test_drive,
  COUNT(DISTINCT CASE WHEN lq.BOOKED = TRUE THEN lq.lead_id END) as booked,
  COUNT(DISTINCT CASE WHEN lq.RETAILED = TRUE THEN lq.lead_id END) as retailed
FROM users u
LEFT JOIN leads_master lm ON lm.assigned_to = u.user_id
LEFT JOIN leads_qualification lq ON lq.lead_id = lm.id
WHERE u.role = 'CRE'
GROUP BY u.user_id, u.full_name
ORDER BY leads_assigned DESC
```

**Display:**
- Sortable table
- Clickable CRE name → View their workspace (impersonation)
- Performance indicators (conversion rates)
- Export to CSV/Excel

---

### 8. Top Performing CRE Leaderboard
**Metrics to Rank By:**
- Total Retails (Primary)
- Conversion Rate (Retails / Qualified)
- Total Qualified Leads
- Test Drive Conversion
- Booking Conversion

**Display:**
- Top 10 CREs
- Rank badges (🥇 🥈 🥉)
- Performance trends (↑/↓)
- Clickable → View CRE details

**Data Source:**
```sql
SELECT 
  u.full_name,
  COUNT(DISTINCT CASE WHEN lq.RETAILED = TRUE THEN lq.lead_id END) as retails,
  COUNT(DISTINCT CASE WHEN lm.is_qualified = TRUE THEN lm.id END) as qualified,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN lm.is_qualified = TRUE THEN lm.id END) > 0
    THEN ROUND(
      (COUNT(DISTINCT CASE WHEN lq.RETAILED = TRUE THEN lq.lead_id END)::DECIMAL / 
       COUNT(DISTINCT CASE WHEN lm.is_qualified = TRUE THEN lm.id END)) * 100, 
      2
    )
    ELSE 0
  END as conversion_rate
FROM users u
LEFT JOIN leads_master lm ON lm.assigned_to = u.user_id
LEFT JOIN leads_qualification lq ON lq.lead_id = lm.id
WHERE u.role = 'CRE'
GROUP BY u.user_id, u.full_name
ORDER BY retails DESC, conversion_rate DESC
LIMIT 10
```

---

### 9. Outlet-wise Lead Distribution (Branch ETBR)
**Format:** Table with columns:
- **Branch Name**
- **E (Enquiry)** - Leads assigned to branch (via branch_id in qualification)
- **T (Test Drive)** - TEST_DRIVE = TRUE for branch
- **B (Booking)** - BOOKED = TRUE for branch
- **R (Retail)** - RETAILED = TRUE for branch

**Data Source:**
```sql
SELECT 
  b.name as branch_name,
  COUNT(DISTINCT CASE WHEN lm.status IN ('New', 'Assigned', 'Pending') AND lq.branch_id = b.id THEN lm.id END) as enquiry,
  COUNT(DISTINCT CASE WHEN lq.TEST_DRIVE = TRUE AND lq.branch_id = b.id THEN lq.lead_id END) as test_drive,
  COUNT(DISTINCT CASE WHEN lq.BOOKED = TRUE AND lq.branch_id = b.id THEN lq.lead_id END) as booked,
  COUNT(DISTINCT CASE WHEN lq.RETAILED = TRUE AND lq.branch_id = b.id THEN lq.lead_id END) as retailed
FROM branches b
LEFT JOIN leads_qualification lq ON lq.branch_id = b.id
LEFT JOIN leads_master lm ON lm.id = lq.lead_id
GROUP BY b.id, b.name
ORDER BY retailed DESC
```

**Display:**
- Sortable table
- Clickable branch name → Branch details
- Export to CSV/Excel

---

### 10. Qualification Category Distribution
**Format:** Chart + Table showing:
- **Qualified for TD** (qualified_category = 'Qualified for TD')
- **Qualified for Showroom Visit** (qualified_category = 'Qualified for Showroom Visit')
- **Qualified for Booking** (qualified_category = 'Qualified for Booking')
- **Count** and **Percentage** for each

**Data Source:**
```sql
SELECT 
  qualified_category,
  COUNT(*) as count,
  ROUND((COUNT(*)::DECIMAL / (SELECT COUNT(*) FROM leads_qualification) * 100), 2) as percentage
FROM leads_qualification
GROUP BY qualified_category
ORDER BY count DESC
```

**Display:**
- Pie chart or bar chart
- Table with counts and percentages
- Time range filter

---

## 🚀 Additional Metrics I Recommend

### 11. Conversion Funnel
**Stages:**
1. Total Leads
2. Qualified Leads
3. Test Drives
4. Bookings
5. Retails

**Display:**
- Funnel chart showing drop-off at each stage
- Conversion percentages
- Time range filter

---

### 12. Lead Generation Trends
**Display:**
- Line chart showing leads over time (daily/weekly/monthly)
- Source breakdown
- Trend analysis (↑/↓)

---

### 13. Response Time Metrics
**Metrics:**
- Average time to first contact
- Average time to qualification
- Average time from qualification to test drive
- Average time from test drive to retail

**Data Source:** Calculate from `leads_logs` and `leads_master.created_at`

---

### 14. Source Performance Comparison
**Display:**
- Bar chart comparing sources
- Metrics: Total leads, Qualified, Conversion rate, Retails
- ROI indicators

---

### 15. Daily/Weekly/Monthly Summary
**Display:**
- Today's metrics
- This week vs last week
- This month vs last month
- Growth percentages

---

### 16. Lead Status Distribution
**Display:**
- Pie chart showing:
  - New
  - Assigned
  - Pending
  - Qualified
  - Disqualified
  - Lost

---

### 17. Model Interest Distribution
**Display:**
- Bar chart showing most interested models
- From `leads_qualification.model_interested`

---

### 18. Location-wise Distribution
**Display:**
- Map or table showing leads by customer location
- From `leads_qualification.customer_location`

---

## 🎨 Dashboard Layout Proposal

### **Top Section: KPI Cards (Row 1)**
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Total Leads │ │ Active Leads│ │ Test Drives │ │  Bookings   │ │   Retails   │
│   1,234     │ │    890      │ │     45      │ │     23      │ │     12      │
│   ↑ 12%     │ │   ↑ 8%      │ │   ↑ 5%      │ │   ↑ 15%     │ │   ↑ 20%     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

### **Row 2: Charts (Left) + Leaderboard (Right)**
```
┌─────────────────────────────────────┐ ┌──────────────────────────┐
│   Lead Generation Trend (Line Chart) │ │  Top CRE Leaderboard      │
│                                     │ │  1. CRE A - 45 Retails    │
│   [Chart showing leads over time]   │ │  2. CRE B - 32 Retails    │
│                                     │ │  3. CRE C - 28 Retails    │
└─────────────────────────────────────┘ └──────────────────────────┘
```

### **Row 3: Conversion Funnel**
```
┌─────────────────────────────────────────────────────────────────┐
│                    Conversion Funnel                             │
│  [Funnel Chart: Leads → Qualified → TD → Booking → Retail]     │
└─────────────────────────────────────────────────────────────────┘
```

### **Row 4: Source Distribution Table**
```
┌─────────────────────────────────────────────────────────────────┐
│              Source-wise Leads Distribution                      │
│  Source | Total | Qualified | E | T | B | R                     │
│  Meta   |  500  |    200    |150| 30| 15| 8                      │
│  Google |  300  |    120    | 90| 20| 10| 5                      │
└─────────────────────────────────────────────────────────────────┘
```

### **Row 5: CRE Performance Table**
```
┌─────────────────────────────────────────────────────────────────┐
│              CRE-wise Leads Distribution                         │
│  CRE Name | Assigned | Qualified | TD | Booking | Retail        │
│  CRE A    |   150    |    80     | 25 |   12    |  8            │
│  CRE B    |   120    |    65     | 20 |   10    |  6            │
└─────────────────────────────────────────────────────────────────┘
```

### **Row 6: Branch Distribution + Qualification Category**
```
┌──────────────────────────────┐ ┌──────────────────────────────┐
│  Branch ETBR Distribution    │ │  Qualification Category      │
│  Branch | E | T | B | R       │ │  [Pie Chart]                 │
│  B1     |50 |10 | 5 | 3       │ │  TD: 45%                     │
│  B2     |40 | 8 | 4 | 2       │ │  Showroom: 35%              │
└──────────────────────────────┘ │  Booking: 20%                 │
                                 └──────────────────────────────┘
```

---

## 🔄 Live Updates Strategy

### **Option 1: Polling (Simple)**
- Refresh every 30 seconds
- Use React Query with `refetchInterval`
- Pros: Simple, reliable
- Cons: Not truly "real-time", server load

### **Option 2: WebSocket (Advanced)**
- Real-time updates via WebSocket connection
- Server pushes updates when data changes
- Pros: True real-time, efficient
- Cons: More complex, requires WebSocket server

### **Option 3: Server-Sent Events (SSE)**
- One-way stream from server to client
- Pros: Simpler than WebSocket, real-time
- Cons: One-way only

### **Recommendation:**
- **Start with Polling** (30-60 second intervals)
- **Upgrade to WebSocket** later for true real-time
- Use React Query for caching and automatic refetching

---

## 📊 Technical Implementation Plan

### **Phase 1: Backend Services**

#### 1.1 Create Analytics Service
**File:** `Morris-Garages-CRM/services/analytics.service.ts`

**Functions:**
- `getDashboardMetrics(dateRange)`
- `getSourceDistribution(dateRange)`
- `getCrePerformance(dateRange)`
- `getBranchDistribution(dateRange)`
- `getQualificationDistribution(dateRange)`
- `getConversionFunnel(dateRange)`
- `getTopPerformingCres(limit, dateRange)`
- `getLeadTrends(period, dateRange)`

#### 1.2 Create Analytics Controller
**File:** `Morris-Garages-CRM/controllers/analytics.controller.ts`

**Endpoints:**
- `GET /analytics/dashboard` - All dashboard metrics
- `GET /analytics/sources` - Source distribution
- `GET /analytics/cre-performance` - CRE performance
- `GET /analytics/branches` - Branch distribution
- `GET /analytics/funnel` - Conversion funnel
- `GET /analytics/trends` - Lead trends

#### 1.3 Add Analytics Routes
**File:** `Morris-Garages-CRM/routes/analytics.routes.ts`

---

### **Phase 2: Frontend Components**

#### 2.1 Dashboard Page
**File:** `EPICMG/frontend/Frontend/src/pages/admin/AnalyticsDashboard.tsx`

#### 2.2 Chart Components
**Files:**
- `EPICMG/frontend/Frontend/src/components/dashboard/LineChart.tsx`
- `EPICMG/frontend/Frontend/src/components/dashboard/BarChart.tsx`
- `EPICMG/frontend/Frontend/src/components/dashboard/PieChart.tsx`
- `EPICMG/frontend/Frontend/src/components/dashboard/FunnelChart.tsx`

#### 2.3 Table Components
**Files:**
- `EPICMG/frontend/Frontend/src/components/dashboard/SourceDistributionTable.tsx`
- `EPICMG/frontend/Frontend/src/components/dashboard/CrePerformanceTable.tsx`
- `EPICMG/frontend/Frontend/src/components/dashboard/BranchDistributionTable.tsx`

#### 2.4 KPI Cards
**File:** `EPICMG/frontend/Frontend/src/components/dashboard/DashboardKPICards.tsx`

---

### **Phase 3: Live Updates**

#### 3.1 React Query Hooks
**File:** `EPICMG/frontend/Frontend/src/hooks/useAnalytics.ts`

```typescript
export function useDashboardMetrics(dateRange) {
  return useQuery({
    queryKey: ['analytics', 'dashboard', dateRange],
    queryFn: () => apiClient.get('/analytics/dashboard', { params: dateRange }),
    refetchInterval: 30000, // 30 seconds
  });
}
```

#### 3.2 WebSocket Integration (Future)
- Set up WebSocket server
- Client connection
- Real-time data push

---

## 🎯 Dashboard Features

### **Filters & Controls**
- **Date Range:** Today, MTD, YTD, Custom range
- **Source Filter:** All sources or specific source
- **Branch Filter:** All branches or specific branch
- **CRE Filter:** All CREs or specific CRE
- **Refresh Button:** Manual refresh
- **Export Button:** Export dashboard data

### **Interactivity**
- Clickable KPI cards → Navigate to filtered views
- Clickable table rows → Detailed view
- Hover tooltips with additional info
- Drill-down capabilities

### **Responsive Design**
- Desktop: Full dashboard
- Tablet: Stacked layout
- Mobile: Simplified view

---

## 📈 Metrics Calculation Details

### **Conversion Rates:**
- **Qualification Rate:** (Qualified / Total Leads) × 100
- **Test Drive Rate:** (Test Drives / Qualified) × 100
- **Booking Rate:** (Bookings / Test Drives) × 100
- **Retail Rate:** (Retails / Bookings) × 100
- **Overall Conversion:** (Retails / Total Leads) × 100

### **ETBR Breakdown:**
- **E (Enquiry):** Status IN ('New', 'Assigned', 'Pending')
- **T (Test Drive):** TEST_DRIVE = TRUE
- **B (Booking):** BOOKED = TRUE
- **R (Retail):** RETAILED = TRUE

---

## 🔍 Questions to Clarify

### **Metrics Clarification:**
1. **"No. of leads count"** - What exactly should this show?
   - Active leads?
   - Assigned leads?
   - Working leads?

2. **Time Range Default:**
   - What should be the default? (Today, MTD, All time?)

3. **CRE Performance:**
   - Should we show only active CREs or all CREs?
   - Include inactive CREs in historical data?

4. **Branch Distribution:**
   - Should we include leads assigned to TL/RM via branch_id?
   - Or only leads where branch_id is set in qualification?

5. **Qualification Category:**
   - Are there only 3 categories or more?
   - Current values: "Qualified for TD", "Qualified for Showroom Visit", "Qualified for Booking"

### **UI/UX Questions:**
6. **Dashboard Access:**
   - Who can access? (Admin, CRE_TL, or all?)
   - Separate dashboard for CREs vs Admin?

7. **Update Frequency:**
   - How often should live updates refresh? (30s, 60s, 5min?)

8. **Export Format:**
   - CSV, Excel, PDF, or all?

9. **Charts Library:**
   - Preference? (Recharts, Chart.js, D3.js, Plotly?)

---

## 🚀 Implementation Priority

### **Phase 1: Core Metrics (Week 1-2)**
1. ✅ Total Leads
2. ✅ Test Drives, Bookings, Retails
3. ✅ Source Distribution Table
4. ✅ CRE Performance Table

### **Phase 2: Advanced Metrics (Week 3)**
5. ✅ Top CRE Leaderboard
6. ✅ Branch Distribution
7. ✅ Qualification Category Distribution
8. ✅ Conversion Funnel

### **Phase 3: Enhancements (Week 4)**
9. ✅ Live Updates
10. ✅ Charts & Visualizations
11. ✅ Export Functionality
12. ✅ Responsive Design

---

## 📝 Next Steps

1. **Clarify Questions** - Answer the questions above
2. **Confirm Metrics** - Finalize exact metrics to show
3. **Choose Chart Library** - Recharts recommended (React-friendly)
4. **Start Backend** - Create analytics service
5. **Build Frontend** - Create dashboard components
6. **Add Live Updates** - Implement polling/WebSocket
7. **Test & Refine** - User testing and feedback

---

## 💡 Recommendations

### **Chart Library: Recharts**
- React-native
- Good documentation
- Responsive
- Free and open-source

### **Update Strategy:**
- Start with 30-second polling
- Add WebSocket later if needed
- Cache data to reduce server load

### **Performance:**
- Use database indexes for fast queries
- Cache dashboard data (5-10 minutes)
- Paginate large tables
- Lazy load charts

---

**Ready to start implementation once questions are answered!**

