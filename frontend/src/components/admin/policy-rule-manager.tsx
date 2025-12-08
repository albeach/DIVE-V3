/**
 * Policy Rule Manager Component
 * Modern 2025 UI for managing and toggling OPA policy rules
 */

'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { extractRules, groupRulesByCategory, IPolicyRule, IRuleCategory } from '@/lib/rego-rule-parser';

interface IPolicyRuleManagerProps {
    policyContent: string;
    policyFileName: string;
    onRuleToggle?: (ruleName: string, enabled: boolean) => Promise<void>;
}

export function PolicyRuleManager({
    policyContent,
    policyFileName,
    onRuleToggle
}: IPolicyRuleManagerProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [togglingRules, setTogglingRules] = useState<Set<string>>(new Set());
    const [enabledRules, setEnabledRules] = useState<Set<string>>(new Set());
    const [pendingToggle, setPendingToggle] = useState<{
        rule: IPolicyRule;
        nextEnabled: boolean;
        previewBefore: string;
        previewAfter: string;
    } | null>(null);
    const [activeView, setActiveView] = useState<'safeguards' | 'exceptions' | 'simulate'>('safeguards');
    const [rationale, setRationale] = useState('');
    const [rationaleError, setRationaleError] = useState<string | null>(null);
    const [simulateInput, setSimulateInput] = useState({
        persona: 'US SECRET user',
        resource: 'SECRET doc releasable to USA, GBR',
        context: 'Standard desktop session'
    });
    const [simulateResult, setSimulateResult] = useState<{ decision: 'ALLOW' | 'DENY'; reason: string }>({
        decision: 'DENY',
        reason: 'Simulation not run yet'
    });

    // Extract and group rules
    const rules = useMemo(() => extractRules(policyContent), [policyContent]);
    const categories = useMemo(() => groupRulesByCategory(rules), [rules]);
    const disabledRules = useMemo(
        () => rules.filter(r => !r.enabled && r.type !== 'decision' && r.type !== 'default'),
        [rules]
    );

    // Initialize enabled rules from extracted rules
    React.useEffect(() => {
        const enabled = new Set(rules.filter(r => r.enabled).map(r => r.name));
        setEnabledRules(enabled);
    }, [rules]);

    // Expand all categories by default
    React.useEffect(() => {
        setExpandedCategories(new Set(categories.map(c => c.name)));
    }, [categories]);

    // Filter rules based on search
    const filteredCategories = useMemo(() => {
        if (!searchQuery.trim()) return categories;
        
        const query = searchQuery.toLowerCase();
        return categories.map(category => ({
            ...category,
            rules: category.rules.filter(rule =>
                rule.name.toLowerCase().includes(query) ||
                rule.description.toLowerCase().includes(query) ||
                rule.category.toLowerCase().includes(query)
            )
        })).filter(category => category.rules.length > 0);
    }, [categories, searchQuery]);

    const toggleCategory = (categoryName: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryName)) {
            newExpanded.delete(categoryName);
        } else {
            newExpanded.add(categoryName);
        }
        setExpandedCategories(newExpanded);
    };

    const expandAll = () => {
        setExpandedCategories(new Set(categories.map(c => c.name)));
    };

    const collapseAll = () => {
        setExpandedCategories(new Set());
    };

    const handleRuleToggle = (rule: IPolicyRule) => {
        const nextEnabled = !enabledRules.has(rule.name);
        const previewAfter = applyToggleToContent(policyContent, rule.name, nextEnabled);
        setPendingToggle({
            rule,
            nextEnabled,
            previewBefore: policyContent,
            previewAfter
        });
    };

    const confirmToggle = async () => {
        if (!pendingToggle) return;
        if (!rationale.trim()) {
            setRationaleError('Please provide the business rationale for this change.');
            return;
        }
        const { rule, nextEnabled } = pendingToggle;

        setTogglingRules(prev => new Set(prev).add(rule.name));
        try {
            if (onRuleToggle) {
                await onRuleToggle(rule.name, nextEnabled);
            }

            const newEnabledRules = new Set(enabledRules);
            if (nextEnabled) {
                newEnabledRules.add(rule.name);
            } else {
                newEnabledRules.delete(rule.name);
            }
            setEnabledRules(newEnabledRules);
            setPendingToggle(null);
            setRationale('');
            setRationaleError(null);
        } catch (error) {
            console.error('Failed to toggle rule:', error);
        } finally {
            setTogglingRules(prev => {
                const next = new Set(prev);
                next.delete(rule.name);
                return next;
            });
        }
    };

    const runSimulation = () => {
        const decision = disabledCount > 0 ? 'DENY' : 'ALLOW';
        const reason =
            disabledCount > 0
                ? `DENY: ${disabledCount} safeguard(s) disabled; re-enable to restore coverage.`
                : 'ALLOW: all configured safeguards are active; wire PDP for live decision.';
        setSimulateResult({ decision, reason });
    };

    const enabledCount = enabledRules.size;
    const totalCount = rules.length;
    const disabledCount = totalCount - enabledCount;
    const disabledPercent = totalCount === 0 ? 0 : Math.round((disabledCount / totalCount) * 100);

    return (
        <>
        <div className="space-y-4 h-full flex flex-col">
            {/* Sticky Header */}
            <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 pb-4 border-b border-gray-200 dark:border-gray-700">
                {/* Manager Summary Tiles */}
                <div className="grid md:grid-cols-4 gap-3 mb-4">
                    <SummaryTile title="Policy" value={policyFileName} subtitle="Entrypoint / file" />
                    <SummaryTile title="Active safeguards" value={`${enabledCount}/${totalCount}`} subtitle={`${totalCount === 0 ? 0 : Math.round((enabledCount / totalCount) * 100)}% active`} accent="green" />
                    <SummaryTile title="Disabled safeguards" value={disabledCount.toString()} subtitle={`${disabledPercent}% require review`} accent="amber" />
                    <SummaryTile title="Decision wiring" value="allow" subtitle="Shows checks used in allow" accent="blue" />
                </div>

                {/* Tabs */}
                <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                        {(['safeguards', 'exceptions', 'simulate'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveView(tab)}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                                    activeView === tab
                                        ? 'bg-blue-600 text-white shadow'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                            >
                                {tab === 'safeguards' && 'Safeguards'}
                                {tab === 'exceptions' && `Exceptions (${disabledCount})`}
                                {tab === 'simulate' && 'Simulate access'}
                            </button>
                        ))}
                    </div>
                    {activeView === 'safeguards' && (
                        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
                                <span className="w-2 h-2 rounded-full bg-blue-500" /> in allow
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
                                <span className="w-2 h-2 rounded-full bg-amber-500" /> needs rationale
                            </span>
                        </div>
                    )}
                </div>

                {/* Search and Controls - Sticky */}
                {activeView === 'safeguards' && (
                <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search rules..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                        />
                    </div>
                    <button
                        onClick={expandAll}
                        className="px-3 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                    >
                        Expand All
                    </button>
                    <button
                        onClick={collapseAll}
                        className="px-3 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                    >
                        Collapse All
                    </button>
                </div>
                )}
            </div>

            {/* Main Views */}
            {activeView === 'safeguards' && (
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {filteredCategories.map((category, categoryIndex) => {
                        const isExpanded = expandedCategories.has(category.name);
                        const enabledInCategory = category.rules.filter(r => enabledRules.has(r.name)).length;
                        
                        return (
                            <motion.div
                                key={category.name}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: categoryIndex * 0.03 }}
                                className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                            >
                                {/* Category Header */}
                                <button
                                    onClick={() => toggleCategory(category.name)}
                                    className="w-full p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 hover:from-gray-100 hover:to-gray-200 dark:hover:from-gray-700 dark:hover:to-gray-800 transition-all"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${category.color} flex items-center justify-center text-xl shadow-md`}>
                                                {category.icon}
                                            </div>
                                            <div className="text-left">
                                                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                                    {category.name}
                                                </h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                                    {enabledInCategory}/{category.rules.length} enabled
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(enabledInCategory / category.rules.length) * 100}%` }}
                                                    className={`h-full bg-gradient-to-r ${category.color} rounded-full`}
                                                />
                                            </div>
                                            <motion.svg
                                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                                className="w-5 h-5 text-gray-600 dark:text-gray-400"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </motion.svg>
                                        </div>
                                    </div>
                                </button>

                                {/* Category Rules */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="border-t border-gray-200 dark:border-gray-700"
                                        >
                                            <div className="p-4 space-y-2">
                                                {category.rules.map((rule, ruleIndex) => {
                                                    const isEnabled = enabledRules.has(rule.name);
                                                    const isToggling = togglingRules.has(rule.name);
                                                    
                                                    return (
                                                        <RuleCard
                                                            key={rule.name}
                                                            rule={rule}
                                                            enabled={isEnabled}
                                                            toggling={isToggling}
                                                            onToggle={() => handleRuleToggle(rule)}
                                                            categoryColor={category.color}
                                                            index={ruleIndex}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}

                    {filteredCategories.length === 0 && (
                        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
                            <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-gray-600 dark:text-gray-400 font-medium">No rules found</p>
                            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                                Try adjusting your search criteria
                            </p>
                        </div>
                    )}
                </div>
            )}

            {activeView === 'exceptions' && (
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {disabledRules.length === 0 && (
                        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
                            <p className="text-gray-700 dark:text-gray-200 font-semibold">No disabled safeguards</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">All checks are active in allow.</p>
                        </div>
                    )}
                    {disabledRules.map((rule, idx) => (
                        <RuleCard
                            key={rule.name}
                            rule={rule}
                            enabled={false}
                            toggling={togglingRules.has(rule.name)}
                            onToggle={() => handleRuleToggle(rule)}
                            categoryColor="from-amber-500 to-orange-500"
                            index={idx}
                        />
                    ))}
                </div>
            )}

            {activeView === 'simulate' && (
                <div className="flex-1 overflow-y-auto pr-2">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow p-6 space-y-4">
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field
                                label="Persona"
                                value={simulateInput.persona}
                                onChange={(value) => setSimulateInput(prev => ({ ...prev, persona: value }))}
                                options={[
                                    'US SECRET user',
                                    'FRA SECRET user',
                                    'Contractor FVEY',
                                    'US TOP_SECRET with COI=FVEY'
                                ]}
                            />
                            <Field
                                label="Resource"
                                value={simulateInput.resource}
                                onChange={(value) => setSimulateInput(prev => ({ ...prev, resource: value }))}
                                options={[
                                    'SECRET doc releasable to USA, GBR',
                                    'TOP_SECRET doc releasable to FVEY',
                                    'CONFIDENTIAL doc releasable to FRA, CAN',
                                    'UNCLASS doc open'
                                ]}
                            />
                            <Field
                                label="Context"
                                value={simulateInput.context}
                                onChange={(value) => setSimulateInput(prev => ({ ...prev, context: value }))}
                                options={[
                                    'Standard desktop session',
                                    'Remote VPN, MFA',
                                    'Unknown device, low assurance'
                                ]}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={runSimulation}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition-colors"
                            >
                                Simulate decision
                            </button>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Simulation uses rule state only. Wire to /api/admin/opa/eval for live PDP.
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Result</p>
                            <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${simulateResult.decision === 'ALLOW' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                    {simulateResult.decision}
                                </span>
                                <span className="text-gray-700 dark:text-gray-200">{simulateResult.reason}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
        <AnimatePresence>
            {pendingToggle && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Toggle preview</p>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                    {pendingToggle.rule.name} → {pendingToggle.nextEnabled ? 'Enable' : 'Disable'}
                                </h3>
                            </div>
                            <button
                                onClick={() => setPendingToggle(null)}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4 px-6 py-4">
                            <PreviewBlock title="Current" content={pendingToggle.previewBefore} />
                            <PreviewBlock title="After change" content={pendingToggle.previewAfter} />
                        </div>

                        <div className="px-6 pb-6">
                            <div className="mb-4">
                                <label className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                    Business rationale (required)
                                    <span className="text-amber-500 text-xs">Manager approval</span>
                                </label>
                                <textarea
                                    value={rationale}
                                    onChange={(e) => {
                                        setRationale(e.target.value);
                                        if (rationaleError) setRationaleError(null);
                                    }}
                                    rows={3}
                                    className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Explain why this safeguard should be enabled/disabled, and for whom."
                                />
                                {rationaleError && (
                                    <p className="text-sm text-red-500 mt-1">{rationaleError}</p>
                                )}
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                    Change will comment/uncomment the check inside the allow block. A backup file is created server-side before apply.
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setPendingToggle(null)}
                                        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmToggle}
                                        className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition-colors disabled:opacity-60"
                                        disabled={togglingRules.has(pendingToggle.rule.name)}
                                    >
                                        Apply change
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
        </>
    );
}

interface IRuleCardProps {
    rule: IPolicyRule;
    enabled: boolean;
    toggling: boolean;
    onToggle: () => void;
    categoryColor: string;
    index: number;
}

function RuleCard({ rule, enabled, toggling, onToggle, categoryColor, index }: IRuleCardProps) {
    const severityColors: Record<NonNullable<IPolicyRule['severity']>, string> = {
        low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
        medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
        critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.02 }}
            className={`relative overflow-hidden rounded-lg border transition-all ${
                enabled
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 shadow-md'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
        >
            {/* Gradient accent */}
            {enabled && (
                <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${categoryColor}`} />
            )}
            
            <div className="p-4">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                {rule.name}
                            </h4>
                            {rule.referencedInAllow && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                    in allow
                                </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                rule.type === 'violation' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                rule.type === 'check' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                rule.type === 'decision' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                                'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                                {rule.type}
                            </span>
                            {rule.severity && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${severityColors[rule.severity]}`}>
                                    {rule.severity}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                            {rule.summary || rule.description}
                        </p>
                        {rule.scenarios && rule.scenarios.length > 0 && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-500 mb-1">Scenario: {rule.scenarios.join('; ')}</p>
                        )}
                        {rule.dependsOn && rule.dependsOn.length > 0 && (
                            <div className="flex flex-wrap gap-1 text-[11px] text-gray-600 dark:text-gray-400">
                                <span className="font-semibold text-gray-700 dark:text-gray-200">Depends:</span>
                                {rule.dependsOn.map((dep) => (
                                    <span key={dep} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                                        {dep}
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Line {rule.lineNumber}
                        </div>
                    </div>
                    
                    {/* Toggle Switch */}
                    <div className="flex-shrink-0">
                        <button
                            onClick={onToggle}
                            disabled={toggling || rule.type === 'decision' || rule.type === 'default'}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                                enabled
                                    ? `bg-gradient-to-r ${categoryColor}`
                                    : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                        >
                            <motion.span
                                layout
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ${
                                    enabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                            {toggling && (
                                <motion.div
                                    className="absolute inset-0 flex items-center justify-center"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                        className="w-3 h-3 border-2 border-white border-t-transparent rounded-full"
                                    />
                                </motion.div>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

interface ISummaryTileProps {
    title: string;
    value: string;
    subtitle?: string;
    accent?: 'green' | 'amber' | 'blue';
}

function SummaryTile({ title, value, subtitle, accent = 'blue' }: ISummaryTileProps) {
    const accents: Record<NonNullable<ISummaryTileProps['accent']>, string> = {
        blue: 'from-blue-500 to-indigo-600',
        green: 'from-emerald-500 to-teal-500',
        amber: 'from-amber-500 to-orange-500'
    };
    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">{title}</p>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                    {subtitle && <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>}
                </div>
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${accents[accent]} text-white flex items-center justify-center font-semibold`}>
                    ⚖️
                </div>
            </div>
        </div>
    );
}

interface IFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: string[];
}

function Field({ label, value, onChange, options }: IFieldProps) {
    return (
        <label className="block">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
                {options.map(option => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        </label>
    );
}

function applyToggleToContent(content: string, ruleName: string, enable: boolean): string {
    let updated = content;
    const escapedRuleName = ruleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (enable) {
        updated = updated.replace(
            new RegExp(`#\\s*not\\s+${escapedRuleName}\\s*#\\s*DISABLED`, 'g'),
            `\tnot ${ruleName}`
        );
        updated = updated.replace(
            new RegExp(`#\\s*not\\s+${escapedRuleName}`, 'g'),
            `\tnot ${ruleName}`
        );

        const allowBlockMatch =
            updated.match(/allow\s+if\s*\{([\s\S]*?)\}/) ||
            updated.match(/allow\s*:=\s*true\s+if\s*\{([\s\S]*?)\}/);
        if (allowBlockMatch) {
            const allowBlock = allowBlockMatch[1];
            if (!allowBlock.includes(ruleName)) {
                const allowPattern = new RegExp('(allow\\s+if\\s*\\{[\\s\\S]*?)(\\s*\\})');
                updated = updated.replace(allowPattern, `$1\n\tnot ${ruleName}$2`);
            }
        }
    } else {
        updated = updated.replace(
            new RegExp(`(\\t)(not\\s+${escapedRuleName})`, 'g'),
            `$1# $2 # DISABLED`
        );
    }

    return updated;
}

interface IPreviewBlockProps {
    title: string;
    content: string;
}

function PreviewBlock({ title, content }: IPreviewBlockProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</p>
            </div>
            <pre className="max-h-80 overflow-auto text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                {content}
            </pre>
        </div>
    );
}

