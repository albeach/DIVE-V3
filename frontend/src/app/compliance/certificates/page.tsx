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
  Server
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

interface CertificateData {
  title: string;
  description: string;
  pkiHealth: {
    status: string;
    lastCheck: string;
    componentsHealthy: number;
    componentsTotal: number;
  };
  rootCertificate: Certificate;
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
}

export default function CertificatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [certificateData, setCertificateData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/login');
      return;
    }

    async function fetchCertificateData() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      
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
        return 'text-green-600 bg-green-100 border-green-300';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100 border-yellow-300';
      case 'error':
      case 'expired':
        return 'text-red-600 bg-red-100 border-red-300';
      default:
        return 'text-gray-600 bg-gray-100 border-gray-300';
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
      <div className="relative overflow-hidden bg-gradient-to-br from-orange-600 via-red-600 to-pink-700 rounded-2xl p-8 md:p-12 mb-8 shadow-2xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 60% 40%, white 2px, transparent 2px)`,
            backgroundSize: '45px 45px'
          }} />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl">
              <FileCheck className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">
                {certificateData.title}
              </h1>
              <p className="text-orange-100 text-lg max-w-3xl">
                {certificateData.description}
              </p>
            </div>
          </div>

          {/* PKI Health Status */}
          <div className="mt-6 bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-xl ${
                  certificateData.pkiHealth.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  <Activity className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">PKI Infrastructure Status</h3>
                  <p className="text-white/80 text-sm">
                    Last checked: {new Date(certificateData.pkiHealth.lastCheck).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold uppercase ${
                  certificateData.pkiHealth.status === 'healthy' ? 'text-green-300' : 'text-red-300'
                }`}>
                  {certificateData.pkiHealth.status}
                </p>
                <p className="text-white/80 text-sm">
                  {certificateData.pkiHealth.componentsHealthy}/{certificateData.pkiHealth.componentsTotal} components
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Certificates Grid */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Shield className="w-7 h-7 text-orange-600" />
          Certificate Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Root Certificate */}
          <div className="bg-white rounded-xl p-6 border-2 border-blue-200 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl">
                  <Server className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Root CA Certificate</h3>
                  <p className="text-xs text-gray-500">Trust Anchor</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(certificateData.rootCertificate.status)}`}>
                {certificateData.rootCertificate.status.toUpperCase()}
              </span>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Subject:</p>
                <p className="text-sm font-mono text-gray-900 break-all">{certificateData.rootCertificate.subject}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Serial Number:</p>
                <p className="text-sm font-mono text-gray-900">{certificateData.rootCertificate.serialNumber}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Valid From:</p>
                  <p className="text-xs font-semibold text-gray-900">
                    {new Date(certificateData.rootCertificate.validFrom).toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Valid To:</p>
                  <p className="text-xs font-semibold text-gray-900">
                    {new Date(certificateData.rootCertificate.validTo).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Key Size:</p>
                  <p className="text-sm font-bold text-blue-600">{certificateData.rootCertificate.keySize} bits</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Algorithm:</p>
                  <p className="text-xs font-semibold text-gray-900">{certificateData.rootCertificate.signatureAlgorithm}</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center gap-2">
                  <Clock className={`w-5 h-5 ${getExpiryColor(certificateData.rootCertificate.daysUntilExpiry)}`} />
                  <div>
                    <p className="text-xs text-gray-600">Expires in:</p>
                    <p className={`text-lg font-bold ${getExpiryColor(certificateData.rootCertificate.daysUntilExpiry)}`}>
                      {certificateData.rootCertificate.daysUntilExpiry} days
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Signing Certificate */}
          <div className="bg-white rounded-xl p-6 border-2 border-purple-200 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
                  <FileCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Signing Certificate</h3>
                  <p className="text-xs text-gray-500">Policy Signatures</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(certificateData.signingCertificate.status)}`}>
                {certificateData.signingCertificate.status.toUpperCase()}
              </span>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Subject:</p>
                <p className="text-sm font-mono text-gray-900 break-all">{certificateData.signingCertificate.subject}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Issued By:</p>
                <p className="text-sm font-mono text-gray-900 break-all">{certificateData.signingCertificate.issuer}</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Serial Number:</p>
                <p className="text-sm font-mono text-gray-900">{certificateData.signingCertificate.serialNumber}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Valid From:</p>
                  <p className="text-xs font-semibold text-gray-900">
                    {new Date(certificateData.signingCertificate.validFrom).toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Valid To:</p>
                  <p className="text-xs font-semibold text-gray-900">
                    {new Date(certificateData.signingCertificate.validTo).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Key Size:</p>
                  <p className="text-sm font-bold text-purple-600">{certificateData.signingCertificate.keySize} bits</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Algorithm:</p>
                  <p className="text-xs font-semibold text-gray-900">{certificateData.signingCertificate.signatureAlgorithm}</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center gap-2">
                  <Clock className={`w-5 h-5 ${getExpiryColor(certificateData.signingCertificate.daysUntilExpiry)}`} />
                  <div>
                    <p className="text-xs text-gray-600">Expires in:</p>
                    <p className={`text-lg font-bold ${getExpiryColor(certificateData.signingCertificate.daysUntilExpiry)}`}>
                      {certificateData.signingCertificate.daysUntilExpiry} days
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Use Cases */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <Key className="w-7 h-7 text-blue-600" />
          PKI Use Cases
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {certificateData.useCases.map((useCase, idx) => (
            <div key={idx} className="bg-white rounded-xl p-6 border-2 border-gray-200 shadow-md hover:shadow-xl hover:scale-105 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl">
                  {useCaseIcons[useCase.icon] || <Shield className="w-6 h-6 text-white" />}
                </div>
                <span className="text-3xl" role="img" aria-label={useCase.title}>{useCase.icon}</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2 text-sm">{useCase.title}</h3>
              <p className="text-xs text-gray-600 mb-3">{useCase.description}</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(useCase.status)}`}>
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {useCase.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Signature Statistics */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <TrendingUp className="w-7 h-7 text-green-600" />
          Signature Statistics
        </h2>
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200 shadow-lg">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{certificateData.signatureStatistics.totalSigned.toLocaleString()}</p>
              <p className="text-sm text-gray-600 mt-1">Total Signed</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{certificateData.signatureStatistics.totalVerified.toLocaleString()}</p>
              <p className="text-sm text-gray-600 mt-1">Total Verified</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-600">{certificateData.signatureStatistics.failedVerifications}</p>
              <p className="text-sm text-gray-600 mt-1">Failed Verifications</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-600">{certificateData.signatureStatistics.averageSignTime}</p>
              <p className="text-sm text-gray-600 mt-1">Avg Sign Time</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-orange-600">{certificateData.signatureStatistics.averageVerifyTime}</p>
              <p className="text-sm text-gray-600 mt-1">Avg Verify Time</p>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Requirements */}
      <div className="bg-white rounded-xl p-6 border-2 border-gray-200 shadow-lg">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
          ACP-240 Compliance Requirements
        </h3>
        <div className="space-y-4">
          {certificateData.complianceRequirements.map((req) => (
            <div key={req.id} className="flex items-start gap-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold">
                {req.id}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 mb-1">{req.requirement}</p>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(req.status)}`}>
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {req.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500 font-mono">{req.implementation}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}


