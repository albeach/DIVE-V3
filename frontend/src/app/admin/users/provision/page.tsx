/**
 * User Provisioning Workflow
 *
 * Comprehensive user provisioning with CSV import wizard,
 * field mapping, validation preview, and batch operations.
 *
 * Phase 6.2 - 2026 Design Patterns
 */

'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { useProvisionUsers, useProvisioningHistory } from '@/lib/api/admin-queries';
import {
  Upload,
  Users,
  UserPlus,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Download,
  Trash2,
  Plus,
  History,
  RefreshCw,
  ArrowRight,
  Mail,
  Shield,
  Globe,
  Eye,
} from 'lucide-react';

interface UserToProvision {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  clearance: string;
  country: string;
  valid: boolean;
  errors: string[];
}

const CLEARANCE_LEVELS = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP SECRET'];
const AVAILABLE_ROLES = ['user', 'analyst', 'reviewer', 'admin'];
const COUNTRIES = ['USA', 'GBR', 'DEU', 'FRA', 'CAN', 'AUS', 'NLD', 'BEL', 'POL', 'ITA'];

function validateUser(user: Partial<UserToProvision>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!user.username || user.username.length < 3) {
    errors.push('Username must be at least 3 characters');
  }
  if (!user.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
    errors.push('Invalid email format');
  }
  if (!user.clearance || !CLEARANCE_LEVELS.includes(user.clearance)) {
    errors.push('Invalid clearance level');
  }
  if (!user.country || !COUNTRIES.includes(user.country)) {
    errors.push('Invalid country code');
  }

  return { valid: errors.length === 0, errors };
}

function UserForm({
  user,
  onChange,
  onRemove,
  index,
}: {
  user: UserToProvision;
  onChange: (id: string, field: string, value: string | string[]) => void;
  onRemove: (id: string) => void;
  index: number;
}) {
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl border-2 p-4 transition-all ${
        user.valid
          ? 'border-gray-200 dark:border-gray-700'
          : 'border-red-300 dark:border-red-800'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs flex items-center justify-center font-bold">
            {index + 1}
          </span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {user.username || 'New User'}
          </span>
          {!user.valid && (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          )}
        </div>
        <button
          onClick={() => onRemove(user.id)}
          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Username *
          </label>
          <input
            type="text"
            value={user.username}
            onChange={(e) => onChange(user.id, 'username', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            placeholder="john.doe"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Email *
          </label>
          <input
            type="email"
            value={user.email}
            onChange={(e) => onChange(user.id, 'email', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            placeholder="john.doe@example.com"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            First Name
          </label>
          <input
            type="text"
            value={user.firstName}
            onChange={(e) => onChange(user.id, 'firstName', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            placeholder="John"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Last Name
          </label>
          <input
            type="text"
            value={user.lastName}
            onChange={(e) => onChange(user.id, 'lastName', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            placeholder="Doe"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Clearance *
          </label>
          <select
            value={user.clearance}
            onChange={(e) => onChange(user.id, 'clearance', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            <option value="">Select clearance</option>
            {CLEARANCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Country *
          </label>
          <select
            value={user.country}
            onChange={(e) => onChange(user.id, 'country', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          >
            <option value="">Select country</option>
            {COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Roles */}
      <div className="mt-4">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
          Roles
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => {
                const newRoles = user.roles.includes(role)
                  ? user.roles.filter((r) => r !== role)
                  : [...user.roles, role];
                onChange(user.id, 'roles', newRoles);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                user.roles.includes(role)
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* Validation Errors */}
      {user.errors.length > 0 && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <ul className="text-xs text-red-700 dark:text-red-300 space-y-1">
            {user.errors.map((error, idx) => (
              <li key={idx} className="flex items-center gap-1">
                <XCircle className="w-3 h-3 flex-shrink-0" />
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface HistoryItem {
  id: string;
  timestamp: string;
  initiatedBy: string;
  type: string;
  totalUsers: number;
  successCount: number;
  failedCount: number;
  status: string;
}

function ProvisioningHistoryTable({ history }: { history: HistoryItem[] }) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bulk':
        return <Users className="w-4 h-4" />;
      case 'csv_import':
        return <FileSpreadsheet className="w-4 h-4" />;
      default:
        return <UserPlus className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            Partial
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <History className="w-5 h-5" />
          Provisioning History
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Initiated By
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Results
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {history.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {new Date(item.timestamp).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    {getTypeIcon(item.type)}
                    {item.type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {item.initiatedBy}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-emerald-600 font-medium">{item.successCount} created</span>
                    {item.failedCount > 0 && (
                      <span className="text-red-600 font-medium">{item.failedCount} failed</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(item.status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {history.length === 0 && (
        <div className="px-6 py-12 text-center">
          <History className="w-12 h-12 mx-auto text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">No provisioning history</p>
        </div>
      )}
    </div>
  );
}

export default function UserProvisioningPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'manual' | 'csv' | 'history'>('manual');
  const [users, setUsers] = useState<UserToProvision[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{
    success: boolean;
    summary: { total: number; created: number; failed: number };
  } | null>(null);

  const provisionMutation = useProvisionUsers();
  const { data: historyData, isLoading: isLoadingHistory, refetch: refetchHistory } = useProvisioningHistory();

  const addUser = useCallback(() => {
    const newUser: UserToProvision = {
      id: `user-${Date.now()}`,
      username: '',
      email: '',
      firstName: '',
      lastName: '',
      roles: ['user'],
      clearance: 'UNCLASSIFIED',
      country: 'USA',
      valid: false,
      errors: ['Username must be at least 3 characters', 'Invalid email format'],
    };
    setUsers((prev) => [...prev, newUser]);
  }, []);

  const removeUser = useCallback((id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const updateUser = useCallback((id: string, field: string, value: string | string[]) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u;
        const updated = { ...u, [field]: value };
        const validation = validateUser(updated);
        return { ...updated, valid: validation.valid, errors: validation.errors };
      })
    );
  }, []);

  const handleCSVUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter((line) => line.trim());
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

      const usernameIdx = headers.indexOf('username');
      const emailIdx = headers.indexOf('email');
      const firstNameIdx = headers.indexOf('firstname') !== -1 ? headers.indexOf('firstname') : headers.indexOf('first_name');
      const lastNameIdx = headers.indexOf('lastname') !== -1 ? headers.indexOf('lastname') : headers.indexOf('last_name');
      const clearanceIdx = headers.indexOf('clearance');
      const countryIdx = headers.indexOf('country');

      const parsedUsers: UserToProvision[] = lines.slice(1).map((line, idx) => {
        const values = line.split(',').map((v) => v.trim());
        const user = {
          id: `csv-${Date.now()}-${idx}`,
          username: usernameIdx >= 0 ? values[usernameIdx] : '',
          email: emailIdx >= 0 ? values[emailIdx] : '',
          firstName: firstNameIdx >= 0 ? values[firstNameIdx] : '',
          lastName: lastNameIdx >= 0 ? values[lastNameIdx] : '',
          roles: ['user'],
          clearance: clearanceIdx >= 0 ? values[clearanceIdx] : 'UNCLASSIFIED',
          country: countryIdx >= 0 ? values[countryIdx] : 'USA',
          valid: false,
          errors: [] as string[],
        };
        const validation = validateUser(user);
        return { ...user, valid: validation.valid, errors: validation.errors };
      });

      setUsers(parsedUsers);
      setActiveTab('manual');
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleProvision = useCallback(async () => {
    const validUsers = users.filter((u) => u.valid);
    if (validUsers.length === 0) return;

    try {
      const result = await provisionMutation.mutateAsync({
        users: validUsers.map((u) => ({
          username: u.username,
          email: u.email,
          firstName: u.firstName || undefined,
          lastName: u.lastName || undefined,
          roles: u.roles,
          clearance: u.clearance,
          country: u.country,
        })),
        options: {
          sendWelcomeEmail: true,
          requirePasswordChange: true,
        },
      });

      setProvisionResult({
        success: result.success,
        summary: result.summary,
      });
      setShowPreview(false);
      refetchHistory();
    } catch (err) {
      console.error('Provisioning failed:', err);
    }
  }, [users, provisionMutation, refetchHistory]);

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    router.push('/');
    return null;
  }

  const validUsers = users.filter((u) => u.valid);
  const invalidUsers = users.filter((u) => !u.valid);

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Admin', href: '/admin/dashboard' },
        { label: 'Users', href: '/admin/users' },
        { label: 'Provision', href: null },
      ]}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        {/* Header */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-[1600px] mx-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  User Provisioning
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Create users individually or import in bulk via CSV
                </p>
              </div>

              {users.length > 0 && (
                <button
                  onClick={() => setShowPreview(true)}
                  disabled={validUsers.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg shadow-blue-600/25 disabled:opacity-50 flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Preview & Provision ({validUsers.length})
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setActiveTab('manual')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'manual'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Manual Entry
                  {users.length > 0 && (
                    <span className="px-2 py-0.5 text-xs bg-white/20 rounded-full">
                      {users.length}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('csv')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'csv'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  CSV Import
                </div>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'history'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4" />
                  History
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1600px] mx-auto px-8 py-8">
          {/* Success Result */}
          {provisionResult && (
            <div className="mb-6 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-emerald-900 dark:text-emerald-100">
                    Provisioning Complete
                  </h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                    {provisionResult.summary.created} of {provisionResult.summary.total} users created successfully.
                    {provisionResult.summary.failed > 0 && ` ${provisionResult.summary.failed} failed.`}
                  </p>
                  <button
                    onClick={() => {
                      setProvisionResult(null);
                      setUsers([]);
                    }}
                    className="mt-3 text-sm text-emerald-700 dark:text-emerald-300 hover:underline"
                  >
                    Start new provisioning
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-6">
              {/* Add User Button */}
              <button
                onClick={addUser}
                className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add User
              </button>

              {/* User Forms */}
              {users.length > 0 && (
                <div className="space-y-4">
                  {users.map((user, idx) => (
                    <UserForm
                      key={user.id}
                      user={user}
                      onChange={updateUser}
                      onRemove={removeUser}
                      index={idx}
                    />
                  ))}
                </div>
              )}

              {/* Validation Summary */}
              {users.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {validUsers.length} valid
                        </span>
                      </div>
                      {invalidUsers.length > 0 && (
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {invalidUsers.length} with errors
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setUsers([])}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'csv' && (
            <div className="space-y-6">
              {/* CSV Upload */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8">
                <div className="text-center">
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Upload CSV File
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Upload a CSV file with user data. Required columns: username, email
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg"
                  >
                    Select CSV File
                  </button>
                </div>

                {/* CSV Format Help */}
                <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Expected CSV Format:
                  </h4>
                  <code className="text-xs text-gray-600 dark:text-gray-400 block">
                    username,email,firstname,lastname,clearance,country<br />
                    john.doe,john@example.com,John,Doe,SECRET,USA<br />
                    jane.smith,jane@example.com,Jane,Smith,CONFIDENTIAL,GBR
                  </code>
                  <button className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                    <Download className="w-4 h-4" />
                    Download template CSV
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="flex items-center justify-end">
                <button
                  onClick={() => refetchHistory()}
                  disabled={isLoadingHistory}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : (
                <ProvisioningHistoryTable history={historyData?.history || []} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Confirm Provisioning
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Review users before provisioning
              </p>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-3">
                {validUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {user.username}
                      </p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-gray-500">
                        <Shield className="w-3 h-3" />
                        {user.clearance}
                      </span>
                      <span className="flex items-center gap-1 text-gray-500">
                        <Globe className="w-3 h-3" />
                        {user.country}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      Welcome emails will be sent
                    </p>
                    <p className="text-blue-700 dark:text-blue-300 text-xs mt-0.5">
                      Users will receive an email with instructions to set their password
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {validUsers.length} users will be created
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowPreview(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProvision}
                  disabled={provisionMutation.isPending}
                  className="px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {provisionMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  Provision Users
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
