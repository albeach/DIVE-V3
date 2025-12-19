'use client';

import { useMemo } from 'react';

interface PolicyCodeEditorProps {
  source: string;
  onSourceChange: (source: string) => void;
  lintMessages: string[];
}

/**
 * PolicyCodeEditor - Syntax-highlighted code editor with line numbers
 * Features: Dark mode support, lint warnings, accessible textarea
 */
export function PolicyCodeEditor({ source, onSourceChange, lintMessages }: PolicyCodeEditorProps) {
  const lineNumbers = useMemo(() => {
    const lineCount = source.split('\n').length;
    return Array.from({ length: lineCount }, (_, index) => index + 1);
  }, [source]);

  return (
    <div className="space-y-3">
      {/* Lint Messages */}
      {lintMessages.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
          <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-1">⚠️ Linter Warnings</p>
          <ul className="text-xs text-yellow-800 dark:text-yellow-300 space-y-1 list-disc list-inside">
            {lintMessages.map((msg, index) => (
              <li key={index}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Code Editor */}
      <div className="relative border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
        <div className="flex">
          {/* Line Numbers */}
          <div
            className="flex-shrink-0 w-12 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 py-3 select-none"
            aria-hidden="true"
          >
            {lineNumbers.map((num) => (
              <div key={num} className="text-right px-2 text-xs text-gray-400 dark:text-gray-500 font-mono leading-6">
                {num}
              </div>
            ))}
          </div>

          {/* Code Textarea */}
          <textarea
            value={source}
            onChange={(e) => onSourceChange(e.target.value)}
            className="flex-1 px-4 py-3 font-mono text-sm leading-6 resize-none focus:outline-none
              bg-white dark:bg-gray-900 
              text-gray-900 dark:text-gray-100
              placeholder-gray-400 dark:placeholder-gray-600"
            style={{ minHeight: '400px', maxHeight: '600px' }}
            spellCheck={false}
            placeholder="// Write your Rego policy here..."
            aria-label="Policy source code"
          />
        </div>
      </div>

      {/* Editor Help Text */}
      <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="text-blue-500 dark:text-blue-400">💡</span>
        <p>
          <strong className="font-semibold">Pro tip:</strong> Use templates and snippets on the left to speed up policy
          authoring. All policies must include <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">default allow := false</code> for fail-secure behavior.
        </p>
      </div>
    </div>
  );
}
