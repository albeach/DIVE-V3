/**
 * DIVE V3 - Spoke Registry Table
 * 
 * Displays all registered spokes with status, health, and actions.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Shield,
  Server,
  Key,
  Eye,
  RotateCcw,
  Ban,
  Trash2,
  ExternalLink,
  Activity,
  Globe2,
} from 'lucide-react';
import { ISpoke, SpokeStatus, TrustLevel } from '@/types/federation.types';

interface SpokeRegistryTableProps {
  spokes: ISpoke[];
  loading?: boolean;
  onApprove?: (spoke: ISpoke) => void;
  onSuspend?: (spoke: ISpoke) => void;
  onRevoke?: (spoke: ISpoke) => void;
  onViewDetails?: (spoke: ISpoke) => void;
  onRotateToken?: (spoke: ISpoke) => void;
}

// Country flags mapping
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

export function SpokeRegistryTable({
  spokes,
  loading = false,
  onApprove,
  onSuspend,
  onRevoke,
  onViewDetails,
  onRotateToken,
}: SpokeRegistryTableProps) {
  
  const getStatusConfig = (status: SpokeStatus) => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          color: 'text-amber-600 bg-amber-50 border-amber-200',
          label: 'Pending Approval',
          pulse: true,
        };
      case 'active':
        return {
          icon: CheckCircle2,
          color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
          label: 'Active',
          pulse: false,
        };
      case 'suspended':
        return {
          icon: AlertTriangle,
          color: 'text-orange-600 bg-orange-50 border-orange-200',
          label: 'Suspended',
          pulse: false,
        };
      case 'revoked':
        return {
          icon: XCircle,
          color: 'text-red-600 bg-red-50 border-red-200',
          label: 'Revoked',
          pulse: false,
        };
      default:
        return {
          icon: AlertTriangle,
          color: 'text-gray-600 bg-gray-50 border-gray-200',
          label: 'Unknown',
          pulse: false,
        };
    }
  };

  const getTrustLevelConfig = (level: TrustLevel) => {
    switch (level) {
      case 'national':
        return { color: 'text-purple-700 bg-purple-100', label: 'National' };
      case 'bilateral':
        return { color: 'text-blue-700 bg-blue-100', label: 'Bilateral' };
      case 'partner':
        return { color: 'text-teal-700 bg-teal-100', label: 'Partner' };
      case 'development':
        return { color: 'text-gray-700 bg-gray-100', label: 'Dev' };
      default:
        return { color: 'text-gray-700 bg-gray-100', label: level };
    }
  };

  const getHealthIndicator = (spoke: ISpoke) => {
    if (!spoke.lastHeartbeat) {
      return { status: 'unknown', color: 'text-gray-400' };
    }
    
    const lastHeartbeat = new Date(spoke.lastHeartbeat);
    const now = new Date();
    const diffMs = now.getTime() - lastHeartbeat.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    
    if (diffMinutes < 2) {
      return { status: 'healthy', color: 'text-emerald-500' };
    } else if (diffMinutes < 10) {
      return { status: 'degraded', color: 'text-amber-500' };
    } else {
      return { status: 'unhealthy', color: 'text-red-500' };
    }
  };

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSeconds < 60) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-8 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"
          />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading spokes...</p>
        </div>
      </div>
    );
  }

  if (spokes.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-12 text-center">
          <Globe2 className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            No Spokes Registered
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Federation spokes will appear here once they register with this hub.
            Use <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">./dive spoke register</code> from a spoke instance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Spoke
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Trust Level
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Health
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Policy Sync
              </th>
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {spokes.map((spoke, index) => {
              const statusConfig = getStatusConfig(spoke.status);
              const trustConfig = getTrustLevelConfig(spoke.trustLevel);
              const healthIndicator = getHealthIndicator(spoke);
              const StatusIcon = statusConfig.icon;

              return (
                <motion.tr
                  key={spoke.spokeId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  {/* Spoke Info */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">
                        {COUNTRY_FLAGS[spoke.instanceCode] || '🌐'}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 dark:text-white text-lg">
                            {spoke.instanceCode}
                          </span>
                          <a
                            href={spoke.baseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-600"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {spoke.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          ID: {spoke.spokeId.slice(0, 16)}...
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${statusConfig.color}`}>
                      <StatusIcon className={`w-4 h-4 ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
                      <span className="text-sm font-medium">{statusConfig.label}</span>
                    </div>
                    {spoke.approvedAt && (
                      <div className="text-xs text-gray-500 mt-1">
                        Approved {formatRelativeTime(spoke.approvedAt)}
                      </div>
                    )}
                  </td>

                  {/* Trust Level */}
                  <td className="px-6 py-4">
                    {spoke.status === 'pending' ? (
                      <span className="text-gray-400 italic">—</span>
                    ) : (
                      <div className="space-y-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-medium ${trustConfig.color}`}>
                          <Shield className="w-3.5 h-3.5" />
                          {trustConfig.label}
                        </span>
                        <div className="text-xs text-gray-500">
                          Max: {spoke.maxClassificationAllowed}
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Health */}
                  <td className="px-6 py-4">
                    {spoke.status === 'pending' ? (
                      <span className="text-gray-400 italic">—</span>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Activity className={`w-4 h-4 ${healthIndicator.color}`} />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {formatRelativeTime(spoke.lastHeartbeat)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className={`flex items-center gap-1 ${spoke.opaHealthy ? 'text-emerald-600' : 'text-red-500'}`}>
                            <Server className="w-3 h-3" />
                            OPA
                          </span>
                          <span className={`flex items-center gap-1 ${spoke.opalClientConnected ? 'text-emerald-600' : 'text-red-500'}`}>
                            <Key className="w-3 h-3" />
                            OPAL
                          </span>
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Policy Sync */}
                  <td className="px-6 py-4">
                    {spoke.status === 'pending' ? (
                      <span className="text-gray-400 italic">—</span>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-sm font-mono text-gray-700 dark:text-gray-300">
                          {spoke.currentPolicyVersion?.slice(0, 12) || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500">
                          Synced {formatRelativeTime(spoke.lastPolicySync)}
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      {spoke.status === 'pending' && onApprove && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onApprove(spoke)}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all"
                        >
                          Approve
                        </motion.button>
                      )}

                      {spoke.status === 'active' && (
                        <>
                          <button
                            onClick={() => onViewDetails?.(spoke)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => onRotateToken?.(spoke)}
                            className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Rotate Token"
                          >
                            <RotateCcw className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => onSuspend?.(spoke)}
                            className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Suspend"
                          >
                            <Ban className="w-5 h-5" />
                          </button>
                        </>
                      )}

                      {spoke.status === 'suspended' && (
                        <>
                          <button
                            onClick={() => onViewDetails?.(spoke)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onApprove?.(spoke)}
                            className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-lg hover:bg-emerald-200 transition-colors"
                          >
                            Reactivate
                          </motion.button>
                          <button
                            onClick={() => onRevoke?.(spoke)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Revoke"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}

                      {spoke.status === 'revoked' && (
                        <span className="text-sm text-gray-400 italic">No actions</span>
                      )}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SpokeRegistryTable;
