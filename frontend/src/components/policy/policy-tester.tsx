'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

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

export default function PolicyTester({ policyId }: PolicyTesterProps) {
  const { data: session } = useSession();
  const [result, setResult] = useState<IPolicyTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
    const accessToken = (session as any)?.accessToken;

    if (!accessToken) {
      setError('No access token available. Please ensure you are logged in.');
      setLoading(false);
      return;
    }

    if (!session?.user) {
      setError('Session not fully loaded. Please refresh the page.');
      setLoading(false);
      return;
    }

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
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to test policy');
      }

      const data: IPolicyTestResult = await response.json();
      
      // Validate response structure
      if (!data.decision || typeof data.decision !== 'object') {
        throw new Error('Invalid response structure: missing decision object');
      }
      
      if (!data.decision.evaluation_details) {
        console.warn('[PolicyTester] Response missing evaluation_details, using defaults');
        // Add default evaluation_details if missing
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
    } else {
      alert('Session not available. Please ensure you are logged in.');
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        🧪 Test This Policy
      </h3>
      <p className="text-sm text-gray-600 mb-6">
        Enter subject, resource, and context attributes to test policy decision.
      </p>

      <form onSubmit={handleTest} className="space-y-6">
        {/* Subject Attributes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Subject Attributes</h4>
            <button
              type="button"
              onClick={handleLoadUserAttributes}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Load My Attributes
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Unique ID
              </label>
              <input
                type="text"
                value={subjectUniqueID}
                onChange={(e) => setSubjectUniqueID(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="test.user@mil"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Clearance
              </label>
              <select
                value={subjectClearance}
                onChange={(e) => setSubjectClearance(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="UNCLASSIFIED">UNCLASSIFIED</option>
                <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                <option value="SECRET">SECRET</option>
                <option value="TOP_SECRET">TOP SECRET</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Country (ISO 3166-1 alpha-3)
              </label>
              <input
                type="text"
                value={subjectCountry}
                onChange={(e) => setSubjectCountry(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="USA"
                maxLength={3}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                COI (comma-separated)
              </label>
              <input
                type="text"
                value={subjectCOI}
                onChange={(e) => setSubjectCOI(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="FVEY,NATO-COSMIC"
              />
            </div>
          </div>
        </div>

        {/* Resource Attributes */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Resource Attributes</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Resource ID
              </label>
              <input
                type="text"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Classification
              </label>
              <select
                value={resourceClassification}
                onChange={(e) => setResourceClassification(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="UNCLASSIFIED">UNCLASSIFIED</option>
                <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                <option value="SECRET">SECRET</option>
                <option value="TOP_SECRET">TOP SECRET</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Releasability To (comma-separated)
              </label>
              <input
                type="text"
                value={resourceReleasability}
                onChange={(e) => setResourceReleasability(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="USA,GBR,CAN"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                COI (comma-separated)
              </label>
              <input
                type="text"
                value={resourceCOI}
                onChange={(e) => setResourceCOI(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="FVEY"
              />
            </div>
            <div className="col-span-2">
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={resourceEncrypted}
                  onChange={(e) => setResourceEncrypted(e.target.checked)}
                  className="mr-2"
                />
                Resource is encrypted
              </label>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? 'Testing...' : 'Test Policy Decision'}
        </button>
      </form>

      {/* Results */}
      {error && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-red-900 mb-1">Error</h4>
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          {/* Decision Summary */}
          <div className={`border-2 rounded-lg p-4 ${
            result.decision?.allow
              ? 'bg-green-50 border-green-300'
              : 'bg-red-50 border-red-300'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`text-lg font-bold ${
                  result.decision?.allow ? 'text-green-900' : 'text-red-900'
                }`}>
                  {result.decision?.allow ? '✅ ALLOW' : '❌ DENY'}
                </h4>
                <p className={`text-sm mt-1 ${
                  result.decision?.allow ? 'text-green-800' : 'text-red-800'
                }`}>
                  {result.decision?.reason || 'No reason provided'}
                </p>
              </div>
              <div className="text-xs text-gray-600">
                {result.executionTime}
              </div>
            </div>
          </div>

          {/* Evaluation Details */}
          {result.decision?.evaluation_details?.checks && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                Evaluation Details
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(result.decision.evaluation_details.checks).map(([key, passed]) => (
                <div
                  key={key}
                  className={`flex items-center justify-between p-2 rounded text-xs ${
                    passed
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-red-50 border border-red-200'
                  }`}
                >
                  <span className="font-medium text-gray-700">
                    {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </span>
                  <span className={`font-bold ${passed ? 'text-green-700' : 'text-red-700'}`}>
                    {passed ? '✓ PASS' : '✗ FAIL'}
                  </span>
                </div>
                ))}
              </div>
            </div>
          )}

          {/* ACP-240 Compliance */}
          {result.decision?.evaluation_details?.acp240_compliance && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">
                🛡️ ACP-240 Compliance
              </h4>
              <dl className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <dt className="text-blue-700 mb-1">ZTDF Validation</dt>
                  <dd className="font-mono font-semibold text-blue-900">
                    {result.decision.evaluation_details.acp240_compliance.ztdf_validation ? 'Enabled' : 'Disabled'}
                  </dd>
                </div>
                <div>
                  <dt className="text-blue-700 mb-1">KAS Obligations</dt>
                  <dd className="font-mono font-semibold text-blue-900">
                    {result.decision.evaluation_details.acp240_compliance.kas_obligations ? 'Yes' : 'No'}
                  </dd>
                </div>
                <div>
                  <dt className="text-blue-700 mb-1">Fail-Closed</dt>
                  <dd className="font-mono font-semibold text-blue-900">
                    {result.decision.evaluation_details.acp240_compliance.fail_closed_enforcement ? 'Enforced' : 'No'}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

