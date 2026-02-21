'use client';

/**
 * Marking Renderer Component
 *
 * Renders STANAG 4774-compliant security markings as visual overlays:
 * - Page banners (top/bottom classification bars)
 * - Floating badge (persistent classification indicator)
 * - Watermark (diagonal text overlay)
 * - Portion marks (inline prefixes for text sections)
 *
 * Reference: NATO Security Policy Information File (SPIF)
 */

import React, { useState, useCallback } from 'react';
import {
    generateMarkingText,
    getClassificationColor,
    generateWatermarkPattern,
    type ClassificationLevel,
} from '@/lib/spif-markings';
import { Shield, Eye, EyeOff, Settings } from 'lucide-react';

/**
 * Marking display options
 */
export interface IMarkingDisplayOptions {
    showBanners: boolean;
    showBadge: boolean;
    showWatermark: boolean;
    showPortionMarks: boolean;
    watermarkOpacity: number;
    language: 'en' | 'fr';
}

/**
 * Default marking display options
 */
export const DEFAULT_MARKING_OPTIONS: IMarkingDisplayOptions = {
    showBanners: true,
    showBadge: true,
    showWatermark: true,
    showPortionMarks: true,
    watermarkOpacity: 0.08,
    language: 'en',
};

/**
 * Props for MarkingRenderer
 */
export interface MarkingRendererProps {
    /** Classification level (e.g., SECRET, TOP_SECRET) */
    classification: string;
    /** Releasability countries (ISO 3166-1 alpha-3) */
    releasabilityTo: string[];
    /** Communities of Interest */
    COI?: string[];
    /** Caveats (NOFORN, etc.) */
    caveats?: string[];
    /** Pre-computed display marking string */
    displayMarking?: string;
    /** Portion markings for text sections */
    portionMarkings?: Record<string, string>;
    /** Display options */
    options?: Partial<IMarkingDisplayOptions>;
    /** Child content to wrap */
    children: React.ReactNode;
    /** Custom class name for container */
    className?: string;
    /** Show marking options UI */
    showOptionsUI?: boolean;
}

/**
 * Classification Banner Component
 */
const ClassificationBanner: React.FC<{
    text: string;
    color: { bg: string; text: string; border: string };
    position: 'top' | 'bottom';
}> = ({ text, color, position }) => (
    <div
        className={`
            w-full py-2 px-4 text-center font-bold text-sm tracking-wider
            ${position === 'top' ? 'rounded-t-lg' : 'rounded-b-lg'}
            shadow-md z-30
        `}
        style={{
            backgroundColor: color.bg,
            color: color.text,
            borderBottom: position === 'top' ? `2px solid ${color.border}` : 'none',
            borderTop: position === 'bottom' ? `2px solid ${color.border}` : 'none',
        }}
    >
        {text}
    </div>
);

/**
 * Floating Badge Component
 */
const ClassificationBadge: React.FC<{
    classification: string;
    color: { bg: string; text: string; border: string };
    onClick?: () => void;
}> = ({ classification, color, onClick }) => (
    <div
        className="absolute top-4 right-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg cursor-pointer transition-transform hover:scale-105"
        style={{
            backgroundColor: color.bg,
            color: color.text,
            border: `2px solid ${color.border}`,
        }}
        onClick={onClick}
        title="Click to toggle marking options"
    >
        <Shield className="w-4 h-4" />
        <span className="font-bold text-xs uppercase tracking-wide">{classification}</span>
    </div>
);

/**
 * Watermark Overlay Component
 */
const WatermarkOverlay: React.FC<{
    text: string;
    opacity: number;
    color: string;
}> = ({ text, opacity, color }) => (
    <div
        className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
        style={{
            backgroundImage: generateWatermarkPattern(text, `rgba(${hexToRgb(color)}, ${opacity})`),
            backgroundRepeat: 'repeat',
        }}
    />
);

/**
 * Marking Options Panel
 */
const MarkingOptionsPanel: React.FC<{
    options: IMarkingDisplayOptions;
    onChange: (options: IMarkingDisplayOptions) => void;
    onClose: () => void;
}> = ({ options, onChange, onClose }) => (
    <div className="absolute top-14 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 min-w-[280px]">
        <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Marking Display Options
            </h4>
            <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
                ✕
            </button>
        </div>

        <div className="space-y-3">
            <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Show Banners</span>
                <input
                    type="checkbox"
                    checked={options.showBanners}
                    onChange={e => onChange({ ...options, showBanners: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
            </label>

            <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Show Badge</span>
                <input
                    type="checkbox"
                    checked={options.showBadge}
                    onChange={e => onChange({ ...options, showBadge: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
            </label>

            <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Show Watermark</span>
                <input
                    type="checkbox"
                    checked={options.showWatermark}
                    onChange={e => onChange({ ...options, showWatermark: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
            </label>

            <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Show Portion Marks</span>
                <input
                    type="checkbox"
                    checked={options.showPortionMarks}
                    onChange={e => onChange({ ...options, showPortionMarks: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
            </label>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <label className="block">
                    <span className="text-sm text-gray-700 dark:text-gray-300 mb-1 block">
                        Watermark Opacity: {Math.round(options.watermarkOpacity * 100)}%
                    </span>
                    <input
                        type="range"
                        min="0"
                        max="0.3"
                        step="0.01"
                        value={options.watermarkOpacity}
                        onChange={e => onChange({ ...options, watermarkOpacity: parseFloat(e.target.value) })}
                        className="w-full"
                    />
                </label>
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <label className="block">
                    <span className="text-sm text-gray-700 dark:text-gray-300 mb-1 block">Language</span>
                    <select
                        value={options.language}
                        onChange={e => onChange({ ...options, language: e.target.value as 'en' | 'fr' })}
                        className="w-full rounded border-gray-300 dark:border-gray-600 text-sm"
                    >
                        <option value="en">English</option>
                        <option value="fr">Français</option>
                    </select>
                </label>
            </div>
        </div>
    </div>
);

/**
 * Convert hex color to RGB values
 */
function hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
        return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return '0, 0, 0';
}

/**
 * Main Marking Renderer Component
 *
 * Wraps content with STANAG-compliant security markings
 */
export const MarkingRenderer: React.FC<MarkingRendererProps> = ({
    classification,
    releasabilityTo,
    COI,
    caveats,
    displayMarking,
    portionMarkings,
    options: customOptions,
    children,
    className = '',
    showOptionsUI = true,
}) => {
    // Merge options with defaults
    const [options, setOptions] = useState<IMarkingDisplayOptions>({
        ...DEFAULT_MARKING_OPTIONS,
        ...customOptions,
    });

    const [showOptions, setShowOptions] = useState(false);

    // Generate marking text
    const marking = React.useMemo(() => {
        if (displayMarking) {
            const color = getClassificationColor(classification);
            return {
                displayMarking,
                pageTopBottom: displayMarking.split(' // ')[0],
                watermarkText: classification.replace(/_/g, ' '),
                color,
            };
        }
        return generateMarkingText(classification, releasabilityTo, {
            COI,
            caveats,
            language: options.language,
        });
    }, [classification, releasabilityTo, COI, caveats, displayMarking, options.language]);

    const handleToggleOptions = useCallback(() => {
        setShowOptions(prev => !prev);
    }, []);

    return (
        <div className={`relative ${className}`}>
            {/* Top Banner */}
            {options.showBanners && (
                <ClassificationBanner
                    text={marking.displayMarking}
                    color={marking.color}
                    position="top"
                />
            )}

            {/* Content Container */}
            <div className="relative">
                {/* Watermark Overlay */}
                {options.showWatermark && (
                    <WatermarkOverlay
                        text={marking.watermarkText}
                        opacity={options.watermarkOpacity}
                        color={marking.color.bg}
                    />
                )}

                {/* Floating Badge */}
                {options.showBadge && (
                    <ClassificationBadge
                        classification={classification.replace(/_/g, ' ')}
                        color={marking.color}
                        onClick={showOptionsUI ? handleToggleOptions : undefined}
                    />
                )}

                {/* Options Panel */}
                {showOptionsUI && showOptions && (
                    <MarkingOptionsPanel
                        options={options}
                        onChange={setOptions}
                        onClose={() => setShowOptions(false)}
                    />
                )}

                {/* Child Content */}
                <div className="relative z-10">
                    {children}
                </div>
            </div>

            {/* Bottom Banner */}
            {options.showBanners && (
                <ClassificationBanner
                    text={marking.displayMarking}
                    color={marking.color}
                    position="bottom"
                />
            )}
        </div>
    );
};

/**
 * Inline Portion Mark Component
 *
 * Renders classification prefix for text sections
 */
export const PortionMark: React.FC<{
    classification: string;
    children: React.ReactNode;
}> = ({ classification, children }) => {
    const color = getClassificationColor(classification);
    const marking = generateMarkingText(classification, []);

    return (
        <span className="inline">
            <span
                className="font-bold text-sm mr-1"
                style={{ color: color.bg }}
                title={classification.replace(/_/g, ' ')}
            >
                {marking.portionMarking}
            </span>
            {children}
        </span>
    );
};

/**
 * Text with Portion Markings Component
 *
 * Renders text content with per-paragraph classification prefixes
 */
export const TextWithPortionMarkings: React.FC<{
    content: string;
    portionMarkings?: Record<string, string>;
    defaultClassification: string;
}> = ({ content, portionMarkings, defaultClassification }) => {
    // Split content into paragraphs
    const paragraphs = content.split('\n\n');

    return (
        <div className="space-y-4">
            {paragraphs.map((paragraph, index) => {
                // Check if this paragraph has a specific classification
                const paragraphId = `para-${index}`;
                const classification = portionMarkings?.[paragraphId] || defaultClassification;

                // Skip empty paragraphs
                if (!paragraph.trim()) return null;

                return (
                    <p key={index} className="leading-relaxed">
                        <PortionMark classification={classification}>
                            {paragraph}
                        </PortionMark>
                    </p>
                );
            })}
        </div>
    );
};

/**
 * Simple Classification Badge (standalone)
 */
export const StandaloneClassificationBadge: React.FC<{
    classification: string;
    size?: 'sm' | 'md' | 'lg';
}> = ({ classification, size = 'md' }) => {
    const color = getClassificationColor(classification);

    const sizeClasses = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-3 py-1 text-sm',
        lg: 'px-4 py-1.5 text-base',
    };

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide ${sizeClasses[size]}`}
            style={{
                backgroundColor: color.bg,
                color: color.text,
                border: `1px solid ${color.border}`,
            }}
        >
            <Shield className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
            {classification.replace(/_/g, ' ')}
        </span>
    );
};

export default MarkingRenderer;
