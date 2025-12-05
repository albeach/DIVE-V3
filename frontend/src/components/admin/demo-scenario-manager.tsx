/**
 * Demo Scenario Manager
 * 
 * Quick preset buttons to load demo scenarios for presentations
 * Makes demos smooth and professional
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface IDemoScenario {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    actions: {
        type: 'navigate' | 'toggle' | 'seed';
        target: string;
        value?: any;
    }[];
}

const DEMO_SCENARIOS: IDemoScenario[] = [
    {
        id: 'nato-exercise',
        name: 'NATO Exercise',
        description: 'Simulates multi-country coalition access patterns',
        icon: '🌍',
        color: 'from-blue-500 to-indigo-600',
        actions: [
            { type: 'navigate', target: '/admin/dashboard' },
            { type: 'navigate', target: '/admin/opa-policy' }
        ]
    },
    {
        id: 'crisis-response',
        name: 'Crisis Response',
        description: 'Rapid policy changes during emergency situations',
        icon: '🚨',
        color: 'from-red-500 to-orange-600',
        actions: [
            { type: 'navigate', target: '/admin/opa-policy' }
        ]
    },
    {
        id: 'federation-test',
        name: 'Federation Test',
        description: 'Multi-IdP partner authentication flows',
        icon: '🤝',
        color: 'from-purple-500 to-pink-600',
        actions: [
            { type: 'navigate', target: '/admin/analytics' },
            { type: 'navigate', target: '/admin/idp' }
        ]
    },
    {
        id: 'policy-tuning',
        name: 'Policy Tuning',
        description: 'Before/after policy impact comparison',
        icon: '⚙️',
        color: 'from-green-500 to-emerald-600',
        actions: [
            { type: 'navigate', target: '/admin/opa-policy' }
        ]
    },
    {
        id: 'security-audit',
        name: 'Security Audit',
        description: 'View authorization decisions and compliance',
        icon: '🔍',
        color: 'from-yellow-500 to-amber-600',
        actions: [
            { type: 'navigate', target: '/admin/logs' },
            { type: 'navigate', target: '/admin/dashboard?tab=realtime' }
        ]
    }
];

export default function DemoScenarioManager() {
    const router = useRouter();
    const [activeScenario, setActiveScenario] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const loadScenario = async (scenario: IDemoScenario) => {
        setLoading(true);
        setActiveScenario(scenario.id);

        try {
            // Execute actions sequentially
            for (const action of scenario.actions) {
                switch (action.type) {
                    case 'navigate':
                        // Small delay for smooth transitions
                        await new Promise(resolve => setTimeout(resolve, 300));
                        router.push(action.target);
                        break;
                    case 'toggle':
                        // Future: Toggle policy rules
                        break;
                    case 'seed':
                        // Future: Seed demo data
                        break;
                }
            }

            // Show success message
            setTimeout(() => {
                setActiveScenario(null);
                setLoading(false);
            }, 1000);
        } catch (error) {
            console.error('Failed to load scenario:', error);
            setActiveScenario(null);
            setLoading(false);
        }
    };

    return (
        <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl shadow-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
                        <span>🎬</span>
                        <span>Demo Scenarios</span>
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                        Quick preset scenarios for presentations
                    </p>
                </div>
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
                    DEMO MODE
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {DEMO_SCENARIOS.map((scenario) => (
                    <button
                        key={scenario.id}
                        onClick={() => loadScenario(scenario)}
                        disabled={loading}
                        className={`
                            relative overflow-hidden rounded-xl p-4 text-left
                            bg-gradient-to-br ${scenario.color} text-white
                            shadow-lg hover:shadow-xl transform hover:scale-105
                            transition-all duration-200
                            ${loading && activeScenario === scenario.id ? 'animate-pulse' : ''}
                            ${loading ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                    >
                        {/* Background pattern */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16"></div>
                        
                        <div className="relative z-10">
                            <div className="flex items-start justify-between mb-2">
                                <span className="text-3xl">{scenario.icon}</span>
                                {activeScenario === scenario.id && (
                                    <span className="animate-spin text-xl">⚙️</span>
                                )}
                            </div>
                            <h4 className="font-bold text-lg mb-1">{scenario.name}</h4>
                            <p className="text-sm opacity-90">{scenario.description}</p>
                        </div>
                    </button>
                ))}
            </div>

            {loading && (
                <div className="mt-4 p-3 bg-blue-100 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800 flex items-center space-x-2">
                        <span className="animate-spin">⏳</span>
                        <span>Loading scenario...</span>
                    </p>
                </div>
            )}
        </div>
    );
}





