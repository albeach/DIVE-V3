/**
 * Security Compliance Dashboard
 *
 * Displays NIST SP 800-63-3 and NATO ACP-240 compliance reports
 * Phase 2: Complete Admin Page Implementation
 * Date: 2026-02-05
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLayout from '@/components/layout/page-layout';
import { Shield, FileText, Download, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';

// Types
interface IComplianceFinding {
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    description: string;
    evidence: string[];
    standard: string;
    requirement: string;
}

interface IComplianceReport {
    reportId: string;
    reportType: 'NIST' | 'NATO';
    period: {
        startDate: string;
        endDate: string;
    };
    summary: {
        totalEvents: number;
        accessGrants: number;
        accessDenials: number;
        mfaEnforcements: number;
        federationEvents: number;
        violations: number;
    };
    findings: IComplianceFinding[];
    recommendations: string[];
    generatedAt: string;
    generatedBy: string;
}

type ReportType = 'NIST' | 'NATO' | null;

export default function SecurityCompliancePage() {
    const router = useRouter();
    const { data: session, status } = useSession();

    const [selectedReport, setSelectedReport] = useState<ReportType>(null);
    const [nistReport, setNistReport] = useState<IComplianceReport | null>(null);
    const [natoReport, setNatoReport] = useState<IComplianceReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState({
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
        endDate: new Date().toISOString().split('T')[0] // today
    });

    // Fetch report
    const fetchReport = useCallback(async (reportType: 'NIST' | 'NATO') => {
        if (status !== 'authenticated') return;

        try {
            setLoading(true);
            setError(null);

            const startDate = new Date(dateRange.startDate).toISOString();
            const endDate = new Date(dateRange.endDate).toISOString();

            const endpoint = reportType === 'NIST' 
                ? `/api/admin/compliance/reports/nist?startDate=${startDate}&endDate=${endDate}`
                : `/api/admin/compliance/reports/nato?startDate=${startDate}&endDate=${endDate}`;

            const response = await fetch(endpoint, { cache: 'no-store' });

            if (!response.ok) {
                throw new Error(`Failed to fetch ${reportType} report: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (reportType === 'NIST') {
                setNistReport(data.report);
            } else {
                setNatoReport(data.report);
            }

            setSelectedReport(reportType);
        } catch (err) {
            console.error(`Error fetching ${reportType} report:`, err);
            setError(err instanceof Error ? err.message : `Failed to fetch ${reportType} report`);
        } finally {
            setLoading(false);
        }
    }, [status, dateRange]);

    // Export report
    const handleExport = async (format: 'json' | 'csv') => {
        if (!selectedReport) return;

        try {
            const startDate = new Date(dateRange.startDate).toISOString();
            const endDate = new Date(dateRange.endDate).toISOString();

            const response = await fetch(
                `/api/admin/compliance/reports/export?reportType=${selectedReport}&startDate=${startDate}&endDate=${endDate}&format=${format}`
            );

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `compliance-${selectedReport.toLowerCase()}-${Date.now()}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Export error:', err);
            alert('Failed to export report');
        }
    };

    // Get severity styling
    const getSeverityStyle = (severity: IComplianceFinding['severity']) => {
        switch (severity) {
            case 'critical':
                return { icon: AlertCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', border: 'border-red-200 dark:border-red-800' };
            case 'high':
                return { icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-800' };
            case 'medium':
                return { icon: AlertTriangle, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', border: 'border-yellow-200 dark:border-yellow-800' };
            case 'low':
                return { icon: Info, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-200 dark:border-blue-800' };
        }
    };

    // Get compliance score
    const getComplianceScore = (report: IComplianceReport) => {
        const criticalFindings = report.findings.filter(f => f.severity === 'critical').length;
        const highFindings = report.findings.filter(f => f.severity === 'high').length;
        const mediumFindings = report.findings.filter(f => f.severity === 'medium').length;

        // Calculate score (100 - weighted penalties)
        const score = Math.max(0, 100 - (criticalFindings * 20 + highFindings * 10 + mediumFindings * 5));
        return score;
    };

    // Get score color
    const getScoreColor = (score: number) => {
        if (score >= 90) return 'text-green-600 dark:text-green-400';
        if (score >= 70) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
    };

    // Redirect to login if not authenticated
    useEffect(() => {
        if (status !== 'loading' && status === 'unauthenticated') {
            router.push('/auth/signin');
        }
    }, [status, router]);

    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading...</p>
                </div>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return null;
    }

    const currentReport = selectedReport === 'NIST' ? nistReport : selectedReport === 'NATO' ? natoReport : null;

    return (
        <PageLayout user={session?.user || {}}>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/20 dark:to-indigo-900/20">
                {/* Header */}
                <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
                    <div className="max-w-[1800px] mx-auto px-8 py-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent flex items-center gap-3">
                                    <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                                    Security Compliance
                                </h1>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                    NIST SP 800-63-3 and NATO ACP-240 compliance reporting
                                </p>
                            </div>

                            <button
                                onClick={() => router.push('/admin/dashboard')}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                            >
                                ← Dashboard
                            </button>
                        </div>
                    </div>
                </div>

                <div className="max-w-[1800px] mx-auto px-8 py-8 space-y-6">
                    {/* Date Range Selector */}
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Report Period</h3>
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Start Date
                                </label>
                                <input
                                    type="date"
                                    value={dateRange.startDate}
                                    onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    End Date
                                </label>
                                <input
                                    type="date"
                                    value={dateRange.endDate}
                                    onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Report Type Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* NIST Card */}
                        <button
                            onClick={() => fetchReport('NIST')}
                            disabled={loading}
                            className="group relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 shadow-xl hover:shadow-2xl transition-all text-left disabled:opacity-50"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                                    🇺🇸
                                </div>
                                {nistReport && (
                                    <div className="text-right">
                                        <div className={`text-3xl font-bold ${getScoreColor(getComplianceScore(nistReport))}`}>
                                            {getComplianceScore(nistReport)}%
                                        </div>
                                        <div className="text-xs text-gray-500">Compliance Score</div>
                                    </div>
                                )}
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                NIST SP 800-63-3
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                                Digital Identity Guidelines - Authentication Assurance Levels
                            </p>
                            {nistReport && (
                                <div className="text-xs text-gray-500 dark:text-gray-500">
                                    Generated: {new Date(nistReport.generatedAt).toLocaleString()}
                                </div>
                            )}
                            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <FileText className="w-6 h-6 text-blue-500" />
                            </div>
                        </button>

                        {/* NATO Card */}
                        <button
                            onClick={() => fetchReport('NATO')}
                            disabled={loading}
                            className="group relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border-2 border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-400 shadow-xl hover:shadow-2xl transition-all text-left disabled:opacity-50"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
                                    🛡️
                                </div>
                                {natoReport && (
                                    <div className="text-right">
                                        <div className={`text-3xl font-bold ${getScoreColor(getComplianceScore(natoReport))}`}>
                                            {getComplianceScore(natoReport)}%
                                        </div>
                                        <div className="text-xs text-gray-500">Compliance Score</div>
                                    </div>
                                )}
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                NATO ACP-240
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                                Policy-Based Access Control for Coalition Environments
                            </p>
                            {natoReport && (
                                <div className="text-xs text-gray-500 dark:text-gray-500">
                                    Generated: {new Date(natoReport.generatedAt).toLocaleString()}
                                </div>
                            )}
                            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <FileText className="w-6 h-6 text-purple-500" />
                            </div>
                        </button>
                    </div>

                    {/* Loading State */}
                    {loading && (
                        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-12 border border-gray-200 dark:border-gray-700 shadow-xl">
                            <div className="text-center">
                                <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                                <p className="text-gray-600 dark:text-gray-400">Generating compliance report...</p>
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {error && !loading && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                <div>
                                    <h3 className="font-bold text-red-800 dark:text-red-200">Error</h3>
                                    <p className="text-red-700 dark:text-red-300">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Report Display */}
                    {currentReport && !loading && (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                <div className="bg-white/90 dark:bg-gray-800/90 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Events</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {currentReport.summary.totalEvents.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                                    <p className="text-xs text-green-700 dark:text-green-400 mb-1">Access Grants</p>
                                    <p className="text-2xl font-bold text-green-900 dark:text-green-300">
                                        {currentReport.summary.accessGrants.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                                    <p className="text-xs text-red-700 dark:text-red-400 mb-1">Access Denials</p>
                                    <p className="text-2xl font-bold text-red-900 dark:text-red-300">
                                        {currentReport.summary.accessDenials.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                                    <p className="text-xs text-blue-700 dark:text-blue-400 mb-1">MFA Enforced</p>
                                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-300">
                                        {currentReport.summary.mfaEnforcements.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                                    <p className="text-xs text-purple-700 dark:text-purple-400 mb-1">Federation</p>
                                    <p className="text-2xl font-bold text-purple-900 dark:text-purple-300">
                                        {currentReport.summary.federationEvents.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
                                    <p className="text-xs text-orange-700 dark:text-orange-400 mb-1">Violations</p>
                                    <p className="text-2xl font-bold text-orange-900 dark:text-orange-300">
                                        {currentReport.summary.violations.toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            {/* Findings */}
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                                        Compliance Findings
                                    </h3>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleExport('json')}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
                                        >
                                            <Download className="w-4 h-4" />
                                            JSON
                                        </button>
                                        <button
                                            onClick={() => handleExport('csv')}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
                                        >
                                            <Download className="w-4 h-4" />
                                            CSV
                                        </button>
                                    </div>
                                </div>

                                {currentReport.findings.length === 0 ? (
                                    <div className="text-center py-12">
                                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                                        <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                            No Compliance Issues Found
                                        </p>
                                        <p className="text-gray-600 dark:text-gray-400">
                                            All checks passed for the selected period
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {currentReport.findings.map((finding, index) => {
                                            const style = getSeverityStyle(finding.severity);
                                            const Icon = style.icon;

                                            return (
                                                <div
                                                    key={index}
                                                    className={`p-6 rounded-xl border ${style.border} ${style.bg}`}
                                                >
                                                    <div className="flex items-start gap-4">
                                                        <Icon className={`w-6 h-6 ${style.color} flex-shrink-0 mt-1`} />
                                                        <div className="flex-1">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                                                                    {finding.category}
                                                                </h4>
                                                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${style.color}`}>
                                                                    {finding.severity}
                                                                </span>
                                                            </div>
                                                            <p className="text-gray-800 dark:text-gray-200 mb-3">
                                                                {finding.description}
                                                            </p>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                                        Standard
                                                                    </p>
                                                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                                                        {finding.standard}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                                        Requirement
                                                                    </p>
                                                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                                                        {finding.requirement}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {finding.evidence.length > 0 && (
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                                        Evidence ({finding.evidence.length})
                                                                    </p>
                                                                    <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-3 max-h-32 overflow-y-auto">
                                                                        {finding.evidence.map((ev, evIndex) => (
                                                                            <p
                                                                                key={evIndex}
                                                                                className="text-xs font-mono text-gray-300 mb-1"
                                                                            >
                                                                                {ev}
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Recommendations */}
                            {currentReport.recommendations.length > 0 && (
                                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                        <CheckCircle className="w-6 h-6 text-blue-500" />
                                        Recommendations
                                    </h3>
                                    <ul className="space-y-2">
                                        {currentReport.recommendations.map((rec, index) => (
                                            <li key={index} className="flex items-start gap-3">
                                                <span className="text-blue-500 mt-1">•</span>
                                                <span className="text-gray-700 dark:text-gray-300">{rec}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Report Metadata */}
                            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <p className="text-gray-600 dark:text-gray-400 mb-1">Report ID</p>
                                        <p className="font-mono text-gray-900 dark:text-white">{currentReport.reportId}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600 dark:text-gray-400 mb-1">Generated By</p>
                                        <p className="text-gray-900 dark:text-white">{currentReport.generatedBy}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600 dark:text-gray-400 mb-1">Generated At</p>
                                        <p className="text-gray-900 dark:text-white">
                                            {new Date(currentReport.generatedAt).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </PageLayout>
    );
}
