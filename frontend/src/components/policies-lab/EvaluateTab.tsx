'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import ResultsComparator from './ResultsComparator';

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

export default function EvaluateTab() {
  const { data: session } = useSession();
  const [policies, setPolicies] = useState<IPolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<INormalizedDecision | null>(null);
  const [error, setError] = useState('');

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
      const response = await fetch('/api/policies-lab/list');
      if (!response.ok) throw new Error('Failed to fetch policies');
      const data = await response.json();
      setPolicies(data.policies || []);
    } catch (err) {
      console.error('Error fetching policies:', err);
    }
  };

  const loadPreset = (presetKey: keyof typeof PRESETS) => {
    const preset = PRESETS[presetKey];
    const input = preset.input;

    // Subject
    setUniqueID(input.subject.uniqueID);
    setClearance(input.subject.clearance);
    setCountry(input.subject.countryOfAffiliation);
    setAcpCOI('acpCOI' in input.subject ? input.subject.acpCOI : []);
    setAuthenticated(input.subject.authenticated ?? true);
    setAal(input.subject.aal || 'AAL2');

    // Action
    setAction(input.action);

    // Resource
    setResourceId(input.resource.resourceId);
    setResourceClassification(input.resource.classification);
    setReleasabilityTo(input.resource.releasabilityTo);
    setResourceCOI('COI' in input.resource ? input.resource.COI : []);
    setEncrypted(input.resource.encrypted ?? false);
    setCreationDate('');

    // Context
    setCurrentTime(new Date().toISOString().slice(0, 16));
    setSourceIP('10.0.0.1');
    setDeviceCompliant(true);
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unified: unifiedInput }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Evaluation failed');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed');
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
      {/* Policy Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Policy to Evaluate *
        </label>
        <select
          value={selectedPolicyId}
          onChange={(e) => setSelectedPolicyId(e.target.value)}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">-- Select a policy --</option>
          {policies.map((policy) => (
            <option key={policy.policyId} value={policy.policyId}>
              {policy.metadata.name} ({policy.type.toUpperCase()}) - {policy.metadata.packageOrPolicyId}
            </option>
          ))}
        </select>
        {policies.length === 0 && (
          <p className="mt-2 text-sm text-amber-600">
            ⚠️ No policies uploaded yet. Upload a policy first in the "My Policies" tab.
          </p>
        )}
      </div>

      {/* Presets */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Quick Presets
        </label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => loadPreset(key as keyof typeof PRESETS)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-left"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Input Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subject */}
        <div className="space-y-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
          <h3 className="text-lg font-semibold text-blue-900">👤 Subject</h3>
          
          <div>
            <label htmlFor="subject-uniqueID" className="block text-sm font-medium text-gray-700 mb-1">Unique ID *</label>
            <input
              id="subject-uniqueID"
              type="text"
              value={uniqueID}
              onChange={(e) => setUniqueID(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="subject-clearance" className="block text-sm font-medium text-gray-700 mb-1">Clearance *</label>
            <select
              id="subject-clearance"
              value={clearance}
              onChange={(e) => setClearance(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              {clearanceLevels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="subject-country" className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
            <select
              id="subject-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">COI (optional)</label>
            <div className="space-y-1">
              {coiOptions.map((coi) => (
                <label key={coi} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={acpCOI.includes(coi)}
                    onChange={() => toggleArrayItem(acpCOI, setAcpCOI, coi)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">{coi}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="subject-authenticated"
              type="checkbox"
              checked={authenticated}
              onChange={(e) => setAuthenticated(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="subject-authenticated" className="ml-2 text-sm text-gray-700">Authenticated</label>
          </div>

          <div>
            <label htmlFor="subject-aal" className="block text-sm font-medium text-gray-700 mb-1">AAL</label>
            <select
              id="subject-aal"
              value={aal}
              onChange={(e) => setAal(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              {aalLevels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Resource */}
        <div className="space-y-4 p-4 border border-green-200 rounded-lg bg-green-50">
          <h3 className="text-lg font-semibold text-green-900">📄 Resource</h3>
          
          <div>
            <label htmlFor="resource-id" className="block text-sm font-medium text-gray-700 mb-1">Resource ID *</label>
            <input
              id="resource-id"
              type="text"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="resource-classification" className="block text-sm font-medium text-gray-700 mb-1">Classification *</label>
            <select
              id="resource-classification"
              value={resourceClassification}
              onChange={(e) => setResourceClassification(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
            >
              {clearanceLevels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-1">Releasability To *</legend>
            <div className="space-y-1 max-h-32 overflow-y-auto" role="group" aria-label="Releasability To">
              {countries.map((c) => (
                <label key={c} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={releasabilityTo.includes(c)}
                    onChange={() => toggleArrayItem(releasabilityTo, setReleasabilityTo, c)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">{c}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">COI (optional)</label>
            <div className="space-y-1">
              {coiOptions.map((coi) => (
                <label key={coi} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={resourceCOI.includes(coi)}
                    onChange={() => toggleArrayItem(resourceCOI, setResourceCOI, coi)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">{coi}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="resource-encrypted"
              type="checkbox"
              checked={encrypted}
              onChange={(e) => setEncrypted(e.target.checked)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <label htmlFor="resource-encrypted" className="ml-2 text-sm text-gray-700">Encrypted</label>
          </div>

          <div>
            <label htmlFor="resource-creation-date" className="block text-sm font-medium text-gray-700 mb-1">Creation Date (optional)</label>
            <input
              id="resource-creation-date"
              type="datetime-local"
              value={creationDate}
              onChange={(e) => setCreationDate(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm"
            />
          </div>
        </div>

        {/* Action & Context */}
        <div className="space-y-4">
          <div className="p-4 border border-purple-200 rounded-lg bg-purple-50">
            <h3 className="text-lg font-semibold text-purple-900 mb-4">⚡ Action</h3>
            <select
              id="action-select"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
            >
              {actions.map((a) => (
                <option key={a} value={a}>{a.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="p-4 border border-amber-200 rounded-lg bg-amber-50">
            <h3 className="text-lg font-semibold text-amber-900 mb-4">🌐 Context</h3>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="context-current-time" className="block text-sm font-medium text-gray-700 mb-1">Current Time *</label>
                <input
                  id="context-current-time"
                  type="datetime-local"
                  value={currentTime}
                  onChange={(e) => setCurrentTime(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="context-source-ip" className="block text-sm font-medium text-gray-700 mb-1">Source IP (optional)</label>
                <input
                  id="context-source-ip"
                  type="text"
                  value={sourceIP}
                  onChange={(e) => setSourceIP(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                  placeholder="10.0.0.1"
                />
              </div>

              <div className="flex items-center">
                <input
                  id="context-device-compliant"
                  type="checkbox"
                  checked={deviceCompliant}
                  onChange={(e) => setDeviceCompliant(e.target.checked)}
                  className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="context-device-compliant" className="ml-2 text-sm text-gray-700">Device Compliant</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Evaluate Button */}
      <div className="flex justify-center">
        <button
          onClick={handleEvaluate}
          disabled={loading || !selectedPolicyId}
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Evaluating...
            </>
          ) : (
            <>
              <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Evaluate Policy
            </>
          )}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Evaluation Error</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && <ResultsComparator result={result} />}
    </div>
  );
}

