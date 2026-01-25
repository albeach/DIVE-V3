/**
 * Dashboard Overview Tab Component
 *
 * Main overview view with feature showcase cards,
 * educational content, and quick actions.
 */

'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  FileText,
  Globe,
  ShieldCheck,
  Upload,
  BookOpen,
  Lock,
  CheckCircle2,
  Eye,
  Key,
  Scale,
  Activity,
  Zap,
  Award,
  ArrowRight,
  Sparkles,
  Code,
} from 'lucide-react';
import { FeatureShowcaseCard } from './feature-showcase-card';
import { EducationalTooltip } from './educational-tooltip';
import { useTranslation } from '@/hooks/useTranslation';

interface IdP {
  alias: string;
  displayName: string;
  protocol: 'oidc' | 'saml';
  enabled: boolean;
}

interface DashboardOverviewProps {
  idps: IdP[];
  stats: {
    documentsAccessible?: number;
    authorizationRate?: string;
    policyCount?: number;
    federationPartners?: number;
    encryptedResources?: number;
  };
  loading?: boolean;
  userRoles?: string[];
  isFederated?: boolean;
}

export function DashboardOverview({ idps, stats, loading = false, userRoles = [], isFederated = false }: DashboardOverviewProps) {
  const { t } = useTranslation('dashboard');

  // Check if user has admin role
  const isAdmin = userRoles.includes('admin') || userRoles.includes('realm-admin') || userRoles.includes('federation-admin');

  // Define features with conditional ordering based on federation status
  const allFeatures = [
    {
      id: 'browse-documents',
      title: t('overview.features.browseDocuments.title'),
      description: t('overview.features.browseDocuments.description'),
      educational: t('overview.features.browseDocuments.educational'),
      icon: <FileText className="w-7 h-7 text-white" />,
      href: '/resources',
      gradient: 'from-blue-500 to-indigo-600',
      size: 'large' as const,
      priority: isFederated ? 2 : 1, // Higher priority for home users
      stats: [
        { label: t('overview.features.browseDocuments.stats.accessible'), value: stats.documentsAccessible || 0 },
        { label: t('overview.features.browseDocuments.stats.authRate'), value: stats.authorizationRate || '100%' },
      ],
      badges: [
        t('overview.features.browseDocuments.badges.policyEnforced'),
        t('overview.features.browseDocuments.badges.endToEndEncrypted'),
        t('overview.features.browseDocuments.badges.auditLogged')
      ],
    },
    // Federation Network - Higher priority for federated users
    ...(isAdmin ? [{
      id: 'federation-network',
      title: t('overview.features.federationNetwork.title'),
      description: t('overview.features.federationNetwork.description'),
      educational: t('overview.features.federationNetwork.educational'),
      icon: <Globe className="w-7 h-7 text-white" />,
      href: '/admin/federation',
      gradient: 'from-emerald-500 to-teal-600',
      size: 'medium' as const,
      priority: isFederated ? 1 : 3, // Much higher priority for federated users
      stats: [
        { label: t('overview.features.federationNetwork.stats.partners'), value: stats.federationPartners || idps.length },
      ],
    }] : []),
    {
      id: 'upload-document',
      title: t('overview.features.uploadDocument.title'),
      description: t('overview.features.uploadDocument.description'),
      educational: t('overview.features.uploadDocument.educational'),
      icon: <Upload className="w-7 h-7 text-white" />,
      href: '/upload',
      gradient: 'from-cyan-500 to-blue-600',
      size: 'medium' as const,
      priority: isFederated ? 4 : 2, // Higher priority for home users
      badges: [t('overview.features.uploadDocument.badges.ztdfEncryption')],
    },
    {
      id: 'authorization-policies',
      title: t('overview.features.authorizationPolicies.title'),
      description: t('overview.features.authorizationPolicies.description'),
      educational: t('overview.features.authorizationPolicies.educational'),
      icon: <ShieldCheck className="w-7 h-7 text-white" />,
      href: '/policies',
      gradient: 'from-purple-500 to-pink-600',
      size: 'medium' as const,
      priority: isFederated ? 3 : 3, // Equal priority
      stats: [
        { label: t('overview.features.authorizationPolicies.stats.policies'), value: stats.policyCount || 41 },
      ],
    },
    {
      id: 'integration-guide',
      title: t('overview.features.integrationGuide.title'),
      description: t('overview.features.integrationGuide.description'),
      educational: t('overview.features.integrationGuide.educational'),
      icon: <BookOpen className="w-7 h-7 text-white" />,
      href: '/integration/federation-vs-object',
      gradient: 'from-amber-500 to-orange-600',
      size: 'medium' as const,
      priority: 5,
      isNew: true,
    },
    {
      id: 'api-documentation',
      title: t('overview.features.apiDocumentation.title'),
      description: t('overview.features.apiDocumentation.description'),
      educational: t('overview.features.apiDocumentation.educational'),
      icon: <Code className="w-7 h-7 text-white" />,
      href: '/api-docs',
      gradient: 'from-indigo-500 to-purple-600',
      size: 'medium' as const,
      priority: 6,
      stats: [
        { label: 'endpoints', value: '50+' },
      ],
      badges: ['OpenAPI 3.0', 'Interactive'],
      isNew: true,
    },
    {
      id: 'kas-encryption',
      title: t('overview.features.kasEncryption.title'),
      description: t('overview.features.kasEncryption.description'),
      educational: t('overview.features.kasEncryption.educational'),
      icon: <Key className="w-7 h-7 text-white" />,
      href: '/kas',
      gradient: 'from-rose-500 to-red-600',
      size: 'medium' as const,
      priority: 7,
      stats: [
        { label: t('overview.features.kasEncryption.stats.encrypted'), value: stats.encryptedResources || 0 },
      ],
    },
    {
      id: 'compliance',
      title: t('overview.features.compliance.title'),
      description: t('overview.features.compliance.description'),
      educational: t('overview.features.compliance.educational'),
      icon: <Scale className="w-7 h-7 text-white" />,
      href: '/compliance',
      gradient: 'from-violet-500 to-purple-600',
      size: 'medium' as const,
      priority: 8,
    },
  ];

  // Sort features by priority (lower number = higher priority)
  const features = allFeatures.sort((a, b) => (a.priority || 99) - (b.priority || 99));

  return (
    <div className="space-y-8">
      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {features.map((feature, idx) => (
          <FeatureShowcaseCard
            key={feature.title}
            {...feature}
            delay={idx}
          />
        ))}
      </div>

      {/* Educational Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* How DIVE V3 Works */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{t('overview.sections.howDiveWorks.title')}</h3>
              <p className="text-xs text-slate-600">{t('overview.sections.howDiveWorks.subtitle')}</p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
              <div>
                <p className="font-semibold text-slate-900">{t('overview.sections.howDiveWorks.steps.federatedAuth.title')}</p>
                <div className="text-xs mt-1">
                  {t('overview.sections.howDiveWorks.steps.federatedAuth.description')}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
              <div>
                <p className="font-semibold text-slate-900">{t('overview.sections.howDiveWorks.steps.policyEval.title')}</p>
                <div className="text-xs mt-1">
                  {t('overview.sections.howDiveWorks.steps.policyEval.description')}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
              <div>
                <p className="font-semibold text-slate-900">{t('overview.sections.howDiveWorks.steps.secureAccess.title')}</p>
                <div className="text-xs mt-1">
                  {t('overview.sections.howDiveWorks.steps.secureAccess.description')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Tips */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">{t('overview.sections.quickTips.title')}</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <Award className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{t('overview.sections.quickTips.tips.readOnlyAttributes.title')}</p>
                <div className="text-xs text-slate-600 mt-1">
                  {t('overview.sections.quickTips.tips.readOnlyAttributes.description')}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <Award className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{t('overview.sections.quickTips.tips.auditLogging.title')}</p>
                <div className="text-xs text-slate-600 mt-1">
                  {t('overview.sections.quickTips.tips.auditLogging.description')}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <Award className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">{t('overview.sections.quickTips.tips.crossPartner.title')}</p>
                <p className="text-xs text-slate-600 mt-1">
                  {t('overview.sections.quickTips.tips.crossPartner.description')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Federation Partners Preview */}
      {idps.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Globe className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{t('overview.sections.federationPartners.title')}</h3>
                <p className="text-xs text-slate-600">{idps.length} {t('overview.sections.federationPartners.providersAvailable')}</p>
              </div>
            </div>
            <Link
              href="/admin/federation"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              {t('overview.sections.federationPartners.viewAll')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {idps.slice(0, 8).map((idp) => (
              <div
                key={idp.alias}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg ${
                  idp.protocol === 'oidc'
                    ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                    : 'bg-gradient-to-br from-purple-500 to-pink-600'
                } flex items-center justify-center`}>
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{idp.displayName}</p>
                  <p className="text-xs text-slate-500">{idp.protocol.toUpperCase()}</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* System Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">{t('overview.sections.systemStatus.title')}</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { name: t('overview.sections.systemStatus.services.opaEngine'), status: t('overview.sections.systemStatus.status.operational') },
            { name: t('overview.sections.systemStatus.services.keycloakAuth'), status: t('overview.sections.systemStatus.status.operational') },
            { name: t('overview.sections.systemStatus.services.resourceApi'), status: t('overview.sections.systemStatus.status.operational') },
          ].map((service, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">{service.name}</span>
              </div>
              <span className="text-xs font-bold text-green-700">{service.status}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default DashboardOverview;
