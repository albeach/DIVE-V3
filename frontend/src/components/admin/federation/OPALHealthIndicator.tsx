/**
 * DIVE V3 - OPAL Health Indicator
 * 
 * Displays OPAL Server connection status, health, and configuration.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Radio,
} from 'lucide-react';
import { IOPALHealth } from '@/types/federation.types';

interface OPALHealthIndicatorProps {
  health: IOPALHealth | null;
  loading?: boolean;
  onRefresh?: () => void;
  compact?: boolean;
}

export function OPALHealthIndicator({
  health,
  loading,
  onRefresh,
  compact = false,
}: OPALHealthIndicatorProps) {
  if (loading) {
    return (
      <div className={`bg-white rounded-2xl border border-slate-200 shadow-lg ${compact ? 'p-4' : 'p-6'} animate-pulse`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="flex-1">
            <div className="h-5 bg-slate-200 rounded w-32 mb-2" />
            <div className="h-4 bg-slate-200 rounded w-24" />
          </div>
        </div>
      </div>
    );
  }

  const isHealthy = health?.healthy ?? false;
  const isEnabled = health?.opalEnabled ?? false;

  // Compact mode for inline display
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {isEnabled ? (
          isHealthy ? (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm text-emerald-700 font-medium">OPAL Connected</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-sm text-red-700 font-medium">OPAL Unhealthy</span>
            </>
          )
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-sm text-slate-500 font-medium">OPAL Disabled</span>
          </>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isEnabled
              ? isHealthy
                ? 'bg-emerald-100'
                : 'bg-red-100'
              : 'bg-slate-100'
          }`}>
            <Server className={`w-5 h-5 ${
              isEnabled
                ? isHealthy
                  ? 'text-emerald-600'
                  : 'text-red-600'
                : 'text-slate-500'
            }`} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">OPAL Server</h3>
            <p className="text-sm text-slate-500">Policy Distribution</p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Status */}
      <div className={`flex items-center gap-3 p-4 rounded-xl mb-4 ${
        isEnabled
          ? isHealthy
            ? 'bg-emerald-50 border border-emerald-200'
            : 'bg-red-50 border border-red-200'
          : 'bg-slate-50 border border-slate-200'
      }`}>
        {isEnabled ? (
          isHealthy ? (
            <>
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <div className="flex-1">
                <p className="font-medium text-emerald-800">Healthy & Connected</p>
                <p className="text-sm text-emerald-600">Policies syncing normally</p>
              </div>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Activity className="w-6 h-6 text-emerald-400" />
              </motion.div>
            </>
          ) : (
            <>
              <XCircle className="w-6 h-6 text-red-600" />
              <div className="flex-1">
                <p className="font-medium text-red-800">Connection Issue</p>
                <p className="text-sm text-red-600">{health?.error || 'Unable to connect'}</p>
              </div>
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </>
          )
        ) : (
          <>
            <AlertTriangle className="w-6 h-6 text-slate-500" />
            <div className="flex-1">
              <p className="font-medium text-slate-800">OPAL Disabled</p>
              <p className="text-sm text-slate-600">Policy distribution not configured</p>
            </div>
          </>
        )}
      </div>

      {/* Configuration */}
      {isEnabled && (
        <div className="space-y-3">
          {/* Server URL */}
          {(health?.serverUrl || health?.config?.serverUrl) && (
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-600">Server URL</span>
              </div>
              <code className="text-sm font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded">
                {health?.serverUrl || health?.config?.serverUrl}
              </code>
            </div>
          )}

          {/* Topics */}
          {(health?.topics?.length || health?.config?.topics?.length) && (
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-600">Data Topics</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(health?.topics || health?.config?.topics || []).map((topic) => (
                  <span
                    key={topic}
                    className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded border border-blue-200"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default OPALHealthIndicator;
