/**
 * Modern Dashboard - 2025 UX/UI Design Patterns
 *
 * Completely revamped with:
 * - Tabbed navigation (Overview, Federation, Authorization, Resources, Activity)
 * - Ambient background effects (light theme)
 * - Educational content with tooltips
 * - Personal analytics and insights
 * - Feature showcase cards
 * - Real-time updates
 * - Framer Motion animations
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPseudonymFromUser } from '@/lib/pseudonym-generator';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocale } from '@/contexts/LocaleContext';
import {
  ShieldCheck,
  Globe,
  Users,
  Clock,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  RefreshCw,
  BookOpen,
  Info,
  Home,
} from 'lucide-react';

// Import tab components
import { DashboardTabs, type DashboardTab } from './dashboard-tabs';
import { DashboardOverview } from './dashboard-overview';
import { DashboardFederation } from './dashboard-federation';
import { DashboardAuthorization } from './dashboard-authorization';
import { DashboardResources } from './dashboard-resources';
import { DashboardActivity } from './dashboard-activity';
import { GlossaryPopover } from './educational-tooltip';
import { getNationalClearance } from '@/components/navigation/nav-config';
import { CountUpNumber } from '@/components/ui/countup-number';
import { CountryAvatar } from '@/components/ui/country-avatar';
import { getTimeBasedGreeting } from '@/utils/greeting';

interface User {
  uniqueID?: string;
  clearance?: string;
  countryOfAffiliation?: string;
  acpCOI?: string[];
  name?: string;
  email?: string;
  roles?: string[];
}

// Country flag emoji map - All 32 NATO countries + partners
const countryFlags: Record<string, string> = {
  // Founding NATO (1949)
  USA: '🇺🇸', BEL: '🇧🇪', CAN: '🇨🇦', DNK: '🇩🇰', FRA: '🇫🇷',
  ISL: '🇮🇸', ITA: '🇮🇹', LUX: '🇱🇺', NLD: '🇳🇱', NOR: '🇳🇴',
  PRT: '🇵🇹', GBR: '🇬🇧',
  // Cold War expansion
  GRC: '🇬🇷', TUR: '🇹🇷', DEU: '🇩🇪', ESP: '🇪🇸',
  // Post-Cold War
  CZE: '🇨🇿', HUN: '🇭🇺', POL: '🇵🇱',
  // 2004 expansion
  BGR: '🇧🇬', EST: '🇪🇪', LVA: '🇱🇻', LTU: '🇱🇹',
  ROU: '🇷🇴', SVK: '🇸🇰', SVN: '🇸🇮',
  // 2009-2023 expansion
  ALB: '🇦🇱', HRV: '🇭🇷', MNE: '🇲🇪', MKD: '🇲🇰', FIN: '🇫🇮', SWE: '🇸🇪',
  // Partners
  AUS: '🇦🇺', NZL: '🇳🇿', JPN: '🇯🇵', KOR: '🇰🇷',
};

// Country full names
const countryNames: Record<string, string> = {
  USA: 'United States',
  DEU: 'Germany',
  FRA: 'France',
  GBR: 'United Kingdom',
  CAN: 'Canada',
  ITA: 'Italy',
  NLD: 'Netherlands',
  POL: 'Poland',
  ESP: 'Spain',
  AUS: 'Australia',
  NZL: 'New Zealand',
};

interface Session {
  user?: User;
}

interface DashboardModernProps {
  user?: User;
  session?: Session;
}

interface IdP {
  alias: string;
  displayName: string;
  protocol: 'oidc' | 'saml';
  enabled: boolean;
}

interface QuickStat {
  value: string | number;
  label: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

interface DashboardData {
  idps: IdP[];
  quickStats: QuickStat[];
  topDenyReasons?: Array<{ reason: string; count: number }>;
  decisionsByCountry?: Record<string, number>;
  details?: any;
}

export function DashboardModern({ user, session }: DashboardModernProps) {
  const { t } = useTranslation('dashboard');
  const { locale } = useLocale();

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [data, setData] = useState<DashboardData>({
    idps: [],
    quickStats: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showGlossary, setShowGlossary] = useState(false);

  // Fetch dashboard data
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

      try {
        // Use Next.js API route proxy instead of calling backend directly (avoids CORS issues)
        const idpResponse = await fetch('/api/idps/public');
      const idpData = idpResponse.ok ? await idpResponse.json() : { idps: [] };

      // Fetch stats
        let statsData: any = null;
        if (user && session) {
          try {
            const statsResponse = await fetch('/api/dashboard/stats', {
              credentials: 'include',
              cache: 'no-store',
            });
            if (statsResponse.ok) {
              statsData = await statsResponse.json();
          }
        } catch (authError) {
          console.debug('Authenticated stats unavailable:', authError);
        }
      }

        if (!statsData) {
          const statsResponse = await fetch('/api/dashboard/stats/public');
          if (statsResponse.ok) {
            statsData = await statsResponse.json();
          }
        }

      setData({
        idps: idpData.idps || [],
        quickStats: statsData?.stats || [
          { value: '0', label: t('stats.documentsAccessible'), trend: 'neutral' },
          { value: '100%', label: t('stats.authorizationRate'), trend: 'neutral' },
          { value: '<50ms', label: t('stats.avgResponseTime'), trend: 'up' },
        ],
        topDenyReasons: statsData?.details?.topDenyReasons,
        decisionsByCountry: statsData?.details?.decisionsByCountry,
        // Add all the new real data fields
        details: statsData?.details,
      });
      setLastRefresh(new Date());
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      setRefreshing(false);
    }
  }, [user, session]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);

    // Auto-refresh every 30 seconds
    const refreshTimer = setInterval(() => fetchData(true), 30000);

    return () => {
      clearInterval(timer);
      clearInterval(refreshTimer);
    };
  }, [fetchData]);

  const pseudonym = getPseudonymFromUser((user || {}) as any);
  const clearanceLevel = user?.clearance || 'UNCLASSIFIED';
  const country = user?.countryOfAffiliation || 'Unknown';
  const coi = user?.acpCOI || [];

  // Instance identification
  const currentInstance = process.env.NEXT_PUBLIC_INSTANCE || 'USA';
  const instanceFlag = countryFlags[currentInstance] || '🌐';
  const instanceName = countryNames[currentInstance] || currentInstance;

  // Federation detection
  const userHomeCountry = country;
  const userHomeFlag = countryFlags[userHomeCountry] || '🌐';
  const userHomeName = countryNames[userHomeCountry] || userHomeCountry;
  const isFederated = userHomeCountry !== currentInstance && userHomeCountry !== 'Unknown';

  return (
    <div className="relative min-h-screen">
      {/* Ambient Background Effects (Light Theme) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-gradient-to-br from-blue-100/40 to-indigo-100/40 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-0 w-[500px] h-[500px] bg-gradient-to-br from-emerald-100/40 to-teal-100/40 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-gradient-to-br from-purple-100/30 to-pink-100/30 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Instance Banner - Enhanced Modern 2026 Glassmorphism Design */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl"
        >
          {/* Mesh gradient background - enhanced */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-600/25 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-violet-600/20 via-transparent to-transparent" />

          {/* Animated grain texture */}
          <div className="absolute inset-0 opacity-[0.015]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }} />

          {/* Glowing orb accent - enhanced */}
          <motion.div
            className="absolute -top-12 -right-12 w-40 h-40 bg-blue-500/40 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.4, 0.5, 0.4],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="absolute -bottom-8 left-1/3 w-32 h-32 bg-violet-500/30 rounded-full blur-2xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.4, 0.3],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1
            }}
          />

          {/* Content */}
          <div className="relative z-10 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Left: Instance info with enhanced styling */}
              <div className="flex items-center gap-4">
                {/* Flag with enhanced glassmorphism container */}
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-white/5 rounded-xl blur-md" />
                  <div className="relative w-16 h-16 rounded-xl bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl shadow-black/30">
                    <span className="text-4xl">{instanceFlag}</span>
                  </div>
                  {/* Enhanced active pulse indicator */}
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <motion.span
                      className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
                      animate={{ scale: [1, 1.4, 1], opacity: [0.75, 0, 0.75] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                    />
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-emerald-400 shadow-lg shadow-emerald-500/50" />
                  </span>
                </motion.div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">{t('instance')}</span>
                    <span className="h-px w-10 bg-gradient-to-r from-slate-500/60 to-transparent" />
                  </div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-white to-slate-300 bg-clip-text text-transparent">
                    {instanceName} Portal
                  </h2>
                </div>
              </div>

              {/* Right: Enhanced Federation status with improved visual hierarchy */}
              {isFederated ? (
                <motion.div
                  className="group flex items-center gap-3 px-5 py-3 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 backdrop-blur-md border-2 border-amber-500/30 hover:border-amber-500/50 transition-all cursor-default shadow-lg shadow-amber-500/20"
                  whileHover={{ scale: 1.03 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  animate={{
                    borderColor: ['rgba(245, 158, 11, 0.3)', 'rgba(245, 158, 11, 0.5)', 'rgba(245, 158, 11, 0.3)'],
                  }}
                  style={{ animationDuration: '3s', animationIterationCount: 'infinite' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl drop-shadow-lg">{userHomeFlag}</span>
                    <motion.div
                      animate={{ x: [0, 4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <ArrowRight className="w-4 h-4 text-amber-300 drop-shadow-lg" />
                    </motion.div>
                    <span className="text-2xl drop-shadow-lg">{instanceFlag}</span>
                  </div>
                  <div className="h-8 w-px bg-gradient-to-b from-transparent via-amber-400/40 to-transparent" />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300 drop-shadow-md">{t('federation.federated')}</p>
                    <p className="text-sm font-bold text-white drop-shadow-md">via <span className="text-amber-200">{userHomeName}</span></p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  className="group flex items-center gap-3 px-5 py-3 rounded-full bg-gradient-to-r from-emerald-500/15 to-teal-500/15 backdrop-blur-md border-2 border-emerald-500/30 hover:border-emerald-500/50 transition-all cursor-default shadow-lg shadow-emerald-500/20"
                  whileHover={{ scale: 1.03 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-400/40 rounded-full blur-md" />
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <CheckCircle2 className="relative w-6 h-6 text-emerald-300 drop-shadow-lg" />
                    </motion.div>
                  </div>
                  <div className="h-8 w-px bg-gradient-to-b from-transparent via-emerald-400/40 to-transparent" />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 drop-shadow-md">{t('federation.directAccess')}</p>
                    <p className="text-sm font-bold text-white drop-shadow-md">{t('federation.homeInstance')}</p>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Enhanced bottom border glow */}
          <div className={`absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-${isFederated ? 'amber' : 'emerald'}-400/60 to-transparent`} />
        </motion.div>

        {/* Hero Section - Enhanced with Country Avatar and Dynamic Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`relative overflow-hidden rounded-2xl px-6 py-6 shadow-lg border ${
            isFederated
              ? 'bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-white border-amber-200/60'
              : 'bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white border-emerald-200/60'
          }`}
        >
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              {/* Left: Country Avatar */}
              <div className="flex-shrink-0">
                <CountryAvatar
                  countryCode={country}
                  size="lg"
                  clearance={clearanceLevel}
                  isFederated={isFederated}
                  showStatus={true}
                />
              </div>

              {/* Center: Greeting and Info */}
              <div className="flex-1 min-w-0">
                {/* Badge and Status */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {isFederated ? (
                    <motion.div
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100/90 border border-amber-300/60 text-amber-800"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span className="text-xs font-semibold">{t('federatedUser.badge')}</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100/90 border border-emerald-300/60 text-emerald-800"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <Home className="w-3.5 h-3.5" />
                      <span className="text-xs font-semibold">{t('homeUser.badge')}</span>
                    </motion.div>
                  )}

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100/80 border border-blue-200/60 text-blue-700 text-[11px] font-semibold">
                    <Sparkles className="w-3 h-3" />
                    {t('platformBadge')}
                  </div>

                  <span className="text-slate-400 text-xs hidden sm:inline">•</span>
                  <span className="text-slate-500 text-xs flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>

                {/* Dynamic Greeting */}
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
                    {t(getTimeBasedGreeting())},{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                      {pseudonym}
                    </span>
                  </h1>
                  {!isFederated && (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    >
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </motion.div>
                  )}
                </div>

                {/* Subtitle */}
                <p className="text-sm lg:text-base font-medium text-slate-600 mb-3">
                  {isFederated ? (
                    <>
                      {t('federatedUser.subtitle', {
                        homeCountry: userHomeName,
                        currentInstance: instanceName
                      })}
                    </>
                  ) : (
                    t('homeUser.subtitle')
                  )}
                </p>

                {/* Quick action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowGlossary(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors border border-slate-200"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {t('glossary')}
                  </button>
                  <button
                    onClick={() => fetchData(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium transition-colors border border-blue-200 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    {t('refresh')}
                  </button>
                </div>
              </div>

              {/* Right: Compact Identity badges */}
              <div className="flex flex-wrap sm:flex-col gap-2 sm:items-end">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-500 font-medium leading-none">{t('clearance')}</p>
                    <p className="text-sm font-bold text-slate-900 truncate">{getNationalClearance(clearanceLevel, country)}</p>
                  </div>
                </div>

                {coi.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 backdrop-blur-sm border border-slate-200 shadow-sm">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-500 font-medium leading-none">COI</p>
                      <p className="text-sm font-bold text-slate-900">{coi[0]}{coi.length > 1 ? ` +${coi.length - 1}` : ''}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Decorative gradient orbs */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-full blur-3xl pointer-events-none" />
          <div className={`absolute -bottom-8 -left-8 w-24 h-24 bg-gradient-to-br ${
            isFederated ? 'from-amber-400/20 to-orange-400/20' : 'from-emerald-400/20 to-teal-400/20'
          } rounded-full blur-2xl pointer-events-none`} />
        </motion.div>

      {/* Quick Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch"
        >
          {data.quickStats.map((stat, idx) => {
            // Check if this is the Documents Accessible metric
            const isDocumentsAccessible = stat.label === 'Documents Accessible';
            const numericValue = isDocumentsAccessible
              ? parseInt(stat.value.toString().replace(/[^0-9]/g, '')) || 0
              : (typeof stat.value === 'string' ? parseInt(stat.value.replace(/[^0-9]/g, '')) || 0 : stat.value as number);

            return (
              <div
                key={idx}
                className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-6 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col"
              >
                  <div className="flex items-start justify-between mb-2">
                  <div>
                    {isDocumentsAccessible ? (
                      <p className="text-3xl font-bold text-slate-900">
                        <CountUpNumber
                          value={numericValue as number}
                          duration={2.5}
                          delay={idx * 0.2}
                          animate={true}
                        />
                      </p>
                    ) : (
                      <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                    )}
                    <p className="text-sm text-slate-600 mt-1">{stat.label}</p>
                  </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                stat.trend === 'up' ? 'bg-green-100' : stat.trend === 'down' ? 'bg-red-100' : 'bg-slate-100'
              }`}>
                  {stat.trend === 'up' && <ArrowRight className="w-5 h-5 text-green-600 -rotate-45" />}
                  {stat.trend === 'down' && <ArrowRight className="w-5 h-5 text-red-600 rotate-45" />}
                  {stat.trend === 'neutral' && <ArrowRight className="w-5 h-5 text-slate-600" />}
              </div>
            </div>
            {stat.change && (
              <div className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${
                stat.trend === 'up' ? 'bg-green-50 text-green-700' :
                stat.trend === 'down' ? 'bg-red-50 text-red-700' :
                'bg-slate-50 text-slate-700'
              }`}>
                {stat.change}
              </div>
            )}

                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                </div>
              );
            })}
        </motion.div>

        {/* Tab Navigation */}
        <DashboardTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          badges={{
            authorization: data.topDenyReasons?.length ? data.topDenyReasons.reduce((acc, r) => acc + r.count, 0) : undefined,
          }}
        />

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'overview' && (
              <DashboardOverview
                idps={data.idps}
                stats={{
                  documentsAccessible: parseInt(data.quickStats[0]?.value?.toString() || '0') || 0,
                  authorizationRate: data.quickStats[1]?.value?.toString() || '100%',
                  policyCount: 41,
                  federationPartners: data.idps.length,
                }}
                loading={loading}
                userRoles={(session?.user as any)?.roles || []}
                isFederated={isFederated}
              />
            )}

            {activeTab === 'federation' && (
              <DashboardFederation
                idps={data.idps}
                userCountry={country}
                currentInstance={currentInstance}
                isFederated={isFederated}
                stats={{
                  crossPartnerAccesses: 0,
                  activeSessionsCount: 1,
                  authenticationsToday: 1,
                }}
              />
            )}

            {activeTab === 'authorization' && (
              <DashboardAuthorization
                decisions={data.details?.recentDecisions || []}
                stats={{
                  totalDecisions: data.details?.totalDecisions || 0,
                  allowedCount: data.details?.allowCount || 0,
                  deniedCount: data.details?.denyCount || 0,
                  avgLatencyMs: data.details?.avgResponseTime || 45,
                  topDenyReasons: data.details?.topDenyReasons,
                  decisionsByCountry: data.details?.decisionsByCountry,
                }}
                userClearance={clearanceLevel}
                userCountry={country}
                userCOI={coi}
              />
            )}

            {activeTab === 'resources' && (
              <DashboardResources
                stats={{
                  totalAccessible: data.details?.totalDocuments || parseInt(data.quickStats[0]?.value?.toString() || '0') || 0,
                  byClassification: {
                    UNCLASSIFIED: (data.details?.byClassification?.UNCLASSIFIED || 0),
                    CONFIDENTIAL: (data.details?.byClassification?.CONFIDENTIAL || 0),
                    SECRET: (data.details?.byClassification?.SECRET || 0),
                    TOP_SECRET: (data.details?.byClassification?.TOP_SECRET || 0)
                  },
                  recentlyAccessed: data.details?.recentlyAccessed || [],
                  uploadedByUser: data.details?.uploadedByUser || 0,
                }}
                userClearance={clearanceLevel}
                userCountry={country}
              />
            )}

            {activeTab === 'activity' && (
              <DashboardActivity
                auditEvents={data.details?.recentAuditEvents || []}
                complianceMetrics={data.details?.complianceMetrics || []}
                lastLogin={data.details?.lastLogin ? new Date(data.details.lastLogin).toISOString() : new Date().toISOString()}
                sessionCount={data.details?.sessionCount || 1}
              />
            )}
          </motion.div>
        </AnimatePresence>

      {/* Development Session Details */}
      {process.env.NODE_ENV === 'development' && session && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-lg"
          >
          <details className="group">
            <summary className="cursor-pointer flex items-center justify-between hover:text-emerald-400 transition-colors">
              <span className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
                  <Info className="w-4 h-4" />
                Session Details (Development Only)
              </span>
              <ArrowRight className="w-5 h-5 text-slate-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-4 rounded-xl bg-slate-800 p-4 overflow-auto max-h-96 border border-slate-700">
              <pre className="text-xs text-emerald-400 font-mono leading-relaxed">
                {JSON.stringify({
                  ...session,
                  user: {
                    ...session.user,
                    name: session.user?.name ? '*** REDACTED (PII) ***' : undefined,
                    email: session.user?.email ? '*** REDACTED (PII) ***' : undefined,
                    uniqueID: session.user?.uniqueID,
                    clearance: session.user?.clearance,
                    countryOfAffiliation: session.user?.countryOfAffiliation,
                    acpCOI: session.user?.acpCOI,
                  },
                }, null, 2)}
              </pre>
            </div>
          </details>
          </motion.div>
        )}
        </div>

      {/* Glossary Popover */}
      <GlossaryPopover
        isOpen={showGlossary}
        onClose={() => setShowGlossary(false)}
      />
    </div>
  );
}

export default DashboardModern;
