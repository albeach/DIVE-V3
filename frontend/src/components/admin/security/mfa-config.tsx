/**
 * MFA Configuration Component
 * 
 * Configure multi-factor authentication settings:
 * - TOTP (Authenticator apps)
 * - WebAuthn/FIDO2 (Security keys)
 * - SMS (backup)
 * - Recovery codes
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Smartphone,
  Key,
  MessageSquare,
  Shield,
  ShieldCheck,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  RotateCcw,
  Lock,
  Fingerprint,
  QrCode,
  Settings,
} from 'lucide-react';
import { adminToast } from '@/lib/admin-toast';

// ============================================
// Types
// ============================================

interface IMFAConfig {
  // Global settings
  mfaRequired: boolean;
  mfaRequiredForAdmins: boolean;
  mfaGracePeriodDays: number;
  
  // TOTP
  totpEnabled: boolean;
  totpAlgorithm: 'SHA1' | 'SHA256' | 'SHA512';
  totpDigits: 6 | 8;
  totpPeriod: 30 | 60;
  totpInitialCounter: number;
  
  // WebAuthn
  webauthnEnabled: boolean;
  webauthnRpName: string;
  webauthnRpId: string;
  webauthnAttestationConveyance: 'none' | 'indirect' | 'direct';
  webauthnUserVerification: 'required' | 'preferred' | 'discouraged';
  webauthnTimeout: number;
  
  // SMS (backup)
  smsEnabled: boolean;
  smsCodeLength: 6 | 8;
  smsCodeExpiry: number;
  smsRateLimit: number;
  
  // Recovery codes
  recoveryCodesEnabled: boolean;
  recoveryCodeCount: number;
  recoveryCodeLength: 8 | 12 | 16;
}

// ============================================
// Default Config
// ============================================

const DEFAULT_CONFIG: IMFAConfig = {
  mfaRequired: true,
  mfaRequiredForAdmins: true,
  mfaGracePeriodDays: 7,
  
  totpEnabled: true,
  totpAlgorithm: 'SHA256',
  totpDigits: 6,
  totpPeriod: 30,
  totpInitialCounter: 0,
  
  webauthnEnabled: true,
  webauthnRpName: 'DIVE V3',
  webauthnRpId: 'localhost',
  webauthnAttestationConveyance: 'none',
  webauthnUserVerification: 'preferred',
  webauthnTimeout: 60000,
  
  smsEnabled: false,
  smsCodeLength: 6,
  smsCodeExpiry: 300,
  smsRateLimit: 3,
  
  recoveryCodesEnabled: true,
  recoveryCodeCount: 10,
  recoveryCodeLength: 12,
};

// ============================================
// Component
// ============================================

export function MFAConfig() {
  const [config, setConfig] = useState<IMFAConfig>(DEFAULT_CONFIG);
  const [originalConfig, setOriginalConfig] = useState<IMFAConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'totp' | 'webauthn' | 'sms' | 'recovery'>('general');

  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/security/mfa-config');
      if (response.ok) {
        const data = await response.json();
        if (data.data || data.config) {
          setConfig(data.data || data.config);
          setOriginalConfig(data.data || data.config);
        }
      }
    } catch (error) {
      console.error('[MFAConfig] Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/security/mfa-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        setOriginalConfig(config);
        adminToast.success('MFA configuration updated');
      } else {
        adminToast.error('Failed to update MFA configuration');
      }
    } catch (error) {
      adminToast.error('Failed to update MFA configuration', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(originalConfig);
  };

  const updateConfig = <K extends keyof IMFAConfig>(key: K, value: IMFAConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Settings },
    { id: 'totp' as const, label: 'TOTP', icon: QrCode },
    { id: 'webauthn' as const, label: 'WebAuthn', icon: Fingerprint },
    { id: 'sms' as const, label: 'SMS', icon: MessageSquare },
    { id: 'recovery' as const, label: 'Recovery', icon: Key },
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
        <p className="text-center mt-4 text-gray-500">Loading MFA configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Multi-Factor Authentication</h2>
              <p className="text-sm text-gray-500">Configure MFA methods and requirements</p>
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

        {/* Status indicators */}
        <div className="mt-4 flex flex-wrap gap-2">
          {config.totpEnabled && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
              <QrCode className="h-3.5 w-3.5" />
              TOTP Active
            </span>
          )}
          {config.webauthnEnabled && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
              <Fingerprint className="h-3.5 w-3.5" />
              WebAuthn Active
            </span>
          )}
          {config.smsEnabled && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
              <MessageSquare className="h-3.5 w-3.5" />
              SMS Active
            </span>
          )}
          {config.recoveryCodesEnabled && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
              <Key className="h-3.5 w-3.5" />
              Recovery Codes
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 px-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {/* General Tab */}
          {activeTab === 'general' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="grid md:grid-cols-2 gap-6">
                <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={config.mfaRequired}
                    onChange={e => updateConfig('mfaRequired', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">Require MFA for All Users</span>
                    <p className="text-xs text-gray-500">All users must set up MFA</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={config.mfaRequiredForAdmins}
                    onChange={e => updateConfig('mfaRequiredForAdmins', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">Require MFA for Admins</span>
                    <p className="text-xs text-gray-500">Administrators must use MFA</p>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grace Period (days)
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={config.mfaGracePeriodDays}
                  onChange={e => updateConfig('mfaGracePeriodDays', parseInt(e.target.value))}
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Days new users have to set up MFA</p>
              </div>
            </motion.div>
          )}

          {/* TOTP Tab */}
          {activeTab === 'totp' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.totpEnabled}
                  onChange={e => updateConfig('totpEnabled', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Enable TOTP</span>
                  <p className="text-xs text-gray-500">Authenticator apps (Google, Microsoft, etc.)</p>
                </div>
              </label>

              {config.totpEnabled && (
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Algorithm</label>
                    <select
                      value={config.totpAlgorithm}
                      onChange={e => updateConfig('totpAlgorithm', e.target.value as IMFAConfig['totpAlgorithm'])}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="SHA1">SHA1</option>
                      <option value="SHA256">SHA256</option>
                      <option value="SHA512">SHA512</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Code Length</label>
                    <select
                      value={config.totpDigits}
                      onChange={e => updateConfig('totpDigits', parseInt(e.target.value) as 6 | 8)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={6}>6 digits</option>
                      <option value={8}>8 digits</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Period (seconds)</label>
                    <select
                      value={config.totpPeriod}
                      onChange={e => updateConfig('totpPeriod', parseInt(e.target.value) as 30 | 60)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={30}>30 seconds</option>
                      <option value={60}>60 seconds</option>
                    </select>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* WebAuthn Tab */}
          {activeTab === 'webauthn' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.webauthnEnabled}
                  onChange={e => updateConfig('webauthnEnabled', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Enable WebAuthn/FIDO2</span>
                  <p className="text-xs text-gray-500">Security keys and platform authenticators</p>
                </div>
              </label>

              {config.webauthnEnabled && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Relying Party Name</label>
                    <input
                      type="text"
                      value={config.webauthnRpName}
                      onChange={e => updateConfig('webauthnRpName', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Relying Party ID</label>
                    <input
                      type="text"
                      value={config.webauthnRpId}
                      onChange={e => updateConfig('webauthnRpId', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">User Verification</label>
                    <select
                      value={config.webauthnUserVerification}
                      onChange={e => updateConfig('webauthnUserVerification', e.target.value as IMFAConfig['webauthnUserVerification'])}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="required">Required</option>
                      <option value="preferred">Preferred</option>
                      <option value="discouraged">Discouraged</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Timeout (ms)</label>
                    <input
                      type="number"
                      min={10000}
                      max={120000}
                      step={1000}
                      value={config.webauthnTimeout}
                      onChange={e => updateConfig('webauthnTimeout', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* SMS Tab */}
          {activeTab === 'sms' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">SMS is not recommended</p>
                  <p className="text-xs text-amber-700 mt-1">
                    SMS-based MFA is vulnerable to SIM swapping attacks. Use only as a backup method.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.smsEnabled}
                  onChange={e => updateConfig('smsEnabled', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Enable SMS (Backup)</span>
                  <p className="text-xs text-gray-500">Send codes via text message</p>
                </div>
              </label>

              {config.smsEnabled && (
                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Code Length</label>
                    <select
                      value={config.smsCodeLength}
                      onChange={e => updateConfig('smsCodeLength', parseInt(e.target.value) as 6 | 8)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={6}>6 digits</option>
                      <option value={8}>8 digits</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Code Expiry (seconds)</label>
                    <input
                      type="number"
                      min={60}
                      max={600}
                      value={config.smsCodeExpiry}
                      onChange={e => updateConfig('smsCodeExpiry', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Rate Limit (per hour)</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={config.smsRateLimit}
                      onChange={e => updateConfig('smsRateLimit', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Recovery Tab */}
          {activeTab === 'recovery' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.recoveryCodesEnabled}
                  onChange={e => updateConfig('recoveryCodesEnabled', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Enable Recovery Codes</span>
                  <p className="text-xs text-gray-500">One-time codes for account recovery</p>
                </div>
              </label>

              {config.recoveryCodesEnabled && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Codes</label>
                    <input
                      type="number"
                      min={5}
                      max={20}
                      value={config.recoveryCodeCount}
                      onChange={e => updateConfig('recoveryCodeCount', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Code Length</label>
                    <select
                      value={config.recoveryCodeLength}
                      onChange={e => updateConfig('recoveryCodeLength', parseInt(e.target.value) as 8 | 12 | 16)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={8}>8 characters</option>
                      <option value={12}>12 characters</option>
                      <option value={16}>16 characters</option>
                    </select>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MFAConfig;

