/**
 * OPA Policy Management Page
 * 
 * Real-time policy editing and rule toggling for demo purposes
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import PolicyComparisonView from '@/components/admin/policy-comparison-view';

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

interface IPolicyRule {
    name: string;
    description: string;
    enabled: boolean;
    lineNumber?: number;
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
    const [rules, setRules] = useState<IPolicyRule[]>([]);
    const [saving, setSaving] = useState(false);
    const [showComparison, setShowComparison] = useState(false);
    const [originalPolicy, setOriginalPolicy] = useState<string>('');

    // Extract toggleable rules from policy content
    const extractRules = (content: string): IPolicyRule[] => {
        const matches: IPolicyRule[] = [];
        const lines = content.split('\n');
        const seenRules = new Set<string>(); // prevent duplicate keys when rendering
        
        // Common rules to show
        const knownRules: Record<string, string> = {
            'is_not_authenticated': 'User authentication check',
            'is_missing_required_attributes': 'Required attributes validation',
            'is_insufficient_clearance': 'Clearance level check',
            'is_not_releasable_to_country': 'Country releasability check',
            'is_coi_violation': 'Community of Interest violation check',
            'is_under_embargo': 'Embargo date check',
            'is_ztdf_integrity_violation': 'ZTDF integrity validation',
            'is_upload_not_releasable_to_uploader': 'Upload releasability check',
            'is_authentication_strength_insufficient': 'Authentication strength check',
            'is_mfa_not_verified': 'MFA verification check',
            'is_industry_access_blocked': 'Industry user access restriction'
        };

        lines.forEach((line, index) => {
            const match = line.match(/not\s+(is_\w+)/);
            if (!match) return;

            const ruleName = match[1];
            if (seenRules.has(ruleName)) {
                return;
            }
            seenRules.add(ruleName);

            matches.push({
                name: ruleName,
                description: knownRules[ruleName] || 'Policy rule',
                enabled: true, // If it's in the allow rule, it's enabled
                lineNumber: index + 1
            });
        });

        return matches;
    };

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
                const extractedRules = extractRules(policyData.data.content);
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

                {/* Rule Toggles */}
                {rules.length > 0 && (
                    <div className="mb-6 bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Policy Rules</h2>
                        <p className="text-sm text-gray-600 mb-4">
                            Toggle rules on/off to see real-time policy changes. Hover over a rule to see impact preview.
                        </p>
                        <div className="space-y-3">
                            {rules.map((rule) => {
                                // Calculate demo impact (would use real audit logs in production)
                                const blockedCount = Math.floor(Math.random() * 50) + 10;
                                const wouldAllow = Math.floor(blockedCount * 0.3);
                                
                                return (
                                <div
                                    key={rule.name}
                                    className="group relative flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-3">
                                            <span className="font-mono text-sm text-gray-500">#{rule.lineNumber}</span>
                                            <div>
                                                <p className="font-semibold text-gray-900">{rule.name}</p>
                                                <p className="text-sm text-gray-600">{rule.description}</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Impact Preview Tooltip */}
                                    <div className="hidden group-hover:block absolute right-0 top-full mt-2 z-50 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-4">
                                        <div className="text-sm">
                                            <div className="font-bold text-gray-900 mb-2">📊 Impact Preview</div>
                                            {rule.enabled ? (
                                                <>
                                                    <div className="text-red-700 mb-1">
                                                        Currently blocks: <strong>{blockedCount} requests</strong>
                                                    </div>
                                                    <div className="text-gray-600 text-xs">
                                                        If disabled, ~{wouldAllow} additional requests would be allowed
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-green-700 mb-1">
                                                        Currently allows: <strong>All requests</strong>
                                                    </div>
                                                    <div className="text-gray-600 text-xs">
                                                        If enabled, ~{blockedCount} requests would be blocked
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={rule.enabled}
                                            onChange={() => toggleRule(rule.name, rule.enabled)}
                                            disabled={saving}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        <span className="ml-3 text-sm font-medium text-gray-700">
                                            {rule.enabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </label>
                                </div>
                            )})}
                        </div>
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
                            rules={rules}
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

