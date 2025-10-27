'use client';

import { useState, Fragment, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useSession } from 'next-auth/react';
import { useDropzone } from 'react-dropzone';

interface UploadPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type UploadState = 'idle' | 'uploading' | 'validating' | 'success' | 'error';

export default function UploadPolicyModal({ isOpen, onClose, onSuccess }: UploadPolicyModalProps) {
  console.log('[UploadPolicyModal] RENDER - isOpen:', isOpen);
  
  const { data: session } = useSession();
  const [state, setState] = useState<UploadState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [standardsLens, setStandardsLens] = useState<'5663' | '240' | 'unified'>('unified');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [uploadedPolicyId, setUploadedPolicyId] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    console.log('[UploadPolicyModal] onDrop called with files:', acceptedFiles);
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      console.log('[UploadPolicyModal] File selected:', selectedFile.name, selectedFile.size, selectedFile.type);
      setFile(selectedFile);
      
      // Auto-fill name from filename
      if (!name) {
        const filename = selectedFile.name.replace(/\.(rego|xml)$/, '');
        setName(filename);
        console.log('[UploadPolicyModal] Auto-filled name:', filename);
      }
    }
  }, [name]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.rego'],
      'application/xml': ['.xml'],
    },
    maxSize: 256 * 1024, // 256KB
    maxFiles: 1,
    multiple: false,
    disabled: state === 'uploading' || state === 'validating',
    noClick: false,
    noKeyboard: false
  });
  
  console.log('[UploadPolicyModal] Dropzone state - isDragActive:', isDragActive, 'disabled:', state === 'uploading' || state === 'validating');

  const handleUpload = async () => {
    if (!file || !name) {
      setValidationErrors(['Please select a file and provide a policy name']);
      return;
    }

    setState('uploading');
    setValidationErrors([]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify({
        name,
        description,
        standardsLens
      }));

      const response = await fetch('/api/policies-lab/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setState('error');
        setValidationErrors(data.validationErrors || [data.message || 'Upload failed']);
        return;
      }

      if (!data.validated) {
        setState('error');
        setValidationErrors(data.validationErrors || ['Policy validation failed']);
        return;
      }

      setState('success');
      setUploadedPolicyId(data.policyId);
      
      // Wait 2 seconds to show success, then close and refresh
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 2000);

    } catch (error) {
      setState('error');
      setValidationErrors(['Network error: ' + (error instanceof Error ? error.message : 'Unknown error')]);
    }
  };

  const handleClose = () => {
    setState('idle');
    setFile(null);
    setName('');
    setDescription('');
    setStandardsLens('unified');
    setValidationErrors([]);
    setUploadedPolicyId('');
    onClose();
  };

  const getPolicyType = (): 'rego' | 'xacml' | null => {
    if (!file) return null;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'rego') return 'rego';
    if (extension === 'xml') return 'xacml';
    return null;
  };

  const policyType = getPolicyType();

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-2xl font-bold leading-6 text-gray-900 mb-4">
                  📤 Upload Policy
                </Dialog.Title>

                {state === 'success' ? (
                  // Success State
                  <div className="text-center py-8">
                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                      <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h4 className="text-xl font-semibold text-gray-900 mb-2">
                      ✅ Policy Uploaded Successfully
                    </h4>
                    <p className="text-gray-600 mb-2">
                      Policy ID: <code className="bg-gray-100 px-2 py-1 rounded">{uploadedPolicyId}</code>
                    </p>
                    <p className="text-sm text-gray-500">
                      Redirecting to policy list...
                    </p>
                  </div>
                ) : (
                  // Upload Form
                  <div className="space-y-6">
                    {/* File Input */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Policy File *
                      </label>
                      <div
                        {...getRootProps()}
                        onClick={() => console.log('[UploadPolicyModal] Dropzone CLICKED')}
                        className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors cursor-pointer ${
                          isDragActive
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-blue-400 bg-white'
                        }`}
                      >
                        <input {...getInputProps()} onClick={() => console.log('[UploadPolicyModal] Input CLICKED')} />
                        <div className="space-y-1 text-center w-full">
                          {file ? (
                            <div className="flex items-center justify-center space-x-2">
                              <span className="text-2xl">
                                {policyType === 'rego' ? '📝' : '📄'}
                              </span>
                              <div className="text-left">
                                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                                <p className="text-xs text-gray-500">
                                  {(file.size / 1024).toFixed(2)} KB
                                  {policyType && (
                                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                      {policyType.toUpperCase()}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('[UploadPolicyModal] Remove file clicked');
                                  setFile(null);
                                }}
                                className="text-red-600 hover:text-red-800"
                                aria-label="Remove file"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              {isDragActive ? (
                                <p className="text-lg text-blue-600 font-medium">Drop file here...</p>
                              ) : (
                                <>
                                  <p className="text-sm font-medium text-blue-600">
                                    📁 Click here or drag and drop
                                  </p>
                                  <p className="text-xs text-gray-500">.rego or .xml up to 256KB</p>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Policy Name */}
                    <div>
                      <label htmlFor="policy-name" className="block text-sm font-medium text-gray-700 mb-1">
                        Policy Name *
                      </label>
                      <input
                        type="text"
                        id="policy-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="My Test Policy"
                        disabled={state === 'uploading' || state === 'validating'}
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label htmlFor="policy-description" className="block text-sm font-medium text-gray-700 mb-1">
                        Description (optional)
                      </label>
                      <textarea
                        id="policy-description"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="Clearance-based access control with releasability checks"
                        disabled={state === 'uploading' || state === 'validating'}
                      />
                    </div>

                    {/* Standards Lens */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Standards Lens (optional)
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { value: '5663', label: 'Federation (5663)', color: 'blue' },
                          { value: 'unified', label: 'Unified', color: 'purple' },
                          { value: '240', label: 'Object (240)', color: 'amber' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setStandardsLens(option.value as any)}
                            className={`px-4 py-2 border-2 rounded-md text-sm font-medium transition-colors ${
                              standardsLens === option.value
                                ? `border-${option.color}-500 bg-${option.color}-50 text-${option.color}-700`
                                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                            }`}
                            disabled={state === 'uploading' || state === 'validating'}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Validation Errors */}
                    {validationErrors.length > 0 && (
                      <div className="rounded-md bg-red-50 p-4">
                        <div className="flex">
                          <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800">
                              Validation Error{validationErrors.length > 1 ? 's' : ''}
                            </h3>
                            <div className="mt-2 text-sm text-red-700">
                              <ul className="list-disc list-inside space-y-1">
                                {validationErrors.map((error, index) => (
                                  <li key={index}>{error}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        disabled={state === 'uploading' || state === 'validating'}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleUpload}
                        disabled={!file || !name || state === 'uploading' || state === 'validating'}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {state === 'uploading' || state === 'validating' ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {state === 'uploading' ? 'Uploading...' : 'Validating...'}
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            Upload & Validate
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

