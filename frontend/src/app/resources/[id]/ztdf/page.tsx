'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Tab } from '@headlessui/react';
import PageLayout from '@/components/layout/page-layout';
import KASFlowVisualizer from '@/components/ztdf/KASFlowVisualizer';
import KASExplainer from '@/components/ztdf/KASExplainer';

// ============================================
// Type Definitions
// ============================================

interface IZTDFManifest {
  objectId: string;
  objectType: string;
  version: string;
  contentType: string;
  payloadSize: number;
  owner: string;
  ownerOrganization: string;
  createdAt: string;
  modifiedAt: string;
}

interface ISecurityLabel {
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  caveats: string[];
  originatingCountry: string;
  creationDate: string;
  displayMarking: string;
  // ACP-240 Section 4.3: Classification Equivalency
  originalClassification?: string;
  originalCountry?: string;
  natoEquivalent?: string;
}

interface IPolicyAssertion {
  type: string;
  value: any;
  condition?: string;
}

interface IZTDFPolicy {
  policyVersion: string;
  policyHash: string;
  policyHashValid: boolean;
  securityLabel: ISecurityLabel;
  policyAssertions: IPolicyAssertion[];
}

interface IKeyAccessObject {
  kaoId: string;
  kasUrl: string;
  kasId: string;
  wrappingAlgorithm: string;
  policyBinding: {
    clearanceRequired: string;
    countriesAllowed: string[];
    coiRequired: string[];
  };
  createdAt: string;
}

interface IEncryptedChunk {
  chunkId: number;
  size: number;
  integrityHash: string;
  integrityHashValid: boolean;
}

interface IZTDFPayload {
  encryptionAlgorithm: string;
  iv: string;
  authTag: string;
  payloadHash: string;
  payloadHashValid: boolean;
  keyAccessObjects: IKeyAccessObject[];
  encryptedChunks: IEncryptedChunk[];
}

interface IIntegrityStatus {
  overallValid: boolean;
  policyHashValid: boolean;
  payloadHashValid: boolean;
  allChunkHashesValid: boolean;
  validationTimestamp: string;
  issues: string[];
  errors: string[];
  warnings: string[];
}

interface IZTDFDetails {
  resourceId: string;
  title: string;
  ztdfDetails: {
    manifest: IZTDFManifest;
    policy: IZTDFPolicy;
    payload: IZTDFPayload;
    integrityStatus: IIntegrityStatus;
  };
}

// ============================================
// Classification Color Mapping
// ============================================

const classificationColors: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-300',
  'CONFIDENTIAL': 'bg-blue-100 text-blue-800 border-blue-300',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-300',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-300',
};

// ============================================
// Helper Components
// ============================================

// Animated validation icon with micro-interactions
function ValidationIcon({ valid }: { valid: boolean }) {
  return valid ? (
    <div className="animate-bounce-subtle">
      <svg className="h-5 w-5 text-green-600 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  ) : (
    <div className="animate-shake">
      <svg className="h-5 w-5 text-red-600 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  );
}

// NEW: Animated section reveal component
function AnimatedSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div 
      className={`transition-all duration-700 ease-out transform ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      {children}
    </div>
  );
}

// NEW: Info tooltip for educational context
function InfoTooltip({ content }: { content: string }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setShowTooltip(!showTooltip);
    }
    if (e.key === 'Escape') {
      setShowTooltip(false);
    }
  };
  
  return (
    <span className="relative inline-block ml-2">
      <span
        role="button"
        tabIndex={0}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => {
          e.stopPropagation();
          setShowTooltip(!showTooltip);
        }}
        onKeyDown={handleKeyDown}
        className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-blue-600 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="More information"
        aria-expanded={showTooltip}
      >
        ?
      </span>
      {showTooltip && (
        <div className="absolute z-50 w-64 p-3 text-sm text-white bg-gray-900 rounded-lg shadow-lg -top-2 left-8 animate-fadeIn">
          <div className="relative">
            {content}
            <div className="absolute w-2 h-2 bg-gray-900 transform rotate-45 -left-4 top-3"></div>
          </div>
        </div>
      )}
    </span>
  );
}

// Enhanced copy button with animation
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center px-2 py-1 text-xs font-medium border rounded transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
        copied 
          ? 'bg-green-50 text-green-700 border-green-300 scale-105' 
          : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 hover:scale-105'
      }`}
      title={label || 'Copy to clipboard'}
    >
      {copied ? (
        <>
          <svg className="h-3 w-3 mr-1 animate-bounce-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

// NEW: Offline Decryption Guide Component
function OfflineDecryptionGuide({ manifest, payload }: { manifest: IZTDFManifest; payload: IZTDFPayload }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <AnimatedSection delay={200}>
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-6 flex items-center justify-between hover:bg-purple-100/50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-purple-600 text-white rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="text-left">
              <h3 className="text-lg font-bold text-purple-900 flex items-center">
                📥 How to Decrypt This File Outside DIVE V3
                <InfoTooltip content="Learn how to decrypt this TDF file on your local machine using command-line tools or SDKs" />
              </h3>
              <p className="text-sm text-purple-700 mt-1">
                Download and decrypt locally using OpenTDF tools
              </p>
            </div>
          </div>
          <div className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
            <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-6 pb-6 space-y-6 animate-slideDown">
            {/* Prerequisites */}
            <div className="bg-white rounded-lg p-5 border border-purple-200">
              <h4 className="font-bold text-purple-900 mb-3 flex items-center">
                <span className="text-2xl mr-2">📋</span>
                Prerequisites
              </h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start">
                  <span className="text-purple-600 mr-2 mt-1">✓</span>
                  <span><strong>Valid credentials:</strong> You must have the same clearance, country affiliation, and COI as required by the policy</span>
                </li>
                <li className="flex items-start">
                  <span className="text-purple-600 mr-2 mt-1">✓</span>
                  <span><strong>Network access:</strong> Ability to reach the KAS endpoint: <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">{payload.keyAccessObjects[0]?.kasUrl || 'KAS URL'}</code></span>
                </li>
                <li className="flex items-start">
                  <span className="text-purple-600 mr-2 mt-1">✓</span>
                  <span><strong>OpenTDF CLI or SDK:</strong> Install the OpenTDF command-line tool or use a supported SDK</span>
                </li>
              </ul>
            </div>

            {/* Step 1: Download the File */}
            <div className="bg-white rounded-lg p-5 border border-purple-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-purple-900 flex items-center">
                  <span className="bg-purple-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm mr-2">1</span>
                  Download the Encrypted File
                </h4>
              </div>
              <p className="text-sm text-gray-700 mb-3">
                First, download the encrypted TDF file to your local machine:
              </p>
              <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-green-400">$ </span>
                  <CopyButton 
                    text={`curl -H "Authorization: Bearer YOUR_TOKEN" \\\n  "${process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000'}/api/resources/${manifest.objectId}/download" \\\n  -o ${manifest.objectId}.tdf`}
                    label="Copy download command"
                  />
                </div>
                <code className="text-xs">
                  curl -H "Authorization: Bearer YOUR_TOKEN" \<br/>
                  &nbsp;&nbsp;"${process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000'}/api/resources/{manifest.objectId}/download" \<br/>
                  &nbsp;&nbsp;-o {manifest.objectId}.tdf
                </code>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                💡 Replace <code className="bg-gray-100 px-1 rounded">YOUR_TOKEN</code> with your DIVE V3 access token
              </p>
            </div>

            {/* Step 2: Install OpenTDF CLI */}
            <div className="bg-white rounded-lg p-5 border border-purple-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-purple-900 flex items-center">
                  <span className="bg-purple-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm mr-2">2</span>
                  Install OpenTDF CLI
                </h4>
              </div>
              <p className="text-sm text-gray-700 mb-3">
                Install the OpenTDF command-line tool (requires Node.js 18+ or Python 3.9+):
              </p>
              
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Option A: NPM (Node.js)</p>
                  <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-green-400">$ </span>
                      <CopyButton text="npm install -g @opentdf/cli" />
                    </div>
                    <code>npm install -g @opentdf/cli</code>
                  </div>
                </div>
                
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Option B: Python (pip)</p>
                  <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-green-400">$ </span>
                      <CopyButton text="pip install opentdf" />
                    </div>
                    <code>pip install opentdf</code>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Decrypt the File */}
            <div className="bg-white rounded-lg p-5 border border-purple-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-purple-900 flex items-center">
                  <span className="bg-purple-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm mr-2">3</span>
                  Decrypt the File
                </h4>
              </div>
              <p className="text-sm text-gray-700 mb-3">
                Run the decryption command. OpenTDF will automatically contact KAS to request the decryption key:
              </p>
              <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-green-400">$ </span>
                  <CopyButton 
                    text={`opentdf decrypt \\\n  --input ${manifest.objectId}.tdf \\\n  --output ${manifest.objectId}_decrypted.${manifest.contentType.split('/')[1] || 'txt'} \\\n  --auth-token YOUR_TOKEN`}
                  />
                </div>
                <code className="text-xs">
                  opentdf decrypt \<br/>
                  &nbsp;&nbsp;--input {manifest.objectId}.tdf \<br/>
                  &nbsp;&nbsp;--output {manifest.objectId}_decrypted.{manifest.contentType.split('/')[1] || 'txt'} \<br/>
                  &nbsp;&nbsp;--auth-token YOUR_TOKEN
                </code>
              </div>
            </div>

            {/* What Happens During Decryption */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-5">
              <h4 className="font-bold text-blue-900 mb-3 flex items-center">
                <span className="text-2xl mr-2">🔄</span>
                What Happens During Decryption?
              </h4>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-start">
                  <span className="text-blue-600 font-bold mr-2">1.</span>
                  <span>OpenTDF CLI reads the TDF file and extracts the Key Access Object (KAO)</span>
                </div>
                <div className="flex items-start">
                  <span className="text-blue-600 font-bold mr-2">2.</span>
                  <span>CLI contacts the KAS endpoint specified in the KAO: <code className="bg-white px-1 py-0.5 rounded text-xs font-mono">{payload.keyAccessObjects[0]?.kasUrl || 'KAS URL'}</code></span>
                </div>
                <div className="flex items-start">
                  <span className="text-blue-600 font-bold mr-2">3.</span>
                  <span>KAS re-evaluates the policy using your credentials (from <code className="bg-white px-1 py-0.5 rounded text-xs">YOUR_TOKEN</code>)</span>
                </div>
                <div className="flex items-start">
                  <span className="text-blue-600 font-bold mr-2">4.</span>
                  <span>If authorized, KAS unwraps and releases the Data Encryption Key (DEK)</span>
                </div>
                <div className="flex items-start">
                  <span className="text-blue-600 font-bold mr-2">5.</span>
                  <span>CLI decrypts the content using the DEK and AES-256-GCM algorithm</span>
                </div>
                <div className="flex items-start">
                  <span className="text-green-600 font-bold mr-2">✓</span>
                  <span>Plaintext content is written to the output file</span>
                </div>
              </div>
            </div>

            {/* Troubleshooting */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5">
              <h4 className="font-bold text-yellow-900 mb-3 flex items-center">
                <span className="text-2xl mr-2">⚠️</span>
                Common Issues & Solutions
              </h4>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-semibold text-gray-900">Error: "KAS denied key access"</p>
                  <p className="text-gray-700">
                    ➜ Your credentials don't meet the policy requirements. Check that your token has:
                  </p>
                  <ul className="list-disc list-inside ml-4 text-xs text-gray-600 mt-1">
                    <li>Clearance ≥ <span className="font-semibold">{payload.keyAccessObjects[0]?.policyBinding.clearanceRequired || 'REQUIRED_LEVEL'}</span></li>
                    <li>Country in: <span className="font-semibold">{payload.keyAccessObjects[0]?.policyBinding.countriesAllowed.join(', ') || 'ALLOWED_COUNTRIES'}</span></li>
                    {payload.keyAccessObjects[0]?.policyBinding.coiRequired && payload.keyAccessObjects[0].policyBinding.coiRequired.length > 0 && (
                      <li>COI includes: <span className="font-semibold">{payload.keyAccessObjects[0].policyBinding.coiRequired.join(', ')}</span></li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Error: "Cannot reach KAS"</p>
                  <p className="text-gray-700 text-xs">
                    ➜ Check your network connection and firewall settings. KAS may be behind a VPN or require specific network access.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Error: "Invalid token"</p>
                  <p className="text-gray-700 text-xs">
                    ➜ Your access token may have expired. Log in to DIVE V3 again to get a fresh token.
                  </p>
                </div>
              </div>
            </div>

            {/* SDK Options */}
            <div className="bg-white rounded-lg p-5 border border-purple-200">
              <h4 className="font-bold text-purple-900 mb-3 flex items-center">
                <span className="text-2xl mr-2">🔧</span>
                Programmatic Decryption (SDKs)
              </h4>
              <p className="text-sm text-gray-700 mb-3">
                For application integration, use OpenTDF SDKs:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-gray-50 rounded p-3 border border-gray-200">
                  <p className="font-semibold text-gray-900 mb-1">JavaScript / TypeScript</p>
                  <code className="text-xs text-gray-600">@opentdf/client</code>
                  <a 
                    href="https://github.com/opentdf/client-web" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-600 hover:underline mt-1"
                  >
                    View docs →
                  </a>
                </div>
                <div className="bg-gray-50 rounded p-3 border border-gray-200">
                  <p className="font-semibold text-gray-900 mb-1">Python</p>
                  <code className="text-xs text-gray-600">opentdf</code>
                  <a 
                    href="https://github.com/opentdf/client-python" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-600 hover:underline mt-1"
                  >
                    View docs →
                  </a>
                </div>
                <div className="bg-gray-50 rounded p-3 border border-gray-200">
                  <p className="font-semibold text-gray-900 mb-1">Go</p>
                  <code className="text-xs text-gray-600">github.com/opentdf/client-go</code>
                  <a 
                    href="https://github.com/opentdf/platform" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-600 hover:underline mt-1"
                  >
                    View docs →
                  </a>
                </div>
              </div>
            </div>

            {/* Learn More */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg p-4">
              <p className="font-semibold mb-2 flex items-center">
                <span className="text-2xl mr-2">📚</span>
                Learn More About OpenTDF
              </p>
              <p className="text-sm text-purple-100 mb-3">
                OpenTDF is an open-source framework for protecting data with cryptographically-bound access policies.
              </p>
              <div className="flex flex-wrap gap-2">
                <a 
                  href="https://opentdf.io" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1.5 bg-white text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-50 transition-colors"
                >
                  OpenTDF Website
                  <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                <a 
                  href="https://github.com/opentdf" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1.5 bg-white text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-50 transition-colors"
                >
                  GitHub
                  <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </AnimatedSection>
  );
}

function HashDisplay({ hash, valid, label }: { hash: string; valid: boolean; label: string }) {
  const shortHash = `${hash.substring(0, 16)}...${hash.substring(hash.length - 16)}`;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center space-x-2">
          <ValidationIcon valid={valid} />
          <span className={`text-sm font-medium ${valid ? 'text-green-600' : 'text-red-600'}`}>
            {valid ? 'Valid' : 'Invalid'}
          </span>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded text-xs font-mono break-all">
          {expanded ? hash : shortHash}
        </code>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
        <CopyButton text={hash} />
      </div>
    </div>
  );
}

// ============================================
// Tab Panel Components
// ============================================

// NEW: Overview Panel - High-level summary of the ZTDF
function OverviewPanel({ ztdfDetails, details }: { ztdfDetails: IZTDFDetails; details: any }) {
  return (
    <div className="space-y-6">
      {/* Hero Section - What is this? */}
      <AnimatedSection delay={0}>
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg p-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-flex items-center px-3 py-1 bg-white/20 rounded-full text-sm font-semibold mb-3">
                🔐 Zero Trust Data Format (ZTDF)
              </div>
              <h2 className="text-3xl font-bold mb-3">{ztdfDetails.title}</h2>
              <p className="text-blue-100 text-lg mb-4 max-w-2xl">
                This document is protected using policy-bound encryption. The security policy travels with the encrypted content, 
                ensuring continuous enforcement of access controls.
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center bg-white/10 rounded-lg px-4 py-2">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-sm font-medium">Policy-Bound</span>
                </div>
                <div className="flex items-center bg-white/10 rounded-lg px-4 py-2">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm font-medium">AES-256-GCM Encrypted</span>
                </div>
                <div className="flex items-center bg-white/10 rounded-lg px-4 py-2">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium">Integrity Verified</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Quick Facts Grid */}
      <AnimatedSection delay={100}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Classification Card */}
          <div className="bg-white rounded-lg border-2 border-gray-200 p-5 hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-600 uppercase">Classification</h3>
              <InfoTooltip content="The security level required to access this content. Higher classifications require higher clearances." />
            </div>
            <div className={`inline-flex items-center px-4 py-2 rounded-md border font-bold text-lg ${
              classificationColors[details.policy.securityLabel.classification] || 'bg-gray-100 text-gray-800'
            }`}>
              {details.policy.securityLabel.classification}
            </div>
            <p className="mt-3 text-xs text-gray-600">
              {details.policy.securityLabel.classification === 'TOP_SECRET' && 
                'Exceptionally grave damage if disclosed'}
              {details.policy.securityLabel.classification === 'SECRET' && 
                'Serious damage if disclosed'}
              {details.policy.securityLabel.classification === 'CONFIDENTIAL' && 
                'Damage if disclosed'}
              {details.policy.securityLabel.classification === 'UNCLASSIFIED' && 
                'Publicly releasable'}
            </p>
          </div>

          {/* Releasability Card */}
          <div className="bg-white rounded-lg border-2 border-gray-200 p-5 hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-600 uppercase">Releasable To</h3>
              <InfoTooltip content="Only users from these countries can access this document, even if they have the right clearance." />
            </div>
            <div className="flex flex-wrap gap-2">
              {details.policy.securityLabel.releasabilityTo.map((country: string) => (
                <span
                  key={country}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800 border border-blue-300"
                >
                  {country}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-600">
              {details.policy.securityLabel.releasabilityTo.length} {details.policy.securityLabel.releasabilityTo.length === 1 ? 'country' : 'countries'} authorized
            </p>
          </div>

          {/* Encryption Status Card */}
          <div className="bg-white rounded-lg border-2 border-gray-200 p-5 hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-600 uppercase">Encryption Status</h3>
              <InfoTooltip content="This document uses military-grade encryption with key access controlled by a separate service." />
            </div>
            <div className="flex items-center space-x-2 mb-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-green-600">Protected</p>
                <p className="text-xs text-gray-600">{details.payload.encryptionAlgorithm}</p>
              </div>
            </div>
            <p className="text-xs text-gray-600">
              {details.payload.keyAccessObjects.length} KAS {details.payload.keyAccessObjects.length === 1 ? 'endpoint' : 'endpoints'}
            </p>
          </div>
        </div>
      </AnimatedSection>

      {/* How This Works */}
      <AnimatedSection delay={200}>
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-lg p-6">
          <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center">
            <span className="text-3xl mr-3">💡</span>
            How Zero Trust Data Format Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Traditional Encryption</h4>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-start">
                  <span className="text-red-500 mr-2">✗</span>
                  <span>Policy checked once at download</span>
                </div>
                <div className="flex items-start">
                  <span className="text-red-500 mr-2">✗</span>
                  <span>Key stored with encrypted data</span>
                </div>
                <div className="flex items-start">
                  <span className="text-red-500 mr-2">✗</span>
                  <span>Can't revoke after sharing</span>
                </div>
                <div className="flex items-start">
                  <span className="text-red-500 mr-2">✗</span>
                  <span>Stolen data can be decrypted offline</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border-2 border-green-300 p-4">
              <h4 className="font-semibold text-green-900 mb-3">ZTDF (This Document)</h4>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-start">
                  <span className="text-green-600 mr-2">✓</span>
                  <span>Policy enforced at encryption AND decryption</span>
                </div>
                <div className="flex items-start">
                  <span className="text-green-600 mr-2">✓</span>
                  <span>Key separated from data (KAS manages keys)</span>
                </div>
                <div className="flex items-start">
                  <span className="text-green-600 mr-2">✓</span>
                  <span>Can revoke access even after download</span>
                </div>
                <div className="flex items-start">
                  <span className="text-green-600 mr-2">✓</span>
                  <span>Stolen data useless without KAS approval</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Technical Summary */}
      <AnimatedSection delay={300}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Standards Compliance */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Standards Compliance
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="font-medium text-gray-700">STANAG 4774</span>
                <span className="text-xs text-gray-600">Security Labeling</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="font-medium text-gray-700">STANAG 4778</span>
                <span className="text-xs text-gray-600">Cryptographic Binding</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="font-medium text-gray-700">ACP-240</span>
                <span className="text-xs text-gray-600">Access Control Policy</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="font-medium text-gray-700">OpenTDF</span>
                <span className="text-xs text-gray-600">Open Standard</span>
              </div>
            </div>
          </div>

          {/* File Information */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              File Information
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <dt className="font-medium text-gray-700">Object ID:</dt>
                <dd className="text-gray-600 font-mono text-xs">{details.manifest.objectId.substring(0, 16)}...</dd>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <dt className="font-medium text-gray-700">Content Type:</dt>
                <dd className="text-gray-600">{details.manifest.contentType}</dd>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <dt className="font-medium text-gray-700">Size:</dt>
                <dd className="text-gray-600">{Math.round(details.manifest.payloadSize / 1024)} KB</dd>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <dt className="font-medium text-gray-700">Created:</dt>
                <dd className="text-gray-600">{new Date(details.manifest.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      </AnimatedSection>

      {/* Quick Actions */}
      <AnimatedSection delay={400}>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Explore This ZTDF</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button 
              onClick={() => document.querySelector<HTMLButtonElement>('button[role="tab"]:nth-child(3)')?.click()}
              className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg hover:shadow-md transition-all duration-300 group"
            >
              <div className="text-left">
                <p className="font-semibold text-gray-900 mb-1">Security Policy</p>
                <p className="text-xs text-gray-600">View access rules</p>
              </div>
              <svg className="w-5 h-5 text-blue-600 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            <button 
              onClick={() => document.querySelector<HTMLButtonElement>('button[role="tab"]:nth-child(4)')?.click()}
              className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg hover:shadow-md transition-all duration-300 group"
            >
              <div className="text-left">
                <p className="font-semibold text-gray-900 mb-1">Encryption Details</p>
                <p className="text-xs text-gray-600">View crypto info</p>
              </div>
              <svg className="w-5 h-5 text-green-600 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            <button 
              onClick={() => document.querySelector<HTMLButtonElement>('button[role="tab"]:nth-child(7)')?.click()}
              className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg hover:shadow-md transition-all duration-300 group"
            >
              <div className="text-left">
                <p className="font-semibold text-gray-900 mb-1">Offline Decryption</p>
                <p className="text-xs text-gray-600">Download & decrypt</p>
              </div>
              <svg className="w-5 h-5 text-purple-600 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}

function ManifestPanel({ manifest }: { manifest: IZTDFManifest }) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <svg className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          Object Metadata
        </h3>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Object ID</dt>
            <dd className="mt-1 text-sm text-gray-900 font-mono">{manifest.objectId}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Object Type</dt>
            <dd className="mt-1 text-sm text-gray-900">{manifest.objectType}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">ZTDF Version</dt>
            <dd className="mt-1 text-sm text-gray-900">{manifest.version}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Content Type</dt>
            <dd className="mt-1 text-sm text-gray-900">{manifest.contentType}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Payload Size</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatBytes(manifest.payloadSize)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Owner</dt>
            <dd className="mt-1 text-sm text-gray-900">{manifest.owner}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Organization</dt>
            <dd className="mt-1 text-sm text-gray-900">{manifest.ownerOrganization}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {new Date(manifest.createdAt).toLocaleString()}
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-sm font-medium text-gray-500">Last Modified</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {new Date(manifest.modifiedAt).toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function PolicyPanel({ policy }: { policy: IZTDFPolicy }) {
  return (
    <div className="space-y-6">
      {/* Policy Hash */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <svg className="h-5 w-5 mr-2 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Policy Integrity (STANAG 4778)
        </h3>
        <HashDisplay 
          hash={policy.policyHash} 
          valid={policy.policyHashValid} 
          label="Policy Hash (SHA-384)" 
        />
        <p className="mt-3 text-xs text-gray-500">
          The policy hash ensures that security labels and assertions haven't been tampered with after creation.
        </p>
      </div>

      {/* Security Label */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Security Label (STANAG 4774)
        </h3>
        
        {/* Display Marking */}
        <div className="mb-6 p-4 bg-gray-50 border-2 border-gray-300 rounded">
          <p className="text-xs font-medium text-gray-500 mb-2">DISPLAY MARKING</p>
          <p className="text-lg font-bold text-gray-900 font-mono">
            {policy.securityLabel.displayMarking}
          </p>
        </div>

        {/* Classification */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 block mb-2">Classification Level</label>
          <span className={`inline-flex items-center px-4 py-2 rounded-md border font-semibold text-sm ${
            classificationColors[policy.securityLabel.classification] || 'bg-gray-100 text-gray-800'
          }`}>
            {policy.securityLabel.classification}
          </span>
          <p className="mt-2 text-xs text-gray-500">
            {policy.securityLabel.classification === 'TOP_SECRET' && 
              'Unauthorized disclosure could cause exceptionally grave damage to national security'}
            {policy.securityLabel.classification === 'SECRET' && 
              'Unauthorized disclosure could cause serious damage to national security'}
            {policy.securityLabel.classification === 'CONFIDENTIAL' && 
              'Unauthorized disclosure could cause damage to national security'}
            {policy.securityLabel.classification === 'UNCLASSIFIED' && 
              'Not classified - publicly releasable information'}
          </p>
        </div>

        {/* Releasability */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 block mb-2">
            Releasable To (Countries)
          </label>
          <div className="flex flex-wrap gap-2">
            {policy.securityLabel.releasabilityTo.map((country) => (
              <span
                key={country}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-300"
              >
                {country}
              </span>
            ))}
          </div>
        </div>

        {/* Communities of Interest */}
        {policy.securityLabel.COI && policy.securityLabel.COI.length > 0 && (
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Communities of Interest (COI)
            </label>
            <div className="flex flex-wrap gap-2">
              {policy.securityLabel.COI.map((coi) => (
                <span
                  key={coi}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 border border-purple-300"
                >
                  {coi}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Caveats */}
        {policy.securityLabel.caveats && policy.securityLabel.caveats.length > 0 && (
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 block mb-2">Caveats</label>
            <div className="flex flex-wrap gap-2">
              {policy.securityLabel.caveats.map((caveat, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-300"
                >
                  {caveat}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Classification Equivalency (ACP-240 Section 4.3) */}
        {(policy.securityLabel.originalClassification || policy.securityLabel.originalCountry || policy.securityLabel.natoEquivalent) && (
          <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
              <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              Classification Equivalency (ACP-240 Section 4.3)
            </h4>
            <p className="text-xs text-blue-800 mb-3">
              NATO standard for coalition interoperability - original classification preserved with NATO equivalent
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {policy.securityLabel.originalClassification && (
                <div className="bg-white rounded-md p-3 border border-blue-300">
                  <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Original Classification</label>
                  <p className="text-sm font-bold text-gray-900">{policy.securityLabel.originalClassification}</p>
                  {policy.securityLabel.originalCountry && (
                    <p className="text-xs text-gray-600 mt-1">from {policy.securityLabel.originalCountry}</p>
                  )}
                </div>
              )}
              
              {policy.securityLabel.natoEquivalent && (
                <div className="bg-white rounded-md p-3 border border-blue-300">
                  <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">NATO Equivalent</label>
                  <p className="text-sm font-bold text-gray-900">{policy.securityLabel.natoEquivalent}</p>
                  <p className="text-xs text-gray-600 mt-1">standardized level</p>
                </div>
              )}
              
              <div className="bg-white rounded-md p-3 border border-blue-300">
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Current (DIVE V3)</label>
                <p className="text-sm font-bold text-gray-900">{policy.securityLabel.classification}</p>
                <p className="text-xs text-gray-600 mt-1">normalized level</p>
              </div>
            </div>
            
            <div className="mt-3 flex items-center gap-2 text-xs text-blue-700">
              <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span>
                Classification equivalency enables interoperability across {policy.securityLabel.originalCountry || 'coalition'} and NATO classification systems.
              </span>
            </div>
          </div>
        )}

        {/* Origin & Date */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Originating Country</label>
            <p className="text-sm text-gray-900">{policy.securityLabel.originatingCountry}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Creation Date</label>
            <p className="text-sm text-gray-900">
              {new Date(policy.securityLabel.creationDate).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Policy Assertions */}
      {policy.policyAssertions && policy.policyAssertions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Policy Assertions</h3>
          <div className="space-y-3">
            {policy.policyAssertions.map((assertion, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{assertion.type}</span>
                </div>
                <pre className="text-xs text-gray-600 font-mono">
                  {JSON.stringify(assertion.value, null, 2)}
                </pre>
                {assertion.condition && (
                  <p className="mt-1 text-xs text-gray-500">Condition: {assertion.condition}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PayloadPanel({ payload }: { payload: IZTDFPayload }) {
  return (
    <div className="space-y-6">
      {/* Encryption Details */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <svg className="h-5 w-5 mr-2 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Encryption Details
        </h3>
        <dl className="grid grid-cols-1 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Algorithm</dt>
            <dd className="mt-1 text-sm text-gray-900 font-mono">{payload.encryptionAlgorithm}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Initialization Vector (IV)</dt>
            <dd className="mt-1 text-xs text-gray-900 font-mono break-all flex items-center justify-between">
              <span>{payload.iv}</span>
              <CopyButton text={payload.iv} />
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Authentication Tag</dt>
            <dd className="mt-1 text-xs text-gray-900 font-mono break-all flex items-center justify-between">
              <span>{payload.authTag}</span>
              <CopyButton text={payload.authTag} />
            </dd>
          </div>
        </dl>
      </div>

      {/* Payload Hash */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payload Integrity</h3>
        <HashDisplay 
          hash={payload.payloadHash} 
          valid={payload.payloadHashValid} 
          label="Payload Hash (SHA-384)" 
        />
      </div>

      {/* Key Access Objects */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Key Access Objects (KAOs)
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          KAOs store the wrapped Data Encryption Key (DEK). Access requires KAS policy re-evaluation.
        </p>
        <div className="space-y-4">
          {payload.keyAccessObjects.map((kao) => (
            <div key={kao.kaoId} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500">KAO ID</label>
                  <p className="text-sm text-gray-900 font-mono">{kao.kaoId}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">KAS URL</label>
                  <p className="text-sm text-gray-900 font-mono">{kao.kasUrl}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">KAS ID</label>
                  <p className="text-sm text-gray-900">{kao.kasId}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Wrapping Algorithm</label>
                  <p className="text-sm text-gray-900">{kao.wrappingAlgorithm}</p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-500 block mb-2">Policy Binding</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Clearance Required</label>
                      <p className="text-sm text-gray-900">{kao.policyBinding.clearanceRequired}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Countries Allowed</label>
                      <p className="text-sm text-gray-900">{kao.policyBinding.countriesAllowed.join(', ')}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">COI Required</label>
                      <p className="text-sm text-gray-900">
                        {kao.policyBinding.coiRequired.length > 0 
                          ? kao.policyBinding.coiRequired.join(', ') 
                          : 'None'}
                      </p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Created</label>
                  <p className="text-sm text-gray-900">
                    {new Date(kao.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Encrypted Chunks */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Encrypted Payload Chunks</h3>
        <div className="space-y-3">
          {payload.encryptedChunks.map((chunk) => (
            <div key={chunk.chunkId} className="p-3 border border-gray-200 rounded bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-700">Chunk {chunk.chunkId}</span>
                  <span className="text-xs text-gray-500">
                    {Math.round(chunk.size / 1024)} KB
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <ValidationIcon valid={chunk.integrityHashValid} />
                  <span className={`text-xs font-medium ${
                    chunk.integrityHashValid ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {chunk.integrityHashValid ? 'Valid' : 'Invalid'}
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-600 font-mono break-all">
                {chunk.integrityHash.substring(0, 64)}...
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegrityPanel({ integrityStatus }: { integrityStatus: IIntegrityStatus }) {
  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className={`rounded-lg border-2 p-6 ${
        integrityStatus.overallValid 
          ? 'bg-green-50 border-green-300' 
          : 'bg-red-50 border-red-300'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Overall Integrity Status</h3>
          <div className="flex items-center space-x-2">
            {integrityStatus.overallValid ? (
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className={`text-xl font-bold ${
              integrityStatus.overallValid ? 'text-green-600' : 'text-red-600'
            }`}>
              {integrityStatus.overallValid ? 'VALID' : 'INVALID'}
            </span>
          </div>
        </div>
        <p className="text-sm text-gray-700">
          Validated: {new Date(integrityStatus.validationTimestamp).toLocaleString()}
        </p>
      </div>

      {/* Individual Checks */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Hash Verification Results</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div>
              <p className="font-medium text-gray-900">Policy Hash (STANAG 4778)</p>
              <p className="text-sm text-gray-600">Verifies policy section integrity</p>
            </div>
            <div className="flex items-center space-x-2">
              <ValidationIcon valid={integrityStatus.policyHashValid} />
              <span className={`font-medium ${
                integrityStatus.policyHashValid ? 'text-green-600' : 'text-red-600'
              }`}>
                {integrityStatus.policyHashValid ? 'PASS' : 'FAIL'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div>
              <p className="font-medium text-gray-900">Payload Hash</p>
              <p className="text-sm text-gray-600">Verifies encrypted content integrity</p>
            </div>
            <div className="flex items-center space-x-2">
              <ValidationIcon valid={integrityStatus.payloadHashValid} />
              <span className={`font-medium ${
                integrityStatus.payloadHashValid ? 'text-green-600' : 'text-red-600'
              }`}>
                {integrityStatus.payloadHashValid ? 'PASS' : 'FAIL'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div>
              <p className="font-medium text-gray-900">All Chunk Hashes</p>
              <p className="text-sm text-gray-600">Verifies individual chunk integrity</p>
            </div>
            <div className="flex items-center space-x-2">
              <ValidationIcon valid={integrityStatus.allChunkHashesValid} />
              <span className={`font-medium ${
                integrityStatus.allChunkHashesValid ? 'text-green-600' : 'text-red-600'
              }`}>
                {integrityStatus.allChunkHashesValid ? 'PASS' : 'FAIL'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Issues */}
      {integrityStatus.issues && integrityStatus.issues.length > 0 && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-900 mb-3 flex items-center">
            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Integrity Issues Detected
          </h3>
          <ul className="space-y-2">
            {integrityStatus.issues.map((issue, idx) => (
              <li key={idx} className="flex items-start">
                <span className="text-red-600 mr-2">•</span>
                <span className="text-sm text-red-800">{issue}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 p-3 bg-red-100 rounded border border-red-300">
            <p className="text-sm font-medium text-red-900">
              ⚠️ STANAG 4778 Cryptographic Binding Broken
            </p>
            <p className="text-xs text-red-800 mt-1">
              Access should be denied per fail-closed policy. This resource may have been tampered with.
            </p>
          </div>
        </div>
      )}

      {/* Errors & Warnings */}
      {integrityStatus.errors && integrityStatus.errors.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Validation Errors</h3>
          <ul className="space-y-1">
            {integrityStatus.errors.map((error, idx) => (
              <li key={idx} className="text-sm text-red-600">• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {integrityStatus.warnings && integrityStatus.warnings.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Warnings</h3>
          <ul className="space-y-1">
            {integrityStatus.warnings.map((warning, idx) => (
              <li key={idx} className="text-sm text-yellow-600">• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Success Message */}
      {integrityStatus.overallValid && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-6">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-lg font-semibold text-green-900 mb-2">
                Integrity Verified
              </h3>
              <p className="text-sm text-green-800">
                All cryptographic hashes match their expected values. This ZTDF resource has not been 
                tampered with and complies with STANAG 4778 cryptographic binding requirements.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function ZTDFInspectorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const resourceId = params?.id as string;

  const [ztdfDetails, setZtdfDetails] = useState<IZTDFDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Redirect to login if not authenticated (separate effect to avoid render-phase updates)
  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      return;
    }

    async function fetchZTDFDetails() {
      try {
        // Call server-side API route (NO client-side tokens!)
        const response = await fetch(`/api/resources/${resourceId}/ztdf`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData.message || 'Failed to fetch ZTDF details');
          setZtdfDetails(null);
        } else {
          const data = await response.json();
          setZtdfDetails(data);
          setError(null);
        }
      } catch (err) {
        setError('Network error: Failed to fetch ZTDF details');
      } finally {
        setLoading(false);
      }
    }

    fetchZTDFDetails();
  }, [session, status, router, resourceId]);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading ZTDF details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md">
          <svg className="h-12 w-12 text-red-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Error</h2>
          <p className="text-gray-600 text-center mb-4">{error}</p>
          <Link
            href={`/resources/${resourceId}`}
            className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Resource
          </Link>
        </div>
      </div>
    );
  }

  if (!ztdfDetails) {
    return null;
  }

  const { ztdfDetails: details } = ztdfDetails;

  return (
    <PageLayout
      user={session?.user || {}}
      breadcrumbs={[
        { label: 'Resources', href: '/resources' },
        { label: resourceId, href: `/resources/${resourceId}` },
        { label: 'ZTDF Inspector', href: null }
      ]}
      maxWidth="7xl"
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              href={`/resources/${resourceId}`}
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
            >
              <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Resource
            </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">ZTDF Inspector</h1>
                <p className="text-sm text-gray-600 mt-1">{ztdfDetails.title}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {details.integrityStatus.overallValid ? (
                <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-300">
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Valid Integrity
                </span>
              ) : (
                <span className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-300">
                  <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Invalid Integrity
                </span>
              )}
            </div>
          </div>
        </div>

      {/* Tabs */}
      <Tab.Group>
          <Tab.List className="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-6">
            {['Overview', 'Manifest', 'Policy', 'Payload', 'Integrity', 'KAS Flow', 'Offline Decryption'].map((category) => (
              <Tab
                key={category}
                className={({ selected }) =>
                  `w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all duration-300
                  ${selected
                    ? 'bg-white text-blue-700 shadow-lg scale-105'
                    : 'text-blue-600 hover:bg-white/[0.12] hover:text-blue-700 hover:scale-102'
                  }`
                }
              >
                {category}
              </Tab>
            ))}
          </Tab.List>
          <Tab.Panels>
            {/* NEW: Overview Tab */}
            <Tab.Panel>
              <OverviewPanel 
                ztdfDetails={ztdfDetails} 
                details={details}
              />
            </Tab.Panel>
            <Tab.Panel>
              <ManifestPanel manifest={details.manifest} />
            </Tab.Panel>
            <Tab.Panel>
              <PolicyPanel policy={details.policy} />
            </Tab.Panel>
            <Tab.Panel>
              <PayloadPanel payload={details.payload} />
            </Tab.Panel>
            <Tab.Panel>
              <IntegrityPanel integrityStatus={details.integrityStatus} />
            </Tab.Panel>
            <Tab.Panel>
              <div className="space-y-6">
                <KASExplainer />
                <KASFlowVisualizer resourceId={ztdfDetails.resourceId} />
              </div>
            </Tab.Panel>
            {/* NEW: Offline Decryption Tab */}
            <Tab.Panel>
              <OfflineDecryptionGuide manifest={details.manifest} payload={details.payload} />
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
    </PageLayout>
  );
}
