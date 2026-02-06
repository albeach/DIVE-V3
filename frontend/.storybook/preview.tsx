import type { Preview } from '@storybook/react';
import '../src/app/globals.css'; // Import Tailwind CSS

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: '#ffffff',
        },
        {
          name: 'dark',
          value: '#1a1a1a',
        },
      ],
    },
    // Enable a11y addon by default
    a11y: {
      element: '#storybook-root',
      config: {},
      options: {},
      manual: false,
    },
  },
  // Global decorators for dark mode support
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <Story />
      </div>
    ),
  ],
};

export default preview;
