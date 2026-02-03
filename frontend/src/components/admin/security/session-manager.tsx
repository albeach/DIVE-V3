/**
 * Session Manager Component
 * 
 * Admin interface for managing active user sessions:
 * - View all active sessions
 * - Terminate individual sessions
 * - Bulk session termination
 * - Session details (IP, device, location)
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Clock,
  XCircle,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle,
  Shield,
  Activity,
  LogOut,
  Trash2,
} from 'lucide-react';
import { adminToast, notify } from '@/lib/admin-toast';
import { VirtualList } from '@/components/ui/virtual-list';

// ============================================
// Types
// ============================================

interface ISession {
  id: string;
  userId: string;
  username: string;
  email?: string;
  ipAddress: string;
  userAgent: string;
  device: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser?: string;
  os?: string;
  country?: string;
  city?: string;
  startTime: string;
  lastActive: string;
  expiresAt?: string;
  idpAlias?: string;
  realmId?: string;
  clearance?: string;
}

// ============================================
// Constants
// ============================================

const DEVICE_ICONS = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: Globe,
};

// ============================================
// Component
// ============================================

export function SessionManager() {
  const [sessions, setSessions] = useState<ISession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);
  const [terminatingSession, setTerminatingSession] = useState<ISession | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/security/sessions');
      if (response.ok) {
        const data = await response.json();
        setSessions(data.data || data.sessions || []);
      } else {
        setSessions(generateMockSessions());
      }
    } catch (error) {
      console.error('[SessionManager] Error:', error);
      setSessions(generateMockSessions());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSessions();
    adminToast.success('Sessions refreshed');
  };

  const terminateSession = async (session: ISession) => {
    try {
      const response = await fetch(`/api/admin/security/sessions/${session.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSessions(sessions.filter(s => s.id !== session.id));
        // Use unified notification service - shows toast AND creates persistent notification
        notify.admin.sessionTerminated(session.username);
      } else {
        adminToast.error('Failed to terminate session');
      }
    } catch (error) {
      adminToast.error('Failed to terminate session', error);
    } finally {
      setTerminatingSession(null);
      setShowTerminateConfirm(false);
    }
  };

  const terminateSelectedSessions = async () => {
    const ids = Array.from(selectedSessions);
    let terminated = 0;

    for (const id of ids) {
      try {
        const response = await fetch(`/api/admin/security/sessions/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) terminated++;
      } catch (error) {
        console.error('Failed to terminate session:', id, error);
      }
    }

    setSessions(sessions.filter(s => !selectedSessions.has(s.id)));
    setSelectedSessions(new Set());
    // Use unified notification for bulk termination
    notify.admin.bulkSessionsTerminated(terminated);
  };

  const toggleSessionSelection = (sessionId: string) => {
    const newSelected = new Set(selectedSessions);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const selectAllFiltered = () => {
    const filtered = filteredSessions.map(s => s.id);
    setSelectedSessions(new Set(filtered));
  };

  const filteredSessions = sessions.filter(session => {
    if (!search) return true;
    const query = search.toLowerCase();
    return (
      session.username.toLowerCase().includes(query) ||
      session.email?.toLowerCase().includes(query) ||
      session.ipAddress.includes(query) ||
      session.country?.toLowerCase().includes(query)
    );
  });

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
        <p className="text-center mt-4 text-gray-500">Loading active sessions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Active Sessions</h2>
              <p className="text-sm text-gray-500">{sessions.length} session(s) currently active</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selectedSessions.size > 0 && (
              <button
                onClick={terminateSelectedSessions}
                className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Terminate {selectedSessions.size}
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <div className="text-2xl font-bold text-blue-700">{sessions.length}</div>
            <div className="text-sm text-blue-600">Total Sessions</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-100">
            <div className="text-2xl font-bold text-green-700">
              {sessions.filter(s => {
                const lastActive = new Date(s.lastActive);
                const now = new Date();
                return (now.getTime() - lastActive.getTime()) < 5 * 60 * 1000;
              }).length}
            </div>
            <div className="text-sm text-green-600">Active Now</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
            <div className="text-2xl font-bold text-purple-700">
              {new Set(sessions.map(s => s.userId)).size}
            </div>
            <div className="text-sm text-purple-600">Unique Users</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
            <div className="text-2xl font-bold text-amber-700">
              {sessions.filter(s => s.idpAlias).length}
            </div>
            <div className="text-sm text-amber-600">Federated</div>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by username, email, IP, or location..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>
          <button
            onClick={selectAllFiltered}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Select All
          </button>
        </div>
      </div>

      {/* Session List */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        {filteredSessions.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No sessions found</p>
          </div>
        ) : (
          <VirtualList<ISession>
            items={filteredSessions}
            estimateSize={88}
            overscan={5}
            className="max-h-[600px]"
            getItemKey={(index) => filteredSessions[index].id}
            emptyMessage="No sessions found"
            renderItem={(session) => {
              const DeviceIcon = DEVICE_ICONS[session.device];
              const isSelected = selectedSessions.has(session.id);
              const isActive = new Date().getTime() - new Date(session.lastActive).getTime() < 5 * 60 * 1000;

              return (
                <div
                  className={`p-4 hover:bg-slate-50 transition-colors border-b border-gray-100 ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSessionSelection(session.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />

                    {/* Device Icon */}
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                      <DeviceIcon className={`h-5 w-5 ${isActive ? 'text-green-600' : 'text-gray-500'}`} />
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{session.username}</span>
                        {isActive && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <Activity className="h-3 w-3" />
                            Active
                          </span>
                        )}
                        {session.clearance && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            session.clearance === 'TOP_SECRET' ? 'bg-red-100 text-red-700' :
                            session.clearance === 'SECRET' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {session.clearance}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {session.email || session.ipAddress}
                      </div>
                      <div className="text-xs text-gray-400 flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {session.ipAddress}
                        </span>
                        {session.country && (
                          <span>{session.city ? `${session.city}, ` : ''}{session.country}</span>
                        )}
                        <span>{session.browser} / {session.os}</span>
                      </div>
                    </div>

                    {/* Time Info */}
                    <div className="text-right">
                      <div className="text-sm text-gray-700">
                        Last active: {getTimeAgo(session.lastActive)}
                      </div>
                      <div className="text-xs text-gray-400">
                        Started: {new Date(session.startTime).toLocaleString()}
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => {
                        setTerminatingSession(session);
                        setShowTerminateConfirm(true);
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Terminate Session"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>

      {/* Terminate Confirmation Modal */}
      <AnimatePresence>
        {showTerminateConfirm && terminatingSession && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowTerminateConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Terminate Session</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    This will immediately end the session for <strong>{terminatingSession.username}</strong>.
                    They will need to sign in again.
                  </p>
                </div>
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Globe className="h-4 w-4" />
                  {terminatingSession.ipAddress}
                </div>
                <div className="flex items-center gap-2 text-gray-600 mt-1">
                  <Monitor className="h-4 w-4" />
                  {terminatingSession.browser} / {terminatingSession.os}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowTerminateConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => terminateSession(terminatingSession)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  <LogOut className="h-4 w-4 inline mr-2" />
                  Terminate Session
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Mock Data Generator
// ============================================

function generateMockSessions(): ISession[] {
  const now = new Date();
  
  return [
    {
      id: 'sess-1',
      userId: 'user-1',
      username: 'admin-usa',
      email: 'admin@usa.mil',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      device: 'desktop',
      browser: 'Chrome 120',
      os: 'macOS',
      country: 'USA',
      city: 'Washington DC',
      startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      lastActive: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      clearance: 'TOP_SECRET',
    },
    {
      id: 'sess-2',
      userId: 'user-2',
      username: 'testuser-usa-3',
      email: 'testuser3@usa.mil',
      ipAddress: '192.168.1.105',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      device: 'desktop',
      browser: 'Edge 120',
      os: 'Windows 11',
      country: 'USA',
      city: 'New York',
      startTime: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      lastActive: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      clearance: 'SECRET',
    },
    {
      id: 'sess-3',
      userId: 'user-3',
      username: 'testuser-gbr-1',
      email: 'user@mod.uk',
      ipAddress: '10.0.0.50',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      device: 'mobile',
      browser: 'Safari 17',
      os: 'iOS 17',
      country: 'GBR',
      city: 'London',
      startTime: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      lastActive: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      idpAlias: 'gbr-idp',
      clearance: 'SECRET',
    },
    {
      id: 'sess-4',
      userId: 'user-4',
      username: 'testuser-bel-2',
      email: 'user@mil.be',
      ipAddress: '172.16.0.25',
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)',
      device: 'tablet',
      browser: 'Safari 17',
      os: 'iPadOS 17',
      country: 'BEL',
      city: 'Brussels',
      startTime: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      lastActive: new Date(now.getTime() - 1 * 60 * 1000).toISOString(),
      idpAlias: 'bel-idp',
      clearance: 'CONFIDENTIAL',
    },
  ];
}

export default SessionManager;
