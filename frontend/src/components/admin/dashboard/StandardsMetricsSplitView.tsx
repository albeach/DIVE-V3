"use client";

import { StandardsBadge } from '@/components/standards/StandardsBadge';
import { TrendingUp, TrendingDown } from 'lucide-react';

/**
 * Standards Metrics Split View
 * 
 * Shows authorization metrics split by standard:
 * - Left: Federation (5663) metrics (AAL checks, token validation, MFA)
 * - Right: Object (240) metrics (ZTDF checks, KAS operations, signatures)
 */
export function StandardsMetricsSplitView() {
  // Mock data
  const metrics = {
    federation: {
      decisionsToday: 1234,
      aalChecks: 1234,
      tokenValidRate: 98,
      mfaVerified: 856,
      topDenials: [
        { reason: 'Insufficient AAL', count: 45 },
        { reason: 'Token expired', count: 23 },
        { reason: 'Untrusted issuer', count: 12 },
      ],
    },
    object: {
      decisionsToday: 1234,
      ztdfChecks: 1234,
      signatureValidRate: 100,
      kasUnwraps: 456,
      topDenials: [
        { reason: 'Invalid signature', count: 0 },
        { reason: 'KAS unreachable', count: 8 },
        { reason: 'Policy mismatch', count: 5 },
      ],
    },
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Federation (5663) */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <StandardsBadge standard="5663" size="md" />
        
        <div className="mt-6 space-y-4">
          <MetricCard 
            label="Decisions Today"
            value={metrics.federation.decisionsToday.toLocaleString()}
            trend={+12}
          />
          <MetricCard 
            label="AAL Checks"
            value={metrics.federation.aalChecks.toLocaleString()}
          />
          <MetricCard 
            label="Token Valid Rate"
            value={`${metrics.federation.tokenValidRate}%`}
            trend={+2}
          />
          <MetricCard 
            label="MFA Verified"
            value={metrics.federation.mfaVerified.toLocaleString()}
          />
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">
            Top Denial Reasons
          </h4>
          <div className="space-y-2">
            {metrics.federation.topDenials.map((denial, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">{idx + 1}. {denial.reason}</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">{denial.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Object (240) */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <StandardsBadge standard="240" size="md" />
        
        <div className="mt-6 space-y-4">
          <MetricCard 
            label="Decisions Today"
            value={metrics.object.decisionsToday.toLocaleString()}
            trend={+12}
          />
          <MetricCard 
            label="ZTDF Checks"
            value={metrics.object.ztdfChecks.toLocaleString()}
          />
          <MetricCard 
            label="Signature Valid Rate"
            value={`${metrics.object.signatureValidRate}%`}
            trend={0}
          />
          <MetricCard 
            label="KAS Unwraps"
            value={metrics.object.kasUnwraps.toLocaleString()}
          />
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">
            Top Denial Reasons
          </h4>
          <div className="space-y-2">
            {metrics.object.topDenials.map((denial, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">{idx + 1}. {denial.reason}</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">{denial.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, trend }: { label: string; value: string; trend?: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}:</span>
      <div className="flex items-center gap-2">
        <span className="font-bold text-lg text-gray-900 dark:text-gray-100">{value}</span>
        {trend !== undefined && trend !== 0 && (
          <span className={`text-xs flex items-center ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}
