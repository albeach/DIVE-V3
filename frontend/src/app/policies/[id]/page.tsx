'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { Disclosure } from '@headlessui/react';
import PageLayout from '@/components/layout/page-layout';
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

interface RuleLocation {
  ruleName: string;
  lineNumber: number;
  lineText: string;
}

// Modern rule explanations with categories
const RULE_CATEGORIES = {
  'Core Authorization': ['allow', 'decision', 'reason', 'obligations', 'evaluation_details'],
  'Violation Checks': [
    'is_not_authenticated',
    'is_missing_required_attributes',
    'is_insufficient_clearance',
    'is_not_releasable_to_country',
    'is_coi_violation',
    'is_under_embargo',
    'is_ztdf_integrity_violation',
    'is_upload_not_releasable_to_uploader'
  ],
  'Helper Functions': [
    'check_authenticated',
    'check_required_attributes',
    'check_clearance_sufficient',
    'check_country_releasable',
    'check_coi_satisfied',
    'check_embargo_passed',
    'check_ztdf_integrity_valid',
    'check_upload_releasability_valid',
    'ztdf_enabled'
  ],
  'Data Structures': ['clearance_levels', 'valid_country_codes']
};

const RULE_EXPLANATIONS: Record<string, { short: string; detailed: string }> = {
  'allow': {
    short: 'Main authorization decision',
    detailed: 'Grants or denies access based on all violation checks. Returns true only when no violations are detected.'
  },
  'is_not_authenticated': {
    short: 'Authentication check',
    detailed: 'Validates user has valid authentication credentials and session token.'
  },
  'is_missing_required_attributes': {
    short: 'Required attributes validation',
    detailed: 'Ensures all required attributes (uniqueID, clearance, country) are present in the user token.'
  },
  'is_insufficient_clearance': {
    short: 'Clearance level verification',
    detailed: 'Ensures user clearance level is high enough to access the resource classification level.'
  },
  'is_not_releasable_to_country': {
    short: 'Country releasability check',
    detailed: 'Verifies user\'s country is in the resource\'s releasabilityTo list (NATO/Coalition sharing).'
  },
  'is_coi_violation': {
    short: 'Community of Interest validation',
    detailed: 'Checks if user has required Community of Interest (COI) membership for accessing the resource.'
  },
  'is_under_embargo': {
    short: 'Embargo date enforcement',
    detailed: 'Ensures resource is not embargoed - available only after a specific release date.'
  },
  'is_ztdf_integrity_violation': {
    short: 'ZTDF cryptographic integrity',
    detailed: 'Validates ZTDF cryptographic binding and integrity hashes (STANAG 4778 compliance).'
  },
  'decision': {
    short: 'Complete decision object',
    detailed: 'Returns structured decision with allow boolean, reason, obligations, and detailed evaluation results.'
  },
  'reason': {
    short: 'Human-readable explanation',
    detailed: 'Provides clear explanation of why access was granted or denied for audit trails.'
  },
  'obligations': {
    short: 'Additional security requirements',
    detailed: 'Additional actions required (e.g., KAS key request for encrypted ZTDF resources).'
  }
};

export default function PolicyDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const policyId = params?.id as string;

  const [policy, setPolicy] = useState<IPolicyContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTester, setShowTester] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Debug logging for session status
  useEffect(() => {
    console.log('[PolicyDetailPage] Session status:', { status, hasSession: !!session, hasUser: !!session?.user });
  }, [session, status]);

  // Find rule locations in source code
  const ruleLocations = useMemo(() => {
    if (!policy) return [];
    
    const locations: RuleLocation[] = [];
    const lines = policy.content.split('\n');
    
    lines.forEach((line, index) => {
      // Match rule definitions: "ruleName := " or "ruleName if {"
      const match = line.match(/^(\w+)\s*(:=|if\s*\{)/);
      if (match) {
        locations.push({
          ruleName: match[1],
          lineNumber: index + 1,
          lineText: line.trim()
        });
      }
    });
    
    return locations;
  }, [policy]);

  // Jump to specific rule in code
  const jumpToRule = useCallback((ruleName: string) => {
    const location = ruleLocations.find(loc => loc.ruleName === ruleName);
    if (location) {
      setHighlightedLine(location.lineNumber);
      const element = document.getElementById(`line-${location.lineNumber}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Remove highlight after 3 seconds
        setTimeout(() => setHighlightedLine(null), 3000);
      }
    }
  }, [ruleLocations]);

  // Filter rules by search term
  const filteredRules = useMemo(() => {
    if (!policy) return [];
    if (!searchTerm) return policy.rules;
    
    const term = searchTerm.toLowerCase();
    return policy.rules.filter(rule => {
      const explanation = RULE_EXPLANATIONS[rule];
      return rule.toLowerCase().includes(term) ||
             explanation?.short.toLowerCase().includes(term) ||
             explanation?.detailed.toLowerCase().includes(term);
    });
  }, [policy, searchTerm]);

  // Group rules by category
  const groupedRules = useMemo(() => {
    if (!policy) return {};
    
    const groups: Record<string, string[]> = {};
    
    Object.entries(RULE_CATEGORIES).forEach(([category, rules]) => {
      const matchingRules = policy.rules.filter(rule => rules.includes(rule));
      if (matchingRules.length > 0) {
        groups[category] = matchingRules;
      }
    });
    
    // Add uncategorized rules
    const categorizedRules = Object.values(RULE_CATEGORIES).flat();
    const uncategorized = policy.rules.filter(rule => !categorizedRules.includes(rule));
    if (uncategorized.length > 0) {
      groups['Other'] = uncategorized;
    }
    
    return groups;
  }, [policy]);

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

  if (!session) {
    return null;
  }

  // Additional safety check for user object
  if (!session?.user) {
    return null;
  }

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Policies', href: '/policies' },
        { label: policy?.name || policyId, href: null }
      ]}
    >
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-900 mb-2">Error</h2>
          <p className="text-red-800">{error}</p>
        </div>
      ) : policy ? (
        <div className="space-y-6">
          {/* Policy Header */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {policy.name}
                </h1>
                <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
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
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                {showTester ? 'Hide Tester' : 'Test This Policy'}
              </button>
            </div>

            {/* Policy Statistics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <dt className="text-xs font-medium text-blue-700 mb-1">Syntax</dt>
                <dd className="text-lg font-mono font-bold text-blue-900">Rego</dd>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                <dt className="text-xs font-medium text-green-700 mb-1">Status</dt>
                <dd className="text-lg font-bold text-green-900 flex items-center gap-1">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Active
                </dd>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                <dt className="text-xs font-medium text-purple-700 mb-1">Test Coverage</dt>
                <dd className="text-lg font-bold text-purple-900">{policy.metadata.testCount} tests</dd>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
                <dt className="text-xs font-medium text-gray-700 mb-1">Last Modified</dt>
                <dd className="text-sm font-mono text-gray-900">
                  {new Date(policy.metadata.lastModified).toLocaleDateString()}
                </dd>
              </div>
            </div>
          </div>

          {/* Policy Tester (conditional) */}
          {showTester && (
            <div className="animate-in slide-in-from-top duration-300">
              <PolicyTester policyId={policy.policyId} />
            </div>
          )}

          {/* Two-Column Layout: Rules Navigator + Code Viewer */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Rules Navigator */}
            <div className="lg:col-span-1 space-y-4">
              {/* Search Box */}
              <div className="bg-white shadow rounded-lg p-4">
                <label htmlFor="rule-search" className="block text-sm font-medium text-gray-700 mb-2">
                  Search Rules
                </label>
                <div className="relative">
                  <input
                    id="rule-search"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or description..."
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                {searchTerm && (
                  <p className="mt-2 text-xs text-gray-600">
                    Found {filteredRules.length} of {policy.rules.length} rules
                  </p>
                )}
              </div>

              {/* Rules by Category */}
              <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900">
                    📊 Policy Rules ({filteredRules.length})
                  </h3>
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {searchTerm ? (
                    // Show flat filtered list when searching
                    <div className="divide-y divide-gray-200">
                      {filteredRules.map((rule) => {
                        const explanation = RULE_EXPLANATIONS[rule];
                        const location = ruleLocations.find(loc => loc.ruleName === rule);
                        
                        return (
                          <button
                            key={rule}
                            onClick={() => jumpToRule(rule)}
                            className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <code className="text-sm font-mono font-semibold text-gray-900 block truncate">
                                  {rule}
                                </code>
                                {explanation && (
                                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                    {explanation.short}
                                  </p>
                                )}
                                {location && (
                                  <p className="text-xs text-blue-600 mt-1">
                                    Line {location.lineNumber}
                                  </p>
                                )}
                              </div>
                              <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    // Show categorized accordion when not searching
                    <div className="divide-y divide-gray-200">
                      {Object.entries(groupedRules).map(([category, rules]) => (
                        <Disclosure key={category} defaultOpen={category === 'Core Authorization'}>
                          {({ open }) => (
                            <>
                              <Disclosure.Button className="flex w-full justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors">
                                <span>{category} ({rules.length})</span>
                                <svg
                                  className={`${open ? 'rotate-180 transform' : ''} h-5 w-5 text-gray-500 transition-transform`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </Disclosure.Button>
                              <Disclosure.Panel className="bg-gray-50">
                                {rules.map((rule) => {
                                  const explanation = RULE_EXPLANATIONS[rule];
                                  const location = ruleLocations.find(loc => loc.ruleName === rule);
                                  
                                  return (
                                    <button
                                      key={rule}
                                      onClick={() => jumpToRule(rule)}
                                      className="w-full text-left px-6 py-2 hover:bg-blue-50 transition-colors group border-l-2 border-transparent hover:border-blue-500"
                                    >
                                      <code className="text-xs font-mono font-semibold text-gray-900 block">
                                        {rule}
                                      </code>
                                      {explanation && (
                                        <p className="text-xs text-gray-600 mt-0.5">
                                          {explanation.short}
                                        </p>
                                      )}
                                      {location && (
                                        <p className="text-xs text-blue-600 mt-0.5">
                                          Line {location.lineNumber}
                                        </p>
                                      )}
                                    </button>
                                  );
                                })}
                              </Disclosure.Panel>
                            </>
                          )}
                        </Disclosure>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-blue-900 mb-2">
                  ℹ️ About This Policy
                </h4>
                <p className="text-xs text-blue-800 leading-relaxed">
                  This policy implements <strong>ACP-240 Data-Centric Security</strong> with fail-secure enforcement
                  following NATO standards.
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                    🛡️ ACP-240
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                    Fail-Secure
                  </span>
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                    ZTDF
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Source Code Viewer */}
            <div className="lg:col-span-2">
              <div id="policy-source-code" className="bg-white shadow rounded-lg overflow-hidden sticky top-4">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      📝 Policy Source Code
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Rego (Open Policy Agent) - {policy.lines} lines • Click rules to jump to definition
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(policy.content);
                      alert('Policy code copied to clipboard!');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                  >
                    📋 Copy Code
                  </button>
                </div>
                
                {/* Code Display with Enhanced Line Numbers and Highlighting */}
                <div className="bg-gray-900 text-gray-100 overflow-auto max-h-[800px]">
                  <pre className="text-sm font-mono leading-relaxed">
                    {policy.content.split('\n').map((line, index) => {
                      const lineNum = index + 1;
                      const isHighlighted = lineNum === highlightedLine;
                      
                      return (
                        <div
                          key={index}
                          id={`line-${lineNum}`}
                          className={`flex transition-colors duration-300 ${
                            isHighlighted 
                              ? 'bg-yellow-400 bg-opacity-20 border-l-4 border-yellow-400' 
                              : 'hover:bg-gray-800'
                          }`}
                        >
                          <span className={`inline-block w-16 text-right px-3 py-1 select-none ${
                            isHighlighted ? 'text-yellow-400 font-bold' : 'text-gray-500'
                          }`}>
                            {lineNum}
                          </span>
                          <code className={`flex-1 py-1 pr-4 ${
                            isHighlighted ? 'text-yellow-100' : 'text-gray-100'
                          }`}>
                            {line || '\u00A0'}
                          </code>
                        </div>
                      );
                    })}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="mt-2 text-gray-500">Policy not found</p>
        </div>
      )}
    </PageLayout>
  );
}
