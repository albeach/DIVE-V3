'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

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
      const response = await fetch('/api/policies-lab/list', {
        credentials: 'include', // Required for session cookies to be sent
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch policies');
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
        credentials: 'include', // Required for session cookies to be sent
      });

      if (!response.ok) {
        throw new Error('Failed to delete policy');
      }

      toast.success('Policy deleted successfully');
      // Refresh list
      fetchPolicies();
    } catch (err) {
      toast.error('Failed to delete policy', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div role="status" aria-label="Loading policies" className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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

  const handleLoadSamples = async () => {
    try {
      const response = await fetch('/api/policies-lab/load-samples', {
        method: 'POST',
        credentials: 'include', // Required for session cookies to be sent
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load sample policies');
      }

      const data = await response.json();
      toast.success(`✅ Loaded ${data.count} sample policies`, {
        description: data.policies?.join(', ') || '',
      });
      
      // Refresh list
      fetchPolicies();
    } catch (err) {
      toast.error('Failed to load sample policies', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

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
          Get started by uploading your first Rego or XACML policy, or load sample policies to explore.
        </p>
        <div className="mt-6">
          <button
            onClick={handleLoadSamples}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            📦 Load Sample Policies
          </button>
        </div>
        <p className="mt-4 text-xs text-gray-400">
          Sample policies include: Clearance Policy (Rego), Releasability Policy (Rego), and XACML Clearance Policy
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
