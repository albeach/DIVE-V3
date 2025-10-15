'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageLayout from '@/components/layout/page-layout';
import FileUploader from '@/components/upload/file-uploader';
import SecurityLabelForm from '@/components/upload/security-label-form';

const classificationColors: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-300',
  'CONFIDENTIAL': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-300',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-300',
};

export default function UploadPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [classification, setClassification] = useState('UNCLASSIFIED');
  const [releasabilityTo, setReleasabilityTo] = useState<string[]>(['USA']);
  const [COI, setCOI] = useState<string[]>([]);
  const [caveats, setCaveats] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const userClearance = session?.user?.clearance || 'UNCLASSIFIED';
  const userCountry = session?.user?.countryOfAffiliation || 'USA';
  const userCOI = (session?.user as any)?.acpCOI || [];

  // Generate display marking preview
  const displayMarking = useMemo(() => {
    const parts = [classification];
    if (releasabilityTo.length > 0 && releasabilityTo.length <= 3) {
      parts.push(`REL TO ${releasabilityTo.join(', ')}`);
    }
    if (COI.length > 0) {
      parts.push(COI.join('//'));
    }
    return parts.join('//');
  }, [classification, releasabilityTo, COI]);

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    if (!title.trim()) {
      setError('Please enter a document title');
      return;
    }

    if (releasabilityTo.length === 0) {
      setError('Please select at least one country for releasability');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      // Prepare form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('classification', classification);
      formData.append('releasabilityTo', JSON.stringify(releasabilityTo));
      formData.append('COI', JSON.stringify(COI));
      formData.append('caveats', JSON.stringify(caveats));
      formData.append('title', title.trim());
      if (description.trim()) {
        formData.append('description', description.trim());
      }

      // Upload to backend
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const accessToken = (session as any)?.accessToken;

      const response = await fetch(`${backendUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }

      const result = await response.json();

      // Success! Redirect to the new resource
      setTimeout(() => {
        router.push(`/resources/${result.resourceId}`);
      }, 500);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const canUpload = file && title.trim() && releasabilityTo.length > 0 && !uploading;

  // Redirect to login if not authenticated
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    router.push('/login');
    return null;
  }

  return (
    <PageLayout 
      user={session.user}
      breadcrumbs={[
        { label: 'Upload', href: null }
      ]}
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          📤 Upload Classified Document
        </h1>
        <p className="text-gray-600">
          Upload files with automatic ZTDF encryption and ACP-240 compliance.
          Your document will be encrypted and labeled per STANAG 4774/4778 standards.
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 font-semibold">
            🛡️ ACP-240 Compliant
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded-md bg-purple-100 text-purple-800 font-semibold">
            🔐 ZTDF Format
          </span>
          <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-100 text-green-800 font-semibold">
            ✓ Automatic Encryption
          </span>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-red-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-red-900">Upload Error</h4>
              <p className="text-sm text-red-800 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Two-Column Split Layout: Form + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Upload Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: File Selection */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold mr-3">
                  1
                </span>
                Select File
              </h3>
              {file && (
                <span className="text-sm text-green-600 font-medium">✓ File selected</span>
              )}
            </div>
            <FileUploader file={file} onFileSelect={setFile} />
          </div>

          {/* Step 2: Document Metadata */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold mr-3">
                2
              </span>
              Document Information
            </h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Document Title *
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., NATO Operational Brief - Exercise Eagle"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  disabled={uploading}
                />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of document contents..."
                  rows={3}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  disabled={uploading}
                />
              </div>
            </div>
          </div>

          {/* Step 3: Security Classification */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold mr-3">
                3
              </span>
              Security Classification
            </h3>
            <SecurityLabelForm
              userClearance={userClearance}
              userCountry={userCountry}
              userCOI={userCOI}
              classification={classification}
              releasabilityTo={releasabilityTo}
              COI={COI}
              caveats={caveats}
              onClassificationChange={setClassification}
              onReleasabilityChange={setReleasabilityTo}
              onCOIChange={setCOI}
              onCaveatsChange={setCaveats}
            />
          </div>

          {/* Upload Button */}
          <div className="flex items-center justify-between bg-white shadow rounded-lg p-6">
            <Link
              href="/resources"
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              onClick={handleUpload}
              disabled={!canUpload}
              className={`px-8 py-3 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                canUpload
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </div>

        {/* Right Column: Live Preview + Info (Sticky) */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-6">
            {/* Upload Preview */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600">
                <h3 className="text-sm font-semibold text-white">📋 Upload Preview</h3>
              </div>
              <div className="p-4 space-y-4">
                {/* File Info */}
                <div>
                  <dt className="text-xs font-medium text-gray-500 mb-1">File</dt>
                  <dd className="text-sm text-gray-900">
                    {file ? (
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium text-green-900">{file.name}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">No file selected</span>
                    )}
                  </dd>
                  {file && (
                    <dd className="text-xs text-gray-500 mt-1">
                      {(file.size / 1024).toFixed(2)} KB
                    </dd>
                  )}
                </div>

                {/* Title */}
                <div>
                  <dt className="text-xs font-medium text-gray-500 mb-1">Title</dt>
                  <dd className="text-sm text-gray-900">
                    {title.trim() || <span className="text-gray-400 italic">Not set</span>}
                  </dd>
                </div>

                {/* Display Marking */}
                <div>
                  <dt className="text-xs font-medium text-gray-500 mb-1">STANAG 4774 Display Marking</dt>
                  <dd>
                    <div className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-bold border-2 ${
                      classificationColors[classification]
                    }`}>
                      <span className="mr-1.5">🛡️</span>
                      <span className="font-mono">{displayMarking}</span>
                    </div>
                  </dd>
                </div>

                {/* Classification */}
                <div>
                  <dt className="text-xs font-medium text-gray-500 mb-1">Classification</dt>
                  <dd className="text-sm font-mono font-semibold text-gray-900">{classification}</dd>
                </div>

                {/* Releasability */}
                <div>
                  <dt className="text-xs font-medium text-gray-500 mb-1">Releasable To</dt>
                  <dd className="text-sm font-mono text-gray-900">
                    {releasabilityTo.length > 0 ? releasabilityTo.join(', ') : 'None'}
                  </dd>
                </div>

                {/* COI */}
                {COI.length > 0 && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">Communities of Interest</dt>
                    <dd className="text-sm font-mono text-gray-900">{COI.join(', ')}</dd>
                  </div>
                )}

                {/* Encryption Status */}
                <div>
                  <dt className="text-xs font-medium text-gray-500 mb-1">Encryption</dt>
                  <dd className="flex items-center gap-2 text-sm">
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-purple-100 text-purple-800 font-semibold">
                      🔐 ZTDF
                    </span>
                    <span className="text-xs text-gray-600">AES-256-GCM</span>
                  </dd>
                </div>
              </div>
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="bg-white shadow rounded-lg p-4 border-2 border-blue-300 animate-pulse">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Upload Progress
                </h4>
                <div className="space-y-3">
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-900">
                      {uploadProgress < 30 && '📤 Uploading file...'}
                      {uploadProgress >= 30 && uploadProgress < 60 && '🔐 Encrypting with ZTDF...'}
                      {uploadProgress >= 60 && uploadProgress < 90 && '🛡️ Generating security labels...'}
                      {uploadProgress >= 90 && uploadProgress < 100 && '✓ Finalizing...'}
                      {uploadProgress === 100 && '✅ Complete! Redirecting...'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{uploadProgress}%</p>
                  </div>
                </div>
              </div>
            )}

            {/* Your Upload Permissions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">
                📋 Your Upload Permissions
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-blue-700">Your Clearance:</dt>
                  <dd className="font-mono font-semibold text-blue-900">{userClearance}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-blue-700">Your Country:</dt>
                  <dd className="font-mono font-semibold text-blue-900">{userCountry}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-blue-700">Max Classification:</dt>
                  <dd className="font-mono font-semibold text-blue-900">{userClearance}</dd>
                </div>
              </dl>
              <p className="text-xs text-blue-700 mt-3 pt-3 border-t border-blue-200">
                ⚠️ You can only upload documents at or below your clearance level.
              </p>
            </div>

            {/* What Happens Next */}
            <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-yellow-900 mb-2">
                🔄 What Happens Next?
              </h3>
              <ol className="text-xs text-yellow-800 space-y-2">
                <li className="flex items-start">
                  <span className="font-bold mr-2">1.</span>
                  <span>File uploaded to secure backend</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">2.</span>
                  <span>Content encrypted with AES-256-GCM</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">3.</span>
                  <span>Converted to ZTDF v1.2 format</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">4.</span>
                  <span>Security labels applied (STANAG 4774)</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">5.</span>
                  <span>Cryptographic binding created (STANAG 4778)</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">6.</span>
                  <span>KAS policy object embedded</span>
                </li>
                <li className="flex items-start">
                  <span className="font-bold mr-2">7.</span>
                  <span>Audit log created (ACP-240)</span>
                </li>
              </ol>
            </div>

            {/* Security Standards */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">
                🛡️ Security Standards Applied
              </h4>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                  ACP-240
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                  ZTDF v1.2
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  STANAG 4774
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                  STANAG 4778
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                  KAS Ready
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
