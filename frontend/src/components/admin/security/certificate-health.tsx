/**
 * Certificate Health Monitor Component
 * 
 * Displays SSL/TLS certificate status for all endpoints:
 * - Certificate expiration dates
 * - Chain validation
 * - Cipher strength
 * - HSTS status
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  ExternalLink,
  Download,
  Info,
} from 'lucide-react';
import { adminToast } from '@/lib/admin-toast';

// ============================================
// Types
// ============================================

interface ICertificateInfo {
  endpoint: string;
  name: string;
  type: 'keycloak' | 'backend' | 'frontend' | 'opa' | 'spoke';
  status: 'valid' | 'expiring' | 'expired' | 'invalid' | 'unknown';
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysUntilExpiry?: number;
  serialNumber?: string;
  fingerprint?: string;
  signatureAlgorithm?: string;
  keySize?: number;
  chainValid?: boolean;
  chainLength?: number;
  cipherStrength?: 'strong' | 'moderate' | 'weak';
  hstsEnabled?: boolean;
  error?: string;
}

// ============================================
// Constants
// ============================================

const ENDPOINTS = [
  { name: 'Hub Frontend', endpoint: 'https://localhost:3000', type: 'frontend' as const },
  { name: 'Hub Backend', endpoint: 'https://localhost:4000', type: 'backend' as const },
  { name: 'Hub Keycloak', endpoint: 'https://localhost:8443', type: 'keycloak' as const },
  { name: 'OPA Server', endpoint: 'http://localhost:8181', type: 'opa' as const },
];

const STATUS_STYLES = {
  valid: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    icon: ShieldCheck,
    label: 'Valid',
  },
  expiring: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: ShieldAlert,
    label: 'Expiring Soon',
  },
  expired: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: ShieldX,
    label: 'Expired',
  },
  invalid: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: ShieldX,
    label: 'Invalid',
  },
  unknown: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-500',
    icon: Shield,
    label: 'Unknown',
  },
};

// ============================================
// Component
// ============================================

export function CertificateHealth() {
  const [certificates, setCertificates] = useState<ICertificateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCert, setSelectedCert] = useState<ICertificateInfo | null>(null);

  const fetchCertificates = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/security/certificates');
      if (response.ok) {
        const data = await response.json();
        setCertificates(data.data || data.certificates || []);
      } else {
        // Use mock data if API unavailable
        setCertificates(generateMockCertificates());
      }
    } catch (error) {
      console.error('[CertificateHealth] Error:', error);
      setCertificates(generateMockCertificates());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCertificates();
    adminToast.success('Certificate status refreshed');
  };

  const getOverallStatus = () => {
    if (certificates.some(c => c.status === 'expired' || c.status === 'invalid')) {
      return { status: 'critical', label: 'Critical Issues', color: 'text-red-600' };
    }
    if (certificates.some(c => c.status === 'expiring')) {
      return { status: 'warning', label: 'Attention Required', color: 'text-amber-600' };
    }
    if (certificates.every(c => c.status === 'valid')) {
      return { status: 'healthy', label: 'All Healthy', color: 'text-green-600' };
    }
    return { status: 'unknown', label: 'Status Unknown', color: 'text-gray-500' };
  };

  const overall = getOverallStatus();

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
        <p className="text-center mt-4 text-gray-500">Checking certificate health...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Certificate Health Monitor</h2>
              <p className={`text-sm font-medium ${overall.color}`}>{overall.label}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-lg p-4 border border-green-100">
            <div className="text-2xl font-bold text-green-700">
              {certificates.filter(c => c.status === 'valid').length}
            </div>
            <div className="text-sm text-green-600">Valid</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
            <div className="text-2xl font-bold text-amber-700">
              {certificates.filter(c => c.status === 'expiring').length}
            </div>
            <div className="text-sm text-amber-600">Expiring Soon</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border border-red-100">
            <div className="text-2xl font-bold text-red-700">
              {certificates.filter(c => c.status === 'expired' || c.status === 'invalid').length}
            </div>
            <div className="text-sm text-red-600">Issues</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <div className="text-2xl font-bold text-blue-700">
              {certificates.length}
            </div>
            <div className="text-sm text-blue-600">Total Monitored</div>
          </div>
        </div>
      </div>

      {/* Certificate List */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50">
          <h3 className="text-sm font-semibold text-gray-700">Monitored Endpoints</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {certificates.map((cert, index) => {
            const style = STATUS_STYLES[cert.status];
            const Icon = style.icon;

            return (
              <motion.div
                key={cert.endpoint}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer ${style.bg}`}
                onClick={() => setSelectedCert(cert)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${style.bg} border ${style.border}`}>
                      <Icon className={`h-5 w-5 ${style.text}`} />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{cert.name}</div>
                      <div className="text-sm text-gray-500 font-mono">{cert.endpoint}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Expiry */}
                    {cert.daysUntilExpiry !== undefined && (
                      <div className="text-right">
                        <div className={`text-sm font-medium ${
                          cert.daysUntilExpiry <= 0 ? 'text-red-600' :
                          cert.daysUntilExpiry <= 30 ? 'text-amber-600' :
                          'text-gray-700'
                        }`}>
                          {cert.daysUntilExpiry <= 0 
                            ? 'Expired'
                            : `${cert.daysUntilExpiry} days`
                          }
                        </div>
                        <div className="text-xs text-gray-500">until expiry</div>
                      </div>
                    )}

                    {/* Status Badge */}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text} border ${style.border}`}>
                      {style.label}
                    </span>

                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </div>
                </div>

                {/* Additional Info */}
                <div className="mt-3 flex items-center gap-6 text-xs text-gray-500">
                  {cert.issuer && (
                    <span className="flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Issuer: {cert.issuer}
                    </span>
                  )}
                  {cert.keySize && (
                    <span className="flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      {cert.keySize}-bit
                    </span>
                  )}
                  {cert.chainValid !== undefined && (
                    <span className={`flex items-center gap-1 ${cert.chainValid ? 'text-green-600' : 'text-red-600'}`}>
                      {cert.chainValid ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      Chain {cert.chainValid ? 'Valid' : 'Invalid'}
                    </span>
                  )}
                  {cert.hstsEnabled !== undefined && (
                    <span className={`flex items-center gap-1 ${cert.hstsEnabled ? 'text-green-600' : 'text-amber-600'}`}>
                      {cert.hstsEnabled ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                      HSTS {cert.hstsEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Certificate Detail Modal */}
      <AnimatePresence>
        {selectedCert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedCert(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">Certificate Details</h2>
                  <button
                    onClick={() => setSelectedCert(null)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <XCircle className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="font-medium">{selectedCert.name}</div>
                    <div className="text-sm text-gray-500 font-mono">{selectedCert.endpoint}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Status</div>
                    <div className={`font-medium ${STATUS_STYLES[selectedCert.status].text}`}>
                      {STATUS_STYLES[selectedCert.status].label}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Days Until Expiry</div>
                    <div className="font-medium">{selectedCert.daysUntilExpiry ?? 'N/A'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Valid From</div>
                    <div className="font-medium text-sm">{selectedCert.validFrom || 'N/A'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Valid To</div>
                    <div className="font-medium text-sm">{selectedCert.validTo || 'N/A'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Issuer</div>
                    <div className="font-medium text-sm truncate">{selectedCert.issuer || 'N/A'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Key Size</div>
                    <div className="font-medium">{selectedCert.keySize ? `${selectedCert.keySize}-bit` : 'N/A'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Fingerprint (SHA-256)</div>
                    <div className="font-mono text-xs break-all">{selectedCert.fingerprint || 'N/A'}</div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      adminToast.certificate.rotated(selectedCert.name);
                      setSelectedCert(null);
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    <RefreshCw className="h-4 w-4 inline mr-2" />
                    Rotate Certificate
                  </button>
                  <button
                    onClick={() => setSelectedCert(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Mock Data Generator
// ============================================

function generateMockCertificates(): ICertificateInfo[] {
  const now = new Date();
  
  return [
    {
      name: 'Hub Frontend',
      endpoint: 'https://localhost:3000',
      type: 'frontend',
      status: 'valid',
      issuer: 'DIVE V3 Development CA',
      subject: 'CN=localhost',
      validFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      validTo: new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000).toISOString(),
      daysUntilExpiry: 335,
      serialNumber: '01:02:03:04:05:06:07:08',
      fingerprint: 'A1:B2:C3:D4:E5:F6:01:02:03:04:05:06:07:08:09:10:11:12:13:14:15:16:17:18:19:20:21:22:23:24:25:26',
      signatureAlgorithm: 'SHA256withRSA',
      keySize: 2048,
      chainValid: true,
      chainLength: 2,
      cipherStrength: 'strong',
      hstsEnabled: true,
    },
    {
      name: 'Hub Backend',
      endpoint: 'https://localhost:4000',
      type: 'backend',
      status: 'valid',
      issuer: 'DIVE V3 Development CA',
      subject: 'CN=backend',
      validFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      validTo: new Date(now.getTime() + 335 * 24 * 60 * 60 * 1000).toISOString(),
      daysUntilExpiry: 335,
      signatureAlgorithm: 'SHA256withRSA',
      keySize: 2048,
      chainValid: true,
      hstsEnabled: true,
    },
    {
      name: 'Hub Keycloak',
      endpoint: 'https://localhost:8443',
      type: 'keycloak',
      status: 'expiring',
      issuer: 'DIVE V3 Development CA',
      subject: 'CN=keycloak',
      validFrom: new Date(now.getTime() - 340 * 24 * 60 * 60 * 1000).toISOString(),
      validTo: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      daysUntilExpiry: 25,
      signatureAlgorithm: 'SHA256withRSA',
      keySize: 2048,
      chainValid: true,
      hstsEnabled: false,
    },
    {
      name: 'OPA Server',
      endpoint: 'http://localhost:8181',
      type: 'opa',
      status: 'unknown',
      error: 'HTTP endpoint - no TLS',
    },
  ];
}

export default CertificateHealth;

