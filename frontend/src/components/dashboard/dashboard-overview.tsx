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
}

export function DashboardOverview({ idps, stats, loading = false }: DashboardOverviewProps) {
  const features = [
    {
      title: 'Browse Documents',
      description: 'Access classified resources securely',
      educational: 'Every document access is evaluated against OPA policies. Your clearance, country, and COI memberships determine what you can view.',
      icon: <FileText className="w-7 h-7 text-white" />,
      href: '/resources',
      gradient: 'from-blue-500 to-indigo-600',
      size: 'large' as const,
      stats: [
        { label: 'accessible', value: stats.documentsAccessible || 0 },
        { label: 'auth rate', value: stats.authorizationRate || '100%' },
      ],
      badges: ['Policy-Enforced', 'End-to-End Encrypted', 'Audit Logged'],
    },
    {
      title: 'Federation Network',
      description: 'Cross-partner identity federation',
      educational: 'Authenticate with your home IdP and access resources across coalition partners. Federation enables seamless collaboration while maintaining security.',
      icon: <Globe className="w-7 h-7 text-white" />,
      href: '/admin/federation',
      gradient: 'from-emerald-500 to-teal-600',
      size: 'medium' as const,
      stats: [
        { label: 'partners', value: stats.federationPartners || idps.length },
      ],
    },
    {
      title: 'Upload Document',
      description: 'Secure document upload',
      educational: 'Upload documents with automatic ZTDF encryption and ACP-240 compliant labeling. Set classification and releasability at upload time.',
      icon: <Upload className="w-7 h-7 text-white" />,
      href: '/upload',
      gradient: 'from-cyan-500 to-blue-600',
      size: 'medium' as const,
      badges: ['ZTDF Encryption'],
    },
    {
      title: 'Authorization Policies',
      description: 'OPA Rego policies',
      educational: 'Explore the modular policy suite powering DIVE\'s ABAC engine. View policy hierarchy, test decisions, and understand rule logic.',
      icon: <ShieldCheck className="w-7 h-7 text-white" />,
      href: '/policies',
      gradient: 'from-purple-500 to-pink-600',
      size: 'medium' as const,
      stats: [
        { label: 'policies', value: stats.policyCount || 41 },
      ],
    },
    {
      title: 'Integration Guide',
      description: 'ADatP-5663 × ACP-240',
      educational: 'Interactive tutorial explaining how identity federation (ADatP-5663) and access control (ACP-240) work together.',
      icon: <BookOpen className="w-7 h-7 text-white" />,
      href: '/integration/federation-vs-object',
      gradient: 'from-amber-500 to-orange-600',
      size: 'medium' as const,
      isNew: true,
    },
    {
      title: 'API Documentation',
      description: 'Interactive API reference',
      educational: 'Explore all DIVE V3 endpoints, test requests live, and view request/response examples. Perfect for developers integrating with the coalition ICAM platform.',
      icon: <Code className="w-7 h-7 text-white" />,
      href: '/api-docs',
      gradient: 'from-indigo-500 to-purple-600',
      size: 'medium' as const,
      stats: [
        { label: 'endpoints', value: '50+' },
      ],
      badges: ['OpenAPI 3.0', 'Interactive'],
      isNew: true,
    },
    {
      title: 'KAS Encryption',
      description: 'Key Access Service',
      educational: 'Policy-bound key release for encrypted content. KAS re-evaluates authorization before releasing decryption keys.',
      icon: <Key className="w-7 h-7 text-white" />,
      href: '/kas',
      gradient: 'from-rose-500 to-red-600',
      size: 'medium' as const,
      stats: [
        { label: 'encrypted', value: stats.encryptedResources || 0 },
      ],
    },
    {
      title: 'Compliance',
      description: 'NATO standards adherence',
      educational: 'Monitor compliance with ACP-240, STANAG 4774/5636, and other coalition security requirements.',
      icon: <Scale className="w-7 h-7 text-white" />,
      href: '/compliance',
      gradient: 'from-violet-500 to-purple-600',
      size: 'medium' as const,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
              <h3 className="text-lg font-bold text-slate-900">How DIVE V3 Works</h3>
              <p className="text-xs text-slate-600">Coalition ICAM in action</p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
              <div>
                <p className="font-semibold text-slate-900">Federated Authentication</p>
                <p className="text-xs mt-1">
                  Login via your home <EducationalTooltip term="Federation">IdP</EducationalTooltip>.
                  Keycloak brokers identity across coalition partners.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
              <div>
                <p className="font-semibold text-slate-900">Policy Evaluation</p>
                <p className="text-xs mt-1">
                  <EducationalTooltip term="PEP">PEP</EducationalTooltip> sends your attributes to{' '}
                  <EducationalTooltip term="OPA">OPA</EducationalTooltip> for{' '}
                  <EducationalTooltip term="ABAC">ABAC</EducationalTooltip> decision.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
              <div>
                <p className="font-semibold text-slate-900">Secure Access</p>
                <p className="text-xs mt-1">
                  If authorized, access resource. For encrypted content,{' '}
                  <EducationalTooltip term="KAS">KAS</EducationalTooltip> releases decryption key.
                </p>
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
            <h3 className="text-lg font-bold text-slate-900">Quick Tips</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <Award className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Your attributes are read-only</p>
                <p className="text-xs text-slate-600 mt-1">
                  <EducationalTooltip term="Clearance">Clearance</EducationalTooltip> and{' '}
                  <EducationalTooltip term="COI">COI</EducationalTooltip> are managed by your home IdP admin
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <Award className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">All actions are audited</p>
                <p className="text-xs text-slate-600 mt-1">
                  Every authorization decision is logged for <EducationalTooltip term="ACP-240">ACP-240</EducationalTooltip> compliance
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white/60 backdrop-blur-sm">
              <Award className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Cross-partner collaboration</p>
                <p className="text-xs text-slate-600 mt-1">
                  Users from partner IdPs may access your documents if <EducationalTooltip term="Releasability">releasability</EducationalTooltip> permits
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
                <h3 className="text-lg font-bold text-slate-900">Active Federation Partners</h3>
                <p className="text-xs text-slate-600">{idps.length} identity providers available</p>
              </div>
            </div>
            <Link
              href="/admin/federation"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              View all
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
          <h3 className="text-lg font-bold text-slate-900">System Status</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { name: 'OPA Policy Engine', status: 'Operational' },
            { name: 'Keycloak Auth', status: 'Operational' },
            { name: 'Resource API', status: 'Operational' },
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
