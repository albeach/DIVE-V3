/**
 * Validation Results Panel Component
 * 
 * Displays automated security validation results for IdP submissions
 * Shows TLS, crypto, metadata/discovery, MFA, and endpoint checks
 * Color-coded status indicators with preliminary risk score
 */

'use client';

import React from 'react';

// Validation result types (matching backend)
interface ValidationResultsPanelProps {
  validationResults?: {
    tlsCheck: {
      pass: boolean;
      version: string;
      cipher: string;
      score: number;
      errors: string[];
      warnings: string[];
    };
    algorithmCheck: {
      pass: boolean;
      algorithms: string[];
      violations: string[];
      score: number;
      recommendations: string[];
    };
    endpointCheck: {
      reachable: boolean;
      latency_ms: number;
      score: number;
      errors: string[];
    };
    metadataCheck?: {
      valid: boolean;
      entityId: string;
      ssoUrl: string;
      errors: string[];
      warnings: string[];
    };
    discoveryCheck?: {
      valid: boolean;
      issuer: string;
      endpoints: any;
      jwks: any;
      errors: string[];
      warnings: string[];
    };
    mfaCheck: {
      detected: boolean;
      evidence: string[];
      score: number;
      confidence: 'high' | 'medium' | 'low';
      recommendations: string[];
    };
  };
  preliminaryScore?: {
    total: number;
    maxScore: number;
    breakdown: {
      tlsScore: number;
      cryptoScore: number;
      mfaScore: number;
      endpointScore: number;
    };
    tier?: 'gold' | 'silver' | 'bronze' | 'fail';
  };
}

export default function ValidationResultsPanel({ 
  validationResults, 
  preliminaryScore 
}: ValidationResultsPanelProps) {
  if (!validationResults || !preliminaryScore) {
    return (
      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
        <p className="text-gray-600">
          Validation results will appear here after configuration is complete.
        </p>
      </div>
    );
  }

  // Determine tier color and label
  const getTierBadge = (tier?: string) => {
    switch (tier) {
      case 'gold':
        return <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">Gold Tier</span>;
      case 'silver':
        return <span className="px-3 py-1 bg-gray-200 text-gray-800 rounded-full text-sm font-semibold">Silver Tier</span>;
      case 'bronze':
        return <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-semibold">Bronze Tier</span>;
      case 'fail':
        return <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">Failed</span>;
      default:
        return null;
    }
  };

  // Status icon helper
  const getStatusIcon = (pass: boolean, hasWarnings: boolean = false) => {
    if (pass && !hasWarnings) {
      return <span className="text-green-600 text-xl">✅</span>;
    } else if (pass && hasWarnings) {
      return <span className="text-yellow-600 text-xl">⚠️</span>;
    } else {
      return <span className="text-red-600 text-xl">❌</span>;
    }
  };

  const percentage = Math.round((preliminaryScore.total / preliminaryScore.maxScore) * 100);

  return (
    <div className="space-y-6">
      {/* Score Summary Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Security Validation Results</h3>
          {getTierBadge(preliminaryScore.tier)}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-gray-900">{preliminaryScore.total}</span>
              <span className="text-xl text-gray-600">/ {preliminaryScore.maxScore}</span>
              <span className="text-lg text-gray-500">points</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {percentage}% security score
            </p>
          </div>
          
          {/* Score Breakdown */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-600">TLS:</span>
              <span className="ml-2 font-semibold">{preliminaryScore.breakdown.tlsScore}/15</span>
            </div>
            <div>
              <span className="text-gray-600">Crypto:</span>
              <span className="ml-2 font-semibold">{preliminaryScore.breakdown.cryptoScore}/25</span>
            </div>
            <div>
              <span className="text-gray-600">MFA:</span>
              <span className="ml-2 font-semibold">{preliminaryScore.breakdown.mfaScore}/20</span>
            </div>
            <div>
              <span className="text-gray-600">Endpoint:</span>
              <span className="ml-2 font-semibold">{preliminaryScore.breakdown.endpointScore}/10</span>
            </div>
          </div>
        </div>
      </div>

      {/* Validation Checks */}
      <div className="space-y-4">
        <h4 className="font-semibold text-gray-900">Validation Checks</h4>

        {/* TLS Check */}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-start gap-3">
            {getStatusIcon(validationResults.tlsCheck.pass, validationResults.tlsCheck.warnings.length > 0)}
            <div className="flex-1">
              <h5 className="font-medium text-gray-900">TLS Security</h5>
              {validationResults.tlsCheck.pass ? (
                <div className="mt-1 text-sm text-gray-600">
                  <p>✓ {validationResults.tlsCheck.version} with {validationResults.tlsCheck.cipher}</p>
                  <p className="text-xs text-gray-500 mt-1">Score: {validationResults.tlsCheck.score}/15 points</p>
                </div>
              ) : (
                <div className="mt-1">
                  {validationResults.tlsCheck.errors.map((error, idx) => (
                    <p key={idx} className="text-sm text-red-600">{error}</p>
                  ))}
                </div>
              )}
              {validationResults.tlsCheck.warnings.length > 0 && (
                <div className="mt-2 space-y-1">
                  {validationResults.tlsCheck.warnings.map((warning, idx) => (
                    <p key={idx} className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">{warning}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Algorithm Check */}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-start gap-3">
            {getStatusIcon(validationResults.algorithmCheck.pass, validationResults.algorithmCheck.violations.length > 0)}
            <div className="flex-1">
              <h5 className="font-medium text-gray-900">Cryptographic Algorithms</h5>
              {validationResults.algorithmCheck.pass ? (
                <div className="mt-1 text-sm text-gray-600">
                  <p>✓ {validationResults.algorithmCheck.algorithms.join(', ')}</p>
                  <p className="text-xs text-gray-500 mt-1">Score: {validationResults.algorithmCheck.score}/25 points</p>
                </div>
              ) : (
                <div className="mt-1">
                  {validationResults.algorithmCheck.violations.map((violation, idx) => (
                    <p key={idx} className="text-sm text-red-600">{violation}</p>
                  ))}
                </div>
              )}
              {validationResults.algorithmCheck.recommendations.length > 0 && (
                <div className="mt-2 space-y-1">
                  {validationResults.algorithmCheck.recommendations.map((rec, idx) => (
                    <p key={idx} className="text-xs text-blue-700 bg-blue-50 p-2 rounded">💡 {rec}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SAML Metadata Check (if applicable) */}
        {validationResults.metadataCheck && (
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-start gap-3">
              {getStatusIcon(validationResults.metadataCheck.valid, validationResults.metadataCheck.warnings.length > 0)}
              <div className="flex-1">
                <h5 className="font-medium text-gray-900">SAML Metadata</h5>
                {validationResults.metadataCheck.valid ? (
                  <div className="mt-1 text-sm text-gray-600">
                    <p>✓ Entity ID: {validationResults.metadataCheck.entityId}</p>
                    <p className="text-xs text-gray-500 mt-1">SSO URL: {validationResults.metadataCheck.ssoUrl}</p>
                  </div>
                ) : (
                  <div className="mt-1">
                    {validationResults.metadataCheck.errors.map((error, idx) => (
                      <p key={idx} className="text-sm text-red-600">{error}</p>
                    ))}
                  </div>
                )}
                {validationResults.metadataCheck.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {validationResults.metadataCheck.warnings.map((warning, idx) => (
                      <p key={idx} className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">{warning}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* OIDC Discovery Check (if applicable) */}
        {validationResults.discoveryCheck && (
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-start gap-3">
              {getStatusIcon(validationResults.discoveryCheck.valid, validationResults.discoveryCheck.warnings.length > 0)}
              <div className="flex-1">
                <h5 className="font-medium text-gray-900">OIDC Discovery</h5>
                {validationResults.discoveryCheck.valid ? (
                  <div className="mt-1 text-sm text-gray-600">
                    <p>✓ Issuer: {validationResults.discoveryCheck.issuer}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      All required endpoints verified ({validationResults.discoveryCheck.jwks.keyCount} keys)
                    </p>
                  </div>
                ) : (
                  <div className="mt-1">
                    {validationResults.discoveryCheck.errors.map((error, idx) => (
                      <p key={idx} className="text-sm text-red-600">{error}</p>
                    ))}
                  </div>
                )}
                {validationResults.discoveryCheck.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {validationResults.discoveryCheck.warnings.map((warning, idx) => (
                      <p key={idx} className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">{warning}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MFA Detection */}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-start gap-3">
            {getStatusIcon(validationResults.mfaCheck.detected, !validationResults.mfaCheck.detected)}
            <div className="flex-1">
              <h5 className="font-medium text-gray-900">Multi-Factor Authentication</h5>
              {validationResults.mfaCheck.detected ? (
                <div className="mt-1 text-sm text-gray-600">
                  <p>✓ MFA capability detected ({validationResults.mfaCheck.confidence} confidence)</p>
                  {validationResults.mfaCheck.evidence.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-gray-500">
                      {validationResults.mfaCheck.evidence.map((evidence, idx) => (
                        <li key={idx}>• {evidence}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Score: {validationResults.mfaCheck.score}/20 points</p>
                </div>
              ) : (
                <div className="mt-1">
                  <p className="text-sm text-yellow-700">⚠️ No MFA evidence found</p>
                  <p className="text-xs text-gray-500 mt-1">Score: 0/20 points</p>
                </div>
              )}
              {validationResults.mfaCheck.recommendations.length > 0 && (
                <div className="mt-2 space-y-1">
                  {validationResults.mfaCheck.recommendations.map((rec, idx) => (
                    <p key={idx} className="text-xs text-blue-700 bg-blue-50 p-2 rounded">💡 {rec}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Endpoint Check */}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-start gap-3">
            {getStatusIcon(validationResults.endpointCheck.reachable)}
            <div className="flex-1">
              <h5 className="font-medium text-gray-900">Endpoint Reachability</h5>
              {validationResults.endpointCheck.reachable ? (
                <div className="mt-1 text-sm text-gray-600">
                  <p>✓ Endpoint reachable ({validationResults.endpointCheck.latency_ms}ms)</p>
                  <p className="text-xs text-gray-500 mt-1">Score: {validationResults.endpointCheck.score}/10 points</p>
                </div>
              ) : (
                <div className="mt-1">
                  {validationResults.endpointCheck.errors.map((error, idx) => (
                    <p key={idx} className="text-sm text-red-600">{error}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h5 className="font-medium text-blue-900 mb-2">What happens next?</h5>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Your IdP configuration will be reviewed by a super administrator</li>
          <li>• Validation results help prioritize secure configurations</li>
          {preliminaryScore.tier === 'fail' && (
            <li className="text-red-700 font-semibold">• ⚠️ Critical issues must be fixed before approval</li>
          )}
          {preliminaryScore.tier !== 'fail' && (
            <li>• You can improve your score by addressing warnings above</li>
          )}
        </ul>
      </div>
    </div>
  );
}

