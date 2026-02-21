'use client';

/**
 * Admin Certificate Management Dashboard
 * 
 * Comprehensive PKI lifecycle management:
 * - Three-tier certificate hierarchy status
 * - Certificate rotation workflow
 * - CRL management
 * - Health monitoring and alerts
 * - Performance metrics
 * 
 * Admin-only access required
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/layout/page-layout';
import { AdminPageTransition, AnimatedButton, PresenceIndicator } from '@/components/admin/shared';
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
import { 
  Shield, 
  CheckCircle2, 
  AlertTriangle,
  Activity,
  Key,
  Lock,
  RefreshCw,
  Download,
  Upload,
  Clock,
  Server,
  AlertCircle,
  XCircle,
  Settings,
  TrendingUp,
  Archive
} from 'lucide-react';

interface Certificate {
  type: string;
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  status: string;
  daysUntilExpiry: number;
  path: string;
  keySize: number;
}

interface CertificateHealth {
  success: boolean;
  dashboard: {
    overallStatus: 'healthy' | 'warning' | 'critical';
    lastChecked: string;
    certificates: {
      root: {
        status: string;
        daysRemaining: number;
        validUntil: string;
        alerts: Array<{ severity: string; message: string }>;
      };
      intermediate: {
        status: string;
        daysRemaining: number;
        validUntil: string;
        alerts: Array<{ severity: string; message: string }>;
      };
      signing: {
        status: string;
        daysRemaining: number;
        validUntil: string;
        alerts: Array<{ severity: string; message: string }>;
      };
    };
    summary: {
      total: number;
      valid: number;
      expiringSoon: number;
      expired: number;
      daysUntilNextExpiry: number;
    };
    alerts: Array<{ severity: string; message: string; certificateType: string }>;
    recommendations: string[];
  };
  rotationStatus?: {
    inProgress: boolean;
    currentCertificate?: string;
    newCertificate?: string;
    startedAt?: string;
  };
  certificates: Certificate[];
  overallHealth: {
    status: 'healthy' | 'warning' | 'critical';
    healthyCount: number;
    totalCount: number;
    warnings: string[];
  };
}

interface RevocationListEntry {
  serialNumber: string;
  revokedAt: string;
  reason: string;
}

export default function AdminCertificatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [health, setHealth] = useState<CertificateHealth | null>(null);
  const [crl, setCrl] = useState<RevocationListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'rotation' | 'crl'>('overview');
  
  // Rotation modal state
  const [rotationModalOpen, setRotationModalOpen] = useState(false);
  const [rotationLoading, setRotationLoading] = useState(false);
  const [rotationMessage, setRotationMessage] = useState('');
  
  // Revocation modal state
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [revokeSerialNumber, setRevokeSerialNumber] = useState('');
  const [revokeReason, setRevokeReason] = useState('unspecified');
  const [revokeLoading, setRevokeLoading] = useState(false);

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

    // Check admin role
    const isSuperAdmin = session.user?.roles?.includes('super_admin');
    if (!isSuperAdmin) {
      router.push('/dashboard');
      return;
    }

    fetchData();
    
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [session, status, router]);

  async function fetchData() {
    try {
      // Fetch certificate health (dashboard data) via server API
      const healthRes = await fetch(`/api/admin/certificates/health`, {
        cache: 'no-store',
      });

      if (!healthRes.ok) {
        const errorData = await healthRes.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.message || 'Failed to fetch certificate health');
      }
      
      const healthData = await healthRes.json();
      
      // Fetch certificate list to get detailed info via server API
      const certsRes = await fetch(`/api/admin/certificates`, {
        cache: 'no-store',
      });

      if (!certsRes.ok) {
        const errorData = await certsRes.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.message || 'Failed to fetch certificates');
      }
      
      const certsData = await certsRes.json();
      
      // Combine the data
      const combinedHealth: CertificateHealth = {
        ...healthData,
        certificates: certsData.certificates || [],
        overallHealth: {
          status: healthData.dashboard.overallStatus,
          healthyCount: healthData.dashboard.summary.valid,
          totalCount: healthData.dashboard.summary.total,
          warnings: healthData.dashboard.recommendations || []
        },
        rotationStatus: {
          inProgress: false,
          ...healthData.rotationStatus
        }
      };
      
      setHealth(combinedHealth);

      // Fetch CRL
      const crlRes = await fetch(`/api/admin/certificates/revocation-list`, {
        cache: 'no-store',
      });

      if (!crlRes.ok) {
        const errorData = await crlRes.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.message || 'Failed to fetch CRL');
      }
      
      const crlData = await crlRes.json();
      setCrl(crlData.revokedCertificates || crlData.revocationList?.revokedCertificates || []);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load certificate data');
      console.error('Error fetching certificate data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRotateCertificate() {
    setRotationLoading(true);
    setRotationMessage('');
    
    try {
      const response = await fetch(`/api/admin/certificates/rotate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.message || 'Certificate rotation failed');
      }
      
      const data = await response.json();
      setRotationMessage(`✅ Rotation started successfully! New certificate: ${data.newCertificate?.subject}`);
      
      // Refresh data after 2 seconds
      setTimeout(() => {
        fetchData();
        setRotationModalOpen(false);
      }, 2000);

    } catch (err) {
      setRotationMessage(`❌ ${err instanceof Error ? err.message : 'Rotation failed'}`);
    } finally {
      setRotationLoading(false);
    }
  }

  async function handleRevokeCertificate() {
    setRevokeLoading(true);
    
    try {
      const response = await fetch(`/api/admin/certificates/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serialNumber: revokeSerialNumber,
          reason: revokeReason,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.message || 'Revocation failed');
      }
      
      alert('✅ Certificate revoked successfully');
      setRevokeModalOpen(false);
      setRevokeSerialNumber('');
      fetchData();

    } catch (err) {
      alert(`❌ ${err instanceof Error ? err.message : 'Revocation failed'}`);
    } finally {
      setRevokeLoading(false);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading certificate management...</p>
        </div>
      </div>
    );
  }

  if (!session || !health) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'valid':
        return 'text-green-600 bg-green-100 border-green-300';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100 border-yellow-300';
      case 'critical':
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

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
    { id: 'rotation', label: 'Rotation', icon: <RefreshCw className="w-4 h-4" /> },
    { id: 'crl', label: 'Revocation', icon: <XCircle className="w-4 h-4" /> },
  ];

  return (
    <PageLayout
      user={session.user}
    >
      <AdminPageTransition pageKey="/admin/certificates">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 rounded-2xl p-8 md:p-12 mb-8 shadow-2xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 60% 40%, white 2px, transparent 2px)`,
            backgroundSize: '45px 45px'
          }} />
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl">
                <Shield className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 data-testid="admin-heading" className="text-4xl md:text-5xl font-bold text-white mb-2">
                  Certificate Management
                </h1>
                <p className="text-blue-100 text-lg max-w-3xl">
                  Manage three-tier PKI infrastructure, rotation workflows, and certificate revocation
                </p>
              </div>
            </div>
            <PresenceIndicator page="certificates" />
          </div>

          {/* Overall Health Status */}
          <div className="mt-6 bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-xl ${
                  health.overallHealth.status === 'healthy' ? 'bg-green-500' : 
                  health.overallHealth.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                }`}>
                  <Activity className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">PKI Health Status</h3>
                  <p className="text-white/80 text-sm">
                    {health.overallHealth.healthyCount}/{health.overallHealth.totalCount} certificates healthy
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold uppercase ${
                  health.overallHealth.status === 'healthy' ? 'text-green-300' : 
                  health.overallHealth.status === 'warning' ? 'text-yellow-300' : 'text-red-300'
                }`}>
                  {health.overallHealth.status}
                </p>
                {health.overallHealth.warnings.length > 0 && (
                  <p className="text-white/80 text-xs mt-1">
                    {health.overallHealth.warnings.length} warning(s)
                  </p>
                )}
              </div>

              {/* Quick Actions */}
              <div className="flex gap-3">
                <AnimatedButton
                  onClick={() => setRotationModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all backdrop-blur-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Rotate Certificate
                </AnimatedButton>
                <AnimatedButton
                  onClick={() => setRevokeModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all backdrop-blur-sm"
                >
                  <XCircle className="w-4 h-4" />
                  Revoke Certificate
                </AnimatedButton>
              </div>
            </div>

            {/* Warnings */}
            {health.overallHealth.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {health.overallHealth.warnings.map((warning, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-yellow-500/20 backdrop-blur-sm rounded-lg p-3 border border-yellow-300/30">
                    <AlertTriangle className="w-5 h-5 text-yellow-300" />
                    <p className="text-white/90 text-sm">{warning}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 bg-white rounded-xl p-2 shadow-md border border-gray-200">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <AnimatedButton
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.icon}
              {tab.label}
            </AnimatedButton>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Certificates Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {health.certificates.map((cert, idx) => (
              <div key={idx} className="bg-white rounded-xl p-6 border-2 shadow-lg hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl ${
                      cert.type === 'root' ? 'bg-gradient-to-br from-blue-500 to-indigo-600' :
                      cert.type === 'intermediate' ? 'bg-gradient-to-br from-green-500 to-teal-600' :
                      'bg-gradient-to-br from-purple-500 to-pink-600'
                    }`}>
                      {cert.type === 'root' ? <Server className="w-6 h-6 text-white" /> :
                       cert.type === 'intermediate' ? <Key className="w-6 h-6 text-white" /> :
                       <Lock className="w-6 h-6 text-white" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 capitalize">{cert.type} CA</h3>
                      <p className="text-xs text-gray-500">Certificate</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(cert.status)}`}>
                    {cert.status.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Subject:</p>
                    <p className="text-xs font-mono text-gray-900 break-all">{cert.subject}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Serial Number:</p>
                    <p className="text-xs font-mono text-gray-900">{cert.serialNumber}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Valid From:</p>
                      <p className="text-xs font-semibold text-gray-900">
                        {new Date(cert.validFrom).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-500 mb-1">Valid To:</p>
                      <p className="text-xs font-semibold text-gray-900">
                        {new Date(cert.validTo).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center gap-2">
                      <Clock className={`w-5 h-5 ${getExpiryColor(cert.daysUntilExpiry)}`} />
                      <div>
                        <p className="text-xs text-gray-600">Expires in:</p>
                        <p className={`text-lg font-bold ${getExpiryColor(cert.daysUntilExpiry)}`}>
                          {cert.daysUntilExpiry} days
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 mt-2">
                    <p>Key Size: {cert.keySize} bits</p>
                    <p className="font-mono mt-1 text-[10px] truncate">{cert.path}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'rotation' && (
        <div className="bg-white rounded-xl p-8 shadow-lg border border-gray-200">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="p-4 bg-purple-100 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <RefreshCw className="w-10 h-10 text-purple-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Certificate Rotation</h2>
              <p className="text-gray-600">
                Rotate the signing certificate with zero-downtime overlap period
              </p>
            </div>

            {health.rotationStatus?.inProgress && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-bold text-yellow-900 mb-2">Rotation In Progress</p>
                    <p className="text-sm text-yellow-800 mb-2">
                      Started: {health.rotationStatus.startedAt ? new Date(health.rotationStatus.startedAt).toLocaleString() : 'Unknown'}
                    </p>
                    <p className="text-xs text-yellow-700 mb-1">
                      Current: {health.rotationStatus.currentCertificate}
                    </p>
                    <p className="text-xs text-yellow-700">
                      New: {health.rotationStatus.newCertificate}
                    </p>
                    <div className="mt-4 flex gap-3">
                      <AnimatedButton className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                        Complete Rotation
                      </AnimatedButton>
                      <AnimatedButton className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                        Rollback
                      </AnimatedButton>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-2">Rotation Process:</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
                  <li>Generate new signing certificate (signed by Intermediate CA)</li>
                  <li>Both old and new certificates remain valid (overlap period)</li>
                  <li>New signatures use new certificate</li>
                  <li>Old signatures still verify with old certificate</li>
                  <li>After 24 hours, complete rotation to retire old certificate</li>
                </ol>
              </div>

              <AnimatedButton
                onClick={() => setRotationModalOpen(true)}
                disabled={health.rotationStatus?.inProgress}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-5 h-5" />
                {health.rotationStatus?.inProgress ? 'Rotation In Progress' : 'Start Certificate Rotation'}
              </AnimatedButton>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'crl' && (
        <div className="bg-white rounded-xl p-8 shadow-lg border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Certificate Revocation List</h2>
              <p className="text-gray-600">
                {crl.length} revoked certificate(s)
              </p>
            </div>
            <AnimatedButton
              onClick={() => setRevokeModalOpen(true)}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all shadow-lg"
            >
              <XCircle className="w-5 h-5" />
              Revoke Certificate
            </AnimatedButton>
          </div>

          {crl.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">No revoked certificates</p>
              <p className="text-gray-500 text-sm mt-2">All certificates in the chain are valid</p>
            </div>
          ) : (
            <div className="space-y-4">
              {crl.map((entry, idx) => (
                <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <p className="font-mono text-sm text-gray-900 mb-1">
                        Serial: {entry.serialNumber}
                      </p>
                      <p className="text-xs text-gray-600">
                        Revoked: {new Date(entry.revokedAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-600">
                        Reason: {entry.reason}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rotation Modal */}
      {rotationModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Confirm Certificate Rotation</h3>
            <p className="text-gray-600 mb-6">
              This will generate a new signing certificate and start the rotation process. 
              The old certificate will remain valid during the overlap period.
            </p>
            
            {rotationMessage && (
              <div className={`mb-4 p-4 rounded-lg ${
                rotationMessage.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                {rotationMessage}
              </div>
            )}

            <div className="flex gap-3">
              <AnimatedButton
                onClick={handleRotateCertificate}
                disabled={rotationLoading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50"
              >
                {rotationLoading ? 'Starting...' : 'Start Rotation'}
              </AnimatedButton>
              <AnimatedButton
                onClick={() => setRotationModalOpen(false)}
                disabled={rotationLoading}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-xl font-semibold hover:bg-gray-300 transition-all disabled:opacity-50"
              >
                Cancel
              </AnimatedButton>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Modal */}
      {revokeModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Revoke Certificate</h3>
            <p className="text-gray-600 mb-6">
              Enter the serial number of the certificate to revoke. This action cannot be undone.
            </p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={revokeSerialNumber}
                  onChange={(e) => setRevokeSerialNumber(e.target.value)}
                  placeholder="Enter certificate serial number"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Revocation Reason
                </label>
                <select
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="unspecified">Unspecified</option>
                  <option value="keyCompromise">Key Compromise</option>
                  <option value="caCompromise">CA Compromise</option>
                  <option value="affiliationChanged">Affiliation Changed</option>
                  <option value="superseded">Superseded</option>
                  <option value="cessationOfOperation">Cessation of Operation</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <AnimatedButton
                onClick={handleRevokeCertificate}
                disabled={revokeLoading || !revokeSerialNumber}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all disabled:opacity-50"
              >
                {revokeLoading ? 'Revoking...' : 'Revoke Certificate'}
              </AnimatedButton>
              <AnimatedButton
                onClick={() => setRevokeModalOpen(false)}
                disabled={revokeLoading}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-xl font-semibold hover:bg-gray-300 transition-all disabled:opacity-50"
              >
                Cancel
              </AnimatedButton>
            </div>
          </div>
        </div>
      )}
      </AdminPageTransition>
    </PageLayout>
  );
}
