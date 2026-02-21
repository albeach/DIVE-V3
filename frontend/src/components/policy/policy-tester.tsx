'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  FileText,
  Shield,
  Globe,
  Users,
  Lock,
  Calendar,
  Key,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  Clock,
  Info,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Lightbulb,
  Target,
  FlaskConical,
  TestTube2,
  FileCode2,
  Timer,
  TriangleAlert,
  CircleDot
} from 'lucide-react';
import type { IUnitTest, IUnitTestResult, IPolicyUnitTests, IOPATestRunResult } from '@/types/policy.types';

interface IOPADecision {
  allow: boolean;
  reason: string;
  obligations: any[];
  evaluation_details: {
    checks: {
      authenticated: boolean;
      required_attributes: boolean;
      clearance_sufficient: boolean;
      country_releasable: boolean;
      coi_satisfied: boolean;
      embargo_passed: boolean;
      ztdf_integrity_valid: boolean;
    };
    subject: {
      uniqueID: string;
      clearance: string;
      country: string;
    };
    resource: {
      resourceId: string;
      classification: string;
      encrypted: boolean;
      ztdfEnabled: boolean;
    };
    acp240_compliance: {
      ztdf_validation: boolean;
      kas_obligations: boolean;
      fail_closed_enforcement: boolean;
    };
  };
}

interface IPolicyTestResult {
  decision: IOPADecision;
  executionTime: string;
  timestamp: string;
}

interface PolicyTesterProps {
  policyId: string;
}

// Clearance level hierarchy with colors
const CLEARANCE_LEVELS = [
  { value: 'UNCLASSIFIED', label: 'UNCLASSIFIED', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', borderColor: 'border-emerald-500/30' },
  { value: 'CONFIDENTIAL', label: 'CONFIDENTIAL', color: 'text-blue-400', bgColor: 'bg-blue-500/20', borderColor: 'border-blue-500/30' },
  { value: 'SECRET', label: 'SECRET', color: 'text-amber-400', bgColor: 'bg-amber-500/20', borderColor: 'border-amber-500/30' },
  { value: 'TOP_SECRET', label: 'TOP SECRET', color: 'text-red-400', bgColor: 'bg-red-500/20', borderColor: 'border-red-500/30' }
];

// Preset test scenarios for quick testing
const TEST_SCENARIOS = [
  {
    id: 'us-secret-access',
    name: 'USA Secret Access',
    description: 'US user accessing USA-releasable SECRET document',
    icon: Shield,
    color: 'text-emerald-400',
    expected: 'ALLOW',
    config: {
      subjectClearance: 'SECRET',
      subjectCountry: 'USA',
      subjectCOI: 'FVEY',
      resourceClassification: 'SECRET',
      resourceReleasability: 'USA,GBR,CAN',
      resourceCOI: 'FVEY'
    }
  },
  {
    id: 'coalition-fvey',
    name: 'Five Eyes Coalition',
    description: 'GBR user in FVEY accessing shared intelligence',
    icon: Globe,
    color: 'text-blue-400',
    expected: 'ALLOW',
    config: {
      subjectClearance: 'TOP_SECRET',
      subjectCountry: 'GBR',
      subjectCOI: 'FVEY,NATO-COSMIC',
      resourceClassification: 'SECRET',
      resourceReleasability: 'USA,GBR,CAN,AUS,NZL',
      resourceCOI: 'FVEY'
    }
  },
  {
    id: 'clearance-insufficient',
    name: 'Insufficient Clearance',
    description: 'CONFIDENTIAL user accessing SECRET document',
    icon: Lock,
    color: 'text-amber-400',
    expected: 'DENY',
    config: {
      subjectClearance: 'CONFIDENTIAL',
      subjectCountry: 'USA',
      subjectCOI: '',
      resourceClassification: 'SECRET',
      resourceReleasability: 'USA',
      resourceCOI: ''
    }
  },
  {
    id: 'country-denied',
    name: 'Country Not Releasable',
    description: 'FRA user accessing USA-only document',
    icon: Globe,
    color: 'text-red-400',
    expected: 'DENY',
    config: {
      subjectClearance: 'TOP_SECRET',
      subjectCountry: 'FRA',
      subjectCOI: '',
      resourceClassification: 'SECRET',
      resourceReleasability: 'USA,GBR',
      resourceCOI: ''
    }
  },
  {
    id: 'coi-mismatch',
    name: 'COI Mismatch',
    description: 'User missing required community of interest',
    icon: Users,
    color: 'text-purple-400',
    expected: 'DENY',
    config: {
      subjectClearance: 'TOP_SECRET',
      subjectCountry: 'USA',
      subjectCOI: 'FVEY',
      resourceClassification: 'SECRET',
      resourceReleasability: 'USA',
      resourceCOI: 'NATO-COSMIC'
    }
  },
  {
    id: 'encrypted-resource',
    name: 'Encrypted Resource',
    description: 'Accessing ZTDF-encrypted document (KAS required)',
    icon: Key,
    color: 'text-cyan-400',
    expected: 'ALLOW + KAS',
    config: {
      subjectClearance: 'SECRET',
      subjectCountry: 'USA',
      subjectCOI: 'FVEY',
      resourceClassification: 'SECRET',
      resourceReleasability: 'USA',
      resourceCOI: '',
      encrypted: true
    }
  }
];

// Educational tooltips for form fields
const FIELD_HINTS: Record<string, { title: string; description: string; example?: string }> = {
  uniqueID: {
    title: 'Unique Identifier',
    description: 'The subject\'s unique identifier from the identity provider. Used for audit logging.',
    example: 'john.doe@army.mil'
  },
  clearance: {
    title: 'Security Clearance Level',
    description: 'Hierarchical clearance: UNCLASSIFIED → CONFIDENTIAL → SECRET → TOP SECRET. Subject must have clearance ≥ resource classification.',
    example: 'SECRET allows access to UNCLASSIFIED, CONFIDENTIAL, and SECRET'
  },
  country: {
    title: 'Country of Affiliation',
    description: 'ISO 3166-1 alpha-3 country code. Must be in the resource\'s releasabilityTo list.',
    example: 'USA, GBR, FRA, DEU, CAN'
  },
  coi: {
    title: 'Communities of Interest',
    description: 'Compartmentalized access groups. Subject must have ANY overlapping COI with the resource.',
    example: 'FVEY, NATO-COSMIC, US-ONLY'
  },
  releasability: {
    title: 'Releasability List',
    description: 'Countries allowed to access this resource. If empty, no one can access (fail-secure).',
    example: 'USA,GBR,CAN for Five Eyes subset'
  },
  encrypted: {
    title: 'ZTDF Encryption',
    description: 'Zero Trust Data Format encryption. Requires KAS key release after authorization.',
  }
};

// Check explanations for educational display
const CHECK_EXPLANATIONS: Record<string, { name: string; description: string; standard?: string }> = {
  authenticated: {
    name: 'Authentication',
    description: 'Validates user has valid, unexpired credentials from trusted IdP',
    standard: 'ADatP-5663'
  },
  required_attributes: {
    name: 'Required Attributes',
    description: 'Ensures all mandatory attributes (uniqueID, clearance, country) are present',
    standard: 'ACP-240 §3.2'
  },
  clearance_sufficient: {
    name: 'Clearance Level',
    description: 'User clearance must be ≥ resource classification in hierarchy',
    standard: 'ACP-240 §6.1'
  },
  country_releasable: {
    name: 'Country Releasability',
    description: 'User\'s country must be in resource\'s releasabilityTo list',
    standard: 'STANAG 4774/5636'
  },
  coi_satisfied: {
    name: 'Community of Interest',
    description: 'User must have ANY overlapping COI with resource (if resource has COI)',
    standard: 'ACP-240 §7.3'
  },
  embargo_passed: {
    name: 'Embargo Check',
    description: 'Current time must be after resource\'s embargo/release date',
    standard: 'STANAG 5636'
  },
  ztdf_integrity_valid: {
    name: 'ZTDF Integrity',
    description: 'For encrypted resources, validates cryptographic binding is intact',
    standard: 'STANAG 4778'
  }
};

export default function PolicyTester({ policyId }: PolicyTesterProps) {
  const { data: session } = useSession();
  const [result, setResult] = useState<IPolicyTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showScenarios, setShowScenarios] = useState(true);
  const [expandedHint, setExpandedHint] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);

  // Unit Tests state
  const [showUnitTests, setShowUnitTests] = useState(true);
  const [unitTests, setUnitTests] = useState<IPolicyUnitTests | null>(null);
  const [unitTestResults, setUnitTestResults] = useState<IOPATestRunResult | null>(null);
  const [unitTestsLoading, setUnitTestsLoading] = useState(false);
  const [runningTests, setRunningTests] = useState(false);

  // Fetch access token from secure server-side API
  useEffect(() => {
    async function fetchAccessToken() {
      try {
        const response = await fetch('/api/auth/session-tokens');
        if (response.ok) {
          const data = await response.json();
          if (data.accessToken) {
            setAccessToken(data.accessToken);
          } else {
            console.warn('[PolicyTester] No access token in response');
          }
        } else {
          console.warn('[PolicyTester] Failed to fetch tokens:', response.status);
        }
      } catch (err) {
        console.error('[PolicyTester] Error fetching tokens:', err);
      } finally {
        setTokenLoading(false);
      }
    }

    if (session) {
      fetchAccessToken();
    } else {
      setTokenLoading(false);
    }
  }, [session]);

  // Fetch unit tests for this policy
  useEffect(() => {
    async function fetchUnitTests() {
      setUnitTestsLoading(true);
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
        const response = await fetch(`${backendUrl}/api/policies/${policyId}/unit-tests`);
        if (response.ok) {
          const data = await response.json();
          setUnitTests(data);
        }
      } catch (err) {
        console.error('[PolicyTester] Error fetching unit tests:', err);
      } finally {
        setUnitTestsLoading(false);
      }
    }
    fetchUnitTests();
  }, [policyId]);

  // Run unit tests
  const handleRunUnitTests = async () => {
    if (!accessToken) {
      return;
    }

    setRunningTests(true);
    setUnitTestResults(null);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
      const response = await fetch(`${backendUrl}/api/policies/${policyId}/run-tests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUnitTestResults(data);
      } else {
        console.error('[PolicyTester] Failed to run tests:', response.status);
      }
    } catch (err) {
      console.error('[PolicyTester] Error running unit tests:', err);
    } finally {
      setRunningTests(false);
    }
  };

  // Form state
  const [subjectUniqueID, setSubjectUniqueID] = useState('');
  const [subjectClearance, setSubjectClearance] = useState('SECRET');
  const [subjectCountry, setSubjectCountry] = useState('USA');
  const [subjectCOI, setSubjectCOI] = useState('');
  const [resourceId, setResourceId] = useState('test-resource-001');
  const [resourceClassification, setResourceClassification] = useState('SECRET');
  const [resourceReleasability, setResourceReleasability] = useState('USA,GBR');
  const [resourceCOI, setResourceCOI] = useState('');
  const [resourceEncrypted, setResourceEncrypted] = useState(false);

  // Get clearance config for display
  const subjectClearanceConfig = useMemo(() =>
    CLEARANCE_LEVELS.find(c => c.value === subjectClearance) || CLEARANCE_LEVELS[2],
  [subjectClearance]);

  const resourceClearanceConfig = useMemo(() =>
    CLEARANCE_LEVELS.find(c => c.value === resourceClassification) || CLEARANCE_LEVELS[2],
  [resourceClassification]);

  const applyScenario = (scenario: typeof TEST_SCENARIOS[0]) => {
    setSubjectClearance(scenario.config.subjectClearance);
    setSubjectCountry(scenario.config.subjectCountry);
    setSubjectCOI(scenario.config.subjectCOI);
    setResourceClassification(scenario.config.resourceClassification);
    setResourceReleasability(scenario.config.resourceReleasability);
    setResourceCOI(scenario.config.resourceCOI);
    setResourceEncrypted(scenario.config.encrypted || false);
    setSubjectUniqueID(`test.user.${scenario.config.subjectCountry.toLowerCase()}`);
    setResourceId(`resource-${scenario.id}`);
    setResult(null);
  };

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';

    if (!accessToken) {
      // Try to fetch token again if not available
      try {
        const response = await fetch('/api/auth/session-tokens');
        if (response.ok) {
          const data = await response.json();
          if (data.accessToken) {
            setAccessToken(data.accessToken);
          } else {
            setError('No access token available. Please ensure you are logged in and try again.');
            setLoading(false);
            return;
          }
        } else {
          setError('Failed to retrieve access token. Please refresh the page and try again.');
          setLoading(false);
          return;
        }
      } catch {
        setError('Error retrieving access token. Please refresh the page.');
        setLoading(false);
        return;
      }
    }

    if (!session?.user) {
      setError('Session not fully loaded. Please refresh the page.');
      setLoading(false);
      return;
    }

    // Use the accessToken from state (refreshed above if needed)
    const tokenToUse = accessToken;

    try {
      const input = {
        input: {
          subject: {
            authenticated: true,
            uniqueID: subjectUniqueID || 'test.user',
            clearance: subjectClearance,
            countryOfAffiliation: subjectCountry,
            acpCOI: subjectCOI ? subjectCOI.split(',').map(s => s.trim()) : []
          },
          action: {
            operation: 'view'
          },
          resource: {
            resourceId,
            classification: resourceClassification,
            releasabilityTo: resourceReleasability.split(',').map(s => s.trim()),
            COI: resourceCOI ? resourceCOI.split(',').map(s => s.trim()) : [],
            encrypted: resourceEncrypted
          },
          context: {
            currentTime: new Date().toISOString(),
            sourceIP: '10.0.0.1',
            deviceCompliant: true,
            requestId: `test-${Date.now()}`
          }
        }
      };

      const response = await fetch(`${backendUrl}/api/policies/${policyId}/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenToUse}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to test policy');
      }

      const data: IPolicyTestResult = await response.json();

      if (!data.decision || typeof data.decision !== 'object') {
        throw new Error('Invalid response structure: missing decision object');
      }

      if (!data.decision.evaluation_details) {
        data.decision.evaluation_details = {
          checks: {
            authenticated: false,
            required_attributes: false,
            clearance_sufficient: false,
            country_releasable: false,
            coi_satisfied: false,
            embargo_passed: false,
            ztdf_integrity_valid: false,
          },
          subject: {
            uniqueID: subjectUniqueID,
            clearance: subjectClearance,
            country: subjectCountry,
          },
          resource: {
            resourceId,
            classification: resourceClassification,
            encrypted: resourceEncrypted,
            ztdfEnabled: false,
          },
          acp240_compliance: {
            ztdf_validation: false,
            kas_obligations: false,
            fail_closed_enforcement: true,
          },
        };
      }

      setResult(data);

    } catch (err) {
      console.error('[PolicyTester] Error during test:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadUserAttributes = () => {
    if (session?.user) {
      setSubjectUniqueID(session.user.uniqueID || session.user.email || '');
      setSubjectClearance(session.user.clearance || 'SECRET');
      setSubjectCountry(session.user.countryOfAffiliation || 'USA');
      const coi = session.user.acpCOI;
      setSubjectCOI(Array.isArray(coi) ? coi.join(',') : (coi || ''));
    }
  };

  const handleReset = () => {
    setSubjectUniqueID('');
    setSubjectClearance('SECRET');
    setSubjectCountry('USA');
    setSubjectCOI('');
    setResourceId('test-resource-001');
    setResourceClassification('SECRET');
    setResourceReleasability('USA,GBR');
    setResourceCOI('');
    setResourceEncrypted(false);
    setResult(null);
    setError(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800/95 to-slate-900 border border-slate-700/50"
    >
      {/* Decorative Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="tester-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#tester-grid)" />
        </svg>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-800/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
                <FlaskConical className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                  Policy Tester
                  <span className="px-2 py-0.5 text-xs font-mono bg-teal-500/20 text-teal-300 rounded-md">
                    Interactive
                  </span>
                </h3>
                <p className="text-sm text-gray-400">
                  Test authorization decisions with custom attributes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset
              </button>
              <button
                type="button"
                onClick={handleLoadUserAttributes}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700/50 hover:bg-slate-700 text-gray-300 rounded-lg transition-colors border border-slate-600/50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Use My Attributes
              </button>
            </div>
          </div>
        </div>

        {/* Quick Test Scenarios */}
        <div className="px-6 py-4 border-b border-slate-700/30 bg-slate-800/20">
          <button
            onClick={() => setShowScenarios(!showScenarios)}
            className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white transition-colors w-full"
          >
            {showScenarios ? (
              <ChevronDown className="w-4 h-4 text-teal-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-teal-400" />
            )}
            <Target className="w-4 h-4" />
            Quick Test Scenarios
            <span className="ml-2 text-xs text-gray-500">
              ({TEST_SCENARIOS.length} presets)
            </span>
          </button>

          <AnimatePresence>
            {showScenarios && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                  {TEST_SCENARIOS.map((scenario, index) => {
                    const Icon = scenario.icon;
                    const isAllow = scenario.expected.includes('ALLOW');
                    return (
                      <motion.button
                        key={scenario.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => applyScenario(scenario)}
                        className="group relative p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 hover:bg-slate-800 transition-all text-left"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            isAllow ? 'bg-emerald-500/20' : 'bg-red-500/20'
                          }`}>
                            <Icon className={`w-4 h-4 ${scenario.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-200 truncate">
                                {scenario.name}
                              </span>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                isAllow
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {scenario.expected}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                              {scenario.description}
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 group-hover:text-teal-400 group-hover:translate-x-1 transition-all" />
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Policy Unit Tests Section */}
        {(unitTests && unitTests.totalTests > 0) && (
          <div className="px-6 py-4 border-b border-slate-700/30 bg-slate-800/20">
            <button
              onClick={() => setShowUnitTests(!showUnitTests)}
              className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white transition-colors w-full"
            >
              {showUnitTests ? (
                <ChevronDown className="w-4 h-4 text-purple-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-purple-400" />
              )}
              <TestTube2 className="w-4 h-4" />
              Policy Unit Tests
              <span className="ml-2 text-xs text-gray-500">
                ({unitTests.totalTests} tests)
              </span>
              {unitTestResults && (
                <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded ${
                  unitTestResults.failed === 0
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {unitTestResults.passed}/{unitTestResults.passed + unitTestResults.failed} passed
                </span>
              )}
            </button>

            <AnimatePresence>
              {showUnitTests && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4 space-y-4">
                    {/* Header with Run Button */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <FileCode2 className="w-3.5 h-3.5" />
                          {unitTests.testFiles.length} test file{unitTests.testFiles.length !== 1 ? 's' : ''}
                        </div>
                        {unitTestResults && (
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Timer className="w-3.5 h-3.5" />
                            {unitTestResults.duration}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleRunUnitTests}
                        disabled={runningTests || !accessToken}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 hover:border-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {runningTests ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            Run All Tests
                          </>
                        )}
                      </button>
                    </div>

                    {/* Test Results Summary */}
                    {unitTestResults && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-lg border ${
                          unitTestResults.failed === 0
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-red-500/10 border-red-500/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {unitTestResults.failed === 0 ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400" />
                          )}
                          <div>
                            <div className={`font-medium ${
                              unitTestResults.failed === 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {unitTestResults.failed === 0 ? 'All Tests Passed!' : `${unitTestResults.failed} Test${unitTestResults.failed !== 1 ? 's' : ''} Failed`}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {unitTestResults.passed} passed, {unitTestResults.failed} failed, {unitTestResults.skipped} skipped
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Test List */}
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {unitTests.tests.map((test, index) => {
                        const testResult = unitTestResults?.results.find(r => r.name === test.name);
                        return (
                          <motion.div
                            key={test.name}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.02 }}
                            className={`flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 border transition-all ${
                              testResult
                                ? testResult.passed
                                  ? 'border-emerald-500/30'
                                  : 'border-red-500/30'
                                : 'border-slate-700/50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {testResult ? (
                                testResult.passed ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                )
                              ) : (
                                <CircleDot className="w-4 h-4 text-gray-500 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-mono text-gray-300 truncate">
                                  {test.name}
                                </div>
                                {test.description && (
                                  <div className="text-[10px] text-gray-500 truncate">
                                    {test.description}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {testResult?.duration && (
                                <span className="text-[10px] text-gray-500 font-mono">
                                  {testResult.duration}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-600">
                                L{test.lineNumber}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Educational Note */}
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                      <Info className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-gray-400">
                        <span className="text-purple-300 font-medium">Unit tests</span> validate individual policy rules in isolation using{' '}
                        <code className="px-1 py-0.5 rounded bg-slate-700/50 text-purple-300 text-[10px]">opa test</code>.
                        They ensure your Rego logic works correctly before deployment.
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Unit Tests Loading State */}
        {unitTestsLoading && (
          <div className="px-6 py-4 border-b border-slate-700/30 bg-slate-800/20">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading unit tests...
            </div>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleTest} className="p-6 space-y-6">
          {/* Two-Column Layout for Subject and Resource */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Subject Attributes */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-700/50">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-blue-400" />
                </div>
                <h4 className="text-sm font-semibold text-gray-200">Subject Attributes</h4>
                <span title="The person or system requesting access" className="ml-auto">
                  <Lightbulb className="w-4 h-4 text-gray-500 cursor-help" />
                </span>
              </div>

              <div className="space-y-4">
                {/* Unique ID */}
                <FormField
                  label="Unique ID"
                  hint={FIELD_HINTS.uniqueID}
                  expandedHint={expandedHint}
                  setExpandedHint={setExpandedHint}
                  fieldId="uniqueID"
                >
                  <input
                    type="text"
                    value={subjectUniqueID}
                    onChange={(e) => setSubjectUniqueID(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all"
                    placeholder="john.doe@army.mil"
                  />
                </FormField>

                {/* Clearance */}
                <FormField
                  label="Clearance Level"
                  hint={FIELD_HINTS.clearance}
                  expandedHint={expandedHint}
                  setExpandedHint={setExpandedHint}
                  fieldId="clearance"
                >
                  <div className="relative">
                    <select
                      value={subjectClearance}
                      onChange={(e) => setSubjectClearance(e.target.value)}
                      className={`w-full px-3 py-2.5 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all appearance-none cursor-pointer ${subjectClearanceConfig.bgColor} ${subjectClearanceConfig.borderColor} ${subjectClearanceConfig.color}`}
                    >
                      {CLEARANCE_LEVELS.map(level => (
                        <option key={level.value} value={level.value} className="bg-slate-900 text-gray-200">
                          {level.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </FormField>

                {/* Country */}
                <FormField
                  label="Country"
                  hint={FIELD_HINTS.country}
                  expandedHint={expandedHint}
                  setExpandedHint={setExpandedHint}
                  fieldId="country"
                >
                  <input
                    type="text"
                    value={subjectCountry}
                    onChange={(e) => setSubjectCountry(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-gray-200 font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all"
                    placeholder="USA"
                    maxLength={3}
                  />
                </FormField>

                {/* COI */}
                <FormField
                  label="Communities of Interest"
                  hint={FIELD_HINTS.coi}
                  expandedHint={expandedHint}
                  setExpandedHint={setExpandedHint}
                  fieldId="coi"
                >
                  <input
                    type="text"
                    value={subjectCOI}
                    onChange={(e) => setSubjectCOI(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-gray-200 font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all"
                    placeholder="FVEY,NATO-COSMIC"
                  />
                </FormField>
              </div>
            </div>

            {/* Resource Attributes */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-700/50">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-purple-400" />
                </div>
                <h4 className="text-sm font-semibold text-gray-200">Resource Attributes</h4>
                <span title="The document or asset being accessed" className="ml-auto">
                  <Lightbulb className="w-4 h-4 text-gray-500 cursor-help" />
                </span>
              </div>

              <div className="space-y-4">
                {/* Resource ID */}
                <FormField
                  label="Resource ID"
                  expandedHint={expandedHint}
                  setExpandedHint={setExpandedHint}
                  fieldId="resourceId"
                >
                  <input
                    type="text"
                    value={resourceId}
                    onChange={(e) => setResourceId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-gray-200 font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all"
                    placeholder="doc-secret-001"
                  />
                </FormField>

                {/* Classification */}
                <FormField
                  label="Classification"
                  hint={FIELD_HINTS.clearance}
                  expandedHint={expandedHint}
                  setExpandedHint={setExpandedHint}
                  fieldId="classification"
                >
                  <div className="relative">
                    <select
                      value={resourceClassification}
                      onChange={(e) => setResourceClassification(e.target.value)}
                      className={`w-full px-3 py-2.5 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all appearance-none cursor-pointer ${resourceClearanceConfig.bgColor} ${resourceClearanceConfig.borderColor} ${resourceClearanceConfig.color}`}
                    >
                      {CLEARANCE_LEVELS.map(level => (
                        <option key={level.value} value={level.value} className="bg-slate-900 text-gray-200">
                          {level.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </FormField>

                {/* Releasability */}
                <FormField
                  label="Releasable To"
                  hint={FIELD_HINTS.releasability}
                  expandedHint={expandedHint}
                  setExpandedHint={setExpandedHint}
                  fieldId="releasability"
                >
                  <input
                    type="text"
                    value={resourceReleasability}
                    onChange={(e) => setResourceReleasability(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-gray-200 font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all"
                    placeholder="USA,GBR,CAN"
                  />
                </FormField>

                {/* Resource COI */}
                <FormField
                  label="Required COI"
                  hint={FIELD_HINTS.coi}
                  expandedHint={expandedHint}
                  setExpandedHint={setExpandedHint}
                  fieldId="resourceCOI"
                >
                  <input
                    type="text"
                    value={resourceCOI}
                    onChange={(e) => setResourceCOI(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-gray-200 font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all"
                    placeholder="FVEY"
                  />
                </FormField>
              </div>
            </div>
          </div>

          {/* Encryption Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/30 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                resourceEncrypted ? 'bg-cyan-500/20' : 'bg-slate-700/50'
              }`}>
                <Key className={`w-5 h-5 ${resourceEncrypted ? 'text-cyan-400' : 'text-gray-500'}`} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-200">
                  ZTDF Encryption
                </label>
                <p className="text-xs text-gray-500">
                  Zero Trust Data Format - requires KAS key release
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={resourceEncrypted}
              onClick={() => setResourceEncrypted(!resourceEncrypted)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/50 ${
                resourceEncrypted ? 'bg-cyan-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  resourceEncrypted ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || tokenLoading}
            className="w-full py-3.5 px-6 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center gap-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30"
          >
            {tokenLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading Session...
              </>
            ) : loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Evaluating Policy...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Test Policy Decision
                <Zap className="w-4 h-4 opacity-50" />
              </>
            )}
          </button>

          {/* Token Status Indicator */}
          {!tokenLoading && (
            <div className="flex items-center justify-center gap-2 text-xs">
              {accessToken ? (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Session authenticated
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Token not available - try refreshing
                </span>
              )}
            </div>
          )}
        </form>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pb-6"
            >
              <div className="p-4 rounded-xl bg-red-900/20 border border-red-500/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-red-300">Error</h4>
                    <p className="text-sm text-red-200/80 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results Display */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="px-6 pb-6 space-y-4"
            >
              {/* Decision Banner */}
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className={`relative overflow-hidden rounded-xl p-5 ${
                  result.decision?.allow
                    ? 'bg-gradient-to-br from-emerald-900/40 to-green-900/20 border border-emerald-500/40'
                    : 'bg-gradient-to-br from-red-900/40 to-rose-900/20 border border-red-500/40'
                }`}
              >
                {/* Decorative glow */}
                <div className={`absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl ${
                  result.decision?.allow ? 'bg-emerald-500/20' : 'bg-red-500/20'
                }`} />

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                      result.decision?.allow ? 'bg-emerald-500/30' : 'bg-red-500/30'
                    }`}>
                      {result.decision?.allow ? (
                        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                      ) : (
                        <XCircle className="w-8 h-8 text-red-400" />
                      )}
                    </div>
                    <div>
                      <h4 className={`text-2xl font-bold ${
                        result.decision?.allow ? 'text-emerald-300' : 'text-red-300'
                      }`}>
                        {result.decision?.allow ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
                      </h4>
                      <p className={`text-sm mt-1 ${
                        result.decision?.allow ? 'text-emerald-200/80' : 'text-red-200/80'
                      }`}>
                        {result.decision?.reason || 'No reason provided'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="w-3.5 h-3.5" />
                      {result.executionTime}
                    </div>
                  </div>
                </div>

                {/* Obligations Banner */}
                {result.decision?.obligations && result.decision.obligations.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-900/30 border border-amber-500/30">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-medium text-amber-300">
                        Post-Decision Obligations
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.decision.obligations.map((ob, i) => (
                        <span key={i} className="px-2 py-1 text-xs font-mono bg-amber-500/20 text-amber-200 rounded">
                          {typeof ob === 'string' ? ob : JSON.stringify(ob)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Evaluation Checks Grid */}
              {result.decision?.evaluation_details?.checks && (
                <div className="rounded-xl border border-slate-700/50 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-teal-400" />
                    <h4 className="text-sm font-semibold text-gray-200">
                      Authorization Checks
                    </h4>
                    <span className="ml-auto text-xs text-gray-500">
                      ACP-240 Compliance
                    </span>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(result.decision.evaluation_details.checks).map(([key, passed], index) => {
                      const explanation = CHECK_EXPLANATIONS[key];
                      return (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className={`group relative p-3 rounded-lg border transition-colors ${
                            passed
                              ? 'bg-emerald-900/10 border-emerald-500/20 hover:border-emerald-500/40'
                              : 'bg-red-900/10 border-red-500/20 hover:border-red-500/40'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium text-gray-300">
                                {explanation?.name || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                              {explanation?.standard && (
                                <span className="ml-2 text-[10px] text-gray-600 font-mono">
                                  {explanation.standard}
                                </span>
                              )}
                            </div>
                            <div className={`flex-shrink-0 ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
                              {passed ? (
                                <CheckCircle2 className="w-4 h-4" />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                            </div>
                          </div>
                          {explanation && (
                            <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
                              {explanation.description}
                            </p>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ACP-240 Compliance Status */}
              {result.decision?.evaluation_details?.acp240_compliance && (
                <div className="p-4 rounded-xl bg-blue-900/10 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <h4 className="text-sm font-semibold text-blue-300">
                      ACP-240 Compliance Status
                    </h4>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 rounded-lg bg-slate-800/30">
                      <div className={`text-lg font-bold ${
                        result.decision.evaluation_details.acp240_compliance.ztdf_validation
                          ? 'text-emerald-400' : 'text-gray-500'
                      }`}>
                        {result.decision.evaluation_details.acp240_compliance.ztdf_validation ? 'ACTIVE' : 'N/A'}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">ZTDF Validation</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-slate-800/30">
                      <div className={`text-lg font-bold ${
                        result.decision.evaluation_details.acp240_compliance.kas_obligations
                          ? 'text-amber-400' : 'text-gray-500'
                      }`}>
                        {result.decision.evaluation_details.acp240_compliance.kas_obligations ? 'REQUIRED' : 'NONE'}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">KAS Obligations</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-slate-800/30">
                      <div className={`text-lg font-bold ${
                        result.decision.evaluation_details.acp240_compliance.fail_closed_enforcement
                          ? 'text-cyan-400' : 'text-red-400'
                      }`}>
                        {result.decision.evaluation_details.acp240_compliance.fail_closed_enforcement ? 'ENFORCED' : 'DISABLED'}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">Fail-Closed</div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Reusable Form Field Component
function FormField({
  label,
  hint,
  expandedHint,
  setExpandedHint,
  fieldId,
  children
}: {
  label: string;
  hint?: { title: string; description: string; example?: string };
  expandedHint: string | null;
  setExpandedHint: (id: string | null) => void;
  fieldId: string;
  children: React.ReactNode;
}) {
  const isExpanded = expandedHint === fieldId;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-400">
          {label}
        </label>
        {hint && (
          <button
            type="button"
            onClick={() => setExpandedHint(isExpanded ? null : fieldId)}
            className={`p-0.5 rounded transition-colors ${
              isExpanded ? 'text-teal-400' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {children}
      <AnimatePresence>
        {hint && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2.5 rounded-lg bg-teal-900/20 border border-teal-500/20 text-xs text-teal-200/80">
              <p>{hint.description}</p>
              {hint.example && (
                <p className="mt-1.5 font-mono text-[10px] text-teal-300/60">
                  Example: {hint.example}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
