/**
 * File Upload Example Page
 *
 * Demonstrates the ModernFileUpload component with various configurations
 * for different classification levels and use cases.
 *
 * @version 1.0.0
 * @date 2026-01-30
 */

'use client';

import React, { useState } from 'react';
import { ModernFileUpload } from '@/components/upload/ModernFileUpload';
import { motion } from 'framer-motion';
import { Shield, CheckCircle } from 'lucide-react';

export default function FileUploadExamplePage() {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleUpload = async (files: File[]) => {
    console.log('Uploading files:', files);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // In production, call your backend API:
    // const formData = new FormData();
    // files.forEach((file) => formData.append('files', file));
    // await fetch('/api/upload', { method: 'POST', body: formData });

    setUploadStatus('success');

    setTimeout(() => setUploadStatus('idle'), 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-blue-950 dark:to-purple-950">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Modern File Upload
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Drag and drop files or click to browse. Supports multiple files,
            progress tracking, and classification-aware validation.
          </p>
        </motion.div>

        {/* Success Message */}
        {uploadStatus === 'success' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="max-w-3xl mx-auto mb-8 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3"
          >
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            <p className="text-green-800 dark:text-green-200 font-medium">
              Files uploaded successfully!
            </p>
          </motion.div>
        )}

        {/* Upload Component */}
        <ModernFileUpload
          accept={['.pdf', '.docx', '.doc', '.txt', '.jpg', '.jpeg', '.png', '.mp4', '.mov']}
          maxSize={100 * 1024 * 1024} // 100MB
          maxFiles={10}
          onUpload={handleUpload}
          classificationLevel="SECRET"
        />

        {/* Examples Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-16 max-w-3xl mx-auto"
        >
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            Classification Levels
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Unclassified */}
            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  UNCLASSIFIED
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                General files with no restrictions
              </p>
            </div>

            {/* Confidential */}
            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  CONFIDENTIAL
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Requires AAL2 (MFA) authentication
              </p>
            </div>

            {/* Secret */}
            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  SECRET
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Requires AAL2+ and clearance verification
              </p>
            </div>

            {/* Top Secret */}
            <div className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  TOP SECRET
                </h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Requires AAL3 (WebAuthn) and top clearance
              </p>
            </div>
          </div>
        </motion.div>

        {/* Features Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-12 max-w-3xl mx-auto"
        >
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            Features
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
              <div className="text-3xl mb-2">🎯</div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                Drag & Drop
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Intuitive file selection
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
              <div className="text-3xl mb-2">⚡</div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                Progress Tracking
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Real-time upload status
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
              <div className="text-3xl mb-2">🔒</div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                Secure Validation
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Classification-aware checks
              </p>
            </div>
          </div>
        </motion.div>

        {/* Code Example */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12 max-w-3xl mx-auto"
        >
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Usage Example
          </h2>

          <div className="bg-slate-900 rounded-xl p-6 overflow-x-auto">
            <pre className="text-sm text-slate-100">
              <code>{`<ModernFileUpload
  accept={['.pdf', '.docx', '.jpg', '.png']}
  maxSize={100 * 1024 * 1024} // 100MB
  maxFiles={10}
  onUpload={async (files) => {
    // Your upload logic here
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
  }}
  classificationLevel="SECRET"
/>`}</code>
            </pre>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
