'use client';

/**
 * Marking Preview Component
 *
 * Live preview of how STANAG 4774-compliant security markings will appear
 * on a document after upload. Shows banners, badges, watermarks, and portion marks.
 *
 * Used in the upload form to help users understand the visual impact of their
 * classification and releasability selections.
 */

import React, { useMemo } from 'react';
import { Shield, FileText, Eye, AlertTriangle } from 'lucide-react';
import {
    generateMarkingText,
    getClassificationColor,
    normalizeClassification,
    type IGeneratedMarking,
    type ClassificationLevel,
} from '@/lib/spif-markings';

/**
 * Props for MarkingPreview
 */
export interface MarkingPreviewProps {
    /** Classification level */
    classification: string;
    /** Releasability countries (ISO 3166-1 alpha-3) */
    releasabilityTo: string[];
    /** Communities of Interest */
    COI?: string[];
    /** Caveats (NOFORN, etc.) */
    caveats?: string[];
    /** Language for markings */
    language?: 'en' | 'fr';
    /** Title of the document (optional) */
    documentTitle?: string;
    /** Show compact version */
    compact?: boolean;
}

/**
 * Mini document preview with markings
 */
const DocumentPreview: React.FC<{
    marking: IGeneratedMarking;
    documentTitle?: string;
}> = ({ marking, documentTitle }) => (
    <div className="border-2 border-gray-300 rounded-lg overflow-hidden shadow-lg max-w-md mx-auto">
        {/* Top Banner */}
        <div
            className="text-center py-2 px-3 text-xs font-bold uppercase tracking-wider"
            style={{
                backgroundColor: marking.color.bg,
                color: marking.color.text,
            }}
        >
            {marking.displayMarking}
        </div>

        {/* Document Content Preview */}
        <div className="relative bg-white p-4 min-h-[200px]">
            {/* Watermark */}
            <div
                className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Ctext x='100' y='100' font-family='Arial, sans-serif' font-size='16' fill='${encodeURIComponent(marking.color.bg)}' text-anchor='middle' transform='rotate(-45, 100, 100)'%3E${encodeURIComponent(marking.watermarkText)}%3C/text%3E%3C/svg%3E")`,
                    backgroundRepeat: 'repeat',
                }}
            />

            {/* Badge */}
            <div
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                style={{
                    backgroundColor: marking.color.bg,
                    color: marking.color.text,
                }}
            >
                <Shield className="w-3 h-3" />
                {marking.classification.replace(/_/g, ' ')}
            </div>

            {/* Sample Content */}
            <div className="relative z-10 space-y-3 pt-6">
                <h3 className="font-bold text-gray-800 text-sm">
                    {documentTitle || 'Document Title'}
                </h3>
                <p className="text-xs text-gray-600">
                    <span
                        className="font-bold mr-1"
                        style={{ color: marking.color.bg }}
                    >
                        {marking.portionMarking}
                    </span>
                    This is an example paragraph showing how portion markings appear inline with the text content.
                </p>
                <p className="text-xs text-gray-600">
                    <span
                        className="font-bold mr-1"
                        style={{ color: marking.color.bg }}
                    >
                        {marking.portionMarking}
                    </span>
                    Additional content would continue with the same classification prefix to ensure proper marking throughout the document.
                </p>
            </div>
        </div>

        {/* Bottom Banner */}
        <div
            className="text-center py-2 px-3 text-xs font-bold uppercase tracking-wider"
            style={{
                backgroundColor: marking.color.bg,
                color: marking.color.text,
            }}
        >
            {marking.displayMarking}
        </div>
    </div>
);

/**
 * Marking breakdown details
 */
const MarkingDetails: React.FC<{
    marking: IGeneratedMarking;
    releasabilityTo: string[];
    COI?: string[];
    caveats?: string[];
}> = ({ marking, releasabilityTo, COI, caveats }) => (
    <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-600">Full Marking:</span>
            <code className="bg-white px-3 py-1 rounded border font-mono text-xs">
                {marking.displayMarking}
            </code>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-600">Portion Mark:</span>
            <code
                className="px-3 py-1 rounded font-mono text-xs font-bold"
                style={{
                    backgroundColor: `${marking.color.bg}20`,
                    color: marking.color.bg,
                }}
            >
                {marking.portionMarking}
            </code>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-600">Watermark Text:</span>
            <span className="font-medium">{marking.watermarkText}</span>
        </div>

        {releasabilityTo.length > 0 && (
            <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 block mb-2">Releasable To:</span>
                <div className="flex flex-wrap gap-1">
                    {releasabilityTo.map(country => (
                        <span
                            key={country}
                            className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium"
                        >
                            {country}
                        </span>
                    ))}
                </div>
            </div>
        )}

        {COI && COI.length > 0 && (
            <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 block mb-2">Communities of Interest:</span>
                <div className="flex flex-wrap gap-1">
                    {COI.map(coi => (
                        <span
                            key={coi}
                            className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-medium"
                        >
                            {coi}
                        </span>
                    ))}
                </div>
            </div>
        )}

        {caveats && caveats.length > 0 && (
            <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600 block mb-2">Caveats:</span>
                <div className="flex flex-wrap gap-1">
                    {caveats.map(caveat => (
                        <span
                            key={caveat}
                            className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-medium"
                        >
                            {caveat}
                        </span>
                    ))}
                </div>
            </div>
        )}
    </div>
);

/**
 * Compact marking badge for inline display
 */
export const CompactMarkingPreview: React.FC<{
    classification: string;
    releasabilityTo: string[];
    COI?: string[];
    caveats?: string[];
}> = ({ classification, releasabilityTo, COI, caveats }) => {
    const marking = useMemo(
        () => generateMarkingText(classification, releasabilityTo, { COI, caveats }),
        [classification, releasabilityTo, COI, caveats]
    );

    return (
        <div className="inline-flex items-center gap-2">
            <span
                className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-1.5"
                style={{
                    backgroundColor: marking.color.bg,
                    color: marking.color.text,
                }}
            >
                <Shield className="w-3 h-3" />
                {marking.classification.replace(/_/g, ' ')}
            </span>
            {releasabilityTo.length > 0 && (
                <span className="text-xs text-gray-500">
                    REL TO {releasabilityTo.slice(0, 3).join(', ')}
                    {releasabilityTo.length > 3 && ` +${releasabilityTo.length - 3}`}
                </span>
            )}
        </div>
    );
};

/**
 * Main Marking Preview Component
 */
export const MarkingPreview: React.FC<MarkingPreviewProps> = ({
    classification,
    releasabilityTo,
    COI,
    caveats,
    language = 'en',
    documentTitle,
    compact = false,
}) => {
    // Generate marking
    const marking = useMemo(
        () => generateMarkingText(classification, releasabilityTo, { COI, caveats, language }),
        [classification, releasabilityTo, COI, caveats, language]
    );

    // Validation warning
    const showWarning = releasabilityTo.length === 0 && classification !== 'UNCLASSIFIED';

    if (compact) {
        return (
            <CompactMarkingPreview
                classification={classification}
                releasabilityTo={releasabilityTo}
                COI={COI}
                caveats={caveats}
            />
        );
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <div
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${marking.color.bg}20` }}
                >
                    <Eye className="w-5 h-5" style={{ color: marking.color.bg }} />
                </div>
                <div>
                    <h3 className="font-semibold text-gray-900">Marking Preview</h3>
                    <p className="text-xs text-gray-500">
                        How your document will appear with security markings
                    </p>
                </div>
            </div>

            {/* Warning if no releasability */}
            {showWarning && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-medium text-amber-800">No Releasability Specified</p>
                        <p className="text-amber-700 text-xs">
                            Classified documents without releasability will not be accessible.
                            Please specify at least one country in &quot;Releasable To&quot;.
                        </p>
                    </div>
                </div>
            )}

            {/* Document Preview */}
            <DocumentPreview marking={marking} documentTitle={documentTitle} />

            {/* Marking Details */}
            <MarkingDetails
                marking={marking}
                releasabilityTo={releasabilityTo}
                COI={COI}
                caveats={caveats}
            />

            {/* STANAG Reference */}
            <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>Markings comply with STANAG 4774 / ACP-240</span>
            </div>
        </div>
    );
};

export default MarkingPreview;
