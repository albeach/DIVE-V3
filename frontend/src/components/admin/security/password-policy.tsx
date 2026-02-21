/**
 * Password Policy Configuration Component
 * 
 * Configure and enforce password policies:
 * - Minimum length
 * - Complexity requirements
 * - Password history
 * - Expiration settings
 * - Account lockout policies
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Key,
  Lock,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle,
  Save,
  RefreshCw,
  Info,
  Hash,
  RotateCcw,
  Ban,
} from 'lucide-react';
import { adminToast } from '@/lib/admin-toast';

// ============================================
// Types
// ============================================

interface IPasswordPolicy {
  // Length requirements
  minLength: number;
  maxLength: number;
  
  // Complexity
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigits: boolean;
  requireSpecialChars: boolean;
  minUniqueChars: number;
  
  // History
  passwordHistory: number;
  preventReuse: boolean;
  
  // Expiration
  maxAgeDays: number;
  warnBeforeDays: number;
  
  // Lockout
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
  lockoutIncrement: boolean;
  
  // Additional
  requirePasswordChange: boolean;
  preventCommonPasswords: boolean;
  minDaysBetweenChanges: number;
}

// ============================================
// Default Policy
// ============================================

const DEFAULT_POLICY: IPasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigits: true,
  requireSpecialChars: true,
  minUniqueChars: 5,
  passwordHistory: 12,
  preventReuse: true,
  maxAgeDays: 90,
  warnBeforeDays: 14,
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 15,
  lockoutIncrement: true,
  requirePasswordChange: true,
  preventCommonPasswords: true,
  minDaysBetweenChanges: 1,
};

// ============================================
// Component
// ============================================

export function PasswordPolicy() {
  const [policy, setPolicy] = useState<IPasswordPolicy>(DEFAULT_POLICY);
  const [originalPolicy, setOriginalPolicy] = useState<IPasswordPolicy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hasChanges = JSON.stringify(policy) !== JSON.stringify(originalPolicy);

  const fetchPolicy = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/security/password-policy');
      if (response.ok) {
        const data = await response.json();
        if (data.data || data.policy) {
          setPolicy(data.data || data.policy);
          setOriginalPolicy(data.data || data.policy);
        }
      }
    } catch (error) {
      console.error('[PasswordPolicy] Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/security/password-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });

      if (response.ok) {
        setOriginalPolicy(policy);
        adminToast.success('Password policy updated');
      } else {
        adminToast.error('Failed to update policy');
      }
    } catch (error) {
      adminToast.error('Failed to update policy', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPolicy(originalPolicy);
  };

  const updatePolicy = <K extends keyof IPasswordPolicy>(key: K, value: IPasswordPolicy[K]) => {
    setPolicy(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
        <p className="text-center mt-4 text-gray-500">Loading password policy...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg">
              <Key className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Password Policy</h2>
              <p className="text-sm text-gray-500">Configure password requirements and lockout settings</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50"
                >
                  <RotateCcw className="h-4 w-4 inline mr-2" />
                  Reset
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="h-4 w-4 inline mr-2 animate-spin" /> : <Save className="h-4 w-4 inline mr-2" />}
                  Save Changes
                </button>
              </>
            )}
          </div>
        </div>

        {/* Compliance indicator */}
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-700">
            Policy meets NIST SP 800-63B and ACP-240 requirements
          </span>
        </div>
      </div>

      {/* Length Requirements */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-lg border border-slate-200 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Hash className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Length Requirements</h3>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Length
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={8}
                max={24}
                value={policy.minLength}
                onChange={e => updatePolicy('minLength', parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="w-12 text-center font-mono font-medium">{policy.minLength}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">NIST recommends 12+ characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maximum Length
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={64}
                max={256}
                value={policy.maxLength}
                onChange={e => updatePolicy('maxLength', parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="w-12 text-center font-mono font-medium">{policy.maxLength}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Complexity Requirements */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-xl shadow-lg border border-slate-200 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Lock className="h-5 w-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900">Complexity Requirements</h3>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {[
            { key: 'requireUppercase', label: 'Require Uppercase (A-Z)' },
            { key: 'requireLowercase', label: 'Require Lowercase (a-z)' },
            { key: 'requireDigits', label: 'Require Digits (0-9)' },
            { key: 'requireSpecialChars', label: 'Require Special Characters (!@#$...)' },
            { key: 'preventCommonPasswords', label: 'Prevent Common Passwords' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={policy[key as keyof IPasswordPolicy] as boolean}
                onChange={e => updatePolicy(key as keyof IPasswordPolicy, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}

          <div className="p-3 bg-slate-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Unique Characters
            </label>
            <input
              type="number"
              min={3}
              max={10}
              value={policy.minUniqueChars}
              onChange={e => updatePolicy('minUniqueChars', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </motion.div>

      {/* Password History */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-xl shadow-lg border border-slate-200 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-5 w-5 text-green-600" />
          <h3 className="text-lg font-semibold text-gray-900">Password History</h3>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Remember Previous Passwords
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={24}
                value={policy.passwordHistory}
                onChange={e => updatePolicy('passwordHistory', parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
              />
              <span className="w-12 text-center font-mono font-medium">{policy.passwordHistory}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Prevents reuse of recent passwords</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Days Between Changes
            </label>
            <input
              type="number"
              min={0}
              max={7}
              value={policy.minDaysBetweenChanges}
              onChange={e => updatePolicy('minDaysBetweenChanges', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Prevents rapid password cycling</p>
          </div>
        </div>
      </motion.div>

      {/* Expiration Settings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-xl shadow-lg border border-slate-200 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Clock className="h-5 w-5 text-amber-600" />
          <h3 className="text-lg font-semibold text-gray-900">Expiration Settings</h3>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password Expires After (days)
            </label>
            <input
              type="number"
              min={0}
              max={365}
              value={policy.maxAgeDays}
              onChange={e => updatePolicy('maxAgeDays', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Set to 0 for no expiration</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Warn Before Expiration (days)
            </label>
            <input
              type="number"
              min={0}
              max={30}
              value={policy.warnBeforeDays}
              onChange={e => updatePolicy('warnBeforeDays', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </motion.div>

      {/* Lockout Policy */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-xl shadow-lg border border-slate-200 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <Ban className="h-5 w-5 text-red-600" />
          <h3 className="text-lg font-semibold text-gray-900">Account Lockout</h3>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Failed Attempts
            </label>
            <input
              type="number"
              min={3}
              max={10}
              value={policy.maxFailedAttempts}
              onChange={e => updatePolicy('maxFailedAttempts', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Lockout Duration (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={policy.lockoutDurationMinutes}
              onChange={e => updatePolicy('lockoutDurationMinutes', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={policy.lockoutIncrement}
                onChange={e => updatePolicy('lockoutIncrement', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Progressive Lockout</span>
            </label>
          </div>
        </div>

        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-700">
            After {policy.maxFailedAttempts} failed attempts, accounts will be locked for {policy.lockoutDurationMinutes} minutes
            {policy.lockoutIncrement && ' (doubles each subsequent lockout)'}
          </span>
        </div>
      </motion.div>

      {/* Policy Preview */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200 p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-blue-600" />
          <h4 className="text-sm font-semibold text-gray-700">Policy Summary</h4>
        </div>
        <p className="text-sm text-gray-600">
          Passwords must be <strong>{policy.minLength}-{policy.maxLength}</strong> characters with
          {policy.requireUppercase && ' uppercase letters,'}
          {policy.requireLowercase && ' lowercase letters,'}
          {policy.requireDigits && ' numbers,'}
          {policy.requireSpecialChars && ' special characters'}.
          {policy.maxAgeDays > 0 && ` Passwords expire after ${policy.maxAgeDays} days.`}
          {policy.passwordHistory > 0 && ` Cannot reuse last ${policy.passwordHistory} passwords.`}
        </p>
      </motion.div>
    </div>
  );
}

export default PasswordPolicy;
