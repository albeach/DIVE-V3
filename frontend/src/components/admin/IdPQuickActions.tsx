/**
 * IdP Quick Actions Component (FAB - Floating Action Button)
 * 
 * Floating action button with:
 * - Fixed position in bottom-right
 * - Radial menu on click (5 actions in circle)
 * - Spring animations
 * - Tooltips on hover
 * - Backdrop blur when expanded
 * 
 * Phase 2.5: Modern UI Components
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    PlusIcon,
    ArrowPathIcon,
    DocumentArrowDownIcon,
    ChartBarIcon,
    Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

// ============================================
// Types
// ============================================

interface QuickAction {
    id: string;
    label: string;
    icon: React.ComponentType<any>;
    onClick: () => void;
    color: string;
}

interface IdPQuickActionsProps {
    onRefresh?: () => void;
    onExport?: () => void;
}

// ============================================
// Component
// ============================================

export default function IdPQuickActions({ onRefresh, onExport }: IdPQuickActionsProps) {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [hoveredAction, setHoveredAction] = useState<string | null>(null);

    const actions: QuickAction[] = [
        {
            id: 'add',
            label: 'Add IdP',
            icon: PlusIcon,
            onClick: () => {
                router.push('/admin/idp/new');
                setIsOpen(false);
            },
            color: 'bg-green-600 hover:bg-green-700'
        },
        {
            id: 'refresh',
            label: 'Refresh All',
            icon: ArrowPathIcon,
            onClick: () => {
                if (onRefresh) onRefresh();
                setIsOpen(false);
            },
            color: 'bg-blue-600 hover:bg-blue-700'
        },
        {
            id: 'export',
            label: 'Export Config',
            icon: DocumentArrowDownIcon,
            onClick: () => {
                if (onExport) onExport();
                setIsOpen(false);
            },
            color: 'bg-purple-600 hover:bg-purple-700'
        },
        {
            id: 'analytics',
            label: 'View Analytics',
            icon: ChartBarIcon,
            onClick: () => {
                router.push('/admin/analytics');
                setIsOpen(false);
            },
            color: 'bg-orange-600 hover:bg-orange-700'
        },
        {
            id: 'settings',
            label: 'Settings',
            icon: Cog6ToothIcon,
            onClick: () => {
                router.push('/admin/dashboard');
                setIsOpen(false);
            },
            color: 'bg-gray-600 hover:bg-gray-700'
        }
    ];

    // Calculate radial positions for actions
    const radius = 80;
    const angleStep = (2 * Math.PI) / actions.length;
    const angleOffset = -Math.PI / 2; // Start from top

    return (
        <>
            {/* Backdrop */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                    />
                )}
            </AnimatePresence>

            {/* FAB Container */}
            <div className="fixed bottom-8 right-8 z-50">
                {/* Action Buttons (Radial) */}
                <AnimatePresence>
                    {isOpen && actions.map((action, index) => {
                        const angle = angleOffset + (index * angleStep);
                        const x = Math.cos(angle) * radius;
                        const y = Math.sin(angle) * radius;
                        const Icon = action.icon;

                        return (
                            <motion.div
                                key={action.id}
                                initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                                animate={{ 
                                    opacity: 1, 
                                    scale: 1, 
                                    x, 
                                    y 
                                }}
                                exit={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                                transition={{ 
                                    type: 'spring', 
                                    stiffness: 300, 
                                    damping: 25,
                                    delay: index * 0.05
                                }}
                                className="absolute bottom-0 right-0"
                                onMouseEnter={() => setHoveredAction(action.id)}
                                onMouseLeave={() => setHoveredAction(null)}
                            >
                                <button
                                    onClick={action.onClick}
                                    className={`
                                        p-3 rounded-full text-white shadow-lg
                                        ${action.color}
                                        transition-all transform hover:scale-110
                                    `}
                                    title={action.label}
                                >
                                    <Icon className="h-5 w-5" />
                                </button>

                                {/* Tooltip */}
                                <AnimatePresence>
                                    {hoveredAction === action.id && (
                                        <motion.div
                                            initial={{ opacity: 0, x: 10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap"
                                        >
                                            <div className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
                                                {action.label}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {/* Main FAB Button */}
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsOpen(!isOpen)}
                    className={`
                        relative p-4 rounded-full shadow-2xl transition-all
                        ${isOpen 
                            ? 'bg-red-600 hover:bg-red-700 rotate-45' 
                            : 'bg-purple-600 hover:bg-purple-700'}
                        text-white
                    `}
                >
                    <PlusIcon className="h-6 w-6" />
                    
                    {/* Ripple Effect */}
                    {!isOpen && (
                        <span className="absolute inset-0 rounded-full bg-purple-400 animate-ping opacity-20" />
                    )}
                </motion.button>
            </div>
        </>
    );
}
