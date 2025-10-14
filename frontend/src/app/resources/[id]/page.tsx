'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface IResource {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  encrypted: boolean;
  creationDate?: string;
  content?: string;
  displayMarking?: string;
  ztdf?: {
    version: string;
    objectType: string;
    contentType: string;
    policyVersion: string;
    encryptionAlgorithm: string;
    kaoCount: number;
  };
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
  };
}

interface IAuthzError {
  error: string;
  message: string;
  reason?: string;
  details?: {
    checks?: Record<string, boolean>;
    subject?: {
      uniqueID?: string;
      clearance?: string;
      country?: string;
    };
    resource?: {
      resourceId?: string;
      classification?: string;
    };
  };
}

const classificationColors: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-300',
  'CONFIDENTIAL': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-300',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-300',
};

export default function ResourceDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const resourceId = params?.id as string;

  const [resource, setResource] = useState<IResource | null>(null);
  const [error, setError] = useState<IAuthzError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/login');
      return;
    }

    async function fetchResource() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const accessToken = (session as any)?.accessToken;

      if (!accessToken) {
        setError({
          error: 'Authentication Error',
          message: 'No access token available',
        });
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${backendUrl}/api/resources/${resourceId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData);
          setResource(null);
        } else {
          const data = await response.json();
          setResource(data);
          setError(null);
        }
      } catch (err) {
        setError({
          error: 'Network Error',
          message: 'Failed to fetch resource',
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
        setResource(null);
      } finally {
        setLoading(false);
      }
    }

    fetchResource();
  }, [session, status, resourceId, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading resource...</p>
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
              <Link href="/resources" className="text-gray-600 hover:text-gray-900 font-medium">
                ← Back to Documents
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

      <main className="max-w-5xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {error ? (
            // ============================================
            // ACCESS DENIED VIEW
            // ============================================
            <div className="space-y-6">
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-8 w-8 text-red-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <div className="ml-4 flex-1">
                    <h2 className="text-2xl font-bold text-red-900 mb-2">
                      🚫 Access Denied
                    </h2>
                    <p className="text-red-800 font-semibold mb-4">
                      {error.message}
                    </p>
                    {error.reason && (
                      <div className="bg-white border border-red-200 rounded p-4 mb-4">
                        <h3 className="text-sm font-semibold text-red-900 mb-2">Reason:</h3>
                        <p className="text-sm text-red-800">{error.reason}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {error.details && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Policy Evaluation Details
                  </h3>

                  {error.details.checks && (
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">
                        Authorization Checks:
                      </h4>
                      <dl className="grid grid-cols-2 gap-4">
                        {Object.entries(error.details.checks).map(([key, passed]) => (
                          <div
                            key={key}
                            className={`flex items-center justify-between p-3 rounded ${
                              passed
                                ? 'bg-green-50 border border-green-200'
                                : 'bg-red-50 border border-red-200'
                            }`}
                          >
                            <dt className="text-sm font-medium text-gray-700">
                              {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                            </dt>
                            <dd className="text-sm font-semibold">
                              {passed ? (
                                <span className="text-green-700">✓ PASS</span>
                              ) : (
                                <span className="text-red-700">✗ FAIL</span>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-6">
                    {error.details.subject && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Your Attributes:</h4>
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-gray-600">User ID:</dt>
                            <dd className="font-mono font-medium">
                              {error.details.subject.uniqueID || 'N/A'}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-gray-600">Clearance:</dt>
                            <dd className="font-mono font-medium">
                              {error.details.subject.clearance || 'N/A'}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-gray-600">Country:</dt>
                            <dd className="font-mono font-medium">
                              {error.details.subject.country || 'N/A'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    )}

                    {error.details.resource && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Resource Requirements:</h4>
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-gray-600">Resource ID:</dt>
                            <dd className="font-mono font-medium">
                              {error.details.resource.resourceId || 'N/A'}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-gray-600">Classification:</dt>
                            <dd className="font-mono font-medium">
                              {error.details.resource.classification || 'N/A'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="text-center">
                <Link
                  href="/resources"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Back to Document List
                </Link>
              </div>
            </div>
          ) : resource ? (
            // ============================================
            // ACCESS GRANTED VIEW
            // ============================================
            <div className="space-y-6">
              <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-8 w-8 text-green-600"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="ml-4 flex-1">
                    <h2 className="text-2xl font-bold text-green-900 mb-2">
                      ✅ Access Granted
                    </h2>
                    <p className="text-green-800">
                      You have successfully accessed this classified document.
                    </p>
                  </div>
                </div>
              </div>

              {/* ZTDF Summary Card */}
              {resource.ztdf && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-blue-900">Zero Trust Data Format (ZTDF)</h3>
                        <p className="text-sm text-blue-800">Data-centric security with embedded policy</p>
                      </div>
                    </div>
                    <Link
                      href={`/resources/${resourceId}/ztdf`}
                      className="inline-flex items-center px-4 py-2 border border-blue-300 shadow-sm text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      View ZTDF Details
                    </Link>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <dt className="text-xs font-medium text-gray-500 mb-1">ZTDF Version</dt>
                      <dd className="text-lg font-bold text-gray-900">{resource.ztdf.version}</dd>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <dt className="text-xs font-medium text-gray-500 mb-1">Encryption</dt>
                      <dd className="text-sm font-semibold text-gray-900">{resource.ztdf.encryptionAlgorithm}</dd>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <dt className="text-xs font-medium text-gray-500 mb-1">Key Access Objects</dt>
                      <dd className="text-lg font-bold text-gray-900">{resource.ztdf.kaoCount}</dd>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <dt className="text-xs font-medium text-gray-500 mb-1">Content Type</dt>
                      <dd className="text-sm font-semibold text-gray-900">{resource.ztdf.contentType}</dd>
                    </div>
                  </div>

                  <div className="mt-4 flex items-start space-x-2 text-xs text-blue-800">
                    <svg className="h-4 w-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <p>
                      This resource is protected using ZTDF (ACP-240 compliant). Security policy is embedded and travels 
                      with the data. Cryptographic integrity ensures tamper detection (STANAG 4778).
                    </p>
                  </div>
                </div>
              )}

              {/* Display Marking (STANAG 4774) */}
              {resource.displayMarking && (
                <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">STANAG 4774 Display Marking</p>
                      <p className="text-xl font-bold text-gray-900 font-mono">{resource.displayMarking}</p>
                    </div>
                    <div className="text-xs text-gray-600 text-right">
                      <p>Must appear on all</p>
                      <p>extractions & copies</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-gray-900">{resource.title}</h1>
                      <p className="text-sm text-gray-600 mt-1 font-mono">
                        {resource.resourceId}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-bold border-2 ${
                        classificationColors[resource.classification] || 'bg-gray-100 text-gray-800 border-gray-300'
                      }`}
                    >
                      {resource.classification}
                    </span>
                  </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <dl className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <dt className="font-medium text-gray-500 mb-1">Releasable To</dt>
                      <dd className="font-mono text-gray-900">
                        {resource.releasabilityTo.join(', ')}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500 mb-1">Communities of Interest</dt>
                      <dd className="font-mono text-gray-900">
                        {resource.COI && resource.COI.length > 0 ? resource.COI.join(', ') : 'None'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500 mb-1">Encryption Status</dt>
                      <dd className="font-mono text-gray-900">
                        {resource.encrypted ? '🔐 Encrypted' : '📄 Plaintext'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="px-6 py-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Content</h3>
                  {resource.content ? (
                    <div className="prose prose-sm max-w-none">
                      <p className="whitespace-pre-wrap text-gray-700">{resource.content}</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No content available</p>
                  )}
                </div>

                {resource.metadata && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                      Metadata
                    </h4>
                    <dl className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                      {resource.metadata.createdAt && (
                        <div>
                          <dt className="font-medium">Created</dt>
                          <dd className="font-mono">
                            {new Date(resource.metadata.createdAt).toLocaleString()}
                          </dd>
                        </div>
                      )}
                      {resource.metadata.updatedAt && (
                        <div>
                          <dt className="font-medium">Updated</dt>
                          <dd className="font-mono">
                            {new Date(resource.metadata.updatedAt).toLocaleString()}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">Resource not found</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

