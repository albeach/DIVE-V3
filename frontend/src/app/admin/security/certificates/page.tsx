/**
 * Certificate Management Dashboard
 *
 * Certificate expiry monitoring, health dashboard, and rotation wizard.
 * Manages root, intermediate, signing, and TLS certificates.
 *
 * Phase 6.2 - 2026 Design Patterns
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { useCertificatesList, useCertificatesHealth, useRotateCertificate } from '@/lib/api/admin-queries';
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
import {
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Key,
  Lock,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Calendar,
  Info,
  ChevronRight,
  X,
  FileKey,
} from 'lucide-react';

type CertStatus = 'valid' | 'expiring_soon' | 'expired' | 'revoked';
type CertType = 'root' | 'intermediate' | 'signing' | 'tls';

const statusConfig: Record<CertStatus, { color: string; bg: string; icon: typeof CheckCircle2; label: string }> = {
  valid: { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: CheckCircle2, label: 'Valid' },
  expiring_soon: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: AlertTriangle, label: 'Expiring Soon' },
  expired: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', icon: XCircle, label: 'Expired' },
  revoked: { color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-900/30', icon: ShieldX, label: 'Revoked' },
};

const typeConfig: Record<CertType, { icon: typeof Key; label: string; color: string }> = {
  root: { icon: Shield, label: 'Root CA', color: 'from-red-500 to-rose-600' },
  intermediate: { icon: ShieldCheck, label: 'Intermediate CA', color: 'from-blue-500 to-indigo-600' },
  signing: { icon: FileKey, label: 'Signing', color: 'from-purple-500 to-pink-600' },
  tls: { icon: Lock, label: 'TLS', color: 'from-emerald-500 to-teal-600' },
};

interface CertificateData {
  id: string;
  type: CertType;
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  status: CertStatus;
  daysUntilExpiry: number;
  keySize: number;
  algorithm: string;
  fingerprint: string;
  usages: string[];
}

function CertificateCard({
  cert,
  onRotate,
  onViewDetails,
}: {
  cert: CertificateData;
  onRotate: () => void;
  onViewDetails: () => void;
}) {
  const status = statusConfig[cert.status] || statusConfig.valid;
  const type = typeConfig[cert.type] || typeConfig.tls;
  const StatusIcon = status.icon;
  const TypeIcon = type.icon;

  const getExpiryColor = (days: number) => {
    if (days > 90) return 'text-emerald-600';
    if (days > 30) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${type.color} flex items-center justify-center shadow-lg`}>
            <TypeIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {cert.subject}
            </h3>
            <p className="text-xs text-gray-500">{type.label}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {status.label}
        </span>
      </div>

      {/* Expiry */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-500">Expires</span>
          </div>
          <span className={`text-sm font-bold ${getExpiryColor(cert.daysUntilExpiry)}`}>
            {cert.daysUntilExpiry > 0 ? `${cert.daysUntilExpiry} days` : 'Expired'}
          </span>
        </div>
        <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              cert.daysUntilExpiry > 90
                ? 'bg-emerald-500'
                : cert.daysUntilExpiry > 30
                ? 'bg-amber-500'
                : 'bg-red-500'
            }`}
            style={{
              width: `${Math.min(Math.max((cert.daysUntilExpiry / 365) * 100, 2), 100)}%`,
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
          <span>{new Date(cert.validFrom).toLocaleDateString()}</span>
          <span>{new Date(cert.validTo).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Algorithm</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{cert.algorithm}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Key Size</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{cert.keySize} bit</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Serial</span>
          <span className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
            {cert.serialNumber}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onViewDetails}
          className="flex-1 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-1"
        >
          <Info className="w-3.5 h-3.5" />
          Details
        </button>
        {cert.status !== 'expired' && cert.status !== 'revoked' && (
          <button
            onClick={onRotate}
            className="flex-1 px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm flex items-center justify-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Rotate
          </button>
        )}
      </div>
    </div>
  );
}

function RotationModal({
  cert,
  onClose,
  onConfirm,
  isRotating,
}: {
  cert: CertificateData;
  onClose: () => void;
  onConfirm: () => void;
  isRotating: boolean;
}) {
  const [overlapDays, setOverlapDays] = useState(30);
  const [force, setForce] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Rotate Certificate
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Certificate: {cert.subject}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Type: {typeConfig[cert.type]?.label || cert.type} |
                  Expires: {new Date(cert.validTo).toLocaleDateString()} ({cert.daysUntilExpiry} days)
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Overlap Period (days)
              </label>
              <input
                type="number"
                value={overlapDays}
                onChange={(e) => setOverlapDays(parseInt(e.target.value) || 0)}
                min={0}
                max={90}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 mt-1">
                Both old and new certificates will be valid during the overlap period
              </p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Force rotation
                </span>
                <p className="text-xs text-gray-500">Skip pre-rotation checks</p>
              </div>
            </label>
          </div>

          {cert.type === 'root' && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Rotating a root CA certificate will affect all downstream certificates.
                  Ensure all spokes can handle the transition.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isRotating}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isRotating}
            className="px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
          >
            {isRotating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            {isRotating ? 'Rotating...' : 'Start Rotation'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CertDetailModal({ cert, onClose }: { cert: CertificateData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Certificate Details</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {[
            { label: 'Subject', value: cert.subject },
            { label: 'Issuer', value: cert.issuer },
            { label: 'Type', value: typeConfig[cert.type]?.label || cert.type },
            { label: 'Serial Number', value: cert.serialNumber },
            { label: 'Algorithm', value: cert.algorithm },
            { label: 'Key Size', value: `${cert.keySize} bit` },
            { label: 'Valid From', value: new Date(cert.validFrom).toLocaleString() },
            { label: 'Valid To', value: new Date(cert.validTo).toLocaleString() },
            { label: 'Days Until Expiry', value: cert.daysUntilExpiry > 0 ? `${cert.daysUntilExpiry} days` : 'Expired' },
            { label: 'Fingerprint', value: cert.fingerprint },
            { label: 'Usages', value: cert.usages.join(', ') },
          ].map((item) => (
            <div key={item.label} className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
              <span className="text-sm text-gray-500 flex-shrink-0">{item.label}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 text-right ml-4 break-all">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CertificateManagementPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const [rotatingCert, setRotatingCert] = useState<CertificateData | null>(null);
  const [viewingCert, setViewingCert] = useState<CertificateData | null>(null);
  const [filterType, setFilterType] = useState<CertType | 'all'>('all');

  const { data: certsData, isLoading: isLoadingCerts, refetch: refetchCerts } = useCertificatesList();
  const { data: healthData, isLoading: isLoadingHealth, refetch: refetchHealth } = useCertificatesHealth();
  const rotateMutation = useRotateCertificate();

  const handleRefresh = useCallback(() => {
    refetchCerts();
    refetchHealth();
  }, [refetchCerts, refetchHealth]);

  const handleRotate = useCallback(async () => {
    if (!rotatingCert) return;
    try {
      await rotateMutation.mutateAsync({ certificateId: rotatingCert.id });
      setRotatingCert(null);
      handleRefresh();
    } catch (err) {
      console.error('Rotation failed:', err);
    }
  }, [rotatingCert, rotateMutation, handleRefresh]);

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    router.push('/');
    return null;
  }

  const isLoading = isLoadingCerts || isLoadingHealth;
  const certificates: CertificateData[] = certsData?.certificates || [];
  const health = healthData?.health;

  const filteredCerts = certificates.filter((c) =>
    filterType === 'all' || c.type === filterType
  );

  return (
    <PageLayout
      user={session?.user || {}}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        {/* Header */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-[1600px] mx-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Certificate Management
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Monitor certificate expiry and manage rotations
                </p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1600px] mx-auto px-8 py-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                <p className="mt-2 text-sm text-gray-500">Loading certificates...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Health Summary */}
              {health && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className={`bg-white dark:bg-gray-800 rounded-xl border-2 p-4 ${
                    health.overallStatus === 'healthy'
                      ? 'border-emerald-200 dark:border-emerald-800'
                      : health.overallStatus === 'warning'
                      ? 'border-amber-200 dark:border-amber-800'
                      : 'border-red-200 dark:border-red-800'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        health.overallStatus === 'healthy'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30'
                          : health.overallStatus === 'warning'
                          ? 'bg-amber-100 dark:bg-amber-900/30'
                          : 'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        <ShieldCheck className={`w-5 h-5 ${
                          health.overallStatus === 'healthy' ? 'text-emerald-600' :
                          health.overallStatus === 'warning' ? 'text-amber-600' : 'text-red-600'
                        }`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Status</p>
                        <p className={`text-lg font-bold capitalize ${
                          health.overallStatus === 'healthy' ? 'text-emerald-600' :
                          health.overallStatus === 'warning' ? 'text-amber-600' : 'text-red-600'
                        }`}>{health.overallStatus}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.certificates.total}</p>
                    <p className="text-xs text-gray-500">Total Certificates</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-2xl font-bold text-emerald-600">{health.certificates.valid}</p>
                    <p className="text-xs text-gray-500">Valid</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-2xl font-bold text-amber-600">{health.certificates.expiringSoon}</p>
                    <p className="text-xs text-gray-500">Expiring Soon</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-2xl font-bold text-red-600">{health.certificates.expired + health.certificates.revoked}</p>
                    <p className="text-xs text-gray-500">Expired / Revoked</p>
                  </div>
                </div>
              )}

              {/* Alerts */}
              {health?.alerts && health.alerts.length > 0 && (
                <div className="space-y-2">
                  {health.alerts.map((alert: { severity: string; message: string; certificateId: string }, idx: number) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border flex items-center gap-3 ${
                        alert.severity === 'critical'
                          ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                          : alert.severity === 'warning'
                          ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                          : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                      }`}
                    >
                      <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                        alert.severity === 'critical' ? 'text-red-600' :
                        alert.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'
                      }`} />
                      <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">{alert.message}</p>
                      <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                        View <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
                {(['all', 'root', 'intermediate', 'signing', 'tls'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      filterType === t
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {t === 'all' ? 'All' : typeConfig[t]?.label || t}
                  </button>
                ))}
              </div>

              {/* Certificates Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCerts.map((cert) => (
                  <CertificateCard
                    key={cert.id}
                    cert={cert}
                    onRotate={() => setRotatingCert(cert)}
                    onViewDetails={() => setViewingCert(cert)}
                  />
                ))}
              </div>

              {filteredCerts.length === 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                  <Key className="w-12 h-12 mx-auto text-gray-300" />
                  <p className="mt-4 text-gray-500">No certificates found</p>
                </div>
              )}

              {/* Recommendations */}
              {health?.recommendations && health.recommendations.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Recommendations
                  </h3>
                  <ul className="space-y-2">
                    {health.recommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-3 text-sm">
                        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 dark:text-gray-300">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Last Check */}
              {health?.lastCheck && (
                <div className="text-center text-sm text-gray-500">
                  Last checked: {new Date(health.lastCheck).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {rotatingCert && (
        <RotationModal
          cert={rotatingCert}
          onClose={() => setRotatingCert(null)}
          onConfirm={handleRotate}
          isRotating={rotateMutation.isPending}
        />
      )}

      {viewingCert && (
        <CertDetailModal
          cert={viewingCert}
          onClose={() => setViewingCert(null)}
        />
      )}
    </PageLayout>
  );
}
