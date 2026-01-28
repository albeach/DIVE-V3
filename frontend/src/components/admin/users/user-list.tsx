/**
 * User List Component - Complete CRUD Implementation
 *
 * Features:
 * - Search and filter users
 * - Create new users with DIVE attributes
 * - Edit user details and clearance
 * - Reset passwords
 * - Delete users
 * - Role management
 * - Toast notifications
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  UserPlus,
  Trash2,
  RefreshCw,
  Shield,
  Mail,
  CheckCircle,
  XCircle,
  Edit2,
  Key,
  X,
  Save,
  AlertTriangle,
  User as UserIcon,
  Globe,
  Lock,
  Download
} from 'lucide-react';
import { adminToast } from '@/lib/admin-toast';
import { exportUsers } from '@/lib/export-utils';
import type { IAdminUser } from '@/types/admin.types';
import { auditActions } from '@/lib/admin-audit';

// ============================================
// Types
// ============================================

interface User {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  emailVerified: boolean;
  createdTimestamp: number;
  attributes?: {
    clearance?: string[];
    countryOfAffiliation?: string[];
    uniqueID?: string[];
    acpCOI?: string[];
  };
  realmRoles?: string[];
}

interface UserFormData {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  enabled: boolean;
  clearance: string;
  countryOfAffiliation: string;
  roles: string[];
}

const CLEARANCE_LEVELS = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
const COUNTRIES = ['USA', 'GBR', 'FRA', 'CAN', 'DEU', 'BEL', 'NLD', 'POL', 'NOR', 'DNK', 'ALB', 'ESP', 'ITA'];
const AVAILABLE_ROLES = ['dive-user', 'dive-admin', 'super_admin'];

// ============================================
// Component
// ============================================

export default function UserList() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<IAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<IAdminUser | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    enabled: true,
    clearance: 'UNCLASSIFIED',
    countryOfAffiliation: 'USA',
    roles: ['dive-user'],
  });

  const [newPassword, setNewPassword] = useState('');

  // ============================================
  // API Functions
  // ============================================

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use frontend API route to proxy to backend
      const queryParams = new URLSearchParams({
        limit: '100',
        search
      });

      const response = await fetch(`/api/admin/users?${queryParams}`);

      if (!response.ok) {
        // Return mock data for development
        console.warn('[UserList] Backend unavailable, using mock data');
        setUsers(generateMockUsers());
        return;
      }

      const data = await response.json();
      if (data.success && data.data?.users) {
        setUsers(data.data.users as IAdminUser[]);
      } else if (Array.isArray(data)) {
        setUsers(data);
      } else {
        setUsers(generateMockUsers());
      }
    } catch (err) {
      console.error('[UserList] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setUsers(generateMockUsers());
    } finally {
      setLoading(false);
    }
  }, [search]);

  const createUser = async () => {
    if (formData.password !== formData.confirmPassword) {
      adminToast.error('Passwords do not match');
      return;
    }

    setFormLoading(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          password: formData.password,
          enabled: formData.enabled,
          attributes: {
            clearance: [formData.clearance],
            countryOfAffiliation: [formData.countryOfAffiliation],
            uniqueID: [`${formData.username}-${Date.now()}`],
          },
          realmRoles: formData.roles,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        adminToast.user.created(formData.username);
        auditActions.userCreated(data.data?.id || 'new', formData.username);
        setShowCreateModal(false);
        resetForm();
        fetchUsers();
      } else {
        const data = await response.json();
        adminToast.error('Failed to create user', data.error);
      }
    } catch (err) {
      adminToast.error('Failed to create user', err);
    } finally {
      setFormLoading(false);
    }
  };

  const updateUser = async () => {
    if (!selectedUser) return;

    setFormLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          enabled: formData.enabled,
          attributes: {
            clearance: [formData.clearance],
            countryOfAffiliation: [formData.countryOfAffiliation],
          },
          realmRoles: formData.roles,
        }),
      });

      if (response.ok) {
        adminToast.user.updated(selectedUser.username);
        setShowEditModal(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        const data = await response.json();
        adminToast.error('Failed to update user', data.error);
      }
    } catch (err) {
      adminToast.error('Failed to update user', err);
    } finally {
      setFormLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!selectedUser || !newPassword) return;

    setFormLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword, temporary: false }),
      });

      if (response.ok) {
        adminToast.user.passwordReset(selectedUser.username);
        auditActions.userPasswordReset(selectedUser.id, selectedUser.username);
        setShowPasswordModal(false);
        setSelectedUser(null);
        setNewPassword('');
      } else {
        const data = await response.json();
        adminToast.error('Failed to reset password', data.error);
      }
    } catch (err) {
      adminToast.error('Failed to reset password', err);
    } finally {
      setFormLoading(false);
    }
  };

  const deleteUser = async () => {
    if (!selectedUser) return;

    setFormLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        adminToast.user.deleted(selectedUser.username);
        auditActions.userDeleted(selectedUser.id, selectedUser.username);
        setShowDeleteConfirm(false);
        setSelectedUser(null);
        setUsers(users.filter(u => u.id !== selectedUser.id));
      } else {
        const data = await response.json();
        adminToast.error('Failed to delete user', data.error);
      }
    } catch (err) {
      adminToast.error('Failed to delete user', err);
    } finally {
      setFormLoading(false);
    }
  };

  // ============================================
  // Helpers
  // ============================================

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      firstName: '',
      lastName: '',
      password: '',
      confirmPassword: '',
      enabled: true,
      clearance: 'UNCLASSIFIED',
      countryOfAffiliation: 'USA',
      roles: ['dive-user'],
    });
  };

  const openEditModal = (user: IAdminUser) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      email: user.email || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      password: '',
      confirmPassword: '',
      enabled: user.enabled,
      clearance: user.clearance || 'UNCLASSIFIED',
      countryOfAffiliation: user.countryOfAffiliation || 'USA',
      roles: user.realmRoles || ['dive-user'],
    });
    setShowEditModal(true);
  };

  const getClearanceBadgeColor = (clearance: string) => {
    switch (clearance) {
      case 'TOP_SECRET': return 'bg-red-100 text-red-800 border-red-200';
      case 'SECRET': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'CONFIDENTIAL': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  // ============================================
  // Effects
  // ============================================

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchUsers]);

  // ============================================
  // Render
  // ============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative w-full sm:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search users by name or email..."
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => fetchUsers()}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              exportUsers(users);
              adminToast.success('Users exported to CSV');
            }}
            disabled={users.length === 0}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Export to CSV"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
          <div className="text-2xl font-bold text-blue-700">{users.length}</div>
          <div className="text-sm text-blue-600">Total Users</div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
          <div className="text-2xl font-bold text-green-700">{users.filter(u => u.enabled).length}</div>
          <div className="text-sm text-green-600">Active</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-100">
          <div className="text-2xl font-bold text-orange-700">
            {users.filter(u => u.clearance === 'SECRET' || u.clearance === 'TOP_SECRET').length}
          </div>
          <div className="text-sm text-orange-600">Cleared (S/TS)</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-xl p-4 border border-purple-100">
          <div className="text-2xl font-bold text-purple-700">
            {users.filter(u => u.realmRoles?.includes('dive-admin') || u.realmRoles?.includes('super_admin')).length}
          </div>
          <div className="text-sm text-purple-600">Admins</div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-gray-50 to-slate-50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  User
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Clearance
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Country
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Roles
                </th>
                <th scope="col" className="relative px-6 py-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                    </div>
                    <p className="mt-3 text-sm text-gray-500">Loading users...</p>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <UserIcon className="mx-auto h-12 w-12 text-gray-300" />
                    <p className="mt-2 text-gray-500">No users found</p>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                          {user.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.firstName} {user.lastName}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email || 'No email'}
                          </div>
                          <div className="text-xs text-gray-400">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${getClearanceBadgeColor(user.clearance || 'UNCLASSIFIED')}`}>
                        <Shield className="h-3 w-3 mr-1" />
                        {user.clearance || 'UNCLASSIFIED'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-sm text-gray-700">
                        <Globe className="h-4 w-4 text-gray-400" />
                        {user.countryOfAffiliation || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.enabled ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                        {user.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {(user.realmRoles || []).slice(0, 2).map(role => (
                          <span key={role} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                            {role}
                          </span>
                        ))}
                        {(user.realmRoles?.length || 0) > 2 && (
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs">
                            +{(user.realmRoles?.length || 0) - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit User"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setSelectedUser(user); setShowPasswordModal(true); }}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Reset Password"
                        >
                          <Key className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setSelectedUser(user); setShowDeleteConfirm(true); }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete User"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit User Modal */}
      <AnimatePresence>
        {(showCreateModal || showEditModal) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => { setShowCreateModal(false); setShowEditModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">
                    {showCreateModal ? 'Create New User' : 'Edit User'}
                  </h2>
                  <button
                    onClick={() => { setShowCreateModal(false); setShowEditModal(false); }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {showCreateModal && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={e => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="john.doe"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="john.doe@example.com"
                  />
                </div>

                {showCreateModal && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
                      <input
                        type="password"
                        value={formData.confirmPassword}
                        onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Clearance Level</label>
                    <select
                      value={formData.clearance}
                      onChange={e => setFormData({ ...formData, clearance: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {CLEARANCE_LEVELS.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                    <select
                      value={formData.countryOfAffiliation}
                      onChange={e => setFormData({ ...formData, countryOfAffiliation: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {COUNTRIES.map(country => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Roles</label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_ROLES.map(role => (
                      <label key={role} className="inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.roles.includes(role)}
                          onChange={e => {
                            if (e.target.checked) {
                              setFormData({ ...formData, roles: [...formData.roles, role] });
                            } else {
                              setFormData({ ...formData, roles: formData.roles.filter(r => r !== role) });
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">{role}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">User Enabled</span>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => { setShowCreateModal(false); setShowEditModal(false); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={showCreateModal ? createUser : updateUser}
                  disabled={formLoading}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {formLoading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {showCreateModal ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Password Modal */}
      <AnimatePresence>
        {showPasswordModal && selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPasswordModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Key className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Reset Password</h2>
                    <p className="text-sm text-gray-500">Set new password for {selectedUser.username}</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter new password"
                />
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={resetPassword}
                  disabled={formLoading || !newPassword}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {formLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Key className="h-4 w-4 mr-2" />}
                  Reset Password
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Delete User</h2>
                    <p className="text-sm text-gray-500">This action cannot be undone</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <p className="text-gray-700">
                  Are you sure you want to delete user <strong>{selectedUser.username}</strong>?
                  All associated data will be permanently removed.
                </p>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteUser}
                  disabled={formLoading}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {formLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Delete User
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Mock Data Generator
// ============================================

function generateMockUsers(): IAdminUser[] {
  const clearances = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
  const countries = ['USA', 'GBR', 'FRA', 'CAN', 'DEU'];
  const roles = [['dive-user'], ['dive-user', 'dive-admin'], ['dive-user', 'dive-admin', 'super_admin']];

  return [
    { id: '1', username: 'testuser-usa-1', firstName: 'Test', lastName: 'User 1', email: 'testuser1@usa.mil', enabled: true, emailVerified: true, createdAt: new Date(Date.now() - 86400000 * 30).toISOString(), clearance: 'UNCLASSIFIED', countryOfAffiliation: 'USA', uniqueID: 'testuser-usa-1-001', realmRoles: ['dive-user'] },
    { id: '2', username: 'testuser-usa-2', firstName: 'Test', lastName: 'User 2', email: 'testuser2@usa.mil', enabled: true, emailVerified: true, createdAt: new Date(Date.now() - 86400000 * 25).toISOString(), clearance: 'CONFIDENTIAL', countryOfAffiliation: 'USA', uniqueID: 'testuser-usa-2-001', realmRoles: ['dive-user'] },
    { id: '3', username: 'testuser-usa-3', firstName: 'Test', lastName: 'User 3', email: 'testuser3@usa.mil', enabled: true, emailVerified: true, createdAt: new Date(Date.now() - 86400000 * 20).toISOString(), clearance: 'SECRET', countryOfAffiliation: 'USA', uniqueID: 'testuser-usa-3-001', realmRoles: ['dive-user'] },
    { id: '4', username: 'testuser-usa-4', firstName: 'Test', lastName: 'User 4', email: 'testuser4@usa.mil', enabled: true, emailVerified: true, createdAt: new Date(Date.now() - 86400000 * 15).toISOString(), clearance: 'TOP_SECRET', countryOfAffiliation: 'USA', uniqueID: 'testuser-usa-4-001', realmRoles: ['dive-user'] },
    { id: '5', username: 'admin-usa', firstName: 'Admin', lastName: 'USA', email: 'admin@usa.mil', enabled: true, emailVerified: true, createdAt: new Date(Date.now() - 86400000 * 60).toISOString(), clearance: 'TOP_SECRET', countryOfAffiliation: 'USA', uniqueID: 'admin-usa-001', realmRoles: ['dive-user', 'dive-admin', 'super_admin'] },
    { id: '6', username: 'testuser-gbr-1', firstName: 'British', lastName: 'User', email: 'user@mod.uk', enabled: true, emailVerified: false, createdAt: new Date(Date.now() - 86400000 * 10).toISOString(), clearance: 'SECRET', countryOfAffiliation: 'GBR', uniqueID: 'testuser-gbr-1-001', realmRoles: ['dive-user'] },
    { id: '7', username: 'testuser-fra-1', firstName: 'French', lastName: 'User', email: 'user@defense.gouv.fr', enabled: false, emailVerified: true, createdAt: new Date(Date.now() - 86400000 * 5).toISOString(), clearance: 'CONFIDENTIAL', countryOfAffiliation: 'FRA', uniqueID: 'testuser-fra-1-001', realmRoles: ['dive-user'] },
  ];
}
