/**
 * DIVE V3 - Current Bundle Card
 * 
 * Displays current policy bundle metadata including version, hash,
 * signature status, and file manifest.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Hash,
  Clock,
  FileText,
  Shield,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Copy,
  Check,
  RefreshCw,
  User,
} from 'lucide-react';
import { IBundleMetadata } from '@/types/federation.types';

interface CurrentBundleCardProps {
  bundle: IBundleMetadata | null;
  loading?: boolean;
  onRefresh?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function CurrentBundleCard({ bundle, loading, onRefresh }: CurrentBundleCardProps) {
  const [showFiles, setShowFiles] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          <div className="flex-1">
            <div className="h-5 bg-slate-200 rounded w-40 mb-2" />
            <div className="h-4 bg-slate-200 rounded w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6">
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No Bundle Available</p>
          <p className="text-sm text-slate-500 mt-1">
            Build a bundle to see its details here
          </p>
        </div>
      </div>
    );
  }

  const isSigned = !!bundle.signedAt;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Current Bundle</h3>
            <p className="text-sm text-slate-500">
              Version {bundle.version}
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        )}
      </div>

      {/* Signature Status */}
      <div className={`flex items-center gap-3 p-4 rounded-xl mb-4 ${
        isSigned
          ? 'bg-emerald-50 border border-emerald-200'
          : 'bg-amber-50 border border-amber-200'
      }`}>
        {isSigned ? (
          <>
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-emerald-800">Cryptographically Signed</p>
              <div className="flex items-center gap-4 text-sm text-emerald-600 mt-1">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {bundle.signedBy || 'DIVE Hub'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(bundle.signedAt)}
                </span>
              </div>
            </div>
            <Shield className="w-8 h-8 text-emerald-400" />
          </>
        ) : (
          <>
            <XCircle className="w-6 h-6 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium text-amber-800">Not Signed</p>
              <p className="text-sm text-amber-600">Bundle should be signed before publishing</p>
            </div>
          </>
        )}
      </div>

      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Bundle ID */}
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase">Bundle ID</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-slate-700 truncate flex-1">
              {bundle.bundleId.slice(0, 16)}...
            </code>
            <button
              onClick={() => handleCopy(bundle.bundleId, 'bundleId')}
              className="p-1 hover:bg-slate-200 rounded transition-colors"
            >
              {copied === 'bundleId' ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {/* Hash */}
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase">Content Hash</span>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-slate-700 truncate flex-1">
              {bundle.hash.slice(0, 16)}...
            </code>
            <button
              onClick={() => handleCopy(bundle.hash, 'hash')}
              className="p-1 hover:bg-slate-200 rounded transition-colors"
            >
              {copied === 'hash' ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {/* Size */}
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase">Bundle Size</span>
          </div>
          <p className="text-lg font-bold text-slate-800">
            {formatBytes(bundle.size)}
          </p>
        </div>

        {/* File Count */}
        <div className="p-4 bg-slate-50 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-500 uppercase">Files</span>
          </div>
          <p className="text-lg font-bold text-slate-800">
            {bundle.manifest?.files?.length || 0}
          </p>
        </div>
      </div>

      {/* Scopes */}
      <div className="mb-4">
        <p className="text-xs font-medium text-slate-500 uppercase mb-2">Included Scopes</p>
        <div className="flex flex-wrap gap-2">
          {bundle.scopes.map((scope) => (
            <span
              key={scope}
              className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-200"
            >
              {scope.replace('policy:', '')}
            </span>
          ))}
        </div>
      </div>

      {/* File List Toggle */}
      {bundle.manifest?.files && bundle.manifest.files.length > 0 && (
        <div>
          <button
            onClick={() => setShowFiles(!showFiles)}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showFiles ? 'rotate-180' : ''}`} />
            {showFiles ? 'Hide' : 'Show'} File Manifest ({bundle.manifest.files.length} files)
          </button>

          <AnimatePresence>
            {showFiles && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 max-h-48 overflow-y-auto bg-slate-50 rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-slate-600">File</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-600">Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {bundle.manifest.files.map((file, index) => (
                        <tr key={index} className="hover:bg-slate-100">
                          <td className="py-2 px-3 font-mono text-xs text-slate-700">{file.path}</td>
                          <td className="py-2 px-3 text-right text-slate-500 text-xs">
                            {formatBytes(file.size)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

export default CurrentBundleCard;

