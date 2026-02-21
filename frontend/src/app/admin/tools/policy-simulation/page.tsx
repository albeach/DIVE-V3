/**
 * Policy Simulation Tool
 *
 * Side-by-side policy comparison, simulation with trace output,
 * and impact analysis for ABAC policy changes.
 *
 * Phase 6.2 - 2026 Design Patterns
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { useSimulatePolicy, useDiffPolicies } from '@/lib/api/admin-queries';
import { InteractiveBreadcrumbs } from '@/components/ui/interactive-breadcrumbs';
import {
  Play,
  GitCompareArrows,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Code,
  Eye,
  Shield,
  Clock,
  Zap,
  ChevronDown,
  ChevronRight,
  Copy,
  RotateCcw,
} from 'lucide-react';

const CLEARANCE_LEVELS = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP SECRET'];
const COUNTRIES = ['USA', 'GBR', 'DEU', 'FRA', 'CAN'];
const ACTIONS = ['read', 'write', 'delete', 'admin', 'export', 'share'];

const SAMPLE_POLICY = `package dive.authz

default allow = false

# Allow access if clearance meets classification
allow {
    input.subject.clearance_level >= input.resource.classification_level
    input.subject.country in input.resource.releasable_to
}

# Deny if COI conflict exists
deny {
    input.resource.coi != ""
    not input.subject.coi_access[input.resource.coi]
}`;

interface TraceStep {
  rule: string;
  result: boolean;
  message?: string;
}

function TraceViewer({ trace }: { trace: TraceStep[] }) {
  return (
    <div className="space-y-2">
      {trace.map((step, idx) => (
        <div
          key={idx}
          className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
            step.result
              ? 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800'
          }`}
        >
          <div className="flex-shrink-0 mt-0.5">
            {step.result ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">
                {step.rule}
              </code>
              <span
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                  step.result
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}
              >
                {step.result ? 'PASS' : 'FAIL'}
              </span>
            </div>
            {step.message && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {step.message}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PolicySimulationPage() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const [activeTab, setActiveTab] = useState<'simulate' | 'diff'>('simulate');

  // Simulation state
  const [subjectId, setSubjectId] = useState('user-001');
  const [subjectClearance, setSubjectClearance] = useState('SECRET');
  const [subjectCountry, setSubjectCountry] = useState('USA');
  const [subjectRoles, setSubjectRoles] = useState('analyst');
  const [resourceId, setResourceId] = useState('doc-classified-001');
  const [resourceClassification, setResourceClassification] = useState('SECRET');
  const [resourceReleasableTo, setResourceReleasableTo] = useState('USA,GBR');
  const [resourceCoi, setResourceCoi] = useState('');
  const [action, setAction] = useState('read');
  const [enableTrace, setEnableTrace] = useState(true);
  const [enableCoverage, setEnableCoverage] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Diff state
  const [policyA, setPolicyA] = useState(SAMPLE_POLICY);
  const [policyB, setPolicyB] = useState(SAMPLE_POLICY);

  const simulateMutation = useSimulatePolicy();
  const diffMutation = useDiffPolicies();

  const handleSimulate = useCallback(async () => {
    try {
      await simulateMutation.mutateAsync({
        policy: 'default',
        input: {
          subject: {
            id: subjectId,
            clearance: subjectClearance,
            country: subjectCountry,
            roles: subjectRoles.split(',').map((r) => r.trim()),
          },
          resource: {
            id: resourceId,
            classification: resourceClassification,
            releasableTo: resourceReleasableTo.split(',').map((c) => c.trim()),
            coi: resourceCoi || undefined,
          },
          action,
        },
        options: {
          trace: enableTrace,
          coverage: enableCoverage,
        },
      });
    } catch (err) {
      console.error('Simulation failed:', err);
    }
  }, [
    simulateMutation,
    subjectId, subjectClearance, subjectCountry, subjectRoles,
    resourceId, resourceClassification, resourceReleasableTo, resourceCoi,
    action, enableTrace, enableCoverage,
  ]);

  const handleDiff = useCallback(async () => {
    try {
      await diffMutation.mutateAsync({
        policyA,
        policyB,
        testCases: [
          { name: 'Basic read access', input: { action: 'read', clearance: 'SECRET' }, expectedResult: true },
          { name: 'Cross-country access', input: { action: 'read', crossCountry: true }, expectedResult: false },
          { name: 'COI restricted access', input: { action: 'read', coiRestricted: true }, expectedResult: false },
        ],
      });
    } catch (err) {
      console.error('Diff failed:', err);
    }
  }, [diffMutation, policyA, policyB]);

  const handleReset = useCallback(() => {
    setSubjectId('user-001');
    setSubjectClearance('SECRET');
    setSubjectCountry('USA');
    setSubjectRoles('analyst');
    setResourceId('doc-classified-001');
    setResourceClassification('SECRET');
    setResourceReleasableTo('USA,GBR');
    setResourceCoi('');
    setAction('read');
    simulateMutation.reset();
  }, [simulateMutation]);

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    router.push('/');
    return null;
  }

  const simResult = simulateMutation.data?.result;
  const diffResult = diffMutation.data?.diff;

  return (
    <PageLayout
      user={session?.user || {}}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        {/* Header */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-[1600px] mx-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Policy Simulation
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Test and compare ABAC policies with simulated inputs
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setActiveTab('simulate')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'simulate'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Simulate
                </div>
              </button>
              <button
                onClick={() => setActiveTab('diff')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'diff'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <GitCompareArrows className="w-4 h-4" />
                  Compare Policies
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1600px] mx-auto px-8 py-8">
          {activeTab === 'simulate' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Input Panel */}
              <div className="space-y-6">
                {/* Subject */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-500" />
                    Subject (Who)
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        User ID
                      </label>
                      <input
                        type="text"
                        value={subjectId}
                        onChange={(e) => setSubjectId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Clearance Level
                      </label>
                      <select
                        value={subjectClearance}
                        onChange={(e) => setSubjectClearance(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      >
                        {CLEARANCE_LEVELS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Country
                      </label>
                      <select
                        value={subjectCountry}
                        onChange={(e) => setSubjectCountry(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Roles (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={subjectRoles}
                        onChange={(e) => setSubjectRoles(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Resource */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Code className="w-5 h-5 text-emerald-500" />
                    Resource (What)
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Resource ID
                      </label>
                      <input
                        type="text"
                        value={resourceId}
                        onChange={(e) => setResourceId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Classification
                      </label>
                      <select
                        value={resourceClassification}
                        onChange={(e) => setResourceClassification(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      >
                        {CLEARANCE_LEVELS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Releasable To (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={resourceReleasableTo}
                        onChange={(e) => setResourceReleasableTo(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        placeholder="USA,GBR,DEU"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        COI Tag
                      </label>
                      <input
                        type="text"
                        value={resourceCoi}
                        onChange={(e) => setResourceCoi(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        placeholder="Optional COI restriction"
                      />
                    </div>
                  </div>
                </div>

                {/* Action & Options */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    Action
                  </h3>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {ACTIONS.map((a) => (
                      <button
                        key={a}
                        onClick={() => setAction(a)}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                          action === a
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>

                  {/* Advanced Options */}
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Advanced Options
                  </button>

                  {showAdvanced && (
                    <div className="mt-4 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableTrace}
                          onChange={(e) => setEnableTrace(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Enable Trace
                          </span>
                          <p className="text-xs text-gray-500">Show step-by-step policy evaluation</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableCoverage}
                          onChange={(e) => setEnableCoverage(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Enable Coverage
                          </span>
                          <p className="text-xs text-gray-500">Show policy rule coverage analysis</p>
                        </div>
                      </label>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSimulate}
                    disabled={simulateMutation.isPending}
                    className="flex-1 px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg shadow-purple-600/25 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {simulateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Run Simulation
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </button>
                </div>
              </div>

              {/* Result Panel */}
              <div className="space-y-6">
                {simResult ? (
                  <>
                    {/* Decision */}
                    <div
                      className={`rounded-2xl border-2 p-8 text-center ${
                        simResult.allowed
                          ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-300 dark:border-emerald-700'
                          : 'bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-700'
                      }`}
                    >
                      <div
                        className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4 ${
                          simResult.allowed
                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                            : 'bg-red-100 dark:bg-red-900/30'
                        }`}
                      >
                        {simResult.allowed ? (
                          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                        ) : (
                          <XCircle className="w-8 h-8 text-red-600" />
                        )}
                      </div>
                      <h2
                        className={`text-3xl font-bold ${
                          simResult.allowed ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {simResult.decision}
                      </h2>
                      <p className="text-sm text-gray-500 mt-2">
                        Evaluated in {simResult.evaluationTimeMs}ms
                      </p>
                    </div>

                    {/* Trace */}
                    {simResult.trace && (
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                          <Eye className="w-5 h-5" />
                          Evaluation Trace
                        </h3>
                        <TraceViewer trace={simResult.trace} />
                      </div>
                    )}

                    {/* Coverage */}
                    {simResult.coverage && (
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                          Policy Coverage
                        </h3>
                        <div className="flex items-center gap-6">
                          <div className="flex-1">
                            <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
                                style={{ width: `${simResult.coverage.percentage}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {simResult.coverage.percentage}%
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                          {simResult.coverage.covered} of {simResult.coverage.total} rules evaluated
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
                    <Play className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                      Ready to Simulate
                    </h3>
                    <p className="text-sm text-gray-500 mt-2">
                      Configure subject, resource, and action, then run the simulation
                      to see the policy evaluation result.
                    </p>
                  </div>
                )}

                {simulateMutation.isError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      <p className="text-sm text-red-700 dark:text-red-300">
                        Simulation failed. Check your inputs and try again.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Policy Diff Tab */
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Policy A */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Policy A (Current)
                    </h3>
                    <button
                      onClick={() => navigator.clipboard.writeText(policyA)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={policyA}
                    onChange={(e) => setPolicyA(e.target.value)}
                    rows={16}
                    className="w-full px-4 py-3 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none"
                  />
                </div>

                {/* Policy B */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Policy B (Proposed)
                    </h3>
                    <button
                      onClick={() => navigator.clipboard.writeText(policyB)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={policyB}
                    onChange={(e) => setPolicyB(e.target.value)}
                    rows={16}
                    className="w-full px-4 py-3 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none"
                  />
                </div>
              </div>

              {/* Compare Button */}
              <div className="flex justify-center">
                <button
                  onClick={handleDiff}
                  disabled={diffMutation.isPending}
                  className="px-8 py-3 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg shadow-purple-600/25 disabled:opacity-50 flex items-center gap-2"
                >
                  {diffMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GitCompareArrows className="w-4 h-4" />
                  )}
                  Compare Policies
                </button>
              </div>

              {/* Diff Results */}
              {diffResult && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Changes */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      Changes
                    </h3>
                    <div className="space-y-4">
                      {diffResult.added.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-emerald-600 mb-2">
                            + Added ({diffResult.added.length})
                          </h4>
                          <div className="space-y-1">
                            {diffResult.added.map((line: string, idx: number) => (
                              <div key={idx} className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/10 border-l-4 border-emerald-500 rounded-r">
                                <code className="text-xs text-emerald-800 dark:text-emerald-300">{line}</code>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {diffResult.removed.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-red-600 mb-2">
                            - Removed ({diffResult.removed.length})
                          </h4>
                          <div className="space-y-1">
                            {diffResult.removed.map((line: string, idx: number) => (
                              <div key={idx} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500 rounded-r">
                                <code className="text-xs text-red-800 dark:text-red-300">{line}</code>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {diffResult.added.length === 0 && diffResult.removed.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">
                          No differences found
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Test Results */}
                  {diffResult.testResults && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                        Impact Analysis
                      </h3>
                      <div className="space-y-3">
                        {diffResult.testResults.map((test: { name: string; policyAResult: boolean; policyBResult: boolean; match: boolean }, idx: number) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg border ${
                              test.match
                                ? 'border-gray-200 dark:border-gray-700'
                                : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {test.name}
                              </span>
                              {test.match ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-amber-600" />
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs">
                              <span className={`${test.policyAResult ? 'text-emerald-600' : 'text-red-600'}`}>
                                Policy A: {test.policyAResult ? 'PERMIT' : 'DENY'}
                              </span>
                              <span className={`${test.policyBResult ? 'text-emerald-600' : 'text-red-600'}`}>
                                Policy B: {test.policyBResult ? 'PERMIT' : 'DENY'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
