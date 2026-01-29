/**
 * Smart Suggestions Components for Admin UI
 *
 * Displays intelligent suggestions and recommendations based on context:
 * - OIDC discovery auto-detection
 * - Protocol mapper suggestions
 * - SAML metadata pre-fill
 * - Policy pack recommendations
 * - Certificate expiry warnings
 * - Authorization anomaly alerts
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb,
  CheckCircle,
  AlertTriangle,
  Info,
  X,
  ExternalLink,
  Copy,
  RefreshCw,
  Shield,
  Key,
  FileCheck,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  adminIntelligence,
  type ProtocolMapperSuggestion,
  type PolicyPackRecommendation,
  type CertificateExpiryWarning,
  type AuthzAnomalyAlert,
} from '@/services/admin-intelligence';
import { Badge } from '@/components/ui/badge';
import { notify } from '@/lib/notification-service';

// ============================================
// OIDC Discovery Suggestion
// ============================================

interface OIDCDiscoverySuggestionProps {
  domain: string;
  onAccept: (discoveryUrl: string) => void;
  className?: string;
}

export function OIDCDiscoverySuggestion({
  domain,
  onAccept,
  className,
}: OIDCDiscoverySuggestionProps) {
  const [loading, setLoading] = useState(false);
  const [discoveryUrl, setDiscoveryUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    if (domain && domain.length > 3) {
      detectDiscovery();
    }
  }, [domain]);

  const detectDiscovery = async () => {
    setLoading(true);
    setError(null);

    // First check for well-known providers
    const provider = adminIntelligence.detectOIDCProvider(domain);
    if (provider) {
      setDiscoveryUrl(provider.discoveryUrl);
      setDetected(true);
      setLoading(false);
      return;
    }

    // Try auto-detection
    const result = await adminIntelligence.autoDetectOIDCDiscovery(domain);
    
    if (result.success && result.issuer) {
      const url = `https://${domain}/.well-known/openid-configuration`;
      setDiscoveryUrl(url);
      setDetected(true);
    } else {
      setError(result.error || 'Could not detect OIDC discovery endpoint');
    }

    setLoading(false);
  };

  if (!domain || domain.length < 3) {
    return null;
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800',
          className
        )}
      >
        <RefreshCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
        <span className="text-sm text-blue-700 dark:text-blue-300">
          Auto-detecting OIDC discovery endpoint...
        </span>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800',
          className
        )}
      >
        <Info className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm text-amber-700 dark:text-amber-300">{error}</span>
      </motion.div>
    );
  }

  if (detected && discoveryUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800',
          className
        )}
      >
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
              OIDC Discovery Endpoint Detected
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-2">
              Automatically found configuration at:
            </p>
            <code className="block px-3 py-2 bg-white dark:bg-gray-900 rounded border border-emerald-200 dark:border-emerald-800 text-xs font-mono text-gray-900 dark:text-gray-100 mb-3">
              {discoveryUrl}
            </code>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onAccept(discoveryUrl);
                  notify.toast.success('Discovery URL applied');
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Apply Automatically
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(discoveryUrl);
                  notify.toast.success('Copied to clipboard');
                }}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return null;
}

// ============================================
// Protocol Mapper Suggestions
// ============================================

interface ProtocolMapperSuggestionsProps {
  idpType: 'oidc' | 'saml';
  providerHint?: string;
  onApply: (mappers: ProtocolMapperSuggestion[]) => void;
  className?: string;
}

export function ProtocolMapperSuggestions({
  idpType,
  providerHint,
  onApply,
  className,
}: ProtocolMapperSuggestionsProps) {
  const suggestions = adminIntelligence.suggestProtocolMappers(idpType, providerHint);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800',
        className
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <Lightbulb className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-1">
            Recommended Protocol Mappers
          </h4>
          <p className="text-xs text-indigo-700 dark:text-indigo-300">
            Based on {idpType.toUpperCase()} protocol {providerHint ? `and ${providerHint}` : ''}
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {suggestions.map((mapper) => (
          <div
            key={mapper.name}
            className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-indigo-200 dark:border-indigo-800"
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {mapper.name}
                </span>
                {mapper.required && (
                  <Badge variant="error" size="xs">
                    Required
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              {mapper.description}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-500">Claim:</span>
                <code className="ml-1 text-gray-900 dark:text-gray-100">{mapper.claimName}</code>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-500">Attribute:</span>
                <code className="ml-1 text-gray-900 dark:text-gray-100">{mapper.userAttribute}</code>
              </div>
            </div>
            {mapper.example && (
              <div className="mt-2 text-xs">
                <span className="text-gray-500 dark:text-gray-500">Example:</span>
                <code className="ml-1 text-gray-900 dark:text-gray-100">{mapper.example}</code>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          onApply(suggestions);
          notify.toast.success(`Applied ${suggestions.length} protocol mappers`);
        }}
        className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
      >
        Apply All Suggestions ({suggestions.length})
      </button>
    </motion.div>
  );
}

// ============================================
// Policy Pack Recommendations
// ============================================

interface PolicyPackRecommendationsProps {
  context: {
    tenantType?: 'government' | 'military' | 'industry' | 'coalition';
    classification?: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
    countries?: string[];
    cois?: string[];
  };
  onSelect: (recommendation: PolicyPackRecommendation) => void;
  className?: string;
}

export function PolicyPackRecommendations({
  context,
  onSelect,
  className,
}: PolicyPackRecommendationsProps) {
  const recommendations = adminIntelligence.recommendPolicyPacks(context);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800',
        className
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-1">
            Recommended Policy Packs
          </h4>
          <p className="text-xs text-purple-700 dark:text-purple-300">
            Tailored for your organization's security requirements
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="p-3 bg-white dark:bg-gray-900 rounded-lg border border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600 transition-colors cursor-pointer"
            onClick={() => onSelect(rec)}
          >
            <div className="flex items-start justify-between mb-2">
              <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {rec.name}
              </h5>
              <Badge variant="success" size="xs">
                {rec.confidence}% match
              </Badge>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              {rec.description}
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-300 mb-2">
              <span className="font-medium">Why: </span>
              {rec.reason}
            </p>
            <div className="flex flex-wrap gap-1">
              {rec.policies.map((policy) => (
                <code
                  key={policy}
                  className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200 rounded text-xs"
                >
                  {policy}
                </code>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ============================================
// Certificate Expiry Warnings
// ============================================

interface CertificateExpiryWarningsProps {
  certificates: {
    id: string;
    name: string;
    type: 'hub' | 'spoke' | 'idp' | 'saml' | 'tls';
    expiresAt: string;
    autoRenewable?: boolean;
  }[];
  onRenew: (certId: string) => void;
  className?: string;
}

export function CertificateExpiryWarnings({
  certificates,
  onRenew,
  className,
}: CertificateExpiryWarningsProps) {
  const warnings = adminIntelligence.checkCertificateExpiry(certificates);

  if (warnings.length === 0) {
    return null;
  }

  const criticalCount = warnings.filter((w) => w.severity === 'critical').length;
  const warningCount = warnings.filter((w) => w.severity === 'warning').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-4 rounded-lg border',
        criticalCount > 0
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
        className
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        {criticalCount > 0 ? (
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <h4 className={cn(
            'text-sm font-semibold mb-1',
            criticalCount > 0 ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'
          )}>
            Certificate Expiry Warnings
          </h4>
          <p className={cn(
            'text-xs',
            criticalCount > 0 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
          )}>
            {criticalCount > 0 && `${criticalCount} critical, `}
            {warningCount} warning{warningCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {warnings.map((warning) => (
          <div
            key={warning.id}
            className={cn(
              'p-3 rounded-lg border',
              warning.severity === 'critical'
                ? 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700'
                : warning.severity === 'warning'
                ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700'
                : 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700'
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {warning.name}
                </span>
              </div>
              <Badge
                variant={warning.severity === 'critical' ? 'error' : warning.severity === 'warning' ? 'warning' : 'info'}
                size="xs"
              >
                {warning.daysRemaining}d
              </Badge>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              {adminIntelligence.formatCertificateWarning(warning)}
            </p>
            {!warning.autoRenewable && (
              <button
                onClick={() => onRenew(warning.id)}
                className={cn(
                  'w-full px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  warning.severity === 'critical'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                )}
              >
                Renew Certificate
              </button>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ============================================
// Authorization Anomaly Alerts
// ============================================

interface AuthzAnomalyAlertsProps {
  metrics: {
    denialRate: number;
    historicalDenialRate: number;
    denialsByCountry: Record<string, number>;
    denialsByClearance: Record<string, number>;
    totalDecisions: number;
    timeRange: '24h' | '7d' | '30d';
  };
  onInvestigate: (alert: AuthzAnomalyAlert) => void;
  className?: string;
}

export function AuthzAnomalyAlerts({
  metrics,
  onInvestigate,
  className,
}: AuthzAnomalyAlertsProps) {
  const alerts = adminIntelligence.detectAuthzAnomalies(metrics);

  if (alerts.length === 0) {
    return null;
  }

  const highSeverity = alerts.filter((a) => a.severity === 'high').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'p-4 rounded-lg border',
        highSeverity > 0
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
        className
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className={cn(
          'w-5 h-5 flex-shrink-0 mt-0.5',
          highSeverity > 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
        )} />
        <div className="flex-1">
          <h4 className={cn(
            'text-sm font-semibold mb-1',
            highSeverity > 0 ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'
          )}>
            Authorization Anomalies Detected
          </h4>
          <p className={cn(
            'text-xs',
            highSeverity > 0 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'
          )}>
            {alerts.length} anomal{alerts.length !== 1 ? 'ies' : 'y'} detected
            {highSeverity > 0 && ` (${highSeverity} high severity)`}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {alerts.map((alert) => {
          const formatted = adminIntelligence.formatAnomalyAlert(alert);
          
          return (
            <div
              key={alert.id}
              className={cn(
                'p-3 rounded-lg border',
                alert.severity === 'high'
                  ? 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700'
                  : alert.severity === 'medium'
                  ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700'
                  : 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {formatted.title}
                </h5>
                <Badge
                  variant={alert.severity === 'high' ? 'error' : alert.severity === 'medium' ? 'warning' : 'info'}
                  size="xs"
                >
                  {alert.severity}
                </Badge>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                {formatted.message}
              </p>
              {formatted.action && (
                <p className="text-xs text-gray-700 dark:text-gray-300 mb-2 font-medium">
                  Recommended: {formatted.action}
                </p>
              )}
              <button
                onClick={() => onInvestigate(alert)}
                className={cn(
                  'w-full px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  alert.severity === 'high'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                )}
              >
                Investigate
              </button>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ============================================
// Export
// ============================================

export default {
  OIDCDiscoverySuggestion,
  ProtocolMapperSuggestions,
  PolicyPackRecommendations,
  CertificateExpiryWarnings,
  AuthzAnomalyAlerts,
};
