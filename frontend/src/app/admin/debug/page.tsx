/**
 * Admin Debug Page
 * 
 * Shows session details and helps diagnose authentication issues
 */

'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/navigation';

export default function AdminDebugPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    if (status === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        router.push('/login');
        return null;
    }

    const testBackend = async () => {
        const token = (session as any)?.accessToken;
        
        console.log('=== TESTING BACKEND ===');
        console.log('Access Token:', token ? `${token.substring(0, 50)}...` : 'MISSING');
        
        if (!token) {
            alert('No access token available!');
            return;
        }

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/idps`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('Response Status:', response.status);
            console.log('Content-Type:', response.headers.get('content-type'));
            
            const text = await response.text();
            console.log('Response Body:', text);
            
            try {
                const json = JSON.parse(text);
                console.log('Parsed JSON:', json);
                alert(`Success! Response: ${JSON.stringify(json, null, 2)}`);
            } catch (e) {
                console.error('JSON Parse Error:', e);
                console.log('Raw text:', text);
                alert(`Backend returned: ${text.substring(0, 200)}`);
            }
        } catch (error) {
            console.error('Fetch error:', error);
            alert(`Error: ${error}`);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <Navigation user={session?.user || {}} />
            
            <div className="py-8">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-8">🔍 Admin Debug Console</h1>

                    {/* Session Info */}
                    <div className="bg-white shadow rounded-lg p-6 mb-6">
                        <h2 className="text-xl font-semibold mb-4">Session Information</h2>
                        
                        <div className="space-y-4">
                            <div>
                                <span className="font-medium">Status:</span>
                                <span className={`ml-2 px-2 py-1 rounded text-sm ${
                                    status === 'authenticated' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                    {status}
                                </span>
                            </div>

                            <div>
                                <span className="font-medium">User ID:</span>
                                <span className="ml-2">{session?.user?.uniqueID || 'Not set'}</span>
                            </div>

                            <div>
                                <span className="font-medium">Roles:</span>
                                <span className="ml-2">
                                    {session?.user?.roles?.join(', ') || 'None'}
                                </span>
                                {session?.user?.roles?.includes('super_admin') ? (
                                    <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm">
                                        ✅ Super Admin
                                    </span>
                                ) : (
                                    <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 rounded text-sm">
                                        ❌ Not Super Admin
                                    </span>
                                )}
                            </div>

                            <div>
                                <span className="font-medium">Access Token:</span>
                                <span className="ml-2">
                                    {(session as any)?.accessToken ? (
                                        <span className="text-green-600">
                                            ✅ Available ({((session as any).accessToken as string).length} chars)
                                        </span>
                                    ) : (
                                        <span className="text-red-600">❌ Missing</span>
                                    )}
                                </span>
                            </div>

                            <div>
                                <span className="font-medium">Clearance:</span>
                                <span className="ml-2">{session?.user?.clearance || 'Not set'}</span>
                            </div>

                            <div>
                                <span className="font-medium">Country:</span>
                                <span className="ml-2">{session?.user?.countryOfAffiliation || 'Not set'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Test Button */}
                    <div className="bg-white shadow rounded-lg p-6 mb-6">
                        <h2 className="text-xl font-semibold mb-4">Backend API Test</h2>
                        <button
                            onClick={testBackend}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            Test /api/admin/idps Endpoint
                        </button>
                        <p className="mt-2 text-sm text-gray-500">
                            Check browser console for detailed results
                        </p>
                    </div>

                    {/* Full Session JSON */}
                    <div className="bg-white shadow rounded-lg p-6">
                        <h2 className="text-xl font-semibold mb-4">Full Session Data</h2>
                        <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto max-h-96">
                            {JSON.stringify(session, null, 2)}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}

