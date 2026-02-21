'use client';

import { useState, useEffect } from 'react';
import { Highlight, themes } from 'prism-react-renderer';

interface XACMLViewerProps {
  policyId: string;
  source?: string;
}

interface IPolicyStructure {
  policySetId?: string;
  policyCombiningAlg?: string;
  policies?: Array<{ policyId: string; ruleCombiningAlg: string; rulesCount: number }>;
}

export default function XACMLViewer({ policyId, source }: XACMLViewerProps) {
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
      const response = await fetch(`/api/policies-lab/${policyId}`, {
        credentials: 'include', // Required for session cookies to be sent
      });

      if (!response.ok) {
        throw new Error('Failed to fetch policy');
      }

      const data = await response.json();

      // Read the actual file content
      // For now, we'll use metadata to construct a representative view
      setPolicySource(`<?xml version="1.0" encoding="UTF-8"?>
<!-- Policy: ${data.metadata.name} -->
<!-- Policy ID: ${data.metadata.packageOrPolicyId} -->
<!-- Rules: ${data.metadata.rulesCount} -->

<!-- Note: Full source viewing requires backend extension -->
<!-- to return file contents from filesystem -->

<PolicySet xmlns="urn:oasis:names:tc:xacml:3.0:core:schema:wd-17"
           PolicySetId="${data.metadata.packageOrPolicyId}"
           PolicyCombiningAlgId="urn:oasis:names:tc:xacml:3.0:policy-combining-algorithm:deny-overrides"
           Version="1.0">
  <Description>${data.metadata.description || 'ABAC Policy'}</Description>

  <!-- Policies and Rules would appear here -->

</PolicySet>
`);
      setStructure(data.structure);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load policy');
    } finally {
      setLoading(false);
    }
  };

  const parseStructure = (source: string) => {
    // Simple XML parsing to extract structure
    const parsed: IPolicyStructure = {
      policies: []
    };

    // Extract PolicySet ID
    const policySetMatch = source.match(/PolicySetId="([^"]+)"/);
    if (policySetMatch) {
      parsed.policySetId = policySetMatch[1];
    }

    // Extract combining algorithm
    const combiningAlgMatch = source.match(/PolicyCombiningAlgId="[^:]+:([^"]+)"/);
    if (combiningAlgMatch) {
      parsed.policyCombiningAlg = combiningAlgMatch[1];
    }

    // Extract individual policies (simple count)
    const policyMatches = source.match(/<Policy /g);
    const ruleMatches = source.match(/<Rule /g);

    if (policyMatches) {
      parsed.policies?.push({
        policyId: 'main-policy',
        ruleCombiningAlg: 'permit-overrides',
        rulesCount: ruleMatches?.length || 0
      });
    }

    setStructure(parsed);
  };

  const downloadPolicy = () => {
    const blob = new Blob([policySource], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `policy-${policyId}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatXML = (xml: string): string => {
    // Simple XML formatting (for display purposes)
    return xml;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
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
            {/* PolicySet */}
            {structure.policySetId && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">PolicySet</p>
                <p className="font-mono text-xs text-purple-700 break-all">{structure.policySetId}</p>
              </div>
            )}

            {/* Combining Algorithm */}
            {structure.policyCombiningAlg && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Combining Alg</p>
                <p className="font-mono text-xs text-blue-700">{structure.policyCombiningAlg}</p>
              </div>
            )}

            {/* Policies */}
            {structure.policies && structure.policies.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Policies</p>
                <div className="space-y-2">
                  {structure.policies.map((policy, i) => (
                    <div key={i} className="p-2 bg-white rounded border border-gray-200">
                      <p className="font-mono text-xs text-gray-700 break-all mb-1">
                        {policy.policyId}
                      </p>
                      <p className="text-xs text-gray-500">
                        {policy.rulesCount} rules • {policy.ruleCombiningAlg}
                      </p>
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
              <span className="text-lg">📄</span>
              <span className="text-sm font-semibold text-gray-700">XACML Policy</span>
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-800">
                .xml
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
              code={formatXML(policySource)}
              language="xml"
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
