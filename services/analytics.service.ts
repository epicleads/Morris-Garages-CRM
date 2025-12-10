import { supabaseAdmin } from '../config/supabase';

// Date range types
export type DateRangeType = 'today' | 'mtd' | 'ytd' | 'all' | 'custom';

export interface DateRange {
  type: DateRangeType;
  startDate?: string; // ISO date string for custom range
  endDate?: string; // ISO date string for custom range
}

// Helper function to get date range filters
function getDateRangeFilter(dateRange: DateRange) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istNow = new Date(now.getTime() + istOffset);
  
  let startDate: Date | null = null;
  let endDate: Date = istNow;

  switch (dateRange.type) {
    case 'today':
      startDate = new Date(istNow);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'mtd':
      startDate = new Date(istNow.getFullYear(), istNow.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'ytd':
      startDate = new Date(istNow.getFullYear(), 0, 1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'custom':
      if (dateRange.startDate) {
        startDate = new Date(dateRange.startDate);
        startDate.setHours(0, 0, 0, 0);
      }
      if (dateRange.endDate) {
        endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999);
      }
      break;
    case 'all':
    default:
      startDate = null;
      break;
  }

  return { startDate, endDate };
}

// Dashboard Metrics Interface
export interface DashboardMetrics {
  totalLeads: number;
  activeLeads: number;
  assignedLeads: number;
  unassignedLeads: number;
  workingLeads: number;
  testDrives: number;
  bookings: number;
  retails: number;
  qualifiedLeads: number;
}

// Source Distribution Interface
export interface SourceDistribution {
  source_id: number;
  source_name: string;
  sub_source?: string;
  total_count: number;
  qualified: number;
  enquiry: number;
  test_drive: number;
  booked: number;
  retailed: number;
}

// CRE Performance Interface
export interface CrePerformance {
  user_id: number;
  cre_name: string;
  leads_assigned: number;
  qualified: number;
  test_drive: number;
  booked: number;
  retailed: number;
  qualification_rate: number;
  test_drive_rate: number;
  booking_rate: number;
  retail_rate: number;
  overall_conversion: number;
}

// Branch Distribution Interface
export interface BranchDistribution {
  branch_id: number;
  branch_name: string;
  enquiry: number;
  test_drive: number;
  booked: number;
  retailed: number;
}

// Qualification Category Distribution Interface
export interface QualificationCategoryDistribution {
  category: string;
  count: number;
  percentage: number;
}

// Top CRE Leaderboard Interface
export interface TopCreLeaderboard {
  user_id: number;
  cre_name: string;
  retails: number;
  qualified: number;
  conversion_rate: number;
  rank: number;
}

// Conversion Funnel Interface
export interface ConversionFunnel {
  total_leads: number;
  qualified_leads: number;
  test_drives: number;
  bookings: number;
  retails: number;
  qualification_rate: number;
  test_drive_rate: number;
  booking_rate: number;
  retail_rate: number;
  overall_conversion: number;
}

/**
 * Get comprehensive dashboard metrics
 */
export async function getDashboardMetrics(dateRange: DateRange = { type: 'today' }): Promise<DashboardMetrics> {
  const { startDate, endDate } = getDateRangeFilter(dateRange);

  // Build base query for date filtering
  const buildDateQuery = (query: any) => {
    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }
    return query;
  };

  // Total Leads
  let totalQuery = supabaseAdmin
    .from('leads_master')
    .select('id', { count: 'exact', head: true });
  totalQuery = buildDateQuery(totalQuery);
  const { count: totalLeads } = await totalQuery;

  // Active Leads (IS_LOST = NULL, status != 'Disqualified')
  let activeQuery = supabaseAdmin
    .from('leads_master')
    .select('id', { count: 'exact', head: true })
    .is('IS_LOST', null)
    .neq('status', 'Disqualified');
  activeQuery = buildDateQuery(activeQuery);
  const { count: activeLeads } = await activeQuery;

  // Assigned Leads (assigned_to IS NOT NULL)
  let assignedQuery = supabaseAdmin
    .from('leads_master')
    .select('id', { count: 'exact', head: true })
    .not('assigned_to', 'is', null)
    .is('IS_LOST', null)
    .neq('status', 'Disqualified');
  assignedQuery = buildDateQuery(assignedQuery);
  const { count: assignedLeads } = await assignedQuery;

  // Unassigned Leads
  const unassignedLeads = (activeLeads || 0) - (assignedLeads || 0);

  // Working Leads (status IN ('Pending', 'Assigned') AND assigned_to IS NOT NULL)
  let workingQuery = supabaseAdmin
    .from('leads_master')
    .select('id', { count: 'exact', head: true })
    .in('status', ['Pending', 'Assigned'])
    .not('assigned_to', 'is', null)
    .is('IS_LOST', null)
    .neq('status', 'Disqualified');
  workingQuery = buildDateQuery(workingQuery);
  const { count: workingLeads } = await workingQuery;

  // Test Drives (TEST_DRIVE = TRUE)
  let testDriveQuery = supabaseAdmin
    .from('leads_qualification')
    .select('lead_id', { count: 'exact', head: true })
    .eq('TEST_DRIVE', true);
  
  if (startDate || endDate) {
    // Join with leads_master for date filtering
    const { data: testDriveLeads } = await supabaseAdmin
      .from('leads_qualification')
      .select('lead_id, leads_master!inner(created_at)')
      .eq('TEST_DRIVE', true);
    
    const filtered = (testDriveLeads || []).filter((item: any) => {
      const leadDate = new Date(item.leads_master?.created_at || item.created_at);
      if (startDate && leadDate < startDate) return false;
      if (endDate && leadDate > endDate) return false;
      return true;
    });
    var testDrives = filtered.length;
  } else {
    const { count } = await testDriveQuery;
    var testDrives = count || 0;
  }

  // Bookings (BOOKED = TRUE)
  let bookingQuery = supabaseAdmin
    .from('leads_qualification')
    .select('lead_id', { count: 'exact', head: true })
    .eq('BOOKED', true);
  
  if (startDate || endDate) {
    const { data: bookingLeads } = await supabaseAdmin
      .from('leads_qualification')
      .select('lead_id, leads_master!inner(created_at)')
      .eq('BOOKED', true);
    
    const filtered = (bookingLeads || []).filter((item: any) => {
      const leadDate = new Date(item.leads_master?.created_at || item.created_at);
      if (startDate && leadDate < startDate) return false;
      if (endDate && leadDate > endDate) return false;
      return true;
    });
    var bookings = filtered.length;
  } else {
    const { count } = await bookingQuery;
    var bookings = count || 0;
  }

  // Retails (RETAILED = TRUE)
  let retailQuery = supabaseAdmin
    .from('leads_qualification')
    .select('lead_id', { count: 'exact', head: true })
    .eq('RETAILED', true);
  
  if (startDate || endDate) {
    const { data: retailLeads } = await supabaseAdmin
      .from('leads_qualification')
      .select('lead_id, leads_master!inner(created_at)')
      .eq('RETAILED', true);
    
    const filtered = (retailLeads || []).filter((item: any) => {
      const leadDate = new Date(item.leads_master?.created_at || item.created_at);
      if (startDate && leadDate < startDate) return false;
      if (endDate && leadDate > endDate) return false;
      return true;
    });
    var retails = filtered.length;
  } else {
    const { count } = await retailQuery;
    var retails = count || 0;
  }

  // Qualified Leads
  let qualifiedQuery = supabaseAdmin
    .from('leads_master')
    .select('id', { count: 'exact', head: true })
    .eq('is_qualified', true)
    .is('IS_LOST', null);
  qualifiedQuery = buildDateQuery(qualifiedQuery);
  const { count: qualifiedLeads } = await qualifiedQuery;

  return {
    totalLeads: totalLeads || 0,
    activeLeads: activeLeads || 0,
    assignedLeads: assignedLeads || 0,
    unassignedLeads: unassignedLeads || 0,
    workingLeads: workingLeads || 0,
    testDrives: testDrives || 0,
    bookings: bookings || 0,
    retails: retails || 0,
    qualifiedLeads: qualifiedLeads || 0,
  };
}

/**
 * Get source-wise leads distribution
 */
export async function getSourceDistribution(dateRange: DateRange = { type: 'today' }): Promise<SourceDistribution[]> {
  const { startDate, endDate } = getDateRangeFilter(dateRange);

  // Get all sources
  const { data: sources, error: sourcesError } = await supabaseAdmin
    .from('sources')
    .select('id, display_name, source_type');

  if (sourcesError || !sources) {
    return [];
  }

  const results: SourceDistribution[] = [];

  for (const source of sources) {
    // Build base query for this source
    let baseQuery = supabaseAdmin
      .from('leads_master')
      .select('id, status, is_qualified, created_at')
      .eq('source_id', source.id);

    if (startDate) {
      baseQuery = baseQuery.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      baseQuery = baseQuery.lte('created_at', endDate.toISOString());
    }

    const { data: leads } = await baseQuery;
    const leadIds = (leads || []).map(l => l.id);

    // Get qualification data for these leads
    const { data: qualifications } = await supabaseAdmin
      .from('leads_qualification')
      .select('lead_id, TEST_DRIVE, BOOKED, RETAILED')
      .in('lead_id', leadIds.length > 0 ? leadIds : [-1]); // Use -1 to return empty if no leads

    const qualMap = new Map((qualifications || []).map(q => [q.lead_id, q]));

    // Calculate metrics
    const total_count = leads?.length || 0;
    const qualified = leads?.filter(l => l.is_qualified).length || 0;
    const enquiry = leads?.filter(l => ['New', 'Assigned', 'Pending'].includes(l.status)).length || 0;
    const test_drive = (qualifications || []).filter(q => q.TEST_DRIVE === true).length;
    const booked = (qualifications || []).filter(q => q.BOOKED === true).length;
    const retailed = (qualifications || []).filter(q => q.RETAILED === true).length;

    results.push({
      source_id: source.id,
      source_name: source.display_name,
      sub_source: source.source_type,
      total_count,
      qualified,
      enquiry,
      test_drive,
      booked,
      retailed,
    });
  }

  return results.sort((a, b) => b.total_count - a.total_count);
}

/**
 * Get CRE-wise leads distribution
 */
export async function getCrePerformance(dateRange: DateRange = { type: 'today' }): Promise<CrePerformance[]> {
  const { startDate, endDate } = getDateRangeFilter(dateRange);

  // Get all CREs (including inactive for historical data)
  const { data: cres, error: cresError } = await supabaseAdmin
    .from('users')
    .select('user_id, full_name')
    .eq('role', 'CRE');

  if (cresError || !cres) {
    return [];
  }

  const results: CrePerformance[] = [];

  for (const cre of cres) {
    // Build base query for this CRE
    let baseQuery = supabaseAdmin
      .from('leads_master')
      .select('id, is_qualified, created_at')
      .eq('assigned_to', cre.user_id)
      .is('IS_LOST', null)
      .neq('status', 'Disqualified');

    if (startDate) {
      baseQuery = baseQuery.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      baseQuery = baseQuery.lte('created_at', endDate.toISOString());
    }

    const { data: leads } = await baseQuery;
    const leadIds = (leads || []).map(l => l.id);

    // Get qualification data
    const { data: qualifications } = await supabaseAdmin
      .from('leads_qualification')
      .select('lead_id, TEST_DRIVE, BOOKED, RETAILED')
      .in('lead_id', leadIds.length > 0 ? leadIds : [-1]);

    // Calculate metrics
    const leads_assigned = leads?.length || 0;
    const qualified = leads?.filter(l => l.is_qualified).length || 0;
    const test_drive = (qualifications || []).filter(q => q.TEST_DRIVE === true).length;
    const booked = (qualifications || []).filter(q => q.BOOKED === true).length;
    const retailed = (qualifications || []).filter(q => q.RETAILED === true).length;

    // Calculate rates
    const qualification_rate = leads_assigned > 0 ? (qualified / leads_assigned) * 100 : 0;
    const test_drive_rate = qualified > 0 ? (test_drive / qualified) * 100 : 0;
    const booking_rate = test_drive > 0 ? (booked / test_drive) * 100 : 0;
    const retail_rate = booked > 0 ? (retailed / booked) * 100 : 0;
    const overall_conversion = leads_assigned > 0 ? (retailed / leads_assigned) * 100 : 0;

    results.push({
      user_id: cre.user_id,
      cre_name: cre.full_name || 'Unknown',
      leads_assigned,
      qualified,
      test_drive,
      booked,
      retailed,
      qualification_rate: Math.round(qualification_rate * 100) / 100,
      test_drive_rate: Math.round(test_drive_rate * 100) / 100,
      booking_rate: Math.round(booking_rate * 100) / 100,
      retail_rate: Math.round(retail_rate * 100) / 100,
      overall_conversion: Math.round(overall_conversion * 100) / 100,
    });
  }

  return results.sort((a, b) => b.leads_assigned - a.leads_assigned);
}

/**
 * Get branch-wise lead distribution (ETBR)
 */
export async function getBranchDistribution(dateRange: DateRange = { type: 'today' }): Promise<BranchDistribution[]> {
  const { startDate, endDate } = getDateRangeFilter(dateRange);

  // Get all branches
  const { data: branches, error: branchesError } = await supabaseAdmin
    .from('branches')
    .select('id, name');

  if (branchesError || !branches) {
    return [];
  }

  const results: BranchDistribution[] = [];

  for (const branch of branches) {
    // Get all qualifications for this branch
    let qualQuery = supabaseAdmin
      .from('leads_qualification')
      .select('lead_id, TEST_DRIVE, BOOKED, RETAILED, leads_master!inner(status, created_at)')
      .eq('branch_id', branch.id);

    const { data: qualifications } = await qualQuery;

    // Filter by date range if needed
    let filteredQuals = qualifications || [];
    if (startDate || endDate) {
      filteredQuals = (qualifications || []).filter((q: any) => {
        const leadDate = new Date(q.leads_master?.created_at || q.created_at);
        if (startDate && leadDate < startDate) return false;
        if (endDate && leadDate > endDate) return false;
        return true;
      });
    }

    // Calculate ETBR
    const enquiry = filteredQuals.filter((q: any) => 
      ['New', 'Assigned', 'Pending'].includes(q.leads_master?.status || q.status)
    ).length;
    const test_drive = filteredQuals.filter((q: any) => q.TEST_DRIVE === true).length;
    const booked = filteredQuals.filter((q: any) => q.BOOKED === true).length;
    const retailed = filteredQuals.filter((q: any) => q.RETAILED === true).length;

    results.push({
      branch_id: branch.id,
      branch_name: branch.name,
      enquiry,
      test_drive,
      booked,
      retailed,
    });
  }

  return results.sort((a, b) => b.retailed - a.retailed);
}

/**
 * Get qualification category distribution
 */
export async function getQualificationDistribution(dateRange: DateRange = { type: 'today' }): Promise<QualificationCategoryDistribution[]> {
  const { startDate, endDate } = getDateRangeFilter(dateRange);

  // Get all qualifications
  let qualQuery = supabaseAdmin
    .from('leads_qualification')
    .select('qualified_category, qualified_at, leads_master!inner(created_at)');

  const { data: qualifications } = await qualQuery;

  // Filter by date range if needed
  let filteredQuals = qualifications || [];
  if (startDate || endDate) {
    filteredQuals = (qualifications || []).filter((q: any) => {
      const qualDate = new Date(q.qualified_at || q.leads_master?.created_at || q.created_at);
      if (startDate && qualDate < startDate) return false;
      if (endDate && qualDate > endDate) return false;
      return true;
    });
  }

  // Group by category
  const categoryMap = new Map<string, number>();
  filteredQuals.forEach((q: any) => {
    const category = q.qualified_category || 'Unknown';
    categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
  });

  const total = filteredQuals.length;
  const results: QualificationCategoryDistribution[] = [];

  categoryMap.forEach((count, category) => {
    results.push({
      category,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0,
    });
  });

  return results.sort((a, b) => b.count - a.count);
}

/**
 * Get top performing CREs (leaderboard)
 */
export async function getTopPerformingCres(limit: number = 10, dateRange: DateRange = { type: 'today' }): Promise<TopCreLeaderboard[]> {
  const crePerformance = await getCrePerformance(dateRange);

  // Sort by retails (primary), then conversion rate (secondary), then qualified (tertiary)
  const sorted = crePerformance
    .filter(cre => cre.retailed > 0 || cre.qualified > 0) // Only show CREs with activity
    .sort((a, b) => {
      if (b.retailed !== a.retailed) return b.retailed - a.retailed;
      if (b.overall_conversion !== a.overall_conversion) return b.overall_conversion - a.overall_conversion;
      return b.qualified - a.qualified;
    })
    .slice(0, limit)
    .map((cre, index) => ({
      user_id: cre.user_id,
      cre_name: cre.cre_name,
      retails: cre.retailed,
      qualified: cre.qualified,
      conversion_rate: cre.overall_conversion,
      rank: index + 1,
    }));

  return sorted;
}

/**
 * Get conversion funnel
 */
export async function getConversionFunnel(dateRange: DateRange = { type: 'today' }): Promise<ConversionFunnel> {
  const metrics = await getDashboardMetrics(dateRange);

  const total_leads = metrics.totalLeads;
  const qualified_leads = metrics.qualifiedLeads;
  const test_drives = metrics.testDrives;
  const bookings = metrics.bookings;
  const retails = metrics.retails;

  // Calculate rates
  const qualification_rate = total_leads > 0 ? (qualified_leads / total_leads) * 100 : 0;
  const test_drive_rate = qualified_leads > 0 ? (test_drives / qualified_leads) * 100 : 0;
  const booking_rate = test_drives > 0 ? (bookings / test_drives) * 100 : 0;
  const retail_rate = bookings > 0 ? (retails / bookings) * 100 : 0;
  const overall_conversion = total_leads > 0 ? (retails / total_leads) * 100 : 0;

  return {
    total_leads,
    qualified_leads,
    test_drives,
    bookings,
    retails,
    qualification_rate: Math.round(qualification_rate * 100) / 100,
    test_drive_rate: Math.round(test_drive_rate * 100) / 100,
    booking_rate: Math.round(booking_rate * 100) / 100,
    retail_rate: Math.round(retail_rate * 100) / 100,
    overall_conversion: Math.round(overall_conversion * 100) / 100,
  };
}

// Advanced Analytics Filters Interface
export interface AdvancedAnalyticsFilters {
  dateRange?: DateRange;
  sourceIds?: number[];
  subSources?: string[];
  locations?: string[];
  creIds?: number[];
  branchIds?: number[];
  statuses?: string[];
  models?: string[];
  variants?: string[];
  qualificationCategories?: string[];
  testDrive?: boolean | null;
  booked?: boolean | null;
  retailed?: boolean | null;
}

// Advanced Analytics Result Interface
export interface AdvancedAnalyticsResult {
  metrics: DashboardMetrics;
  sourceDistribution: SourceDistribution[];
  locationDistribution: Array<{
    location: string;
    total_count: number;
    qualified: number;
    enquiry: number;
    test_drive: number;
    booked: number;
    retailed: number;
  }>;
  subSourceDistribution: Array<{
    sub_source: string;
    source_name: string;
    total_count: number;
    qualified: number;
    enquiry: number;
    test_drive: number;
    booked: number;
    retailed: number;
  }>;
  modelDistribution: Array<{
    model: string;
    total_count: number;
    qualified: number;
    test_drive: number;
    booked: number;
    retailed: number;
  }>;
  crePerformance: CrePerformance[];
  branchDistribution: BranchDistribution[];
  leadDetails: Array<{
    lead_id: number;
    customer_name: string;
    phone_number: string;
    source_name: string;
    sub_source: string;
    location: string;
    model: string;
    variant: string;
    status: string;
    cre_name: string;
    branch_name: string;
    qualified: boolean;
    test_drive: boolean;
    booked: boolean;
    retailed: boolean;
    created_at: string;
  }>;
  totalRecords: number;
}

/**
 * Get advanced analytics with comprehensive filters
 */
export async function getAdvancedAnalytics(
  filters: AdvancedAnalyticsFilters
): Promise<AdvancedAnalyticsResult> {
  const { startDate, endDate } = getDateRangeFilter(filters.dateRange || { type: 'today' });

  // Build base query with all filters
  let baseQuery = supabaseAdmin
    .from('leads_master')
    .select(`
      id,
      full_name,
      phone_number_normalized,
      status,
      is_qualified,
      created_at,
      assigned_to,
      source_id,
      sources!inner(id, display_name, source_type),
      users!leads_master_assigned_to_fkey(full_name),
      leads_qualification(
        customer_location,
        model_interested,
        variant,
        qualified_category,
        TEST_DRIVE,
        BOOKED,
        RETAILED,
        branch_id,
        branches(name)
      )
    `)
    .is('IS_LOST', null)
    .neq('status', 'Disqualified');

  // Apply date filter
  if (startDate) {
    baseQuery = baseQuery.gte('created_at', startDate.toISOString());
  }
  if (endDate) {
    baseQuery = baseQuery.lte('created_at', endDate.toISOString());
  }

  // Apply source filter
  if (filters.sourceIds && filters.sourceIds.length > 0) {
    baseQuery = baseQuery.in('source_id', filters.sourceIds);
  }

  // Apply status filter
  if (filters.statuses && filters.statuses.length > 0) {
    baseQuery = baseQuery.in('status', filters.statuses);
  }

  // Apply CRE filter
  if (filters.creIds && filters.creIds.length > 0) {
    baseQuery = baseQuery.in('assigned_to', filters.creIds);
  }

  const { data: leads, error } = await baseQuery;

  if (error || !leads) {
    return {
      metrics: {
        totalLeads: 0,
        activeLeads: 0,
        assignedLeads: 0,
        unassignedLeads: 0,
        workingLeads: 0,
        testDrives: 0,
        bookings: 0,
        retails: 0,
        qualifiedLeads: 0,
      },
      sourceDistribution: [],
      locationDistribution: [],
      subSourceDistribution: [],
      modelDistribution: [],
      crePerformance: [],
      branchDistribution: [],
      leadDetails: [],
      totalRecords: 0,
    };
  }

  // Apply additional filters that require qualification data
  let filteredLeads = leads;
  
  if (filters.subSources && filters.subSources.length > 0) {
    filteredLeads = filteredLeads.filter((lead: any) => {
      const subSource = lead.sources?.source_type;
      return subSource && filters.subSources!.includes(subSource);
    });
  }

  if (filters.locations && filters.locations.length > 0) {
    filteredLeads = filteredLeads.filter((lead: any) => {
      const location = lead.leads_qualification?.[0]?.customer_location;
      return location && filters.locations!.includes(location);
    });
  }

  if (filters.models && filters.models.length > 0) {
    filteredLeads = filteredLeads.filter((lead: any) => {
      const model = lead.leads_qualification?.[0]?.model_interested;
      return model && filters.models!.includes(model);
    });
  }

  if (filters.variants && filters.variants.length > 0) {
    filteredLeads = filteredLeads.filter((lead: any) => {
      const variant = lead.leads_qualification?.[0]?.variant;
      return variant && filters.variants!.includes(variant);
    });
  }

  if (filters.qualificationCategories && filters.qualificationCategories.length > 0) {
    filteredLeads = filteredLeads.filter((lead: any) => {
      const category = lead.leads_qualification?.[0]?.qualified_category;
      return category && filters.qualificationCategories!.includes(category);
    });
  }

  if (filters.testDrive !== null && filters.testDrive !== undefined) {
    filteredLeads = filteredLeads.filter((lead: any) => {
      const testDrive = lead.leads_qualification?.[0]?.TEST_DRIVE;
      return testDrive === filters.testDrive;
    });
  }

  if (filters.booked !== null && filters.booked !== undefined) {
    filteredLeads = filteredLeads.filter((lead: any) => {
      const booked = lead.leads_qualification?.[0]?.BOOKED;
      return booked === filters.booked;
    });
  }

  if (filters.retailed !== null && filters.retailed !== undefined) {
    filteredLeads = filteredLeads.filter((lead: any) => {
      const retailed = lead.leads_qualification?.[0]?.RETAILED;
      return retailed === filters.retailed;
    });
  }

  if (filters.branchIds && filters.branchIds.length > 0) {
    filteredLeads = filteredLeads.filter((lead: any) => {
      const branchId = lead.leads_qualification?.[0]?.branch_id;
      return branchId && filters.branchIds!.includes(branchId);
    });
  }

  // Calculate metrics
  const totalLeads = filteredLeads.length;
  const activeLeads = filteredLeads.filter((l: any) => l.status !== 'Disqualified').length;
  const assignedLeads = filteredLeads.filter((l: any) => l.assigned_to).length;
  const unassignedLeads = activeLeads - assignedLeads;
  const workingLeads = filteredLeads.filter((l: any) => 
    ['Pending', 'Assigned'].includes(l.status) && l.assigned_to
  ).length;
  const qualifiedLeads = filteredLeads.filter((l: any) => l.is_qualified).length;
  const testDrives = filteredLeads.filter((l: any) => 
    l.leads_qualification?.[0]?.TEST_DRIVE === true
  ).length;
  const bookings = filteredLeads.filter((l: any) => 
    l.leads_qualification?.[0]?.BOOKED === true
  ).length;
  const retails = filteredLeads.filter((l: any) => 
    l.leads_qualification?.[0]?.RETAILED === true
  ).length;

  // Build distributions
  const sourceMap = new Map<number, any>();
  const locationMap = new Map<string, any>();
  const subSourceMap = new Map<string, any>();
  const modelMap = new Map<string, any>();
  const creMap = new Map<number, any>();
  const branchMap = new Map<number, any>();

  filteredLeads.forEach((lead: any) => {
    const source = lead.sources;
    const qual = lead.leads_qualification?.[0];
    const cre = lead.users;
    const branch = qual?.branches;

    // Source distribution
    if (source) {
      const key = source.id;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          source_id: source.id,
          source_name: source.display_name,
          sub_source: source.source_type,
          total_count: 0,
          qualified: 0,
          enquiry: 0,
          test_drive: 0,
          booked: 0,
          retailed: 0,
        });
      }
      const src = sourceMap.get(key);
      src.total_count++;
      if (lead.is_qualified) src.qualified++;
      if (['New', 'Assigned', 'Pending'].includes(lead.status)) src.enquiry++;
      if (qual?.TEST_DRIVE) src.test_drive++;
      if (qual?.BOOKED) src.booked++;
      if (qual?.RETAILED) src.retailed++;
    }

    // Location distribution
    if (qual?.customer_location) {
      const location = qual.customer_location;
      if (!locationMap.has(location)) {
        locationMap.set(location, {
          location,
          total_count: 0,
          qualified: 0,
          enquiry: 0,
          test_drive: 0,
          booked: 0,
          retailed: 0,
        });
      }
      const loc = locationMap.get(location);
      loc.total_count++;
      if (lead.is_qualified) loc.qualified++;
      if (['New', 'Assigned', 'Pending'].includes(lead.status)) loc.enquiry++;
      if (qual.TEST_DRIVE) loc.test_drive++;
      if (qual.BOOKED) loc.booked++;
      if (qual.RETAILED) loc.retailed++;
    }

    // Sub-source distribution
    if (source?.source_type) {
      const subSource = source.source_type;
      const key = `${source.id}_${subSource}`;
      if (!subSourceMap.has(key)) {
        subSourceMap.set(key, {
          sub_source: subSource,
          source_name: source.display_name,
          total_count: 0,
          qualified: 0,
          enquiry: 0,
          test_drive: 0,
          booked: 0,
          retailed: 0,
        });
      }
      const sub = subSourceMap.get(key);
      sub.total_count++;
      if (lead.is_qualified) sub.qualified++;
      if (['New', 'Assigned', 'Pending'].includes(lead.status)) sub.enquiry++;
      if (qual?.TEST_DRIVE) sub.test_drive++;
      if (qual?.BOOKED) sub.booked++;
      if (qual?.RETAILED) sub.retailed++;
    }

    // Model distribution
    if (qual?.model_interested) {
      const model = qual.model_interested;
      if (!modelMap.has(model)) {
        modelMap.set(model, {
          model,
          total_count: 0,
          qualified: 0,
          test_drive: 0,
          booked: 0,
          retailed: 0,
        });
      }
      const mod = modelMap.get(model);
      mod.total_count++;
      if (lead.is_qualified) mod.qualified++;
      if (qual.TEST_DRIVE) mod.test_drive++;
      if (qual.BOOKED) mod.booked++;
      if (qual.RETAILED) mod.retailed++;
    }

    // CRE performance
    if (lead.assigned_to && cre) {
      const creId = lead.assigned_to;
      if (!creMap.has(creId)) {
        creMap.set(creId, {
          user_id: creId,
          cre_name: cre.full_name || 'Unknown',
          leads_assigned: 0,
          qualified: 0,
          test_drive: 0,
          booked: 0,
          retailed: 0,
        });
      }
      const crePerf = creMap.get(creId);
      crePerf.leads_assigned++;
      if (lead.is_qualified) crePerf.qualified++;
      if (qual?.TEST_DRIVE) crePerf.test_drive++;
      if (qual?.BOOKED) crePerf.booked++;
      if (qual?.RETAILED) crePerf.retailed++;
    }

    // Branch distribution
    if (qual?.branch_id && branch) {
      const branchId = qual.branch_id;
      if (!branchMap.has(branchId)) {
        branchMap.set(branchId, {
          branch_id: branchId,
          branch_name: branch.name,
          enquiry: 0,
          test_drive: 0,
          booked: 0,
          retailed: 0,
        });
      }
      const br = branchMap.get(branchId);
      if (['New', 'Assigned', 'Pending'].includes(lead.status)) br.enquiry++;
      if (qual.TEST_DRIVE) br.test_drive++;
      if (qual.BOOKED) br.booked++;
      if (qual.RETAILED) br.retailed++;
    }
  });

  // Calculate CRE rates
  const crePerformance = Array.from(creMap.values()).map((cre: any) => {
    const qualification_rate = cre.leads_assigned > 0 ? (cre.qualified / cre.leads_assigned) * 100 : 0;
    const test_drive_rate = cre.qualified > 0 ? (cre.test_drive / cre.qualified) * 100 : 0;
    const booking_rate = cre.test_drive > 0 ? (cre.booked / cre.test_drive) * 100 : 0;
    const retail_rate = cre.booked > 0 ? (cre.retailed / cre.booked) * 100 : 0;
    const overall_conversion = cre.leads_assigned > 0 ? (cre.retailed / cre.leads_assigned) * 100 : 0;

    return {
      ...cre,
      qualification_rate: Math.round(qualification_rate * 100) / 100,
      test_drive_rate: Math.round(test_drive_rate * 100) / 100,
      booking_rate: Math.round(booking_rate * 100) / 100,
      retail_rate: Math.round(retail_rate * 100) / 100,
      overall_conversion: Math.round(overall_conversion * 100) / 100,
    };
  });

  // Build lead details
  const leadDetails = filteredLeads.map((lead: any) => ({
    lead_id: lead.id,
    customer_name: lead.full_name || 'Unknown',
    phone_number: lead.phone_number_normalized || '',
    source_name: lead.sources?.display_name || 'Unknown',
    sub_source: lead.sources?.source_type || '',
    location: lead.leads_qualification?.[0]?.customer_location || '',
    model: lead.leads_qualification?.[0]?.model_interested || '',
    variant: lead.leads_qualification?.[0]?.variant || '',
    status: lead.status || '',
    cre_name: lead.users?.full_name || '',
    branch_name: lead.leads_qualification?.[0]?.branches?.name || '',
    qualified: lead.is_qualified || false,
    test_drive: lead.leads_qualification?.[0]?.TEST_DRIVE || false,
    booked: lead.leads_qualification?.[0]?.BOOKED || false,
    retailed: lead.leads_qualification?.[0]?.RETAILED || false,
    created_at: lead.created_at,
  }));

  return {
    metrics: {
      totalLeads,
      activeLeads,
      assignedLeads,
      unassignedLeads,
      workingLeads,
      testDrives,
      bookings,
      retails,
      qualifiedLeads,
    },
    sourceDistribution: Array.from(sourceMap.values()).sort((a, b) => b.total_count - a.total_count),
    locationDistribution: Array.from(locationMap.values()).sort((a, b) => b.total_count - a.total_count),
    subSourceDistribution: Array.from(subSourceMap.values()).sort((a, b) => b.total_count - a.total_count),
    modelDistribution: Array.from(modelMap.values()).sort((a, b) => b.total_count - a.total_count),
    crePerformance: crePerformance.sort((a, b) => b.leads_assigned - a.leads_assigned),
    branchDistribution: Array.from(branchMap.values()).sort((a, b) => b.retailed - a.retailed),
    leadDetails,
    totalRecords: totalLeads,
  };
}

