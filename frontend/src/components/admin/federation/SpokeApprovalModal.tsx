/**
 * DIVE V3 - Spoke Approval Modal
 * 
 * Modal for approving spoke registrations with trust configuration.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Globe2,
  Lock,
  Key,
  Info,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {
  ISpoke,
  IApprovalRequest,
  TrustLevel,
  ClassificationLevel,
  DataIsolationLevel,
  POLICY_SCOPES,
  TRUST_LEVELS,
  CLASSIFICATION_LEVELS,
  DATA_ISOLATION_LEVELS,
} from '@/types/federation.types';

interface SpokeApprovalModalProps {
  spoke: ISpoke | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (spokeId: string, request: IApprovalRequest) => Promise<void>;
}

// Country flags mapping
const COUNTRY_FLAGS: Record<string, string> = {
  'USA': '🇺🇸',
  'FRA': '🇫🇷',
  'GBR': '🇬🇧',
  'DEU': '🇩🇪',
  'NZL': '🇳🇿',
  'AUS': '🇦🇺',
  'CAN': '🇨🇦',
  'JPN': '🇯🇵',
};

export function SpokeApprovalModal({
  spoke,
  isOpen,
  onClose,
  onApprove,
}: SpokeApprovalModalProps) {
  const [trustLevel, setTrustLevel] = useState<TrustLevel>('partner');
  const [maxClassification, setMaxClassification] = useState<ClassificationLevel>('SECRET');
  const [dataIsolation, setDataIsolation] = useState<DataIsolationLevel>('filtered');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['policy:base']);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScopeToggle = (scopeId: string) => {
    if (scopeId === 'policy:base') return; // Base is always required
    
    setSelectedScopes(prev =>
      prev.includes(scopeId)
        ? prev.filter(s => s !== scopeId)
        : [...prev, scopeId]
    );
  };

  const handleSubmit = async () => {
    if (!spoke) return;
    
    setIsSubmitting(true);
    setError(null);

    try {
      await onApprove(spoke.spokeId, {
        allowedScopes: selectedScopes,
        trustLevel,
        maxClassification,
        dataIsolationLevel: dataIsolation,
        notes: notes || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve spoke');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!spoke) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[700px] md:max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{COUNTRY_FLAGS[spoke.instanceCode] || '🌐'}</span>
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      Approve Spoke Registration
                    </h2>
                    <p className="text-emerald-100 text-sm">
                      {spoke.instanceCode} — {spoke.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Spoke Info */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Contact Email</span>
                    <p className="font-medium text-gray-900 dark:text-white">{spoke.contactEmail}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Registered</span>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {new Date(spoke.registeredAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Base URL</span>
                    <a
                      href={spoke.baseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
                    >
                      {spoke.baseUrl}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Trust Level */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <Shield className="w-4 h-4" />
                  Trust Level
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {TRUST_LEVELS.map((level) => (
                    <button
                      key={level.id}
                      onClick={() => setTrustLevel(level.id)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        trustLevel === level.id
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {level.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {level.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Classification */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <Lock className="w-4 h-4" />
                  Maximum Classification
                </label>
                <div className="flex flex-wrap gap-2">
                  {CLASSIFICATION_LEVELS.map((level) => (
                    <button
                      key={level.id}
                      onClick={() => setMaxClassification(level.id)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                        maxClassification === level.id
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data Isolation */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <Globe2 className="w-4 h-4" />
                  Data Isolation Level
                </label>
                <div className="space-y-2">
                  {DATA_ISOLATION_LEVELS.map((level) => (
                    <button
                      key={level.id}
                      onClick={() => setDataIsolation(level.id)}
                      className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                        dataIsolation === level.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {level.label}
                        </span>
                        <span className="text-xs text-gray-500">{level.description}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Policy Scopes */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  <Key className="w-4 h-4" />
                  Policy Scopes
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {POLICY_SCOPES.map((scope) => (
                    <label
                      key={scope.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                        selectedScopes.includes(scope.id)
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      } ${scope.required ? 'opacity-75' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope.id)}
                        onChange={() => handleScopeToggle(scope.id)}
                        disabled={scope.required}
                        className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {scope.label}
                          </span>
                          {scope.required && (
                            <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">
                              Required
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{scope.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  <Info className="w-4 h-4" />
                  Approval Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this approval..."
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300"
                >
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  {selectedScopes.length} scopes selected
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl disabled:opacity-50 transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Approve Spoke
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default SpokeApprovalModal;

