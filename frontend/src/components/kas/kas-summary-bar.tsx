'use client';

/**
 * KAS Summary Bar Component
 * 
 * Displays summary statistics for all KAS instances.
 * Shows totals, status breakdown, and key metrics.
 */

import { 
  Server, 
  Activity, 
  Clock, 
  Pause, 
  AlertCircle,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';
import { IKASSummary } from '@/lib/api/kas';

interface KASSummaryBarProps {
  summary: IKASSummary;
  timestamp?: string;
  isLoading?: boolean;
}

function SummarySkeleton() {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border-2 border-blue-200 mb-6 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-200 rounded-lg" />
            <div>
              <div className="h-3 w-16 bg-blue-200 rounded mb-1" />
              <div className="h-5 w-12 bg-blue-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KASSummaryBar({ summary, timestamp, isLoading = false }: KASSummaryBarProps) {
  if (isLoading) {
    return <SummarySkeleton />;
  }

  const stats = [
    {
      label: 'Total KAS',
      value: summary.totalKAS,
      icon: Server,
      color: 'text-blue-600 bg-blue-100'
    },
    {
      label: 'Active',
      value: summary.activeKAS,
      icon: Activity,
      color: 'text-green-600 bg-green-100'
    },
    {
      label: 'Pending',
      value: summary.pendingKAS,
      icon: Clock,
      color: 'text-yellow-600 bg-yellow-100'
    },
    {
      label: 'Suspended',
      value: summary.suspendedKAS,
      icon: Pause,
      color: 'text-orange-600 bg-orange-100'
    },
    {
      label: 'Offline',
      value: summary.offlineKAS,
      icon: AlertCircle,
      color: 'text-red-600 bg-red-100'
    },
    {
      label: 'Requests Today',
      value: summary.totalRequestsToday.toLocaleString(),
      icon: TrendingUp,
      color: 'text-purple-600 bg-purple-100'
    },
    {
      label: 'Avg Uptime',
      value: `${summary.averageUptime.toFixed(1)}%`,
      icon: CheckCircle2,
      color: summary.averageUptime >= 99 
        ? 'text-green-600 bg-green-100' 
        : summary.averageUptime >= 95 
          ? 'text-yellow-600 bg-yellow-100' 
          : 'text-red-600 bg-red-100'
    }
  ];

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border-2 border-blue-200 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${stat.color.split(' ')[1]}`}>
              <stat.icon className={`w-5 h-5 ${stat.color.split(' ')[0]}`} />
            </div>
            <div>
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className={`text-lg font-bold ${stat.color.split(' ')[0]}`}>
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>
      
      {timestamp && (
        <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Live data from MongoDB • Last updated: {new Date(timestamp).toLocaleTimeString()}
          </p>
          <div className="flex items-center gap-1 text-xs text-green-600">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Real-time
          </div>
        </div>
      )}
    </div>
  );
}

export default KASSummaryBar;
