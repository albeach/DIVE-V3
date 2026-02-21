'use client';

/**
 * KAS Metrics Panel Component
 * 
 * Detailed metrics panel shown when a KAS instance is selected.
 * Displays technical specs, usage statistics, federation trust, and scenarios.
 */

import { 
  Server, 
  TrendingUp, 
  Lock, 
  CheckCircle2, 
  Activity,
  Shield,
  Globe
} from 'lucide-react';
import { 
  IKASEndpoint, 
  formatUptime, 
  formatResponseTime, 
  getCountryFlag 
} from '@/lib/api/kas';
import { KASHealthBadge } from './kas-health-badge';

interface KASMetricsPanelProps {
  kas: IKASEndpoint;
}

export function KASMetricsPanel({ kas }: KASMetricsPanelProps) {
  return (
    <div className="mb-8 animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
        <Activity className="w-7 h-7 text-green-600" />
        {kas.name} - Detailed View
      </h2>
      
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-300 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Technical Details */}
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-600" />
                Technical Specifications
              </h3>
              <div className="space-y-2">
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs text-gray-500 mb-1">Endpoint URL:</p>
                  <p className="text-sm font-mono font-bold text-gray-900 break-all">{kas.url}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs text-gray-500 mb-1">Country/Region:</p>
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <span className="text-xl">{getCountryFlag(kas.country)}</span>
                    {kas.country}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs text-gray-500 mb-1">Protocol:</p>
                  <p className="text-sm font-bold text-gray-900">HTTPS/TLS 1.3 + RSA-2048</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs text-gray-500 mb-1">p95 Response Time:</p>
                  <p className="text-sm font-bold text-green-600">
                    {kas.p95ResponseTime ? formatResponseTime(kas.p95ResponseTime) : '~45ms'}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs text-gray-500 mb-1">Status:</p>
                  <KASHealthBadge
                    status={kas.status}
                    lastHeartbeat={kas.lastHeartbeat || null}
                    circuitBreakerState={kas.circuitBreakerState}
                    showCircuitBreaker={true}
                    size="md"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Usage Statistics */}
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                Usage Statistics
              </h3>
              <div className="space-y-3">
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Uptime (24h)</span>
                    <span className="text-2xl font-bold text-green-600">{formatUptime(kas.uptime)}</span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-2">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(kas.uptime, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <p className="text-xs text-gray-500 mb-1">Requests Today:</p>
                  <p className="text-3xl font-bold text-blue-600">{kas.requestsToday.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Avg: ~{Math.round(kas.requestsToday / 24)} requests/hour
                  </p>
                </div>

                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <p className="text-xs text-gray-500 mb-1">Success Rate:</p>
                  <p className={`text-2xl font-bold ${
                    (kas.successRate || 100) >= 99 ? 'text-green-600' : 
                    (kas.successRate || 100) >= 95 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {(kas.successRate || 99.97).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.round(kas.requestsToday * (100 - (kas.successRate || 99.97)) / 100)} failed requests today
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Full Width: Federation Trust */}
          {kas.federationTrust && (
            <div className="md:col-span-2">
              <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-600" />
                Federation Trust Configuration
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <p className="text-xs text-gray-500 mb-2">Trusted Partners:</p>
                  <div className="flex flex-wrap gap-1">
                    {kas.federationTrust.trustedPartners.length > 0 ? (
                      kas.federationTrust.trustedPartners.slice(0, 8).map(partner => (
                        <span 
                          key={partner} 
                          className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full"
                        >
                          {partner.replace('-kas', '').toUpperCase()}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-500 text-sm">None configured</span>
                    )}
                    {kas.federationTrust.trustedPartners.length > 8 && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
                        +{kas.federationTrust.trustedPartners.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <p className="text-xs text-gray-500 mb-2">Max Classification:</p>
                  <span className="px-3 py-1 bg-orange-100 text-orange-800 text-sm font-bold rounded-lg">
                    {kas.federationTrust.maxClassification}
                  </span>
                </div>
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <p className="text-xs text-gray-500 mb-2">Allowed COIs:</p>
                  <div className="flex flex-wrap gap-1">
                    {kas.federationTrust.allowedCOIs.map(coi => (
                      <span 
                        key={coi} 
                        className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full"
                      >
                        {coi}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Full Width: Usage Scenarios */}
          <div className="md:col-span-2">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Lock className="w-5 h-5 text-orange-600" />
              When This KAS Is Used
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  {getCountryFlag(kas.country)} {kas.country} Users Accessing Resources
                </p>
                <p className="text-xs text-gray-600">
                  Resources tagged <code className="px-1 py-0.5 bg-gray-100 rounded">releasabilityTo: ["{kas.country}"]</code>
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  <Shield className="w-4 h-4 inline mr-1" />
                  National Key Custody
                </p>
                <p className="text-xs text-gray-600">
                  {kas.country} controls own KAS endpoint and encryption keys
                </p>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="md:col-span-2 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg p-4 border-2 border-blue-300">
            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              This KAS endpoint is currently <span className="text-green-600 uppercase">{kas.status}</span> and processing requests
            </p>
            <p className="text-xs text-gray-700 mt-2">
              {kas.status === 'active' 
                ? `In production, this endpoint is managed by ${kas.country} government infrastructure teams with dedicated monitoring, backup, and failover capabilities.`
                : `This KAS is currently ${kas.status}. Contact the administrator for more information.`
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KASMetricsPanel;
