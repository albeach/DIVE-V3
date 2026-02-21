'use client';

import type { StandardsLens } from '@/types/policy-builder.types';

interface PolicyTemplate {
  name: string;
  description: string;
  code: string;
  standardsLens: StandardsLens;
}

interface PolicySnippet {
  label: string;
  code: string;
}

interface PolicyTemplatesSidebarProps {
  templates: Record<string, PolicyTemplate>;
  snippets: PolicySnippet[];
  onSelectTemplate: (templateKey: string) => void;
  onInsertSnippet: (code: string) => void;
}

/**
 * PolicyTemplatesSidebar - Templates and code snippets library
 * Features: Dark mode support, hover effects, accessible buttons
 */
export function PolicyTemplatesSidebar({
  templates,
  snippets,
  onSelectTemplate,
  onInsertSnippet,
}: PolicyTemplatesSidebarProps) {
  return (
    <div className="space-y-6">
      {/* Templates Section */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Templates</p>
        <div className="space-y-2">
          {Object.entries(templates).map(([key, template]) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectTemplate(key)}
              className="w-full text-left border border-gray-200 dark:border-gray-700 rounded-md p-3 
                transition-all duration-200
                hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm
                bg-white dark:bg-gray-800
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{template.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{template.description}</p>
              <span className="inline-block mt-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                {template.standardsLens === '5663' && 'Federation'}
                {template.standardsLens === '240' && 'Object'}
                {template.standardsLens === 'unified' && 'Unified'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Snippets Section */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Snippets</p>
        <div className="space-y-2">
          {snippets.map((snippet) => (
            <button
              key={snippet.label}
              type="button"
              onClick={() => onInsertSnippet(snippet.code)}
              className="w-full text-left px-3 py-2 text-sm 
                border border-dashed border-gray-300 dark:border-gray-600 rounded-md 
                transition-all duration-200
                hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500
                bg-white dark:bg-gray-900
                text-gray-700 dark:text-gray-300
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              <span className="text-gray-600 dark:text-gray-400 mr-2">📋</span>
              {snippet.label}
            </button>
          ))}
        </div>
      </div>

      {/* Help Text */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          <strong className="font-semibold text-gray-700 dark:text-gray-300">Quick start:</strong> Select a template
          to load a pre-configured policy, or use snippets to insert common Rego patterns.
        </p>
      </div>
    </div>
  );
}
