'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Zap,
  Play,
  Copy,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  User,
  FileText,
  Globe,
  Clock
} from 'lucide-react';
import ResultsComparator from '@/components/policies-lab/ResultsComparator';

interface IPolicy {
  policyId: string;
  type: 'rego' | 'xacml';
  metadata: {
    name: string;
    packageOrPolicyId: string;
  };
}

interface IUnifiedInput {
  subject: {
    uniqueID: string;
    clearance: string;
    countryOfAffiliation: string;
    acpCOI?: string[];
    authenticated?: boolean;
    aal?: string;
  };
  action: string;
  resource: {
    resourceId: string;
    classification: string;
    releasabilityTo: string[];
    COI?: string[];
    encrypted?: boolean;
    creationDate?: string;
  };
  context: {
    currentTime: string;
    sourceIP?: string;
    requestId: string;
    deviceCompliant?: boolean;
  };
}

interface INormalizedDecision {
  engine: string;
  decision: string;
  reason: string;
  obligations: Array<{ type: string; params: Record<string, unknown> }>;
  advice?: Array<{ type: string; params: Record<string, unknown> }>;
  evaluation_details: {
    latency_ms: number;
    policy_version: string;
    trace: Array<{ rule: string; result: boolean; reason: string }>;
  };
  policy_metadata: {
    id: string;
    type: string;
    packageOrPolicyId: string;
    name: string;
  };
  inputs: {
    unified: IUnifiedInput;
    rego_input: object;
    xacml_request: string;
  };
}

const PRESETS = {
  clearance_match_allow: {
    name: 'Clearance Match (ALLOW)',
    description: 'User with SECRET clearance accessing SECRET document',
    input: {
      subject: {
        uniqueID: 'john.doe@mil',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY'],
        authenticated: true,
        aal: 'AAL2'
      },
      action: 'read',
      resource: {
        resourceId: 'doc-123',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'CAN'],
        COI: ['FVEY'],
        encrypted: false
      }
    }
  },
  clearance_mismatch_deny: {
    name: 'Clearance Mismatch (DENY)',
    description: 'CONFIDENTIAL user trying to access SECRET document',
    input: {
      subject: {
        uniqueID: 'jane.smith@gov',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'USA',
        authenticated: true,
        aal: 'AAL1'
      },
      action: 'read',
      resource: {
        resourceId: 'doc-456',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        encrypted: false
      }
    }
  },
  releasability_fail_deny: {
    name: 'Releasability Fail (DENY)',
    description: 'French user accessing USA-only document',
    input: {
      subject: {
        uniqueID: 'pierre.dupont@defense.fr',
        clearance: 'SECRET',
        countryOfAffiliation: 'FRA',
        authenticated: true,
        aal: 'AAL2'
      },
      action: 'read',
      resource: {
        resourceId: 'doc-789',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        encrypted: false
      }
    }
  },
  coi_match_allow: {
    name: 'COI Match (ALLOW)',
    description: 'FVEY member accessing FVEY-tagged document',
    input: {
      subject: {
        uniqueID: 'alice.wong@nzdf.mil.nz',
        clearance: 'SECRET',
        countryOfAffiliation: 'NZL',
        acpCOI: ['FVEY'],
        authenticated: true,
        aal: 'AAL2'
      },
      action: 'read',
      resource: {
        resourceId: 'doc-fvey-001',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        COI: ['FVEY'],
        encrypted: false
      }
    }
  }
};

export default function TestTab() {
  const { data: session } = useSession();
  const [policies, setPolicies] = useState<IPolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<INormalizedDecision | null>(null);
  const [error, setError] = useState('');

  // Collapsed sections
  const [subjectExpanded, setSubjectExpanded] = useState(true);
  const [resourceExpanded, setResourceExpanded] = useState(true);
  const [contextExpanded, setContextExpanded] = useState(false);

  // Form state
  const [uniqueID, setUniqueID] = useState('test.user@example.com');
  const [clearance, setClearance] = useState('SECRET');
  const [country, setCountry] = useState('USA');
  const [acpCOI, setAcpCOI] = useState<string[]>([]);
  const [authenticated, setAuthenticated] = useState(true);
  const [aal, setAal] = useState('AAL2');
  const [action, setAction] = useState('read');
  const [resourceId, setResourceId] = useState('test-resource-001');
  const [resourceClassification, setResourceClassification] = useState('SECRET');
  const [releasabilityTo, setReleasabilityTo] = useState<string[]>(['USA']);
  const [resourceCOI, setResourceCOI] = useState<string[]>([]);
  const [encrypted, setEncrypted] = useState(false);
  const [creationDate, setCreationDate] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date().toISOString().slice(0, 16));
  const [sourceIP, setSourceIP] = useState('10.0.0.1');
  const [deviceCompliant, setDeviceCompliant] = useState(true);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      const response = await fetch('/api/policies-lab/list', {
        credentials: 'include',
      });
      if (!response.ok) {
        // Silently handle - user may not have any policies yet
        setPolicies([]);
        return;
      }
      const data = await response.json();
      setPolicies(data.policies || []);
    } catch (err) {
      // Silently handle fetch errors - policies list is optional
      setPolicies([]);
    }
  };

  const loadPreset = (presetKey: keyof typeof PRESETS, showToast: boolean = true) => {
    const preset = PRESETS[presetKey];
    const input = preset.input;

    if (!selectedPolicyId && policies.length > 0) {
      setSelectedPolicyId(policies[0].policyId);
    }

    setUniqueID(input.subject.uniqueID);
    setClearance(input.subject.clearance);
    setCountry(input.subject.countryOfAffiliation);
    setAcpCOI('acpCOI' in input.subject ? input.subject.acpCOI : []);
    setAuthenticated(input.subject.authenticated ?? true);
    setAal(input.subject.aal || 'AAL2');
    setAction(input.action);
    setResourceId(input.resource.resourceId);
    setResourceClassification(input.resource.classification);
    setReleasabilityTo(input.resource.releasabilityTo);
    setResourceCOI('COI' in input.resource ? input.resource.COI : []);
    setEncrypted(input.resource.encrypted ?? false);
    setCreationDate('');
    setCurrentTime(new Date().toISOString().slice(0, 16));
    setSourceIP('10.0.0.1');
    setDeviceCompliant(true);

    if (showToast) {
      toast.success(`Preset loaded: ${preset.name}`);
    }
  };

  const handleQuickDemo = async () => {
    if (policies.length === 0) {
      toast.error('No policies available', {
        description: 'Please upload a policy first in the Builder tab',
      });
      return;
    }

    setSelectedPolicyId(policies[0].policyId);
    toast.info('Quick Demo Started', {
      description: `Evaluating ${policies[0].metadata.name} with clearance match preset`,
    });

    loadPreset('clearance_match_allow', false);
    setTimeout(async () => {
      await handleEvaluate();
    }, 500);
  };

  const handleCopyInputJSON = () => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const unifiedInput: IUnifiedInput = {
      subject: {
        uniqueID,
        clearance,
        countryOfAffiliation: country,
        ...(acpCOI.length > 0 && { acpCOI }),
        authenticated,
        aal
      },
      action,
      resource: {
        resourceId,
        classification: resourceClassification,
        releasabilityTo,
        ...(resourceCOI.length > 0 && { COI: resourceCOI }),
        encrypted,
        ...(creationDate && { creationDate: new Date(creationDate).toISOString() })
      },
      context: {
        currentTime: new Date(currentTime).toISOString(),
        ...(sourceIP && { sourceIP }),
        requestId,
        deviceCompliant
      }
    };

    navigator.clipboard.writeText(JSON.stringify(unifiedInput, null, 2));
    toast.success('Input JSON copied to clipboard');
  };

  const handleEvaluate = async () => {
    if (!selectedPolicyId) {
      setError('Please select a policy');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const unifiedInput: IUnifiedInput = {
        subject: {
          uniqueID,
          clearance,
          countryOfAffiliation: country,
          ...(acpCOI.length > 0 && { acpCOI }),
          authenticated,
          aal
        },
        action,
        resource: {
          resourceId,
          classification: resourceClassification,
          releasabilityTo,
          ...(resourceCOI.length > 0 && { COI: resourceCOI }),
          encrypted,
          ...(creationDate && { creationDate: new Date(creationDate).toISOString() })
        },
        context: {
          currentTime: new Date(currentTime).toISOString(),
          ...(sourceIP && { sourceIP }),
          requestId,
          deviceCompliant
        }
      };

      const response = await fetch(`/api/policies-lab/${selectedPolicyId}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ unified: unifiedInput }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Evaluation failed');
      }

      const data = await response.json();
      setResult(data);
      toast.success('Evaluation complete', {
        description: `Decision: ${data.decision.toUpperCase()}`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Evaluation failed';
      setError(errorMessage);
      toast.error('Evaluation failed', { description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const countries = ['USA', 'FRA', 'CAN', 'GBR', 'DEU', 'AUS', 'NZL', 'ITA', 'POL'];
  const clearanceLevels = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
  const coiOptions = ['FVEY', 'NATO-COSMIC', 'CAN-US', 'US-ONLY'];
  const actions = ['read', 'write', 'delete', 'approve'];
  const aalLevels = ['AAL1', 'AAL2', 'AAL3'];

  const toggleArrayItem = (array: string[], setArray: (arr: string[]) => void, item: string) => {
    if (array.includes(item)) {
      setArray(array.filter(i => i !== item));
    } else {
      setArray([...array, item]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">Policy Tester</h2>
          <p className="text-sm text-gray-400 mt-1">
            Evaluate your policies with custom inputs or use quick presets
          </p>
        </div>
        <button
          onClick={handleQuickDemo}
          disabled={loading || policies.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm font-medium hover:from-purple-400 hover:to-pink-500 transition-all shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Zap className="w-4 h-4" />
          Quick Demo
        </button>
      </div>

      {/* Policy Selector */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Select Policy to Evaluate
        </label>
        <select
          value={selectedPolicyId}
          onChange={(e) => setSelectedPolicyId(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30"
        >
          <option value="">-- Select a policy --</option>
          {policies.map((policy) => (
            <option key={policy.policyId} value={policy.policyId}>
              {policy.metadata.name} ({policy.type.toUpperCase()}) - {policy.metadata.packageOrPolicyId}
            </option>
          ))}
        </select>
        {policies.length === 0 && (
          <p className="mt-2 text-sm text-amber-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            No policies uploaded. Create one in the Builder tab first.
          </p>
        )}
      </div>

      {/* Presets */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Quick Presets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => loadPreset(key as keyof typeof PRESETS)}
              className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-purple-500/30 hover:bg-slate-800 transition-all text-left group"
            >
              <span className="text-sm font-medium text-gray-200 group-hover:text-purple-300">
                {preset.name}
              </span>
              <p className="text-[11px] text-gray-500 mt-1">{preset.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Input Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Subject */}
        <div className="bg-slate-900/50 rounded-xl border border-blue-500/20 overflow-hidden">
          <button
            onClick={() => setSubjectExpanded(!subjectExpanded)}
            className="w-full flex items-center justify-between p-4 bg-blue-500/10 border-b border-blue-500/20"
          >
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-blue-400" />
              <span className="font-medium text-blue-300">Subject</span>
            </div>
            {subjectExpanded ? <ChevronUp className="w-4 h-4 text-blue-400" /> : <ChevronDown className="w-4 h-4 text-blue-400" />}
          </button>
          {subjectExpanded && (
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Unique ID</label>
                <input
                  type="text"
                  value={uniqueID}
                  onChange={(e) => setUniqueID(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Clearance</label>
                <select
                  value={clearance}
                  onChange={(e) => setClearance(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {clearanceLevels.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Country</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">COI</label>
                <div className="flex flex-wrap gap-2">
                  {coiOptions.map((coi) => (
                    <button
                      key={coi}
                      onClick={() => toggleArrayItem(acpCOI, setAcpCOI, coi)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        acpCOI.includes(coi)
                          ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                          : 'bg-slate-800/50 text-gray-400 border border-slate-700/50 hover:border-blue-500/30'
                      }`}
                    >
                      {coi}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={authenticated}
                    onChange={(e) => setAuthenticated(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/30"
                  />
                  <span className="text-xs text-gray-400">Authenticated</span>
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">AAL</label>
                <select
                  value={aal}
                  onChange={(e) => setAal(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  {aalLevels.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Resource */}
        <div className="bg-slate-900/50 rounded-xl border border-emerald-500/20 overflow-hidden">
          <button
            onClick={() => setResourceExpanded(!resourceExpanded)}
            className="w-full flex items-center justify-between p-4 bg-emerald-500/10 border-b border-emerald-500/20"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              <span className="font-medium text-emerald-300">Resource</span>
            </div>
            {resourceExpanded ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4 text-emerald-400" />}
          </button>
          {resourceExpanded && (
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Resource ID</label>
                <input
                  type="text"
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Classification</label>
                <select
                  value={resourceClassification}
                  onChange={(e) => setResourceClassification(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  {clearanceLevels.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Releasability To</label>
                <div className="flex flex-wrap gap-1">
                  {countries.map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleArrayItem(releasabilityTo, setReleasabilityTo, c)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        releasabilityTo.includes(c)
                          ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                          : 'bg-slate-800/50 text-gray-400 border border-slate-700/50 hover:border-emerald-500/30'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">COI</label>
                <div className="flex flex-wrap gap-2">
                  {coiOptions.map((coi) => (
                    <button
                      key={coi}
                      onClick={() => toggleArrayItem(resourceCOI, setResourceCOI, coi)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        resourceCOI.includes(coi)
                          ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                          : 'bg-slate-800/50 text-gray-400 border border-slate-700/50 hover:border-emerald-500/30'
                      }`}
                    >
                      {coi}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={encrypted}
                  onChange={(e) => setEncrypted(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500/30"
                />
                <span className="text-xs text-gray-400">Encrypted</span>
              </label>
            </div>
          )}
        </div>

        {/* Action & Context */}
        <div className="space-y-4">
          {/* Action */}
          <div className="bg-slate-900/50 rounded-xl border border-purple-500/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-purple-400" />
              <span className="font-medium text-purple-300">Action</span>
            </div>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            >
              {actions.map((a) => (
                <option key={a} value={a}>{a.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Context */}
          <div className="bg-slate-900/50 rounded-xl border border-amber-500/20 overflow-hidden">
            <button
              onClick={() => setContextExpanded(!contextExpanded)}
              className="w-full flex items-center justify-between p-4 bg-amber-500/10 border-b border-amber-500/20"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-400" />
                <span className="font-medium text-amber-300">Context</span>
              </div>
              {contextExpanded ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
            </button>
            {contextExpanded && (
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Current Time</label>
                  <input
                    type="datetime-local"
                    value={currentTime}
                    onChange={(e) => setCurrentTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Source IP</label>
                  <input
                    type="text"
                    value={sourceIP}
                    onChange={(e) => setSourceIP(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    placeholder="10.0.0.1"
                  />
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={deviceCompliant}
                    onChange={(e) => setDeviceCompliant(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500/30"
                  />
                  <span className="text-xs text-gray-400">Device Compliant</span>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={handleCopyInputJSON}
          disabled={!selectedPolicyId}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-gray-300 text-sm font-medium hover:bg-slate-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Copy className="w-4 h-4" />
          Copy Input JSON
        </button>
        <button
          onClick={handleEvaluate}
          disabled={loading || !selectedPolicyId}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm font-semibold hover:from-purple-400 hover:to-pink-500 transition-all shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Play className="w-5 h-5" />
          )}
          {loading ? 'Evaluating...' : 'Evaluate Policy'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-red-900/20 border border-red-500/30 flex items-start gap-3"
        >
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-red-300">Evaluation Error</h4>
            <p className="text-sm text-red-200/80 mt-1">{error}</p>
          </div>
        </motion.div>
      )}

      {/* Results */}
      {result && (
        <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-6">
          <ResultsComparator result={result} />
        </div>
      )}
    </div>
  );
}

