/**
 * PresenceIndicator Component Stories
 * 
 * Visual documentation for real-time presence tracking
 * Note: Cross-tab sync won't work in Storybook (different origin), 
 * so we mock the presence data for demonstration.
 * 
 * @phase Phase 4.3 - Storybook Component Library
 * @date 2026-02-06
 */

import type { Meta, StoryObj } from '@storybook/react';
import { PresenceIndicator, CompactPresenceIndicator } from './PresenceIndicator';

const meta: Meta<typeof PresenceIndicator> = {
  title: 'Admin/PresenceIndicator',
  component: PresenceIndicator,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    page: {
      control: 'text',
      description: 'Page identifier for presence tracking',
    },
  },
};

export default meta;
type Story = StoryObj<typeof PresenceIndicator>;

// Basic Usage

export const Default: Story = {
  args: {
    page: 'analytics',
  },
};

export const DifferentPage: Story = {
  args: {
    page: 'logs',
  },
};

// Compact Variant

export const CompactVariant: Story = {
  render: () => (
    <CompactPresenceIndicator page="dashboard" />
  ),
};

// In Page Header Context

export const InPageHeader: Story = {
  render: () => (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Analytics Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View real-time analytics and metrics
          </p>
        </div>
        <PresenceIndicator page="analytics" />
      </div>
    </div>
  ),
};

// Multiple Presence Indicators

export const MultiplePagesDemo: Story = {
  render: () => (
    <div className="space-y-6 p-6 bg-gray-50 dark:bg-gray-900">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
        Presence Across Multiple Pages
      </h2>
      
      <div className="grid gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Analytics</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">/admin/analytics</p>
          </div>
          <PresenceIndicator page="analytics" />
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">System Logs</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">/admin/logs</p>
          </div>
          <PresenceIndicator page="logs" />
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Approvals</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">/admin/approvals</p>
          </div>
          <PresenceIndicator page="approvals" />
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Certificates</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">/admin/certificates</p>
          </div>
          <PresenceIndicator page="certificates" />
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Clearance Management</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">/admin/clearance-management</p>
          </div>
          <PresenceIndicator page="clearance-management" />
        </div>
      </div>
      
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-blue-800 dark:text-blue-200 text-sm">
          <strong>Note:</strong> In a real application with authentication, you would see 
          actual user avatars and names. The component uses Broadcast Channel API for 
          cross-tab synchronization within the same browser.
        </p>
      </div>
    </div>
  ),
};

// Dark Mode

export const DarkMode: Story = {
  args: {
    page: 'analytics',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="dark">
        <Story />
      </div>
    ),
  ],
};

// Compact in Sidebar

export const CompactInSidebar: Story = {
  render: () => (
    <div className="flex">
      <div className="w-64 bg-gray-800 text-white p-4 h-screen">
        <h2 className="text-xl font-bold mb-6">Admin Panel</h2>
        
        <nav className="space-y-2">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-700 rounded hover:bg-gray-600 cursor-pointer">
            <span>Analytics</span>
            <CompactPresenceIndicator page="analytics" />
          </div>
          
          <div className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-700 cursor-pointer">
            <span>Logs</span>
            <CompactPresenceIndicator page="logs" />
          </div>
          
          <div className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-700 cursor-pointer">
            <span>Approvals</span>
            <CompactPresenceIndicator page="approvals" />
          </div>
        </nav>
      </div>
      
      <div className="flex-1 p-6 bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-400">
          Main content area - compact presence indicators in sidebar navigation
        </p>
      </div>
    </div>
  ),
};

// Documentation Story

export const Documentation: Story = {
  render: () => (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
        PresenceIndicator Component
      </h1>
      
      <div className="prose dark:prose-invert">
        <h2>Features</h2>
        <ul>
          <li>Real-time user presence tracking</li>
          <li>Cross-tab synchronization (same browser)</li>
          <li>Avatar stacking for multiple users</li>
          <li>Hover tooltips with user details</li>
          <li>Dark mode compatible</li>
          <li>Compact variant for tight spaces</li>
        </ul>
        
        <h2>Usage</h2>
        <p>Add to any collaborative admin page:</p>
        
        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
{`import { PresenceIndicator } from '@/components/admin/shared';

// In your page header
<div className="flex items-center justify-between">
  <h1>Page Title</h1>
  <PresenceIndicator page="unique-page-id" />
</div>`}
        </pre>
        
        <h2>Browser Support</h2>
        <p>Uses Broadcast Channel API, supported in all modern browsers:</p>
        <ul>
          <li>Chrome 54+</li>
          <li>Firefox 38+</li>
          <li>Safari 15.4+</li>
          <li>Edge 79+</li>
        </ul>
        
        <h2>Live Demo</h2>
        <div className="not-prose">
          <PresenceIndicator page="documentation" />
        </div>
      </div>
    </div>
  ),
};
