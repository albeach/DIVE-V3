'use client';

/**
 * Activity Page Content
 * 
 * Modern timeline view of user's recent activity with:
 * - Document interactions (view, download)
 * - Authorization decisions
 * - Access requests
 * - Upload history
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { 
  Eye, 
  Download, 
  Upload, 
  Shield, 
  ShieldCheck, 
  ShieldX, 
  Clock, 
  FileText, 
  ChevronRight,
  RefreshCw,
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
  Search,
  Sparkles
} from 'lucide-react';

interface ActivityUser {
  uniqueID?: string | null;
  clearance?: string | null;
  countryOfAffiliation?: string | null;
}

interface ActivityPageContentProps {
  user: ActivityUser;
}

// Activity types
type ActivityType = 'view' | 'download' | 'upload' | 'access_granted' | 'access_denied' | 'request_submitted';
type TimeRange = '24h' | '7d' | '30d' | 'all';

interface ActivityItem {
  id: string;
  type: ActivityType;
  resourceId: string;
  resourceTitle: string;
  classification: string;
  timestamp: Date;
  details?: string;
  decision?: string;
}

// Mock data generator for demo purposes
function generateMockActivities(userId: string): ActivityItem[] {
  const classifications = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
  const types: ActivityType[] = ['view', 'download', 'upload', 'access_granted', 'access_denied', 'request_submitted'];
  const titles = [
    'NATO Exercise Plan Alpha',
    'Coalition Communications Protocol',
    'Intelligence Assessment Report',
    'Logistics Coordination Brief',
    'Joint Operations Manual',
    'Security Implementation Guide',
    'Strategic Defense Overview',
    'Tactical Response Framework',
    'Field Operations Handbook',
    'Coalition Forces Directory'
  ];

  const activities: ActivityItem[] = [];
  const now = new Date();

  for (let i = 0; i < 25; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const hoursAgo = Math.floor(Math.random() * 168); // Up to 7 days ago
    
    activities.push({
      id: `act-${i}-${Date.now()}`,
      type,
      resourceId: `doc-${Math.floor(Math.random() * 1000)}`,
      resourceTitle: titles[Math.floor(Math.random() * titles.length)],
      classification: classifications[Math.floor(Math.random() * classifications.length)],
      timestamp: new Date(now.getTime() - hoursAgo * 3600000),
      details: type === 'access_denied' ? 'Clearance level insufficient' : undefined,
      decision: type.includes('access') ? (type === 'access_granted' ? 'ALLOW' : 'DENY') : undefined
    });
  }

  return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function ActivityPageContent({ user }: ActivityPageContentProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  // Load mock activities
  useEffect(() => {
    const timer = setTimeout(() => {
      setActivities(generateMockActivities(user.uniqueID || 'unknown'));
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [user.uniqueID]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    const now = Date.now();
    const isWithinRange = (timestamp: Date) => {
      const diffHours = (now - timestamp.getTime()) / 3600000;
      switch (timeRange) {
        case '24h':
          return diffHours <= 24;
        case '7d':
          return diffHours <= 24 * 7;
        case '30d':
          return diffHours <= 24 * 30;
        default:
          return true;
      }
    };

    return activities.filter(activity => {
      const matchesFilter = filter === 'all' || activity.type === filter;
      const matchesSearch = searchQuery === '' || 
        activity.resourceTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        activity.resourceId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRange = isWithinRange(activity.timestamp);
      return matchesFilter && matchesSearch && matchesRange;
    });
  }, [activities, filter, searchQuery, timeRange]);

  const stats = useMemo(() => {
    const total = activities.length;
    const decisions = activities.filter(a => a.type === 'access_granted' || a.type === 'access_denied');
    const granted = decisions.filter(a => a.type === 'access_granted').length;
    const denied = decisions.filter(a => a.type === 'access_denied').length;
    const views = activities.filter(a => a.type === 'view').length;
    const downloads = activities.filter(a => a.type === 'download').length;
    const uploads = activities.filter(a => a.type === 'upload').length;
    const successRate = decisions.length ? Math.round((granted / decisions.length) * 100) : 0;

    return { total, granted, denied, views, downloads, uploads, successRate };
  }, [activities]);

  // Group activities by date
  const groupedActivities = useMemo(() => {
    const groups: { [key: string]: ActivityItem[] } = {};
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    filteredActivities.forEach(activity => {
      const activityDate = new Date(activity.timestamp);
      let key: string;

      if (activityDate.toDateString() === today.toDateString()) {
        key = 'Today';
      } else if (activityDate.toDateString() === yesterday.toDateString()) {
        key = 'Yesterday';
      } else {
        key = activityDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(activity);
    });

    return groups;
  }, [filteredActivities]);

  const gradientBg: CSSProperties = {
    background: 'linear-gradient(120deg, rgba(var(--instance-primary-rgb), 0.12), rgba(var(--instance-secondary-rgb, var(--instance-primary-rgb)), 0.08))'
  };

  const formatRelativeTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.round(diff / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  };

  const insightMessage = useMemo(() => {
    if (stats.denied === 0 && stats.granted > 0) {
      return 'Clean slate: no denials detected in this window.';
    }
    if (stats.denied > stats.granted) {
      return 'Increase review: denials outpace approvals.';
    }
    if (stats.successRate >= 80) {
      return 'High signal: most access requests are succeeding.';
    }
    return 'Balanced traffic across views, downloads, and requests.';
  }, [stats]);

  // Activity icon and color mapping
  const getActivityConfig = (type: ActivityType) => {
    switch (type) {
      case 'view':
        return { icon: Eye, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Viewed' };
      case 'download':
        return { icon: Download, color: 'text-green-500', bg: 'bg-green-50', label: 'Downloaded' };
      case 'upload':
        return { icon: Upload, color: 'text-purple-500', bg: 'bg-purple-50', label: 'Uploaded' };
      case 'access_granted':
        return { icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Access Granted' };
      case 'access_denied':
        return { icon: ShieldX, color: 'text-red-500', bg: 'bg-red-50', label: 'Access Denied' };
      case 'request_submitted':
        return { icon: Shield, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Request Submitted' };
      default:
        return { icon: FileText, color: 'text-gray-500', bg: 'bg-gray-50', label: 'Activity' };
    }
  };

  // Classification badge color
  const getClassificationColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'TOP_SECRET':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'SECRET':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'CONFIDENTIAL':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  const getDecisionBadge = (decision?: string) => {
    if (!decision) return null;
    const isAllow = decision === 'ALLOW';
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        isAllow ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
      }`}>
        {isAllow ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
        {isAllow ? 'Allowed' : 'Denied'}
      </span>
    );
  };

  // Format time
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // Filter options
  const filterOptions: { value: ActivityType | 'all'; label: string; icon: typeof Eye }[] = [
    { value: 'all', label: 'All Activity', icon: Clock },
    { value: 'view', label: 'Views', icon: Eye },
    { value: 'download', label: 'Downloads', icon: Download },
    { value: 'upload', label: 'Uploads', icon: Upload },
    { value: 'access_granted', label: 'Granted', icon: CheckCircle },
    { value: 'access_denied', label: 'Denied', icon: XCircle },
  ];

  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: 'all', label: 'All' },
  ];

  if (isLoading) {
    return <ActivitySkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Hero / Overview */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <div className="absolute inset-0" style={gradientBg} />
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-11 h-11 rounded-xl flex items-center justify-center shadow-sm"
                style={{ background: 'var(--instance-banner-bg)' }}
              >
                <Clock className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900">Recent Activity</h1>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-white/70 text-gray-700 border border-white/60">
                    <Sparkles className="w-3 h-3" />
                    Live view
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Trace document interactions, authorizations, and audit signals.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {user.clearance && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-white/70 text-gray-800 border border-white/60">
                  <Shield className="w-3.5 h-3.5" />
                  {user.clearance}
                </span>
              )}
              {user.countryOfAffiliation && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-white/70 text-gray-800 border border-white/60">
                  <FileText className="w-3.5 h-3.5" />
                  {user.countryOfAffiliation}
                </span>
              )}
              {user.uniqueID && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-white/70 text-gray-800 border border-white/60">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {user.uniqueID}
                </span>
              )}
            </div>
          </div>

          {/* KPI strip */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Access success" value={`${stats.successRate}%`} trend={insightMessage} />
            <StatCard label="Views / Downloads" value={`${stats.views} / ${stats.downloads}`} trend="Engagement over selected window" />
            <StatCard label="Uploads & Denials" value={`${stats.uploads} / ${stats.denied}`} trend="Watch for spikes in denials" />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search */}
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search resources or IDs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:border-transparent transition-all"
              style={{ '--tw-ring-color': 'rgba(var(--instance-primary-rgb), 0.28)' } as CSSProperties}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {timeRangeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTimeRange(option.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  timeRange === option.value
                    ? 'text-white border-transparent'
                    : 'text-gray-600 bg-white hover:border-gray-200'
                }`}
                style={timeRange === option.value ? { background: 'var(--instance-banner-bg)' } : undefined}
              >
                {option.label}
              </button>
            ))}
            {filterOptions.map((option) => {
              const isActive = filter === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => setFilter(option.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive 
                      ? 'text-white shadow-sm' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                  }`}
                  style={isActive ? { background: 'var(--instance-banner-bg)' } : undefined}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      {Object.keys(groupedActivities).length === 0 ? (
        <EmptyActivityState />
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedActivities).map(([date, items]) => (
            <div key={date}>
              {/* Date Header */}
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-gray-400" strokeWidth={2} />
                <h2 className="text-sm font-bold text-gray-700">{date}</h2>
                <span className="text-xs text-gray-400">({items.length} activities)</span>
              </div>

              {/* Activity Cards */}
              <div className="relative pl-5">
                <div 
                  className="absolute left-1.5 top-0 bottom-0 w-px"
                  style={{ background: 'linear-gradient(to bottom, rgba(var(--instance-primary-rgb),0.2), rgba(226,232,240,0.9))' }}
                />
                {items.map((activity, index) => {
                  const config = getActivityConfig(activity.type);
                  const Icon = config.icon;
                  
                  return (
                    <div
                      key={activity.id}
                      className="relative group bg-white border border-gray-100 rounded-xl p-4 mb-3 hover:border-gray-200 hover:shadow-sm transition-all animate-fade-in"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <span 
                        className={`absolute -left-[19px] top-5 w-3 h-3 rounded-full border border-white shadow ring-2 ring-white ${config.bg}`}
                      />
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-4 h-4 ${config.color}`} strokeWidth={2} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-semibold ${config.color}`}>
                                  {config.label}
                                </span>
                                {getDecisionBadge(activity.decision)}
                              </div>
                              
                              {/* Resource Title */}
                              <h3 className="text-sm font-semibold text-gray-900 mt-0.5">
                                {activity.resourceTitle}
                              </h3>
                              
                              {/* Meta Info */}
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${getClassificationColor(activity.classification)}`}>
                                  {activity.classification.replace('_', ' ')}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {activity.resourceId}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  {formatRelativeTime(activity.timestamp)}
                                </span>
                              </div>

                              {/* Details (if any) */}
                              {activity.details && (
                                <p className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  {activity.details}
                                </p>
                              )}
                            </div>

                            {/* Time */}
                            <span className="text-[10px] text-gray-400 whitespace-nowrap text-right">
                              {formatTime(activity.timestamp)}
                            </span>
                          </div>
                        </div>

                        {/* View Link */}
                        <Link
                          href={`/resources/${activity.resourceId}`}
                          className="hidden group-hover:flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More (placeholder) */}
      {filteredActivities.length >= 25 && (
        <div className="mt-6 text-center">
          <button 
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Load More Activity
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/70 backdrop-blur p-3 shadow-sm">
      <p className="text-xs font-semibold text-gray-600">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{trend}</p>
    </div>
  );
}

// Empty State
function EmptyActivityState() {
  return (
    <div className="text-center py-12">
      <div 
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style={{ background: 'linear-gradient(to bottom right, rgba(var(--instance-primary-rgb), 0.1), rgba(var(--instance-secondary-rgb, var(--instance-primary-rgb)), 0.1))' }}
      >
        <Sparkles className="w-8 h-8" style={{ color: 'var(--instance-primary)' }} />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-1">No activity found</h3>
      <p className="text-sm text-gray-500 mb-4">
        Your document interactions will appear here
      </p>
      <Link
        href="/resources"
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all hover:shadow-md"
        style={{ background: 'var(--instance-banner-bg)' }}
      >
        <FileText className="w-4 h-4" />
        Browse Documents
      </Link>
    </div>
  );
}

// Loading Skeleton
function ActivitySkeleton() {
  return (
    <div className="max-w-4xl mx-auto animate-pulse">
      {/* Header Skeleton */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gray-200" />
          <div>
            <div className="h-6 w-48 bg-gray-200 rounded mb-1" />
            <div className="h-4 w-64 bg-gray-100 rounded" />
          </div>
        </div>
      </div>

      {/* Search Skeleton */}
      <div className="mb-6 space-y-3">
        <div className="h-10 bg-gray-100 rounded-xl" />
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-8 w-20 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Activity Items Skeleton */}
      <div className="space-y-6">
        <div>
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100" />
                  <div className="flex-1">
                    <div className="h-3 w-16 bg-gray-100 rounded mb-1" />
                    <div className="h-4 w-48 bg-gray-200 rounded mb-1" />
                    <div className="h-3 w-32 bg-gray-100 rounded" />
                  </div>
                  <div className="h-3 w-12 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
