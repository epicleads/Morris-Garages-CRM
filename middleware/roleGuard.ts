import { FastifyReply, FastifyRequest } from 'fastify';
import { authorize } from './authGuard';
import { SafeUser } from '../types/user';
import {
  canViewAllLeads,
  canManageAssignmentRules,
  canReviewQualifiedLeads,
  canManageUsers,
  canReassignLeads,
  canBulkAssignLeads,
  canImportLeads,
  canConfigureSystem,
  canViewSystemLogs
} from '../services/permissions.service';

type Permission = 
  | 'viewAllLeads'
  | 'manageAssignmentRules'
  | 'reviewQualifiedLeads'
  | 'manageUsers'
  | 'reassignLeads'
  | 'bulkAssignLeads'
  | 'importLeads'
  | 'configureSystem'
  | 'viewSystemLogs';

/**
 * Middleware to check specific permissions
 * Usage: requirePermission('manageAssignmentRules')
 */
export const requirePermission = (permission: Permission) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // First ensure user is authenticated
    await authorize()(request, reply);
    
    if (reply.sent) return; // Authorization failed
    
    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    let hasPermission = false;

    switch (permission) {
      case 'viewAllLeads':
        hasPermission = canViewAllLeads(user);
        break;
      case 'manageAssignmentRules':
        hasPermission = canManageAssignmentRules(user);
        break;
      case 'reviewQualifiedLeads':
        hasPermission = canReviewQualifiedLeads(user);
        break;
      case 'manageUsers':
        hasPermission = canManageUsers(user);
        break;
      case 'reassignLeads':
        hasPermission = canReassignLeads(user);
        break;
      case 'bulkAssignLeads':
        hasPermission = canBulkAssignLeads(user);
        break;
      case 'importLeads':
        hasPermission = canImportLeads(user);
        break;
      case 'configureSystem':
        hasPermission = canConfigureSystem(user);
        break;
      case 'viewSystemLogs':
        hasPermission = canViewSystemLogs(user);
        break;
      default:
        hasPermission = false;
    }

    if (!hasPermission) {
      return reply.status(403).send({ 
        message: `Permission denied: ${permission}` 
      });
    }
  };
};

/**
 * Middleware to ensure user can access a lead resource
 * Checks if lead is assigned to user (for CRE) or allows all (for CRE_TL/Developer)
 * 
 * Usage: requireLeadAccess() - expects leadId in params or body
 */
export const requireLeadAccess = () => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authorize()(request, reply);
    if (reply.sent) return;

    const user = request.authUser;
    if (!user) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    // CRE_TL and Developer can access any lead
    if (canViewAllLeads(user)) {
      return; // Allow access
    }

    // For CRE, we need to check if lead is assigned to them
    // This will be checked in the controller/service layer
    // by querying the lead and verifying assigned_to
    // For now, we just ensure they're authenticated as CRE
    if (user.role !== 'CRE') {
      return reply.status(403).send({ message: 'Access denied' });
    }
  };
};

/**
 * Helper to check if current user can access a specific lead
 * Use this in controllers after fetching the lead
 */
export const checkLeadAccess = (user: SafeUser, leadAssignedTo: number | null): boolean => {
  if (canViewAllLeads(user)) {
    return true;
  }
  
  if (user.role === 'CRE') {
    return leadAssignedTo === user.id;
  }
  
  return false;
};

