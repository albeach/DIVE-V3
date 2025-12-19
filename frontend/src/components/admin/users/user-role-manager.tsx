/**
 * User Role Manager Component
 * 
 * Allows admins to manage user roles with:
 * - Role assignment/removal
 * - Role descriptions
 * - Clearance-based role restrictions
 * - Batch role operations
 */

'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Plus,
  Minus,
  Info,
  AlertTriangle,
  CheckCircle,
  X,
  Save,
  RefreshCw,
} from 'lucide-react';
import { adminToast } from '@/lib/admin-toast';

// ============================================
// Types
// ============================================

export interface IRole {
  name: string;
  displayName: string;
  description: string;
  level: 'basic' | 'elevated' | 'admin' | 'super';
  requiredClearance?: string;
  permissions: string[];
}

interface UserRoleManagerProps {
  userId: string;
  username: string;
  currentRoles: string[];
  userClearance?: string;
  onRolesChange?: (roles: string[]) => void;
  onSave?: (userId: string, roles: string[]) => Promise<void>;
  compact?: boolean;
}

// ============================================
// Role Definitions
// ============================================

const AVAILABLE_ROLES: IRole[] = [
  {
    name: 'dive-user',
    displayName: 'DIVE User',
    description: 'Basic access to resources based on clearance level',
    level: 'basic',
    permissions: ['view_resources', 'download_resources'],
  },
  {
    name: 'dive-analyst',
    displayName: 'DIVE Analyst',
    description: 'Extended access for intelligence analysts',
    level: 'elevated',
    requiredClearance: 'CONFIDENTIAL',
    permissions: ['view_resources', 'download_resources', 'export_reports', 'view_metadata'],
  },
  {
    name: 'dive-admin',
    displayName: 'DIVE Admin',
    description: 'Administrative access to manage users and configurations',
    level: 'admin',
    requiredClearance: 'SECRET',
    permissions: ['manage_users', 'manage_idps', 'view_logs', 'manage_policies'],
  },
  {
    name: 'super_admin',
    displayName: 'Super Admin',
    description: 'Full system access including federation management',
    level: 'super',
    requiredClearance: 'TOP_SECRET',
    permissions: ['all'],
  },
  {
    name: 'federation-manager',
    displayName: 'Federation Manager',
    description: 'Manage spoke registrations and federation policies',
    level: 'admin',
    requiredClearance: 'SECRET',
    permissions: ['manage_spokes', 'view_federation', 'approve_spokes'],
  },
  {
    name: 'audit-viewer',
    displayName: 'Audit Viewer',
    description: 'Read-only access to audit logs',
    level: 'elevated',
    requiredClearance: 'CONFIDENTIAL',
    permissions: ['view_logs', 'export_logs'],
  },
];

const CLEARANCE_HIERARCHY = {
  'UNCLASSIFIED': 0,
  'CONFIDENTIAL': 1,
  'SECRET': 2,
  'TOP_SECRET': 3,
};

const LEVEL_COLORS = {
  basic: 'bg-slate-100 text-slate-700 border-slate-200',
  elevated: 'bg-blue-100 text-blue-700 border-blue-200',
  admin: 'bg-amber-100 text-amber-700 border-amber-200',
  super: 'bg-red-100 text-red-700 border-red-200',
};

// ============================================
// Component
// ============================================

export function UserRoleManager({
  userId,
  username,
  currentRoles,
  userClearance = 'UNCLASSIFIED',
  onRolesChange,
  onSave,
  compact = false,
}: UserRoleManagerProps) {
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(currentRoles));
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingRole, setPendingRole] = useState<{ role: IRole; action: 'add' | 'remove' } | null>(null);

  const hasChanges = !areSetsEqual(selectedRoles, new Set(currentRoles));

  const canAssignRole = useCallback((role: IRole): boolean => {
    if (!role.requiredClearance) return true;
    
    const userLevel = CLEARANCE_HIERARCHY[userClearance as keyof typeof CLEARANCE_HIERARCHY] || 0;
    const requiredLevel = CLEARANCE_HIERARCHY[role.requiredClearance as keyof typeof CLEARANCE_HIERARCHY] || 0;
    
    return userLevel >= requiredLevel;
  }, [userClearance]);

  const toggleRole = useCallback((role: IRole) => {
    const isCurrentlyAssigned = selectedRoles.has(role.name);
    
    // For admin/super roles, show confirmation
    if (role.level === 'admin' || role.level === 'super') {
      setPendingRole({ role, action: isCurrentlyAssigned ? 'remove' : 'add' });
      setShowConfirm(true);
      return;
    }

    // Direct toggle for basic/elevated roles
    const newRoles = new Set(selectedRoles);
    if (isCurrentlyAssigned) {
      newRoles.delete(role.name);
    } else {
      newRoles.add(role.name);
    }
    
    setSelectedRoles(newRoles);
    onRolesChange?.(Array.from(newRoles));
  }, [selectedRoles, onRolesChange]);

  const confirmRoleChange = useCallback(() => {
    if (!pendingRole) return;

    const newRoles = new Set(selectedRoles);
    if (pendingRole.action === 'add') {
      newRoles.add(pendingRole.role.name);
    } else {
      newRoles.delete(pendingRole.role.name);
    }

    setSelectedRoles(newRoles);
    onRolesChange?.(Array.from(newRoles));
    setShowConfirm(false);
    setPendingRole(null);
  }, [pendingRole, selectedRoles, onRolesChange]);

  const handleSave = async () => {
    if (!onSave) return;

    setIsLoading(true);
    try {
      await onSave(userId, Array.from(selectedRoles));
      adminToast.user.roleAssigned(username, `${selectedRoles.size} roles`);
    } catch (error) {
      adminToast.error('Failed to update roles', error);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setSelectedRoles(new Set(currentRoles));
    onRolesChange?.(currentRoles);
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        {AVAILABLE_ROLES.filter(role => selectedRoles.has(role.name)).map(role => (
          <span
            key={role.name}
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${LEVEL_COLORS[role.level]}`}
          >
            <Shield className="h-3 w-3 mr-1" />
            {role.displayName}
          </span>
        ))}
        {selectedRoles.size === 0 && (
          <span className="text-xs text-gray-400 italic">No roles assigned</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Role Management</h3>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Reset
            </button>
            {onSave && (
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="inline-flex items-center px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Save Changes
              </button>
            )}
          </div>
        )}
      </div>

      {/* Role Grid */}
      <div className="grid gap-2">
        {AVAILABLE_ROLES.map(role => {
          const isAssigned = selectedRoles.has(role.name);
          const canAssign = canAssignRole(role);

          return (
            <motion.div
              key={role.name}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`
                relative p-3 rounded-lg border transition-all
                ${isAssigned 
                  ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 shadow-sm' 
                  : 'bg-white border-gray-200 hover:border-gray-300'
                }
                ${!canAssign ? 'opacity-50' : ''}
              `}
            >
              <div className="flex items-start gap-3">
                {/* Toggle Button */}
                <button
                  onClick={() => toggleRole(role)}
                  disabled={!canAssign}
                  className={`
                    mt-0.5 p-1 rounded-full transition-all
                    ${isAssigned 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-400 hover:bg-gray-300'
                    }
                    ${!canAssign ? 'cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {isAssigned ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                </button>

                {/* Role Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{role.displayName}</span>
                    <span className={`px-1.5 py-0.5 text-xs font-medium rounded border ${LEVEL_COLORS[role.level]}`}>
                      {role.level}
                    </span>
                    {role.requiredClearance && (
                      <span className="text-xs text-gray-500">
                        (Requires {role.requiredClearance})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>
                </div>

                {/* Status Indicator */}
                {isAssigned && (
                  <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                )}
              </div>

              {/* Clearance Warning */}
              {!canAssign && (
                <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  User clearance too low for this role
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="text-xs text-gray-500 flex items-center gap-2">
        <Info className="h-3 w-3" />
        {selectedRoles.size} role{selectedRoles.size !== 1 ? 's' : ''} assigned to {username}
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && pendingRole && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${pendingRole.action === 'add' ? 'bg-blue-100' : 'bg-amber-100'}`}>
                  <Shield className={`h-5 w-5 ${pendingRole.action === 'add' ? 'text-blue-600' : 'text-amber-600'}`} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {pendingRole.action === 'add' ? 'Assign' : 'Remove'} {pendingRole.role.level === 'super' ? 'Super Admin' : 'Admin'} Role
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {pendingRole.action === 'add'
                      ? `This will grant ${username} administrative privileges.`
                      : `This will revoke ${username}'s administrative privileges.`
                    }
                  </p>
                  
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                    <div className="text-sm font-medium text-gray-900">{pendingRole.role.displayName}</div>
                    <div className="text-xs text-gray-500 mt-1">{pendingRole.role.description}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRoleChange}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${
                    pendingRole.action === 'add'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {pendingRole.action === 'add' ? 'Assign Role' : 'Remove Role'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper function
function areSetsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export default UserRoleManager;
