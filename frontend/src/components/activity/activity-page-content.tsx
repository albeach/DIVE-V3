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
import { useInstanceTheme } from '@/components/ui/theme-provider';
import { 
  Eye, 
  Download, 
  Upload, 
  Shield, 
  ShieldCheck, 
  ShieldX, 
  Clock, 
  FileText, 
  Filter,
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
  const { theme } = useInstanceTheme();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
    return activities.filter(activity => {
      const matchesFilter = filter === 'all' || activity.type === filter;
      const matchesSearch = searchQuery === '' || 
        activity.resourceTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        activity.resourceId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [activities, filter, searchQuery]);

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

  if (isLoading) {
    return <ActivitySkeleton />;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--instance-banner-bg)' }}
          >
            <Clock className="w-5 h-5 text-white" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recent Activity</h1>
            <p className="text-sm text-gray-500">Your document interactions and access history</p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search activities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-offset-1 focus:border-transparent transition-all"
            style={{ '--tw-ring-color': 'rgba(var(--instance-primary-rgb), 0.3)' } as React.CSSProperties}
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2">
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
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
              <div className="space-y-2">
                {items.map((activity, index) => {
                  const config = getActivityConfig(activity.type);
                  const Icon = config.icon;
                  
                  return (
                    <div
                      key={activity.id}
                      className="group bg-white border border-gray-100 rounded-xl p-3 hover:border-gray-200 hover:shadow-sm transition-all animate-fade-in"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-4 h-4 ${config.color}`} strokeWidth={2} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              {/* Action Label */}
                              <span className={`text-xs font-semibold ${config.color}`}>
                                {config.label}
                              </span>
                              
                              {/* Resource Title */}
                              <h3 className="text-sm font-medium text-gray-900 truncate mt-0.5">
                                {activity.resourceTitle}
                              </h3>
                              
                              {/* Meta Info */}
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${getClassificationColor(activity.classification)}`}>
                                  {activity.classification.replace('_', ' ')}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {activity.resourceId}
                                </span>
                              </div>

                              {/* Details (if any) */}
                              {activity.details && (
                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  {activity.details}
                                </p>
                              )}
                            </div>

                            {/* Time */}
                            <span className="text-[10px] text-gray-400 whitespace-nowrap">
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

// Empty State
function EmptyActivityState() {
  return (
    <div className="text-center py-12">
      <div 
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style={{ background: 'linear-gradient(to br, rgba(var(--instance-primary-rgb), 0.1), rgba(var(--instance-secondary-rgb, var(--instance-primary-rgb)), 0.1))' }}
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




