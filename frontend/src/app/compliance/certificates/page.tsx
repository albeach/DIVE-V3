'use client';

/**
 * X.509 PKI Certificate Status Dashboard
 *
 * Displays X.509 certificate health, trust chains, and PKI infrastructure status
 * Shows STANAG 4778 cryptographic binding implementation
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import {
  FileCheck,
  Shield,
  CheckCircle2,
  Activity,
  Key,
  Lock,
  AlertCircle,
  TrendingUp,
  Clock,
  Server,
  Terminal,
  ArrowRight,
  Link2,
  AlertTriangle,
  Play,
  XCircle
} from 'lucide-react';

interface Certificate {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  keySize: number;
  signatureAlgorithm: string;
  status: string;
  daysUntilExpiry: number;
}

interface HubSpokePhase {
  phase: number;
  title: string;
  description: string;
  command: string;
  status: string;
}

interface CertificateData {
  title: string;
  description: string;
  pkiInitialized: boolean;
  instanceCode: string;
  isHub: boolean;
  pkiHealth: {
    status: string;
    lastCheck: string;
    componentsHealthy: number;
    componentsTotal: number;
  };
  rootCertificate: Certificate;
  intermediateCertificate: Certificate;
  signingCertificate: Certificate;
  useCases: Array<{
    title: string;
    description: string;
    icon: string;
    status: string;
  }>;
  signatureStatistics: {
    totalSigned: number;
    totalVerified: number;
    failedVerifications: number;
    averageSignTime: string;
    averageVerifyTime: string;
  };
  complianceRequirements: Array<{
    id: string;
    requirement: string;
    status: string;
    implementation: string;
  }>;
  hubSpokeArchitecture: {
    description: string;
    phases: HubSpokePhase[];
    trustChain: string[];
  };
}

export default function CertificatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [certificateData, setCertificateData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated (separate effect to avoid render-phase updates)
  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      return;
    }

    async function fetchCertificateData() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

      try {
        const response = await fetch(`${backendUrl}/api/compliance/certificates`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch certificate data');
        }

        const data = await response.json();
        setCertificateData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load certificate data');
        console.error('Error fetching certificates:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCertificateData();
  }, [session, status, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading PKI status...</p>
        </div>
      </div>
    );
  }

  if (!session || !certificateData) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'valid':
      case 'active':
      case 'compliant':
      case 'complete':
        return 'text-green-600 bg-green-100 border-green-300';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100 border-yellow-300';
      case 'error':
      case 'expired':
        return 'text-red-600 bg-red-100 border-red-300';
      case 'not_initialized':
      case 'pending':
        return 'text-blue-600 bg-blue-100 border-blue-300';
      case 'hub_only':
      case 'spoke_only':
        return 'text-gray-400 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-100 border-gray-300';
    }
  };

  const getPhaseIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'complete':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'pending':
        return <Play className="w-5 h-5 text-blue-600" />;
      case 'hub_only':
      case 'spoke_only':
        return <XCircle className="w-5 h-5 text-gray-400" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getExpiryColor = (days: number) => {
    if (days > 90) return 'text-green-600';
    if (days > 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  const useCaseIcons: Record<string, React.ReactNode> = {
    '✍️': <FileCheck className="w-6 h-6 text-white" />,
    '🔗': <Key className="w-6 h-6 text-white" />,
    '🔐': <Lock className="w-6 h-6 text-white" />,
    '🚨': <AlertCircle className="w-6 h-6 text-white" />,
  };

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Compliance', href: '/compliance' },
        { label: 'X.509 PKI', href: null }
      ]}
    >
      {/* Hero Section */}
      <div className={`relative overflow-hidden rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-12 mb-6 sm:mb-8 shadow-xl sm:shadow-2xl ${
        certificateData.pkiInitialized
          ? 'bg-gradient-to-br from-orange-600 via-red-600 to-pink-700'
          : 'bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700'
      }`}>
        <div className="absolute inset-0 opacity-10 hidden sm:block">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 60% 40%, white 2px, transparent 2px)`,
            backgroundSize: '45px 45px'
          }} />
        </div>

        <div className="relative z-10">
          {/* Mobile: Stack vertically, Desktop: Horizontal */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
            <div className="p-3 sm:p-4 bg-white/20 backdrop-blur-sm rounded-xl sm:rounded-2xl w-fit">
              <FileCheck className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white">
                  X.509 PKI
                </h1>
                <span className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold w-fit ${
                  certificateData.isHub
                    ? 'bg-yellow-400 text-yellow-900'
                    : 'bg-blue-400 text-blue-900'
                }`}>
                  {certificateData.isHub ? '🏛️ HUB' : `🔗 ${certificateData.instanceCode}`}
                </span>
              </div>
              <p className="text-white/90 text-sm sm:text-lg max-w-3xl hidden sm:block">
                {certificateData.description}
              </p>
              <p className="text-white/90 text-xs sm:hidden">
                Three-tier PKI for policy signatures and trust chains.
              </p>
            </div>
          </div>

          {/* PKI Health Status - Stack on mobile */}
          <div className="mt-4 sm:mt-6 bg-white/10 backdrop-blur-md rounded-lg sm:rounded-xl p-3 sm:p-6 border border-white/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`p-2 sm:p-4 rounded-lg sm:rounded-xl ${
                  certificateData.pkiHealth.status === 'healthy'
                    ? 'bg-green-500'
                    : certificateData.pkiHealth.status === 'not_initialized'
                    ? 'bg-blue-500'
                    : 'bg-yellow-500'
                }`}>
                  {certificateData.pkiHealth.status === 'not_initialized'
                    ? <AlertTriangle className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
                    : <Activity className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
                  }
                </div>
                <div>
                  <h3 className="text-base sm:text-2xl font-bold text-white">PKI Status</h3>
                  <p className="text-white/80 text-xs sm:text-sm hidden sm:block">
                    {certificateData.pkiInitialized
                      ? `Last checked: ${new Date(certificateData.pkiHealth.lastCheck).toLocaleString()}`
                      : 'PKI not initialized'
                    }
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right flex sm:block items-center justify-between sm:justify-end">
                <p className={`text-xl sm:text-3xl font-bold uppercase ${
                  certificateData.pkiHealth.status === 'healthy'
                    ? 'text-green-300'
                    : certificateData.pkiHealth.status === 'not_initialized'
                    ? 'text-blue-300'
                    : 'text-yellow-300'
                }`}>
                  {certificateData.pkiHealth.status.replace('_', ' ')}
                </p>
                <p className="text-white/80 text-xs sm:text-sm">
                  {certificateData.pkiHealth.componentsHealthy}/{certificateData.pkiHealth.componentsTotal} components
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hub-Spoke Architecture Section (shown when PKI not initialized) */}
      {!certificateData.pkiInitialized && certificateData.hubSpokeArchitecture && (
        <div className="mb-6 sm:mb-8 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg sm:rounded-xl border-2 border-indigo-200 shadow-lg overflow-hidden">
          <div className="p-4 sm:p-6 bg-gradient-to-r from-indigo-600 to-purple-600">
            <h2 className="text-lg sm:text-2xl font-bold text-white mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3">
              <Link2 className="w-5 h-5 sm:w-7 sm:h-7" />
              Hub-Spoke PKI Architecture
            </h2>
            <p className="text-indigo-100 text-xs sm:text-sm">
              {certificateData.hubSpokeArchitecture.description}
            </p>
          </div>

          <div className="p-4 sm:p-6">
            {/* Trust Chain Visualization */}
            <div className="mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">Trust Chain</h3>
              {/* Mobile: Vertical stacked, Desktop: Horizontal */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:flex-wrap">
                {certificateData.hubSpokeArchitecture.trustChain.map((cert, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className={`px-3 sm:px-4 py-2 rounded-lg font-mono text-xs sm:text-sm flex-1 sm:flex-none text-center ${
                      idx === 0
                        ? 'bg-blue-600 text-white'
                        : idx === 1
                        ? 'bg-purple-600 text-white'
                        : 'bg-orange-600 text-white'
                    }`}>
                      {cert}
                    </div>
                    {idx < certificateData.hubSpokeArchitecture.trustChain.length - 1 && (
                      <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 transform rotate-90 sm:rotate-0 hidden sm:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Implementation Phases */}
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">Implementation Phases</h3>
            <div className="space-y-3 sm:space-y-4">
              {certificateData.hubSpokeArchitecture.phases.map((phase) => (
                <div
                  key={phase.phase}
                  className={`p-3 sm:p-4 rounded-lg border-2 ${
                    phase.status === 'complete'
                      ? 'bg-green-50 border-green-300'
                      : phase.status === 'pending'
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-white text-sm sm:text-base flex-shrink-0 ${
                      phase.status === 'complete'
                        ? 'bg-green-600'
                        : phase.status === 'pending'
                        ? 'bg-blue-600'
                        : 'bg-gray-400'
                    }`}>
                      {phase.phase}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                        <h4 className="font-bold text-gray-900 text-sm sm:text-base">{phase.title}</h4>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold border w-fit ${getStatusColor(phase.status)}`}>
                          {getPhaseIcon(phase.status)}
                          {phase.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-600 mb-2">{phase.description}</p>
                      {(phase.status === 'pending' || phase.status === 'complete') && (
                        <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-2 sm:px-4 py-2 overflow-x-auto">
                          <Terminal className="w-3 h-3 sm:w-4 sm:h-4 text-green-400 flex-shrink-0" />
                          <code className="text-[10px] sm:text-sm text-green-400 font-mono whitespace-nowrap">{phase.command}</code>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Certificates Grid */}
      <div className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
          <Shield className="w-5 h-5 sm:w-7 sm:h-7 text-orange-600" />
          Three-Tier Certificate Hierarchy
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Root Certificate */}
          <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 border-2 border-blue-200 shadow-lg">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl">
                  <Server className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base">Root CA</h3>
                  <p className="text-[10px] sm:text-xs text-gray-500">Trust Anchor</p>
                </div>
              </div>
              <span className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold border ${getStatusColor(certificateData.rootCertificate.status)}`}>
                {certificateData.rootCertificate.status.toUpperCase()}
              </span>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Subject:</p>
                <p className="text-xs sm:text-sm font-mono text-gray-900 break-all">{certificateData.rootCertificate.subject}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200 hidden sm:block overflow-hidden">
                <p className="text-xs text-gray-500 mb-1">Serial Number:</p>
                <p className="text-sm font-mono text-gray-900 break-all">{certificateData.rootCertificate.serialNumber}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Valid From:</p>
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-900">
                    {new Date(certificateData.rootCertificate.validFrom).toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Valid To:</p>
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-900">
                    {new Date(certificateData.rootCertificate.validTo).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Key Size:</p>
                  <p className="text-xs sm:text-sm font-bold text-blue-600">{certificateData.rootCertificate.keySize} bits</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Algorithm:</p>
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-900 truncate">{certificateData.rootCertificate.signatureAlgorithm}</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 sm:p-4 border border-blue-200">
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 sm:w-5 sm:h-5 ${getExpiryColor(certificateData.rootCertificate.daysUntilExpiry)}`} />
                  <div>
                    <p className="text-[10px] sm:text-xs text-gray-600">Expires in:</p>
                    <p className={`text-sm sm:text-lg font-bold ${getExpiryColor(certificateData.rootCertificate.daysUntilExpiry)}`}>
                      {certificateData.pkiInitialized ? `${certificateData.rootCertificate.daysUntilExpiry} days` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Intermediate Certificate */}
          <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 border-2 border-teal-200 shadow-lg">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg sm:rounded-xl">
                  <Link2 className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base">Intermediate CA</h3>
                  <p className="text-[10px] sm:text-xs text-gray-500">Trust Bridge</p>
                </div>
              </div>
              <span className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold border ${getStatusColor(certificateData.intermediateCertificate.status)}`}>
                {certificateData.intermediateCertificate.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Subject:</p>
                <p className="text-xs sm:text-sm font-mono text-gray-900 break-all">{certificateData.intermediateCertificate.subject}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200 hidden sm:block">
                <p className="text-xs text-gray-500 mb-1">Issued By:</p>
                <p className="text-sm font-mono text-gray-900 break-all">{certificateData.intermediateCertificate.issuer}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200 hidden sm:block overflow-hidden">
                <p className="text-xs text-gray-500 mb-1">Serial Number:</p>
                <p className="text-sm font-mono text-gray-900 break-all">{certificateData.intermediateCertificate.serialNumber}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Key Size:</p>
                  <p className="text-xs sm:text-sm font-bold text-teal-600">{certificateData.intermediateCertificate.keySize} bits</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Algorithm:</p>
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-900 truncate">{certificateData.intermediateCertificate.signatureAlgorithm}</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg p-3 sm:p-4 border border-teal-200">
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 sm:w-5 sm:h-5 ${getExpiryColor(certificateData.intermediateCertificate.daysUntilExpiry)}`} />
                  <div>
                    <p className="text-[10px] sm:text-xs text-gray-600">Expires in:</p>
                    <p className={`text-sm sm:text-lg font-bold ${getExpiryColor(certificateData.intermediateCertificate.daysUntilExpiry)}`}>
                      {certificateData.pkiInitialized ? `${certificateData.intermediateCertificate.daysUntilExpiry} days` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Signing Certificate */}
          <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 border-2 border-purple-200 shadow-lg">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg sm:rounded-xl">
                  <FileCheck className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base">Signing Cert</h3>
                  <p className="text-[10px] sm:text-xs text-gray-500">Policy Signatures</p>
                </div>
              </div>
              <span className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold border ${getStatusColor(certificateData.signingCertificate.status)}`}>
                {certificateData.signingCertificate.status.toUpperCase()}
              </span>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Subject:</p>
                <p className="text-xs sm:text-sm font-mono text-gray-900 break-all">{certificateData.signingCertificate.subject}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200 hidden sm:block">
                <p className="text-xs text-gray-500 mb-1">Issued By:</p>
                <p className="text-sm font-mono text-gray-900 break-all">{certificateData.signingCertificate.issuer}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200 hidden sm:block overflow-hidden">
                <p className="text-xs text-gray-500 mb-1">Serial Number:</p>
                <p className="text-sm font-mono text-gray-900 break-all">{certificateData.signingCertificate.serialNumber}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Valid From:</p>
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-900">
                    {new Date(certificateData.signingCertificate.validFrom).toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Valid To:</p>
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-900">
                    {new Date(certificateData.signingCertificate.validTo).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Key Size:</p>
                  <p className="text-xs sm:text-sm font-bold text-purple-600">{certificateData.signingCertificate.keySize} bits</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                  <p className="text-[10px] sm:text-xs text-gray-500 mb-1">Algorithm:</p>
                  <p className="text-[10px] sm:text-xs font-semibold text-gray-900 truncate">{certificateData.signingCertificate.signatureAlgorithm}</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3 sm:p-4 border border-purple-200">
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 sm:w-5 sm:h-5 ${getExpiryColor(certificateData.signingCertificate.daysUntilExpiry)}`} />
                  <div>
                    <p className="text-[10px] sm:text-xs text-gray-600">Expires in:</p>
                    <p className={`text-sm sm:text-lg font-bold ${getExpiryColor(certificateData.signingCertificate.daysUntilExpiry)}`}>
                      {certificateData.pkiInitialized ? `${certificateData.signingCertificate.daysUntilExpiry} days` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Use Cases */}
      <div className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
          <Key className="w-5 h-5 sm:w-7 sm:h-7 text-blue-600" />
          PKI Use Cases
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {certificateData.useCases.map((useCase, idx) => (
            <div key={idx} className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-6 border-2 border-gray-200 shadow-md hover:shadow-xl sm:hover:scale-105 transition-all">
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg sm:rounded-xl">
                  {useCaseIcons[useCase.icon] || <Shield className="w-4 h-4 sm:w-6 sm:h-6 text-white" />}
                </div>
                <span className="text-xl sm:text-3xl" role="img" aria-label={useCase.title}>{useCase.icon}</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-1 sm:mb-2 text-xs sm:text-sm">{useCase.title}</h3>
              <p className="text-[10px] sm:text-xs text-gray-600 mb-2 sm:mb-3 line-clamp-2">{useCase.description}</p>
              <span className={`inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold border ${getStatusColor(useCase.status)}`}>
                <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                {useCase.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Signature Statistics */}
      <div className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
          <TrendingUp className="w-5 h-5 sm:w-7 sm:h-7 text-green-600" />
          Signature Statistics
        </h2>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg sm:rounded-xl p-4 sm:p-6 border-2 border-green-200 shadow-lg">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-6">
            <div className="text-center">
              <p className="text-xl sm:text-3xl font-bold text-green-600">{certificateData.signatureStatistics.totalSigned.toLocaleString()}</p>
              <p className="text-[10px] sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Total Signed</p>
            </div>
            <div className="text-center">
              <p className="text-xl sm:text-3xl font-bold text-blue-600">{certificateData.signatureStatistics.totalVerified.toLocaleString()}</p>
              <p className="text-[10px] sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Total Verified</p>
            </div>
            <div className="text-center">
              <p className="text-xl sm:text-3xl font-bold text-red-600">{certificateData.signatureStatistics.failedVerifications}</p>
              <p className="text-[10px] sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Failed</p>
            </div>
            <div className="text-center">
              <p className="text-xl sm:text-3xl font-bold text-purple-600">{certificateData.signatureStatistics.averageSignTime}</p>
              <p className="text-[10px] sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Sign Time</p>
            </div>
            <div className="text-center col-span-2 sm:col-span-1">
              <p className="text-xl sm:text-3xl font-bold text-orange-600">{certificateData.signatureStatistics.averageVerifyTime}</p>
              <p className="text-[10px] sm:text-sm text-gray-600 mt-0.5 sm:mt-1">Verify Time</p>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Requirements */}
      <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 border-2 border-gray-200 shadow-lg">
        <h3 className="text-base sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 sm:gap-3">
          <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
          ACP-240 Compliance
        </h3>
        <div className="space-y-2 sm:space-y-4">
          {certificateData.complianceRequirements.map((req) => (
            <div key={req.id} className="flex items-start gap-2 sm:gap-4 bg-gray-50 rounded-lg p-2 sm:p-4 border border-gray-200">
              <div className="flex-shrink-0 w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold text-xs sm:text-base">
                {req.id}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 mb-1 text-xs sm:text-base">{req.requirement}</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className={`inline-flex items-center px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold border w-fit ${getStatusColor(req.status)}`}>
                    <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                    {req.status.toUpperCase()}
                  </span>
                  <span className="text-[10px] sm:text-xs text-gray-500 font-mono truncate">{req.implementation}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
