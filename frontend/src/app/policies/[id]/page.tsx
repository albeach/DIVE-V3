'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import PolicyTester from '@/components/policy/policy-tester';

interface IPolicyContent {
  policyId: string;
  name: string;
  content: string;
  syntax: 'rego';
  lines: number;
  rules: string[];
  metadata: {
    version: string;
    package: string;
    testCount: number;
    lastModified: string;
  };
}

export default function PolicyDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const policyId = params?.id as string;

  const [policy, setPolicy] = useState<IPolicyContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTester, setShowTester] = useState(false);

  // Rule explanations in layman's terms
  const getRuleExplanation = (ruleName: string): string | null => {
    const explanations: Record<string, string> = {
      'allow': 'Main authorization decision - grants or denies access based on all violation checks',
      'is_not_authenticated': 'Checks if user is properly authenticated with valid credentials',
      'is_missing_required_attributes': 'Validates that all required attributes (uniqueID, clearance, country) are present',
      'is_insufficient_clearance': 'Ensures user clearance level is high enough to access the resource',
      'is_not_releasable_to_country': 'Verifies user\'s country is in the resource\'s releasability list',
      'is_coi_violation': 'Checks if user has required Community of Interest (COI) membership',
      'is_under_embargo': 'Ensures resource is not embargoed (available only after specific date)',
      'is_ztdf_integrity_violation': 'Validates ZTDF cryptographic binding and integrity hashes (STANAG 4778)',
      'is_upload_not_releasable_to_uploader': 'For uploads: ensures document is releasable to uploader\'s country',
      'decision': 'Complete decision object with allow, reason, obligations, and evaluation details',
      'reason': 'Human-readable explanation of why access was granted or denied',
      'obligations': 'Additional actions required (e.g., KAS key request for encrypted resources)',
      'evaluation_details': 'Detailed breakdown of all authorization checks for debugging',
      'check_authenticated': 'Helper: Returns true if user is authenticated',
      'check_required_attributes': 'Helper: Returns true if all required attributes present',
      'check_clearance_sufficient': 'Helper: Returns true if user clearance is sufficient',
      'check_country_releasable': 'Helper: Returns true if user country matches releasability',
      'check_coi_satisfied': 'Helper: Returns true if COI requirements met',
      'check_embargo_passed': 'Helper: Returns true if embargo date has passed',
      'check_ztdf_integrity_valid': 'Helper: Returns true if ZTDF integrity validation passed',
      'check_upload_releasability_valid': 'Helper: Returns true if upload releasability is valid',
      'clearance_levels': 'Clearance hierarchy mapping: UNCLASSIFIED(0), CONFIDENTIAL(1), SECRET(2), TOP_SECRET(3)',
      'valid_country_codes': 'Set of valid ISO 3166-1 alpha-3 country codes (USA, GBR, FRA, etc.)',
      'ztdf_enabled': 'Helper: Returns true if resource has ZTDF metadata'
    };
    
    return explanations[ruleName] || null;
  };

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/login');
      return;
    }

    async function fetchPolicy() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

      try {
        const response = await fetch(`${backendUrl}/api/policies/${policyId}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData.message || 'Failed to fetch policy');
          setPolicy(null);
        } else {
          const data: IPolicyContent = await response.json();
          setPolicy(data);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setPolicy(null);
      } finally {
        setLoading(false);
      }
    }

    fetchPolicy();
  }, [session, status, policyId, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading policy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/dashboard" className="text-xl font-bold text-gray-900 hover:text-gray-700">
                DIVE V3
              </Link>
              <Link href="/policies" className="text-gray-600 hover:text-gray-900 font-medium">
                ← Back to Policies
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                {session?.user?.uniqueID || session?.user?.email}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-red-900 mb-2">Error</h2>
              <p className="text-red-800">{error}</p>
            </div>
          ) : policy ? (
            <div className="space-y-6">
              {/* Policy Header */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                      {policy.name}
                    </h1>
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                        v{policy.metadata.version}
                      </span>
                      <span className="font-mono text-xs">{policy.metadata.package}</span>
                      <span>•</span>
                      <span>{policy.rules.length} rules</span>
                      <span>•</span>
                      <span>{policy.metadata.testCount} tests</span>
                      <span>•</span>
                      <span>{policy.lines} lines</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTester(!showTester)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    {showTester ? 'Hide Tester' : 'Test This Policy'}
                  </button>
                </div>

                {/* Policy Statistics */}
                <div className="mt-6 grid grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded p-3">
                    <dt className="text-xs font-medium text-gray-500 mb-1">Syntax</dt>
                    <dd className="text-sm font-mono font-semibold text-gray-900">
                      Rego
                    </dd>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <dt className="text-xs font-medium text-gray-500 mb-1">Status</dt>
                    <dd className="text-sm font-semibold text-green-700">
                      ✓ Active
                    </dd>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <dt className="text-xs font-medium text-gray-500 mb-1">Test Coverage</dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {policy.metadata.testCount} tests
                    </dd>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <dt className="text-xs font-medium text-gray-500 mb-1">Last Modified</dt>
                    <dd className="text-xs font-mono text-gray-900">
                      {new Date(policy.metadata.lastModified).toLocaleDateString()}
                    </dd>
                  </div>
                </div>
              </div>

              {/* Policy Tester (conditional) */}
              {showTester && (
                <PolicyTester policyId={policy.policyId} />
              )}

              {/* Policy Rules Overview */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  📊 Policy Rules ({policy.rules.length})
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Click on any rule to see its explanation and jump to the source code.
                </p>
                <div className="space-y-3">
                  {policy.rules.map((rule) => {
                    const explanation = getRuleExplanation(rule);
                    if (!explanation) return null;
                    
                    return (
                      <button
                        key={rule}
                        type="button"
                        onClick={() => {
                          const codeSection = document.getElementById('policy-source-code');
                          if (codeSection) {
                            codeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="w-full text-left px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <code className="text-sm font-mono font-semibold text-gray-900">
                              {rule}
                            </code>
                            <p className="text-xs text-gray-600 mt-1">
                              {explanation}
                            </p>
                          </div>
                          <svg className="w-4 h-4 text-gray-400 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Policy Source Code */}
              <div id="policy-source-code" className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">
                    📝 Policy Source Code
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Rego (Open Policy Agent) source code - {policy.lines} lines
                  </p>
                </div>
                
                {/* Code Display with Line Numbers */}
                <div className="bg-gray-900 text-gray-100 p-6 overflow-x-auto">
                  <pre className="text-sm font-mono leading-relaxed whitespace-pre-wrap">
                    {policy.content.split('\n').map((line, index) => (
                      <div key={index} className="flex hover:bg-gray-800">
                        <span className="inline-block w-12 text-right mr-4 text-gray-500 select-none">
                          {index + 1}
                        </span>
                        <code className="flex-1 text-gray-100">{line || '\u00A0'}</code>
                      </div>
                    ))}
                  </pre>
                </div>
              </div>

              {/* Policy Information */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  ℹ️ About This Policy
                </h3>
                <p className="text-sm text-blue-800">
                  This policy implements <strong>ACP-240 Data-Centric Security</strong> with fail-secure enforcement.
                  It evaluates 7 authorization checks: authentication, required attributes, clearance level, 
                  country releasability, COI (Communities of Interest), embargo dates, and ZTDF integrity validation.
                  All violations result in access denial following the "default deny" principle.
                </p>
                <div className="mt-3 flex gap-2">
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                    🛡️ ACP-240 Compliant
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                    Fail-Secure Pattern
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                    ZTDF Integrity Checks
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">Policy not found</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

