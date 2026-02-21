"use client";

import { useState } from "react";
import { Copy, Check, Key, Shield, Globe } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import { Highlight, themes } from "prism-react-renderer";

/**
 * Federation Visualizer (JWT Lens) Component
 * 
 * Split panel showing:
 * - Left: Raw JWT (syntax highlighted)
 * - Right: Parsed claims (human-readable with provenance tags)
 * - Bottom: Trust chain graph (Issuer → Cert → Root → Valid)
 * 
 * Features:
 * - Syntax highlighting (Prism)
 * - Copy button for raw JWT
 * - Attribute provenance tags (IdP / AA / Derived)
 * - Trust chain visualization
 * 
 * @see ADatP-5663 §4.4 Minimum Subject Attributes
 * @see ADatP-5663 §5.1.3 Token Issuance and Claims
 * @see ADatP-5663 §3.6 PKI Requirements
 */
export function JWTLens() {
  const [copied, setCopied] = useState(false);

  // Mock JWT (realistic structure)
  const mockJWT = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRpdmUtdjMtdXNhLWtleTEifQ.eyJpc3MiOiJodHRwczovL2tleWNsb2FrOjgwODAvcmVhbG1zL2RpdmUtdjMtdXNhIiwic3ViIjoiam9obi5kb2VAbWlsIiwidW5pcXVlSUQiOiJqb2huLmRvZUBtaWwiLCJjbGVhcmFuY2UiOiJTRUNSRVQiLCJjb3VudHJ5T2ZBZmZpbGlhdGlvbiI6IlVTQSIsImFjcENPSSI6WyJGVkVZIiwiTkFUTyJdLCJhdXRoX3RpbWUiOjE2OTgzNDU2MDAsImFjciI6ImFhbDIiLCJhbXIiOlsicHdkIiwib3RwIl0sImV4cCI6MTY5ODM0OTIwMCwiaWF0IjoxNjk4MzQ1NjAwLCJhdWQiOiJkaXZlLXYzLWNsaWVudC1icm9rZXIifQ.signature_placeholder";

  // Decode JWT
  const decoded = jwtDecode(mockJWT) as any;

  // Split JWT into parts
  const [header, payload, signature] = mockJWT.split(".");
  const decodedHeader = JSON.parse(atob(header));
  
  const rawJWT = JSON.stringify({
    header: decodedHeader,
    payload: decoded,
    signature: signature.substring(0, 20) + "...(truncated)",
  }, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(mockJWT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section 
      className="w-full py-12 px-4 sm:px-6 lg:px-8"
      aria-labelledby="jwt-lens-title"
    >
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h2 
          id="jwt-lens-title"
          className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2"
        >
          Federation Visualizer (JWT Lens)
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Raw JWT structure, parsed claims, and trust chain visualization
        </p>
      </div>

      {/* Split Panel */}
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-6 mb-8">
        {/* Left: Raw JWT */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              <h3 className="font-bold">Raw JWT</h3>
            </div>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded transition-colors text-sm"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </button>
          </div>
          
          <div className="p-4 overflow-x-auto">
            <Highlight theme={themes.nightOwl} code={rawJWT} language="json">
              {({ className, style, tokens, getLineProps, getTokenProps }) => (
                <pre className={`${className} text-xs`} style={style}>
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line })}>
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                    </div>
                  ))}
                </pre>
              )}
            </Highlight>
          </div>
        </div>

        {/* Right: Parsed Claims */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white p-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              <h3 className="font-bold">Parsed Claims</h3>
            </div>
          </div>
          
          <div className="p-6 space-y-3">
            <ClaimRow 
              label="issuer" 
              value={decoded.iss} 
              source="IdP" 
              specRef="§4.4: Issuer"
            />
            <ClaimRow 
              label="uniqueID" 
              value={decoded.uniqueID} 
              source="IdP" 
              specRef="§4.4: Unique Identifier"
            />
            <ClaimRow 
              label="clearance" 
              value={decoded.clearance} 
              source="Attribute Authority" 
              specRef="§4.4: Confidentiality Clearance"
            />
            <ClaimRow 
              label="countryOfAffiliation" 
              value={decoded.countryOfAffiliation} 
              source="IdP" 
              specRef="§4.4: Citizenship"
            />
            <ClaimRow 
              label="acpCOI" 
              value={decoded.acpCOI?.join(", ")} 
              source="IdP" 
              specRef="§4.4: Community of Interest"
            />
            <ClaimRow 
              label="auth_time" 
              value={new Date(decoded.auth_time * 1000).toLocaleString()} 
              source="IdP" 
              specRef="§5.1.3: Authentication Time"
            />
            <ClaimRow 
              label="acr" 
              value={decoded.acr} 
              source="Derived" 
              specRef="§5.1.2: AAL"
            />
            <ClaimRow 
              label="amr" 
              value={decoded.amr?.join(" + ")} 
              source="IdP" 
              specRef="§5.1.2: Authentication Methods"
            />
          </div>
        </div>
      </div>

      {/* Trust Chain Graph */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Trust Chain
          </h3>
          
          <div className="flex items-center justify-between gap-4">
            {/* Issuer */}
            <div className="flex-1 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mb-2">
                <Globe className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Issuer</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">dive-v3-usa</div>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Signing Cert */}
            <div className="flex-1 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-2">
                <Key className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Signing Cert</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">RS256</div>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Federation Root */}
            <div className="flex-1 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center mb-2">
                <Shield className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Root CA</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Federation PKI</div>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Validated */}
            <div className="flex-1 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-2">
                <Check className="w-10 h-10 text-green-600 dark:text-green-400 font-bold" />
              </div>
              <div className="font-semibold text-sm text-green-700 dark:text-green-300">Valid</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Trusted</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Claim Row Helper Component
 */
interface ClaimRowProps {
  label: string;
  value: string;
  source: "IdP" | "Attribute Authority" | "Derived";
  specRef: string;
}

function ClaimRow({ label, value, source, specRef }: ClaimRowProps) {
  const sourceColors = {
    "IdP": "bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200",
    "Attribute Authority": "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200",
    "Derived": "bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200",
  };

  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-sm font-mono text-gray-700 dark:text-gray-300">
            {label}
          </code>
          <span 
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceColors[source]}`}
            title={`Source: ${source}`}
          >
            {source}
          </span>
        </div>
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-all">
          {value}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {specRef}
        </div>
      </div>
    </div>
  );
}
