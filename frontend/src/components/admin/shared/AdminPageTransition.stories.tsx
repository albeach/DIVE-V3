/**
 * AdminPageTransition Component Stories
 * 
 * Visual documentation for page transition animations
 * 
 * @phase Phase 4.3 - Storybook Component Library
 * @date 2026-02-06
 */

import type { Meta, StoryObj } from '@storybook/react';
import { AdminPageTransition, AdminSectionTransition } from './AdminPageTransition';
import { useState } from 'react';
import { AnimatedButton } from './AnimatedButton';

const meta: Meta<typeof AdminPageTransition> = {
  title: 'Admin/AdminPageTransition',
  component: AdminPageTransition,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['slideUp', 'fadeIn', 'scale'],
      description: 'Animation variant',
    },
  },
};

export default meta;
type Story = StoryObj<typeof AdminPageTransition>;

// Sample page content component
const SamplePage = ({ title, color }: { title: string; color: string }) => (
  <div className={`min-h-screen ${color} p-8`}>
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        {title}
      </h1>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          This is a sample page demonstrating the page transition animation.
        </p>
        <p className="text-gray-600 dark:text-gray-400">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
          Nullam in dui mauris. Vivamus hendrerit arcu sed erat molestie vehicula.
        </p>
      </div>
    </div>
  </div>
);

// Basic Variants

export const SlideUpVariant: Story = {
  args: {
    variant: 'slideUp',
    pageKey: 'slide-up-page',
    children: <SamplePage title="Slide Up Animation" color="bg-blue-50 dark:bg-gray-900" />,
  },
};

export const FadeInVariant: Story = {
  args: {
    variant: 'fadeIn',
    pageKey: 'fade-in-page',
    children: <SamplePage title="Fade In Animation" color="bg-green-50 dark:bg-gray-900" />,
  },
};

export const ScaleVariant: Story = {
  args: {
    variant: 'scale',
    pageKey: 'scale-page',
    children: <SamplePage title="Scale Animation" color="bg-purple-50 dark:bg-gray-900" />,
  },
};

// Interactive Page Navigation

export const InteractiveNavigation: Story = {
  render: () => {
    const [currentPage, setCurrentPage] = useState('home');
    const [variant, setVariant] = useState<'slideUp' | 'fadeIn' | 'scale'>('slideUp');

    const pages = {
      home: { title: 'Home Page', color: 'bg-blue-50 dark:bg-gray-900' },
      about: { title: 'About Page', color: 'bg-green-50 dark:bg-gray-900' },
      contact: { title: 'Contact Page', color: 'bg-purple-50 dark:bg-gray-900' },
    };

    return (
      <div>
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 space-y-4">
          <div className="flex gap-4">
            <AnimatedButton
              onClick={() => setCurrentPage('home')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                currentPage === 'home'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Home
            </AnimatedButton>
            <AnimatedButton
              onClick={() => setCurrentPage('about')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                currentPage === 'about'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              About
            </AnimatedButton>
            <AnimatedButton
              onClick={() => setCurrentPage('contact')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                currentPage === 'contact'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Contact
            </AnimatedButton>
          </div>
          
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Variant:</span>
            <AnimatedButton
              onClick={() => setVariant('slideUp')}
              className={`px-3 py-1 text-sm rounded ${
                variant === 'slideUp' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              Slide Up
            </AnimatedButton>
            <AnimatedButton
              onClick={() => setVariant('fadeIn')}
              className={`px-3 py-1 text-sm rounded ${
                variant === 'fadeIn' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              Fade In
            </AnimatedButton>
            <AnimatedButton
              onClick={() => setVariant('scale')}
              className={`px-3 py-1 text-sm rounded ${
                variant === 'scale' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              Scale
            </AnimatedButton>
          </div>
        </div>

        <AdminPageTransition 
          pageKey={currentPage} 
          variant={variant}
        >
          <SamplePage 
            title={pages[currentPage as keyof typeof pages].title}
            color={pages[currentPage as keyof typeof pages].color}
          />
        </AdminPageTransition>
      </div>
    );
  },
};

// Section Transitions

export const SectionTransition: Story = {
  render: () => {
    const [activeTab, setActiveTab] = useState('overview');

    const tabs = ['overview', 'analytics', 'settings'];

    return (
      <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Section Transitions Demo
          </h1>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            <div className="border-b border-gray-200 dark:border-gray-700 flex">
              {tabs.map((tab) => (
                <AnimatedButton
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-6 py-3 text-center capitalize transition-colors ${
                    activeTab === tab
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {tab}
                </AnimatedButton>
              ))}
            </div>
            
            <AdminSectionTransition sectionKey={activeTab} className="p-6">
              {activeTab === 'overview' && (
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Overview
                  </h2>
                  <p className="text-gray-700 dark:text-gray-300">
                    This is the overview section content. It animates smoothly when switching tabs.
                  </p>
                </div>
              )}
              
              {activeTab === 'analytics' && (
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Analytics
                  </h2>
                  <p className="text-gray-700 dark:text-gray-300">
                    Analytics data and charts would go here with smooth transitions.
                  </p>
                </div>
              )}
              
              {activeTab === 'settings' && (
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    Settings
                  </h2>
                  <p className="text-gray-700 dark:text-gray-300">
                    Configuration options appear here with section transitions.
                  </p>
                </div>
              )}
            </AdminSectionTransition>
          </div>
        </div>
      </div>
    );
  },
};

// Reduced Motion Example

export const ReducedMotionSupport: Story = {
  render: () => (
    <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200">
            <strong>Note:</strong> This component automatically respects the user's 
            <code className="mx-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 rounded">
              prefers-reduced-motion
            </code> 
            setting. Enable it in your system preferences to see instant transitions.
          </p>
        </div>
        
        <AdminPageTransition pageKey="reduced-motion" variant="slideUp">
          <SamplePage 
            title="Reduced Motion Support" 
            color="bg-blue-50 dark:bg-gray-900" 
          />
        </AdminPageTransition>
      </div>
    </div>
  ),
};
