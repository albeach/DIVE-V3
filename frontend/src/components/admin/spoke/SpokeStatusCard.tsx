/**
 * DIVE V3 - Spoke Status Card
 * 
 * Displays spoke registration status, connectivity info, and timestamps.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Shield,
  Server,
  Activity,
  Zap,
} from 'lucide-react';
import { SpokeStatus, TrustLevel } from '@/types/federation.types';

export interface ISpokeRuntimeInfo {
  spokeId: string;
  instanceCode: string;
  name: string;
  status: SpokeStatus;
  trustLevel: TrustLevel;
  registeredAt?: string;
  approvedAt?: string;
  hubUrl?: string;
  startedAt?: string;
}

interface SpokeStatusCardProps {
  runtime: ISpokeRuntimeInfo | null;
  loading?: boolean;
}

const STATUS_CONFIGS: Record<SpokeStatus, { 
  label: string; 
  color: string; 
  bg: string;
  icon: typeof CheckCircle2;
  glow: string;
}> = {
  pending: { 
    label: 'Pending Approval', 
    color: 'text-amber-600', 
    bg: 'bg-amber-50 border-amber-200',
    icon: Clock,
    glow: 'shadow-amber-200/50',
  },
  active: { 
    label: 'Active', 
    color: 'text-emerald-600', 
    bg: 'bg-emerald-50 border-emerald-200',
    icon: CheckCircle2,
    glow: 'shadow-emerald-200/50',
  },
  suspended: { 
    label: 'Suspended', 
    color: 'text-orange-600', 
    bg: 'bg-orange-50 border-orange-200',
    icon: AlertTriangle,
    glow: 'shadow-orange-200/50',
  },
  revoked: { 
    label: 'Revoked', 
    color: 'text-red-600', 
    bg: 'bg-red-50 border-red-200',
    icon: XCircle,
    glow: 'shadow-red-200/50',
  },
};

const TRUST_LEVEL_COLORS: Record<TrustLevel, string> = {
  national: 'bg-purple-100 text-purple-700 border-purple-300',
  bilateral: 'bg-blue-100 text-blue-700 border-blue-300',
  partner: 'bg-teal-100 text-teal-700 border-teal-300',
  development: 'bg-gray-100 text-gray-700 border-gray-300',
};

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

function formatRelativeTime(dateStr?: string): string {
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
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString();
}

export function SpokeStatusCard({ runtime, loading }: SpokeStatusCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 animate-pulse">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-slate-200 rounded-xl" />
          <div className="flex-1">
            <div className="h-6 bg-slate-200 rounded w-32 mb-2" />
            <div className="h-4 bg-slate-200 rounded w-48" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!runtime) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6">
        <div className="text-center py-8">
          <Server className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No spoke status available</p>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIGS[runtime.status] || STATUS_CONFIGS.pending;
  const StatusIcon = statusConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl border shadow-lg ${statusConfig.glow} p-6`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="text-5xl">
            {COUNTRY_FLAGS[runtime.instanceCode] || '🌐'}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {runtime.instanceCode}
            </h2>
            <p className="text-slate-600">{runtime.name}</p>
          </div>
        </div>
        
        {/* Status Badge */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${statusConfig.bg}`}>
          <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
          <span className={`font-semibold ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Trust Level */}
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase">Trust Level</span>
          </div>
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${TRUST_LEVEL_COLORS[runtime.trustLevel] || TRUST_LEVEL_COLORS.development}`}>
            {runtime.trustLevel?.charAt(0).toUpperCase() + runtime.trustLevel?.slice(1) || 'Unknown'}
          </div>
        </div>

        {/* Spoke ID */}
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase">Spoke ID</span>
          </div>
          <code className="text-sm font-mono text-slate-700 break-all">
            {runtime.spokeId?.slice(0, 12) || 'N/A'}...
          </code>
        </div>

        {/* Registered */}
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase">Registered</span>
          </div>
          <p className="text-sm font-medium text-slate-700">
            {formatRelativeTime(runtime.registeredAt)}
          </p>
          <p className="text-xs text-slate-500">
            {formatDate(runtime.registeredAt)}
          </p>
        </div>

        {/* Uptime */}
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase">Uptime</span>
          </div>
          <p className="text-sm font-medium text-slate-700">
            {runtime.startedAt ? formatRelativeTime(runtime.startedAt) : 'Just started'}
          </p>
          <p className="text-xs text-slate-500">
            {runtime.startedAt ? `Since ${new Date(runtime.startedAt).toLocaleDateString()}` : 'Current session'}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export default SpokeStatusCard;
