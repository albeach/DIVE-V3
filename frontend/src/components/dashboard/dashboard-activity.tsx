/**
 * Dashboard Activity Tab Component
 *
 * Shows personal audit trail, authorization history, and compliance status.
 */

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  FileText,
  Globe,
  Users,
  ArrowRight,
  Filter,
  Download,
  Eye,
  Lock,
  Unlock,
  RefreshCw,
} from 'lucide-react';
import { EducationalTooltip } from './educational-tooltip';

interface AuditEvent {
  id: string;
  type: 'auth' | 'access' | 'decision' | 'upload' | 'download';
  action: string;
  outcome: 'success' | 'failure' | 'warning';
  resourceId?: string;
  resourceTitle?: string;
  reason?: string;
  timestamp: string;
  ip?: string;
}

interface ComplianceMetric {
  name: string;
  status: 'compliant' | 'warning' | 'violation';
  score: number;
  description: string;
}

interface DashboardActivityProps {
  auditEvents?: AuditEvent[];
  complianceMetrics?: ComplianceMetric[];
  lastLogin?: string;
  sessionCount?: number;
}

export function DashboardActivity({
  auditEvents = [],
  complianceMetrics = [],
  lastLogin,
  sessionCount = 0,
}: DashboardActivityProps) {
  const [filter, setFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [showAll, setShowAll] = useState(false);

  const filteredEvents = auditEvents.filter((event) => {
    if (filter === 'all') return true;
    return event.outcome === filter;
  });

  const displayedEvents = showAll ? filteredEvents : filteredEvents.slice(0, 10);

  // Default compliance metrics if none provided
  const defaultMetrics: ComplianceMetric[] = complianceMetrics.length > 0 ? complianceMetrics : [
    {
      name: 'Authentication Compliance',
      status: 'compliant',
      score: 100,
      description: 'All authentications via approved IdPs',
    },
    {
      name: 'Access Control Adherence',
      status: 'compliant',
      score: 100,
      description: 'No unauthorized access attempts',
    },
    {
      name: 'Audit Trail Completeness',
      status: 'compliant',
      score: 100,
      description: 'All actions logged per ACP-240',
    },
    {
      name: 'Session Security',
      status: 'compliant',
      score: 100,
      description: 'Token lifetimes within policy limits',
    },
  ];

  const getEventIcon = (event: AuditEvent) => {
    switch (event.type) {
      case 'auth':
        return <Unlock className="w-4 h-4" />;
      case 'access':
        return <Eye className="w-4 h-4" />;
      case 'decision':
        return <Shield className="w-4 h-4" />;
      case 'upload':
        return <ArrowRight className="w-4 h-4 rotate-90" />;
      case 'download':
        return <Download className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getOutcomeStyles = (outcome: string) => {
    switch (outcome) {
      case 'success':
        return { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-700', icon: CheckCircle2 };
      case 'failure':
        return { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-700', icon: XCircle };
      case 'warning':
        return { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-700', icon: AlertTriangle };
      default:
        return { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700', icon: Activity };
    }
  };

  const getComplianceStyles = (status: string) => {
    switch (status) {
      case 'compliant':
        return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle2 };
      case 'warning':
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: AlertTriangle };
      case 'violation':
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle };
      default:
        return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', icon: Activity };
    }
  };

  return (
    <div className="space-y-6">
      {/* Activity Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">{auditEvents.length}</span>
          </div>
          <p className="text-sm text-white/80">Total Events</p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle2 className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">
              {auditEvents.filter(e => e.outcome === 'success').length}
            </span>
          </div>
          <p className="text-sm text-white/80">Successful Actions</p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 text-white/80" />
            <span className="text-xl font-bold">
              {lastLogin ? new Date(lastLogin).toLocaleDateString() : 'Today'}
            </span>
          </div>
          <p className="text-sm text-white/80">Last Login</p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">{sessionCount}</span>
          </div>
          <p className="text-sm text-white/80">Active Sessions</p>
        </div>
      </motion.div>

      {/* Compliance Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Compliance Status</h3>
            <p className="text-xs text-slate-600">
              Your adherence to <EducationalTooltip term="ACP-240">ACP-240</EducationalTooltip> requirements
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {defaultMetrics.map((metric, idx) => {
            const styles = getComplianceStyles(metric.status);
            const Icon = styles.icon;

            return (
              <motion.div
                key={metric.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * idx }}
                className={`flex items-center gap-3 p-4 rounded-xl ${styles.bg} ${styles.border} border`}
              >
                <div className={`w-10 h-10 rounded-lg bg-white flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${styles.text}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">{metric.name}</p>
                    <span className={`text-sm font-bold ${styles.text}`}>{metric.score}%</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{metric.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Why Audit Matters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 p-6 shadow-lg"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Why Audit Trails Matter</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              Every action in DIVE V3 is logged for <EducationalTooltip term="ACP-240">ACP-240</EducationalTooltip> compliance.
              This audit trail enables security investigations, policy refinement, and accountability.
              Logs are retained for 90 days minimum per <EducationalTooltip term="STANAG">STANAG</EducationalTooltip> requirements.
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-indigo-200">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-slate-700">Authorization Decisions</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-indigo-200">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-slate-700">Resource Accesses</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-indigo-200">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-slate-700">Authentication Events</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Audit Trail */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Audit Trail</h3>
              <p className="text-xs text-slate-600">Your recent activity history</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-1">
              {(['all', 'success', 'failure'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    filter === f
                      ? 'bg-white shadow text-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <Link
              href="/activity"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {displayedEvents.length > 0 ? (
          <div className="space-y-2">
            {displayedEvents.map((event, idx) => {
              const styles = getOutcomeStyles(event.outcome);
              const OutcomeIcon = styles.icon;

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 * idx }}
                  className={`flex items-center gap-4 p-4 rounded-xl ${styles.bg} ${styles.border} border`}
                >
                  <div className={`w-10 h-10 rounded-lg bg-white flex items-center justify-center ${styles.text}`}>
                    {getEventIcon(event)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{event.action}</p>
                      <OutcomeIcon className={`w-4 h-4 ${styles.text}`} />
                    </div>
                    {event.resourceTitle && (
                      <p className="text-xs text-slate-600 truncate">Resource: {event.resourceTitle}</p>
                    )}
                    {event.reason && (
                      <p className="text-xs text-slate-500 mt-0.5">{event.reason}</p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-slate-500">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(event.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </motion.div>
              );
            })}

            {filteredEvents.length > 10 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showAll ? 'Show less' : `Show ${filteredEvents.length - 10} more`}
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No activity recorded yet</p>
            <p className="text-xs mt-1">Your actions will appear here</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default DashboardActivity;
