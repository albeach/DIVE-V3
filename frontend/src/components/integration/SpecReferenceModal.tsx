"use client";

import { useEffect } from "react";
import { Node } from "reactflow";
import { X, BookOpen, ExternalLink } from "lucide-react";

interface NodeData {
  label: string;
  standard: "5663" | "240" | "Both";
  specRef: string;
  description: string;
}

interface SpecReferenceModalProps {
  node: Node<NodeData>;
  onClose: () => void;
}

/**
 * Spec Reference Modal Component
 * 
 * Displays detailed spec reference when a node is clicked:
 * - Node label and standard (5663/240/Both)
 * - Spec section reference
 * - Description
 * - Link to full spec (if available)
 * 
 * Features:
 * - ESC key to close
 * - Click outside to close
 * - Keyboard accessible (focus trap)
 * - Smooth fade-in animation
 */
export function SpecReferenceModal({ node, onClose }: SpecReferenceModalProps) {
  const { data } = node;

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // Get color scheme based on standard
  const colorScheme = {
    "5663": {
      bg: "from-indigo-500 to-blue-500",
      text: "text-indigo-900 dark:text-indigo-100",
      border: "border-indigo-200 dark:border-indigo-700",
      badge: "bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200",
    },
    "240": {
      bg: "from-amber-500 to-red-500",
      text: "text-amber-900 dark:text-amber-100",
      border: "border-amber-200 dark:border-amber-700",
      badge: "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200",
    },
    "Both": {
      bg: "from-teal-500 to-cyan-500",
      text: "text-teal-900 dark:text-teal-100",
      border: "border-teal-200 dark:border-teal-700",
      badge: "bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200",
    },
  }[data.standard];

  // Get spec document name
  const specName = data.specRef.startsWith("ACP-240") 
    ? "ACP-240 (Data-Centric Security)" 
    : data.specRef.startsWith("§") 
    ? "ADatP-5663 (ICAM)" 
    : "Integration Spec";

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${colorScheme.bg} text-white p-6 rounded-t-xl relative`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 id="modal-title" className="text-2xl font-bold mb-1">
                {data.label}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-sm opacity-90">{specName}</span>
                {data.standard !== "Both" && (
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
                    {data.standard === "5663" ? "Federation" : "Object"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Spec Reference */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Specification Reference
            </h3>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${colorScheme.badge} font-mono text-sm`}>
              <BookOpen className="w-4 h-4" />
              {data.specRef}
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Description
            </h3>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              {data.description}
            </p>
          </div>

          {/* Standard Info */}
          <div className={`border ${colorScheme.border} rounded-lg p-4`}>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Governed By
            </h3>
            <div className="space-y-2">
              {(data.standard === "5663" || data.standard === "Both") && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      ADatP-5663: Identity, Credential and Access Management
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Federated identity, authentication protocols (OIDC/OAuth/SAML), 
                      subject attributes, AAL/FAL assurance levels
                    </p>
                  </div>
                </div>
              )}
              {(data.standard === "240" || data.standard === "Both") && (
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full mt-1.5" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      ACP-240: Data-Centric Security
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      ZTDF structure, KAS mediation, cryptographic binding (STANAG 4778), 
                      policy-bound encryption
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Implementation Notes */}
          {node.id === "pdp" && (
            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-teal-900 dark:text-teal-100 mb-2">
                💡 Integration Point
              </h3>
              <p className="text-sm text-teal-800 dark:text-teal-200">
                The Policy Decision Point (PDP) is the <strong>shared ABAC kernel</strong> where 
                federation attributes from ADatP-5663 (issuer, clearance, AAL) combine with 
                object attributes from ACP-240 (classification, releasabilityTo, ZTDF integrity) 
                to make authorization decisions.
              </p>
            </div>
          )}

          {/* Related Components */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              DIVE V3 Implementation
            </h3>
            <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              {node.id === "idp" && (
                <>
                  <li>• Keycloak (11 realms: 10 NATO nations + broker)</li>
                  <li>• Protocol mappers for attribute normalization</li>
                  <li>• JWT/SAML token issuance with AAL2 enforcement</li>
                </>
              )}
              {node.id === "pep" && (
                <>
                  <li>• Express.js middleware: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">authz.middleware.ts</code></li>
                  <li>• JWT signature validation (JWKS)</li>
                  <li>• Dual-issuer support (pilot + broker realms)</li>
                </>
              )}
              {node.id === "pdp" && (
                <>
                  <li>• OPA v0.68+ with Rego policies</li>
                  <li>• 172 policy tests passing</li>
                  <li>• Decision cache (60s TTL)</li>
                </>
              )}
              {node.id === "kas" && (
                <>
                  <li>• Node.js service on port 8080</li>
                  <li>• Policy re-evaluation before key release</li>
                  <li>• Multi-KAS + COI-based community keys</li>
                </>
              )}
              {node.id === "ztdf" && (
                <>
                  <li>• MongoDB resource metadata store</li>
                  <li>• STANAG 4774/4778 policy binding</li>
                  <li>• Classification equivalency (12 nations)</li>
                </>
              )}
              {node.id === "mongo" && (
                <>
                  <li>• Resource schema with classification, releasabilityTo, COI</li>
                  <li>• Original classification preservation</li>
                  <li>• Indexes on resourceId, classification</li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-b-xl flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Close
          </button>
          <a
            href={data.specRef.startsWith("ACP-240") 
              ? "/notes/ACP240-llms.txt" 
              : "/notes/ADatP-5663_ICAM_EdA_v1_LLM.md"
            }
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${colorScheme.bg} text-white rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
          >
            View Full Spec
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

