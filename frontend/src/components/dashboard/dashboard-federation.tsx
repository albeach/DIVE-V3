/**
 * Dashboard Federation Tab Component
 *
 * Shows federation status, active IdPs, and cross-partner activity.
 */

'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Globe,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Users,
  Activity,
  ExternalLink,
  Network,
  Building2,
  Fingerprint,
} from 'lucide-react';
import { EducationalTooltip } from './educational-tooltip';
import { useTranslation } from '@/hooks/useTranslation';

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

interface IdP {
  alias: string;
  displayName: string;
  protocol: 'oidc' | 'saml';
  enabled: boolean;
}

interface FederationStats {
  crossPartnerAccesses?: number;
  activeSessionsCount?: number;
  authenticationsToday?: number;
}

interface DashboardFederationProps {
  idps: IdP[];
  userCountry: string;
  currentInstance: string;
  isFederated: boolean;
  stats?: FederationStats;
}

export function DashboardFederation({
  idps,
  userCountry,
  currentInstance,
  isFederated,
  stats = {},
}: DashboardFederationProps) {
  const { t } = useTranslation('dashboard');

  const instanceFlag = countryFlags[currentInstance] || '🌐';
  const instanceName = countryNames[currentInstance] || currentInstance;
  const userFlag = countryFlags[userCountry] || '🌐';
  const userName = countryNames[userCountry] || userCountry;

  return (
    <div className="space-y-6">
      {/* Federation Status Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-6 shadow-xl text-white"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Network className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{t('federation.status.title')}</h2>
              <p className="text-blue-100 text-sm">
                {t('federation.status.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {isFederated ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{userFlag}</span>
                  <ArrowRight className="w-4 h-4 text-white/70" />
                  <span className="text-2xl">{instanceFlag}</span>
                </div>
                <div>
                  <p className="text-xs text-white/70 font-medium">{t('federation.status.federatedAccess')}</p>
                  <p className="text-sm font-bold">{userName} → {instanceName}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30">
                <span className="text-2xl">{instanceFlag}</span>
                <div>
                  <p className="text-xs text-white/70 font-medium">{t('federation.status.homeInstance')}</p>
                  <p className="text-sm font-bold">{instanceName} {t('federation.status.portal')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Federation Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch"
      >
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{idps.length}</p>
              <p className="text-xs text-slate-600">{t('federation.stats.partners.title')}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">{t('federation.stats.partners.description')}</p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.crossPartnerAccesses || 0}</p>
              <p className="text-xs text-slate-600">{t('federation.stats.crossPartnerAccesses.title')}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">{t('federation.stats.crossPartnerAccesses.description')}</p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <Fingerprint className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.authenticationsToday || 0}</p>
              <p className="text-xs text-slate-600">{t('federation.stats.authentications.title')}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">{t('federation.stats.authentications.description')}</p>
        </div>
      </motion.div>

      {/* What is Federation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-6 shadow-lg"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">{t('federation.explanation.title')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              <EducationalTooltip term="Federation">{t('federation.explanation.federationTerm')}</EducationalTooltip> {t('federation.explanation.description')}
              <EducationalTooltip term="STANAG">{t('federation.explanation.stanagTerm')}</EducationalTooltip> {t('federation.explanation.standardsText')}
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-blue-200">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium text-slate-700">Single Sign-On</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-blue-200">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium text-slate-700">Attribute Exchange</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-blue-200">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium text-slate-700">Cross-Domain Trust</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Active Identity Providers */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Active Identity Providers</h3>
              <p className="text-xs text-slate-600">
                Coalition partners with configured IdP connections
              </p>
            </div>
          </div>
          <Link
            href="/admin/idp"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            Manage IdPs
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>

        <div className="space-y-2">
          {idps.map((idp, idx) => (
            <motion.div
              key={idp.alias}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * idx }}
              className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all"
            >
              <div className={`w-12 h-12 rounded-xl ${
                idp.protocol === 'oidc'
                  ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                  : 'bg-gradient-to-br from-purple-500 to-pink-600'
              } flex items-center justify-center shadow-lg`}>
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>

              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">{idp.displayName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`
                    text-xs px-2 py-0.5 rounded-full font-medium
                    ${idp.protocol === 'oidc'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                    }
                  `}>
                    {idp.protocol.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-500">
                    Alias: {idp.alias}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {idp.enabled ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-xs font-medium text-green-700">Active</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <span className="text-xs font-medium text-amber-700">Disabled</span>
                  </>
                )}
              </div>
            </motion.div>
          ))}

          {idps.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No identity providers configured</p>
              <Link
                href="/admin/idp/new"
                className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Add IdP
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </motion.div>

      {/* Federation Matrix */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Federation Trust Matrix</h3>
            <p className="text-xs text-slate-600">
              Countries with bi-directional federation agreements
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {Object.entries(countryFlags).slice(0, 6).map(([code, flag]) => (
            <div
              key={code}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-green-300 hover:bg-green-50/50 transition-all"
            >
              <span className="text-3xl">{flag}</span>
              <span className="text-xs font-medium text-slate-700">{code}</span>
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500 mt-4 text-center">
          All listed countries have active federation agreements with this instance
        </p>
      </motion.div>
    </div>
  );
}

export default DashboardFederation;
