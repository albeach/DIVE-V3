'use client';

/**
 * Multi-KAS Architecture Dashboard
 *
 * Modern 2025 UX for visualizing coalition-scalable Multi-KAS architecture.
 * Fetches LIVE data from MongoDB (SSOT) via the backend API.
 *
 * Features:
 * - Real-time KAS health and metrics
 * - Circuit breaker status
 * - Federation trust visualization
 * - Response time percentiles
 * - Auto-refresh every 30 seconds
 *
 * @version 2.0.0 (Refactored for MongoDB SSOT)
 * @date 2026-01-16
 */

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocale } from '@/contexts/LocaleContext';
import { motion } from 'framer-motion';
import { fadeVariants, staggerContainerVariants, staggerItemVariants, defaultTransition } from '@/lib/animations';
import {
  Key,
  Shield,
  Zap,
  Activity,
  Globe,
  Lock,
  ArrowRight,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  AlertCircle
} from 'lucide-react';

// Import new KAS components
import { KASGrid, KASMetricsPanel, KASSummaryBar } from '@/components/kas';
import {
  IMultiKASData,
  IKASEndpoint,
  fetchMultiKASData,
  KAS_POLLING_INTERVAL
} from '@/lib/api/kas';

export default function MultiKasPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useTranslation('compliance');
  const { locale } = useLocale();

  const [multiKasData, setMultiKasData] = useState<IMultiKASData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKAS, setSelectedKAS] = useState<string | null>(null);
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login');
    }
  }, [status, session, router]);

  // Fetch Multi-KAS data from MongoDB backend
  const fetchData = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true);
    }

    try {
      const data = await fetchMultiKASData();
      setMultiKasData(data);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Multi-KAS data');
      console.error('Error fetching Multi-KAS:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    if (status === 'loading') return;
    if (!session) return;

    // Initial fetch
    fetchData();

    // Set up polling for real-time updates
    const pollInterval = setInterval(() => {
      fetchData(true);
    }, KAS_POLLING_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [session, status, fetchData]);

  // Manual refresh handler
  const handleRefresh = () => {
    fetchData(true);
  };

  // Get selected KAS instance
  const selectedKasInstance = selectedKAS
    ? multiKasData?.kasEndpoints.find(k => k.id === selectedKAS)
    : null;

  // Loading state with modern skeleton
  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-blue-200 border-t-blue-600 mx-auto"></div>
            <Key className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="mt-6 text-gray-600 font-semibold">{t('multiKas.loading')}</p>
          <p className="text-sm text-gray-500 mt-2">{t('multiKas.loadingSubtitle')}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const benefitIcons: Record<string, React.ReactNode> = {
    'Instant Coalition Growth': <Zap className="w-6 h-6 text-yellow-500" />,
    'National Key Sovereignty': <Shield className="w-6 h-6 text-blue-600" />,
    'Policy-Driven Access': <Activity className="w-6 h-6 text-green-600" />,
    'Zero Re-encryption': <TrendingUp className="w-6 h-6 text-purple-600" />,
  };

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: t('breadcrumbs.compliance'), href: '/compliance' },
        { label: t('breadcrumbs.multiKas'), href: null }
      ]}
    >
      {/* Hero Section */}
      <motion.div 
        className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-2xl p-8 md:p-12 mb-8 shadow-2xl"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={defaultTransition}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 30% 50%, white 2px, transparent 2px)`,
            backgroundSize: '60px 60px'
          }} />
        </div>

        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl">
                <Key className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
                  {multiKasData?.title || t('multiKas.title')}
                </h1>
                <p className="text-blue-100 text-lg max-w-3xl">
                  {multiKasData?.description || t('multiKas.description')}
                </p>
              </div>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-xl
                bg-white/20 backdrop-blur-sm text-white
                hover:bg-white/30 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <RefreshCcw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm font-semibold">
                {isRefreshing ? t('multiKas.refreshing') : t('multiKas.refresh')}
              </span>
            </button>
          </div>

          {/* Live Data Badge */}
          <div className="flex items-center gap-3 mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 backdrop-blur-sm rounded-full">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm text-green-100 font-semibold">{t('multiKas.liveFromMongoDB')}</span>
            </div>
            {lastRefresh && (
              <span className="text-sm text-blue-200">
                {t('multiKas.updated', { time: new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(lastRefresh) })}
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div 
          className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-6 mb-6 flex items-start gap-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={defaultTransition}
        >
          <AlertCircle className="w-6 h-6 text-red-500 dark:text-red-400 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-red-800 dark:text-red-200">{t('multiKas.errorTitle')}</h3>
            <p className="text-red-700 dark:text-red-300">{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-800/50 text-red-800 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-700/50 transition-colors text-sm font-semibold"
            >
              {t('multiKas.retry')}
            </button>
          </div>
        </motion.div>
      )}

      {/* Summary Bar */}
      {multiKasData?.summary && (
        <KASSummaryBar
          summary={multiKasData.summary}
          timestamp={multiKasData.timestamp}
          isLoading={loading}
        />
      )}

      {/* How Multi-KAS Works Accordion */}
      <div className="mb-8">
        <button
          onClick={() => setIsAccordionOpen(!isAccordionOpen)}
          className="w-full bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200 hover:border-blue-400 transition-all hover:shadow-lg group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">
                {t('multiKas.howItWorks.title')}
              </h2>
              <span className="px-3 py-1 bg-blue-200 text-blue-800 text-xs font-bold rounded-full">
                {t('multiKas.technicalDetails')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-600 font-semibold group-hover:text-blue-700">
                {isAccordionOpen ? t('multiKas.hideDetails') : t('multiKas.showDetails')}
              </span>
              {isAccordionOpen ? (
                <ChevronUp className="w-6 h-6 text-blue-600 group-hover:text-blue-700 transition-transform" />
              ) : (
                <ChevronDown className="w-6 h-6 text-blue-600 group-hover:text-blue-700 transition-transform group-hover:translate-y-0.5" />
              )}
            </div>
          </div>
        </button>

        {/* Accordion Content */}
        <div
          className={`overflow-hidden transition-all duration-500 ease-in-out ${
            isAccordionOpen ? 'max-h-[2000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200 space-y-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200 hover:shadow-md transition-shadow">
              <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="text-2xl">📤</span>
                1. {t('multiKas.howItWorks.uploadPhase.title')}
              </h3>
              <p className="text-sm text-gray-700">
                {t('multiKas.howItWorks.uploadPhase.description')}
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-200 hover:shadow-md transition-shadow">
              <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="text-2xl">🔍</span>
                2. {t('multiKas.howItWorks.accessPhase.title')}
              </h3>
              <p className="text-sm text-gray-700">
                {t('multiKas.howItWorks.accessPhase.description')}
              </p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-200 hover:shadow-md transition-shadow">
              <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <span className="text-2xl">🗄️</span>
                3. {t('multiKas.howItWorks.mongoDBSSOT.title')}
              </h3>
              <p className="text-sm text-gray-700">
                {t('multiKas.howItWorks.mongoDBSSOT.description')}
              </p>
            </div>

            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border-2 border-green-300">
              <p className="text-sm text-gray-800">
                <strong className="text-green-800">{t('multiKas.howItWorks.dataSource.title')}</strong> {t('multiKas.howItWorks.dataSource.description')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KAS Endpoints Grid (Live from MongoDB) */}
      {multiKasData && (
        <KASGrid
          kasEndpoints={multiKasData.kasEndpoints}
          selectedKasId={selectedKAS}
          onSelectKas={setSelectedKAS}
          isLoading={loading}
          title={t('multiKas.grid.title')}
          subtitle={t('multiKas.grid.subtitle')}
        />
      )}

      {/* Selected KAS Detailed Panel */}
      {selectedKasInstance && (
        <KASMetricsPanel kas={selectedKasInstance} />
      )}

      {/* Architecture Flow Diagram */}
      {multiKasData?.flowSteps && multiKasData.flowSteps.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
            <Globe className="w-7 h-7 text-indigo-600" />
            {t('multiKas.flow.title')}
          </h2>
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-8 border-2 border-gray-300 shadow-inner overflow-x-auto">
            <div className="flex flex-wrap items-center justify-center gap-6 min-w-max">
              {multiKasData.flowSteps.map((flowStep, idx) => (
                <div key={flowStep.step} className="flex items-center gap-6">
                  {/* Step Card */}
                  <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-blue-200 w-64 hover:scale-105 transition-transform">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                        {flowStep.step}
                      </div>
                      <h3 className="font-bold text-gray-900 text-sm leading-tight">
                        {flowStep.title}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {flowStep.description}
                    </p>
                  </div>

                  {/* Arrow */}
                  {idx < multiKasData.flowSteps.length - 1 && (
                    <ArrowRight className="w-8 h-8 text-blue-400 flex-shrink-0 animate-pulse" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Example Scenario */}
      {multiKasData?.exampleScenario && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
            <Lock className="w-7 h-7 text-purple-600" />
            {t('multiKas.example.title')}
          </h2>
          <div className="bg-white rounded-xl p-6 border-2 border-purple-200 shadow-lg">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {multiKasData.exampleScenario.title}
              </h3>
              <div className="flex flex-wrap gap-3 mb-4">
                <span className="px-4 py-2 rounded-lg text-sm font-bold bg-orange-100 text-orange-800 border-2 border-orange-300">
                  {multiKasData.exampleScenario.classification}
                </span>
                <span className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-100 text-blue-800">
                  {t('multiKas.example.kaoCount', { count: multiKasData.exampleScenario.kaoCount })}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">{t('multiKas.example.releasableTo')}</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(multiKasData.exampleScenario.releasabilityTo)).map((country) => (
                      <span key={country} className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                        {country}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">{t('multiKas.example.communitiesOfInterest')}</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(multiKasData.exampleScenario.COI)).map((coi) => (
                      <span key={coi} className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                        {coi}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h4 className="font-bold text-gray-900 mb-4">{t('multiKas.example.keyAccessObjects')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {multiKasData.exampleScenario.kaos.map((kao, idx) => (
                  <div key={kao.id} className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-indigo-600 rounded-lg">
                        <Key className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{t('multiKas.example.kaoNumber', { number: idx + 1 })}</p>
                        <p className="text-xs text-gray-600">{kao.coi}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-gray-600">{t('multiKas.example.kasEndpoint')}</p>
                        <p className="text-xs font-mono font-bold text-indigo-700">{kao.kasEndpoint}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">{t('multiKas.example.wrappedKey')}</p>
                        <p className="text-xs font-mono bg-white px-2 py-1 rounded border border-gray-300 truncate">
                          {kao.wrappedKey}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Benefits Section */}
      {multiKasData?.benefits && multiKasData.benefits.length > 0 && (
        <motion.div 
          className="mb-8"
          initial="hidden"
          animate="visible"
          variants={staggerContainerVariants}
        >
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
            <Zap className="w-7 h-7 text-yellow-500" />
            {t('multiKas.benefits.title')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {multiKasData.benefits.map((benefit) => (
              <motion.div 
                key={benefit.title} 
                className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-gray-200 dark:border-gray-700 shadow-md hover:shadow-xl transition-all"
                variants={staggerItemVariants}
                whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl">
                    {benefitIcons[benefit.title] || <Zap className="w-6 h-6 text-white" />}
                  </div>
                  <span className="text-3xl" role="img" aria-label={benefit.title}>{benefit.icon}</span>
                </div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">{benefit.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Footer with data source info */}
      <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
        <p className="text-sm text-gray-600">
          {t('multiKas.footer.dataSource', { collections: t('multiKas.footer.collections') })}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {t('multiKas.autoRefreshInterval', { seconds: 30 })} | {t('multiKas.lastUpdated', {
            time: lastRefresh ? new Intl.DateTimeFormat(locale, {
              dateStyle: 'short',
              timeStyle: 'short'
            }).format(lastRefresh) : 'Loading...'
          })}
        </p>
      </div>
    </PageLayout>
  );
}
