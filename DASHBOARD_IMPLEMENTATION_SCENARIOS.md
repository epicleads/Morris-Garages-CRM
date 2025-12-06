# Dashboard Implementation - Scenarios & Data Considerations

**Last Updated:** December 2025  
**Status:** Implementation Guide

---

## 📋 Data Scenarios & Definitions

### **1. Active Leads Definition**
**Criteria:**
- `IS_LOST = NULL` (not marked as lost)
- `status != 'Disqualified'` (not disqualified)

**SQL Logic:**
```sql
WHERE IS_LOST IS NULL 
  AND status != 'Disqualified'
```

**Sub-categories:**
- **Assigned Leads:** Active leads where `assigned_to IS NOT NULL`
- **Unassigned Leads:** Active leads where `assigned_to IS NULL`
- **Working Leads:** Active leads where `status IN ('Pending', 'Assigned')` AND `assigned_to IS NOT NULL`

**Note:** "New" status leads without assignment are NOT counted as "Working Leads"

---

### **2. Time Range Filters**

#### **Today:**
- Start: `00:00:00` of current day (IST)
- End: Current timestamp (IST)

#### **MTD (Month to Date):**
- Start: `00:00:00` of first day of current month (IST)
- End: Current timestamp (IST)

#### **YTD (Year to Date):**
- Start: `00:00:00` of January 1st of current year (IST)
- End: Current timestamp (IST)

#### **All Time:**
- No date filter applied
- All historical data

#### **Custom Range:**
- User selects start_date and end_date
- Both dates inclusive
- Time: `00:00:00` to `23:59:59` for each date

**Default:** Today

---

### **3. CRE Performance Metrics**

#### **Included CREs:**
- **Active CREs:** `status = true` (or `status IS NULL` if default is active)
- **Inactive CREs:** Included in historical data for past performance
- **Filter:** Current view can filter to show only active CREs, but historical includes all

#### **Metrics Calculated:**
- **Leads Assigned:** Count of leads where `assigned_to = CRE.user_id`
- **Qualified:** Count where `assigned_to = CRE.user_id` AND `is_qualified = TRUE`
- **Test Drive:** Count where `assigned_to = CRE.user_id` AND `TEST_DRIVE = TRUE`
- **Booking:** Count where `assigned_to = CRE.user_id` AND `BOOKED = TRUE`
- **Retail:** Count where `assigned_to = CRE.user_id` AND `RETAILED = TRUE`

#### **Conversion Rates:**
- **Qualification Rate:** (Qualified / Assigned) × 100
- **Test Drive Rate:** (Test Drive / Qualified) × 100
- **Booking Rate:** (Booking / Test Drive) × 100
- **Retail Rate:** (Retail / Booking) × 100
- **Overall Conversion:** (Retail / Assigned) × 100

---

### **4. Branch Distribution (ETBR)**

#### **Data Source:**
- All leads where `leads_qualification.branch_id IS NOT NULL`
- Includes leads assigned via branch_id in qualification table

#### **ETBR Breakdown:**
- **E (Enquiry):** Leads with `status IN ('New', 'Assigned', 'Pending')` AND `branch_id` set
- **T (Test Drive):** Leads where `TEST_DRIVE = TRUE` AND `branch_id` set
- **B (Booking):** Leads where `BOOKED = TRUE` AND `branch_id` set
- **R (Retail):** Leads where `RETAILED = TRUE` AND `branch_id` set

**Note:** A lead can be in multiple stages (e.g., Test Drive AND Booking), so counts may overlap

---

### **5. Qualification Categories**

**Only 3 Categories:**
1. **"Qualified for TD"** (Test Drive)
2. **"Qualified for Showroom Visit"**
3. **"Qualified for Booking"**

**Data Source:** `leads_qualification.qualified_category`

**Display:**
- Count for each category
- Percentage of total qualified leads
- Time range filter applicable

---

### **6. Source Distribution**

#### **Metrics:**
- **Total Count:** All leads from this source (regardless of status)
- **Qualified:** Leads where `is_qualified = TRUE` AND `source_id = source.id`
- **E (Enquiry):** Leads with `status IN ('New', 'Assigned', 'Pending')` AND `source_id = source.id`
- **T (Test Drive):** Leads where `TEST_DRIVE = TRUE` AND `source_id = source.id`
- **B (Booking):** Leads where `BOOKED = TRUE` AND `source_id = source.id`
- **R (Retail):** Leads where `RETAILED = TRUE` AND `source_id = source.id`

**Note:** Uses `leads_master.source_id` to join with `sources` table

---

### **7. Test Drive, Booking, Retail Counts**

#### **Test Drives:**
- Count where `leads_qualification.TEST_DRIVE = TRUE`
- Time filter: Based on `leads_qualification.updated_at` or `leads_qualification.qualified_at`

#### **Bookings:**
- Count where `leads_qualification.BOOKED = TRUE`
- Time filter: Based on when BOOKED flag was set

#### **Retails:**
- Count where `leads_qualification.RETAILED = TRUE`
- Time filter: Based on when RETAILED flag was set

**Note:** These are cumulative flags, so a lead can have TEST_DRIVE=TRUE, BOOKED=TRUE, and RETAILED=TRUE simultaneously

---

### **8. Top CRE Leaderboard**

#### **Ranking Criteria (Primary to Secondary):**
1. **Total Retails** (DESC)
2. **Conversion Rate** (Retails / Qualified) (DESC)
3. **Total Qualified Leads** (DESC)

#### **Display:**
- Top 10 CREs
- Rank badges (🥇 🥈 🥉)
- Performance indicators
- Time range filter applicable

---

### **9. Conversion Funnel**

#### **Stages:**
1. **Total Leads** - All leads in `leads_master`
2. **Qualified Leads** - `is_qualified = TRUE`
3. **Test Drives** - `TEST_DRIVE = TRUE`
4. **Bookings** - `BOOKED = TRUE`
5. **Retails** - `RETAILED = TRUE`

#### **Drop-off Calculation:**
- Stage 1 → Stage 2: (Qualified / Total) × 100
- Stage 2 → Stage 3: (Test Drive / Qualified) × 100
- Stage 3 → Stage 4: (Booking / Test Drive) × 100
- Stage 4 → Stage 5: (Retail / Booking) × 100

**Note:** Each stage is a subset of the previous (cumulative)

---

## 🔄 Live Updates (60 seconds)

### **Update Strategy:**
- React Query `refetchInterval: 60000` (60 seconds)
- Automatic background refetch
- Manual refresh button available
- Optimistic updates for better UX

### **Data Caching:**
- Cache time: 30 seconds (staleTime)
- Refetch on window focus
- Refetch on reconnect

---

## 📊 Database Query Considerations

### **Performance Optimizations:**
1. **Indexes Required:**
   - `leads_master(IS_LOST, status)`
   - `leads_master(assigned_to, is_qualified)`
   - `leads_master(source_id, created_at)`
   - `leads_qualification(TEST_DRIVE, BOOKED, RETAILED)`
   - `leads_qualification(branch_id, qualified_category)`
   - `leads_qualification(qualified_at)`

2. **Query Optimization:**
   - Use `COUNT(DISTINCT ...)` for accurate counts
   - Use `LEFT JOIN` to include all sources/branches/CREs
   - Filter by date range early in query
   - Use subqueries for complex aggregations

3. **Caching Strategy:**
   - Backend: Cache dashboard metrics for 1-2 minutes
   - Frontend: React Query cache for 30 seconds
   - Reduce database load

---

## 🎯 Edge Cases & Scenarios

### **Scenario 1: Lead with Multiple Statuses**
**Case:** Lead has TEST_DRIVE=TRUE, BOOKED=TRUE, RETAILED=TRUE
**Handling:** Count in all three categories (T, B, R)

### **Scenario 2: Lead Qualified but Not Assigned to Branch**
**Case:** Lead qualified but `branch_id` is NULL
**Handling:** Not counted in Branch ETBR, but counted in CRE performance

### **Scenario 3: Inactive CRE with Historical Data**
**Case:** CRE is inactive but has past retails
**Handling:** Included in historical data, can be filtered out in current view

### **Scenario 4: Lead Transferred Between CREs**
**Case:** Lead assigned to CRE A, then transferred to CRE B
**Handling:** Counted in CRE B's metrics (current assignment)

### **Scenario 5: Lead Disqualified Then Re-qualified**
**Case:** Lead disqualified, then later qualified again
**Handling:** 
- Active leads: Counted (not disqualified anymore)
- Historical: Both events tracked in logs

### **Scenario 6: Time Zone Handling**
**Case:** Data stored in UTC, but dashboard shows IST
**Handling:** 
- Convert all timestamps to IST for filtering
- Display in IST timezone
- Use `pytz` or `date-fns-tz` for conversions

### **Scenario 7: Empty Data Sets**
**Case:** No leads in selected time range
**Handling:**
- Show 0 counts
- Display "No data available" message
- Charts show empty state

### **Scenario 8: Very Large Data Sets**
**Case:** Thousands of leads in time range
**Handling:**
- Use efficient aggregation queries
- Paginate tables
- Lazy load charts
- Cache results

---

## 🔍 Data Validation

### **Data Integrity Checks:**
1. **Lead Status Consistency:**
   - `is_qualified = TRUE` should have corresponding `leads_qualification` record
   - `TEST_DRIVE = TRUE` should have `is_qualified = TRUE`

2. **Assignment Consistency:**
   - `assigned_to` should reference valid `users.user_id` with `role = 'CRE'`
   - `branch_id` should reference valid `branches.id`

3. **Time Range Validation:**
   - Start date ≤ End date
   - Dates not in future
   - Custom range max: 1 year (configurable)

---

## 📈 Metrics Calculation Examples

### **Example 1: Source Distribution**
```
Source: "Meta"
- Total Leads: 500 (all time)
- Qualified: 200 (is_qualified = TRUE)
- Enquiry: 150 (status IN ('New', 'Assigned', 'Pending'))
- Test Drive: 30 (TEST_DRIVE = TRUE)
- Booking: 15 (BOOKED = TRUE)
- Retail: 8 (RETAILED = TRUE)
```

### **Example 2: CRE Performance**
```
CRE: "John Doe"
- Leads Assigned: 150
- Qualified: 80 (50% qualification rate)
- Test Drive: 25 (31% TD rate)
- Booking: 12 (48% booking rate)
- Retail: 8 (67% retail rate)
- Overall Conversion: 5.3% (8/150)
```

### **Example 3: Branch ETBR**
```
Branch: "Hyderabad Main"
- Enquiry: 50 (leads with branch_id and status in enquiry)
- Test Drive: 10 (TEST_DRIVE = TRUE)
- Booking: 5 (BOOKED = TRUE)
- Retail: 3 (RETAILED = TRUE)
```

---

## 🚀 Implementation Notes

### **Backend:**
- Use TypeScript for type safety
- Validate all date ranges
- Handle timezone conversions
- Optimize queries with proper indexes
- Add error handling and logging

### **Frontend:**
- Use React Query for data fetching
- Implement loading states
- Show error messages
- Handle empty states
- Responsive design
- Premium UI theme (white BG, black text, red/blue accents)

### **Charts:**
- Use Recharts for React-native charts
- Responsive and accessible
- Tooltips with detailed info
- Export functionality

---

## ✅ Testing Scenarios

### **Test Case 1: Today's Metrics**
- Verify counts match filtered "All Leads" page
- Check time range is correct (IST)

### **Test Case 2: CRE Performance**
- Verify assigned leads match CRE workspace
- Check conversion rates are calculated correctly

### **Test Case 3: Source Distribution**
- Verify source counts match source details
- Check ETBR breakdown is accurate

### **Test Case 4: Branch Distribution**
- Verify branch counts match branch assignments
- Check ETBR for each branch

### **Test Case 5: Live Updates**
- Verify data refreshes every 60 seconds
- Check manual refresh works
- Verify no duplicate requests

---

**This document will be updated as implementation progresses and edge cases are discovered.**

