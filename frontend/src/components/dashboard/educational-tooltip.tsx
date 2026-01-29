/**
 * Educational Tooltip Component
 *
 * Provides informative tooltips explaining key DIVE V3 concepts.
 * Includes glossary popover functionality.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, BookOpen, ExternalLink } from 'lucide-react';

// Glossary of DIVE V3 terms
export const GLOSSARY: Record<string, { term: string; definition: string; link?: string }> = {
  ABAC: {
    term: 'Attribute-Based Access Control',
    definition: 'Access control paradigm where authorization decisions are based on attributes of subjects, resources, actions, and environment rather than roles.',
    link: '/policies',
  },
  PEP: {
    term: 'Policy Enforcement Point',
    definition: 'The component that intercepts access requests and enforces authorization decisions from the PDP.',
  },
  PDP: {
    term: 'Policy Decision Point',
    definition: 'The component that evaluates access requests against policies and returns authorization decisions.',
  },
  OPA: {
    term: 'Open Policy Agent',
    definition: 'A general-purpose policy engine that enables unified policy enforcement. DIVE V3 uses OPA with Rego policies.',
    link: '/policies',
  },
  Rego: {
    term: 'Rego Policy Language',
    definition: 'A high-level declarative language used to write policies in OPA. Designed for querying complex nested data.',
    link: '/policies/sandbox',
  },
  'ACP-240': {
    term: 'NATO Access Control Policy',
    definition: 'NATO standardized access control policy defining clearance levels, releasability, and COI requirements for coalition information sharing.',
    link: '/compliance',
  },
  STANAG: {
    term: 'Standardization Agreement',
    definition: 'NATO standardization agreements that define processes, procedures, terms, and conditions for common military practices.',
  },
  COI: {
    term: 'Community of Interest',
    definition: 'A group of users with shared information needs. Examples: FVEY, NATO-COSMIC, US-ONLY.',
  },
  KAS: {
    term: 'Key Access Service',
    definition: 'Policy-bound key release service for encrypted content. KAS re-evaluates authorization before releasing decryption keys.',
    link: '/kas',
  },
  ZTDF: {
    term: 'Zero Trust Data Format',
    definition: 'Encryption format that embeds policy into encrypted payloads. Recipients must satisfy policy to decrypt.',
  },
  Federation: {
    term: 'Identity Federation',
    definition: 'Trust framework enabling users to authenticate with their home identity provider and access resources across partner organizations.',
    link: '/admin/federation',
  },
  Clearance: {
    term: 'Security Clearance',
    definition: 'Authorization level granted to individuals allowing access to classified information. Levels: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET.',
  },
  Releasability: {
    term: 'Information Releasability',
    definition: 'Countries to which classified information may be released. Determined by resource labels and federation agreements.',
  },
};

interface EducationalTooltipProps {
  term: keyof typeof GLOSSARY | string;
  children?: React.ReactNode;
  showIcon?: boolean;
  className?: string;
}

export function EducationalTooltip({
  term,
  children,
  showIcon = true,
  className = ''
}: EducationalTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const glossaryEntry = GLOSSARY[term];

  // Adjust position based on viewport
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setPosition(spaceBelow < 200 ? 'top' : 'bottom');
    }
  }, [isOpen]);

  if (!glossaryEntry) {
    return <span className={className}>{children || term}</span>;
  }

  return (
    <span className={`relative inline-flex items-center gap-1 ${className}`}>
      {children || <span className="border-b border-dotted border-slate-400">{term}</span>}

      {showIcon && (
        <button
          ref={triggerRef}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 transition-colors"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={`Learn about ${term}`}
        >
          <Info className="w-3 h-3" />
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, y: position === 'bottom' ? -5 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`
              absolute z-50 w-72 p-4 rounded-xl
              bg-white border border-slate-200 shadow-xl
              ${position === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'}
              left-0
            `}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-900 mb-1">
                  {term}
                </h4>
                <p className="text-xs text-slate-600 mb-1">
                  {glossaryEntry.term}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {glossaryEntry.definition}
                </p>

                {glossaryEntry.link && (
                  <a
                    href={glossaryEntry.link}
                    className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Learn more
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Arrow */}
            <div
              className={`
                absolute left-6 w-2 h-2 bg-white border-slate-200 rotate-45
                ${position === 'bottom'
                  ? '-top-1 border-l border-t'
                  : '-bottom-1 border-r border-b'
                }
              `}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

interface GlossaryPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  filter?: string;
}

export function GlossaryPopover({ isOpen, onClose, filter = '' }: GlossaryPopoverProps) {
  const filteredTerms = Object.entries(GLOSSARY).filter(
    ([key, value]) =>
      key.toLowerCase().includes(filter.toLowerCase()) ||
      value.term.toLowerCase().includes(filter.toLowerCase()) ||
      value.definition.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Popover */}
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden pointer-events-auto"
            >
              <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-slate-900">DIVE V3 Glossary</h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
                  >
                    &times;
                  </button>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Key terms and concepts used throughout the platform
                </p>
              </div>

              <div className="overflow-y-auto max-h-[60vh] p-4 space-y-3">
                {filteredTerms.map(([key, value]) => (
                  <div
                    key={key}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-100 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-600">
                        {key.slice(0, 2)}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{key}</h4>
                        <p className="text-xs text-slate-600">{value.term}</p>
                        <p className="text-xs text-slate-500 mt-1">{value.definition}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export default EducationalTooltip;
