'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  User,
  FileText,
  Shield,
  Globe,
  Lock,
  Users,
  Key,
  AlertTriangle,
  Zap,
  Clock,
  RefreshCw,
  Target,
  Sparkles
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface PolicyTestInput {
  subject: {
    authenticated: boolean;
    uniqueID: string;
    clearance: string;
    countryOfAffiliation: string;
    acpCOI: string[];
  };
  action: {
    operation: string;
  };
  resource: {
    resourceId: string;
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    encrypted: boolean;
  };
  context: {
    currentTime: string;
    requestId: string;
  };
}

interface PolicyTestResult {
  allow: boolean;
  reason: string;
  obligations?: any[];
  evaluation_details?: {
    checks?: Record<string, boolean>;
  };
}

interface QuickScenario {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  expected: 'ALLOW' | 'DENY';
  input: PolicyTestInput;
}

interface PolicyEditorTestPanelProps {
  source: string;
  policyName?: string;
  onTestResult?: (result: PolicyTestResult | null) => void;
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CLEARANCE_LEVELS = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
const COUNTRIES = ['USA', 'GBR', 'CAN', 'AUS', 'NZL', 'FRA', 'DEU'];
const COI_OPTIONS = ['FVEY', 'NATO-COSMIC', 'CAN-US', 'US-ONLY'];

// Quick test scenarios
const QUICK_SCENARIOS: QuickScenario[] = [
  {
    id: 'basic-allow',
    name: 'Basic Allow',
    description: 'USA SECRET user accessing USA-releasable SECRET doc',
    icon: Shield,
    expected: 'ALLOW',
    input: {
      subject: {
        authenticated: true,
        uniqueID: 'test.user.usa@mil',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY']
      },
      action: { operation: 'view' },
      resource: {
        resourceId: 'doc-test-001',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'CAN'],
        COI: [],
        encrypted: false
      },
      context: {
        currentTime: new Date().toISOString(),
        requestId: `test-${Date.now()}`
      }
    }
  },
  {
    id: 'insufficient-clearance',
    name: 'Clearance Denied',
    description: 'CONFIDENTIAL user accessing SECRET document',
    icon: Lock,
    expected: 'DENY',
    input: {
      subject: {
        authenticated: true,
        uniqueID: 'test.user.low@mil',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'USA',
        acpCOI: []
      },
      action: { operation: 'view' },
      resource: {
        resourceId: 'doc-secret-001',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        COI: [],
        encrypted: false
      },
      context: {
        currentTime: new Date().toISOString(),
        requestId: `test-${Date.now()}`
      }
    }
  },
  {
    id: 'country-denied',
    name: 'Country Denied',
    description: 'FRA user accessing USA-only document',
    icon: Globe,
    expected: 'DENY',
    input: {
      subject: {
        authenticated: true,
        uniqueID: 'test.user.fra@defense.gouv.fr',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'FRA',
        acpCOI: []
      },
      action: { operation: 'view' },
      resource: {
        resourceId: 'doc-usa-only-001',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        COI: [],
        encrypted: false
      },
      context: {
        currentTime: new Date().toISOString(),
        requestId: `test-${Date.now()}`
      }
    }
  },
  {
    id: 'coalition-fvey',
    name: 'Five Eyes Coalition',
    description: 'GBR TOP_SECRET user with FVEY COI',
    icon: Users,
    expected: 'ALLOW',
    input: {
      subject: {
        authenticated: true,
        uniqueID: 'test.user.gbr@mod.gov.uk',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'GBR',
        acpCOI: ['FVEY', 'NATO-COSMIC']
      },
      action: { operation: 'view' },
      resource: {
        resourceId: 'doc-fvey-intel-001',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        COI: ['FVEY'],
        encrypted: false
      },
      context: {
        currentTime: new Date().toISOString(),
        requestId: `test-${Date.now()}`
      }
    }
  }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Simulates OPA policy evaluation client-side
 * This is a simplified version for the editor preview
 * In production, this would call the actual OPA endpoint
 */
function simulateOPAEvaluation(source: string, input: PolicyTestInput): PolicyTestResult {
  const checks: Record<string, boolean> = {};
  const reasons: string[] = [];

  // Check authentication
  checks.authenticated = input.subject.authenticated;
  if (!checks.authenticated) {
    reasons.push('Subject is not authenticated');
  }

  // Check required attributes
  checks.required_attributes = !!(
    input.subject.uniqueID &&
    input.subject.clearance &&
    input.subject.countryOfAffiliation
  );
  if (!checks.required_attributes) {
    reasons.push('Missing required subject attributes');
  }

  // Check clearance (simple hierarchy)
  const clearanceRank: Record<string, number> = {
    'UNCLASSIFIED': 0,
    'CONFIDENTIAL': 1,
    'SECRET': 2,
    'TOP_SECRET': 3
  };
  const subjectRank = clearanceRank[input.subject.clearance] ?? -1;
  const resourceRank = clearanceRank[input.resource.classification] ?? 99;
  checks.clearance_sufficient = subjectRank >= resourceRank;
  if (!checks.clearance_sufficient) {
    reasons.push(`Insufficient clearance: ${input.subject.clearance} < ${input.resource.classification}`);
  }

  // Check country releasability
  checks.country_releasable = input.resource.releasabilityTo.includes(input.subject.countryOfAffiliation);
  if (!checks.country_releasable) {
    reasons.push(`Country ${input.subject.countryOfAffiliation} not in releasability list`);
  }

  // Check COI (if resource has COI requirements)
  if (input.resource.COI.length > 0) {
    const intersection = input.resource.COI.filter(c => input.subject.acpCOI.includes(c));
    checks.coi_satisfied = intersection.length > 0;
    if (!checks.coi_satisfied) {
      reasons.push('No Community of Interest intersection');
    }
  } else {
    checks.coi_satisfied = true;
  }

  // Determine overall decision
  const allow = Object.values(checks).every(v => v);

  return {
    allow,
    reason: allow ? 'All checks passed' : reasons[0] || 'Access denied',
    obligations: allow && input.resource.encrypted ? [{ type: 'REQUEST_KAS_KEY' }] : [],
    evaluation_details: { checks }
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PolicyEditorTestPanel({
  source,
  policyName = 'Policy',
  onTestResult,
  className = ''
}: PolicyEditorTestPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<PolicyTestResult | null>(null);

  // Custom test input state
  const [subjectClearance, setSubjectClearance] = useState('SECRET');
  const [subjectCountry, setSubjectCountry] = useState('USA');
  const [subjectCOI, setSubjectCOI] = useState<string[]>(['FVEY']);
  const [resourceClassification, setResourceClassification] = useState('SECRET');
  const [resourceReleasability, setResourceReleasability] = useState<string[]>(['USA', 'GBR']);
  const [resourceCOI, setResourceCOI] = useState<string[]>([]);
  const [resourceEncrypted, setResourceEncrypted] = useState(false);

  const runTest = async (input: PolicyTestInput) => {
    setIsTesting(true);
    setResult(null);

    // Simulate network delay
    await new Promise(r => setTimeout(r, 300));

    // Run simulated evaluation
    const testResult = simulateOPAEvaluation(source, input);

    setResult(testResult);
    onTestResult?.(testResult);
    setIsTesting(false);
  };

  const runCustomTest = () => {
    const input: PolicyTestInput = {
      subject: {
        authenticated: true,
        uniqueID: 'custom.test.user',
        clearance: subjectClearance,
        countryOfAffiliation: subjectCountry,
        acpCOI: subjectCOI
      },
      action: { operation: 'view' },
      resource: {
        resourceId: 'custom-test-resource',
        classification: resourceClassification,
        releasabilityTo: resourceReleasability,
        COI: resourceCOI,
        encrypted: resourceEncrypted
      },
      context: {
        currentTime: new Date().toISOString(),
        requestId: `custom-${Date.now()}`
      }
    };

    runTest(input);
  };

  const toggleArrayItem = (arr: string[], item: string, setter: (arr: string[]) => void) => {
    if (arr.includes(item)) {
      setter(arr.filter(i => i !== item));
    } else {
      setter([...arr, item]);
    }
  };

  const reset = () => {
    setResult(null);
    setSubjectClearance('SECRET');
    setSubjectCountry('USA');
    setSubjectCOI(['FVEY']);
    setResourceClassification('SECRET');
    setResourceReleasability(['USA', 'GBR']);
    setResourceCOI([]);
    setResourceEncrypted(false);
  };

  return (
    <div className={`rounded-xl bg-slate-900/50 border border-slate-700/50 overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between hover:bg-slate-800/70 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <Play className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-200">Policy Tester</h3>
            <p className="text-xs text-gray-500">Test your policy with sample inputs</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {result && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              result.allow
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {result.allow ? 'ALLOW' : 'DENY'}
            </span>
          )}
          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {/* Mode Toggle */}
              <div className="flex items-center gap-2 p-1 bg-slate-800/50 rounded-lg">
                <button
                  onClick={() => setIsCustomMode(false)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                    !isCustomMode
                      ? 'bg-teal-500/20 text-teal-300'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  Quick Scenarios
                </button>
                <button
                  onClick={() => setIsCustomMode(true)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                    isCustomMode
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Custom Test
                </button>
              </div>

              {!isCustomMode ? (
                /* Quick Scenarios */
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_SCENARIOS.map((scenario) => {
                    const Icon = scenario.icon;
                    const isAllow = scenario.expected === 'ALLOW';

                    return (
                      <button
                        key={scenario.id}
                        onClick={() => runTest(scenario.input)}
                        disabled={isTesting}
                        className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-teal-500/30 hover:bg-slate-800 transition-all text-left group disabled:opacity-50"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            isAllow ? 'bg-emerald-500/20' : 'bg-red-500/20'
                          }`}>
                            <Icon className={`w-3.5 h-3.5 ${isAllow ? 'text-emerald-400' : 'text-red-400'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-200 truncate">
                                {scenario.name}
                              </span>
                              <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                                isAllow ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                              }`}>
                                {scenario.expected}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">
                              {scenario.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Custom Test Form */
                <div className="space-y-4">
                  {/* Subject Section */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-blue-400" />
                      Subject
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Clearance</label>
                        <select
                          value={subjectClearance}
                          onChange={(e) => setSubjectClearance(e.target.value)}
                          className="w-full px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                        >
                          {CLEARANCE_LEVELS.map(level => (
                            <option key={level} value={level}>{level}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Country</label>
                        <select
                          value={subjectCountry}
                          onChange={(e) => setSubjectCountry(e.target.value)}
                          className="w-full px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                        >
                          {COUNTRIES.map(country => (
                            <option key={country} value={country}>{country}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">COI</label>
                      <div className="flex flex-wrap gap-1">
                        {COI_OPTIONS.map(coi => (
                          <button
                            key={coi}
                            onClick={() => toggleArrayItem(subjectCOI, coi, setSubjectCOI)}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                              subjectCOI.includes(coi)
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-slate-800/50 text-gray-500 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            {coi}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Resource Section */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-purple-400" />
                      Resource
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Classification</label>
                        <select
                          value={resourceClassification}
                          onChange={(e) => setResourceClassification(e.target.value)}
                          className="w-full px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700/50 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                        >
                          {CLEARANCE_LEVELS.map(level => (
                            <option key={level} value={level}>{level}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={resourceEncrypted}
                            onChange={(e) => setResourceEncrypted(e.target.checked)}
                            className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-teal-500 focus:ring-teal-500/50"
                          />
                          <span className="text-xs text-gray-400">Encrypted (ZTDF)</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Releasable To</label>
                      <div className="flex flex-wrap gap-1">
                        {COUNTRIES.map(country => (
                          <button
                            key={country}
                            onClick={() => toggleArrayItem(resourceReleasability, country, setResourceReleasability)}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                              resourceReleasability.includes(country)
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'bg-slate-800/50 text-gray-500 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            {country}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Run Button */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={runCustomTest}
                      disabled={isTesting}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-500 text-white text-sm font-semibold hover:from-teal-400 hover:to-cyan-400 transition-all disabled:opacity-50"
                    >
                      {isTesting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Run Test
                        </>
                      )}
                    </button>
                    <button
                      onClick={reset}
                      className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                      title="Reset"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Result Display */}
              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`p-4 rounded-lg border ${
                      result.allow
                        ? 'bg-emerald-900/20 border-emerald-500/30'
                        : 'bg-red-900/20 border-red-500/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        result.allow ? 'bg-emerald-500/30' : 'bg-red-500/30'
                      }`}>
                        {result.allow ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-bold ${result.allow ? 'text-emerald-300' : 'text-red-300'}`}>
                          {result.allow ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
                        </p>
                        <p className={`text-xs mt-1 ${result.allow ? 'text-emerald-200/70' : 'text-red-200/70'}`}>
                          {result.reason}
                        </p>

                        {/* Check Results */}
                        {result.evaluation_details?.checks && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {Object.entries(result.evaluation_details.checks).map(([key, passed]) => (
                              <span
                                key={key}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${
                                  passed
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                              >
                                {passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                {key.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Obligations */}
                        {result.obligations && result.obligations.length > 0 && (
                          <div className="mt-3 p-2 rounded bg-amber-900/20 border border-amber-500/20">
                            <p className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                              <Key className="w-3 h-3" />
                              Obligations:
                            </p>
                            <div className="flex gap-1 mt-1">
                              {result.obligations.map((ob, i) => (
                                <span key={i} className="text-[10px] text-amber-300 font-mono">
                                  {ob.type}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Info Note */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-gray-500">
                  This is a simulated evaluation based on common policy patterns.
                  Push to Policies Lab for actual OPA evaluation.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

