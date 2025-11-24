import { SafeUser } from '../types/user';

/**
 * Permission helper functions for role-based access control
 * 
 * Hierarchy:
 * - Developer: Highest privileges (system config, all data)
 * - CRE_TL (Team Lead): All CRE permissions + manage team, view all leads, configure rules
 * - CRE: Only own assigned leads
 */

/**
 * Check if user can view all leads (not just assigned ones)
 * CRE_TL and Developer can view all leads
 */
export const canViewAllLeads = (user: SafeUser): boolean => {
  return user.isDeveloper || user.role === 'CRE_TL';
};

/**
 * Check if user can manage assignment rules
 * Only CRE_TL and Developer can manage rules
 */
export const canManageAssignmentRules = (user: SafeUser): boolean => {
  return user.isDeveloper || user.role === 'CRE_TL';
};

/**
 * Check if user can review qualified leads (TL review workflow)
 * Only CRE_TL and Developer can review
 */
export const canReviewQualifiedLeads = (user: SafeUser): boolean => {
  return user.isDeveloper || user.role === 'CRE_TL';
};

/**
 * Check if user can manage CRE users (create, update, delete CRE accounts)
 * Only CRE_TL and Developer can manage users
 */
export const canManageUsers = (user: SafeUser): boolean => {
  return user.isDeveloper || user.role === 'CRE_TL';
};

/**
 * Check if user can view all CRE performance data
 * Only CRE_TL and Developer can view team performance
 */
export const canViewTeamPerformance = (user: SafeUser): boolean => {
  return user.isDeveloper || user.role === 'CRE_TL';
};

/**
 * Check if user can configure system settings (sources, webhooks, etc.)
 * Only Developer can configure system
 */
export const canConfigureSystem = (user: SafeUser): boolean => {
  return user.isDeveloper;
};

/**
 * Check if user can view webhook logs and system logs
 * Only Developer can view system logs
 */
export const canViewSystemLogs = (user: SafeUser): boolean => {
  return user.isDeveloper;
};

/**
 * Check if user can reassign leads
 * CRE_TL and Developer can reassign any lead
 * CRE cannot reassign (only update status)
 */
export const canReassignLeads = (user: SafeUser): boolean => {
  return user.isDeveloper || user.role === 'CRE_TL';
};

/**
 * Check if user can bulk assign leads
 * Only CRE_TL and Developer can bulk assign
 */
export const canBulkAssignLeads = (user: SafeUser): boolean => {
  return user.isDeveloper || user.role === 'CRE_TL';
};

/**
 * Check if user can export leads/reports
 * CRE_TL and Developer can export all data
 * CRE can only export their own leads (if needed)
 */
export const canExportAllLeads = (user: SafeUser): boolean => {
  return user.isDeveloper || user.role === 'CRE_TL';
};

/**
 * Check if user can import leads (bulk upload)
 * Only CRE_TL and Developer can import
 */
export const canImportLeads = (user: SafeUser): boolean => {
  return user.isDeveloper || user.role === 'CRE_TL';
};

/**
 * Get the user ID filter for lead queries
 * Returns null if user can view all leads, otherwise returns user's ID
 */
export const getLeadQueryFilter = (user: SafeUser): number | null => {
  if (canViewAllLeads(user)) {
    return null; // No filter - can see all
  }
  return user.id; // Filter by assigned_to
};

/**
 * Check if user can access a specific lead
 * This should be used with actual lead data from DB
 */
export const canAccessLead = (user: SafeUser, leadAssignedTo: number | null): boolean => {
  // Developer and CRE_TL can access any lead
  if (canViewAllLeads(user)) {
    return true;
  }
  
  // CRE can only access leads assigned to them
  if (user.role === 'CRE') {
    return leadAssignedTo === user.id;
  }
  
  return false;
};

/**
 * Get list of roles that have permission for a specific action
 */
export const getRolesWithPermission = (permission: keyof typeof permissionChecks): string[] => {
  return permissionChecks[permission]();
};

const permissionChecks = {
  viewAllLeads: () => ['CRE_TL', 'Developer'],
  manageAssignmentRules: () => ['CRE_TL', 'Developer'],
  reviewQualifiedLeads: () => ['CRE_TL', 'Developer'],
  manageUsers: () => ['CRE_TL', 'Developer'],
  viewTeamPerformance: () => ['CRE_TL', 'Developer'],
  configureSystem: () => ['Developer'],
  viewSystemLogs: () => ['Developer'],
  reassignLeads: () => ['CRE_TL', 'Developer'],
  bulkAssignLeads: () => ['CRE_TL', 'Developer'],
  exportAllLeads: () => ['CRE_TL', 'Developer'],
  importLeads: () => ['CRE_TL', 'Developer']
};

