/**
 * DIVE V3 - Trusted Issuers List Component
 *
 * Displays and manages trusted identity providers for the federation.
 * Provides CRUD operations for hub administrators.
 *
 * Features:
 * - List all trusted issuers with status
 * - Add new issuer (hub_admin only)
 * - Remove issuer (hub_admin only)
 * - Filter by country/trust level
 * - Real-time sync status indicator
 *
 * @version 1.0.0
 * @date 2026-01-03
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Globe,
  Building2,
  RefreshCw,
  Search,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import {
  useTrustedIssuers,
  useAddTrustedIssuer,
  useRemoveTrustedIssuer,
  useForceSync,
  type TrustedIssuer,
} from '@/lib/api/admin-queries';
import { hasFederationWriteAccess } from '@/types/admin.types';

interface TrustedIssuersListProps {
  /** User's admin roles for permission checking */
  userRoles?: string[];
  /** Compact mode for embedding in other components */
  compact?: boolean;
}

// Trust level badge colors
const TRUST_LEVEL_COLORS: Record<string, string> = {
  NATIONAL: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  BILATERAL: 'bg-blue-100 text-blue-800 border-blue-200',
  PARTNER: 'bg-amber-100 text-amber-800 border-amber-200',
  DEVELOPMENT: 'bg-slate-100 text-slate-800 border-slate-200',
};

// Country flag emojis (ISO 3166-1 alpha-3 to emoji)
const COUNTRY_FLAGS: Record<string, string> = {
  USA: '🇺🇸',
  FRA: '🇫🇷',
  GBR: '🇬🇧',
  DEU: '🇩🇪',
  CAN: '🇨🇦',
  AUS: '🇦🇺',
  NZL: '🇳🇿',
  ITA: '🇮🇹',
  ESP: '🇪🇸',
  NLD: '🇳🇱',
  POL: '🇵🇱',
  BEL: '🇧🇪',
  NOR: '🇳🇴',
  DNK: '🇩🇰',
  PRT: '🇵🇹',
  LUX: '🇱🇺',
  LVA: '🇱🇻',
  LTU: '🇱🇹',
  EST: '🇪🇪',
};

export function TrustedIssuersList({ userRoles = [], compact = false }: TrustedIssuersListProps) {
  // Query hooks
  const { data: issuersData, isLoading, error, refetch } = useTrustedIssuers();
  const addIssuerMutation = useAddTrustedIssuer();
  const removeIssuerMutation = useRemoveTrustedIssuer();
  const forceSyncMutation = useForceSync();

  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [issuerToRemove, setIssuerToRemove] = useState<string | null>(null);

  // Permission check
  const canModify = hasFederationWriteAccess(userRoles);

  // Convert issuer map to array
  const issuers = issuersData?.trusted_issuers
    ? Object.entries(issuersData.trusted_issuers).map(([url, issuer]) => ({
        ...issuer,
        issuerUrl: issuer.issuerUrl || url,
      }))
    : [];

  // Filter issuers
  const filteredIssuers = issuers.filter(
    (issuer) =>
      issuer.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issuer.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issuer.issuerUrl?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle add issuer
  const handleAddIssuer = async (issuer: {
    issuerUrl: string;
    tenant: string;
    name: string;
    country: string;
    trustLevel: string;
  }) => {
    try {
      await addIssuerMutation.mutateAsync(issuer);
      setShowAddModal(false);
    } catch (err) {
      console.error('Failed to add issuer:', err);
    }
  };

  // Handle remove issuer
  const handleRemoveIssuer = async (issuerUrl: string) => {
    try {
      await removeIssuerMutation.mutateAsync(issuerUrl);
      setIssuerToRemove(null);
    } catch (err) {
      console.error('Failed to remove issuer:', err);
    }
  };

  // Handle force sync
  const handleForceSync = async () => {
    try {
      await forceSyncMutation.mutateAsync();
    } catch (err) {
      console.error('Failed to force sync:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-center py-12">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="h-8 w-8 rounded-full border-3 border-purple-500 border-t-transparent"
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center gap-3 text-red-600">
          <AlertTriangle className="w-5 h-5" />
          <span>Failed to load trusted issuers</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-lg border border-slate-200"
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Trusted Issuers</h3>
              <p className="text-sm text-slate-500">
                {issuers.length} identity provider{issuers.length !== 1 ? 's' : ''} trusted
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Force Sync Button */}
            <button
              onClick={handleForceSync}
              disabled={forceSyncMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${forceSyncMutation.isPending ? 'animate-spin' : ''}`}
              />
              Sync
            </button>

            {/* Add Button (hub_admin only) */}
            {canModify && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-md"
              >
                <Plus className="w-4 h-4" />
                Add Issuer
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        {!compact && (
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search issuers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
        )}
      </div>

      {/* Issuer List */}
      <div className="divide-y divide-slate-100">
        {filteredIssuers.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Globe className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>No trusted issuers found</p>
            {canModify && (
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 text-emerald-600 hover:text-emerald-700 text-sm font-medium"
              >
                Add your first issuer →
              </button>
            )}
          </div>
        ) : (
          filteredIssuers.map((issuer, index) => (
            <motion.div
              key={issuer.issuerUrl}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-4 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Country Flag */}
                  <div className="text-2xl">
                    {COUNTRY_FLAGS[issuer.country] || '🌐'}
                  </div>

                  <div>
                    {/* Name + Status */}
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {issuer.name || issuer.tenant}
                      </span>
                      {issuer.enabled ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>

                    {/* URL */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-slate-500 truncate max-w-xs">
                        {issuer.issuerUrl}
                      </span>
                      <a
                        href={issuer.issuerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded border ${
                          TRUST_LEVEL_COLORS[issuer.trustLevel] || TRUST_LEVEL_COLORS.DEVELOPMENT
                        }`}
                      >
                        {issuer.trustLevel}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {issuer.country}
                      </span>
                      {issuer.realm && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700 border border-purple-200">
                          {issuer.realm}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {canModify && (
                  <button
                    onClick={() => setIssuerToRemove(issuer.issuerUrl)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove issuer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Last Updated */}
      {issuersData?.timestamp && (
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
          Last updated: {new Date(issuersData.timestamp).toLocaleString()}
        </div>
      )}

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddIssuerModal
            onClose={() => setShowAddModal(false)}
            onAdd={handleAddIssuer}
            isLoading={addIssuerMutation.isPending}
            error={addIssuerMutation.error?.message}
          />
        )}
      </AnimatePresence>

      {/* Remove Confirmation Modal */}
      <AnimatePresence>
        {issuerToRemove && (
          <RemoveConfirmationModal
            issuerUrl={issuerToRemove}
            onClose={() => setIssuerToRemove(null)}
            onConfirm={() => handleRemoveIssuer(issuerToRemove)}
            isLoading={removeIssuerMutation.isPending}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Add Issuer Modal
function AddIssuerModal({
  onClose,
  onAdd,
  isLoading,
  error,
}: {
  onClose: () => void;
  onAdd: (issuer: {
    issuerUrl: string;
    tenant: string;
    name: string;
    country: string;
    trustLevel: string;
  }) => void;
  isLoading: boolean;
  error?: string;
}) {
  const [formData, setFormData] = useState({
    issuerUrl: '',
    tenant: '',
    name: '',
    country: 'USA',
    trustLevel: 'DEVELOPMENT',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Add Trusted Issuer</h3>
          <p className="text-sm text-slate-500 mt-1">
            Add a new identity provider to the trusted issuers list
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Issuer URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://idp.example.com/realms/dive"
              value={formData.issuerUrl}
              onChange={(e) => setFormData({ ...formData, issuerUrl: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tenant Code *
            </label>
            <input
              type="text"
              required
              placeholder="USA"
              value={formData.tenant}
              onChange={(e) => setFormData({ ...formData, tenant: e.target.value.toUpperCase() })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Display Name
            </label>
            <input
              type="text"
              placeholder="United States IdP"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Country *
              </label>
              <select
                required
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="USA">🇺🇸 USA</option>
                <option value="FRA">🇫🇷 France</option>
                <option value="GBR">🇬🇧 UK</option>
                <option value="DEU">🇩🇪 Germany</option>
                <option value="CAN">🇨🇦 Canada</option>
                <option value="AUS">🇦🇺 Australia</option>
                <option value="NZL">🇳🇿 New Zealand</option>
                <option value="ITA">🇮🇹 Italy</option>
                <option value="ESP">🇪🇸 Spain</option>
                <option value="NLD">🇳🇱 Netherlands</option>
                <option value="POL">🇵🇱 Poland</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Trust Level
              </label>
              <select
                value={formData.trustLevel}
                onChange={(e) => setFormData({ ...formData, trustLevel: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="DEVELOPMENT">Development</option>
                <option value="PARTNER">Partner</option>
                <option value="BILATERAL">Bilateral</option>
                <option value="NATIONAL">National</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Issuer'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// Remove Confirmation Modal
function RemoveConfirmationModal({
  issuerUrl,
  onClose,
  onConfirm,
  isLoading,
}: {
  issuerUrl: string;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 text-center">Remove Issuer?</h3>
          <p className="text-sm text-slate-500 text-center mt-2">
            This will remove the issuer from the trusted list. Tokens from this issuer will no
            longer be accepted.
          </p>
          <p className="text-xs text-slate-400 text-center mt-2 font-mono truncate">
            {issuerUrl}
          </p>
        </div>

        <div className="flex gap-3 p-4 bg-slate-50 border-t border-slate-200 rounded-b-xl">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default TrustedIssuersList;
