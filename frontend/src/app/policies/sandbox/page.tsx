'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { redirect } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import PageLayout from '@/components/layout/page-layout';
import {
  Hammer,
  FolderOpen,
  FlaskConical,
  BookOpen,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  HelpCircle,
  X,
  Lightbulb,
  AlertTriangle
} from 'lucide-react';

// Tab Components (will be created/renamed)
import PolicyListTab from '@/components/policies-lab/PolicyListTab';
import UploadPolicyModal from '@/components/policies-lab/UploadPolicyModal';

// Lazy load heavier components
import dynamic from 'next/dynamic';

const BuilderTab = dynamic(() => import('@/components/policies-sandbox/BuilderTab'), {
  loading: () => <TabLoadingState />,
  ssr: false
});

const TestTab = dynamic(() => import('@/components/policies-sandbox/TestTab'), {
  loading: () => <TabLoadingState />,
  ssr: false
});

const ReferenceTab = dynamic(() => import('@/components/policies-sandbox/ReferenceTab'), {
  loading: () => <TabLoadingState />,
  ssr: false
});

// =============================================================================
// TYPES
// =============================================================================

type TabId = 'builder' | 'policies' | 'test' | 'reference';

interface TabConfig {
  id: TabId;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  bgGradient: string;
}

// =============================================================================
// TAB CONFIGURATION
// =============================================================================

const TABS: TabConfig[] = [
  {
    id: 'builder',
    label: 'Builder',
    shortLabel: 'Build',
    description: 'Write custom Rego policies using templates or from scratch',
    icon: Hammer,
    accentColor: 'cyan',
    bgGradient: 'from-cyan-500/10 to-blue-500/5'
  },
  {
    id: 'policies',
    label: 'My Policies',
    shortLabel: 'Policies',
    description: 'View, manage, and delete policies you\'ve uploaded',
    icon: FolderOpen,
    accentColor: 'emerald',
    bgGradient: 'from-emerald-500/10 to-teal-500/5'
  },
  {
    id: 'test',
    label: 'Test',
    shortLabel: 'Test',
    description: 'Run policies against sample inputs to verify behavior',
    icon: FlaskConical,
    accentColor: 'purple',
    bgGradient: 'from-purple-500/10 to-pink-500/5'
  },
  {
    id: 'reference',
    label: 'Reference',
    shortLabel: 'Docs',
    description: 'Learn how XACML concepts map to Rego syntax',
    icon: BookOpen,
    accentColor: 'amber',
    bgGradient: 'from-amber-500/10 to-orange-500/5'
  }
];

// =============================================================================
// LOADING STATE
// =============================================================================

function TabLoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 relative">
          <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
        </div>
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

// =============================================================================
// HELP CARD COMPONENT
// =============================================================================

interface HelpCardProps {
  tab: TabConfig;
  isVisible: boolean;
  onDismiss: () => void;
}

function HelpCard({ tab, isVisible, onDismiss }: HelpCardProps) {
  if (!isVisible) return null;

  const colorClasses: Record<string, string> = {
    cyan: 'border-cyan-500/30 bg-cyan-900/20 text-cyan-300',
    emerald: 'border-emerald-500/30 bg-emerald-900/20 text-emerald-300',
    purple: 'border-purple-500/30 bg-purple-900/20 text-purple-300',
    amber: 'border-amber-500/30 bg-amber-900/20 text-amber-300'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`mb-6 p-4 rounded-xl border ${colorClasses[tab.accentColor]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium mb-1">What can I do here?</h4>
            <p className="text-sm opacity-80">{tab.description}</p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN COMPONENT - INNER (with useSearchParams)
// =============================================================================

function PolicySandboxInner() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Tab state
  const initialTab = (searchParams.get('tab') as TabId) || 'builder';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [showHelp, setShowHelp] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Sync tab with URL
  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabId;
    if (tabParam && TABS.some(t => t.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    router.push(`/policies/sandbox?tab=${tabId}`, { scroll: false });
  };

  const handleUploadSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
    setActiveTab('policies');
    router.push('/policies/sandbox?tab=policies', { scroll: false });
  };

  // Auth redirect
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <TabLoadingState />
      </div>
    );
  }

  if (!session) {
    redirect('/login');
  }

  const currentTab = TABS.find(t => t.id === activeTab) || TABS[0];

  return (
    <PageLayout
      user={session.user}
      breadcrumbs={[
        { label: 'Policies', href: '/policies' },
        { label: 'Sandbox', href: null }
      ]}
      noPadding
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Experimental Warning Banner */}
        <div className="bg-gradient-to-r from-red-900/90 via-red-800/90 to-red-900/90 border-b border-red-700/50">
          <div className="max-w-[1800px] mx-auto px-6 py-2.5 flex items-center justify-center gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-300" />
              <span className="text-sm font-medium text-red-100">
                Experimental Feature
              </span>
            </div>
            <span className="text-sm text-red-200/80">
              Policy Sandbox is under active development. Use for testing and evaluation only.
            </span>
          </div>
        </div>

        {/* Ambient Background */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-[1800px] mx-auto">
          {/* Hero Header with Horizontal Tabs */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 md:px-6 py-6 md:py-8 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm"
          >
            <div className="flex items-center gap-4 mb-6">
              <Link
                href="/policies"
                className="p-2 rounded-lg hover:bg-slate-800/50 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                  <Sparkles className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400">
                    Policy Sandbox
                  </h1>
                  <p className="text-gray-400 mt-1 text-sm md:text-base">
                    Create, test, and refine custom authorization policies
                  </p>
                </div>
              </div>
            </div>

            {/* Horizontal Tab Navigation - Responsive */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1 overflow-x-auto pb-1 -mb-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabChange(tab.id)}
                      className={`
                        relative flex items-center gap-2 md:gap-3 px-3 md:px-5 py-2.5 md:py-3.5
                        rounded-xl text-sm font-medium transition-all duration-200 group whitespace-nowrap
                        ${isActive
                          ? `bg-gradient-to-br ${tab.bgGradient} border border-${tab.accentColor}-500/30 shadow-lg`
                          : 'hover:bg-slate-800/50 border border-transparent'
                        }
                      `}
                    >
                      <div className={`
                        w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center transition-all flex-shrink-0
                        ${isActive
                          ? `bg-${tab.accentColor}-500/20`
                          : 'bg-slate-700/50 group-hover:bg-slate-700'
                        }
                      `}>
                        <Icon className={`
                          w-4 h-4 md:w-5 md:h-5 transition-colors
                          ${isActive
                            ? `text-${tab.accentColor}-400`
                            : 'text-gray-400 group-hover:text-gray-200'
                          }
                        `} />
                      </div>

                      <div className="text-left">
                        <span className={`
                          block transition-colors
                          ${isActive ? 'text-gray-100' : 'text-gray-300 group-hover:text-gray-100'}
                        `}>
                          <span className="hidden sm:inline">{tab.label}</span>
                          <span className="sm:hidden">{tab.shortLabel}</span>
                        </span>
                        <span className="hidden lg:block text-[11px] text-gray-500 max-w-[140px] truncate">
                          {tab.description}
                        </span>
                      </div>

                      {isActive && (
                        <motion.div
                          layoutId="sandbox-tab-indicator"
                          className={`absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-${tab.accentColor}-400 to-${tab.accentColor}-600 rounded-full`}
                          transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Help Toggle */}
              <button
                onClick={() => setShowHelp(!showHelp)}
                className={`
                  p-2.5 rounded-lg transition-colors flex-shrink-0
                  ${showHelp
                    ? 'bg-slate-700/50 text-gray-200'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-slate-800/50'
                  }
                `}
                title={showHelp ? 'Hide help' : 'Show help'}
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            </div>
          </motion.header>

          {/* Tab Content */}
          <main className="px-4 md:px-6 py-6 md:py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {/* Help Card */}
                <AnimatePresence>
                  <HelpCard
                    tab={currentTab}
                    isVisible={showHelp}
                    onDismiss={() => setShowHelp(false)}
                  />
                </AnimatePresence>

                {/* Tab Content */}
                {activeTab === 'builder' && (
                  <BuilderTab onPushSuccess={handleUploadSuccess} />
                )}

                {activeTab === 'policies' && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold text-gray-100">My Policies</h2>
                        <p className="text-sm text-gray-400 mt-1">
                          Manage your uploaded Rego and XACML policies
                        </p>
                      </div>
                      <button
                        onClick={() => setUploadModalOpen(true)}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-medium hover:bg-emerald-500/30 transition-colors"
                      >
                        <FolderOpen className="w-4 h-4" />
                        Upload Policy
                      </button>
                    </div>
                    <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4 md:p-6">
                      <PolicyListTab refreshTrigger={refreshTrigger} />
                    </div>
                  </div>
                )}

                {activeTab === 'test' && (
                  <TestTab />
                )}

                {activeTab === 'reference' && (
                  <ReferenceTab />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* Upload Modal */}
        <UploadPolicyModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      </div>
    </PageLayout>
  );
}

// =============================================================================
// MAIN EXPORT - WRAPPED IN SUSPENSE
// =============================================================================

export default function PolicySandboxPage() {
  return (
    <Suspense fallback={<TabLoadingState />}>
      <PolicySandboxInner />
    </Suspense>
  );
}

