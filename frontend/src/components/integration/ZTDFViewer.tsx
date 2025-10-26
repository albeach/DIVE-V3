"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Shield, Lock, FileCheck, CheckCircle, XCircle } from "lucide-react";

interface IZTDF {
  resourceId: string;
  classification: string;
  originalClassification: string;
  originalCountry: string;
  releasabilityTo: string[];
  COI: string[];
  caveats: string[];
  creationDate: string;
  encrypted: boolean;
  encryptionAlgorithm: string;
  kaos: IKAO[];
  policyHash: string;
  signature: {
    valid: boolean;
    signedBy: string;
  };
}

interface IKAO {
  kasUrl: string;
  publicKeyFingerprint: string;
  wrappedDEK: string;
}

/**
 * ZTDF Object Viewer Component
 * 
 * Card displaying ZTDF structure per ACP-240:
 * - Classification badge (with flag)
 * - Metadata accordion (policy, encryption, integrity)
 * - KAO list (Key Access Objects)
 * - Crypto status pills
 * 
 * @see ACP-240 §5.1 ZTDF Structure
 * @see ACP-240 §5.4 Cryptographic Binding & Integrity
 */
export function ZTDFViewer() {
  const [expandedSection, setExpandedSection] = useState<string | null>("policy");

  // Mock ZTDF data
  const ztdf: IZTDF = {
    resourceId: "doc-classified-001",
    classification: "SECRET",
    originalClassification: "GEHEIM",
    originalCountry: "DEU",
    releasabilityTo: ["DEU", "USA", "GBR"],
    COI: ["NATO", "FVEY"],
    caveats: [],
    creationDate: "2025-10-26T10:00:00Z",
    encrypted: true,
    encryptionAlgorithm: "AES-256-GCM",
    kaos: [
      {
        kasUrl: "https://kas.usa.mil:8080",
        publicKeyFingerprint: "SHA256:a1b2c3d4...",
        wrappedDEK: "AQIDBAUGBwgJCg...(truncated)",
      },
      {
        kasUrl: "https://kas.deu.bundeswehr.org:8080",
        publicKeyFingerprint: "SHA256:e5f6g7h8...",
        wrappedDEK: "AQIDBAUGBwgJCg...(truncated)",
      },
      {
        kasUrl: "https://kas.gbr.mod.uk:8080",
        publicKeyFingerprint: "SHA256:i9j0k1l2...",
        wrappedDEK: "AQIDBAUGBwgJCg...(truncated)",
      },
    ],
    policyHash: "3a7bd3e2cf14b34e59be9c89bcaa342ac12ec591fd867720a471d90ee6d7c50f",
    signature: {
      valid: true,
      signedBy: "CN=dive-v3-signing, O=DIVE V3, C=USA",
    },
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <section 
      className="w-full py-12 px-4 sm:px-6 lg:px-8"
      aria-labelledby="ztdf-viewer-title"
    >
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <h2 
          id="ztdf-viewer-title"
          className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2"
        >
          ZTDF Object Viewer
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Inspect Zero Trust Data Format structure, encryption, and integrity binding
        </p>
      </div>

      {/* ZTDF Card */}
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden">
          {/* Classification Badge */}
          <div className="bg-gradient-to-r from-amber-500 to-red-500 p-6">
            <div className="flex items-center gap-4">
              <div className="text-6xl">🇩🇪</div>
              <div className="text-white">
                <div className="text-3xl font-bold">
                  {ztdf.originalClassification} / {ztdf.classification}
                </div>
                <div className="text-lg opacity-90">
                  ({ztdf.originalCountry} Classification)
                </div>
              </div>
            </div>
          </div>

          {/* Crypto Status Pills */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                <CheckCircle className="w-4 h-4" />
                Hash Verified
              </span>
              {ztdf.signature.valid && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                  <CheckCircle className="w-4 h-4" />
                  Signature Valid
                </span>
              )}
              {ztdf.encrypted && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                  <Lock className="w-4 h-4" />
                  Encrypted
                </span>
              )}
            </div>
          </div>

          {/* Accordion Sections */}
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {/* Policy Metadata */}
            <AccordionSection
              title="Policy Metadata"
              icon={Shield}
              isExpanded={expandedSection === "policy"}
              onToggle={() => toggleSection("policy")}
            >
              <div className="space-y-3">
                <DataRow label="Releasability To" value={ztdf.releasabilityTo.join(", ")} />
                <DataRow label="COI" value={ztdf.COI.join(", ")} />
                <DataRow label="Caveats" value={ztdf.caveats.length > 0 ? ztdf.caveats.join(", ") : "None"} />
                <DataRow label="Created" value={new Date(ztdf.creationDate).toLocaleString()} />
              </div>
            </AccordionSection>

            {/* Encryption Info */}
            <AccordionSection
              title="Encryption Info"
              icon={Lock}
              isExpanded={expandedSection === "encryption"}
              onToggle={() => toggleSection("encryption")}
            >
              <div className="space-y-4">
                <DataRow label="Encrypted" value={ztdf.encrypted ? "Yes" : "No"} />
                {ztdf.encrypted && (
                  <>
                    <DataRow label="Algorithm" value={ztdf.encryptionAlgorithm} />
                    <div>
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Key Access Objects ({ztdf.kaos.length})
                      </div>
                      <div className="space-y-2">
                        {ztdf.kaos.map((kao, index) => (
                          <div
                            key={index}
                            className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                          >
                            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                              KAO {index + 1}
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">KAS URL:</span>
                                <span className="font-mono text-gray-900 dark:text-gray-100 break-all ml-2">
                                  {kao.kasUrl}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Key Fingerprint:</span>
                                <span className="font-mono text-gray-900 dark:text-gray-100">
                                  {kao.publicKeyFingerprint}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Wrapped DEK:</span>
                                <span className="font-mono text-gray-900 dark:text-gray-100">
                                  {kao.wrappedDEK}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </AccordionSection>

            {/* Integrity Binding */}
            <AccordionSection
              title="Integrity Binding"
              icon={FileCheck}
              isExpanded={expandedSection === "integrity"}
              onToggle={() => toggleSection("integrity")}
            >
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Policy Hash (SHA-384)
                  </div>
                  <div className="font-mono text-xs text-gray-600 dark:text-gray-400 break-all bg-gray-50 dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700">
                    {ztdf.policyHash}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    X.509 Signature
                  </div>
                  <div className="flex items-center gap-2">
                    {ztdf.signature.valid ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        <span className="text-sm text-green-700 dark:text-green-300 font-semibold">Valid</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        <span className="text-sm text-red-700 dark:text-red-300 font-semibold">Invalid</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    Signed by: {ztdf.signature.signedBy}
                  </div>
                </div>
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <div className="text-xs font-semibold text-amber-900 dark:text-amber-100 mb-1">
                    STANAG 4778 Binding
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Policy metadata is cryptographically bound to prevent tampering. 
                    Signature MUST be verified BEFORE decryption (fail-secure pattern).
                  </p>
                </div>
              </div>
            </AccordionSection>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Zero Trust Data Format v1.0 • ACP-240 §5.1
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Accordion Section Helper Component
 */
interface AccordionSectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionSection({ title, icon: Icon, isExpanded, onToggle, children }: AccordionSectionProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        )}
      </button>
      {isExpanded && (
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Data Row Helper Component
 */
function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm font-medium text-gray-600 dark:text-gray-400 flex-shrink-0">
        {label}:
      </span>
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right break-all">
        {value}
      </span>
    </div>
  );
}

