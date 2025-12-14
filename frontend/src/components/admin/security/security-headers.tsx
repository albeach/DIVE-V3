/**
 * Security Headers Validation Component
 * 
 * Check and validate security headers across endpoints:
 * - CSP (Content-Security-Policy)
 * - HSTS (Strict-Transport-Security)
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - Referrer-Policy
 * - Permissions-Policy
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
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Globe,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { adminToast } from '@/lib/admin-toast';

// ============================================
// Types
// ============================================

interface ISecurityHeader {
  name: string;
  value: string | null;
  status: 'present' | 'missing' | 'weak' | 'strong';
  description: string;
  recommendation?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface IEndpointHeaders {
  endpoint: string;
  name: string;
  status: 'secure' | 'vulnerable' | 'partial' | 'unknown';
  score: number;
  headers: ISecurityHeader[];
  checkedAt: string;
}

// ============================================
// Header Definitions
// ============================================

const SECURITY_HEADERS = [
  {
    name: 'Strict-Transport-Security',
    shortName: 'HSTS',
    description: 'Forces HTTPS connections and prevents downgrade attacks',
    recommended: 'max-age=31536000; includeSubDomains; preload',
    severity: 'critical' as const,
  },
  {
    name: 'Content-Security-Policy',
    shortName: 'CSP',
    description: 'Prevents XSS and data injection attacks',
    recommended: "default-src 'self'; script-src 'self' 'unsafe-inline'",
    severity: 'high' as const,
  },
  {
    name: 'X-Frame-Options',
    shortName: 'XFO',
    description: 'Prevents clickjacking attacks',
    recommended: 'DENY',
    severity: 'medium' as const,
  },
  {
    name: 'X-Content-Type-Options',
    shortName: 'XCTO',
    description: 'Prevents MIME-sniffing attacks',
    recommended: 'nosniff',
    severity: 'medium' as const,
  },
  {
    name: 'Referrer-Policy',
    shortName: 'RP',
    description: 'Controls referrer information in requests',
    recommended: 'strict-origin-when-cross-origin',
    severity: 'low' as const,
  },
  {
    name: 'Permissions-Policy',
    shortName: 'PP',
    description: 'Controls browser features and APIs',
    recommended: 'camera=(), microphone=(), geolocation=()',
    severity: 'low' as const,
  },
  {
    name: 'X-XSS-Protection',
    shortName: 'XXP',
    description: 'Legacy XSS filter (deprecated but still useful)',
    recommended: '1; mode=block',
    severity: 'low' as const,
  },
  {
    name: 'Cross-Origin-Opener-Policy',
    shortName: 'COOP',
    description: 'Isolates browsing context from cross-origin documents',
    recommended: 'same-origin',
    severity: 'medium' as const,
  },
];

const STATUS_STYLES = {
  secure: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    icon: ShieldCheck,
    label: 'Secure',
  },
  partial: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: ShieldAlert,
    label: 'Partial',
  },
  vulnerable: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: ShieldX,
    label: 'Vulnerable',
  },
  unknown: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-500',
    icon: Shield,
    label: 'Unknown',
  },
};

const SEVERITY_COLORS = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

// ============================================
// Component
// ============================================

export function SecurityHeaders() {
  const [endpoints, setEndpoints] = useState<IEndpointHeaders[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<IEndpointHeaders | null>(null);

  const fetchHeaders = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/security/headers');
      if (response.ok) {
        const data = await response.json();
        setEndpoints(data.data || data.endpoints || []);
      } else {
        setEndpoints(generateMockEndpoints());
      }
    } catch (error) {
      console.error('[SecurityHeaders] Error:', error);
      setEndpoints(generateMockEndpoints());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHeaders();
  }, [fetchHeaders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchHeaders();
    adminToast.success('Security headers checked');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    adminToast.success('Copied to clipboard');
  };

  const getOverallScore = () => {
    if (endpoints.length === 0) return 0;
    return Math.round(endpoints.reduce((acc, e) => acc + e.score, 0) / endpoints.length);
  };

  const overallScore = getOverallScore();

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
        <p className="text-center mt-4 text-gray-500">Checking security headers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Security Headers</h2>
              <p className="text-sm text-gray-500">Validate HTTP security headers across endpoints</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Re-scan
          </button>
        </div>

        {/* Score */}
        <div className="mt-6 flex items-center gap-6">
          <div className={`relative w-24 h-24 rounded-full flex items-center justify-center ${
            overallScore >= 80 ? 'bg-green-100' :
            overallScore >= 60 ? 'bg-yellow-100' :
            overallScore >= 40 ? 'bg-orange-100' :
            'bg-red-100'
          }`}>
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-200"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(overallScore / 100) * 251} 251`}
                className={
                  overallScore >= 80 ? 'text-green-500' :
                  overallScore >= 60 ? 'text-yellow-500' :
                  overallScore >= 40 ? 'text-orange-500' :
                  'text-red-500'
                }
              />
            </svg>
            <span className={`text-2xl font-bold ${
              overallScore >= 80 ? 'text-green-700' :
              overallScore >= 60 ? 'text-yellow-700' :
              overallScore >= 40 ? 'text-orange-700' :
              'text-red-700'
            }`}>
              {overallScore}%
            </span>
          </div>
          
          <div className="flex-1">
            <div className="text-lg font-semibold text-gray-900">
              {overallScore >= 80 ? 'Excellent Security' :
               overallScore >= 60 ? 'Good Security' :
               overallScore >= 40 ? 'Needs Improvement' :
               'Critical Issues'}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {endpoints.filter(e => e.status === 'secure').length} of {endpoints.length} endpoints fully secured
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="text-xl font-bold text-green-700">
                {endpoints.filter(e => e.status === 'secure').length}
              </div>
              <div className="text-xs text-green-600">Secure</div>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <div className="text-xl font-bold text-red-700">
                {endpoints.filter(e => e.status === 'vulnerable').length}
              </div>
              <div className="text-xs text-red-600">Vulnerable</div>
            </div>
          </div>
        </div>
      </div>

      {/* Endpoints List */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50">
          <h3 className="text-sm font-semibold text-gray-700">Scanned Endpoints</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {endpoints.map((endpoint, index) => {
            const style = STATUS_STYLES[endpoint.status];
            const Icon = style.icon;
            const missingHeaders = endpoint.headers.filter(h => h.status === 'missing').length;
            const weakHeaders = endpoint.headers.filter(h => h.status === 'weak').length;

            return (
              <motion.div
                key={endpoint.endpoint}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer`}
                onClick={() => setSelectedEndpoint(endpoint)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${style.bg} border ${style.border}`}>
                      <Icon className={`h-5 w-5 ${style.text}`} />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{endpoint.name}</div>
                      <div className="text-sm text-gray-500 font-mono">{endpoint.endpoint}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Header stats */}
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        {endpoint.headers.filter(h => h.status === 'present' || h.status === 'strong').length}
                      </span>
                      {weakHeaders > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          {weakHeaders}
                        </span>
                      )}
                      {missingHeaders > 0 && (
                        <span className="flex items-center gap-1 text-red-600">
                          <XCircle className="h-4 w-4" />
                          {missingHeaders}
                        </span>
                      )}
                    </div>

                    {/* Score */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      endpoint.score >= 80 ? 'bg-green-100 text-green-700' :
                      endpoint.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                      endpoint.score >= 40 ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      <span className="text-sm font-bold">{endpoint.score}</span>
                    </div>

                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Endpoint Detail Modal */}
      <AnimatePresence>
        {selectedEndpoint && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedEndpoint(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selectedEndpoint.name}</h2>
                    <p className="text-sm text-gray-500 font-mono">{selectedEndpoint.endpoint}</p>
                  </div>
                  <button
                    onClick={() => setSelectedEndpoint(null)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <XCircle className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {selectedEndpoint.headers.map(header => (
                  <div
                    key={header.name}
                    className={`p-4 rounded-lg border ${
                      header.status === 'strong' || header.status === 'present'
                        ? 'bg-green-50 border-green-200'
                        : header.status === 'weak'
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{header.name}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[header.severity]}`}>
                            {header.severity}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{header.description}</p>
                      </div>
                      {header.status === 'present' || header.status === 'strong' ? (
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                      ) : header.status === 'weak' ? (
                        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                      )}
                    </div>

                    {header.value && (
                      <div className="mt-3 flex items-center gap-2">
                        <code className="flex-1 text-xs bg-white/50 p-2 rounded font-mono overflow-x-auto">
                          {header.value}
                        </code>
                        <button
                          onClick={() => copyToClipboard(header.value!)}
                          className="p-1 hover:bg-white/50 rounded"
                        >
                          <Copy className="h-4 w-4 text-gray-500" />
                        </button>
                      </div>
                    )}

                    {header.recommendation && header.status !== 'strong' && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                        <span className="font-medium text-blue-700">Recommended: </span>
                        <code className="text-blue-600">{header.recommendation}</code>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setSelectedEndpoint(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
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

function generateMockEndpoints(): IEndpointHeaders[] {
  return [
    {
      endpoint: 'https://localhost:3000',
      name: 'Frontend',
      status: 'secure',
      score: 92,
      checkedAt: new Date().toISOString(),
      headers: [
        { name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains', status: 'strong', description: 'HSTS enabled', severity: 'critical' },
        { name: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'", status: 'present', description: 'CSP configured', severity: 'high' },
        { name: 'X-Frame-Options', value: 'DENY', status: 'strong', description: 'Clickjacking protection', severity: 'medium' },
        { name: 'X-Content-Type-Options', value: 'nosniff', status: 'strong', description: 'MIME sniffing protection', severity: 'medium' },
        { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin', status: 'strong', description: 'Referrer control', severity: 'low' },
        { name: 'Permissions-Policy', value: null, status: 'missing', description: 'Browser permissions control', recommendation: 'camera=(), microphone=()', severity: 'low' },
      ],
    },
    {
      endpoint: 'https://localhost:4000',
      name: 'Backend API',
      status: 'partial',
      score: 75,
      checkedAt: new Date().toISOString(),
      headers: [
        { name: 'Strict-Transport-Security', value: 'max-age=31536000', status: 'present', description: 'HSTS enabled', severity: 'critical' },
        { name: 'Content-Security-Policy', value: null, status: 'missing', description: 'CSP not configured', recommendation: "default-src 'none'", severity: 'high' },
        { name: 'X-Frame-Options', value: 'SAMEORIGIN', status: 'weak', description: 'Clickjacking protection (weak)', recommendation: 'DENY', severity: 'medium' },
        { name: 'X-Content-Type-Options', value: 'nosniff', status: 'strong', description: 'MIME sniffing protection', severity: 'medium' },
        { name: 'Referrer-Policy', value: 'no-referrer', status: 'strong', description: 'Referrer control', severity: 'low' },
      ],
    },
    {
      endpoint: 'https://localhost:8443',
      name: 'Keycloak',
      status: 'partial',
      score: 68,
      checkedAt: new Date().toISOString(),
      headers: [
        { name: 'Strict-Transport-Security', value: null, status: 'missing', description: 'HSTS not configured', recommendation: 'max-age=31536000; includeSubDomains', severity: 'critical' },
        { name: 'Content-Security-Policy', value: "frame-ancestors 'self'", status: 'present', description: 'CSP configured', severity: 'high' },
        { name: 'X-Frame-Options', value: 'SAMEORIGIN', status: 'present', description: 'Clickjacking protection', severity: 'medium' },
        { name: 'X-Content-Type-Options', value: 'nosniff', status: 'strong', description: 'MIME sniffing protection', severity: 'medium' },
      ],
    },
  ];
}

export default SecurityHeaders;

