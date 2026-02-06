/**
 * AnimatedButton Component Stories
 * 
 * Visual documentation and testing for all AnimatedButton variants
 * 
 * @phase Phase 4.3 - Storybook Component Library
 * @date 2026-02-06
 */

import type { Meta, StoryObj } from '@storybook/react';
import { AnimatedButton, AnimatedIconButton, AnimatedLinkButton, AnimatedCardButton } from './AnimatedButton';
import { Save, RefreshCw, Trash2, Plus, Edit, Download, Upload, Eye } from 'lucide-react';

const meta: Meta<typeof AnimatedButton> = {
  title: 'Admin/AnimatedButton',
  component: AnimatedButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    intensity: {
      control: 'select',
      options: ['subtle', 'normal', 'strong'],
      description: 'Animation intensity level',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
    disableAnimation: {
      control: 'boolean',
      description: 'Disable all animations',
    },
  },
};

export default meta;
type Story = StoryObj<typeof AnimatedButton>;

// Basic Stories

export const Primary: Story = {
  args: {
    children: 'Primary Button',
    className: 'px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-md transition-colors',
  },
};

export const Secondary: Story = {
  args: {
    children: 'Secondary Button',
    intensity: 'subtle',
    className: 'px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors',
  },
};

export const Success: Story = {
  args: {
    children: 'Success Button',
    className: 'px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold shadow-md transition-colors',
  },
};

export const Danger: Story = {
  args: {
    children: 'Danger Button',
    className: 'px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold shadow-md transition-colors',
  },
};

// With Icons

export const WithIconLeft: Story = {
  args: {
    children: (
      <>
        <Save className="w-4 h-4 mr-2" />
        Save Changes
      </>
    ),
    className: 'px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center font-semibold shadow-md transition-colors',
  },
};

export const WithIconRight: Story = {
  args: {
    children: (
      <>
        Download
        <Download className="w-4 h-4 ml-2" />
      </>
    ),
    className: 'px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center font-semibold shadow-md transition-colors',
  },
};

// Intensity Variations

export const SubtleIntensity: Story = {
  args: {
    children: 'Subtle Animation',
    intensity: 'subtle',
    className: 'px-6 py-3 bg-blue-600 text-white rounded-lg',
  },
};

export const NormalIntensity: Story = {
  args: {
    children: 'Normal Animation',
    intensity: 'normal',
    className: 'px-6 py-3 bg-blue-600 text-white rounded-lg',
  },
};

export const StrongIntensity: Story = {
  args: {
    children: 'Strong Animation',
    intensity: 'strong',
    className: 'px-6 py-3 bg-blue-600 text-white rounded-lg',
  },
};

// States

export const Disabled: Story = {
  args: {
    children: 'Disabled Button',
    disabled: true,
    className: 'px-6 py-3 bg-blue-600 text-white rounded-lg opacity-50 cursor-not-allowed',
  },
};

export const AnimationDisabled: Story = {
  args: {
    children: 'No Animation',
    disableAnimation: true,
    className: 'px-6 py-3 bg-blue-600 text-white rounded-lg',
  },
};

// Icon Buttons

export const IconButtonRefresh: Story = {
  render: () => (
    <AnimatedIconButton
      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
      aria-label="Refresh"
    >
      <RefreshCw className="w-5 h-5" />
    </AnimatedIconButton>
  ),
};

export const IconButtonEdit: Story = {
  render: () => (
    <AnimatedIconButton
      className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-md"
      aria-label="Edit"
    >
      <Edit className="w-5 h-5" />
    </AnimatedIconButton>
  ),
};

export const IconButtonDelete: Story = {
  render: () => (
    <AnimatedIconButton
      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
      aria-label="Delete"
    >
      <Trash2 className="w-5 h-5" />
    </AnimatedIconButton>
  ),
};

export const IconButtonAdd: Story = {
  render: () => (
    <AnimatedIconButton
      className="p-2 bg-blue-600 text-white hover:bg-blue-700 rounded-full shadow-md"
      aria-label="Add"
    >
      <Plus className="w-5 h-5" />
    </AnimatedIconButton>
  ),
};

// Link Buttons

export const LinkButton: Story = {
  render: () => (
    <AnimatedLinkButton>
      View Details →
    </AnimatedLinkButton>
  ),
};

export const LinkButtonWithIcon: Story = {
  render: () => (
    <AnimatedLinkButton>
      <Eye className="w-4 h-4" />
      View More
    </AnimatedLinkButton>
  ),
};

// Card Buttons

export const CardButton: Story = {
  render: () => (
    <AnimatedCardButton
      className="w-64 p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="space-y-2">
        <Upload className="w-8 h-8 text-blue-600" />
        <h3 className="font-semibold text-gray-900 dark:text-white">Upload Files</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Drag and drop files or click to browse
        </p>
      </div>
    </AnimatedCardButton>
  ),
};

// Size Variations

export const Small: Story = {
  args: {
    children: 'Small',
    className: 'px-3 py-1.5 text-sm bg-blue-600 text-white rounded',
  },
};

export const Medium: Story = {
  args: {
    children: 'Medium',
    className: 'px-4 py-2 bg-blue-600 text-white rounded-lg',
  },
};

export const Large: Story = {
  args: {
    children: 'Large',
    className: 'px-8 py-4 text-lg bg-blue-600 text-white rounded-lg',
  },
};

// Button Group Example

export const ButtonGroup: Story = {
  render: () => (
    <div className="flex gap-2">
      <AnimatedButton className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-l-lg transition-colors">
        Save
      </AnimatedButton>
      <AnimatedButton className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 transition-colors">
        Cancel
      </AnimatedButton>
      <AnimatedButton className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-r-lg transition-colors">
        Delete
      </AnimatedButton>
    </div>
  ),
};

// Dark Mode Examples

export const DarkModeButton: Story = {
  args: {
    children: 'Dark Mode Button',
    className: 'px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
