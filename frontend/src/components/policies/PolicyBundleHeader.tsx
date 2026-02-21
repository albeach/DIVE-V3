'use client';

import { motion } from 'framer-motion';
import {
  Package,
  Clock,
  Shield,
  GitCommit,
  FileCode,
  CheckCircle2,
  AlertCircle,
  TrendingUp
} from 'lucide-react';
import type { IPolicyHierarchy, NATOCompliance } from '@/types/policy.types';
import { COMPLIANCE_CONFIGS } from '@/types/policy.types';

interface PolicyBundleHeaderProps {
  hierarchy: IPolicyHierarchy;
  sseStatus?: {
    connected: boolean;
    lastUpdate: Date | null;
    updateCount: number;
    error: string | null;
  };
}

export default function PolicyBundleHeader({ hierarchy, sseStatus }: PolicyBundleHeaderProps) {
  const { version, stats } = hierarchy;
  const lastUpdated = new Date(version.timestamp);
  const isRecent = (Date.now() - lastUpdated.getTime()) < 24 * 60 * 60 * 1000; // Within 24h

  // Format relative time
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700/50"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Glow Effect */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-teal-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl" />

      <div className="relative p-6">
        {/* Top Row: Title and Status */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20">
                <Package className="w-6 h-6 text-teal-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-100">
                  Policy Bundle
                </h1>
                <p className="text-sm text-gray-500 font-mono">
                  {version.bundleId}
                </p>
              </div>
            </div>
          </div>

          {/* Status Badge - Live SSE Connection */}
          <div className={`
            flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors
            ${sseStatus?.connected
              ? 'bg-emerald-500/10 border border-emerald-500/20'
              : sseStatus?.error
              ? 'bg-amber-500/10 border border-amber-500/20'
              : 'bg-slate-500/10 border border-slate-500/20'}
          `}>
            {sseStatus?.connected ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-300">
                  Live
                </span>
                {sseStatus.updateCount > 0 && (
                  <span className="text-xs text-emerald-400/60 ml-1">
                    ({sseStatus.updateCount})
                  </span>
                )}
              </>
            ) : sseStatus?.error ? (
              <>
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-300">
                  Reconnecting...
                </span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-sm font-medium text-slate-400">
                  Connecting...
                </span>
              </>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<FileCode className="w-5 h-5" />}
            label="Policies"
            value={stats.totalPolicies}
            color="text-blue-400"
            bgColor="bg-blue-500/10"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Rules"
            value={stats.totalRules}
            color="text-purple-400"
            bgColor="bg-purple-500/10"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="Tests"
            value={stats.totalTests}
            color="text-emerald-400"
            bgColor="bg-emerald-500/10"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Updated"
            value={formatRelativeTime(lastUpdated)}
            color="text-amber-400"
            bgColor="bg-amber-500/10"
            isText
          />
        </div>

        {/* Bottom Row: Version Info and Compliance */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-700/50">
          {/* Version */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Version</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-700/50 text-sm font-mono text-teal-300">
                v{version.version}
              </span>
            </div>

            {version.gitCommit && (
              <div className="flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-mono text-gray-500">
                  {version.gitCommit.slice(0, 7)}
                </span>
              </div>
            )}

            {/* Real-Time Sync Status */}
            {sseStatus && (
              <div
                className="flex items-center gap-2 px-2 py-1 rounded-md bg-slate-800/50 border border-slate-700/50"
                title={sseStatus.connected
                  ? `Real-time updates active${sseStatus.lastUpdate ? ` • Last sync: ${new Date(sseStatus.lastUpdate).toLocaleTimeString()}` : ''}`
                  : sseStatus.error || 'Connecting to real-time updates...'}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${sseStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-xs text-gray-500">
                  {sseStatus.connected ? 'Real-time' : 'Offline'}
                </span>
              </div>
            )}
          </div>

          {/* Compliance Badges */}
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-gray-500" />
            <div className="flex flex-wrap gap-1.5">
              {version.compliance.map((c) => (
                <ComplianceBadge key={c} compliance={c} />
              ))}
            </div>
          </div>
        </div>

        {/* Feature Flags (if any) */}
        {Object.keys(version.features).length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <div className="flex flex-wrap gap-2">
              {Object.entries(version.features).map(([key, enabled]) => (
                <span
                  key={key}
                  className={`
                    px-2 py-0.5 rounded text-xs font-mono
                    ${enabled
                      ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-500/20'
                      : 'bg-slate-800 text-gray-500 border border-slate-700'
                    }
                  `}
                >
                  {key}: {enabled ? 'on' : 'off'}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  bgColor: string;
  isText?: boolean;
}

function StatCard({ icon, label, value, color, bgColor, isText }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      className={`
        p-4 rounded-xl ${bgColor} border border-white/5
        backdrop-blur-sm
      `}
    >
      <div className={`${color} mb-2`}>
        {icon}
      </div>
      <div className={`text-2xl font-bold ${color}`}>
        {isText ? value : (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </motion.span>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {label}
      </div>
    </motion.div>
  );
}

function ComplianceBadge({ compliance }: { compliance: NATOCompliance }) {
  const config = COMPLIANCE_CONFIGS[compliance];

  return (
    <div
      className={`
        px-2 py-0.5 rounded-md text-xs font-medium
        ${config.bgColor} ${config.color}
        border border-white/10
        cursor-help
      `}
      title={config.fullName}
    >
      {config.shortName}
    </div>
  );
}

