'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Zap, 
  Database,
  Radio,
  RefreshCw,
  ChevronRight,
  Play,
  Pause,
  Settings
} from 'lucide-react';

interface PolicyUpdate {
  id: string;
  timestamp: Date;
  policy: string;
  status: 'detecting' | 'broadcasting' | 'propagating' | 'reloading' | 'complete' | 'error';
  stages: {
    opalDetection: { status: 'pending' | 'active' | 'complete'; duration?: number };
    redisBroadcast: { status: 'pending' | 'active' | 'complete'; duration?: number };
    clientPropagation: { status: 'pending' | 'active' | 'complete'; instances?: string[] };
    opaReload: { status: 'pending' | 'active' | 'complete'; instances?: string[] };
    authzActive: { status: 'pending' | 'active' | 'complete' };
  };
}

interface PolicyItem {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  lastModified: Date;
  description: string;
  category: 'authorization' | 'federation' | 'data' | 'tenant';
}

const MOCK_POLICIES: PolicyItem[] = [
  {
    id: 'pol-001',
    name: 'Base Authorization Policy',
    path: 'policies/base/authorization.rego',
    enabled: true,
    lastModified: new Date(),
    description: 'Core ABAC authorization rules for clearance, releasability, and COI',
    category: 'authorization'
  },
  {
    id: 'pol-002',
    name: 'Federation Trust Policy',
    path: 'policies/org/federation.rego',
    enabled: true,
    lastModified: new Date(),
    description: 'Cross-instance federation trust and token validation',
    category: 'federation'
  },
  {
    id: 'pol-003',
    name: 'Resource Access Policy',
    path: 'policies/base/resource_access.rego',
    enabled: true,
    lastModified: new Date(),
    description: 'Resource-level access control with embargo and encryption checks',
    category: 'authorization'
  },
  {
    id: 'pol-004',
    name: 'Tenant Isolation Policy',
    path: 'policies/tenant/isolation.rego',
    enabled: false,
    lastModified: new Date(),
    description: 'Multi-tenant data isolation and cross-tenant access prevention',
    category: 'tenant'
  }
];

export default function PolicyAdministrationDashboard() {
  const [policies, setPolicies] = useState<PolicyItem[]>(MOCK_POLICIES);
  const [activeUpdate, setActiveUpdate] = useState<PolicyUpdate | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [liveLogsVisible, setLiveLogsVisible] = useState(false);
  const [liveLogs, setLiveLogs] = useState<Array<{timestamp: Date; source: string; message: string}>>([]);

  // Simulate real-time policy updates via WebSocket
  useEffect(() => {
    if (!isMonitoring) return;

    // In production, this would be: new WebSocket('wss://localhost:4000/policy-updates')
    const mockWebSocket = setInterval(() => {
      // Simulate periodic status checks
    }, 2000);

    return () => clearInterval(mockWebSocket);
  }, [isMonitoring]);

  const handlePolicyToggle = async (policyId: string) => {
    const policy = policies.find(p => p.id === policyId);
    if (!policy) return;

    // Update local state
    setPolicies(prev => prev.map(p => 
      p.id === policyId ? { ...p, enabled: !p.enabled } : p
    ));

    // Add notification
    addNotification(`Policy ${policy.name} ${policy.enabled ? 'disabled' : 'enabled'}`);

    // Initiate policy distribution workflow
    const updateId = `update-${Date.now()}`;
    const update: PolicyUpdate = {
      id: updateId,
      timestamp: new Date(),
      policy: policy.name,
      status: 'detecting',
      stages: {
        opalDetection: { status: 'active' },
        redisBroadcast: { status: 'pending' },
        clientPropagation: { status: 'pending' },
        opaReload: { status: 'pending' },
        authzActive: { status: 'pending' }
      }
    };

    setActiveUpdate(update);

    // Simulate workflow progression
    await simulatePolicyWorkflow(updateId, update);
  };

  const simulatePolicyWorkflow = async (updateId: string, update: PolicyUpdate) => {
    // Stage 1: OPAL Detection (0-5s)
    await new Promise(resolve => setTimeout(resolve, 2000));
    setActiveUpdate(prev => prev ? {
      ...prev,
      stages: {
        ...prev.stages,
        opalDetection: { status: 'complete', duration: 2000 },
        redisBroadcast: { status: 'active' }
      }
    } : null);
    addNotification('OPAL Server detected policy change');

    // Stage 2: Redis Broadcast (< 1s)
    await new Promise(resolve => setTimeout(resolve, 500));
    setActiveUpdate(prev => prev ? {
      ...prev,
      status: 'broadcasting',
      stages: {
        ...prev.stages,
        redisBroadcast: { status: 'complete', duration: 500 },
        clientPropagation: { status: 'active', instances: ['Hub', 'FRA', 'GBR'] }
      }
    } : null);
    addNotification('Policy broadcast via Redis Pub/Sub');

    // Stage 3: Client Propagation (1-2s)
    await new Promise(resolve => setTimeout(resolve, 1500));
    setActiveUpdate(prev => prev ? {
      ...prev,
      status: 'propagating',
      stages: {
        ...prev.stages,
        clientPropagation: { status: 'complete', instances: ['Hub', 'FRA', 'GBR'] },
        opaReload: { status: 'active', instances: ['Hub', 'FRA', 'GBR'] }
      }
    } : null);
    addNotification('OPAL clients received update');

    // Stage 4: OPA Reload (1-2s)
    await new Promise(resolve => setTimeout(resolve, 1500));
    setActiveUpdate(prev => prev ? {
      ...prev,
      status: 'reloading',
      stages: {
        ...prev.stages,
        opaReload: { status: 'complete', instances: ['Hub', 'FRA', 'GBR'] },
        authzActive: { status: 'active' }
      }
    } : null);
    addNotification('OPA instances reloaded policies');

    // Stage 5: Authorization Active
    await new Promise(resolve => setTimeout(resolve, 500));
    setActiveUpdate(prev => prev ? {
      ...prev,
      status: 'complete',
      stages: {
        ...prev.stages,
        authzActive: { status: 'complete' }
      }
    } : null);
    addNotification('✅ Policy distribution complete!');

    // Clear after 5 seconds
    setTimeout(() => setActiveUpdate(null), 5000);
  };

  const addNotification = (message: string) => {
    setNotifications(prev => [...prev, message].slice(-5));
    setTimeout(() => {
      setNotifications(prev => prev.slice(1));
    }, 5000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Policy Administration Center
            </h1>
            <p className="text-slate-400">Real-time policy distribution monitoring and control</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLiveLogsVisible(!liveLogsVisible)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                liveLogsVisible
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                  : 'bg-slate-700 text-slate-400 border border-slate-600'
              }`}
            >
              <FileText className="w-4 h-4" />
              {liveLogsVisible ? 'Hide Logs' : 'Show Live Logs'}
            </button>
            <button
              onClick={() => setIsMonitoring(!isMonitoring)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                isMonitoring 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                  : 'bg-slate-700 text-slate-400 border border-slate-600'
              }`}
            >
              {isMonitoring ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isMonitoring ? 'Monitoring Active' : 'Monitoring Paused'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Panel: Policy List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              Active Policies
            </h2>
            <div className="space-y-3">
              {policies.map(policy => (
                <PolicyCard
                  key={policy.id}
                  policy={policy}
                  onToggle={handlePolicyToggle}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel: Workflow Visualization */}
        <div className="lg:col-span-2 space-y-4">
          {/* Active Update Workflow */}
          {activeUpdate && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-6"
            >
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                Policy Distribution Workflow
              </h2>
              <WorkflowVisualization update={activeUpdate} />
            </motion.div>
          )}

          {/* Statistics */}
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              icon={<CheckCircle className="w-5 h-5 text-green-400" />}
              label="Policies Active"
              value={policies.filter(p => p.enabled).length}
              color="green"
            />
            <StatCard
              icon={<Clock className="w-5 h-5 text-blue-400" />}
              label="Avg Propagation"
              value="~8s"
              color="blue"
            />
          </div>

          {/* Notifications */}
          <div className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Radio className="w-4 h-4 text-purple-400" />
              Live Activity Feed
            </h3>
            <div className="space-y-2">
              <AnimatePresence>
                {notifications.map((notification, idx) => (
                  <motion.div
                    key={`${notification}-${idx}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="text-sm text-slate-300 py-2 px-3 bg-slate-700/50 rounded-lg"
                  >
                    {notification}
                  </motion.div>
                ))}
              </AnimatePresence>
              {notifications.length === 0 && (
                <p className="text-slate-500 text-sm">No recent activity</p>
              )}
            </div>
          </div>

          {/* Live OPAL Logs Viewer */}
          <AnimatePresence>
            {liveLogsVisible && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-slate-800/50 backdrop-blur rounded-xl border border-slate-700 p-6 overflow-hidden"
              >
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  Live OPAL Server Logs
                  <span className="ml-auto text-xs text-slate-500">
                    Last {liveLogs.length} entries
                  </span>
                </h3>
                <div className="bg-slate-900/80 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs space-y-1">
                  {liveLogs.length === 0 ? (
                    <p className="text-slate-500">Connecting to log stream...</p>
                  ) : (
                    liveLogs.slice(-30).map((log, idx) => (
                      <div key={idx} className="text-slate-300">
                        <span className="text-slate-500">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        {' '}
                        <span className="text-cyan-400">[{log.source}]</span>
                        {' '}
                        {log.message.includes('policy') || log.message.includes('broadcast') ? (
                          <span className="text-yellow-400 font-semibold">{log.message}</span>
                        ) : (
                          <span>{log.message}</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function PolicyCard({ policy, onToggle }: { policy: PolicyItem; onToggle: (id: string) => void }) {
  const categoryColors = {
    authorization: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    federation: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    data: 'bg-green-500/20 text-green-400 border-green-500/50',
    tenant: 'bg-orange-500/20 text-orange-400 border-orange-500/50'
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="bg-slate-700/30 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="font-medium text-sm mb-1">{policy.name}</h3>
          <p className="text-xs text-slate-400 mb-2">{policy.path}</p>
          <p className="text-xs text-slate-500">{policy.description}</p>
        </div>
        <button
          onClick={() => onToggle(policy.id)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            policy.enabled ? 'bg-green-500' : 'bg-slate-600'
          }`}
        >
          <motion.span
            layout
            className="inline-block h-4 w-4 transform rounded-full bg-white shadow-lg"
            animate={{ x: policy.enabled ? 24 : 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded border ${categoryColors[policy.category]}`}>
          {policy.category}
        </span>
        {policy.enabled && (
          <span className="text-xs text-green-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Active
          </span>
        )}
      </div>
    </motion.div>
  );
}

function WorkflowVisualization({ update }: { update: PolicyUpdate }) {
  const stages = [
    {
      key: 'opalDetection',
      icon: <FileText className="w-5 h-5" />,
      label: 'OPAL Detection',
      sublabel: '5s polling'
    },
    {
      key: 'redisBroadcast',
      icon: <Radio className="w-5 h-5" />,
      label: 'Redis Pub/Sub',
      sublabel: 'Broadcast'
    },
    {
      key: 'clientPropagation',
      icon: <RefreshCw className="w-5 h-5" />,
      label: 'OPAL Clients',
      sublabel: update.stages.clientPropagation.instances?.join(', ') || 'Pending'
    },
    {
      key: 'opaReload',
      icon: <Database className="w-5 h-5" />,
      label: 'OPA Reload',
      sublabel: 'Policy bundles'
    },
    {
      key: 'authzActive',
      icon: <CheckCircle className="w-5 h-5" />,
      label: 'Authz Active',
      sublabel: 'Complete'
    }
  ];

  return (
    <div className="space-y-6">
      {stages.map((stage, idx) => {
        const stageData = update.stages[stage.key as keyof typeof update.stages];
        const isActive = stageData.status === 'active';
        const isComplete = stageData.status === 'complete';
        const isPending = stageData.status === 'pending';

        return (
          <div key={stage.key}>
            <div className="flex items-center gap-4">
              {/* Stage Icon */}
              <motion.div
                animate={{
                  scale: isActive ? [1, 1.1, 1] : 1,
                  rotate: isActive ? [0, 360] : 0
                }}
                transition={{ duration: 2, repeat: isActive ? Infinity : 0 }}
                className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
                  isComplete 
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : isActive
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400 animate-pulse'
                    : 'bg-slate-700 border-slate-600 text-slate-500'
                }`}
              >
                {stage.icon}
              </motion.div>

              {/* Stage Info */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium text-sm">{stage.label}</h4>
                  {isComplete && 'duration' in stageData && (
                    <span className="text-xs text-slate-400">
                      {stageData.duration}ms
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">{stage.sublabel}</p>
                
                {/* Progress Bar */}
                {(isActive || isComplete) && (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: isComplete ? '100%' : '60%' }}
                    className="h-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full mt-2"
                  />
                )}
              </div>

              {/* Status Badge */}
              {isComplete && (
                <CheckCircle className="w-5 h-5 text-green-400" />
              )}
              {isActive && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <RefreshCw className="w-5 h-5 text-blue-400" />
                </motion.div>
              )}
            </div>

            {/* Connector Line */}
            {idx < stages.length - 1 && (
              <div className="ml-6 h-6 w-0.5 bg-slate-700" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number;
  color: 'green' | 'blue' | 'purple';
}) {
  const colorClasses = {
    green: 'from-green-500/20 to-emerald-500/20 border-green-500/50',
    blue: 'from-blue-500/20 to-cyan-500/20 border-blue-500/50',
    purple: 'from-purple-500/20 to-pink-500/20 border-purple-500/50'
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} backdrop-blur rounded-xl border p-6`}>
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
