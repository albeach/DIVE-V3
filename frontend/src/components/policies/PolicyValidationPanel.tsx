'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Terminal,
  Shield,
  FileCode,
  Zap,
  Clock
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info' | 'success';

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  line?: number;
  column?: number;
  rule?: string;
  code?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  metadata?: {
    packageName?: string;
    rulesCount?: number;
    importsCount?: number;
    linesCount?: number;
  };
  duration?: string;
}

interface PolicyValidationPanelProps {
  source: string;
  onValidate?: (result: ValidationResult) => void;
  autoValidate?: boolean;
  debounceMs?: number;
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SEVERITY_CONFIG: Record<ValidationSeverity, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}> = {
  error: {
    icon: XCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-900/20',
    borderColor: 'border-red-500/30',
    label: 'Error'
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/20',
    borderColor: 'border-amber-500/30',
    label: 'Warning'
  },
  info: {
    icon: Info,
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/20',
    borderColor: 'border-blue-500/30',
    label: 'Info'
  },
  success: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-900/20',
    borderColor: 'border-emerald-500/30',
    label: 'Success'
  }
};

// Best practice checks
const BEST_PRACTICE_CHECKS = [
  {
    id: 'default-deny',
    name: 'Fail-Secure Pattern',
    check: (source: string) => /default\s+allow\s*:=\s*false/.test(source),
    message: 'Policy uses "default allow := false"',
    failMessage: 'Missing "default allow := false" - fail-open policies are risky',
    severity: 'warning' as ValidationSeverity
  },
  {
    id: 'rego-v1',
    name: 'Rego v1 Syntax',
    check: (source: string) => /import\s+rego\.v1/.test(source),
    message: 'Uses modern Rego v1 syntax',
    failMessage: 'Consider adding "import rego.v1" for modern syntax',
    severity: 'info' as ValidationSeverity
  },
  {
    id: 'has-package',
    name: 'Package Declaration',
    check: (source: string) => /^package\s+\S+/m.test(source),
    message: 'Has package declaration',
    failMessage: 'Missing package declaration',
    severity: 'error' as ValidationSeverity
  },
  {
    id: 'has-allow',
    name: 'Allow Rule',
    check: (source: string) => /allow\s*(if|:=)/.test(source),
    message: 'Defines allow rule',
    failMessage: 'No allow rule defined',
    severity: 'warning' as ValidationSeverity
  },
  {
    id: 'has-reason',
    name: 'Reason Rule',
    check: (source: string) => /reason\s*(if|:=)/.test(source),
    message: 'Provides decision reason',
    failMessage: 'Consider adding a reason rule for audit logs',
    severity: 'info' as ValidationSeverity
  }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractPackageName(source: string): string | undefined {
  const match = source.match(/^package\s+(\S+)/m);
  return match?.[1];
}

function countRules(source: string): number {
  const rulePattern = /^\s*\w+\s*(?:if|:=|contains)/gm;
  return (source.match(rulePattern) || []).length;
}

function countImports(source: string): number {
  const importPattern = /^import\s+/gm;
  return (source.match(importPattern) || []).length;
}

function clientSideValidate(source: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const startTime = Date.now();

  // Run best practice checks
  BEST_PRACTICE_CHECKS.forEach(check => {
    const passed = check.check(source);
    if (!passed) {
      issues.push({
        severity: check.severity,
        message: check.failMessage,
        rule: check.id
      });
    }
  });

  // Check for syntax patterns
  const lines = source.split('\n');
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Long lines
    if (line.length > 120) {
      issues.push({
        severity: 'info',
        message: `Line exceeds 120 characters (${line.length} chars)`,
        line: lineNum
      });
    }

    // Trailing whitespace
    if (line.endsWith(' ') || line.endsWith('\t')) {
      issues.push({
        severity: 'info',
        message: 'Trailing whitespace',
        line: lineNum
      });
    }
  });

  // Check for common mistakes
  if (source.includes('allow = true') && !source.includes('allow := true')) {
    issues.push({
      severity: 'warning',
      message: 'Use ":=" for rule definitions instead of "="',
      suggestion: 'Change "allow = true" to "allow := true"'
    });
  }

  const hasErrors = issues.some(i => i.severity === 'error');
  const duration = `${Date.now() - startTime}ms`;

  return {
    valid: !hasErrors,
    issues,
    metadata: {
      packageName: extractPackageName(source),
      rulesCount: countRules(source),
      importsCount: countImports(source),
      linesCount: lines.length
    },
    duration
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PolicyValidationPanel({
  source,
  onValidate,
  autoValidate = true,
  debounceMs = 500,
  className = ''
}: PolicyValidationPanelProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllIssues, setShowAllIssues] = useState(false);

  // Debounced validation
  useEffect(() => {
    if (!autoValidate) return;

    const timeoutId = setTimeout(() => {
      runValidation();
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [source, autoValidate, debounceMs]);

  const runValidation = useCallback(async () => {
    setIsValidating(true);

    // Client-side validation (instant)
    const clientResult = clientSideValidate(source);

    // TODO: Add server-side OPA validation
    // const serverResult = await fetch('/api/policies-lab/validate', {...});

    setResult(clientResult);
    onValidate?.(clientResult);
    setIsValidating(false);
  }, [source, onValidate]);

  // Count issues by severity
  const issuesByType = result?.issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {} as Record<ValidationSeverity, number>) || {};

  const displayedIssues = showAllIssues
    ? result?.issues || []
    : (result?.issues || []).slice(0, 5);

  return (
    <div className={`rounded-xl bg-slate-900/50 border border-slate-700/50 overflow-hidden ${className}`}>
      {/* Header - using div instead of button to avoid nested button issues */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsExpanded(!isExpanded); }}
        className="w-full px-4 py-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between hover:bg-slate-800/70 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isValidating
              ? 'bg-blue-500/20'
              : result?.valid
                ? 'bg-emerald-500/20'
                : 'bg-red-500/20'
          }`}>
            {isValidating ? (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            ) : result?.valid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
          </div>

          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              Policy Validation
              {result?.duration && (
                <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {result.duration}
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500">
              {isValidating
                ? 'Checking policy...'
                : result
                  ? result.valid
                    ? 'Policy is valid'
                    : `${result.issues.length} issue${result.issues.length !== 1 ? 's' : ''} found`
                  : 'Not validated yet'
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Issue counts */}
          {result && !isValidating && (
            <div className="flex items-center gap-2">
              {Object.entries(issuesByType).map(([severity, count]) => {
                const config = SEVERITY_CONFIG[severity as ValidationSeverity];
                const Icon = config.icon;
                return (
                  <span
                    key={severity}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.color}`}
                  >
                    <Icon className="w-3 h-3" />
                    {count}
                  </span>
                );
              })}
            </div>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              runValidation();
            }}
            disabled={isValidating}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
            title="Revalidate"
          >
            <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />
          </button>

          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {/* Metadata */}
              {result?.metadata && (
                <div className="grid grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                    <p className="text-lg font-bold text-cyan-400">{result.metadata.linesCount}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Lines</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                    <p className="text-lg font-bold text-purple-400">{result.metadata.rulesCount}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Rules</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                    <p className="text-lg font-bold text-amber-400">{result.metadata.importsCount}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Imports</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                    <p className="text-lg font-bold text-teal-400 truncate">
                      {result.metadata.packageName?.split('.').pop() || '—'}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Package</p>
                  </div>
                </div>
              )}

              {/* Best Practices Checklist */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  Best Practices
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {BEST_PRACTICE_CHECKS.map(check => {
                    const passed = check.check(source);
                    return (
                      <div
                        key={check.id}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                          passed
                            ? 'bg-emerald-900/10 border-emerald-500/20'
                            : check.severity === 'error'
                              ? 'bg-red-900/10 border-red-500/20'
                              : check.severity === 'warning'
                                ? 'bg-amber-900/10 border-amber-500/20'
                                : 'bg-slate-800/30 border-slate-700/50'
                        }`}
                      >
                        {passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : check.severity === 'error' ? (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        ) : check.severity === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        ) : (
                          <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        )}
                        <span className={`text-xs ${passed ? 'text-emerald-300' : 'text-gray-400'}`}>
                          {check.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Issues List */}
              {result && result.issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-amber-400" />
                    Issues ({result.issues.length})
                  </h4>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {displayedIssues.map((issue, idx) => {
                      const config = SEVERITY_CONFIG[issue.severity];
                      const Icon = config.icon;

                      return (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className={`p-3 rounded-lg border ${config.bgColor} ${config.borderColor}`}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className={`w-4 h-4 ${config.color} flex-shrink-0 mt-0.5`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${config.color}`}>
                                {issue.message}
                              </p>
                              {issue.line && (
                                <p className="text-[10px] text-gray-500 mt-1 font-mono">
                                  Line {issue.line}{issue.column ? `, Column ${issue.column}` : ''}
                                </p>
                              )}
                              {issue.suggestion && (
                                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                                  <Zap className="w-3 h-3 text-amber-400" />
                                  {issue.suggestion}
                                </p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {result.issues.length > 5 && (
                    <button
                      onClick={() => setShowAllIssues(!showAllIssues)}
                      className="w-full py-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      {showAllIssues
                        ? 'Show less'
                        : `Show ${result.issues.length - 5} more issues`
                      }
                    </button>
                  )}
                </div>
              )}

              {/* No Issues State */}
              {result && result.issues.length === 0 && (
                <div className="text-center py-6">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  </div>
                  <p className="text-sm font-medium text-emerald-300">All checks passed!</p>
                  <p className="text-xs text-gray-500 mt-1">Your policy follows best practices</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

