/**
 * Dashboard Resources Tab Component
 *
 * Shows accessible documents, recent activity, and upload status.
 */

'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  FileText,
  FolderOpen,
  Upload,
  Download,
  ArrowRight,
  Eye,
  Lock,
  Unlock,
  Clock,
  BarChart3,
  Shield,
  Globe,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { EducationalTooltip } from './educational-tooltip';
import { useTranslation } from '@/hooks/useTranslation';

interface Resource {
  id: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  accessedAt?: string;
  encrypted?: boolean;
}

interface ResourceStats {
  totalAccessible: number;
  byClassification: Record<string, number>;
  recentlyAccessed: Resource[];
  uploadedByUser: number;
}

interface DashboardResourcesProps {
  stats?: ResourceStats;
  userClearance: string;
  userCountry: string;
}

// Classification colors
const classificationColors: Record<string, { bg: string; text: string; border: string }> = {
  UNCLASSIFIED: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  CONFIDENTIAL: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  SECRET: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  TOP_SECRET: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
};

export function DashboardResources({
  stats,
  userClearance,
  userCountry,
}: DashboardResourcesProps) {
  const { t } = useTranslation('dashboard');

  // Default stats
  const resourceStats: ResourceStats = stats || {
    totalAccessible: 0,
    byClassification: { UNCLASSIFIED: 0, CONFIDENTIAL: 0, SECRET: 0, TOP_SECRET: 0 },
    recentlyAccessed: [],
    uploadedByUser: 0,
  };

  // Calculate what classifications user can access
  const clearanceHierarchy = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
  const userClearanceIndex = clearanceHierarchy.indexOf(userClearance);
  const accessibleClassifications = clearanceHierarchy.slice(0, userClearanceIndex + 1);

  return (
    <div className="space-y-6">
      {/* Resource Stats Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-4"
      >
        <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <FolderOpen className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">{resourceStats.totalAccessible}</span>
          </div>
          <p className="text-sm text-white/80">{t('resources.accessibleDocuments')}</p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <Upload className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">{resourceStats.uploadedByUser}</span>
          </div>
          <p className="text-sm text-white/80">{t('resources.yourUploads')}</p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <Eye className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">{resourceStats.recentlyAccessed.length}</span>
          </div>
          <p className="text-sm text-white/80">{t('resources.recentlyViewed')}</p>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-6 shadow-xl text-white">
          <div className="flex items-center justify-between mb-2">
            <Lock className="w-8 h-8 text-white/80" />
            <span className="text-3xl font-bold">
              {resourceStats.recentlyAccessed.filter(r => r.encrypted).length}
            </span>
          </div>
          <p className="text-sm text-white/80">Encrypted Resources</p>
        </div>
      </motion.div>

      {/* Classification Distribution */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{t('resources.resourcesByClassification')}</h3>
              <p className="text-xs text-slate-600">
                {t('resources.resourceStats')} <EducationalTooltip term="Clearance">classification level</EducationalTooltip>
              </p>
            </div>
          </div>
          <Link
            href="/resources"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
{t('resources.browseAll')}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {clearanceHierarchy.map((level) => {
            const isAccessible = accessibleClassifications.includes(level);
            const count = resourceStats.byClassification[level] || 0;
            const colors = classificationColors[level];

            return (
              <div
                key={level}
                className={`p-4 rounded-xl border-2 ${colors.border} ${
                  isAccessible ? colors.bg : 'bg-slate-100 opacity-60'
                } transition-all`}
              >
                <div className="flex items-center justify-between mb-2">
                  {isAccessible ? (
                    <Unlock className={`w-5 h-5 ${colors.text}`} />
                  ) : (
                    <Lock className="w-5 h-5 text-slate-400" />
                  )}
                  <span className={`text-2xl font-bold ${isAccessible ? colors.text : 'text-slate-400'}`}>
                    {count}
                  </span>
                </div>
                <p className={`text-xs font-medium ${isAccessible ? colors.text : 'text-slate-400'}`}>
                  {level}
                </p>
                {!isAccessible && (
                  <p className="text-xs text-slate-400 mt-1">Requires higher clearance</p>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Your Access Context */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-6 shadow-lg"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900 mb-2">{t('resources.yourAccessContext')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              {t('resources.basedOnYourClearance')} <EducationalTooltip term="Clearance">{userClearance}</EducationalTooltip> clearance
              {t('resources.andCountryAffiliation')} <EducationalTooltip term="Releasability">{userCountry}</EducationalTooltip>,
              {t('resources.youCanAccess')} {t('resources.documentsAcross')} {userClearance} classification {t('resources.thatAreReleasableTo')} {userCountry}.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white border border-blue-200">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-xs font-medium text-slate-900">{t('resources.maxClassification')}</p>
                  <p className="text-xs text-slate-600">{userClearance}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white border border-blue-200">
                <Globe className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-xs font-medium text-slate-900">{t('resources.releasability')}</p>
                  <p className="text-xs text-slate-600">{t('resources.mustInclude')} {userCountry}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white border border-blue-200">
                <Lock className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-xs font-medium text-slate-900">Encrypted Content</p>
                  <div className="text-xs text-slate-600"><EducationalTooltip term="KAS">KAS</EducationalTooltip> key required</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Recently Accessed */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl bg-white border border-slate-200 p-6 shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Recently Accessed</h3>
              <p className="text-xs text-slate-600">Documents you've viewed recently</p>
            </div>
          </div>
        </div>

        {resourceStats.recentlyAccessed.length > 0 ? (
          <div className="space-y-2">
            {resourceStats.recentlyAccessed.slice(0, 5).map((resource, idx) => {
              const colors = classificationColors[resource.classification] || classificationColors.UNCLASSIFIED;

              return (
                <motion.div
                  key={resource.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * idx }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 transition-all"
                >
                  <div className={`w-10 h-10 rounded-lg ${colors.bg} ${colors.border} border flex items-center justify-center`}>
                    <FileText className={`w-5 h-5 ${colors.text}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{resource.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} font-medium`}>
                        {resource.classification}
                      </span>
                      {resource.encrypted && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          Encrypted
                        </span>
                      )}
                    </div>
                  </div>

                  {resource.accessedAt && (
                    <p className="text-xs text-slate-500">
                      {new Date(resource.accessedAt).toLocaleDateString()}
                    </p>
                  )}

                  <Link
                    href={`/resources/${resource.id}`}
                    className="p-2 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No recently accessed documents</p>
            <Link
              href="/resources"
              className="inline-flex items-center gap-1 mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Browse documents
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <Link
          href="/upload"
          className="group flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
        >
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
            <Upload className="w-7 h-7 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Upload Document</h3>
            <p className="text-emerald-100 text-sm">
              Secure upload with <EducationalTooltip term="ZTDF">ZTDF</EducationalTooltip> encryption
            </p>
          </div>
          <ArrowRight className="w-6 h-6 ml-auto group-hover:translate-x-2 transition-transform" />
        </Link>

        <Link
          href="/resources"
          className="group flex items-center gap-4 p-6 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
        >
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
            <FolderOpen className="w-7 h-7 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Browse Resources</h3>
            <p className="text-blue-100 text-sm">
              Explore documents with <EducationalTooltip term="ABAC">ABAC</EducationalTooltip> filtering
            </p>
          </div>
          <ArrowRight className="w-6 h-6 ml-auto group-hover:translate-x-2 transition-transform" />
        </Link>
      </motion.div>
    </div>
  );
}

export default DashboardResources;
