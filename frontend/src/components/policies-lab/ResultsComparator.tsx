'use client';

import { useState } from 'react';

interface INormalizedDecision {
  engine: string;
  decision: string;
  reason: string;
  obligations: Array<{ type: string; params: Record<string, unknown> }>;
  advice?: Array<{ type: string; params: Record<string, unknown> }>;
  evaluation_details: {
    latency_ms: number;
    policy_version: string;
    trace: Array<{ rule: string; result: boolean; reason: string }>;
  };
  policy_metadata: {
    id: string;
    type: string;
    packageOrPolicyId: string;
    name: string;
  };
  inputs: {
    unified: object;
    rego_input: object;
    xacml_request: string;
  };
}

interface ResultsComparatorProps {
  result: INormalizedDecision;
}

export default function ResultsComparator({ result }: ResultsComparatorProps) {
  const [showTrace, setShowTrace] = useState(false);
  const [showInputs, setShowInputs] = useState(false);

  const getDecisionColor = (decision: string) => {
    switch (decision.toUpperCase()) {
      case 'ALLOW':
      case 'PERMIT':
        return 'green';
      case 'DENY':
        return 'red';
      case 'NOT_APPLICABLE':
        return 'gray';
      case 'INDETERMINATE':
        return 'amber';
      default:
        return 'gray';
    }
  };

  const getDecisionBadge = (decision: string) => {
    const color = getDecisionColor(decision);
    const colorClasses = {
      green: 'bg-green-100 text-green-800 border-green-300',
      red: 'bg-red-100 text-red-800 border-red-300',
      gray: 'bg-gray-100 text-gray-800 border-gray-300',
      amber: 'bg-amber-100 text-amber-800 border-amber-300'
    };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-bold border-2 ${colorClasses[color as keyof typeof colorClasses]}`}>
        {decision.toUpperCase()}
      </span>
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const decisionIcon = result.decision === 'ALLOW' || result.decision === 'PERMIT' ? '✅' : '❌';

  return (
    <div className="space-y-6 mt-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {decisionIcon} Evaluation Results
        </h2>
        <p className="text-sm text-gray-600">
          Policy: <span className="font-medium">{result.policy_metadata.name}</span>
          {' '}({result.policy_metadata.type.toUpperCase()})
        </p>
      </div>

      {/* Main Decision Card */}
      <div className="bg-white border-2 border-gray-300 rounded-lg shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="text-4xl">
              {result.engine === 'opa' ? '📝' : '📄'}
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">
                {result.engine.toUpperCase()} Decision
              </h3>
              <p className="text-sm text-gray-600">
                Package/Policy: <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                  {result.policy_metadata.packageOrPolicyId}
                </code>
              </p>
            </div>
          </div>
          {getDecisionBadge(result.decision)}
        </div>

        {/* Reason */}
        <div className="mb-4 p-4 bg-gray-50 rounded-md">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Reason</h4>
          <p className="text-sm text-gray-800">{result.reason}</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3 bg-blue-50 rounded-md">
            <p className="text-xs font-medium text-blue-600 mb-1">Latency</p>
            <p className="text-xl font-bold text-blue-900">{result.evaluation_details.latency_ms}ms</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-md">
            <p className="text-xs font-medium text-purple-600 mb-1">Policy Version</p>
            <p className="text-sm font-semibold text-purple-900">{result.evaluation_details.policy_version}</p>
          </div>
        </div>

        {/* Obligations */}
        {result.obligations && result.obligations.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Obligations ({result.obligations.length})
            </h4>
            <div className="space-y-2">
              {result.obligations.map((obligation, index) => (
                <div key={index} className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm font-medium text-amber-900">{obligation.type}</p>
                  {Object.keys(obligation.params).length > 0 && (
                    <div className="mt-1 text-xs text-amber-700">
                      <code className="bg-white px-2 py-1 rounded">
                        {JSON.stringify(obligation.params, null, 2)}
                      </code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Advice (XACML only) */}
        {result.advice && result.advice.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Advice ({result.advice.length})
            </h4>
            <div className="space-y-2">
              {result.advice.map((advice, index) => (
                <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm font-medium text-blue-900">{advice.type}</p>
                  {Object.keys(advice.params).length > 0 && (
                    <div className="mt-1 text-xs text-blue-700">
                      <code className="bg-white px-2 py-1 rounded">
                        {JSON.stringify(advice.params, null, 2)}
                      </code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trace Accordion */}
        {result.evaluation_details.trace && result.evaluation_details.trace.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setShowTrace(!showTrace)}
              className="w-full flex items-center justify-between p-3 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              <span className="text-sm font-semibold text-gray-700">
                Evaluation Trace ({result.evaluation_details.trace.length} steps)
              </span>
              <svg
                className={`h-5 w-5 text-gray-600 transition-transform ${showTrace ? 'transform rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTrace && (
              <div className="mt-2 space-y-2 p-4 bg-gray-50 rounded-md">
                {result.evaluation_details.trace.map((entry, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded border ${
                      entry.result
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-gray-700">{entry.rule}</span>
                      <span className={`text-xs font-bold ${entry.result ? 'text-green-700' : 'text-red-700'}`}>
                        {entry.result ? '✓ PASS' : '✗ FAIL'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">{entry.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Copy JSON Button */}
        <div className="flex justify-end space-x-2">
          <button
            onClick={() => copyToClipboard(JSON.stringify(result, null, 2))}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
          >
            <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy JSON
          </button>
        </div>
      </div>

      {/* Generated Inputs Accordion */}
      <div>
        <button
          onClick={() => setShowInputs(!showInputs)}
          className="w-full flex items-center justify-between p-4 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <span className="text-base font-semibold text-gray-700">
            🔍 Generated Inputs
          </span>
          <svg
            className={`h-5 w-5 text-gray-600 transition-transform ${showInputs ? 'transform rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showInputs && (
          <div className="mt-2 space-y-4 p-4 bg-gray-50 rounded-lg">
            {/* Unified Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-700">Unified Input (JSON)</h4>
                <button
                  onClick={() => copyToClipboard(JSON.stringify(result.inputs.unified, null, 2))}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Copy
                </button>
              </div>
              <pre className="bg-white p-3 rounded border border-gray-300 text-xs overflow-x-auto">
                <code>{JSON.stringify(result.inputs.unified, null, 2)}</code>
              </pre>
            </div>

            {/* Rego Input */}
            {result.inputs.rego_input && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-700">OPA Rego Input (JSON)</h4>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify(result.inputs.rego_input, null, 2))}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-white p-3 rounded border border-gray-300 text-xs overflow-x-auto">
                  <code>{JSON.stringify(result.inputs.rego_input, null, 2)}</code>
                </pre>
              </div>
            )}

            {/* XACML Request */}
            {result.inputs.xacml_request && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-700">XACML Request (XML)</h4>
                  <button
                    onClick={() => copyToClipboard(result.inputs.xacml_request)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-white p-3 rounded border border-gray-300 text-xs overflow-x-auto">
                  <code>{result.inputs.xacml_request}</code>
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}



