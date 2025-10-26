'use client';

import { useState, useEffect } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

interface RegoViewerProps {
  policyId: string;
  source?: string;
}

interface IPolicyStructure {
  package?: string;
  imports?: string[];
  rules?: Array<{ name: string; type: 'violation' | 'allow' | 'helper' }>;
}

export default function RegoViewer({ policyId, source }: RegoViewerProps) {
  const [policySource, setPolicySource] = useState(source || '');
  const [loading, setLoading] = useState(!source);
  const [error, setError] = useState('');
  const [showOutline, setShowOutline] = useState(true);
  const [structure, setStructure] = useState<IPolicyStructure | null>(null);

  useEffect(() => {
    if (!source) {
      fetchPolicy();
    } else {
      parseStructure(source);
    }
  }, [policyId, source]);

  const fetchPolicy = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/policies-lab/${policyId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch policy');
      }

      const data = await response.json();
      
      // Read the actual file content
      // For now, we'll use metadata to construct a representative view
      // In production, you'd extend the backend to return the source
      setPolicySource(`# Policy: ${data.metadata.name}
# Package: ${data.metadata.packageOrPolicyId}
# Rules: ${data.metadata.rulesCount}

# Note: Full source viewing requires backend extension
# to return file contents from filesystem

package ${data.metadata.packageOrPolicyId}

import rego.v1

default allow := false

# ... policy rules ...
`);
      setStructure(data.structure);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load policy');
    } finally {
      setLoading(false);
    }
  };

  const parseStructure = (source: string) => {
    // Simple parsing to extract structure
    const lines = source.split('\n');
    const parsed: IPolicyStructure = {
      package: '',
      imports: [],
      rules: []
    };

    lines.forEach(line => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('package ')) {
        parsed.package = trimmed.replace('package ', '').trim();
      } else if (trimmed.startsWith('import ')) {
        parsed.imports?.push(trimmed.replace('import ', '').trim());
      } else if (trimmed.match(/^(allow|deny|[a-z_]+)\s*(:=|=|if)/)) {
        const ruleName = trimmed.split(/\s+/)[0];
        const type = ruleName.includes('is_not_') || ruleName.includes('violation')
          ? 'violation'
          : ruleName === 'allow' || ruleName === 'deny'
          ? 'allow'
          : 'helper';
        parsed.rules?.push({ name: ruleName, type });
      }
    });

    setStructure(parsed);
  };

  const downloadPolicy = () => {
    const blob = new Blob([policySource], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `policy-${policyId}.rego`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-2">❌ {error}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* Outline Sidebar */}
      {showOutline && structure && (
        <div className="lg:col-span-1 bg-gray-50 border border-gray-300 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700">📋 Outline</h3>
            <button
              onClick={() => setShowOutline(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4 text-sm">
            {/* Package */}
            {structure.package && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Package</p>
                <p className="font-mono text-xs text-blue-700">{structure.package}</p>
              </div>
            )}

            {/* Imports */}
            {structure.imports && structure.imports.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Imports</p>
                <div className="space-y-0.5">
                  {structure.imports.map((imp, i) => (
                    <p key={i} className="font-mono text-xs text-green-700">{imp}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Rules */}
            {structure.rules && structure.rules.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Rules</p>
                <div className="space-y-1">
                  {structure.rules.map((rule, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <span className={`text-xs ${
                        rule.type === 'violation' ? 'text-red-600' :
                        rule.type === 'allow' ? 'text-green-600' :
                        'text-purple-600'
                      }`}>
                        {rule.type === 'violation' ? '🚫' :
                         rule.type === 'allow' ? '✓' : '⚙️'}
                      </span>
                      <p className="font-mono text-xs text-gray-700">{rule.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Code Viewer */}
      <div className={showOutline ? 'lg:col-span-3' : 'lg:col-span-4'}>
        <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gray-100 px-4 py-3 border-b border-gray-300 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-lg">📝</span>
              <span className="text-sm font-semibold text-gray-700">Rego Policy</span>
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800">
                .rego
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {!showOutline && (
                <button
                  onClick={() => setShowOutline(true)}
                  className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Show Outline
                </button>
              )}
              <button
                onClick={() => navigator.clipboard.writeText(policySource)}
                className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                📋 Copy
              </button>
              <button
                onClick={downloadPolicy}
                className="px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                ⬇️ Download
              </button>
            </div>
          </div>

          {/* Code with Syntax Highlighting */}
          <div className="overflow-x-auto">
            <Highlight
              theme={themes.github}
              code={policySource}
              language="rego"
            >
              {({ className, style, tokens, getLineProps, getTokenProps }) => (
                <pre className={`${className} p-4 text-sm`} style={style}>
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line })} className="table-row">
                      <span className="table-cell text-right pr-4 select-none opacity-50 w-12">
                        {i + 1}
                      </span>
                      <span className="table-cell">
                        {line.map((token, key) => (
                          <span key={key} {...getTokenProps({ token })} />
                        ))}
                      </span>
                    </div>
                  ))}
                </pre>
              )}
            </Highlight>
          </div>
        </div>
      </div>
    </div>
  );
}

