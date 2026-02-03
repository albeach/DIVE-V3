/**
 * Decision Replay Tool
 *
 * Allows administrators to replay authorization decisions to debug
 * policy evaluation and understand why access was granted or denied.
 *
 * 2026 Design: Modern glassmorphism UI with step-by-step visualization.
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Shield,
  FileText,
  User,
  Globe,
  Tag,
  Code,
  Loader2,
} from 'lucide-react';

interface PolicyTraceStep {
  rule: string;
  result: boolean;
  input: Record<string, unknown>;
}

interface ReplayResult {
  allowed: boolean;
  reason: string;
  policyTrace: PolicyTraceStep[];
  evaluationTimeMs: number;
  policiesEvaluated: string[];
}

const CLASSIFICATION_LEVELS = [
  'UNCLASSIFIED',
  'RESTRICTED',
  'CONFIDENTIAL',
  'SECRET',
  'TOP_SECRET',
];

const SAMPLE_COUNTRIES = ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'AUS', 'NZL', 'NLD', 'BEL', 'NOR'];

export default function DecisionReplayPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // Form state
  const [resourceId, setResourceId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [subjectRoles, setSubjectRoles] = useState('');
  const [subjectClearance, setSubjectClearance] = useState('SECRET');
  const [subjectCountry, setSubjectCountry] = useState('USA');
  const [resourceClassification, setResourceClassification] = useState('SECRET');
  const [resourceReleasableTo, setResourceReleasableTo] = useState('');
  const [resourceCoi, setResourceCoi] = useState('');

  // Result state
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const handleReplay = useCallback(async () => {
    if (!resourceId.trim() || !subjectId.trim()) {
      setError('Resource ID and Subject ID are required');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload = {
        resourceId: resourceId.trim(),
        subject: {
          id: subjectId.trim(),
          roles: subjectRoles.split(',').map(r => r.trim()).filter(Boolean),
          clearance: subjectClearance,
          country: subjectCountry,
        },
        resource: {
          classification: resourceClassification,
          releasableTo: resourceReleasableTo.split(',').map(r => r.trim()).filter(Boolean),
          coi: resourceCoi.trim() || undefined,
        },
      };

      const response = await fetch('/api/decision-replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      setResult(data.result);
      setExpandedSteps(new Set([0])); // Expand first step by default
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to replay decision');
    } finally {
      setIsLoading(false);
    }
  }, [resourceId, subjectId, subjectRoles, subjectClearance, subjectCountry, resourceClassification, resourceReleasableTo, resourceCoi]);

  const handleReset = useCallback(() => {
    setResult(null);
    setError(null);
    setExpandedSteps(new Set());
  }, []);

  const toggleStep = useCallback((index: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/');
    return null;
  }

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Admin', href: '/admin/dashboard' },
        { label: 'Tools', href: '/admin/tools' },
        { label: 'Decision Replay', href: null },
      ]}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        {/* Header */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-[1400px] mx-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Decision Replay Tool
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Replay authorization decisions to debug policy evaluation
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  disabled={!result && !error}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
                <button
                  onClick={handleReplay}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-600/25 disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Replay Decision
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1400px] mx-auto px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Input Form */}
            <div className="space-y-6">
              {/* Subject Configuration */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Subject (User)</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Subject ID *
                    </label>
                    <input
                      type="text"
                      value={subjectId}
                      onChange={(e) => setSubjectId(e.target.value)}
                      placeholder="user-123 or email@example.com"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Clearance Level
                    </label>
                    <select
                      value={subjectClearance}
                      onChange={(e) => setSubjectClearance(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {CLASSIFICATION_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Country of Affiliation
                    </label>
                    <select
                      value={subjectCountry}
                      onChange={(e) => setSubjectCountry(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {SAMPLE_COUNTRIES.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Roles (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={subjectRoles}
                      onChange={(e) => setSubjectRoles(e.target.value)}
                      placeholder="analyst, viewer, fuel_ops"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Resource Configuration */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Resource</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Resource ID *
                    </label>
                    <input
                      type="text"
                      value={resourceId}
                      onChange={(e) => setResourceId(e.target.value)}
                      placeholder="doc-abc123 or /resources/reports/q1-2026.pdf"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Classification
                    </label>
                    <select
                      value={resourceClassification}
                      onChange={(e) => setResourceClassification(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {CLASSIFICATION_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Community of Interest (COI)
                    </label>
                    <input
                      type="text"
                      value={resourceCoi}
                      onChange={(e) => setResourceCoi(e.target.value)}
                      placeholder="OpFuel, Intel, CyberOps"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Releasable To (comma-separated countries)
                    </label>
                    <input
                      type="text"
                      value={resourceReleasableTo}
                      onChange={(e) => setResourceReleasableTo(e.target.value)}
                      placeholder="USA, GBR, CAN"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">Error</p>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{error}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Results Panel */}
            <div className="space-y-6">
              {result ? (
                <>
                  {/* Decision Result */}
                  <div
                    className={`rounded-2xl border-2 p-6 ${
                      result.allowed
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                          result.allowed
                            ? 'bg-emerald-100 dark:bg-emerald-900/40'
                            : 'bg-red-100 dark:bg-red-900/40'
                        }`}
                      >
                        {result.allowed ? (
                          <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div>
                        <h3
                          className={`text-2xl font-bold ${
                            result.allowed
                              ? 'text-emerald-800 dark:text-emerald-300'
                              : 'text-red-800 dark:text-red-300'
                          }`}
                        >
                          {result.allowed ? 'Access Allowed' : 'Access Denied'}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{result.reason}</p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs">
                          <Clock className="w-3.5 h-3.5" />
                          Evaluation Time
                        </div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-1">
                          {result.evaluationTimeMs.toFixed(2)} ms
                        </p>
                      </div>
                      <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs">
                          <Shield className="w-3.5 h-3.5" />
                          Policies Evaluated
                        </div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-1">
                          {result.policiesEvaluated.length}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Policy Trace */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Code className="w-4 h-4" />
                        Policy Evaluation Trace
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Step-by-step evaluation of all policy rules
                      </p>
                    </div>

                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {result.policyTrace.map((step, index) => (
                        <div key={index} className="group">
                          <button
                            onClick={() => toggleStep(index)}
                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  step.result
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                }`}
                              >
                                {index + 1}
                              </span>
                              <div className="text-left">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">
                                  {step.rule}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  Result: {step.result ? 'Pass' : 'Fail'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {step.result ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                              ) : (
                                <XCircle className="w-5 h-5 text-red-500" />
                              )}
                              {expandedSteps.has(index) ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                          </button>

                          {expandedSteps.has(index) && (
                            <div className="px-6 pb-4">
                              <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                                <pre className="text-xs text-gray-300 font-mono">
                                  {JSON.stringify(step.input, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Policies List */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Policies Evaluated
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {result.policiesEvaluated.map((policy, index) => (
                        <span
                          key={index}
                          className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-mono"
                        >
                          {policy}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                  <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
                    <Play className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Ready to Replay
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-sm mx-auto">
                    Configure the subject and resource parameters, then click "Replay Decision"
                    to see the policy evaluation trace.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
