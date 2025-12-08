'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import PageLayout from '@/components/layout/page-layout';
import { PolicyRuleManager } from '@/components/admin/policy-rule-manager';

interface IPolicyContent {
    fileName: string;
    content: string;
    lastModified: string;
}

interface IOPAStatus {
    opaUrl: string;
    healthy: boolean;
    version: string;
    policyFiles: string[];
    policyDir: string;
}

export default function OPAPolicyPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [policyContent, setPolicyContent] = useState<IPolicyContent | null>(null);
    const [opaStatus, setOpaStatus] = useState<IOPAStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<string>('');
    const [policySearchQuery, setPolicySearchQuery] = useState<string>('');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Load OPA status and policy content
    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);

            const statusRes = await fetch('/api/admin/opa/status');
            const statusData = statusRes.ok ? await statusRes.json() : null;

            if (statusData?.success) {
                setOpaStatus(statusData.data);
                if (!selectedFile && statusData.data.policyFiles?.length > 0) {
                    setSelectedFile(statusData.data.policyFiles[0]);
                }
            } else {
                setError(statusData?.error || 'Failed to load OPA status');
            }

            // Load selected policy if one is selected
            if (selectedFile) {
                const policyRes = await fetch(`/api/admin/opa/policy?file=${encodeURIComponent(selectedFile)}`);
                if (policyRes.ok) {
                    const policyData = await policyRes.json();
                    if (policyData.success) {
                        setPolicyContent(policyData.data);
                    }
                }
            }
        } catch (err) {
            console.error('Error loading data:', err);
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (status !== 'loading' && status === 'unauthenticated') {
            router.push('/auth/signin');
        } else if (status === 'authenticated') {
            loadData();
        }
    }, [status, router]);

    useEffect(() => {
        if (selectedFile && opaStatus) {
            loadData();
        }
    }, [selectedFile]);

    // Filter and categorize policies
    const { filteredPolicies, categorizedPolicies } = useMemo(() => {
        if (!opaStatus?.policyFiles) return { filteredPolicies: [], categorizedPolicies: {} };
        
        const filtered = opaStatus.policyFiles.filter(file => 
            !policySearchQuery.trim() || 
            file.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
            file.split('/').pop()?.toLowerCase().includes(policySearchQuery.toLowerCase())
        );

        const categorized: Record<string, string[]> = {
            'Entrypoints': [],
            'Base Layer': [],
            'Organization': [],
            'Tenant': [],
            'Tests': [],
            'Other': []
        };

        filtered.forEach(file => {
            if (file.includes('entrypoints')) {
                categorized['Entrypoints'].push(file);
            } else if (file.includes('base/')) {
                categorized['Base Layer'].push(file);
            } else if (file.includes('org/')) {
                categorized['Organization'].push(file);
            } else if (file.includes('tenant/')) {
                categorized['Tenant'].push(file);
            } else if (file.includes('test') || file.includes('_test')) {
                categorized['Tests'].push(file);
            } else {
                categorized['Other'].push(file);
            }
        });

        return { filteredPolicies: filtered, categorizedPolicies: categorized };
    }, [opaStatus?.policyFiles, policySearchQuery]);

    const categoryColors: Record<string, string> = {
        'Entrypoints': 'from-blue-500 to-indigo-600',
        'Base Layer': 'from-purple-500 to-pink-600',
        'Tenant': 'from-green-500 to-teal-600',
        'Organization': 'from-orange-500 to-yellow-600',
        'Tests': 'from-pink-500 to-red-600',
        'Other': 'from-slate-500 to-gray-600'
    };

    const categoryIcons: Record<string, string> = {
        'Entrypoints': '🚪',
        'Base Layer': '🏗️',
        'Tenant': '🏢',
        'Organization': '🌐',
        'Tests': '🧪',
        'Other': '📄'
    };

    if (status === 'loading' || loading) {
        return (
            <PageLayout 
                user={session?.user || {}}
                breadcrumbs={[
                    { label: 'Admin', href: '/admin/dashboard' },
                    { label: 'OPA Policies', href: '/admin/opa-policy' }
                ]}
            >
                <div className="flex items-center justify-center min-h-[60vh]">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                    >
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            className="inline-block rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mb-4"
                        />
                        <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">Loading OPA Policy Management...</p>
                    </motion.div>
                </div>
            </PageLayout>
        );
    }

    if (status === 'unauthenticated') {
        return null;
    }

    return (
        <PageLayout 
            user={session?.user || {}}
            breadcrumbs={[
                { label: 'Admin', href: '/admin/dashboard' },
                { label: 'OPA Policies', href: '/admin/opa-policy' }
            ]}
        >
            <div className="min-h-[calc(100vh-12rem)] flex flex-col">
                {/* Top Bar - Sticky */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="sticky top-16 sm:top-20 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm"
                >
                    <div className="px-4 sm:px-6 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                    <span className="text-3xl">🔐</span>
                                    OPA Policy Management
                                </h1>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    {opaStatus?.policyFiles?.length || 0} policies • {opaStatus?.healthy ? '✓ Healthy' : '✗ Unhealthy'}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                {opaStatus && (
                                    <div className="flex items-center gap-4 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg w-full sm:w-auto">
                                        <div className="text-center">
                                            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                                {opaStatus.policyFiles?.length || 0}
                                            </div>
                                            <div className="text-xs text-gray-600 dark:text-gray-400">Files</div>
                                        </div>
                                        <div className="w-px h-8 bg-gray-300 dark:bg-gray-600" />
                                        <div className="text-center">
                                            <div className={`text-lg font-bold ${opaStatus.healthy ? 'text-green-600' : 'text-red-600'}`}>
                                                {opaStatus.version}
                                            </div>
                                            <div className="text-xs text-gray-600 dark:text-gray-400">Version</div>
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center gap-3">
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={loadData}
                                        disabled={loading}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Refresh
                                    </motion.button>
                                    {sidebarCollapsed && (
                                        <button
                                            onClick={() => setSidebarCollapsed(false)}
                                            className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg font-medium border border-gray-300 dark:border-gray-700 lg:hidden"
                                        >
                                            Show Policies
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Error Alert */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mx-6 mt-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-lg p-4"
                        >
                            <div className="flex items-center justify-between">
                                <p className="text-red-800 dark:text-red-200 font-medium">{error}</p>
                                <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Content - Split View */}
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                    {/* Left Sidebar - Policy List */}
                    <motion.div
                        initial={{ opacity: sidebarCollapsed ? 0 : 1 }}
                        animate={{ opacity: sidebarCollapsed ? 0 : 1 }}
                        className={`${
                            sidebarCollapsed ? 'hidden lg:flex' : 'flex'
                        } flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden flex-col transition-all w-full lg:w-[320px]`}
                    >
                        {/* Sidebar Header */}
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-bold text-gray-900 dark:text-gray-100">Policies</h2>
                                <button
                                    onClick={() => setSidebarCollapsed(true)}
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                    </svg>
                                </button>
                            </div>
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search policies..."
                                    value={policySearchQuery}
                                    onChange={(e) => setPolicySearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        {/* Policy List - Scrollable */}
                        <div className="flex-1 overflow-y-auto">
                            {Object.entries(categorizedPolicies).map(([category, files]) => {
                                if (files.length === 0) return null;
                                const colors = categoryColors[category] || categoryColors['Other'];
                                const icon = categoryIcons[category] || categoryIcons['Other'];
                                
                                return (
                                    <div key={category} className="mb-4">
                                        <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{icon}</span>
                                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                                                    {category} ({files.length})
                                                </span>
                                            </div>
                                        </div>
                                        <div className="space-y-1 p-2">
                                            {files.map((file) => {
                                                const isSelected = selectedFile === file;
                                                return (
                                                    <motion.button
                                                        key={file}
                                                        whileHover={{ x: 2 }}
                                                        whileTap={{ scale: 0.98 }}
                                                        onClick={() => setSelectedFile(file)}
                                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                                                            isSelected
                                                                ? `bg-gradient-to-r ${colors} text-white shadow-lg`
                                                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                        }`}
                                                    >
                                                        <div className="font-medium truncate">
                                                            {file.split('/').pop() || file}
                                                        </div>
                                                        {isSelected && (
                                                            <motion.div
                                                                initial={{ opacity: 0 }}
                                                                animate={{ opacity: 1 }}
                                                                className="text-xs opacity-90 mt-0.5 truncate"
                                                            >
                                                                {file}
                                                            </motion.div>
                                                        )}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>

                    {/* Collapse Button (when sidebar is hidden on desktop) */}
                    {sidebarCollapsed && (
                        <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            onClick={() => setSidebarCollapsed(false)}
                            className="hidden lg:flex absolute left-0 top-1/2 transform -translate-y-1/2 z-40 bg-blue-600 text-white p-2 rounded-r-lg shadow-lg hover:bg-blue-700 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            </svg>
                        </motion.button>
                    )}

                    {/* Right Main Area - Rule Manager */}
                    <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
                        {policyContent ? (
                            <div className="p-4 sm:p-6">
                                <PolicyRuleManager
                                    policyContent={policyContent.content}
                                    policyFileName={policyContent.fileName}
                                    onRuleToggle={async (ruleName: string, enabled: boolean) => {
                                        try {
                                            const response = await fetch('/api/admin/opa/policy/toggle-rule', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    ruleName,
                                                    enabled,
                                                    file: selectedFile
                                                })
                                            });
                                            
                                            if (!response.ok) {
                                                const error = await response.json();
                                                throw new Error(error.message || 'Failed to toggle rule');
                                            }
                                            
                                            await loadData();
                                        } catch (error) {
                                            console.error('Failed to toggle rule:', error);
                                            throw error;
                                        }
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <svg className="mx-auto h-24 w-24 text-gray-300 dark:text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                                        Select a Policy
                                    </h3>
                                    <p className="text-gray-500 dark:text-gray-500">
                                        Choose a policy file from the sidebar to view and manage its rules
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </PageLayout>
    );
}
