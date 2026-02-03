/**
 * DIVE V3 - Maintenance Mode Toggle
 *
 * Toggle control for spoke maintenance mode.
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wrench,
  Power,
  AlertTriangle,
  Clock,
  Shield,
} from 'lucide-react';

export interface IMaintenanceStatus {
  isInMaintenanceMode: boolean;
  maintenanceReason?: string;
  maintenanceEnteredAt?: string;
}

interface MaintenanceModeToggleProps {
  status: IMaintenanceStatus | null;
  loading?: boolean;
  onEnter?: (reason: string) => Promise<void>;
  onExit?: () => Promise<void>;
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  return `${diffHours}h ${diffMinutes % 60}m ago`;
}

export function MaintenanceModeToggle({
  status,
  loading,
  onEnter,
  onExit
}: MaintenanceModeToggleProps) {
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const isActive = status?.isInMaintenanceMode || false;

  const handleEnter = async () => {
    if (!onEnter) return;
    setProcessing(true);
    try {
      await onEnter(reason || 'Manual maintenance');
      setShowModal(false);
      setReason('');
    } finally {
      setProcessing(false);
    }
  };

  const handleExit = async () => {
    if (!onExit) return;
    setProcessing(true);
    try {
      await onExit();
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 rounded-xl" />
            <div>
              <div className="h-5 bg-slate-200 rounded w-32 mb-2" />
              <div className="h-4 bg-slate-200 rounded w-24" />
            </div>
          </div>
          <div className="h-10 w-20 bg-slate-200 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className={`rounded-2xl border shadow-lg p-6 transition-all ${
          isActive
            ? 'bg-amber-50 border-amber-300 shadow-amber-100'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${isActive ? 'bg-amber-200' : 'bg-slate-100'}`}>
              <Wrench className={`w-6 h-6 ${isActive ? 'text-amber-700' : 'text-slate-500'}`} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Maintenance Mode</h3>
              <p className={`text-sm ${isActive ? 'text-amber-700' : 'text-slate-500'}`}>
                {isActive
                  ? `Active since ${formatRelativeTime(status?.maintenanceEnteredAt)}`
                  : 'System is operational'
                }
              </p>
              {isActive && status?.maintenanceReason && (
                <p className="text-xs text-amber-600 mt-1">
                  Reason: {status.maintenanceReason}
                </p>
              )}
            </div>
          </div>

          {/* Toggle */}
          <button
            onClick={isActive ? handleExit : () => setShowModal(true)}
            disabled={processing}
            className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors ${
              isActive ? 'bg-amber-500' : 'bg-slate-200'
            } ${processing ? 'opacity-50' : 'cursor-pointer'}`}
          >
            <motion.span
              layout
              className={`inline-block h-8 w-8 rounded-full bg-white shadow-lg ${
                isActive ? 'ml-11' : 'ml-1'
              }`}
            >
              <span className="flex h-full w-full items-center justify-center">
                {isActive ? (
                  <Power className="w-4 h-4 text-amber-500" />
                ) : (
                  <Shield className="w-4 h-4 text-slate-400" />
                )}
              </span>
            </motion.span>
          </button>
        </div>

        {/* Active Warning */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-4 bg-amber-100 border border-amber-300 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Maintenance mode is active
                  </p>
                  <ul className="mt-2 text-xs text-amber-700 space-y-1">
                    <li>• All Hub communications are paused</li>
                    <li>• Audit events are queued locally</li>
                    <li>• Policy sync is suspended</li>
                    <li>• Authorization uses cached policies</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Enter Maintenance Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl z-50 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Wrench className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Enter Maintenance Mode</h3>
                  <p className="text-sm text-slate-500">Pause hub communications</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                    <div className="text-sm text-amber-700">
                      <p className="font-medium">This will:</p>
                      <ul className="mt-1 space-y-0.5 text-xs">
                        <li>• Stop heartbeats to Hub</li>
                        <li>• Queue audit events locally</li>
                        <li>• Suspend policy sync</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Reason (optional)
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Scheduled system update"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  disabled={processing}
                  className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEnter}
                  disabled={processing}
                  className="flex items-center gap-2 px-6 py-2 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {processing ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      Entering...
                    </>
                  ) : (
                    <>
                      <Wrench className="w-4 h-4" />
                      Enter Maintenance
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default MaintenanceModeToggle;

