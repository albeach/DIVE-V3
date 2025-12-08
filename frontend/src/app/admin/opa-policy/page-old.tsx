/**
 * OPA Policy Management Page - Redesigned 2025
 * 
 * Modern UI/UX with:
 * - Visual policy explorer with grid/list views
 * - Test coverage visualization
 * - Interactive rule toggling with animations
 * - Real-time policy comparison
 * - Advanced search and filtering
 * - Microinteractions and smooth animations
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import PageLayout from '@/components/layout/page-layout';
import PolicyComparisonView from '@/components/admin/policy-comparison-view';
import { PolicyExplorer } from '@/components/admin/policy-explorer';
import { EnhancedRuleToggle } from '@/components/admin/enhanced-rule-toggle';
import { 
    extractAllRules, 
    groupRulesByCategory, 
    filterRules,
    IExtractedRule,
    IRuleGroup 
} from '@/lib/rego-rule-extractor';

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
    // Default to modular entrypoint; will fallback to first available if missing
    const [selectedFile, setSelectedFile] = useState<string>('entrypoints/authz.rego');
    const [rules, setRules] = useState<IExtractedRule[]>([]);
    const [saving, setSaving] = useState(false);
    const [showComparison, setShowComparison] = useState(false);
    const [originalPolicy, setOriginalPolicy] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    // Load OPA status and policy content
    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);

            const [statusRes, policyRes] = await Promise.all([
                fetch('/api/admin/opa/status'),
                fetch(`/api/admin/opa/policy?file=${selectedFile}`)
            ]);

            const statusData = statusRes.ok ? await statusRes.json() : null;
            let policyData = policyRes.ok ? await policyRes.json() : null;

            // If selected file is missing (404), fall back to first available policy file
            if ((!policyRes.ok || !policyData?.success) && statusRes.ok && statusData?.success) {
                const fallbackFile = statusData.data?.policyFiles?.[0];
                if (fallbackFile) {
                    setSelectedFile(fallbackFile);
                    const fallbackRes = await fetch(`/api/admin/opa/policy?file=${fallbackFile}`);
                    if (fallbackRes.ok) {
                        policyData = await fallbackRes.json();
                    }
                }
            }

            if (!statusRes.ok || !policyData || !policyData.success) {
                throw new Error('Failed to load OPA data');
            }

            if (statusData.success) {
                setOpaStatus(statusData.data);
            }

            if (policyData?.success) {
                setPolicyContent(policyData.data);
                const extractedRules = extractAllRules(policyData.data.content);
                setRules(extractedRules);
                if (!originalPolicy) {
                    setOriginalPolicy(policyData.data.content);
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
        if (status === 'authenticated') {
            loadData();
        }
    }, [status, selectedFile]);

    // Toggle a rule
    const toggleRule = async (ruleName: string, enabled: boolean) => {
        try {
            setSaving(true);
            setError(null);

            const response = await fetch('/api/admin/opa/policy/toggle-rule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ruleName,
                    enabled: !enabled, // Toggle to opposite
                    file: selectedFile
                })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Failed to toggle rule');
            }

            // Reload policy content
            await loadData();
        } catch (err) {
            console.error('Error toggling rule:', err);
            setError(err instanceof Error ? err.message : 'Failed to toggle rule');
        } finally {
            setSaving(false);
        }
    };

    // Filter and group rules
    const filteredRules = useMemo(() => {
        let filtered = filterRules(rules, searchQuery);
        if (selectedCategory !== 'all') {
            filtered = filtered.filter(rule => rule.category === selectedCategory);
        }
        return filtered;
    }, [rules, searchQuery, selectedCategory]);

    const ruleGroups = useMemo(() => {
        return groupRulesByCategory(filteredRules);
    }, [filteredRules]);

    const categories = useMemo(() => {
        const cats = new Set(rules.map(r => r.category));
        return ['all', ...Array.from(cats)].sort();
    }, [rules]);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (status !== 'loading' && status === 'unauthenticated') {
            router.push('/auth/signin');
        }
    }, [status, router]);

    if (status === 'loading' || loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading OPA Policy Management...</p>
                </div>
            </div>
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
                { label: 'OPA Policy', href: null }
            ]}
        >
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
                {/* Header */}
                <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                🔐 OPA Policy Management
                            </h1>
                            <p className="mt-2 text-slate-600 text-lg">
                                Real-time policy editing and rule toggling for demo purposes
                            </p>
                        </div>

                        <div className="flex items-center space-x-4">
                            <button
                                onClick={() => router.push('/admin/dashboard')}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                            >
                                ← Dashboard
                            </button>
                            <button
                                onClick={loadData}
                                disabled={loading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                            >
                                🔄 Refresh
                            </button>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
                        <div className="flex items-center space-x-2">
                            <span className="text-red-600 text-xl">⚠️</span>
                            <p className="text-red-800 font-medium">{error}</p>
                        </div>
                    </div>
                )}

                {/* OPA Status */}
                {opaStatus && (
                    <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">OPA Server Status</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                                <p className="text-sm text-blue-700 mb-1">Status</p>
                                <p className={`text-2xl font-bold ${opaStatus.healthy ? 'text-green-600' : 'text-red-600'}`}>
                                    {opaStatus.healthy ? '✅ Healthy' : '❌ Unavailable'}
                                </p>
                            </div>
                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                                <p className="text-sm text-purple-700 mb-1">Version</p>
                                <p className="text-2xl font-bold text-purple-900">{opaStatus.version}</p>
                            </div>
                            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                                <p className="text-sm text-green-700 mb-1">Policy Files</p>
                                <p className="text-2xl font-bold text-green-900">{opaStatus.policyFiles.length}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Policy File Selector */}
                {opaStatus && opaStatus.policyFiles.length > 0 && (
                    <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Policy File
                        </label>
                        <select
                            value={selectedFile}
                            onChange={(e) => setSelectedFile(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-700 hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            {opaStatus.policyFiles.map((file) => (
                                <option key={file} value={file}>
                                    {file}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Rule Toggles - Modern UI */}
                {rules.length > 0 && (
                    <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                                    Policy Rules
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {filteredRules.length} of {rules.length} rules
                                    {searchQuery && ` matching "${searchQuery}"`}
                                </p>
                            </div>
                        </div>

                        {/* Search and Filter Bar */}
                        <div className="mb-6 flex flex-col sm:flex-row gap-4">
                            {/* Search Input */}
                            <div className="flex-1 relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search rules by name, description, or category..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                />
                            </div>

                            {/* Category Filter */}
                            <div className="sm:w-64">
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="block w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                >
                                    {categories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat === 'all' ? 'All Categories' : cat}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Rule Groups */}
                        {ruleGroups.length > 0 ? (
                            <div className="space-y-4">
                                {ruleGroups.map((group) => (
                                    <PolicyRuleGroup
                                        key={group.category}
                                        group={group}
                                        onToggle={toggleRule}
                                        saving={saving}
                                        defaultExpanded={true}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-gray-50 dark:bg-gray-900/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
                                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-gray-600 dark:text-gray-400 font-medium">
                                    No rules found
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                                    {searchQuery 
                                        ? `Try adjusting your search query or category filter`
                                        : `This policy file doesn't contain any toggleable rules`
                                    }
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Policy Comparison Toggle */}
                {policyContent && originalPolicy && (
                    <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-900">Policy Comparison Mode</h3>
                                <p className="text-sm text-gray-600">Compare current policy with modifications</p>
                            </div>
                            <button
                                onClick={() => setShowComparison(!showComparison)}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                    showComparison
                                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                            >
                                {showComparison ? 'Hide Comparison' : 'Show Comparison'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Policy Comparison View */}
                {showComparison && policyContent && originalPolicy && (
                    <div className="mb-6">
                        <PolicyComparisonView
                            currentPolicy={originalPolicy}
                            modifiedPolicy={policyContent.content}
                            rules={rules.map(r => ({
                                name: r.name,
                                description: r.description,
                                enabled: r.enabled,
                                lineNumber: r.lineNumber
                            }))}
                        />
                    </div>
                )}

                {/* Policy Content Viewer */}
                {policyContent && !showComparison && (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold text-gray-900">Policy Content</h2>
                            <p className="text-sm text-gray-500">
                                Last modified: {new Date(policyContent.lastModified).toLocaleString()}
                            </p>
                        </div>
                        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                            <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap">
                                {policyContent.content}
                            </pre>
                        </div>
                    </div>
                )}

                {/* Info Card */}
                <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
                    <div className="flex items-start space-x-4">
                        <div className="text-4xl">ℹ️</div>
                        <div>
                            <h4 className="font-bold text-blue-900 mb-2">
                                About Real-Time Policy Updates
                            </h4>
                            <p className="text-sm text-blue-800">
                                This page allows you to toggle OPA policy rules in real-time for demonstration purposes. 
                                When you toggle a rule, the policy file is updated and OPA will pick up the changes 
                                (may require bundle reload in production). Changes are backed up automatically.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </PageLayout>
    );
}

