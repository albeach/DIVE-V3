/**
 * IdP List Page
 * 
 * Lists all configured Identity Providers with management actions
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { IIdPListItem, IAdminAPIResponse } from '@/types/admin.types';

export default function IdPListPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session, status } = useSession();
    const [idps, setIdps] = useState<IIdPListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedIdP, setExpandedIdP] = useState<string | null>(null);
    const [idpDetails, setIdpDetails] = useState<Record<string, any>>({});

    // Check for success message from URL
    const successMessage = searchParams.get('success');
    const auth0Enabled = searchParams.get('auth0') === 'true';
    const auth0ClientId = searchParams.get('clientId');

    useEffect(() => {
        if (status === 'authenticated' && session?.accessToken) {
            fetchIdPs();
        }
    }, [status, session?.accessToken]);

    const fetchIdPs = async () => {
        setLoading(true);
        setError(null);

        try {
            const token = (session as any)?.accessToken;
            
            console.log('🔍 fetchIdPs Debug:', {
                hasSession: !!session,
                hasToken: !!token,
                tokenLength: token?.length || 0,
                tokenPreview: token ? token.substring(0, 50) + '...' : 'MISSING',
                backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL
            });

            if (!token) {
                setError('No access token available. Please refresh the page.');
                console.error('❌ No access token - session:', session);
                setLoading(false);
                return;
            }

            const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps`;
            console.log('📡 Calling:', url);

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error(`Expected JSON but got ${contentType}. Backend may be down or returning HTML error.`);
            }

            const result: IAdminAPIResponse<{ idps: IIdPListItem[]; total: number }> = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `API error: ${response.status} ${response.statusText}`);
            }

            setIdps(result.data?.idps || []);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to load IdPs';
            setError(errorMsg);
            console.error('fetchIdPs error:', errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (alias: string) => {
        if (!confirm(`Are you sure you want to delete the IdP "${alias}"?`)) {
            return;
        }

        try {
            const token = (session as any)?.accessToken;
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps/${alias}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error('Failed to delete IdP');
            }

            // Refresh list
            fetchIdPs();
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete IdP');
        }
    };

    const handleViewDetails = async (alias: string) => {
        if (expandedIdP === alias) {
            // Collapse if already expanded
            setExpandedIdP(null);
            return;
        }

        try {
            const token = (session as any)?.accessToken;
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps/${alias}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            const result: IAdminAPIResponse = await response.json();
            
            if (result.success && result.data) {
                setIdpDetails(prev => ({ ...prev, [alias]: result.data }));
                setExpandedIdP(alias);
            } else {
                alert(`Failed to load details: ${result.message || 'Unknown error'}`);
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to load IdP details');
        }
    };

    const handleTest = async (alias: string) => {
        try {
            const token = (session as any)?.accessToken;
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps/${alias}/test`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            const result: IAdminAPIResponse = await response.json();
            
            if (result.success) {
                alert(`✅ Test successful: ${result.message}`);
            } else {
                alert(`❌ Test failed: ${result.message}`);
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Test failed');
        }
    };

    if (status === 'loading' || loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading IdPs...</p>
                </div>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        router.push('/login');
        return null;
    }

    const filteredIdps = idps.filter(
        (idp) =>
            idp.alias.toLowerCase().includes(searchQuery.toLowerCase()) ||
            idp.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <PageLayout 
            user={session?.user || {}}
            breadcrumbs={[
                { label: 'Admin', href: '/admin/dashboard' },
                { label: 'IdP Management', href: null }
            ]}
        >
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Identity Providers</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        Manage OIDC and SAML identity providers for coalition authentication.
                    </p>
                </div>
                    <button
                        onClick={() => router.push('/admin/idp/new')}
                        className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add IdP
                    </button>
                </div>

                {/* Success Message */}
                {successMessage === 'created' && (
                    <div className="mb-6 rounded-md bg-green-50 border border-green-200 p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3 flex-1">
                                <h3 className="text-sm font-bold text-green-800 mb-1">
                                    Identity Provider Created Successfully!
                                </h3>
                                <p className="text-sm text-green-700 mb-2">
                                    {auth0Enabled 
                                        ? 'Your IdP has been created with Auth0 integration and submitted for approval.'
                                        : 'Your IdP has been submitted for approval.'
                                    }
                                </p>

                                {auth0Enabled && auth0ClientId && (
                                    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                                        <div className="flex items-start mb-2">
                                            <svg className="h-5 w-5 text-blue-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                            <div className="flex-1">
                                                <h4 className="text-sm font-semibold text-blue-900 mb-1">
                                                    🔵 Auth0 Application Created
                                                </h4>
                                                <p className="text-xs text-blue-800 mb-2">
                                                    Your Auth0 application was created automatically. Use these credentials in your IdP configuration:
                                                </p>
                                                <div className="bg-white rounded border border-blue-300 p-2 space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-medium text-blue-700">Client ID:</span>
                                                        <div className="flex items-center">
                                                            <code className="text-xs font-mono text-blue-900 bg-blue-100 px-2 py-1 rounded">
                                                                {auth0ClientId}
                                                            </code>
                                                            <button
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(auth0ClientId);
                                                                    alert('Client ID copied to clipboard!');
                                                                }}
                                                                className="ml-2 text-blue-600 hover:text-blue-800"
                                                                title="Copy Client ID"
                                                            >
                                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-blue-700 mt-2">
                                                        <strong>Note:</strong> Client secret was provided during creation. Check your email or Auth0 dashboard for the secret.
                                                    </div>
                                                </div>
                                                <div className="mt-2 text-xs text-blue-700">
                                                    <strong>Next steps:</strong>
                                                    <ol className="list-decimal list-inside mt-1 space-y-1">
                                                        <li>Configure your actual IdP to use these Auth0 credentials</li>
                                                        <li>Wait for super admin approval in Keycloak</li>
                                                        <li>Test the authentication flow</li>
                                                    </ol>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="mt-3 flex items-center space-x-3">
                                    <button
                                        onClick={() => router.push('/admin/idp/new')}
                                        className="text-sm font-medium text-green-700 hover:text-green-800 underline"
                                    >
                                        Create Another IdP
                                    </button>
                                    <span className="text-green-600">•</span>
                                    <button
                                        onClick={() => router.push('/admin/approvals')}
                                        className="text-sm font-medium text-green-700 hover:text-green-800 underline"
                                    >
                                        View Pending Approvals
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="mb-6 rounded-md bg-red-50 p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-red-800">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Search Bar */}
                <div className="mb-6">
                    <input
                        type="text"
                        placeholder="Search IdPs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                </div>

                {/* IdP Table */}
                {filteredIdps.length === 0 ? (
                    <div className="bg-white shadow sm:rounded-lg">
                        <div className="px-4 py-12 text-center sm:px-6">
                            <svg
                                className="mx-auto h-12 w-12 text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                />
                            </svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No Identity Providers</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Get started by creating a new IdP.
                            </p>
                            <div className="mt-6">
                                <button
                                    type="button"
                                    onClick={() => router.push('/admin/idp/new')}
                                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                                >
                                    <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add New IdP
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Alias
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Display Name
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Protocol
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredIdps.map((idp) => (
                                    <React.Fragment key={idp.alias}>
                                        <tr className={expandedIdP === idp.alias ? 'bg-blue-50' : ''}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {idp.alias}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {idp.displayName}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {idp.protocol.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <span
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                        idp.enabled
                                                            ? 'bg-green-100 text-green-800'
                                                            : 'bg-gray-100 text-gray-800'
                                                    }`}
                                                >
                                                    {idp.enabled ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                                <button
                                                    onClick={() => handleViewDetails(idp.alias)}
                                                    className="text-blue-600 hover:text-blue-900"
                                                >
                                                    {expandedIdP === idp.alias ? 'Hide' : 'View'} Details
                                                </button>
                                                <button
                                                    onClick={() => handleTest(idp.alias)}
                                                    className="text-green-600 hover:text-green-900"
                                                >
                                                    Test
                                                </button>
                                                <button
                                                    onClick={() => router.push(`/admin/idp/${idp.alias}/edit`)}
                                                    className="text-indigo-600 hover:text-indigo-900"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(idp.alias)}
                                                    className="text-red-600 hover:text-red-900"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                        {/* Expandable Details Row */}
                                        {expandedIdP === idp.alias && idpDetails[idp.alias] && (
                                            <tr className="bg-gray-50">
                                                <td colSpan={5} className="px-6 py-4">
                                                    <div className="space-y-4">
                                                        <h4 className="text-sm font-semibold text-gray-900">Configuration Details</h4>
                                                        
                                                        {/* Auth0 Integration Info */}
                                                        {idpDetails[idp.alias].useAuth0 && (
                                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                                <div className="flex items-start">
                                                                    <svg className="h-5 w-5 text-blue-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                                    </svg>
                                                                    <div className="flex-1">
                                                                        <h5 className="text-sm font-semibold text-blue-900 mb-1">
                                                                            🔵 Auth0 Integration Active
                                                                        </h5>
                                                                        <p className="text-xs text-blue-800 mb-2">
                                                                            This IdP was created with Auth0 integration
                                                                        </p>
                                                                        {idpDetails[idp.alias].auth0ClientId && (
                                                                            <div className="bg-white rounded border border-blue-300 p-2 space-y-1">
                                                                                <div className="text-xs text-blue-700">
                                                                                    <strong>Client ID:</strong>
                                                                                    <code className="ml-1 bg-blue-100 px-1 py-0.5 rounded">
                                                                                        {idpDetails[idp.alias].auth0ClientId}
                                                                                    </code>
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            navigator.clipboard.writeText(idpDetails[idp.alias].auth0ClientId);
                                                                                            alert('Client ID copied!');
                                                                                        }}
                                                                                        className="ml-2 text-blue-600 hover:text-blue-800 text-xs underline"
                                                                                    >
                                                                                        Copy
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Protocol Config */}
                                                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                                                            <h5 className="text-sm font-semibold text-gray-900 mb-2">
                                                                {idp.protocol.toUpperCase()} Configuration
                                                            </h5>
                                                            <pre className="text-xs text-gray-700 overflow-x-auto bg-gray-50 p-3 rounded">
                                                                {JSON.stringify(idpDetails[idp.alias].config || {}, null, 2)}
                                                            </pre>
                                                        </div>

                                                        {/* Attribute Mappings */}
                                                        {idpDetails[idp.alias].attributeMappings && (
                                                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                                                                <h5 className="text-sm font-semibold text-gray-900 mb-2">
                                                                    Attribute Mappings
                                                                </h5>
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    {Object.entries(idpDetails[idp.alias].attributeMappings).map(([attr, mapping]: [string, any]) => (
                                                                        <div key={attr} className="text-xs">
                                                                            <span className="font-medium text-gray-700">{attr}:</span>
                                                                            <code className="ml-1 bg-gray-100 px-1 py-0.5 rounded">{mapping.claim || mapping}</code>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Metadata */}
                                                        <div className="text-xs text-gray-600 space-y-1">
                                                            {idpDetails[idp.alias].submittedBy && (
                                                                <div><strong>Created by:</strong> {idpDetails[idp.alias].submittedBy}</div>
                                                            )}
                                                            {idpDetails[idp.alias].createdAt && (
                                                                <div><strong>Created:</strong> {new Date(idpDetails[idp.alias].createdAt).toLocaleString()}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
        </PageLayout>
    );
}

