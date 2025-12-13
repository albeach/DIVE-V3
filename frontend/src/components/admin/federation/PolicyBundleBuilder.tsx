/**
 * DIVE V3 - Policy Bundle Builder
 * 
 * UI component for building and publishing policy bundles.
 * Supports scope selection, build options, and one-click build+publish.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { BundleScopeSelector } from './BundleScopeSelector';
import { POLICY_SCOPES, IBuildOptions, IBuildResult, IPublishResult } from '@/types/federation.types';

interface PolicyBundleBuilderProps {
  onBuild?: (options: IBuildOptions) => Promise<IBuildResult>;
  onPublish?: () => Promise<IPublishResult>;
  onBuildAndPublish?: (options: IBuildOptions) => Promise<{ build: IBuildResult; publish?: IPublishResult }>;
  disabled?: boolean;
}

interface BuildState {
  phase: 'idle' | 'building' | 'publishing' | 'complete' | 'error';
  buildResult?: IBuildResult;
  publishResult?: IPublishResult;
  error?: string;
}

export function PolicyBundleBuilder({
  onBuild,
  onPublish,
  onBuildAndPublish,
  disabled = false,
}: PolicyBundleBuilderProps) {
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    POLICY_SCOPES.filter((s) => s.required).map((s) => s.id)
  );
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState({
    includeData: true,
    sign: true,
    compress: true,
  });
  const [buildState, setBuildState] = useState<BuildState>({ phase: 'idle' });

  const handleBuild = async () => {
    if (disabled || !onBuild) return;
    
    setBuildState({ phase: 'building' });
    
    try {
      const result = await onBuild({
        scopes: selectedScopes,
        ...options,
      });
      
      if (result.success) {
        setBuildState({ phase: 'complete', buildResult: result });
      } else {
        setBuildState({ phase: 'error', error: result.error || 'Build failed' });
      }
    } catch (error) {
      setBuildState({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Build failed',
      });
    }
  };

  const handlePublish = async () => {
    if (disabled || !onPublish) return;
    
    setBuildState({ phase: 'publishing' });
    
    try {
      const result = await onPublish();
      
      if (result.success) {
        setBuildState((prev) => ({
          ...prev,
          phase: 'complete',
          publishResult: result,
        }));
      } else {
        setBuildState({ phase: 'error', error: result.error || 'Publish failed' });
      }
    } catch (error) {
      setBuildState({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Publish failed',
      });
    }
  };

  const handleBuildAndPublish = async () => {
    if (disabled || !onBuildAndPublish) return;
    
    setBuildState({ phase: 'building' });
    
    try {
      const { build, publish } = await onBuildAndPublish({
        scopes: selectedScopes,
        ...options,
      });
      
      if (build.success && publish?.success) {
        setBuildState({
          phase: 'complete',
          buildResult: build,
          publishResult: publish,
        });
      } else if (!build.success) {
        setBuildState({ phase: 'error', error: build.error || 'Build failed' });
      } else {
        setBuildState({
          phase: 'error',
          buildResult: build,
          error: publish?.error || 'Publish failed',
        });
      }
    } catch (error) {
      setBuildState({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Operation failed',
      });
    }
  };

  const resetState = () => {
    setBuildState({ phase: 'idle' });
  };

  const isProcessing = buildState.phase === 'building' || buildState.phase === 'publishing';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg">
          <Package className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900">Policy Bundle Builder</h3>
          <p className="text-sm text-slate-500">Build and publish policy bundles to spokes</p>
        </div>
      </div>

      {/* Scope Selector */}
      <div className="mb-6">
        <BundleScopeSelector
          selectedScopes={selectedScopes}
          onScopesChange={setSelectedScopes}
          disabled={disabled || isProcessing}
        />
      </div>

      {/* Build Options */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Build Options
          <ChevronDown className={`w-4 h-4 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {showOptions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.sign}
                    onChange={(e) => setOptions({ ...options, sign: e.target.checked })}
                    disabled={disabled || isProcessing}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-slate-700">Sign bundle</span>
                    <p className="text-xs text-slate-500">Cryptographically sign for integrity verification</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.includeData}
                    onChange={(e) => setOptions({ ...options, includeData: e.target.checked })}
                    disabled={disabled || isProcessing}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-slate-700">Include data files</span>
                    <p className="text-xs text-slate-500">Bundle federation data with policies</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.compress}
                    onChange={(e) => setOptions({ ...options, compress: e.target.checked })}
                    disabled={disabled || isProcessing}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-medium text-slate-700">Compress bundle</span>
                    <p className="text-xs text-slate-500">Gzip compression for faster transfers</p>
                  </div>
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Build Status */}
      <AnimatePresence mode="wait">
        {buildState.phase !== 'idle' && (
          <motion.div
            key={buildState.phase}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`mb-6 p-4 rounded-xl border ${
              buildState.phase === 'building' || buildState.phase === 'publishing'
                ? 'bg-blue-50 border-blue-200'
                : buildState.phase === 'complete'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            {buildState.phase === 'building' && (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <span className="font-medium text-blue-800">Building bundle...</span>
              </div>
            )}

            {buildState.phase === 'publishing' && (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <span className="font-medium text-blue-800">Publishing to OPAL...</span>
              </div>
            )}

            {buildState.phase === 'complete' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="font-medium text-emerald-800">Operation Complete</span>
                  </div>
                  <button
                    onClick={resetState}
                    className="text-sm text-emerald-600 hover:text-emerald-700"
                  >
                    Dismiss
                  </button>
                </div>
                
                {buildState.buildResult && (
                  <div className="text-sm text-emerald-700 space-y-1">
                    <p>Version: <strong>{buildState.buildResult.version}</strong></p>
                    <p>Files: <strong>{buildState.buildResult.fileCount}</strong></p>
                    <p>Signed: <strong>{buildState.buildResult.signed ? 'Yes' : 'No'}</strong></p>
                  </div>
                )}
                
                {buildState.publishResult && (
                  <div className="text-sm text-emerald-700 border-t border-emerald-200 pt-2 mt-2">
                    <p>Published at: <strong>{buildState.publishResult.publishedAt}</strong></p>
                  </div>
                )}
              </div>
            )}

            {buildState.phase === 'error' && (
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <span className="font-medium text-red-800">Operation Failed</span>
                    <p className="text-sm text-red-600 mt-1">{buildState.error}</p>
                  </div>
                </div>
                <button
                  onClick={resetState}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Dismiss
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleBuild}
          disabled={disabled || isProcessing || selectedScopes.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing && buildState.phase === 'building' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Package className="w-4 h-4" />
          )}
          Build Bundle
        </button>

        <button
          onClick={handlePublish}
          disabled={disabled || isProcessing || !buildState.buildResult}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-100 text-blue-700 rounded-lg font-medium hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing && buildState.phase === 'publishing' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Publish
        </button>

        <button
          onClick={handleBuildAndPublish}
          disabled={disabled || isProcessing || selectedScopes.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          Build & Publish
        </button>
      </div>

      {/* Warning for no scopes */}
      {selectedScopes.length === 0 && (
        <div className="mt-4 flex items-center gap-2 text-amber-700 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>Select at least one scope to build a bundle</span>
        </div>
      )}
    </motion.div>
  );
}

export default PolicyBundleBuilder;




