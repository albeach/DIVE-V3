/**
 * DIVE V3 - Circuit Breaker Control
 * 
 * Visual control for spoke failover circuit breaker state.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  ZapOff,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  Activity,
  TrendingUp,
  TrendingDown,
  Clock,
} from 'lucide-react';
import { CircuitBreakerState } from '@/types/federation.types';

export interface ICircuitBreakerStatus {
  state: CircuitBreakerState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailure?: string;
  lastSuccess?: string;
  totalFailures: number;
  totalRecoveries: number;
  uptimePercentage: number;
}

interface CircuitBreakerControlProps {
  status: ICircuitBreakerStatus | null;
  loading?: boolean;
  onForceState?: (state: CircuitBreakerState) => Promise<void>;
  onReset?: () => Promise<void>;
}

const STATE_CONFIG: Record<CircuitBreakerState, {
  label: string;
  description: string;
  color: string;
  bg: string;
  icon: typeof Zap;
  glow: string;
}> = {
  CLOSED: {
    label: 'Closed',
    description: 'Circuit is healthy, all requests flow normally',
    color: 'text-emerald-600',
    bg: 'bg-emerald-500',
    icon: Zap,
    glow: 'shadow-emerald-300',
  },
  HALF_OPEN: {
    label: 'Half Open',
    description: 'Testing connection, limited requests allowed',
    color: 'text-amber-600',
    bg: 'bg-amber-500',
    icon: Activity,
    glow: 'shadow-amber-300',
  },
  OPEN: {
    label: 'Open',
    description: 'Circuit tripped, requests blocked, using fallback',
    color: 'text-red-600',
    bg: 'bg-red-500',
    icon: ZapOff,
    glow: 'shadow-red-300',
  },
};

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  return `${Math.floor(diffMinutes / 60)}h ago`;
}

export function CircuitBreakerControl({ 
  status, 
  loading,
  onForceState,
  onReset 
}: CircuitBreakerControlProps) {
  const [showControls, setShowControls] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleForceState = async (state: CircuitBreakerState) => {
    if (!onForceState) return;
    setProcessing(true);
    try {
      await onForceState(state);
    } finally {
      setProcessing(false);
      setShowControls(false);
    }
  };

  const handleReset = async () => {
    if (!onReset) return;
    setProcessing(true);
    try {
      await onReset();
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="h-6 bg-slate-200 rounded w-40" />
        </div>
        <div className="h-32 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  const state = status?.state || 'CLOSED';
  const config = STATE_CONFIG[state];
  const StateIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${state === 'CLOSED' ? 'bg-emerald-100' : state === 'HALF_OPEN' ? 'bg-amber-100' : 'bg-red-100'}`}>
            <StateIcon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Circuit Breaker</h3>
            <p className="text-sm text-slate-500">Failover protection</p>
          </div>
        </div>

        {onReset && (
          <button
            onClick={handleReset}
            disabled={processing}
            className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
            Reset
          </button>
        )}
      </div>

      {/* State Visualization */}
      <div className="relative mb-6">
        <div className={`flex items-center justify-center p-6 rounded-2xl ${
          state === 'CLOSED' ? 'bg-emerald-50' : state === 'HALF_OPEN' ? 'bg-amber-50' : 'bg-red-50'
        }`}>
          <div className="text-center">
            <motion.div
              key={state}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-3 shadow-lg ${config.bg} ${config.glow}`}
            >
              <StateIcon className="w-10 h-10 text-white" />
            </motion.div>
            <h4 className={`text-2xl font-bold ${config.color}`}>{config.label}</h4>
            <p className="text-sm text-slate-500 mt-1 max-w-xs">{config.description}</p>
          </div>
        </div>

        {/* State indicator dots */}
        <div className="flex items-center justify-center gap-8 mt-4">
          {(['CLOSED', 'HALF_OPEN', 'OPEN'] as CircuitBreakerState[]).map((s) => (
            <div key={s} className="flex flex-col items-center gap-1">
              <div className={`w-4 h-4 rounded-full border-2 transition-all ${
                s === state 
                  ? `${STATE_CONFIG[s].bg} border-transparent scale-125` 
                  : 'bg-slate-100 border-slate-300'
              }`} />
              <span className={`text-xs ${s === state ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>
                {STATE_CONFIG[s].label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="p-3 bg-slate-50 rounded-lg text-center">
          <TrendingDown className="w-4 h-4 text-red-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-800">{status?.consecutiveFailures || 0}</p>
          <p className="text-xs text-slate-500">Failures</p>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg text-center">
          <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-800">{status?.consecutiveSuccesses || 0}</p>
          <p className="text-xs text-slate-500">Successes</p>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg text-center">
          <Activity className="w-4 h-4 text-blue-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-800">{status?.totalRecoveries || 0}</p>
          <p className="text-xs text-slate-500">Recoveries</p>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg text-center">
          <Zap className="w-4 h-4 text-purple-500 mx-auto mb-1" />
          <p className="text-lg font-bold text-slate-800">
            {status?.uptimePercentage?.toFixed(1) || '99.9'}%
          </p>
          <p className="text-xs text-slate-500">Uptime</p>
        </div>
      </div>

      {/* Last Events */}
      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span className="text-slate-600">
            Last failure: <span className="font-medium">{formatRelativeTime(status?.lastFailure)}</span>
          </span>
        </div>
        <div className="text-slate-600">
          Last success: <span className="font-medium">{formatRelativeTime(status?.lastSuccess)}</span>
        </div>
      </div>

      {/* Force Controls */}
      {onForceState && (
        <div className="mt-4">
          <button
            onClick={() => setShowControls(!showControls)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Manual Override
            <ChevronDown className={`w-4 h-4 transition-transform ${showControls ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showControls && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs text-amber-700 mb-3">
                    ⚠️ Manual state changes bypass automatic recovery. Use with caution.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleForceState('CLOSED')}
                      disabled={processing || state === 'CLOSED'}
                      className="flex-1 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      Force Closed
                    </button>
                    <button
                      onClick={() => handleForceState('HALF_OPEN')}
                      disabled={processing || state === 'HALF_OPEN'}
                      className="flex-1 px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      Force Half-Open
                    </button>
                    <button
                      onClick={() => handleForceState('OPEN')}
                      disabled={processing || state === 'OPEN'}
                      className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      Force Open
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

export default CircuitBreakerControl;

