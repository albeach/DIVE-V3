/**
 * IdP List Page
 * 
 * Lists all configured Identity Providers with management actions
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navigation from '@/components/navigation';
import { IIdPListItem, IAdminAPIResponse } from '@/types/admin.types';

export default function IdPListPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session, status } = useSession();
    const [idps, setIdps] = useState<IIdPListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Check for success message from URL
    const successMessage = searchParams.get('success');

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
        <div className="min-h-screen bg-gray-50">
            <Navigation user={session?.user || {}} />
            
            <div className="py-8">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
                    <div className="mb-6 rounded-md bg-green-50 p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-green-800">
                                    Identity Provider submitted for approval successfully!
                                </p>
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
                                    <tr key={idp.alias}>
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
                                                onClick={() => handleTest(idp.alias)}
                                                className="text-blue-600 hover:text-blue-900"
                                            >
                                                Test
                                            </button>
                                            <button
                                                onClick={() => handleDelete(idp.alias)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                </div>
            </div>
        </div>
    );
}

