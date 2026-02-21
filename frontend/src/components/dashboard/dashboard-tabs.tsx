/**
 * Dashboard Tabs Navigation Component
 *
 * Provides tabbed navigation for the modernized dashboard.
 * Matches the design patterns from /policies page.
 */

'use client';

import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Globe,
  ShieldCheck,
  FileText,
  Activity,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export type DashboardTab = 'overview' | 'federation' | 'authorization' | 'resources' | 'activity';

interface TabConfig {
  id: DashboardTab;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  description: string;
}

interface DashboardTabsProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  badges?: Partial<Record<DashboardTab, number | string>>;
}

export function DashboardTabs({ activeTab, onTabChange, badges = {} }: DashboardTabsProps) {
  const { t } = useTranslation('dashboard');

  // Generate tabs with localized labels
  const TABS: TabConfig[] = [
    {
      id: 'overview',
      label: t('tabs.overview'),
      icon: <LayoutDashboard className="w-4 h-4" />,
      description: t('tabs.overview'),
    },
    {
      id: 'federation',
      label: t('tabs.federation'),
      icon: <Globe className="w-4 h-4" />,
      description: t('tabs.federation'),
    },
    {
      id: 'authorization',
      label: t('tabs.authorization'),
      icon: <ShieldCheck className="w-4 h-4" />,
      description: t('tabs.authorization'),
    },
    {
      id: 'resources',
      label: t('tabs.resources'),
      icon: <FileText className="w-4 h-4" />,
      description: t('tabs.resources'),
    },
    {
      id: 'activity',
      label: t('tabs.activity'),
      icon: <Activity className="w-4 h-4" />,
      description: t('tabs.activity'),
    },
  ];

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, tabId: DashboardTab) => {
    const tabIds = TABS.map(t => t.id);
    const currentIndex = tabIds.indexOf(tabId);

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % tabIds.length;
      onTabChange(tabIds[nextIndex]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
      onTabChange(tabIds[prevIndex]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onTabChange(tabIds[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      onTabChange(tabIds[tabIds.length - 1]);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="flex items-center gap-2 mb-6"
    >
      <div
        className="flex bg-white/80 backdrop-blur-sm rounded-xl p-1.5 border border-slate-200 shadow-sm overflow-x-auto"
        role="tablist"
        aria-label="Dashboard sections"
      >
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            badge={badges[tab.id]}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
          />
        ))}
      </div>
    </motion.div>
  );
}

interface TabButtonProps {
  tab: TabConfig;
  isActive: boolean;
  badge?: number | string;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

function TabButton({ tab, isActive, badge, onClick, onKeyDown }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${tab.id}`}
      id={`tab-${tab.id}`}
      tabIndex={isActive ? 0 : -1}
      className={`
        relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
        transition-all duration-200 whitespace-nowrap
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
        ${isActive
          ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }
      `}
      title={tab.description}
    >
      <span aria-hidden="true">{tab.icon}</span>
      <span className="hidden sm:inline">{tab.label}</span>
      <span className="sr-only sm:hidden">{tab.label}</span>

      {/* Badge */}
      {badge !== undefined && (
        <span
          className={`
            ml-1 px-1.5 py-0.5 text-xs font-bold rounded-full min-w-[18px] text-center
            ${isActive
              ? 'bg-white/20 text-white'
              : 'bg-blue-100 text-blue-700'
            }
          `}
          aria-label={`${badge} items`}
        >
          {badge}
        </span>
      )}

      {/* Active indicator */}
      {isActive && (
        <motion.div
          layoutId="activeTabIndicator"
          className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg -z-10"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        />
      )}
    </button>
  );
}
