'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navigation from '@/components/navigation';
import FileUploader from '@/components/upload/file-uploader';
import SecurityLabelForm from '@/components/upload/security-label-form';

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

  const userClearance = session.user?.clearance || 'UNCLASSIFIED';
  const userCountry = session.user?.countryOfAffiliation || 'USA';

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

  return (
    <div className="min-h-screen bg-gray-50">
      {session?.user && <Navigation user={session.user} />}

      <main className="max-w-5xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              📤 Upload Classified Document
            </h2>
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

          {/* User Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              📋 Your Upload Permissions
            </h3>
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-blue-700 mb-1">Your Clearance</dt>
                <dd className="font-mono font-semibold text-blue-900">{userClearance}</dd>
              </div>
              <div>
                <dt className="text-blue-700 mb-1">Your Country</dt>
                <dd className="font-mono font-semibold text-blue-900">{userCountry}</dd>
              </div>
              <div>
                <dt className="text-blue-700 mb-1">Max Classification</dt>
                <dd className="font-mono font-semibold text-blue-900">{userClearance}</dd>
              </div>
            </dl>
            <p className="text-xs text-blue-700 mt-2">
              ⚠️ You can only upload documents at or below your clearance level.
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-semibold text-red-900 mb-1">Upload Error</h4>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Upload Form */}
          <div className="space-y-6">
            {/* Step 1: File Selection */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Step 1: Select File
              </h3>
              <FileUploader file={file} onFileSelect={setFile} />
            </div>

            {/* Step 2: Security Classification */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Step 2: Set Security Classification
              </h3>
              <SecurityLabelForm
                userClearance={userClearance}
                userCountry={userCountry}
                classification={classification}
                releasabilityTo={releasabilityTo}
                COI={COI}
                caveats={caveats}
                title={title}
                description={description}
                onClassificationChange={setClassification}
                onReleasabilityChange={setReleasabilityTo}
                onCOIChange={setCOI}
                onCaveatsChange={setCaveats}
                onTitleChange={setTitle}
                onDescriptionChange={setDescription}
              />
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Uploading and Encrypting...
                </h3>
                <div className="space-y-3">
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 text-center">
                    {uploadProgress < 50 && 'Uploading file...'}
                    {uploadProgress >= 50 && uploadProgress < 90 && 'Converting to ZTDF format...'}
                    {uploadProgress >= 90 && uploadProgress < 100 && 'Finalizing...'}
                    {uploadProgress === 100 && '✓ Upload complete! Redirecting...'}
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <Link
                href="/resources"
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
              <button
                onClick={handleUpload}
                disabled={!canUpload}
                className={`px-6 py-2 rounded-md text-sm font-semibold ${
                  canUpload
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {uploading ? 'Uploading...' : '🔒 Upload Document'}
              </button>
            </div>
          </div>

          {/* Help Text */}
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-yellow-900 mb-2">
              ℹ️ About Secure Upload
            </h3>
            <p className="text-sm text-yellow-800">
              Your uploaded document will be:
            </p>
            <ul className="list-disc list-inside text-sm text-yellow-800 mt-2 space-y-1">
              <li><strong>Encrypted</strong> with AES-256-GCM</li>
              <li><strong>Labeled</strong> with STANAG 4774 security markings</li>
              <li><strong>Bound</strong> with STANAG 4778 cryptographic integrity</li>
              <li><strong>Stored</strong> in ZTDF format with policy enforcement</li>
              <li><strong>Logged</strong> per ACP-240 audit requirements</li>
            </ul>
            <p className="text-xs text-yellow-700 mt-2">
              Access to your uploaded document will be controlled by OPA policies based on clearance, country, and COI.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

