/**
 * Dashboard Authorization Tab Component
 *
 * Shows authorization decisions, policy insights, and test sandbox access.
 */

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldX,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  BarChart3,
  Sparkles,
  BookOpen,
  Play,
  FileText,
  Globe,
  Users,
  Lock,
} from 'lucide-react';
import { EducationalTooltip } from './educational-tooltip';
import { useTranslation } from '@/hooks/useTranslation';

interface AuthorizationDecision {
  id: string;
  resourceId: string;
  decision: 'allow' | 'deny';
  reason: string;
  timestamp: string;
  evaluationMs?: number;
}

interface AuthorizationStats {
  totalDecisions: number;
  allowedCount: number;
  deniedCount: number;
  avgLatencyMs: number;
  topDenyReasons?: Array<{ reason: string; count: number }>;
  decisionsByCountry?: Record<string, number>;
}

interface DashboardAuthorizationProps {
  decisions?: AuthorizationDecision[];
  stats?: AuthorizationStats;
  userClearance: string;
  userCountry: string;
  userCOI: string[];
}

export function DashboardAuthorization({
  decisions = [],
  stats,
  userClearance,
  userCountry,
  userCOI,
}: DashboardAuthorizationProps) {
  const { t } = useTranslation('dashboard');
  const [showAllDecisions, setShowAllDecisions] = useState(false);

  const displayedDecisions = showAllDecisions ? decisions : decisions.slice(0, 5);
  const allowRate = stats
    ? Math.round((stats.allowedCount / Math.max(stats.totalDecisions, 1)) * 100)
    : 100;

  // Clearance hierarchy for visualization
  const clearanceLevels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
  const currentClearanceIndex = clearanceLevels.indexOf(userClearance);

  return (
    <div className="space-y-6">
      {/* Authorization Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <ShieldCheck className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">{stats?.allowedCount || 0}</span>
          </div>
          <p className="text-sm text-white/80">{t('authorization.stats.allowedRequests')}</p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <ShieldX className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">{stats?.deniedCount || 0}</span>
          </div>
          <p className="text-sm text-white/80">{t('authorization.stats.deniedRequests')}</p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <BarChart3 className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">{allowRate}%</span>
          </div>
          <p className="text-sm text-white/80">{t('authorization.stats.authorizationRate')}</p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">{stats?.avgLatencyMs || '<50'}ms</span>
          </div>
          <p className="text-sm text-white/80">{t('authorization.stats.avgDecisionTime')}</p>
        </div>
      </motion.div>

      {/* {t('authorization.profile.title')} */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{t('authorization.profile.title')}</h3>
            <div className="text-xs text-slate-600">
              {t('authorization.profile.subtitle')} <EducationalTooltip term="ABAC">ABAC</EducationalTooltip> {t('authorization.profile.decisions')}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Clearance Level Visualization */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <div className="text-sm font-semibold text-slate-900">
                <EducationalTooltip term="Clearance">Clearance Level</EducationalTooltip>
              </div>
            </div>
            <div className="space-y-2">
              {clearanceLevels.map((level, idx) => (
                <div
                  key={level}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    idx <= currentClearanceIndex
                      ? 'bg-blue-100 border border-blue-300'
                      : 'bg-slate-100 border border-slate-200 opacity-50'
                  }`}
                >
                  {idx <= currentClearanceIndex ? (
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Lock className="w-4 h-4 text-slate-400" />
                  )}
                  <span className={`text-xs font-medium ${
                    idx <= currentClearanceIndex ? 'text-blue-900' : 'text-slate-500'
                  }`}>
                    {level}
                  </span>
                  {level === userClearance && (
                    <span className="ml-auto text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">
                      {t('authorization.profile.current')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Country */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-5 h-5 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-900">{t('authorization.profile.countryOfAffiliation')}</p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <span className="text-3xl">{
                { USA: '🇺🇸', DEU: '🇩🇪', FRA: '🇫🇷', GBR: '🇬🇧', CAN: '🇨🇦' }[userCountry] || '🌐'
              }</span>
              <div>
                <p className="text-sm font-bold text-slate-900">{userCountry}</p>
                <div className="text-xs text-slate-600">
                  <EducationalTooltip term="Releasability">{t('authorization.profile.releasabilityTerm')}</EducationalTooltip> {t('authorization.profile.releasabilityChecked')}
                </div>
              </div>
            </div>
          </div>

          {/* COI Memberships */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-purple-600" />
              <div className="text-sm font-semibold text-slate-900">
                <EducationalTooltip term="COI">{t('authorization.profile.coiMemberships')}</EducationalTooltip>
              </div>
            </div>
            {userCOI.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {userCOI.map((coi) => (
                  <div
                    key={coi}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200"
                  >
                    <CheckCircle2 className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-medium text-purple-900">{coi}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-center">
                <p className="text-xs text-slate-500">No COI memberships</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* How Authorization Works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 p-6 shadow-lg"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900 mb-2">How Authorization Works</h3>
            <div className="text-sm text-slate-600 leading-relaxed mb-4">
              Every resource access is evaluated by <EducationalTooltip term="OPA">OPA</EducationalTooltip> using{' '}
              <EducationalTooltip term="Rego">Rego</EducationalTooltip> policies.
              The <EducationalTooltip term="PDP">PDP</EducationalTooltip> checks your attributes against resource requirements.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-white border border-purple-200">
                <ShieldCheck className="w-6 h-6 text-purple-600" />
                <span className="text-xs font-medium text-slate-700 text-center">Clearance Check</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-white border border-purple-200">
                <Globe className="w-6 h-6 text-purple-600" />
                <span className="text-xs font-medium text-slate-700 text-center">Releasability</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-white border border-purple-200">
                <Users className="w-6 h-6 text-purple-600" />
                <span className="text-xs font-medium text-slate-700 text-center">COI Match</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-white border border-purple-200">
                <Clock className="w-6 h-6 text-purple-600" />
                <span className="text-xs font-medium text-slate-700 text-center">Embargo Check</span>
              </div>
            </div>

            <Link
              href="/policies/sandbox"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm font-medium hover:from-purple-600 hover:to-pink-700 transition-all shadow-lg"
            >
              <Play className="w-4 h-4" />
              Try Policy Sandbox
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Recent Authorization Decisions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Recent Authorization Decisions</h3>
              <p className="text-xs text-slate-600">Your access attempts and their outcomes</p>
            </div>
          </div>
          <Link
            href="/activity"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            View all
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {decisions.length > 0 ? (
          <div className="space-y-2">
            {displayedDecisions.map((decision, idx) => (
              <motion.div
                key={`${decision.timestamp}-${decision.resourceId}-${idx}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * idx }}
                className={`flex items-center gap-4 p-4 rounded-xl border ${
                  decision.decision === 'allow'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                {decision.decision === 'allow' ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600" />
                )}

                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{decision.resourceId}</p>
                  <p className="text-xs text-slate-600">{decision.reason}</p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    {new Date(decision.timestamp).toLocaleTimeString()}
                  </p>
                  {decision.evaluationMs && (
                    <p className="text-xs text-slate-400">{decision.evaluationMs}ms</p>
                  )}
                </div>
              </motion.div>
            ))}

            {decisions.length > 5 && (
              <button
                onClick={() => setShowAllDecisions(!showAllDecisions)}
                className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {showAllDecisions ? 'Show less' : `Show ${decisions.length - 5} more`}
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No authorization decisions recorded yet</p>
            <p className="text-xs mt-1">Access resources to see your authorization history</p>
          </div>
        )}
      </motion.div>

      {/* Top Deny Reasons (if any) */}
      {stats?.topDenyReasons && stats.topDenyReasons.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Top Deny Reasons</h3>
              <p className="text-xs text-slate-600">Most common reasons for access denial</p>
            </div>
          </div>

          <div className="space-y-2">
            {stats.topDenyReasons.slice(0, 5).map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200"
              >
                <span className="text-sm font-medium text-amber-900">{item.reason}</span>
                <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default DashboardAuthorization;
