'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Tab } from '@headlessui/react';

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

function ValidationIcon({ valid }: { valid: boolean }) {
  return valid ? (
    <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ) : (
    <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

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
      className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      title={label || 'Copy to clipboard'}
    >
      <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      {copied ? 'Copied!' : 'Copy'}
    </button>
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

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/login');
      return;
    }

    async function fetchZTDFDetails() {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const accessToken = (session as any)?.accessToken;

      if (!accessToken) {
        setError('No access token available');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${backendUrl}/api/resources/${resourceId}/ztdf`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tab.Group>
          <Tab.List className="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-6">
            {['Manifest', 'Policy', 'Payload', 'Integrity'].map((category) => (
              <Tab
                key={category}
                className={({ selected }) =>
                  `w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all
                  ${selected
                    ? 'bg-white text-blue-700 shadow'
                    : 'text-blue-600 hover:bg-white/[0.12] hover:text-blue-700'
                  }`
                }
              >
                {category}
              </Tab>
            ))}
          </Tab.List>
          <Tab.Panels>
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
          </Tab.Panels>
        </Tab.Group>
      </div>
    </div>
  );
}

