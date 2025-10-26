'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface IPolicyUpload {
  policyId: string;
  type: 'rego' | 'xacml';
  filename: string;
  validated: boolean;
  metadata: {
    name: string;
    packageOrPolicyId: string;
    rulesCount: number;
    createdAt: string;
  };
}

interface PolicyListTabProps {
  refreshTrigger: number;
}

export default function PolicyListTab({ refreshTrigger }: PolicyListTabProps) {
  const { data: session } = useSession();
  const [policies, setPolicies] = useState<IPolicyUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);

  useEffect(() => {
    fetchPolicies();
  }, [refreshTrigger]);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/policies-lab/list');
      
      if (!response.ok) {
        throw new Error('Failed to fetch policies');
      }

      const data = await response.json();
      setPolicies(data.policies || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (policyId: string) => {
    if (!confirm('Are you sure you want to delete this policy?')) {
      return;
    }

    try {
      const response = await fetch(`/api/policies-lab/${policyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete policy');
      }

      // Refresh list
      fetchPolicies();
    } catch (err) {
      alert('Error deleting policy: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-2">❌ {error}</div>
        <button
          onClick={fetchPolicies}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (policies.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No policies yet</h3>
        <p className="mt-1 text-sm text-gray-500">
          Get started by uploading your first Rego or XACML policy.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Tip: Sample policies are available in <code className="bg-gray-100 px-1">policies/uploads/samples/</code>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {policies.length} {policies.length === 1 ? 'policy' : 'policies'} uploaded (max 10)
        </p>
        <button
          onClick={fetchPolicies}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
        >
          <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {policies.map((policy) => (
          <div
            key={policy.policyId}
            className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
              selectedPolicy === policy.policyId ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {policy.metadata.name}
                  </h3>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded ${
                      policy.type === 'rego'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {policy.type.toUpperCase()}
                  </span>
                  {policy.validated ? (
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800">
                      ✓ Validated
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800">
                      ✗ Invalid
                    </span>
                  )}
                </div>

                <div className="text-sm text-gray-600 space-y-1">
                  <p>
                    <span className="font-medium">Package/Policy ID:</span>{' '}
                    <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">
                      {policy.metadata.packageOrPolicyId}
                    </code>
                  </p>
                  <p>
                    <span className="font-medium">Rules:</span> {policy.metadata.rulesCount}
                  </p>
                  <p>
                    <span className="font-medium">File:</span> {policy.filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    Uploaded: {new Date(policy.metadata.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 ml-4">
                <button
                  onClick={() => setSelectedPolicy(policy.policyId === selectedPolicy ? null : policy.policyId)}
                  className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                >
                  {selectedPolicy === policy.policyId ? 'Hide' : 'View'}
                </button>
                <button
                  onClick={() => handleDelete(policy.policyId)}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {selectedPolicy === policy.policyId && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700">Policy ID:</span>
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-800">
                    {policy.policyId}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(policy.policyId)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                    title="Copy to clipboard"
                  >
                    📋
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Use this policy ID in the <strong>Evaluate</strong> tab to test it with different inputs.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Upload Limit Warning */}
      {policies.length >= 8 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-sm text-amber-800">
            ⚠️ You have {policies.length}/10 policies uploaded. 
            {policies.length >= 10 
              ? ' Delete some policies to upload new ones.'
              : ` ${10 - policies.length} remaining.`
            }
          </p>
        </div>
      )}
    </div>
  );
}

