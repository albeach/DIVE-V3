/**
 * DIVE V3 - Spoke Detail Panel
 * 
 * Slide-over panel showing detailed spoke information.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Shield,
  Server,
  Key,
  Activity,
  Clock,
  Globe2,
  Lock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Ban,
  Trash2,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';
import { ISpoke, SpokeStatus, TrustLevel } from '@/types/federation.types';

interface SpokeDetailPanelProps {
  spoke: ISpoke | null;
  isOpen: boolean;
  onClose: () => void;
  onSuspend?: (spoke: ISpoke) => void;
  onRevoke?: (spoke: ISpoke) => void;
  onRotateToken?: (spoke: ISpoke) => void;
  onForceSync?: (spoke: ISpoke) => void;
}

const COUNTRY_FLAGS: Record<string, string> = {
  'USA': '🇺🇸',
  'FRA': '🇫🇷',
  'GBR': '🇬🇧',
  'DEU': '🇩🇪',
  'NZL': '🇳🇿',
  'AUS': '🇦🇺',
  'CAN': '🇨🇦',
  'JPN': '🇯🇵',
};

const STATUS_CONFIGS: Record<SpokeStatus, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
  pending: { color: 'text-amber-600', bg: 'bg-amber-100', icon: Clock },
  active: { color: 'text-emerald-600', bg: 'bg-emerald-100', icon: CheckCircle2 },
  suspended: { color: 'text-orange-600', bg: 'bg-orange-100', icon: AlertTriangle },
  revoked: { color: 'text-red-600', bg: 'bg-red-100', icon: XCircle },
};

const TRUST_COLORS: Record<TrustLevel, string> = {
  national: 'bg-purple-100 text-purple-700',
  bilateral: 'bg-blue-100 text-blue-700',
  partner: 'bg-teal-100 text-teal-700',
  development: 'bg-gray-100 text-gray-700',
};

export function SpokeDetailPanel({
  spoke,
  isOpen,
  onClose,
  onSuspend,
  onRevoke,
  onRotateToken,
  onForceSync,
}: SpokeDetailPanelProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'health' | 'policies' | 'token'>('overview');

  const copyToClipboard = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getTokenStatus = () => {
    if (!spoke?.tokenExpiresAt) return { status: 'none', label: 'No Token', color: 'text-gray-500' };
    
    const expiresAt = new Date(spoke.tokenExpiresAt);
    const now = new Date();
    const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysUntilExpiry < 0) return { status: 'expired', label: 'Expired', color: 'text-red-600' };
    if (daysUntilExpiry < 7) return { status: 'expiring', label: `Expires in ${Math.ceil(daysUntilExpiry)}d`, color: 'text-amber-600' };
    return { status: 'valid', label: `Valid (${Math.floor(daysUntilExpiry)}d)`, color: 'text-emerald-600' };
  };

  if (!spoke) return null;

  const statusConfig = STATUS_CONFIGS[spoke.status];
  const StatusIcon = statusConfig.icon;
  const tokenStatus = getTokenStatus();

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Globe2 },
    { id: 'health', label: 'Health', icon: Activity },
    { id: 'policies', label: 'Policies', icon: Shield },
    { id: 'token', label: 'Token', icon: Key },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full md:w-[500px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{COUNTRY_FLAGS[spoke.instanceCode] || '🌐'}</span>
                  <div>
                    <h2 className="text-xl font-bold text-white">{spoke.instanceCode}</h2>
                    <p className="text-blue-100 text-sm">{spoke.name}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Badge */}
              <div className="mt-4 flex items-center gap-3">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${statusConfig.bg}`}>
                  <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
                  <span className={`text-sm font-medium ${statusConfig.color}`}>
                    {spoke.status.charAt(0).toUpperCase() + spoke.status.slice(1)}
                  </span>
                </div>
                {spoke.trustLevel && (
                  <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full ${TRUST_COLORS[spoke.trustLevel]}`}>
                    <Shield className="w-3.5 h-3.5" />
                    <span className="text-sm font-medium capitalize">{spoke.trustLevel}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-4">
              <nav className="flex gap-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Connection Info */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Connection Info
                    </h3>
                    <div className="space-y-3">
                      {[
                        { label: 'Base URL', value: spoke.baseUrl },
                        { label: 'API URL', value: spoke.apiUrl },
                        { label: 'IdP URL', value: spoke.idpUrl },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div>
                            <div className="text-xs text-gray-500">{item.label}</div>
                            <div className="text-sm font-mono text-gray-900 dark:text-white truncate max-w-[280px]">
                              {item.value}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => copyToClipboard(item.value, item.label)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                            >
                              {copiedField === item.label ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <a
                              href={item.value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Registration Info */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Registration
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="text-xs text-gray-500">Spoke ID</div>
                        <div className="text-sm font-mono text-gray-900 dark:text-white truncate">
                          {spoke.spokeId.slice(0, 20)}...
                        </div>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="text-xs text-gray-500">Contact</div>
                        <div className="text-sm text-gray-900 dark:text-white truncate">
                          {spoke.contactEmail}
                        </div>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="text-xs text-gray-500">Registered</div>
                        <div className="text-sm text-gray-900 dark:text-white">
                          {formatDate(spoke.registeredAt)}
                        </div>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="text-xs text-gray-500">Approved</div>
                        <div className="text-sm text-gray-900 dark:text-white">
                          {spoke.approvedAt ? formatDate(spoke.approvedAt) : 'Pending'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Trust Configuration */}
                  {spoke.status !== 'pending' && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        Trust Configuration
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">Trust Level</span>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${TRUST_COLORS[spoke.trustLevel]}`}>
                            {spoke.trustLevel}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">Max Classification</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {spoke.maxClassificationAllowed}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Globe2 className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">Data Isolation</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                            {spoke.dataIsolationLevel}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'health' && (
                <div className="space-y-6">
                  {/* Health Status */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`p-4 rounded-xl ${spoke.opaHealthy ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Server className={`w-5 h-5 ${spoke.opaHealthy ? 'text-emerald-600' : 'text-red-600'}`} />
                        <span className="font-medium text-gray-900 dark:text-white">OPA</span>
                      </div>
                      <div className={`text-lg font-bold ${spoke.opaHealthy ? 'text-emerald-600' : 'text-red-600'}`}>
                        {spoke.opaHealthy ? 'Healthy' : 'Unhealthy'}
                      </div>
                    </div>
                    <div className={`p-4 rounded-xl ${spoke.opalClientConnected ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Key className={`w-5 h-5 ${spoke.opalClientConnected ? 'text-emerald-600' : 'text-red-600'}`} />
                        <span className="font-medium text-gray-900 dark:text-white">OPAL</span>
                      </div>
                      <div className={`text-lg font-bold ${spoke.opalClientConnected ? 'text-emerald-600' : 'text-red-600'}`}>
                        {spoke.opalClientConnected ? 'Connected' : 'Disconnected'}
                      </div>
                    </div>
                  </div>

                  {/* Heartbeat */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-gray-500" />
                        <span className="font-medium text-gray-900 dark:text-white">Last Heartbeat</span>
                      </div>
                      <span className="text-sm text-gray-500">{formatRelativeTime(spoke.lastHeartbeat)}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {spoke.lastHeartbeat ? formatDate(spoke.lastHeartbeat) : 'No heartbeat received'}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'policies' && (
                <div className="space-y-6">
                  {/* Policy Sync Status */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-gray-900 dark:text-white">Current Version</span>
                      <code className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm">
                        {spoke.currentPolicyVersion?.slice(0, 16) || 'Unknown'}
                      </code>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Last Sync</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {formatRelativeTime(spoke.lastPolicySync)}
                      </span>
                    </div>
                  </div>

                  {/* Allowed Scopes */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                      Allowed Policy Scopes
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {spoke.allowedPolicyScopes?.map((scope) => (
                        <span
                          key={scope}
                          className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm rounded-lg"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Force Sync */}
                  {onForceSync && spoke.status === 'active' && (
                    <button
                      onClick={() => onForceSync(spoke)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Force Policy Sync
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'token' && (
                <div className="space-y-6">
                  {/* Token Status */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">Token Status</span>
                      <span className={`font-medium ${tokenStatus.color}`}>{tokenStatus.label}</span>
                    </div>
                    {spoke.tokenExpiresAt && (
                      <div className="text-xs text-gray-500">
                        Expires: {formatDate(spoke.tokenExpiresAt)}
                      </div>
                    )}
                  </div>

                  {/* Token Scopes */}
                  {spoke.tokenScopes && spoke.tokenScopes.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                        Token Scopes
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {spoke.tokenScopes.map((scope) => (
                          <span
                            key={scope}
                            className="px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm rounded-lg"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rotate Token */}
                  {onRotateToken && spoke.status === 'active' && (
                    <button
                      onClick={() => onRotateToken(spoke)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Rotate Token
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Actions Footer */}
            {spoke.status === 'active' && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => onSuspend?.(spoke)}
                    className="flex items-center gap-2 px-4 py-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg font-medium transition-colors"
                  >
                    <Ban className="w-4 h-4" />
                    Suspend
                  </button>
                  <button
                    onClick={() => onRevoke?.(spoke)}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Revoke
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default SpokeDetailPanel;

