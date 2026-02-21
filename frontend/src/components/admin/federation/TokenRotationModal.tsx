/**
 * DIVE V3 - Token Rotation Modal
 *
 * Modal for rotating spoke tokens with confirmation and one-time token display.
 * Follows security best practices by showing the token only once.
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Clock,
  Shield,
  X,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { ISpoke, ITokenRotationResponse } from '@/types/federation.types';

interface TokenRotationModalProps {
  spoke: ISpoke;
  isOpen: boolean;
  onClose: () => void;
  onRotate: (validityDays: number, notifyAdmin: boolean) => Promise<ITokenRotationResponse>;
}

type ModalPhase = 'confirm' | 'rotating' | 'success' | 'error';

const VALIDITY_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
];

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}

function getTokenExpiryInfo(expiresAt?: string): { daysRemaining: number; isExpiring: boolean; isExpired: boolean } {
  if (!expiresAt) {
    return { daysRemaining: 0, isExpiring: false, isExpired: true };
  }

  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    daysRemaining,
    isExpiring: daysRemaining > 0 && daysRemaining <= 7,
    isExpired: daysRemaining <= 0,
  };
}

export function TokenRotationModal({
  spoke,
  isOpen,
  onClose,
  onRotate,
}: TokenRotationModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('confirm');
  const [validityDays, setValidityDays] = useState(30);
  const [notifyAdmin, setNotifyAdmin] = useState(true);
  const [newToken, setNewToken] = useState<ITokenRotationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [confirmedCopy, setConfirmedCopy] = useState(false);

  const tokenExpiryInfo = getTokenExpiryInfo(spoke.tokenExpiresAt);

  const handleRotate = useCallback(async () => {
    setPhase('rotating');
    setError(null);

    try {
      const result = await onRotate(validityDays, notifyAdmin);

      if (result.success && result.token) {
        setNewToken(result);
        setPhase('success');
      } else {
        setError(result.error || 'Token rotation failed');
        setPhase('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token rotation failed');
      setPhase('error');
    }
  }, [validityDays, notifyAdmin, onRotate]);

  const handleCopy = useCallback(async () => {
    if (!newToken?.token) return;

    try {
      await navigator.clipboard.writeText(newToken.token);
      setCopied(true);
      setConfirmedCopy(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy token:', err);
    }
  }, [newToken]);

  const handleClose = useCallback(() => {
    if (phase === 'success' && !confirmedCopy) {
      // Prevent closing without copying
      return;
    }

    // Reset state
    setPhase('confirm');
    setValidityDays(30);
    setNotifyAdmin(true);
    setNewToken(null);
    setError(null);
    setCopied(false);
    setTokenVisible(false);
    setConfirmedCopy(false);
    onClose();
  }, [phase, confirmedCopy, onClose]);

  const handleDoneClick = useCallback(() => {
    if (!confirmedCopy) return;
    handleClose();
  }, [confirmedCopy, handleClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={phase !== 'success' || confirmedCopy ? handleClose : undefined}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Key className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {phase === 'success' ? 'Token Rotated Successfully' : 'Rotate Spoke Token'}
                    </h2>
                    <p className="text-purple-100 text-sm">{spoke.name} ({spoke.instanceCode})</p>
                  </div>
                </div>
                {(phase !== 'success' || confirmedCopy) && (
                  <button
                    onClick={handleClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Confirmation Phase */}
              {phase === 'confirm' && (
                <div className="space-y-6">
                  {/* Warning */}
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-800 dark:text-amber-200">
                          Warning: This will invalidate the current token.
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                          The spoke must be reconfigured with the new token to maintain connectivity.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Current Token Info */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">Current Token Expires</span>
                      <span className={`font-medium ${
                        tokenExpiryInfo.isExpired ? 'text-red-600' :
                        tokenExpiryInfo.isExpiring ? 'text-amber-600' :
                        'text-gray-700 dark:text-gray-300'
                      }`}>
                        {tokenExpiryInfo.isExpired ? 'Expired' :
                         tokenExpiryInfo.isExpiring ? `${tokenExpiryInfo.daysRemaining} days remaining` :
                         formatDate(spoke.tokenExpiresAt)}
                      </span>
                    </div>
                    {spoke.tokenScopes && spoke.tokenScopes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {spoke.tokenScopes.map((scope) => (
                          <span
                            key={scope}
                            className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Options */}
                  <div className="space-y-4">
                    {/* Validity Period */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Clock className="w-4 h-4 inline mr-2" />
                        New Token Validity
                      </label>
                      <select
                        value={validityDays}
                        onChange={(e) => setValidityDays(Number(e.target.value))}
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      >
                        {VALIDITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Notify Admin */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifyAdmin}
                        onChange={(e) => setNotifyAdmin(e.target.checked)}
                        className="w-4 h-4 text-purple-600 bg-white border-gray-300 rounded focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Notify spoke admin by email
                      </span>
                    </label>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRotate}
                      className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Rotate Token
                    </button>
                  </div>
                </div>
              )}

              {/* Rotating Phase */}
              {phase === 'rotating' && (
                <div className="py-12 text-center">
                  <RefreshCw className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-900 dark:text-white">
                    Rotating Token...
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Revoking old token and generating new one
                  </p>
                </div>
              )}

              {/* Success Phase */}
              {phase === 'success' && newToken && (
                <div className="space-y-6">
                  {/* Success Message */}
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-emerald-800 dark:text-emerald-200">
                          Token rotated successfully!
                        </p>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                          The old token has been revoked.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Important Warning */}
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-red-800 dark:text-red-200">
                          IMPORTANT: This token is shown only once!
                        </p>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                          Copy it now and securely share with the spoke administrator.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Token Display */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <Key className="w-4 h-4 inline mr-2" />
                      New Token
                    </label>
                    <div className="relative">
                      <div className="w-full p-4 bg-gray-900 dark:bg-gray-950 rounded-lg font-mono text-sm text-gray-100 break-all pr-24 min-h-[80px]">
                        {tokenVisible ? newToken.token : '•'.repeat(Math.min(newToken.token?.length || 0, 64))}
                      </div>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <button
                          onClick={() => setTokenVisible(!tokenVisible)}
                          className="p-2 text-gray-400 hover:text-white rounded transition-colors"
                          title={tokenVisible ? 'Hide token' : 'Show token'}
                        >
                          {tokenVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={handleCopy}
                          className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 transition-colors"
                        >
                          {copied ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
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
                    </div>
                  </div>

                  {/* Token Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="text-xs text-gray-500">Expires</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDate(newToken.expiresAt)}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="text-xs text-gray-500">Validity</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {validityDays} days
                      </div>
                    </div>
                  </div>

                  {/* Scopes */}
                  {newToken.scopes && newToken.scopes.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <Shield className="w-4 h-4 inline mr-2" />
                        Token Scopes
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {newToken.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm rounded-lg"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Done Button */}
                  <div className="pt-4">
                    <button
                      onClick={handleDoneClick}
                      disabled={!confirmedCopy}
                      className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                        confirmedCopy
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {confirmedCopy ? "Done, I've Copied the Token" : 'Copy the Token First'}
                    </button>
                    {!confirmedCopy && (
                      <p className="text-xs text-center text-gray-500 mt-2">
                        You must copy the token before closing this dialog
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Error Phase */}
              {phase === 'error' && (
                <div className="space-y-6">
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-800 dark:text-red-200">
                          Token Rotation Failed
                        </p>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                          {error || 'An unexpected error occurred'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setPhase('confirm')}
                      className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default TokenRotationModal;

